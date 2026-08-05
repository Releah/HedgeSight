import { pool } from "./db.js";

export async function scheduleDueChecks(): Promise<number> {
  const result = await pool.query(`
    WITH due AS (
      SELECT c.id
      FROM checks c
      JOIN devices d ON d.id = c.device_id
      WHERE c.enabled = true
        AND d.enabled = true
        AND c.kind IN ('ping', 'http')
        AND c.next_run_at <= now()
      FOR UPDATE SKIP LOCKED
    ), inserted AS (
      INSERT INTO probe_jobs(check_id)
      SELECT id FROM due
      ON CONFLICT DO NOTHING
      RETURNING check_id
    )
    UPDATE checks c
      SET next_run_at = now() + make_interval(secs => c.interval_seconds), updated_at = now()
    FROM inserted i
    WHERE c.id = i.check_id
    RETURNING c.id
  `);
  return result.rowCount ?? 0;
}

export function startScheduler(): NodeJS.Timeout {
  void scheduleDueChecks();
  return setInterval(() => {
    void scheduleDueChecks().catch((error) => console.error("Scheduler failed", error));
  }, 2_000);
}
