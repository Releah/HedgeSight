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

export async function runStorageMaintenance(): Promise<void> {
  const run = await pool.query("INSERT INTO storage_maintenance_runs DEFAULT VALUES RETURNING id");
  let rollups = 0;
  let deleted = 0;
  try {
    await ensureDailyPartitions();
    rollups += await buildRollup("5m", "5 minutes");
    rollups += await buildRollup("1h", "1 hour");
    rollups += await buildRollup("1d", "1 day");
    const raw = await pool.query(`DELETE FROM interface_samples s USING retention_settings g
      WHERE g.id=true AND s.collected_at < now() - make_interval(days => COALESCE(
        (SELECT raw_days FROM device_retention_overrides WHERE device_id=s.device_id), g.raw_days))`);
    const metrics = await pool.query(`DELETE FROM metric_samples s USING retention_settings g
      WHERE g.id=true AND s.collected_at < now() - make_interval(days => COALESCE(
        (SELECT raw_days FROM device_retention_overrides WHERE device_id=s.device_id), g.raw_days))`);
    deleted += (raw.rowCount ?? 0) + (metrics.rowCount ?? 0);
    for (const [resolution, column] of [["5m", "five_minute_days"], ["1h", "hourly_days"], ["1d", "daily_days"]] as const) {
      const result = await pool.query(`DELETE FROM interface_rollups r USING retention_settings g
        WHERE g.id=true AND r.resolution=$1 AND r.bucket_at < now() - make_interval(days => COALESCE(
          (SELECT ${column} FROM device_retention_overrides WHERE device_id=r.device_id), g.${column}))`, [resolution]);
      deleted += result.rowCount ?? 0;
    }
    const configs = await pool.query(`DELETE FROM configuration_snapshots s USING retention_settings g
      WHERE g.id=true AND s.collected_at < now() - make_interval(days => COALESCE(
        (SELECT configuration_days FROM device_retention_overrides WHERE device_id=s.device_id), g.configuration_days))`);
    deleted += configs.rowCount ?? 0;
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
