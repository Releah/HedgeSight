import { pool } from "./db.js";

function partitionName(prefix: string, date: Date): string {
  return `${prefix}_${date.toISOString().slice(0, 10).replaceAll("-", "")}`;
}

export async function ensureDailyPartitions(): Promise<void> {
  for (let offset = 0; offset < 3; offset += 1) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() + offset);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    for (const table of ["interface_samples", "metric_samples"] as const) {
      const name = partitionName(table, start);
      await pool.query(`CREATE TABLE IF NOT EXISTS ${name} PARTITION OF ${table} FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')`);
      if (table === "interface_samples") {
        await pool.query(`CREATE INDEX IF NOT EXISTS ${name}_interface_idx ON ${name}(interface_id, collected_at DESC)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS ${name}_device_idx ON ${name}(device_id, collected_at DESC)`);
      } else {
        await pool.query(`CREATE INDEX IF NOT EXISTS ${name}_metric_idx ON ${name}(device_id, metric_key, collected_at DESC)`);
      }
    }
  }
}

async function buildRollup(resolution: "5m" | "1h" | "1d", interval: string): Promise<number> {
  const result = await pool.query(`
    INSERT INTO interface_rollups (
      bucket_at, resolution, device_id, interface_id, samples,
      in_bps_avg, in_bps_max, out_bps_avg, out_bps_max,
      utilization_in_avg, utilization_in_max, utilization_out_avg, utilization_out_max,
      in_errors_delta, out_errors_delta, in_discards_delta, out_discards_delta
    )
    SELECT date_bin($1::interval, collected_at, '2000-01-01'::timestamptz), $2, device_id, interface_id, count(*)::int,
      avg(in_bps), max(in_bps), avg(out_bps), max(out_bps),
      avg(utilization_in_percent), max(utilization_in_percent), avg(utilization_out_percent), max(utilization_out_percent),
      GREATEST(max(in_errors) - min(in_errors), 0), GREATEST(max(out_errors) - min(out_errors), 0),
      GREATEST(max(in_discards) - min(in_discards), 0), GREATEST(max(out_discards) - min(out_discards), 0)
    FROM interface_samples
    WHERE collected_at >= now() - interval '2 days' AND counter_reset = false
    GROUP BY 1, device_id, interface_id
    ON CONFLICT (resolution, bucket_at, interface_id) DO UPDATE SET
      samples=EXCLUDED.samples, in_bps_avg=EXCLUDED.in_bps_avg, in_bps_max=EXCLUDED.in_bps_max,
      out_bps_avg=EXCLUDED.out_bps_avg, out_bps_max=EXCLUDED.out_bps_max,
      utilization_in_avg=EXCLUDED.utilization_in_avg, utilization_in_max=EXCLUDED.utilization_in_max,
      utilization_out_avg=EXCLUDED.utilization_out_avg, utilization_out_max=EXCLUDED.utilization_out_max,
      in_errors_delta=EXCLUDED.in_errors_delta, out_errors_delta=EXCLUDED.out_errors_delta,
      in_discards_delta=EXCLUDED.in_discards_delta, out_discards_delta=EXCLUDED.out_discards_delta
  `, [interval, resolution]);
  return result.rowCount ?? 0;
}

