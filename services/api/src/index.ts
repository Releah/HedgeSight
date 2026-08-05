import { resolve } from "node:path";
import express from "express";
import helmet from "helmet";
import { z } from "zod";
import { hashToken, validToken } from "./auth.js";
import { migrate, pool } from "./db.js";
import { startScheduler } from "./scheduler.js";
import { startStorageMaintenance } from "./maintenance.js";
import { storageRouter } from "./storage.js";

const version = process.env.HEDGESIGHT_VERSION ?? "0.1.0-dev";
const port = Number(process.env.APP_PORT ?? 8080);
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "12mb" }));
app.use("/api", storageRouter);

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok", version, database: "connected", time: new Date().toISOString() });
  } catch {
    response.status(503).json({ status: "unavailable", version, database: "disconnected" });
  }
});

app.get("/api/version", (_request, response) => {
  response.json({ version, channel: process.env.UPDATE_CHANNEL ?? "stable", repository: "Releah/HedgeSight" });
});

app.get("/api/dashboard", async (_request, response) => {
  const [counts, devices, workers, incidents] = await Promise.all([
    pool.query("SELECT status, count(*)::int AS count FROM devices GROUP BY status"),
    pool.query(`SELECT d.id, d.name, d.address, d.status, d.last_seen_at AS "lastSeenAt",
      count(c.id)::int AS checks FROM devices d LEFT JOIN checks c ON c.device_id = d.id
      GROUP BY d.id ORDER BY d.name`),
    pool.query(`SELECT id, name, version, last_seen_at AS "lastSeenAt",
      CASE WHEN last_seen_at > now() - interval '60 seconds' THEN 'online' ELSE 'offline' END AS status
      FROM workers ORDER BY name`),
    pool.query(`SELECT i.id, d.name AS "deviceName", c.name AS "checkName", i.status,
      i.opened_at AS "openedAt", i.resolved_at AS "resolvedAt"
      FROM incidents i JOIN checks c ON c.id = i.check_id JOIN devices d ON d.id = c.device_id
      ORDER BY i.opened_at DESC LIMIT 10`),
  ]);
  const summary = { up: 0, down: 0, degraded: 0, unknown: 0 };
  for (const row of counts.rows) summary[row.status as keyof typeof summary] = row.count;
  response.json({ counts: summary, devices: devices.rows, workers: workers.rows, recentIncidents: incidents.rows });
});

app.get("/api/devices", async (_request, response) => {
  const result = await pool.query(`SELECT d.*, COALESCE(json_agg(c ORDER BY c.name) FILTER (WHERE c.id IS NOT NULL), '[]') AS checks
    FROM devices d LEFT JOIN checks c ON c.device_id = d.id GROUP BY d.id ORDER BY d.name`);
  response.json(result.rows);
});

app.get("/api/monitoring", async (_request, response) => {
  const result = await pool.query(`SELECT d.id,d.name,d.address,d.description,d.status,
    d.os_name AS "osName",d.os_version AS "osVersion",d.device_type AS "deviceType",d.vendor,d.model,
    d.profile_source AS "profileSource",d.profiled_at AS "profiledAt",p.id AS "pingCheckId",
    p.interval_seconds AS "intervalSeconds",p.last_status AS "pingStatus",p.last_run_at AS "lastRunAt",
    COALESCE(p.config->>'mode','icmp') AS "reachabilityMode",COALESCE((p.config->>'port')::integer,22) AS "tcpPort",
    latest.latency_ms AS "latencyMs",COALESCE((latest.metrics->>'packetLossPercent')::double precision,0) AS "packetLossPercent",
    COALESCE(history.points,'[]'::json) AS history,COALESCE(groups.items,'[]'::json) AS groups,d.enabled
    FROM devices d
    LEFT JOIN LATERAL (SELECT * FROM checks WHERE device_id=d.id AND kind='ping' ORDER BY created_at LIMIT 1) p ON true
    LEFT JOIN LATERAL (SELECT latency_ms,metrics FROM probe_results WHERE check_id=p.id ORDER BY finished_at DESC LIMIT 1) latest ON true
    LEFT JOIN LATERAL (SELECT json_agg(json_build_object('timestamp',x.finished_at,'latencyMs',x.latency_ms,'status',x.status) ORDER BY x.finished_at) AS points
      FROM (SELECT finished_at,latency_ms,status FROM probe_results WHERE check_id=p.id ORDER BY finished_at DESC LIMIT 30) x) history ON true
    LEFT JOIN LATERAL (SELECT json_agg(json_build_object('id',g.id,'name',g.name,'color',g.color) ORDER BY g.name) AS items
      FROM device_group_memberships m JOIN device_groups g ON g.id=m.group_id WHERE m.device_id=d.id) groups ON true
    ORDER BY d.name`);
  response.json(result.rows);
});

