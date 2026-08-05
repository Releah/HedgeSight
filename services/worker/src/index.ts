import type { ProbeJob } from "@hedgesight/contracts";
import { executeProbe } from "./probes.js";

const apiUrl = (process.env.HEDGESIGHT_API_URL ?? "http://localhost:8080").replace(/\/$/, "");
const token = process.env.WORKER_TOKEN ?? "local-development-token";
const workerName = process.env.WORKER_NAME ?? `worker-${process.pid}`;
const version = process.env.HEDGESIGHT_VERSION ?? "0.1.0-dev";
const pollInterval = Number(process.env.JOB_POLL_INTERVAL_MS ?? 3000);
const capabilities = ["ping", "http"];

async function lease(): Promise<ProbeJob | null> {
  const response = await fetch(`${apiUrl}/api/workers/lease`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: workerName, version, capabilities }),
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`Lease request failed with HTTP ${response.status}`);
  return response.json() as Promise<ProbeJob>;
}

async function submit(job: ProbeJob): Promise<void> {
  const result = await executeProbe(job);
  const response = await fetch(`${apiUrl}/api/workers/jobs/${job.id}/results`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ workerName, ...result }),
  });
  if (!response.ok) throw new Error(`Result submission failed with HTTP ${response.status}`);
  console.info(`${job.kind} ${job.target}: ${result.status}${result.latencyMs ? ` (${result.latencyMs.toFixed(1)}ms)` : ""}`);
}

console.info(`HedgeSight worker ${workerName} (${version}) connecting to ${apiUrl}`);
for (;;) {
  try {
    const job = await lease();
    if (job) await submit(job);
    else await new Promise((resolve) => setTimeout(resolve, pollInterval));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await new Promise((resolve) => setTimeout(resolve, Math.max(pollInterval, 5000)));
  }
}
