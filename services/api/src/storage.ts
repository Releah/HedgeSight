import { createHash } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { validToken } from "./auth.js";
import { pool } from "./db.js";
import { runStorageMaintenance } from "./maintenance.js";

export const storageRouter: Router = Router();
const counter = z.string().regex(/^\d{1,20}$/).optional();
const databaseUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const nullableDays = z.number().int().positive().max(36500).nullable().optional();
const retentionSchema = z.object({
  rawDays: z.number().int().min(1).max(3650), fiveMinuteDays: z.number().int().min(1).max(3650),
  hourlyDays: z.number().int().min(1).max(7300), dailyDays: z.number().int().min(1).max(36500),
  incidentDays: z.number().int().min(1).max(36500), configurationDays: z.number().int().min(1).max(36500),
});

storageRouter.get("/retention", async (_request, response) => {
  const result = await pool.query(`SELECT raw_days AS "rawDays", five_minute_days AS "fiveMinuteDays",
    hourly_days AS "hourlyDays", daily_days AS "dailyDays", incident_days AS "incidentDays",
    configuration_days AS "configurationDays", updated_at AS "updatedAt" FROM retention_settings WHERE id=true`);
  response.json(result.rows[0]);
});

storageRouter.put("/retention", async (request, response) => {
  const parsed = retentionSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid retention policy", issues: parsed.error.issues });
  const v = parsed.data;
  const result = await pool.query(`UPDATE retention_settings SET raw_days=$1, five_minute_days=$2, hourly_days=$3,
    daily_days=$4, incident_days=$5, configuration_days=$6, updated_at=now() WHERE id=true RETURNING *`,
    [v.rawDays, v.fiveMinuteDays, v.hourlyDays, v.dailyDays, v.incidentDays, v.configurationDays]);
  return response.json(result.rows[0]);
});

storageRouter.get("/devices/:deviceId/retention", async (request, response) => {
  const result = await pool.query(`SELECT g.raw_days AS "globalRawDays", COALESCE(o.raw_days,g.raw_days) AS "rawDays",
    COALESCE(o.five_minute_days,g.five_minute_days) AS "fiveMinuteDays", COALESCE(o.hourly_days,g.hourly_days) AS "hourlyDays",
    COALESCE(o.daily_days,g.daily_days) AS "dailyDays", COALESCE(o.incident_days,g.incident_days) AS "incidentDays",
    COALESCE(o.configuration_days,g.configuration_days) AS "configurationDays", o.*
    FROM retention_settings g LEFT JOIN device_retention_overrides o ON o.device_id=$1 WHERE g.id=true`, [request.params.deviceId]);
  response.json(result.rows[0]);
});