app.get("/api/groups", async (_request, response) => {
  const result = await pool.query(`SELECT g.id,g.name,g.color,count(m.device_id)::int AS "deviceCount"
    FROM device_groups g LEFT JOIN device_group_memberships m ON m.group_id=g.id GROUP BY g.id ORDER BY g.name`);
  response.json(result.rows);
});

app.post("/api/groups", async (request, response) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#41d69b") }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid group", issues: parsed.error.issues });
  const result = await pool.query(`INSERT INTO device_groups(name,color) VALUES($1,$2)
    ON CONFLICT(name) DO UPDATE SET color=EXCLUDED.color RETURNING *`, [parsed.data.name,parsed.data.color]);
  return response.status(201).json(result.rows[0]);
});

app.delete("/api/groups/:groupId", async (request, response) => {
  await pool.query("DELETE FROM device_groups WHERE id=$1", [request.params.groupId]); return response.status(204).end();
});

const deviceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(255),
  description: z.string().max(1000).default(""),
  enabled: z.boolean().default(true),
  pingIntervalSeconds: z.number().int().min(10).max(86400).default(60),
  reachabilityMode: z.enum(["icmp","tcp"]).default("icmp"), tcpPort: z.number().int().min(1).max(65535).default(22),
});

app.post("/api/devices", async (request, response) => {
  const parsed = deviceSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid device", issues: parsed.error.issues });
  const { name, address, description, enabled, pingIntervalSeconds, reachabilityMode, tcpPort } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("INSERT INTO devices(name,address,description,enabled) VALUES ($1,$2,$3,$4) RETURNING *", [name,address,description,enabled]);
    await client.query(`INSERT INTO checks(device_id,name,kind,interval_seconds,timeout_ms,config)
      VALUES($1,'Reachability','ping',$2,5000,$3)`, [result.rows[0].id,pingIntervalSeconds,{mode:reachabilityMode,port:tcpPort}]);
    await client.query("COMMIT"); return response.status(201).json(result.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});

const deviceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120), address: z.string().trim().min(1).max(255),
  description: z.string().max(1000).default(""), enabled: z.boolean(), pingIntervalSeconds: z.number().int().min(10).max(86400),
  osName: z.string().trim().max(120).nullable().optional(), osVersion: z.string().trim().max(120).nullable().optional(),
  deviceType: z.string().trim().max(120).nullable().optional(), vendor: z.string().trim().max(120).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(), groupIds: z.array(z.string().uuid()).max(100).default([]),
  reachabilityMode: z.enum(["icmp","tcp"]), tcpPort: z.number().int().min(1).max(65535),
});

