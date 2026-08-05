import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import { createConnection } from "node:net";
import { promisify } from "node:util";
import { Client, type ConnectConfig } from "ssh2";
import type { ProbeJob, ProbeResult } from "@hedgesight/contracts";

const execFileAsync = promisify(execFile);

async function ping(job: ProbeJob): Promise<ProbeResult> {
  if (job.config.mode === "tcp") {
    const startedAt = new Date(); const start = performance.now(); const port = typeof job.config.port === "number" ? job.config.port : 22;
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection({ host: job.target, port });
        socket.setTimeout(job.timeoutMs);
        socket.once("connect", () => { socket.destroy(); resolve(); });
        socket.once("timeout", () => { socket.destroy(); reject(new Error(`TCP ${port} timed out`)); });
        socket.once("error", reject);
      });
      const latencyMs = performance.now() - start;
      return { status:"up",startedAt:startedAt.toISOString(),finishedAt:new Date().toISOString(),latencyMs,
        message:`TCP port ${port} accepted a connection`,metrics:{packetLossPercent:0,responseTimeMs:latencyMs},observations:{mode:"tcp",port} };
    } catch (error) {
      const latencyMs = performance.now() - start;
      return { status:"down",startedAt:startedAt.toISOString(),finishedAt:new Date().toISOString(),latencyMs,
        message:error instanceof Error ? error.message : `TCP ${port} failed`,metrics:{packetLossPercent:100,responseTimeMs:latencyMs},observations:{mode:"tcp",port} };
    }
  }
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

function sshExec(client:Client,command:string):Promise<string>{
  return new Promise((resolve,reject)=>client.exec(command,(error,stream)=>{if(error)return reject(error);let stdout="",stderr="";stream.on("data",(chunk:Buffer)=>stdout+=chunk.toString()).stderr.on("data",(chunk:Buffer)=>stderr+=chunk.toString());stream.on("close",(code:number|null)=>code===0?resolve(stdout.trim()):reject(new Error(stderr.trim()||`Command exited ${code}`)));}));
}

async function ssh(job:ProbeJob):Promise<ProbeResult>{
  const startedAt=new Date(),start=performance.now();let fingerprint="";const client=new Client();
  try{
    const config:ConnectConfig={host:job.target,port:Number(job.config.port??22),username:String(job.config.username??""),password:String(job.config.password??""),readyTimeout:job.timeoutMs,hostHash:"sha256",hostVerifier:(value:string)=>{fingerprint=String(value);const expected=String(job.config.hostKeyFingerprint??"");return !expected||expected===fingerprint;}};
    await new Promise<void>((resolve,reject)=>{client.once("ready",resolve).once("error",reject).connect(config);});
    const [hostname,osRelease,system,filesystems,interfaces,interfaceSpeeds]=await Promise.all([
      sshExec(client,"hostname -f 2>/dev/null || hostname"),
      sshExec(client,"cat /etc/os-release 2>/dev/null || true"),
      sshExec(client,"printf 'kernel='; uname -srmo; printf '\\ncpu_count='; getconf _NPROCESSORS_ONLN; printf '\\nmem_kb='; awk '/MemTotal/{print $2}' /proc/meminfo; printf '\\nload='; cut -d' ' -f1-3 /proc/loadavg; printf '\\nuptime_seconds='; cut -d' ' -f1 /proc/uptime"),
      sshExec(client,"df -Pk -x tmpfs -x devtmpfs 2>/dev/null || df -Pk"),
      sshExec(client,"ip -j link 2>/dev/null || true"),
      sshExec(client,"for p in /sys/class/net/*; do n=${p##*/}; printf '%s=' \"$n\"; cat \"$p/speed\" 2>/dev/null || echo; done"),
    ]);
    client.end();
    const os=Object.fromEntries(osRelease.split("\n").filter(line=>line.includes("=")).map(line=>{const [key,...parts]=line.split("=");return [key,parts.join("=").replace(/^\"|\"$/g,"")];}));
    const facts=Object.fromEntries(system.split("\n").filter(line=>line.includes("=")).map(line=>{const [key,...parts]=line.split("=");return [key,parts.join("=")];}));
    const disks=filesystems.split("\n").slice(1).map(line=>line.trim().split(/\s+/)).filter(parts=>parts.length>=6).map(parts=>({filesystem:parts[0],totalBytes:Number(parts[1])*1024,usedBytes:Number(parts[2])*1024,availableBytes:Number(parts[3])*1024,usedPercent:Number(parts[4].replace("%","")),mount:parts.slice(5).join(" ")}));
    const speeds=Object.fromEntries(interfaceSpeeds.split("\n").filter(line=>line.includes("=")).map(line=>{const [name,value]=line.split("=");return [name,Number(value)>0?Number(value):null];}));
    let adapters:Array<Record<string,unknown>>=[];try{adapters=JSON.parse(interfaces).map((item:Record<string,unknown>)=>({name:item.ifname,macAddress:item.address,mtu:item.mtu,state:item.operstate,speedMbps:speeds[String(item.ifname)]??null}));}catch{}
    const memoryBytes=Number(facts.mem_kb??0)*1024,load1=Number(String(facts.load??"0").split(" ")[0]);
    return {status:"up",startedAt:startedAt.toISOString(),finishedAt:new Date().toISOString(),latencyMs:performance.now()-start,message:`SSH profile collected from ${hostname}`,metrics:{sshResponseTimeMs:performance.now()-start,load1,memoryBytes,diskHighestUsedPercent:Math.max(0,...disks.map(item=>item.usedPercent))},observations:{hostname,osName:os.PRETTY_NAME??os.NAME??"Linux",osVersion:os.VERSION_ID??"",kernel:facts.kernel??"",cpuCount:Number(facts.cpu_count??0),memoryBytes,uptimeSeconds:Number(facts.uptime_seconds??0),filesystems:disks,interfaces:adapters,hostKeyFingerprint:fingerprint}};
  }catch(error){client.end();return {status:"unknown",startedAt:startedAt.toISOString(),finishedAt:new Date().toISOString(),latencyMs:performance.now()-start,message:error instanceof Error?error.message:"SSH profiling failed",observations:{hostKeyFingerprint:fingerprint}};}
}

export async function executeProbe(job: ProbeJob): Promise<ProbeResult> {
  if (job.kind === "ping") return ping(job);
  if (job.kind === "http") return http(job);
  if (job.kind === "ssh") return ssh(job);
  return {
    status: "unknown",
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    message: `${job.kind.toUpperCase()} probes are not enabled in this worker version`,
  };
}