async function buildProbeRollup(resolution:"5m"|"1h"|"1d",interval:string):Promise<number>{
  const result=await pool.query(`INSERT INTO probe_result_rollups(bucket_at,resolution,device_id,check_id,samples,up_samples,down_samples,degraded_samples,unknown_samples,availability_percent,latency_avg_ms,latency_min_ms,latency_max_ms,latency_p95_ms,first_sample_at,last_sample_at)
    SELECT date_bin($1::interval,p.finished_at,'2000-01-01'::timestamptz),$2,c.device_id,p.check_id,count(*)::int,
      count(*) FILTER(WHERE p.status='up')::int,count(*) FILTER(WHERE p.status='down')::int,count(*) FILTER(WHERE p.status='degraded')::int,count(*) FILTER(WHERE p.status='unknown')::int,
      round(100.0*count(*) FILTER(WHERE p.status IN ('up','degraded'))/NULLIF(count(*),0),5)::float,
      avg(p.latency_ms),min(p.latency_ms),max(p.latency_ms),percentile_cont(.95) WITHIN GROUP(ORDER BY p.latency_ms),min(p.finished_at),max(p.finished_at)
    FROM probe_results p JOIN checks c ON c.id=p.check_id WHERE p.finished_at>=now()-interval '2 days'
    GROUP BY 1,c.device_id,p.check_id
    ON CONFLICT(resolution,bucket_at,check_id) DO UPDATE SET samples=EXCLUDED.samples,up_samples=EXCLUDED.up_samples,down_samples=EXCLUDED.down_samples,degraded_samples=EXCLUDED.degraded_samples,unknown_samples=EXCLUDED.unknown_samples,availability_percent=EXCLUDED.availability_percent,latency_avg_ms=EXCLUDED.latency_avg_ms,latency_min_ms=EXCLUDED.latency_min_ms,latency_max_ms=EXCLUDED.latency_max_ms,latency_p95_ms=EXCLUDED.latency_p95_ms,first_sample_at=EXCLUDED.first_sample_at,last_sample_at=EXCLUDED.last_sample_at`,[interval,resolution]);
  return result.rowCount??0;
}

async function buildMetricRollup(resolution:"5m"|"1h"|"1d",interval:string):Promise<number>{
  const result=await pool.query(`INSERT INTO metric_rollups(bucket_at,resolution,device_id,check_id,metric_key,unit,samples,value_avg,value_min,value_max,value_p95)
    SELECT date_bin($1::interval,collected_at,'2000-01-01'::timestamptz),$2,device_id,(array_agg(check_id) FILTER(WHERE check_id IS NOT NULL))[1],metric_key,max(unit),count(*)::int,avg(value),min(value),max(value),percentile_cont(.95) WITHIN GROUP(ORDER BY value)
    FROM metric_samples WHERE collected_at>=now()-interval '2 days' GROUP BY 1,device_id,metric_key
    ON CONFLICT(resolution,bucket_at,device_id,metric_key) DO UPDATE SET check_id=EXCLUDED.check_id,unit=EXCLUDED.unit,samples=EXCLUDED.samples,value_avg=EXCLUDED.value_avg,value_min=EXCLUDED.value_min,value_max=EXCLUDED.value_max,value_p95=EXCLUDED.value_p95`,[interval,resolution]);
  return result.rowCount??0;
}