app.put("/api/devices/:deviceId", async (request, response) => {
  const parsed = deviceUpdateSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid device", issues: parsed.error.issues });
  const v = parsed.data; const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const device = await client.query(`UPDATE devices SET name=$2,address=$3,description=$4,enabled=$5,os_name=$6,os_version=$7,
      device_type=$8,vendor=$9,model=$10,profile_source=CASE WHEN $6::text IS NOT NULL OR $8::text IS NOT NULL THEN 'manual' ELSE profile_source END,
      profiled_at=CASE WHEN $6::text IS NOT NULL OR $8::text IS NOT NULL THEN now() ELSE profiled_at END,updated_at=now() WHERE id=$1 RETURNING *`,
      [request.params.deviceId,v.name,v.address,v.description,v.enabled,v.osName || null,v.osVersion || null,v.deviceType || null,v.vendor || null,v.model || null]);
    if (!device.rowCount) { await client.query("ROLLBACK"); return response.status(404).json({ error: "Device not found" }); }
    await client.query("UPDATE checks SET interval_seconds=$2,config=$3,next_run_at=LEAST(next_run_at,now()),updated_at=now() WHERE device_id=$1 AND kind='ping'", [request.params.deviceId,v.pingIntervalSeconds,{mode:v.reachabilityMode,port:v.tcpPort}]);
    await client.query("DELETE FROM device_group_memberships WHERE device_id=$1", [request.params.deviceId]);
    if (v.groupIds.length) await client.query("INSERT INTO device_group_memberships(device_id,group_id) SELECT $1,unnest($2::uuid[])", [request.params.deviceId,v.groupIds]);
    await client.query("COMMIT"); return response.json(device.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});

const checkSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["ping", "http", "snmp", "ssh"]),
  intervalSeconds: z.number().int().min(10).max(86400).default(60),
  timeoutMs: z.number().int().min(250).max(120000).default(5000),
  config: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

