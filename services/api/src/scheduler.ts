import { pool } from "./db.js";

export async function scheduleDueChecks(): Promise<number> {
  const result = await pool.query(`
    WITH due AS (
      SELECT c.id
      FROM checks c
      JOIN devices d ON d.id = c.device_id
      WHERE c.enabled = true
        AND d.enabled = true
        AND c.kind IN ('ping', 'http', 'ssh')
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

export async function scheduleDueBackups():Promise<number>{const result=await pool.query(`WITH due AS (SELECT id FROM backup_jobs WHERE enabled=true AND next_run_at<=now() FOR UPDATE SKIP LOCKED),inserted AS (INSERT INTO backup_runs(job_id) SELECT id FROM due ON CONFLICT DO NOTHING RETURNING job_id) UPDATE backup_jobs j SET next_run_at=now()+make_interval(secs=>j.interval_seconds),last_status='queued',last_message='Scheduled backup queued',updated_at=now() FROM inserted i WHERE j.id=i.job_id RETURNING j.id`);return result.rowCount??0;}

export function startScheduler(): NodeJS.Timeout {
  void scheduleDueChecks();
  void scheduleDueBackups();
  return setInterval(() => {
    void scheduleDueChecks().catch((error) => console.error("Scheduler failed", error));
    void scheduleDueBackups().catch((error)=>console.error("Backup scheduler failed",error));
  }, 2_000);
}
