import type { ProbeJob } from "@hedgesight/contracts";
import { cpus, freemem, hostname, loadavg, platform, release, totalmem, uptime } from "node:os";
import { executeProbe } from "./probes.js";
import { collectBackup,leaseBackup,submitBackup } from "./backups.js";

const apiUrl = (process.env.HEDGESIGHT_API_URL ?? "http://localhost:8080").replace(/\/$/, "");
const token = process.env.WORKER_TOKEN ?? "local-development-token";
const workerName = process.env.WORKER_NAME ?? `worker-${process.pid}`;
const version = process.env.HEDGESIGHT_VERSION ?? "0.1.0-dev";
const pollInterval = Number(process.env.JOB_POLL_INTERVAL_MS ?? 3000);
const capabilities = ["ping", "http", "ssh", "vsphere"];
function runtimeMetrics(){const total=totalmem(),free=freemem();return {hostname:hostname(),platform:platform(),platformVersion:release(),cpuCount:cpus().length,load1:Number(loadavg()[0].toFixed(2)),memoryBytes:String(total),memoryUsedPercent:Number((((total-free)/total)*100).toFixed(1)),uptimeSeconds:Math.round(uptime())};}
async function log(level:"debug"|"info"|"warn"|"error",category:string,message:string,context:Record<string,unknown>={}){try{await fetch(`${apiUrl}/api/workers/system-logs`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({level,source:workerName,category,message,context})});}catch{/* Console remains the final fallback. */}}

async function lease(): Promise<ProbeJob | null> {
  const response = await fetch(`${apiUrl}/api/workers/lease`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: workerName, version, capabilities, runtimeMetrics:runtimeMetrics() }),
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
  if(job.kind==="ssh"&&Array.isArray(result.observations?.interfaces)){
    const interfaces=(result.observations.interfaces as Array<Record<string,unknown>>).filter(item=>item.monitored!==false);
    if(interfaces.length){const sample=await fetch(`${apiUrl}/api/workers/interface-samples`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({workerName,deviceId:job.deviceId,collectedAt:result.finishedAt,deviceUptimeTicks:String(Math.round(Number(result.observations?.uptimeSeconds??0)*100)),interfaces:interfaces.map(item=>({stableKey:String(item.name),name:String(item.name),macAddress:String(item.macAddress??""),speedBps:item.speedMbps?String(Number(item.speedMbps)*1_000_000):undefined,adminStatus:item.state==="up"?1:2,operationalStatus:item.state==="up"?1:2,counters:item.counters,metadata:{source:"linux-ssh",mtu:Number(item.mtu??0)}}))})});if(!sample.ok)console.error(`Interface sample submission failed with HTTP ${sample.status}`);}
  }
  console.info(`${job.kind} ${job.target}: ${result.status}${result.latencyMs ? ` (${result.latencyMs.toFixed(1)}ms)` : ""}`);
}

console.info(`HedgeSight worker ${workerName} (${version}) connecting to ${apiUrl}`);
for (;;) {
  try {
    const backup=await leaseBackup(apiUrl,token,workerName,version);
    if(backup){const result=await collectBackup(backup);await submitBackup(apiUrl,token,backup,result);console.info(`backup ${backup.target}: ${result.success?"success":"failed"} — ${result.message}`);continue;}
    const job = await lease();
    if (job) await submit(job);
    else await new Promise((resolve) => setTimeout(resolve, pollInterval));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    void log("error","worker-loop",error instanceof Error?error.message:String(error));
    await new Promise((resolve) => setTimeout(resolve, Math.max(pollInterval, 5000)));
  }
}