app.post("/api/devices/:deviceId/checks", async (request, response) => {
  const parsed = checkSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid check", issues: parsed.error.issues });
  const value = parsed.data;
  const result = await pool.query(`INSERT INTO checks(device_id, name, kind, interval_seconds, timeout_ms, config, enabled)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [request.params.deviceId, value.name, value.kind, value.intervalSeconds, value.timeoutMs, value.config, value.enabled]);
  return response.status(201).json(result.rows[0]);
});

app.post("/api/workers/lease", async (request, response) => {
  if (!validToken(request)) return response.status(401).json({ error: "Invalid worker token" });
  const body = z.object({ name: z.string().min(1).max(120), version: z.string(), capabilities: z.array(z.string()) }).parse(request.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const worker = await client.query(`INSERT INTO workers(name, token_hash, version, capabilities, last_seen_at)
      VALUES ($1,$2,$3,$4,now()) ON CONFLICT(name) DO UPDATE SET version=$3, capabilities=$4, last_seen_at=now()
      RETURNING id`, [body.name, hashToken(process.env.WORKER_TOKEN ?? "local-development-token"), body.version, body.capabilities]);
    await client.query("UPDATE probe_jobs SET state='expired' WHERE state='leased' AND leased_until < now()");
    await client.query("UPDATE probe_jobs SET state='queued', worker_id=NULL, leased_until=NULL WHERE state='expired'");
    const job = await client.query(`WITH candidate AS (
      SELECT j.id FROM probe_jobs j JOIN checks c ON c.id=j.check_id
      WHERE j.state='queued' AND c.kind = ANY($1::text[]) ORDER BY j.created_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE probe_jobs j SET state='leased', worker_id=$2, leased_until=now() + make_interval(secs => $3), id=j.id
      FROM candidate x WHERE j.id=x.id RETURNING j.id`, [body.capabilities, worker.rows[0].id, Number(process.env.JOB_LEASE_SECONDS ?? 45)]);
    if (!job.rowCount) {
      await client.query("COMMIT");
      return response.status(204).end();
    }
    const details = await client.query(`SELECT j.id, c.id AS "checkId", d.id AS "deviceId", c.kind,
      CASE WHEN c.kind='http' THEN COALESCE(c.config->>'url', d.address) ELSE d.address END AS target,
      c.timeout_ms AS "timeoutMs", c.config, j.leased_until AS "leasedUntil"
      FROM probe_jobs j JOIN checks c ON c.id=j.check_id JOIN devices d ON d.id=c.device_id WHERE j.id=$1`, [job.rows[0].id]);
    await client.query("COMMIT");
    return response.json(details.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

app.post("/api/workers/jobs/:jobId/results", async (request, response) => {
  if (!validToken(request)) return response.status(401).json({ error: "Invalid worker token" });
  const resultSchema = z.object({
    workerName: z.string(), status: z.enum(["up", "down", "degraded", "unknown"]),
    startedAt: z.string().datetime(), finishedAt: z.string().datetime(), latencyMs: z.number().optional(),
    message: z.string().max(4000).optional(), metrics: z.record(z.string(), z.number()).default({}),
    observations: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  });
  const parsed = resultSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Invalid result", issues: parsed.error.issues });
  const value = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const job = await client.query(`SELECT j.check_id, j.worker_id, c.device_id, c.last_status
      FROM probe_jobs j JOIN checks c ON c.id=j.check_id WHERE j.id=$1 AND j.state='leased' FOR UPDATE`, [request.params.jobId]);
    if (!job.rowCount) { await client.query("ROLLBACK"); return response.status(409).json({ error: "Job is not leased" }); }
    const row = job.rows[0];
    const inserted = await client.query(`INSERT INTO probe_results(job_id, check_id, worker_id, status, started_at, finished_at, latency_ms, message, metrics, observations)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [request.params.jobId, row.check_id, row.worker_id, value.status, value.startedAt, value.finishedAt, value.latencyMs, value.message, value.metrics, value.observations]);
    await client.query(`INSERT INTO metric_samples(collected_at,device_id,check_id,metric_key,value)
      SELECT $1,$2,$3,key,value::double precision FROM jsonb_each_text($4::jsonb)
      ON CONFLICT(collected_at,device_id,metric_key) DO UPDATE SET value=EXCLUDED.value`,
      [value.finishedAt,row.device_id,row.check_id,value.metrics]);
    await client.query("UPDATE probe_jobs SET state='completed', completed_at=now() WHERE id=$1", [request.params.jobId]);
    await client.query("UPDATE checks SET last_status=$2, last_run_at=$3, updated_at=now() WHERE id=$1", [row.check_id, value.status, value.finishedAt]);
    if (value.status === "down") {
      await client.query(`INSERT INTO incidents(check_id, opening_result_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [row.check_id, inserted.rows[0].id]);
    } else if (value.status === "up") {
      await client.query(`UPDATE incidents SET status='resolved', resolved_at=now(), closing_result_id=$2
        WHERE check_id=$1 AND status='open'`, [row.check_id, inserted.rows[0].id]);
    }
    await client.query(`UPDATE devices d SET
      status = CASE WHEN EXISTS(SELECT 1 FROM checks WHERE device_id=d.id AND last_status='down') THEN 'down'
                    WHEN EXISTS(SELECT 1 FROM checks WHERE device_id=d.id AND last_status='degraded') THEN 'degraded'
                    WHEN EXISTS(SELECT 1 FROM checks WHERE device_id=d.id AND last_status='up') THEN 'up' ELSE 'unknown' END,
      last_seen_at = CASE WHEN $2='up' THEN $3 ELSE last_seen_at END, updated_at=now() WHERE id=$1`,
      [row.device_id, value.status, value.finishedAt]);
    await client.query("COMMIT");
    return response.status(202).json({ accepted: true });
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});

const webRoot = resolve(process.env.WEB_ROOT ?? "apps/web/dist");
app.use(express.static(webRoot));
app.get("/{*path}", (_request, response) => response.sendFile(resolve(webRoot, "index.html")));
app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({ error: "Internal server error" });
});

await migrate();
startScheduler();
startStorageMaintenance();
app.listen(port, "0.0.0.0", () => console.info(`HedgeSight ${version} listening on ${port}`));