export async function runStorageMaintenance(): Promise<void> {
  const run = await pool.query("INSERT INTO storage_maintenance_runs DEFAULT VALUES RETURNING id");
  let rollups = 0;
  let deleted = 0;
  try {
    await ensureDailyPartitions();
    rollups += await buildRollup("5m", "5 minutes");
    rollups += await buildRollup("1h", "1 hour");
    rollups += await buildRollup("1d", "1 day");
    for(const [resolution,interval] of [["5m","5 minutes"],["1h","1 hour"],["1d","1 day"]] as const){rollups+=await buildProbeRollup(resolution,interval);rollups+=await buildMetricRollup(resolution,interval);}
    const raw = await pool.query(`DELETE FROM interface_samples s USING retention_settings g
      WHERE g.id=true AND s.collected_at < now() - make_interval(days => COALESCE(
        (SELECT raw_days FROM device_retention_overrides WHERE device_id=s.device_id), g.raw_days))
        AND EXISTS(SELECT 1 FROM interface_rollups r WHERE r.interface_id=s.interface_id AND r.resolution='5m' AND r.bucket_at=date_bin('5 minutes',s.collected_at,'2000-01-01'::timestamptz))`);
    const metrics = await pool.query(`DELETE FROM metric_samples s USING retention_settings g
      WHERE g.id=true AND s.collected_at < now() - make_interval(days => COALESCE(
        (SELECT raw_days FROM device_retention_overrides WHERE device_id=s.device_id), g.raw_days))
        AND EXISTS(SELECT 1 FROM metric_rollups r WHERE r.device_id=s.device_id AND r.metric_key=s.metric_key AND r.resolution='5m' AND r.bucket_at=date_bin('5 minutes',s.collected_at,'2000-01-01'::timestamptz))`);
    deleted += (raw.rowCount ?? 0) + (metrics.rowCount ?? 0);
    for (const [resolution, column] of [["5m", "five_minute_days"], ["1h", "hourly_days"], ["1d", "daily_days"]] as const) {
      const result = await pool.query(`DELETE FROM interface_rollups r USING retention_settings g
        WHERE g.id=true AND r.resolution=$1 AND r.bucket_at < now() - make_interval(days => COALESCE(
          (SELECT ${column} FROM device_retention_overrides WHERE device_id=r.device_id), g.${column}))`, [resolution]);
      deleted += result.rowCount ?? 0;
      const metricResult=await pool.query(`DELETE FROM metric_rollups r USING retention_settings g WHERE g.id=true AND r.resolution=$1 AND r.bucket_at<now()-make_interval(days=>COALESCE((SELECT ${column} FROM device_retention_overrides WHERE device_id=r.device_id),g.${column}))`,[resolution]);deleted+=metricResult.rowCount??0;
      const probeResult=await pool.query(`DELETE FROM probe_result_rollups r USING retention_settings g WHERE g.id=true AND r.resolution=$1 AND r.bucket_at<now()-make_interval(days=>COALESCE((SELECT ${column} FROM device_retention_overrides WHERE device_id=r.device_id),g.${column}))`,[resolution]);deleted+=probeResult.rowCount??0;
    }
    const probes=await pool.query(`DELETE FROM probe_results p USING checks c,retention_settings g WHERE p.check_id=c.id AND g.id=true
      AND p.finished_at<now()-make_interval(days=>COALESCE((SELECT raw_days FROM device_retention_overrides WHERE device_id=c.device_id),g.raw_days))
      AND EXISTS(SELECT 1 FROM probe_result_rollups r WHERE r.check_id=p.check_id AND r.resolution='5m' AND r.bucket_at=date_bin('5 minutes',p.finished_at,'2000-01-01'::timestamptz))
      AND NOT EXISTS(SELECT 1 FROM incidents i WHERE i.opening_result_id=p.id OR i.closing_result_id=p.id)
      AND NOT EXISTS(SELECT 1 FROM incident_signals s WHERE s.opening_result_id=p.id OR s.closing_result_id=p.id)`);deleted+=probes.rowCount??0;
    const jobs=await pool.query(`DELETE FROM probe_jobs j WHERE j.state='completed' AND j.completed_at<now()-interval '1 day' AND NOT EXISTS(SELECT 1 FROM probe_results p WHERE p.job_id=j.id)`);deleted+=jobs.rowCount??0;
    const configs = await pool.query(`DELETE FROM configuration_snapshots s USING retention_settings g
      WHERE g.id=true AND s.collected_at < now() - make_interval(days => COALESCE(
        (SELECT configuration_days FROM device_retention_overrides WHERE device_id=s.device_id), g.configuration_days))`);
    deleted += configs.rowCount ?? 0;
    const logs=await pool.query(`DELETE FROM system_logs l USING system_log_settings s WHERE s.id=true AND l.created_at<now()-make_interval(days=>s.retention_days)`);deleted+=logs.rowCount??0;
    await pool.query("UPDATE storage_maintenance_runs SET status='completed', finished_at=now(), rollups_written=$2, rows_deleted=$3 WHERE id=$1", [run.rows[0].id, rollups, deleted]);
  } catch (error) {
    await pool.query("UPDATE storage_maintenance_runs SET status='failed', finished_at=now(), message=$2 WHERE id=$1", [run.rows[0].id, error instanceof Error ? error.message : String(error)]);
    throw error;
  }
}

export function startStorageMaintenance(): NodeJS.Timeout {
  void ensureDailyPartitions().catch((error) => console.error("Partition maintenance failed", error));
  const interval = Number(process.env.STORAGE_MAINTENANCE_INTERVAL_MS ?? 3_600_000);
  return setInterval(() => void runStorageMaintenance().catch((error) => console.error("Storage maintenance failed", error)), interval);
}