storageRouter.put("/devices/:deviceId/retention", async (request, response) => {
  const parsed = z.object({ rawDays: nullableDays, fiveMinuteDays: nullableDays, hourlyDays: nullableDays,
    dailyDays: nullableDays, incidentDays: nullableDays, configurationDays: nullableDays }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid retention override", issues: parsed.error.issues });
  const v = parsed.data;
  await pool.query(`INSERT INTO device_retention_overrides(device_id,raw_days,five_minute_days,hourly_days,daily_days,incident_days,configuration_days)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(device_id) DO UPDATE SET raw_days=$2,five_minute_days=$3,hourly_days=$4,
    daily_days=$5,incident_days=$6,configuration_days=$7,updated_at=now()`,
    [request.params.deviceId, v.rawDays ?? null, v.fiveMinuteDays ?? null, v.hourlyDays ?? null, v.dailyDays ?? null, v.incidentDays ?? null, v.configurationDays ?? null]);
  return response.status(204).end();
});

const interfaceSchema = z.object({
  stableKey: z.string().min(1).max(255), snmpIndex: z.number().int().nonnegative().optional(), name: z.string().min(1).max(255),
  alias: z.string().max(500).optional(), description: z.string().max(1000).optional(), macAddress: z.string().max(64).optional(),
  interfaceType: z.number().int().nonnegative().optional(), speedBps: counter, adminStatus: z.number().int().optional(),
  operationalStatus: z.number().int().optional(), counters: z.object({ inOctets: counter, outOctets: counter,
    inUnicastPackets: counter, outUnicastPackets: counter, inErrors: counter, outErrors: counter,
    inDiscards: counter, outDiscards: counter }), metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
const batchSchema = z.object({ deviceId: databaseUuid, workerName: z.string().min(1), collectedAt: z.string().datetime(),
  deviceUptimeTicks: counter, interfaces: z.array(interfaceSchema).min(1).max(5000) });

storageRouter.post("/workers/interface-samples", async (request, response) => {
  if (!validToken(request)) return response.status(401).json({ error: "Invalid worker token" });
  const parsed = batchSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid interface sample batch", issues: parsed.error.issues });
  const v = parsed.data;
  const worker = await pool.query("SELECT id FROM workers WHERE name=$1", [v.workerName]);
  if (!worker.rowCount) return response.status(409).json({ error: "Worker must register before submitting samples" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ids: string[] = [];
    for (const item of v.interfaces) {
      const iface = await client.query(`INSERT INTO interfaces(device_id,stable_key,snmp_index,name,alias,description,mac_address,interface_type,speed_bps,admin_status,operational_status,metadata)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(device_id,stable_key) DO UPDATE SET snmp_index=$3,name=$4,alias=$5,
        description=$6,mac_address=$7,interface_type=$8,speed_bps=$9,admin_status=$10,operational_status=$11,metadata=$12,present=true,last_seen_at=now() RETURNING id`,
        [v.deviceId,item.stableKey,item.snmpIndex,item.name,item.alias ?? "",item.description ?? "",item.macAddress,item.interfaceType,item.speedBps,item.adminStatus,item.operationalStatus,item.metadata ?? {}]);
      const interfaceId = iface.rows[0].id as string; ids.push(interfaceId);
      const previous = await client.query(`SELECT collected_at,device_uptime_ticks,in_octets,out_octets FROM interface_samples
        WHERE interface_id=$1 AND collected_at<$2 ORDER BY collected_at DESC LIMIT 1`, [interfaceId,v.collectedAt]);
      let inBps: number | null = null, outBps: number | null = null, reset = false;
      if (previous.rowCount) {
        const p = previous.rows[0]; const seconds = (new Date(v.collectedAt).getTime() - new Date(p.collected_at).getTime()) / 1000;
        reset = Boolean(v.deviceUptimeTicks && p.device_uptime_ticks && BigInt(v.deviceUptimeTicks) < BigInt(p.device_uptime_ticks));
        if (!reset && seconds > 0 && item.counters.inOctets && p.in_octets && BigInt(item.counters.inOctets) >= BigInt(p.in_octets)) inBps = Number(BigInt(item.counters.inOctets) - BigInt(p.in_octets)) * 8 / seconds;
        if (!reset && seconds > 0 && item.counters.outOctets && p.out_octets && BigInt(item.counters.outOctets) >= BigInt(p.out_octets)) outBps = Number(BigInt(item.counters.outOctets) - BigInt(p.out_octets)) * 8 / seconds;
      }
      const speed = item.speedBps ? Number(item.speedBps) : 0;
      await client.query(`INSERT INTO interface_samples(collected_at,device_id,interface_id,worker_id,device_uptime_ticks,in_octets,out_octets,
        in_unicast_packets,out_unicast_packets,in_errors,out_errors,in_discards,out_discards,in_bps,out_bps,utilization_in_percent,
        utilization_out_percent,admin_status,operational_status,counter_reset) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        ON CONFLICT(collected_at,interface_id) DO NOTHING`, [v.collectedAt,v.deviceId,interfaceId,worker.rows[0].id,v.deviceUptimeTicks,
        item.counters.inOctets,item.counters.outOctets,item.counters.inUnicastPackets,item.counters.outUnicastPackets,item.counters.inErrors,
        item.counters.outErrors,item.counters.inDiscards,item.counters.outDiscards,inBps,outBps,speed && inBps !== null ? inBps/speed*100 : null,
        speed && outBps !== null ? outBps/speed*100 : null,item.adminStatus,item.operationalStatus,reset]);
    }
    await client.query("UPDATE interfaces SET present=false WHERE device_id=$1 AND NOT(id=ANY($2::uuid[]))", [v.deviceId, ids]);
    await client.query("COMMIT"); return response.status(202).json({ accepted: v.interfaces.length });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});

storageRouter.get("/devices/:deviceId/interfaces", async (request, response) => {
  const result = await pool.query(`SELECT i.id,i.name,i.alias,i.description,i.snmp_index AS "snmpIndex",i.speed_bps AS "speedBps",
    i.admin_status AS "adminStatus",i.operational_status AS "operationalStatus",i.present,i.last_seen_at AS "lastSeenAt",
    s.in_bps AS "inBps",s.out_bps AS "outBps",s.utilization_in_percent AS "utilizationInPercent",
    s.utilization_out_percent AS "utilizationOutPercent",s.in_errors AS "inErrors",s.out_errors AS "outErrors",
    s.in_discards AS "inDiscards",s.out_discards AS "outDiscards"
    FROM interfaces i LEFT JOIN LATERAL (SELECT * FROM interface_samples WHERE interface_id=i.id ORDER BY collected_at DESC LIMIT 1) s ON true
    WHERE i.device_id=$1 ORDER BY i.name`, [request.params.deviceId]); response.json(result.rows);
});

storageRouter.get("/interfaces/:interfaceId/history", async (request, response) => {
  const resolution = z.enum(["raw", "5m", "1h", "1d"]).catch("5m").parse(request.query.resolution);
  const hours = z.coerce.number().int().min(1).max(8760).catch(24).parse(request.query.hours);
  const result = resolution === "raw"
    ? await pool.query(`SELECT collected_at AS "timestamp",in_bps AS "inBps",out_bps AS "outBps",utilization_in_percent AS "utilizationInPercent",utilization_out_percent AS "utilizationOutPercent",in_errors AS "inErrors",out_errors AS "outErrors",counter_reset AS "counterReset" FROM interface_samples WHERE interface_id=$1 AND collected_at>now()-make_interval(hours=>$2) ORDER BY collected_at`, [request.params.interfaceId,hours])
    : await pool.query(`SELECT bucket_at AS "timestamp",in_bps_avg AS "inBps",in_bps_max AS "inBpsMax",out_bps_avg AS "outBps",out_bps_max AS "outBpsMax",utilization_in_avg AS "utilizationInPercent",utilization_out_avg AS "utilizationOutPercent",in_errors_delta AS "inErrors",out_errors_delta AS "outErrors" FROM interface_rollups WHERE interface_id=$1 AND resolution=$2 AND bucket_at>now()-make_interval(hours=>$3) ORDER BY bucket_at`, [request.params.interfaceId,resolution,hours]);
  response.json(result.rows);
});

const snapshotSchema = z.object({ workerName: z.string(), deviceId: databaseUuid, configType: z.string().min(1).max(64).default("running"), content: z.string().min(1).max(10_000_000), metadata: z.record(z.string(), z.unknown()).default({}) });
storageRouter.post("/workers/configuration-snapshots", async (request, response) => {
  if (!validToken(request)) return response.status(401).json({ error: "Invalid worker token" });
  const parsed = snapshotSchema.safeParse(request.body); if (!parsed.success) return response.status(400).json({ error: "Invalid snapshot", issues: parsed.error.issues });
  const v = parsed.data; const key = process.env.CONFIG_ENCRYPTION_KEY; if (!key) return response.status(503).json({ error: "Configuration encryption key is not configured" });
  const hash = createHash("sha256").update(v.content).digest("hex");
  const result = await pool.query(`INSERT INTO configuration_snapshots(device_id,config_type,content_hash,encrypted_content,size_bytes,worker_id,previous_snapshot_id,metadata)
    SELECT $1,$2,$3,pgp_sym_encrypt($4,$5,'cipher-algo=aes256,compress-algo=1'),octet_length($4),w.id,
      (SELECT id FROM configuration_snapshots WHERE device_id=$1 AND config_type=$2 ORDER BY collected_at DESC LIMIT 1),$7
    FROM workers w WHERE w.name=$6 ON CONFLICT(device_id,config_type,content_hash) DO UPDATE SET collected_at=now() RETURNING id,collected_at AS "collectedAt",content_hash AS "contentHash",size_bytes AS "sizeBytes"`,
    [v.deviceId,v.configType,hash,v.content,key,v.workerName,v.metadata]); return response.status(201).json(result.rows[0]);
});

storageRouter.get("/devices/:deviceId/configuration-snapshots", async (request, response) => {
  const result = await pool.query(`SELECT id,collected_at AS "collectedAt",config_type AS "configType",content_hash AS "contentHash",size_bytes AS "sizeBytes",collection_status AS status,previous_snapshot_id AS "previousSnapshotId",metadata FROM configuration_snapshots WHERE device_id=$1 ORDER BY collected_at DESC`, [request.params.deviceId]); response.json(result.rows);
});

storageRouter.get("/configuration-snapshots/:snapshotId/content", async (request, response) => {
  const key = process.env.CONFIG_ENCRYPTION_KEY; if (!key) return response.status(503).json({ error: "Configuration encryption key is not configured" });
  const result = await pool.query("SELECT pgp_sym_decrypt(encrypted_content,$2) AS content FROM configuration_snapshots WHERE id=$1", [request.params.snapshotId,key]);
  if (!result.rowCount) return response.status(404).json({ error: "Snapshot not found" }); return response.type("text/plain").send(result.rows[0].content);
});

storageRouter.get("/storage/status", async (_request, response) => {
  const result = await pool.query(`SELECT pg_database_size(current_database())::bigint AS "databaseBytes",
    (SELECT count(*)::bigint FROM interface_samples) AS "interfaceSamples", (SELECT count(*)::bigint FROM interface_rollups) AS rollups,
    (SELECT count(*)::bigint FROM interfaces) AS interfaces, (SELECT count(*)::bigint FROM configuration_snapshots) AS "configurationSnapshots"`);
  const maintenance = await pool.query(`SELECT started_at AS "startedAt",finished_at AS "finishedAt",status,rollups_written AS "rollupsWritten",rows_deleted AS "rowsDeleted",message FROM storage_maintenance_runs ORDER BY started_at DESC LIMIT 1`);
  response.json({ ...result.rows[0], lastMaintenance: maintenance.rows[0] ?? null });
});

storageRouter.post("/storage/maintenance", async (_request, response) => { void runStorageMaintenance(); response.status(202).json({ started: true }); });
