import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import type { ProbeJob, ProbeResult } from "@hedgesight/contracts";

const execFileAsync = promisify(execFile);

async function ping(job: ProbeJob): Promise<ProbeResult> {
  const startedAt = new Date();
  const start = performance.now();
  try {
    const timeoutSeconds = Math.max(1, Math.ceil(job.timeoutMs / 1000));
    const { stdout } = await execFileAsync("ping", ["-c", "1", "-W", String(timeoutSeconds), job.target], {
      timeout: job.timeoutMs + 500,
    });
    const match = stdout.match(/time[=<]([\d.]+)\s*ms/i);
    const latencyMs = match ? Number(match[1]) : performance.now() - start;
    return {
      status: "up",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      latencyMs,
      message: "ICMP echo reply received",
      metrics: { packetLossPercent: 0, responseTimeMs: latencyMs },
    };
  } catch (error) {
    const latencyMs = performance.now() - start;
    return {
      status: "down",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      latencyMs,
      message: error instanceof Error ? error.message : "Ping failed",
      metrics: { packetLossPercent: 100, responseTimeMs: latencyMs },
    };
  }
}

async function http(job: ProbeJob): Promise<ProbeResult> {
  const startedAt = new Date();
  const start = performance.now();
  try {
    const method = typeof job.config.method === "string" ? job.config.method : "GET";
    const expectedStatus = typeof job.config.expectedStatus === "number" ? job.config.expectedStatus : 200;
    const response = await fetch(job.target, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(job.timeoutMs),
      headers: { "user-agent": "HedgeSight-Worker/0.1" },
    });
    const latencyMs = performance.now() - start;
    const expectedContent = typeof job.config.expectedContent === "string" ? job.config.expectedContent : undefined;
    const contentMatches = expectedContent ? (await response.text()).includes(expectedContent) : true;
    const status = response.status === expectedStatus && contentMatches ? "up" : "down";
    return {
      status,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      latencyMs,
      message: contentMatches ? `HTTP ${response.status}` : "Expected content was not found",
      metrics: { responseTimeMs: latencyMs },
      observations: { statusCode: response.status, finalUrl: response.url, contentMatches },
    };
  } catch (error) {
    return {
      status: "down",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      latencyMs: performance.now() - start,
      message: error instanceof Error ? error.message : "HTTP request failed",
    };
  }
}

export async function executeProbe(job: ProbeJob): Promise<ProbeResult> {
  if (job.kind === "ping") return ping(job);
  if (job.kind === "http") return http(job);
  return {
    status: "unknown",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    message: `${job.kind.toUpperCase()} probes are not enabled in this worker version`,
  };
}
