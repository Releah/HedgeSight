import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import { createConnection } from "node:net";
import { promisify } from "node:util";
import { Client, type ConnectConfig } from "ssh2";
import type { ProbeJob, ProbeResult } from "@hedgesight/contracts";

const execFileAsync = promisify(execFile);
const sshCounterHistory=new Map<string,{at:number;inOctets:bigint;outOctets:bigint;errors:bigint}>();

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
    const [hostname,osRelease,system,filesystems,interfaces]=await Promise.all([
      sshExec(client,"hostname -f 2>/dev/null || hostname"),
      sshExec(client,"cat /etc/os-release 2>/dev/null || true"),
      sshExec(client,"printf 'kernel='; uname -srmo; printf '\\ncpu_count='; getconf _NPROCESSORS_ONLN; printf '\\nmem_kb='; awk '/MemTotal/{print $2}' /proc/meminfo; printf '\\nmem_available_kb='; awk '/MemAvailable/{print $2}' /proc/meminfo; printf '\\nload='; cut -d' ' -f1-3 /proc/loadavg; printf '\\nuptime_seconds='; cut -d' ' -f1 /proc/uptime; set -- $(head -1 /proc/stat); t1=$(($2+$3+$4+$5+$6+$7+$8+$9)); idle1=$(($5+$6)); sleep 1; set -- $(head -1 /proc/stat); t2=$(($2+$3+$4+$5+$6+$7+$8+$9)); idle2=$(($5+$6)); printf '\\ncpu_used_percent='; awk -v dt=$((t2-t1)) -v di=$((idle2-idle1)) 'BEGIN { if(dt>0) printf \"%.2f\",100*(dt-di)/dt; else print 0 }'"),
      sshExec(client,"df -Pk -x tmpfs -x devtmpfs 2>/dev/null || df -Pk"),
      sshExec(client,"for p in /sys/class/net/*; do n=${p##*/}; printf '%s|' \"$n\"; for f in address mtu operstate speed statistics/rx_bytes statistics/tx_bytes statistics/rx_errors statistics/tx_errors statistics/rx_dropped statistics/tx_dropped; do tr -d '\\n' < \"$p/$f\" 2>/dev/null || true; printf '|'; done; printf '\\n'; done"),
    ]);
    client.end();
    const os=Object.fromEntries(osRelease.split("\n").filter(line=>line.includes("=")).map(line=>{const [key,...parts]=line.split("=");return [key,parts.join("=").replace(/^\"|\"$/g,"")];}));
    const facts=Object.fromEntries(system.split("\n").filter(line=>line.includes("=")).map(line=>{const [key,...parts]=line.split("=");return [key,parts.join("=")];}));
    const configuredComponents=Array.isArray(job.config.monitoredComponents)?job.config.monitoredComponents.map(String):null,isMonitored=(id:string)=>configuredComponents===null||configuredComponents.includes(id);
    const disks=filesystems.split("\n").slice(1).map(line=>line.trim().split(/\s+/)).filter(parts=>parts.length>=6).map(parts=>({filesystem:parts[0],totalBytes:Number(parts[1])*1024,usedBytes:Number(parts[2])*1024,availableBytes:Number(parts[3])*1024,usedPercent:Number(parts[4].replace("%","")),mount:parts.slice(5).join(" ")}));
    const now=Date.now();let highestInterfaceUtilizationPercent=0,interfaceErrorDelta=0;
    const adapters=interfaces.split("\n").filter(Boolean).map(line=>{const [name,macAddress,mtu,state,speedMbps,inOctets="0",outOctets="0",inErrors="0",outErrors="0",inDiscards="0",outDiscards="0"]=line.split("|");const monitored=isMonitored(`interface:${name}`),speed=Number(speedMbps)>0?Number(speedMbps):null,key=`${job.deviceId}:${name}`,current={at:now,inOctets:BigInt(inOctets||0),outOctets:BigInt(outOctets||0),errors:BigInt(inErrors||0)+BigInt(outErrors||0)+BigInt(inDiscards||0)+BigInt(outDiscards||0)},previous=sshCounterHistory.get(key);let inBps:number|null=null,outBps:number|null=null,utilizationPercent:number|null=null,errorDelta=0;if(monitored&&previous&&now>previous.at&&current.inOctets>=previous.inOctets&&current.outOctets>=previous.outOctets){const seconds=(now-previous.at)/1000;inBps=Number(current.inOctets-previous.inOctets)*8/seconds;outBps=Number(current.outOctets-previous.outOctets)*8/seconds;utilizationPercent=speed?Math.max(inBps,outBps)/(speed*1_000_000)*100:null;errorDelta=Number(current.errors>=previous.errors?current.errors-previous.errors:0n);highestInterfaceUtilizationPercent=Math.max(highestInterfaceUtilizationPercent,utilizationPercent??0);interfaceErrorDelta+=errorDelta;}sshCounterHistory.set(key,current);return {name,monitored,macAddress,mtu:Number(mtu)||null,state,speedMbps:speed,inBps,outBps,utilizationPercent,errorDelta,counters:{inOctets,outOctets,inErrors,outErrors,inDiscards,outDiscards}};});
    const memoryBytes=Number(facts.mem_kb??0)*1024,memoryUsedPercent=Number(facts.mem_kb)?100*(1-Number(facts.mem_available_kb??0)/Number(facts.mem_kb)):0,cpuUsedPercent=Number(facts.cpu_used_percent??0),monitoredDisks=disks.filter(item=>isMonitored(`disk:${item.mount}`)),diskHighestUsedPercent=Math.max(0,...monitoredDisks.map(item=>item.usedPercent));
    const limits={cpu:Number(job.config.cpuThresholdPercent??90),memory:Number(job.config.memoryThresholdPercent??90),disk:Number(job.config.diskThresholdPercent??90),interfaceUtilization:Number(job.config.interfaceThresholdPercent??90),interfaceErrors:Number(job.config.interfaceErrorThreshold??1)};const alerts:string[]=[];if(isMonitored("cpu")&&cpuUsedPercent>=limits.cpu)alerts.push(`CPU ${cpuUsedPercent.toFixed(1)}%`);if(isMonitored("memory")&&memoryUsedPercent>=limits.memory)alerts.push(`memory ${memoryUsedPercent.toFixed(1)}%`);if(monitoredDisks.length&&diskHighestUsedPercent>=limits.disk)alerts.push(`disk ${diskHighestUsedPercent.toFixed(1)}%`);if(highestInterfaceUtilizationPercent>=limits.interfaceUtilization)alerts.push(`interface ${highestInterfaceUtilizationPercent.toFixed(1)}%`);if(interfaceErrorDelta>=limits.interfaceErrors&&limits.interfaceErrors>0)alerts.push(`${interfaceErrorDelta} interface errors/discards`);
    const metrics:Record<string,number>={sshResponseTimeMs:performance.now()-start};if(isMonitored("cpu"))metrics.cpuUsedPercent=cpuUsedPercent;if(isMonitored("memory")){metrics.memoryUsedPercent=memoryUsedPercent;metrics.memoryBytes=memoryBytes;}for(const disk of monitoredDisks)metrics[`diskUsedPercent:${disk.mount}`]=disk.usedPercent;if(adapters.some(item=>item.monitored)){metrics.highestInterfaceUtilizationPercent=highestInterfaceUtilizationPercent;metrics.interfaceErrorDelta=interfaceErrorDelta;}
    return {status:alerts.length?"degraded":"up",startedAt:startedAt.toISOString(),finishedAt:new Date().toISOString(),latencyMs:performance.now()-start,message:alerts.length?`Resource threshold exceeded: ${alerts.join(", ")}`:`SSH profile collected from ${hostname}`,metrics,observations:{hostname,osName:os.PRETTY_NAME??os.NAME??"Linux",osVersion:os.VERSION_ID??"",kernel:facts.kernel??"",cpuCount:Number(facts.cpu_count??0),cpuUsedPercent,memoryBytes,memoryUsedPercent,uptimeSeconds:Number(facts.uptime_seconds??0),filesystems:disks,interfaces:adapters,hostKeyFingerprint:fingerprint}};
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
