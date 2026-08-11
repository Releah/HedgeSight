import {
  Fragment,
  useEffect,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import type { DashboardSummary } from "@hedgesight/contracts";
import {
  Activity,
  Archive,
  ArrowRight,
  Bell,
  Box,
  CalendarClock,
  ChevronDown,
  CircleGauge,
  ClipboardList,
  Database,
  Eye,
  History,
  HardDriveDownload,
  KeyRound,
  LogOut,
  Menu,
  MonitorDot,
  Pencil,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  Wrench,
  LockKeyhole,
  FileText,
  X,
} from "lucide-react";

type View =
  | "overview"
  | "monitoring"
  | "devices"
  | "incidents"
  | "tasks"
  | "maintenance"
  | "backups"
  | "logs"
  | "workers"
  | "settings";
type DeviceGroup = {
  id: string;
  name: string;
  color: string;
  deviceCount: number;
};
type MonitoringDevice = {
  id: string;
  name: string;
  address: string;
  description: string;
  status: string;
  enabled: boolean;
  osName: string | null;
  osVersion: string | null;
  deviceType: string | null;
  vendor: string | null;
  model: string | null;
  pingCheckId: string | null;
  intervalSeconds: number | null;
  reachabilityMode: "icmp" | "tcp";
  tcpPort: number;
  pingStatus: string | null;
  lastRunAt: string | null;
  latencyMs: number | null;
  packetLossPercent: number | null;
  history: Array<{
    timestamp: string;
    latencyMs: number | null;
    status: string;
  }>;
  groups: DeviceGroup[];
  changeId: string | null;
  changeReference: string | null;
  changeDescription: string | null;
  changeManagerName: string | null;
  maintenanceStartedAt: string | null;
  maintenanceEstimatedEndAt: string | null;
  changeStatus: "scheduled"|"active"|"overdue"|null;
  sshCredentialId:string|null;sshCredentialName:string|null;sshPort:number|null;sshEnabled:boolean|null;sshIntervalSeconds:number|null;sshStatus:string|null;sshLastRunAt:string|null;sshProfile:Record<string,unknown>;sshProfiledAt:string|null;sshThresholds:Record<string,unknown>;
  vsphereCredentialId:string|null;vspherePort:number|null;vsphereVerifyTls:boolean|null;vsphereEnabled:boolean|null;vsphereIntervalSeconds:number|null;vsphereStatus:string|null;vsphereLastRunAt:string|null;vsphereProfile:Record<string,unknown>;vsphereProfiledAt:string|null;vsphereThresholds:Record<string,unknown>;
  uptimeSeconds: string | null;
  downtimeSeconds: string | null;
  maintenanceDowntimeSeconds: string | null;
  uptimePercent: string | null;
};
type ChangeManager = { id:string;displayName:string;email:string };
type ChangeRecord={id:string;changeReference:string;publicDescription:string;managerId:string;managerName:string;startedAt:string;estimatedEndAt:string;endedAt:string|null;deviceCount:number;deviceNames:string[];status:"scheduled"|"active"|"overdue"|"completed"};
type TaskStatus=string;
type TaskLane={key:string;name:string;position:number;isCompletionLane:boolean};
type TaskTag={id:string;name:string;color:string};
type Priority="P1"|"P2"|"P3"|"P4";
type TaskRecord={id:string;title:string;description:string;status:TaskStatus;priority:Priority;tags:TaskTag[];createdAt:string;updatedAt:string;assigneeId:string|null;assigneeName:string|null;incidentCount:number;updateCount:number};
type TaskDetail=TaskRecord&{incidents:Array<{id:string;status:string;openedAt:string;deviceName:string}>;updates:Array<{id:string;body:string;createdAt:string;authorName:string}>};
type InterfaceStats = {
  id: string;
  name: string;
  alias: string;
  description: string;
  speedBps: string | null;
  adminStatus: number | null;
  operationalStatus: number | null;
  present: boolean;
  lastSeenAt: string;
  inBps: number | null;
  outBps: number | null;
  utilizationInPercent: number | null;
  utilizationOutPercent: number | null;
  inErrors: string | null;
  outErrors: string | null;
  inDiscards: string | null;
  outDiscards: string | null;
  errorDelta:number|null;discardDelta:number|null;
};
type Retention = {
  rawDays: number;
  fiveMinuteDays: number;
  hourlyDays: number;
  dailyDays: number;
  incidentDays: number;
  configurationDays: number;
};
type StorageStatus = {
  databaseBytes: string;
  interfaceSamples: string;
  rollups: string;
  interfaces: string;
  configurationSnapshots: string;
  lastMaintenance: {
    finishedAt: string | null;
    status: string;
    rowsDeleted: number;
    rollupsWritten: number;
  } | null;
};
type SettingsTab = "data" | "credentials" | "accounts" | "authentication" | "system";
type StoredCredential={id:string;name:string;username:string;deviceCount:number;createdAt:string;updatedAt:string};
type DatabaseStatus={source:string;host:string;port:string;database:string;tls:string};
type BackupProfile={id:string;name:string;description:string;kind:"network_script"|"server_files";script:string;paths:string[];jobCount:number;updatedAt:string};
type BackupJob={id:string;name:string;profileId:string;profileName:string;kind:string;deviceId:string;deviceName:string;credentialId:string;credentialName:string;sshPort:number;intervalSeconds:number;retentionCount:number;enabled:boolean;nextRunAt:string;lastRunAt:string|null;lastStatus:string;lastMessage:string|null};
type BackupSummary={total:number;enabled:number;healthy:number;failed:number;pending:number;recent:Array<{id:string;state:string;createdAt:string;finishedAt:string|null;message:string|null;sizeBytes:string|null;jobName:string;deviceName:string;kind:string}>};
type SystemLog={id:string;createdAt:string;firstSeenAt:string;level:"debug"|"info"|"warn"|"error";source:string;category:string;message:string;context:Record<string,unknown>;deviceId:string|null;deviceName:string|null;deviceAddress:string|null;count:number};
type LogNode={id:string;name:string;address:string};
type ChartRequest={deviceId:string;title:string;kind:"metric"|"interface";key?:string;interfaceId?:string;unit:string};
type ChartPoint={timestamp:string;value?:number;inBps?:number|null;outBps?:number|null;utilizationInPercent?:number|null;utilizationOutPercent?:number|null;errorDelta?:number|null;discardDelta?:number|null};
type Account = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  enabled: boolean;
  hasLocalPassword: boolean;
  hasOidcIdentity: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  isProtected: boolean;
  isCurrent: boolean;
};
type AuthenticationSettings = {
  localAccountsEnabled: boolean;
  oidc: {
    enabled: boolean;
    issuerUrl: string | null;
    clientId: string | null;
    clientIdConfigured: boolean;
    clientSecretConfigured: boolean;
    redirectUri: string | null;
    source: "database" | "environment";
  };
  sessionDays: number;
  cookieSecure: boolean;
  trustProxy: boolean;
};
type IncidentRecord = {
  id: string;
  status: "open" | "pending_investigation" | "under_investigation" | "resolved";
  priority: Priority;
  openedAt: string;
  recoveredAt: string | null;
  resolvedAt: string | null;
  archivedAt: string | null;
  deviceId: string;
  deviceName: string;
  address: string;
  deviceStatus: string;
  checkName: string;
  checkKind: string;
  investigatorName: string | null;
  updateCount: number;
  majorIncidentId: string | null;
  majorIncidentReference: string | null;
  majorIncidentTitle: string | null;
  majorIncidentSeverity: "major" | "critical" | null;
  majorIncidentStatus: "open" | "resolved" | null;
};
type IncidentDetail = IncidentRecord & {
  deviceDescription: string;
  checkStatus: string;
  availabilityStatus: string;
  openingMessage: string | null;
  investigatorId: string | null;
  closedByName: string | null;
  publicMessage: string | null;
  publicMessageUpdatedAt: string | null;
  updates: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorName: string;
    authorId: string | null;
  }>;
};
type MonitoringAlert={id:string;kind:"degraded"|"monitoring_unavailable";message:string;occurrenceCount:number;firstSeenAt:string;lastSeenAt:string;deviceId:string;deviceName:string;address:string;checkId:string;checkName:string;checkKind:string};
type MajorIncident = {
  id: string;
  number: string;
  reference: string;
  title: string;
  impact: string;
  severity: "major" | "critical";
  status: "open" | "resolved";
  openedAt: string;
  resolvedAt: string | null;
  archivedAt: string | null;
  ownerName: string | null;
  incidentCount: number;
  updateCount: number;
};
type MajorIncidentDetail = MajorIncident & {
  incidents: Array<{
    id: string;
    deviceName: string;
    status: string;
    openedAt: string;
  }>;
  updates: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorName: string;
  }>;
};
const empty: DashboardSummary = {
  counts: { up: 0, down: 0, degraded: 0, monitoring_error:0, unknown: 0 },
  maintenanceCount: 0,
  devices: [],
  workers: [],
  infrastructure:{sampledAt:new Date(0).toISOString(),application:{version:"—",uptimeSeconds:0,memoryBytes:0,memoryUsedPercent:0,load1:0,cpuCount:0,hostname:"—"},database:{sizeBytes:"0",activeConnections:0,maxConnections:0,transactions:"0",cacheHitPercent:0,hostname:"—"}},
  recentIncidents: [],
  activeChanges: [],
};
const pageCopy: Record<
  View,
  { eyebrow: string; title: string; description: string }
> = {
  overview: {
    eyebrow: "ACTIVE MONITORING",
    title: "Good morning.",
    description: "Here’s what’s happening across your infrastructure.",
  },
  monitoring: {
    eyebrow: "LIVE STATUS",
    title: "Monitoring",
    description:
      "Reachability and response time across every monitored device.",
  },
  devices: {
    eyebrow: "INVENTORY",
    title: "Devices",
    description: "Manage and inspect everything monitored by HedgeSight.",
  },
  incidents: {
    eyebrow: "EVENTS",
    title: "Incidents",
    description: "Review active outages and recently resolved checks.",
  },
  tasks:{eyebrow:"FOLLOW-UP ACTIONS",title:"Tasks",description:"Track root-cause work and follow-up actions linked to incidents."},
  maintenance:{eyebrow:"CHANGE MANAGEMENT",title:"Maintenance",description:"Review, extend and complete planned maintenance windows."},
  backups:{eyebrow:"CONFIGURATION PROTECTION",title:"Backups",description:"Schedule and verify encrypted network and server backups."},
  logs:{eyebrow:"OBSERVABILITY",title:"Logs",description:"Search platform activity, collector failures and diagnostic events."},
  workers: {
    eyebrow: "CONTROL PLANE",
    title: "Platform",
    description: "Inspect the HedgeSight application, database and execution nodes.",
  },
  settings: {
    eyebrow: "CONTROL PLANE",
    title: "Settings",
    description: "Review deployment, update, and platform configuration.",
  },
};

function relativeTime(value: string | null): string {
  if (!value) return "Never";
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function availabilityDuration(value:string|null):string{
  const seconds=Math.max(0,Number(value??0));
  if(seconds<60)return `${Math.round(seconds)}s`;
  const days=Math.floor(seconds/86400),hours=Math.floor((seconds%86400)/3600),minutes=Math.floor((seconds%3600)/60);
  return days?`${days}d ${hours}h`:hours?`${hours}h ${minutes}m`:`${minutes}m`;
}

function dateTimeLocalValue(offsetMinutes=0):string{
  const date=new Date(Date.now()+offsetMinutes*60_000-dateTimezoneOffset()*60_000);
  return date.toISOString().slice(0,16);
}

function dateTimezoneOffset():number{return new Date().getTimezoneOffset();}
function localDateTime(value:string):string{const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16);}
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {status==="monitoring_error"?"Monitoring unavailable":status}
    </span>
  );
}
function componentMonitored(device:MonitoringDevice,id:string):boolean{const selected=device.sshThresholds.monitoredComponents;return !Array.isArray(selected)||(selected as string[]).includes(id);}
function chartSegments(points:ChartPoint[],value:(point:ChartPoint)=>number,start:number,end:number,maximum:number){const width=720,height=230,dated=points.map(point=>({point,time:new Date(point.timestamp).getTime()})).filter(item=>Number.isFinite(item.time)&&item.time>=start&&item.time<=end).sort((a,b)=>a.time-b.time),gaps=dated.slice(1).map((item,index)=>item.time-dated[index].time).filter(gap=>gap>0).sort((a,b)=>a-b),typical=gaps.length?gaps[Math.floor(gaps.length/2)]:60_000,gapLimit=Math.max(typical*3,5*60_000),segments:string[][]=[];let current:string[]=[];dated.forEach((item,index)=>{if(index&&item.time-dated[index-1].time>gapLimit){if(current.length)segments.push(current);current=[];}const x=(item.time-start)/(end-start)*width,y=height-(value(item.point)/Math.max(1,maximum))*height;current.push(`${x},${y}`);});if(current.length)segments.push(current);return segments;}
function TimeChart({points,kind,unit,hours}:{points:ChartPoint[];kind:"metric"|"interface";unit:string;hours:number}){const end=Date.now(),start=end-hours*3_600_000,primaryValue=(item:ChartPoint)=>kind==="interface"?Number(item.inBps??0)/1_000_000:Number(item.value??0),secondaryValue=(item:ChartPoint)=>Number(item.outBps??0)/1_000_000,maximum=Math.max(...points.map(primaryValue),...(kind==="interface"?points.map(secondaryValue):[]),0),primary=chartSegments(points,primaryValue,start,end,maximum),secondary=kind==="interface"?chartSegments(points,secondaryValue,start,end,maximum):[],errorTotal=points.reduce((sum,item)=>sum+Number(item.errorDelta??0),0),discardTotal=points.reduce((sum,item)=>sum+Number(item.discardDelta??0),0),firstSample=points.length?Math.min(...points.map(item=>new Date(item.timestamp).getTime())):null;if(!points.length)return <div className="chart-empty">No samples in this time window yet.</div>;return <><div className="chart-scale"><span>{maximum.toFixed(maximum<10?2:1)} {unit}</span><span>0 {unit}</span></div><svg className="history-chart" viewBox="0 0 720 230" preserveAspectRatio="none" aria-label="Metric history"><line x1="0" y1="0" x2="720" y2="0"/><line x1="0" y1="115" x2="720" y2="115"/><line x1="0" y1="230" x2="720" y2="230"/>{primary.map((segment,index)=>segment.length>1?<polyline key={`primary-${index}`} className="chart-primary" points={segment.join(" ")}/>:<circle key={`primary-${index}`} className="chart-primary-point" cx={segment[0].split(",")[0]} cy={segment[0].split(",")[1]} r="3"/>)}{secondary.map((segment,index)=>segment.length>1?<polyline key={`secondary-${index}`} className="chart-secondary" points={segment.join(" ")}/>:<circle key={`secondary-${index}`} className="chart-secondary-point" cx={segment[0].split(",")[0]} cy={segment[0].split(",")[1]} r="3"/>)}{kind==="interface"&&points.map((item,index)=>{const x=(new Date(item.timestamp).getTime()-start)/(end-start)*720;return <Fragment key={`events-${index}`}>{Number(item.errorDelta??0)>0&&<circle className="chart-error-point" cx={x} cy="16" r="5"><title>{item.errorDelta} errors at {new Date(item.timestamp).toLocaleString()}</title></circle>}{Number(item.discardDelta??0)>0&&<circle className="chart-discard-point" cx={x} cy="34" r="5"><title>{item.discardDelta} discards at {new Date(item.timestamp).toLocaleString()}</title></circle>}</Fragment>})}</svg><div className="chart-axis"><span>{new Date(start).toLocaleString()}</span><span>{new Date(end).toLocaleString()}</span></div>{firstSample!==null&&firstSample-start>300_000&&<p className="chart-coverage">Recorded data begins {new Date(firstSample).toLocaleString()}; the earlier part of this window has no samples.</p>}{kind==="interface"&&<><div className="chart-legend"><span className="in">Inbound</span><span className="out">Outbound</span><span className="errors">Errors ({errorTotal})</span><span className="discards">Discards ({discardTotal})</span></div>{errorTotal===0&&discardTotal===0&&<p className="chart-events-empty">No errors or discards recorded in this window.</p>}</>}</>}

function LogsPage(){const [tab,setTab]=useState<"system"|"syslog"|"os">("system"),[logs,setLogs]=useState<SystemLog[]>([]),[nodes,setNodes]=useState<LogNode[]>([]),[level,setLevel]=useState("all"),[node,setNode]=useState(""),[search,setSearch]=useState(""),[hours,setHours]=useState(24),[groupSeconds,setGroupSeconds]=useState(3600),[loading,setLoading]=useState(false);async function load(){setLoading(true);const from=new Date(Date.now()-hours*3600000).toISOString(),params=new URLSearchParams({level,deviceId:node,search,from,groupSeconds:String(groupSeconds),limit:"300"}),response=await fetch(`/api/system-logs?${params}`);if(response.ok)setLogs(await response.json());setLoading(false);}useEffect(()=>{void fetch('/api/system-logs/nodes').then(r=>r.json()).then(setNodes);},[]);useEffect(()=>{if(tab==="system")void load();},[tab,level,node,hours,groupSeconds]);return <section className="logs-page"><div className="backup-tabs"><button className={tab==="system"?"active":""} onClick={()=>setTab("system")}>System logs</button><button className={tab==="syslog"?"active":""} onClick={()=>setTab("syslog")}>Syslog <b>Future</b></button><button className={tab==="os"?"active":""} onClick={()=>setTab("os")}>OS logs <b>Future</b></button></div>{tab!=="system"?<Panel title={tab==="syslog"?"Syslog ingestion":"Operating system logs"} subtitle="Reserved for a future collector and searchable log store" className="full-panel"><div className="logs-placeholder"><FileText/><strong>Collector not enabled yet</strong></div></Panel>:<><form className="log-toolbar" onSubmit={event=>{event.preventDefault();void load();}}><Search size={15}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search node, address, message or category"/><select value={node} onChange={event=>setNode(event.target.value)}><option value="">All nodes</option>{nodes.map(item=><option key={item.id} value={item.id}>{item.name} · {item.address}</option>)}</select><select value={level} onChange={event=>setLevel(event.target.value)}><option value="all">All levels</option><option value="error">Errors</option><option value="warn">Warnings</option><option value="info">Information</option><option value="debug">Debug</option></select><select value={hours} onChange={event=>setHours(Number(event.target.value))}><option value={1}>Last hour</option><option value={6}>Last 6 hours</option><option value={24}>Last 24 hours</option><option value={168}>Last 7 days</option><option value={720}>Last 30 days</option></select><select value={groupSeconds} onChange={event=>setGroupSeconds(Number(event.target.value))}><option value={0}>Do not group</option><option value={300}>Group within 5 min</option><option value={3600}>Group within 1 hour</option><option value={86400}>Group within 1 day</option></select><button className="secondary"><RefreshCw size={14}/>{loading?"Loading…":"Search"}</button></form><Panel title="System activity" subtitle={`${logs.length} matching event groups`} className="full-panel"><div className="system-log-list">{logs.map(item=><article key={item.id} className={`log-${item.level}`}><time>{new Date(item.createdAt).toLocaleString()}</time><span className="log-level">{item.level}</span><div><strong>{item.deviceName?`${item.deviceName} · ${item.deviceAddress}`:`Platform · ${item.source}`} {item.count>1&&<b className="log-count">×{item.count}</b>}</strong><small>{item.source} · {item.category}{item.count>1?` · first seen ${new Date(item.firstSeenAt).toLocaleString()}`:""}</small><p>{item.message}</p></div></article>)}{!logs.length&&<div className="logs-placeholder"><ShieldCheck/><strong>No matching system events</strong></div>}</div></Panel></>}</section>}

function BackupsPage({devices,credentials,canEdit}:{devices:MonitoringDevice[];credentials:StoredCredential[];canEdit:boolean}){
  const [tab,setTab]=useState<"overview"|"jobs"|"profiles">("overview"),[profiles,setProfiles]=useState<BackupProfile[]>([]),[jobs,setJobs]=useState<BackupJob[]>([]),[summary,setSummary]=useState<BackupSummary>({total:0,enabled:0,healthy:0,failed:0,pending:0,recent:[]}),[profileKind,setProfileKind]=useState<"network_script"|"server_files">("network_script"),[message,setMessage]=useState("");
  async function load(){const [a,b,c]=await Promise.all([fetch("/api/backups/summary"),fetch("/api/backups/profiles"),fetch("/api/backups/jobs")]);if(a.ok)setSummary(await a.json());if(b.ok)setProfiles(await b.json());if(c.ok)setJobs(await c.json());}
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),10_000);return()=>clearInterval(timer)},[]);
  async function createProfile(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form),response=await fetch("/api/backups/profiles",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:data.get("name"),description:data.get("description"),kind:data.get("kind"),script:data.get("script")??"",paths:String(data.get("paths")??"").split("\n").map(v=>v.trim()).filter(Boolean)})});if(response.ok){form.reset();setProfileKind("network_script");setMessage("Backup profile created");await load();}else setMessage((await response.json()).error??"Unable to create profile");}
  async function createJob(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form),response=await fetch("/api/backups/jobs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:data.get("name"),profileId:data.get("profileId"),deviceId:data.get("deviceId"),credentialId:data.get("credentialId"),sshPort:Number(data.get("sshPort")),intervalSeconds:Number(data.get("intervalSeconds")),retentionCount:Number(data.get("retentionCount")),enabled:true})});if(response.ok){form.reset();setMessage("Backup job created and queued");await load();}else setMessage((await response.json()).error??"Unable to create job");}
  async function action(url:string,options?:RequestInit){const response=await fetch(url,options);if(!response.ok)setMessage((await response.json()).error??"Backup action failed");await load();}
  return <section className="backup-page"><div className="backup-tabs"><button className={tab==="overview"?"active":""} onClick={()=>setTab("overview")}>Overview</button><button className={tab==="jobs"?"active":""} onClick={()=>setTab("jobs")}>Jobs <b>{jobs.length}</b></button><button className={tab==="profiles"?"active":""} onClick={()=>setTab("profiles")}>Backup profiles <b>{profiles.length}</b></button></div>{message&&<div className="info-strip"><HardDriveDownload/><div><strong>Backups</strong><p>{message}</p></div></div>}
  {tab==="overview"&&<><div className="backup-summary"><article><small>ENABLED JOBS</small><strong>{summary.enabled}</strong><span>{summary.total} configured</span></article><article><small>HEALTHY</small><strong>{summary.healthy}</strong><span>Last run successful</span></article><article className={summary.failed?"danger":""}><small>FAILED</small><strong>{summary.failed}</strong><span>Needs attention</span></article><article><small>QUEUED / NEW</small><strong>{summary.pending}</strong><span>Awaiting a worker</span></article></div><Panel title="Recent backup activity" subtitle="Latest scheduled and manual runs" className="full-panel"><div className="table-wrap"><table><thead><tr><th>JOB</th><th>TARGET</th><th>STATE</th><th>STARTED</th><th>SIZE</th><th></th></tr></thead><tbody>{summary.recent.map(run=><tr key={run.id}><td><strong>{run.jobName}</strong><small className="account-email">{run.message}</small></td><td>{run.deviceName}</td><td><StatusBadge status={run.state}/></td><td>{relativeTime(run.createdAt)}</td><td>{run.sizeBytes?`${(Number(run.sizeBytes)/1024).toFixed(1)} KB`:"—"}</td><td>{run.state==="success"&&<a className="backup-download" href={`/api/backups/runs/${run.id}/download`}>Download</a>}</td></tr>)}{!summary.recent.length&&<tr><td colSpan={6} className="empty-row">No backup runs yet.</td></tr>}</tbody></table></div></Panel></>}
  {tab==="jobs"&&<><Panel title="Scheduled backup jobs" subtitle="Targets, schedules and latest result" className="full-panel"><div className="table-wrap"><table><thead><tr><th>JOB</th><th>TARGET</th><th>SCHEDULE</th><th>LAST RESULT</th><th>NEXT RUN</th><th></th></tr></thead><tbody>{jobs.map(job=><tr key={job.id}><td><strong>{job.name}</strong><small className="account-email">{job.profileName} · keep {job.retentionCount}</small></td><td>{job.deviceName}<small className="account-email">{job.credentialName} · SSH {job.sshPort}</small></td><td>Every {Math.round(job.intervalSeconds/60)} min</td><td><StatusBadge status={job.lastStatus}/><small className="account-email">{job.lastMessage}</small></td><td>{job.enabled?relativeTime(job.nextRunAt):"Disabled"}</td><td><div className="row-actions"><button className="icon-button" title="Run now" onClick={()=>void action(`/api/backups/jobs/${job.id}/run`,{method:"POST"})}><RefreshCw size={14}/></button><button className="secondary" onClick={()=>void action(`/api/backups/jobs/${job.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({enabled:!job.enabled})})}>{job.enabled?"Pause":"Enable"}</button>{canEdit&&<button className="icon-button danger" title="Delete job" onClick={()=>confirm("Delete this backup job and its history?")&&void action(`/api/backups/jobs/${job.id}`,{method:"DELETE"})}><Trash2 size={14}/></button>}</div></td></tr>)}</tbody></table></div></Panel>{canEdit&&<Panel title="Create backup job" subtitle="Apply a reusable profile to a device and schedule" className="full-panel"><form className="backup-form" onSubmit={createJob}><label>Job name<input name="name" required placeholder="Core switch nightly"/></label><label>Profile<select name="profileId" required><option value="">Select profile</option>{profiles.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Device<select name="deviceId" required><option value="">Select device</option>{devices.map(item=><option value={item.id} key={item.id}>{item.name} · {item.address}</option>)}</select></label><label>Credential<select name="credentialId" required><option value="">Select credential</option>{credentials.map(item=><option value={item.id} key={item.id}>{item.name} · {item.username}</option>)}</select></label><label>SSH port<input name="sshPort" type="number" defaultValue="22" min="1" max="65535" required/></label><label>Run every<select name="intervalSeconds" defaultValue="86400"><option value="900">15 minutes</option><option value="3600">Hour</option><option value="21600">6 hours</option><option value="43200">12 hours</option><option value="86400">Day</option><option value="604800">Week</option></select></label><label>Backups to retain<input name="retentionCount" type="number" min="1" max="1000" defaultValue="30" required/></label><button className="primary"><Plus size={15}/> Create job</button></form></Panel>}</>}
  {tab==="profiles"&&<><div className="backup-profile-grid">{profiles.map(profile=><article key={profile.id}><span className={`backup-kind ${profile.kind}`}><HardDriveDownload size={17}/></span><div><h3>{profile.name}</h3><p>{profile.description||"No description"}</p><small>{profile.kind==="network_script"?"Network command script":`${profile.paths.length} server paths`} · {profile.jobCount} jobs</small></div>{canEdit&&<button className="icon-button danger" disabled={profile.jobCount>0} title={profile.jobCount?"Remove linked jobs first":"Delete profile"} onClick={()=>void action(`/api/backups/profiles/${profile.id}`,{method:"DELETE"})}><Trash2 size={14}/></button>}</article>)}</div>{canEdit&&<Panel title="Create backup profile" subtitle="Commands run on the target device; server paths are archived over SSH" className="full-panel"><form className="backup-profile-form" onSubmit={createProfile}><label>Profile name<input name="name" required placeholder="Cisco IOS running config"/></label><label>Type<select name="kind" value={profileKind} onChange={event=>setProfileKind(event.target.value as typeof profileKind)}><option value="network_script">Network device script</option><option value="server_files">Server files and folders</option></select></label><label className="wide">Description<input name="description" placeholder="What this profile protects"/></label>{profileKind==="network_script"?<label className="wide">Remote command script<textarea name="script" rows={8} required placeholder={"terminal length 0\nshow running-config"}/><small>Executed through the selected device credential. Nothing runs on the HedgeSight host.</small></label>:<label className="wide">Paths, one per line<textarea name="paths" rows={8} required placeholder={"/etc\n/opt/my-app/config"}/><small>The remote worker creates a compressed tar archive. The initial encrypted artifact limit is 8 MB.</small></label>}<button className="primary"><Plus size={15}/> Save profile</button></form></Panel>}</>}
  </section>;
}
function incidentStatus(status: string) {
  return status === "pending_investigation"
    ? "Pending investigation"
    : status === "under_investigation"
      ? "Under investigation"
      : status;
}
function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </article>
  );
}
function DeviceTable({
  summary,
  loading,
}: {
  summary: DashboardSummary;
  loading: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>DEVICE</th>
            <th>ADDRESS</th>
            <th>CHECKS</th>
            <th>LAST RESPONSE</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={5} className="empty">
                Loading infrastructure…
              </td>
            </tr>
          )}
          {!loading && summary.devices.length === 0 && (
            <tr>
              <td colSpan={5} className="empty">
                No devices yet. Add your first monitored device.
              </td>
            </tr>
          )}
          {summary.devices.map((device) => (
            <tr key={device.id}>
              <td>
                <span className="device-icon">
                  <Server size={17} />
                </span>
                <strong>{device.name}</strong>
              </td>
              <td className="mono">{device.address}</td>
              <td>{device.checks}</td>
              <td>{relativeTime(device.lastSeenAt)}</td>
              <td>
                <StatusBadge status={device.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function WorkerList({ summary }: { summary: DashboardSummary }) {
  return (
    <>
      <div className="worker-list">
        {summary.workers.length === 0 && (
          <div className="empty worker-empty">
            Waiting for a worker to connect…
          </div>
        )}
        {summary.workers.map((worker) => (
          <div className="worker" key={worker.id}>
            <span className={`worker-symbol ${worker.status}`}>
              <Box size={18} />
            </span>
            <div>
              <strong>{worker.name}</strong>
              <small>
                v{worker.version} · {relativeTime(worker.lastSeenAt)}
              </small>
            </div>
            <StatusBadge status={worker.status === "online" ? "up" : "down"} />
          </div>
        ))}
      </div>
      <div className="secure">
        <ShieldCheck size={18} />
        <div>
          <strong>Outbound-only connection</strong>
          <small>Workers never access the database directly.</small>
        </div>
      </div>
    </>
  );
}
function InfrastructureTopology({summary}:{summary:DashboardSummary}){
  type DatabaseTable={schema:string;name:string;estimatedRows:string;totalBytes:string;dataBytes:string;indexBytes:string};
  const [tables,setTables]=useState<DatabaseTable[]|null>(null),[tableLoading,setTableLoading]=useState(false),[tableError,setTableError]=useState("");
  const {application,database}=summary.infrastructure;
  const bytes=(value:number|string)=>{const amount=Number(value);if(!amount)return "0 MB";if(amount>=1_073_741_824)return `${(amount/1_073_741_824).toFixed(1)} GB`;return `${(amount/1_048_576).toFixed(1)} MB`;};
  const percent=(value:number)=>`${Number(value||0).toFixed(1)}%`;
  async function inspectDatabase(){setTableLoading(true);setTableError("");try{const response=await fetch("/api/platform/database-tables");const payload=await response.json();if(!response.ok)throw new Error(payload.error??"Unable to inspect database tables");setTables(payload.tables);}catch(error){setTableError(error instanceof Error?error.message:"Unable to inspect database tables");setTables([]);}finally{setTableLoading(false);}}
  return <><div className="topology-shell">
    <div className="topology-live"><span className="pulse"/><strong>LIVE</strong><small>Updated {relativeTime(summary.infrastructure.sampledAt)}</small></div>
    <div className="topology-map">
      <article className="topology-node topology-app">
        <div className="topology-node-head"><span><Server size={20}/></span><div><small>APPLICATION</small><h3>HedgeSight App</h3><p>{application.hostname} · v{application.version}</p></div><StatusBadge status="up"/></div>
        <dl><div><dt>HOST LOAD</dt><dd>{application.load1.toFixed(2)} <small>/ {application.cpuCount} CPU</small></dd></div><div><dt>HOST MEMORY</dt><dd>{percent(application.memoryUsedPercent)}</dd></div><div><dt>APP MEMORY</dt><dd>{bytes(application.memoryBytes)}</dd></div><div><dt>APP UPTIME</dt><dd>{availabilityDuration(String(application.uptimeSeconds))}</dd></div></dl>
      </article>
      <div className="topology-link topology-db-link"><span>PostgreSQL</span></div>
      <article className="topology-node topology-db">
        <div className="topology-node-head"><span><Database size={20}/></span><div><small>DATA STORE</small><h3>PostgreSQL</h3><p>{database.hostname}</p></div><StatusBadge status="up"/></div>
        <dl><div><dt>DATABASE SIZE</dt><dd>{bytes(database.sizeBytes)}</dd></div><div><dt>CONNECTIONS</dt><dd>{database.activeConnections} <small>/ {database.maxConnections}</small></dd></div><div><dt>TRANSACTIONS</dt><dd>{Number(database.transactions).toLocaleString()}</dd></div><div><dt>CACHE HIT</dt><dd>{percent(database.cacheHitPercent)}</dd></div></dl>
        <button className="topology-inspect" onClick={()=>void inspectDatabase()} disabled={tableLoading}><Search size={14}/>{tableLoading?"Inspecting…":"Inspect table usage"}</button>
      </article>
      <div className="topology-link topology-worker-link"><span>HTTPS · outbound</span></div>
      <section className="topology-workers">
        {summary.workers.map(worker=>{const metrics=worker.runtimeMetrics as Record<string,unknown>;return <article className={`topology-node topology-worker ${worker.status}`} key={worker.id}>
          <div className="topology-node-head"><span><Box size={19}/></span><div><small>EXECUTION NODE</small><h3>{worker.name}</h3><p>{String(metrics.hostname??"Host unknown")} · v{worker.version}</p></div><StatusBadge status={worker.status==="online"?"up":"down"}/></div>
          <dl><div><dt>LOAD</dt><dd>{Number(metrics.load1??0).toFixed(2)} <small>/ {String(metrics.cpuCount??"—")} CPU</small></dd></div><div><dt>MEMORY</dt><dd>{percent(Number(metrics.memoryUsedPercent??0))}</dd></div><div><dt>UPTIME</dt><dd>{availabilityDuration(String(metrics.uptimeSeconds??0))}</dd></div><div><dt>LAST HEARTBEAT</dt><dd>{relativeTime(worker.lastSeenAt)}</dd></div></dl>
          <div className="topology-capabilities">{worker.capabilities.map(item=><span key={item}>{item}</span>)}</div>
        </article>})}
        {!summary.workers.length&&<div className="topology-empty"><Box/><strong>No workers connected</strong><small>Waiting for an authenticated worker heartbeat.</small></div>}
      </section>
    </div>
    <div className="topology-note"><ShieldCheck size={17}/><span>Workers connect outbound to the application API. Database credentials and direct database access remain isolated to the application.</span></div>
  </div>{tables!==null&&<div className="modal-backdrop" onMouseDown={()=>setTables(null)}><section className="modal wide-modal database-inspector" role="dialog" aria-modal="true" aria-labelledby="database-inspector-title" onMouseDown={event=>event.stopPropagation()}><button className="modal-close" onClick={()=>setTables(null)} aria-label="Close database inspection"><X/></button><p className="eyebrow">POSTGRESQL STORAGE</p><h2 id="database-inspector-title">Database table usage</h2><p>Physical storage used by HedgeSight tables and their indexes, largest first.</p>{tableError&&<div className="error">{tableError}</div>}<div className="database-inspector-summary"><article><small>DATABASE</small><strong>{bytes(database.sizeBytes)}</strong></article><article><small>USER TABLES</small><strong>{tables.length}</strong></article><article><small>TABLE STORAGE</small><strong>{bytes(tables.reduce((total,item)=>total+Number(item.totalBytes),0))}</strong></article></div><div className="table-wrap"><table><thead><tr><th>TABLE</th><th>EST. ROWS</th><th>DATA</th><th>INDEXES</th><th>TOTAL</th></tr></thead><tbody>{tables.map(item=>{const largest=Number(tables[0]?.totalBytes??1);return <tr key={`${item.schema}.${item.name}`}><td><strong>{item.name}</strong><small className="account-email">{item.schema}</small><i className="database-size-bar" style={{width:`${Math.max(2,Number(item.totalBytes)/largest*100)}%`}}/></td><td>{Number(item.estimatedRows).toLocaleString()}</td><td>{bytes(item.dataBytes)}</td><td>{bytes(item.indexBytes)}</td><td><strong>{bytes(item.totalBytes)}</strong></td></tr>})}{!tables.length&&!tableError&&<tr><td colSpan={5} className="empty-row">No user tables were found.</td></tr>}</tbody></table></div></section></div>}</>;
}
function IncidentList({
  summary,
  onOpen,
}: {
  summary: DashboardSummary;
  onOpen?: (id: string) => void;
}) {
  if (summary.recentIncidents.length === 0)
    return (
      <div className="calm">
        <ShieldCheck />
        <strong>All quiet</strong>
        <p>No incidents have been recorded.</p>
      </div>
    );
  const row = (incident: DashboardSummary["recentIncidents"][number]) => (
    <div key={incident.id}>
      <span
        className={`status-dot ${incident.status === "resolved" ? "up" : "down"}`}
      />
      <div>
        <strong>{incident.deviceName}</strong>
        <p>
          {incident.checkName}
          {incident.investigatorName
            ? ` · ${incident.investigatorName} investigating`
            : ""}
        </p>
        {incident.coveredByChange && (
          <span className="incident-change-coverage">
            <Wrench size={11} /> Covered by {incident.changeReference}
            {incident.changeManagerName ? ` · ${incident.changeManagerName}` : ""}
          </span>
        )}
      </div>
      <span className={`badge ${incident.status}`}>
        <i />
        {incidentStatus(incident.status)}
      </span>
      <time>{relativeTime(incident.openedAt)}</time>
      {onOpen && (
        <button className="incident-open" onClick={() => onOpen(incident.id)}>
          Open incident <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
  const active = summary.recentIncidents.filter(
      (item) => item.status !== "resolved",
    ),
    resolved = summary.recentIncidents.filter(
      (item) => item.status === "resolved",
    );
  return (
    <div className="incident-list">
      {active.length ? (
        active.map(row)
      ) : (
        <div className="calm compact">
          <ShieldCheck />
          <strong>No active incidents</strong>
        </div>
      )}
      {resolved.length > 0 && (
        <details className="resolved-incidents">
          <summary>
            <span>Recently resolved</span>
            <b>{resolved.length}</b>
            <ChevronDown size={15} />
          </summary>
          {resolved.map(row)}
        </details>
      )}
    </div>
  );
}
function Sparkline({ points }: { points: MonitoringDevice["history"] }) {
  const maximum = Math.max(...points.map((point) => point.latencyMs ?? 0), 1);
  if (!points.length)
    return (
      <div className="sparkline empty-spark">
        <span>Waiting for samples</span>
      </div>
    );
  return (
    <div
      className="sparkline"
      aria-label={`${points.length} response-time samples`}
    >
      {points.map((point, index) => (
        <i
          key={`${point.timestamp}-${index}`}
          className={point.status === "up" ? "" : "failed"}
          style={{
            height: `${Math.max(8, ((point.latencyMs ?? 0) / maximum) * 100)}%`,
          }}
          title={`${point.latencyMs?.toFixed(1) ?? "No reply"} ms`}
        />
      ))}
    </div>
  );
}

function IncidentTimeline({
  incidents,
  onSelect,
}: {
  incidents: IncidentRecord[];
  onSelect: (start: Date, end: Date, label: string) => void;
}) {
  const end = new Date();
  end.setMinutes(0, 0, 0);
  end.setHours(end.getHours() + 1);
  const buckets = Array.from({ length: 30 }, (_, index) => {
    const start = new Date(end);
    start.setDate(start.getDate() - (29 - index));
    start.setHours(0, 0, 0, 0);
    const finish = new Date(start);
    finish.setDate(finish.getDate() + 1);
    const count = incidents.filter((item) => {
      const value = new Date(item.openedAt);
      return value >= start && value < finish;
    }).length;
    return { start, finish, count };
  });
  const max = Math.max(1, ...buckets.map((item) => item.count));
  return (
    <section className="incident-timeline-chart">
      <div>
        <p className="eyebrow">30-DAY ACTIVITY</p>
        <h2>Incident timeline</h2>
        <p>Click an event marker to filter incidents from that day.</p>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-rail">
          {buckets.map((bucket, index) => (
            <button
              key={bucket.start.toISOString()}
              className={bucket.count ? "has-events" : ""}
              onClick={() =>
                bucket.count &&
                onSelect(
                  bucket.start,
                  bucket.finish,
                  bucket.start.toLocaleDateString(),
                )
              }
              disabled={!bucket.count}
              title={`${bucket.count} incidents · ${bucket.start.toLocaleDateString()}`}
            >
              <i
                style={{
                  width: `${8 + (bucket.count / max) * 18}px`,
                  height: `${8 + (bucket.count / max) * 18}px`,
                }}
              >
                {bucket.count || ""}
              </i>
              {index % 5 === 0 && (
                <span>
                  {bucket.start.toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function MajorIncidentPanel({
  majors,
  onDeclare,
  onOpen,
}: {
  majors: MajorIncident[];
  onDeclare: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <Panel
      title="Major incidents"
      subtitle="Coordinate related device incidents under one shared operational event"
      className="full-panel"
    >
      <div className="major-tab-toolbar">
        <span>
          {majors.filter((item) => item.status !== "resolved").length} active
          major incidents
        </span>
        <button className="primary" onClick={onDeclare}>
          <Plus size={15} /> Declare major incident
        </button>
      </div>
      <div className="major-list major-list-tab">
        {majors.filter(item=>!item.archivedAt).length === 0 ? (
          <div className="chat-empty">
            No major incidents have been declared.
          </div>
        ) : (
          majors.filter(item=>!item.archivedAt).map((item) => (
            <button key={item.id} onClick={() => onOpen(item.id)}>
              <span className={`major-severity ${item.severity}`}>
                {item.reference}
              </span>
              <strong>{item.title}</strong>
              <small>
                {item.incidentCount} linked · {item.updateCount} updates ·{" "}
                {item.ownerName || "Unassigned"}
              </small>
              <StatusBadge status={item.status} />
            </button>
          ))
        )}
      </div>
    </Panel>
  );
}

function MajorIncidentGroup({
  major,
  members,
  onOpenIncident,
  onOpenMajor,
  onUpdate,
  onResolve,
}: {
  major: MajorIncident;
  members: IncidentRecord[];
  onOpenIncident: (id: string) => void;
  onOpenMajor: (id: string) => void;
  onUpdate: (id: string, event: FormEvent<HTMLFormElement>) => void;
  onResolve: (id: string) => void;
}) {
  const unresolved = members.filter((item) => item.status !== "resolved"),
    waiting = unresolved.filter((item) => !item.recoveredAt);
  const ready =
    members.length > 0 &&
    waiting.length === 0 &&
    major.updateCount > 0 &&
    major.status !== "resolved";
  return (
    <details
      className={`mi-incident-group ${major.severity}`}
      open={major.status !== "resolved"}
    >
      <summary>
        <span className="major-severity">{major.reference}</span>
        <div>
          <strong>{major.title}</strong>
          <small>
            {members.length} linked incidents ·{" "}
            {major.ownerName || "Unassigned"}
          </small>
        </div>
        <StatusBadge status={major.status} />
        <span className="mi-expand">
          <ChevronDown size={16} />
        </span>
      </summary>
      <div className="mi-group-controls">
        <form onSubmit={(event) => onUpdate(major.id, event)}>
          <input
            name="body"
            required
            maxLength={4000}
            placeholder="Post a shared MI update…"
          />
          <button className="secondary">Add update</button>
        </form>
        <button className="secondary" onClick={() => onOpenMajor(major.id)}>
          Open MI
        </button>
        <button
          className="primary"
          disabled={!ready}
          onClick={() => onResolve(major.id)}
          title={
            waiting.length
              ? `${waiting.length} linked incidents are still unavailable`
              : major.updateCount === 0
                ? "Add an MI update first"
                : "Resolve all linked incidents"
          }
        >
          <ShieldCheck size={14} /> Resolve all incidents
        </button>
      </div>
      <div className="mi-child-list">
        {members.map((item) => (
          <article key={item.id}>
            <span
              className={`status-dot ${item.status === "resolved" ? "up" : "down"}`}
            />
            <div>
              <strong>{item.deviceName}</strong>
              <small>
                {item.checkName} · {relativeTime(item.openedAt)}
              </small>
            </div>
            <span className={`badge ${item.status}`}>
              <i />
              {incidentStatus(item.status)}
            </span>
            <button
              className="incident-open"
              onClick={() => onOpenIncident(item.id)}
            >
              Open incident <ArrowRight size={14} />
            </button>
          </article>
        ))}
      </div>
    </details>
  );
}

function IncidentHistoryTable({
  incidents,
  onOpen,
}: {
  incidents: IncidentRecord[];
  onOpen: (id: string) => void;
}) {
  return (
    <Panel
      title="Incident history"
      subtitle={`${incidents.length} archived incident${incidents.length === 1 ? "" : "s"}`}
      className="full-panel"
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>DEVICE</th>
              <th>OPENED</th>
              <th>RESOLVED</th>
              <th>ARCHIVED</th>
              <th>UPDATES</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {incidents.length ? (
              incidents.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.deviceName}</strong>
                    <small className="account-email">{item.address}</small>
                  </td>
                  <td>{new Date(item.openedAt).toLocaleString()}</td>
                  <td>
                    {item.resolvedAt
                      ? new Date(item.resolvedAt).toLocaleString()
                      : "—"}
                  </td>
                  <td>
                    {item.archivedAt ? relativeTime(item.archivedAt) : "—"}
                  </td>
                  <td>{item.updateCount}</td>
                  <td>
                    <button
                      className="incident-open"
                      onClick={() => onOpen(item.id)}
                    >
                      Open incident <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="empty">
                  No archived incidents match this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

type AuthStatus = { setupRequired: boolean; oidcEnabled: boolean; localAccountsEnabled: boolean };
type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};
type PublicStatus = {
  overallStatus: string;
  counts: {
    up: number;
    down: number;
    degraded: number;
    unknown: number;
    maintenance: number;
    total: number;
  };
  activeIncidents: number;
  incidents:Array<{id:string;status:string;openedAt:string;recoveredAt:string|null;publicMessage:string|null;updatedAt:string|null}>;
  changes:Array<{changeReference:string;publicDescription:string;startedAt:string;estimatedEndAt:string;status:"scheduled"|"active";deviceCount:number}>;
  lastUpdated: string;
};

function PublicHealth() {
  const [status, setStatus] = useState<PublicStatus | null>(null);
  useEffect(() => {
    const load = () =>
      void fetch("/api/public/status")
        .then((r) => r.json())
        .then(setStatus);
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, []);
  const alertingTotal=status?status.counts.total-status.counts.maintenance:0;
  const healthy = alertingTotal
    ? Math.round(((status?.counts.up??0) / alertingTotal) * 100)
    : 0;
  return (
    <div className="public-shell">
      <header className="public-nav">
        <div className="brand">
          <div className="brandmark">
            <img src="/hedgesight-icon.svg" alt="" />
          </div>
          <span>
            Hedge<span>Sight</span>
          </span>
        </div>
        <a className="secondary" href="/login">
          Sign in
        </a>
      </header>
      <main className="public-main">
        <p className="eyebrow">PUBLIC NETWORK HEALTH</p>
        <h1>
          {status?.overallStatus === "operational"
            ? "All monitored systems are operational."
            : status?.overallStatus === "outage"
              ? "Some monitored systems are unavailable."
              : "Network health is being assessed."}
        </h1>
        <p className="public-intro">
          A privacy-safe overview of current service availability. Device names,
          addresses and infrastructure details are never shown here.
        </p>
        <section className="public-status">
          <article
            className={`health-banner ${status?.overallStatus ?? "unknown"}`}
          >
            <span className="pulse" />
            <div>
              <strong>{status?.overallStatus ?? "Loading"}</strong>
              <small>
                Last refreshed{" "}
                {status ? relativeTime(status.lastUpdated) : "now"}
              </small>
            </div>
            <b>{healthy}% healthy</b>
          </article>
          <div className="public-counts">
            <article>
              <span className="status-dot up" />
              <strong>{status?.counts.up ?? "—"}</strong>
              <small>UP</small>
            </article>
            <article>
              <span className="status-dot down" />
              <strong>{status?.counts.down ?? "—"}</strong>
              <small>DOWN</small>
            </article>
            <article>
              <span className="status-dot maintenance" />
              <strong>{status?.counts.maintenance ?? 0}</strong>
              <small>MAINTENANCE</small>
            </article>
            <article>
              <Bell />
              <strong>{status?.activeIncidents ?? "—"}</strong>
              <small>ACTIVE INCIDENTS</small>
            </article>
          </div>
          <section className="public-incidents">
            <div><p className="eyebrow">SERVICE NOTICES</p><h2>Current incidents</h2><span>Published information about active service disruption.</span></div>
            {status?.incidents.length?status.incidents.map(incident=><article key={incident.id}><span className={`public-incident-icon ${incident.recoveredAt?"recovering":"outage"}`}><Bell size={16}/></span><div><strong>{incident.recoveredAt?"Service recovery in progress":"Service disruption"}</strong><p>{incident.publicMessage||"We are aware of an availability issue. Further information will be published when available."}</p><small>Started {new Date(incident.openedAt).toLocaleString()} · {incident.recoveredAt?"monitoring recovery":"investigating"}</small>{incident.updatedAt&&<time>Updated {relativeTime(incident.updatedAt)}</time>}</div></article>):<div className="public-change-empty"><ShieldCheck size={18}/> No active service incidents.</div>}
          </section>
          <section className="public-changes">
            <div><p className="eyebrow">CHANGE CALENDAR</p><h2>Scheduled maintenance</h2><span>Change windows that may affect monitored availability.</span></div>
            {status?.changes.length?status.changes.map(change=><article key={`${change.changeReference}-${change.startedAt}`}><span className={`change-icon ${change.status}`}><Wrench size={16}/></span><div className="public-change-copy"><strong>{change.changeReference}</strong><p>{change.publicDescription||"Planned maintenance is underway. Further details have not been published."}</p><small>{change.deviceCount} monitored node{change.deviceCount===1?"":"s"} · {change.status}</small></div><div className="public-change-window"><time><small>STARTS</small><b>{new Date(change.startedAt).toLocaleDateString()}</b><span>{new Date(change.startedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span></time><i/><time><small>ESTIMATED END</small><b>{new Date(change.estimatedEndAt).toLocaleDateString()}</b><span>{new Date(change.estimatedEndAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span></time></div></article>):<div className="public-change-empty"><ShieldCheck size={18}/> No maintenance is currently scheduled.</div>}
          </section>
        </section>
      </main>
    </div>
  );
}

function Login({
  status,
  onAuthenticated,
}: {
  status: AuthStatus;
  onAuthenticated: () => void;
}) {
  const [error, setError] = useState(
    new URLSearchParams(location.search).has("error")
      ? "Single sign-on could not be completed."
      : "",
  );
  const [databaseSetup,setDatabaseSetup]=useState(false);
  const [databaseBusy,setDatabaseBusy]=useState(false);
  async function configureDatabase(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);setDatabaseBusy(true);const response=await fetch("/api/auth/database",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({connectionString:data.get("connectionString")})});if(response.ok){setError("");setTimeout(()=>location.reload(),2500);}else{setError((await response.json()).error??"Unable to connect to PostgreSQL");setDatabaseBusy(false);}}
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const endpoint = status.setupRequired ? "setup" : "login";
    const body = status.setupRequired
      ? {
          displayName: data.get("displayName"),
          email: data.get("email"),
          password: data.get("password"),
        }
      : { identifier: data.get("identifier"), password: data.get("password") };
    const response = await fetch(`/api/auth/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) onAuthenticated();
    else setError((await response.json()).error ?? "Unable to sign in");
  }
  return (
    <div className="login-shell">
      <section className="login-brand">
        <div className="brandmark">
          <img src="/hedgesight-icon.svg" alt="" />
        </div>
        <p className="eyebrow">ACTIVE MONITORING</p>
        <h1>
          See clearly.
          <br />
          Respond quickly.
        </h1>
        <p>Secure access to the HedgeSight monitoring control plane.</p>
        <a href="/status">
          <Eye size={16} /> View public network health
        </a>
      </section>
      <section className="login-card">
        <div>
          <p className="eyebrow">
            {status.setupRequired ? "FIRST RUN" : "WELCOME BACK"}
          </p>
          <h2>
            {status.setupRequired
              ? "Create the administrator"
              : "Sign in to HedgeSight"}
          </h2>
          <p>
            {status.setupRequired
              ? "No default credentials are used. This account will own the initial deployment."
              : "Use your local account or configured identity provider."}
          </p>
        </div>
        {error && <div className="error">{error}</div>}
        {status.setupRequired&&<button className="database-setup-toggle" onClick={()=>setDatabaseSetup(value=>!value)}><Database size={15}/>{databaseSetup?"Use bundled database":"Use remote PostgreSQL"}</button>}
        {status.setupRequired&&databaseSetup?<form onSubmit={configureDatabase} className="database-setup-form"><label>PostgreSQL connection URL<input name="connectionString" type="password" required placeholder="postgresql://user:password@db.example.com:5432/hedgesight" autoComplete="off"/></label><small>HedgeSight will test the connection, create its schema, store the URL securely, and restart.</small><button className="primary" disabled={databaseBusy}>{databaseBusy?"Connecting…":"Connect database"}<ArrowRight size={16}/></button></form>:
        (status.setupRequired || status.localAccountsEnabled) && <form onSubmit={submit}>
          {status.setupRequired && (
            <label>
              Display name
              <input name="displayName" required autoFocus />
            </label>
          )}
          <label>
            {status.setupRequired ? "Email address" : "Account name or email address"}
            <input
              name={status.setupRequired ? "email" : "identifier"}
              type={status.setupRequired ? "email" : "text"}
              required
              autoFocus={!status.setupRequired}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input name="password" type="password" minLength={12} required />
          </label>
          <button className="primary">
            {status.setupRequired ? "Create account" : "Sign in"}
            <ArrowRight size={16} />
          </button>
        </form>}
        {status.oidcEnabled && !status.setupRequired && (
          <>
            {status.localAccountsEnabled && <div className="login-divider">
              <span>or</span>
            </div>}
            <a className="oidc-button" href="/api/auth/oidc/start">
              Continue with single sign-on
            </a>
          </>
        )}
        <small className="login-note">
          <ShieldCheck size={14} /> Sessions use HTTP-only cookies.
        </small>
      </section>
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [checking, setChecking] = useState(true);
  async function check() {
    const [statusResponse, meResponse] = await Promise.all([
      fetch("/api/auth/status"),
      fetch("/api/auth/me"),
    ]);
    setStatus(await statusResponse.json());
    setUser(meResponse.ok ? (await meResponse.json()).user : null);
    setChecking(false);
  }
  useEffect(() => {
    void check();
  }, []);
  if (location.pathname === "/status") return <PublicHealth />;
  if (checking || !status)
    return (
      <div className="auth-loading">
        <Radar />
        <span>Loading HedgeSight…</span>
      </div>
    );
  if (!user)
    return <Login status={status} onAuthenticated={() => void check()} />;
  return (
    <PrivateApp
      user={user}
      onLogout={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        setUser(null);
      }}
    />
  );
}

export function VersionStamp() {
  const [build, setBuild] = useState<{ version: string; channel: string } | null>(null);
  useEffect(() => {
    void fetch("/api/version")
      .then(response => response.ok ? response.json() : null)
      .then(value => value && setBuild(value))
      .catch(() => undefined);
  }, []);
  if (!build) return null;
  const version = build.version.startsWith("edge-")
    ? `edge · ${build.version.slice(5, 12)}`
    : build.version;
  return <div className="version-stamp" title={`HedgeSight ${build.version} (${build.channel})`}>v{version}</div>;
}

export function PrivateApp({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  const hash = window.location.hash.slice(1) as View;
  const [view, setView] = useState<View>(
    Object.hasOwn(pageCopy, hash) ? hash : "overview",
  );
  const [summary, setSummary] = useState<DashboardSummary>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [retention, setRetention] = useState<Retention>({
    rawDays: 30,
    fiveMinuteDays: 90,
    hourlyDays: 365,
    dailyDays: 1825,
    incidentDays: 730,
    configurationDays: 365,
  });
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [retentionSaved, setRetentionSaved] = useState(false);
  const [logSettings,setLogSettings]=useState<{minimumLevel:"debug"|"info"|"warn"|"error";retentionDays:number}>({minimumLevel:"info",retentionDays:30});
  const [logSettingsSaved,setLogSettingsSaved]=useState(false);
  const [monitoring, setMonitoring] = useState<MonitoringDevice[]>([]);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [osFilter, setOsFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [newGroupName, setNewGroupName] = useState("");
  const [editing, setEditing] = useState<MonitoringDevice | null>(null);
  const [deviceEditTab,setDeviceEditTab]=useState<"general"|"monitoring">("general");
  const [monitoringPlatform,setMonitoringPlatform]=useState<"linux"|"vmware">("linux");
  const [deviceDetail,setDeviceDetail]=useState<MonitoringDevice|null>(null);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [interfaceStats, setInterfaceStats] = useState<
    Record<string, InterfaceStats[]>
  >({});
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("data");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [credentials,setCredentials]=useState<StoredCredential[]>([]);
  const [credentialError,setCredentialError]=useState("");
  const [databaseStatus,setDatabaseStatus]=useState<DatabaseStatus|null>(null);
  const [configurationMessage,setConfigurationMessage]=useState("");
  const [configurationBusy,setConfigurationBusy]=useState(false);
  const [authenticationSettings, setAuthenticationSettings] =
    useState<AuthenticationSettings | null>(null);
  const [accountError, setAccountError] = useState("");
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [authenticationMessage, setAuthenticationMessage] = useState("");
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [monitoringAlerts,setMonitoringAlerts]=useState<MonitoringAlert[]>([]);
  const [selectedIncident, setSelectedIncident] =
    useState<IncidentDetail | null>(null);
  const [incidentError, setIncidentError] = useState("");
  const [incidentWindow, setIncidentWindow] = useState<{
    start: Date;
    end: Date;
    label: string;
  } | null>(null);
  const [incidentDeviceFilter,setIncidentDeviceFilter]=useState<{id:string;name:string}|null>(null);
  const [majorIncidents, setMajorIncidents] = useState<MajorIncident[]>([]);
  const [selectedMajor, setSelectedMajor] =
    useState<MajorIncidentDetail | null>(null);
  const [incidentSectionTab, setIncidentSectionTab] = useState<
    "overview" | "incidents" | "major" | "history"
  >("overview");
  const [majorDialog, setMajorDialog] = useState(false);
  const [changeDialog,setChangeDialog]=useState(false);
  const [selectedDevices,setSelectedDevices]=useState<string[]>([]);
  const [changeManagers,setChangeManagers]=useState<ChangeManager[]>([]);
  const [changes,setChanges]=useState<ChangeRecord[]>([]);
  const [editingChange,setEditingChange]=useState<ChangeRecord|null>(null);
  const [changeError,setChangeError]=useState("");
  const [tasks,setTasks]=useState<TaskRecord[]>([]);
  const [taskLanes,setTaskLanes]=useState<TaskLane[]>([]);
  const [taskTags,setTaskTags]=useState<TaskTag[]>([]);
  const [laneEditor,setLaneEditor]=useState<{lane:TaskLane|null;name:string}|null>(null);
  const [tagDialog,setTagDialog]=useState(false);
  const [classifyingTask,setClassifyingTask]=useState<(TaskRecord&{selectedTagIds?:string[]})|null>(null);
  const [taskAssignees,setTaskAssignees]=useState<ChangeManager[]>([]);
  const [selectedTask,setSelectedTask]=useState<TaskDetail|null>(null);
  const [taskDialog,setTaskDialog]=useState(false);
  const [incidentTaskDialog,setIncidentTaskDialog]=useState(false);
  const [taskError,setTaskError]=useState("");
  const [chart,setChart]=useState<ChartRequest|null>(null);
  const [chartHours,setChartHours]=useState(24);
  const [chartData,setChartData]=useState<ChartPoint[]>([]);
  const [chartLoading,setChartLoading]=useState(false);

  async function refresh() {
    try {
      const [
        dashboardResponse,
        monitoringResponse,
        groupsResponse,
        incidentsResponse,
        majorResponse,
        managersResponse,
        changesResponse,
        tasksResponse,
        assigneesResponse,lanesResponse,tagsResponse,alertsResponse,
      ] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/monitoring"),
        fetch("/api/groups"),
        fetch("/api/incidents"),
        fetch("/api/major-incidents"),
        fetch("/api/change-managers"),
        fetch("/api/changes"),
        fetch("/api/tasks"),fetch("/api/task-assignees"),fetch("/api/task-lanes"),fetch("/api/task-tags"),fetch("/api/monitoring-alerts"),
      ]);
      if (
        !dashboardResponse.ok ||
        !monitoringResponse.ok ||
        !groupsResponse.ok ||
        !incidentsResponse.ok ||
        !majorResponse.ok
        || !managersResponse.ok || !changesResponse.ok || !tasksResponse.ok || !assigneesResponse.ok || !lanesResponse.ok || !tagsResponse.ok || !alertsResponse.ok
      )
        throw new Error("Dashboard is unavailable");
      setSummary(await dashboardResponse.json());
      setMonitoring(await monitoringResponse.json());
      setGroups(await groupsResponse.json());
      setIncidents(await incidentsResponse.json());
      setMajorIncidents(await majorResponse.json());
      setChangeManagers(await managersResponse.json());
      setChanges(await changesResponse.json());
      setTasks(await tasksResponse.json());setTaskAssignees(await assigneesResponse.json());setTaskLanes(await lanesResponse.json());setTaskTags(await tagsResponse.json());setMonitoringAlerts(await alertsResponse.json());
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load dashboard",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    void Promise.all([
      fetch("/api/retention")
        .then((r) => r.json())
        .then(setRetention),
      fetch("/api/storage/status")
        .then((r) => r.json())
        .then(setStorage),
      fetch("/api/settings/system-logs").then(r=>r.ok?r.json():null).then(value=>value&&setLogSettings(value)),
    ]);
  }, []);
  useEffect(() => {
    void Promise.all([
      fetch("/api/settings/accounts")
        .then((r) => (r.ok ? r.json() : []))
        .then(setAccounts),
      fetch("/api/settings/authentication")
        .then((r) => (r.ok ? r.json() : null))
        .then(setAuthenticationSettings),
      fetch("/api/credentials").then(r=>r.ok?r.json():[]).then(setCredentials),
      fetch("/api/settings/database").then(r=>r.ok?r.json():null).then(setDatabaseStatus),
    ]);
  }, []);
  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash.slice(1) as View;
      if (Object.hasOwn(pageCopy, next)) setView(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (!expandedDevice) return;
    const load = async () => {
      const response = await fetch(`/api/devices/${expandedDevice}/interfaces`);
      if (response.ok) {
        const items = await response.json();
        setInterfaceStats((current) => ({
          ...current,
          [expandedDevice]: items,
        }));
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [expandedDevice]);
  useEffect(()=>{if(!chart)return;let active=true;setChartLoading(true);const url=chart.kind==="interface"?`/api/interfaces/${chart.interfaceId}/history?resolution=raw&hours=${chartHours}`:`/api/devices/${chart.deviceId}/metric-history?key=${encodeURIComponent(chart.key??"")}&hours=${chartHours}`;fetch(url).then(response=>response.ok?response.json():[]).then(data=>{if(active)setChartData(data)}).finally(()=>{if(active)setChartLoading(false)});return()=>{active=false}},[chart,chartHours]);
  function navigate(next: View) {
    setView(next);
    window.location.hash = next;
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openDevice(device: MonitoringDevice) {
    setSearch(device.name);
    setStatusFilter("all");
    setOsFilter("all");
    setGroupFilter("all");
    navigate("devices");
  }
  function openDeviceIncidentHistory(device:MonitoringDevice){
    setIncidentDeviceFilter({id:device.id,name:device.name});setIncidentWindow(null);setIncidentSectionTab("history");setSelectedIncident(null);setSelectedMajor(null);navigate("incidents");
  }
  async function openIncident(id: string) {
    const response = await fetch(`/api/incidents/${id}`);
    if (response.ok) {
      setSelectedIncident(await response.json());
      setSelectedMajor(null);
      setIncidentError("");
      navigate("incidents");
    }
  }
  async function reloadIncident() {
    if (selectedIncident) await openIncident(selectedIncident.id);
    await refresh();
  }
  async function claimIncident() {
    if (!selectedIncident) return;
    const response = await fetch(
      `/api/incidents/${selectedIncident.id}/claim`,
      { method: "POST" },
    );
    if (response.ok) await reloadIncident();
    else setIncidentError((await response.json()).error);
  }
  async function addIncidentUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedIncident) return;
    const form = event.currentTarget;
    const body = new FormData(form).get("body");
    const response = await fetch(
      `/api/incidents/${selectedIncident.id}/updates`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      },
    );
    if (response.ok) {
      form.reset();
      await reloadIncident();
    } else setIncidentError((await response.json()).error);
  }
  async function savePublicIncidentMessage(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!selectedIncident)return;const form=event.currentTarget,data=new FormData(form);const response=await fetch(`/api/incidents/${selectedIncident.id}/public-message`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({message:data.get("message")})});if(response.ok){setIncidentError("");await openIncident(selectedIncident.id);}else setIncidentError((await response.json()).error??"Unable to publish incident message");}
  async function resolveIncident() {
    if (!selectedIncident) return;
    const response = await fetch(
      `/api/incidents/${selectedIncident.id}/resolve`,
      { method: "POST" },
    );
    if (response.ok) await reloadIncident();
    else setIncidentError((await response.json()).error);
  }
  async function openTask(id:string){const response=await fetch(`/api/tasks/${id}`);if(response.ok){setSelectedTask(await response.json());setTaskError("");}}
  async function createTask(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form);const response=await fetch("/api/tasks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title:data.get("title"),description:data.get("description"),assigneeId:data.get("assigneeId")||null,incidentIds:data.getAll("incidentIds")})});if(response.ok){form.reset();setTaskDialog(false);await refresh();}else setTaskError((await response.json()).error??"Unable to create task");}
  async function resolveWithTask(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!selectedIncident)return;const form=event.currentTarget,data=new FormData(form);const resolved=await fetch(`/api/incidents/${selectedIncident.id}/resolve`,{method:"POST"});if(!resolved.ok){setIncidentError((await resolved.json()).error);return;}const created=await fetch("/api/tasks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title:data.get("title"),description:data.get("description"),assigneeId:data.get("assigneeId")||null,incidentIds:[selectedIncident.id]})});if(created.ok){setIncidentTaskDialog(false);setSelectedIncident(null);await refresh();navigate("tasks");}else setIncidentError((await created.json()).error??"Incident resolved, but task creation failed");}
  async function moveTask(id:string,status:TaskStatus){const previous=tasks;setTasks(current=>current.map(item=>item.id===id?{...item,status}:item));const response=await fetch(`/api/tasks/${id}/status`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})});if(!response.ok)setTasks(previous);}
  async function saveTaskLane(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!laneEditor)return;const name=laneEditor.name.trim();if(!name)return;const response=await fetch(laneEditor.lane?`/api/task-lanes/${laneEditor.lane.key}`:'/api/task-lanes',{method:laneEditor.lane?'PUT':'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});if(response.ok){const lane=await response.json();setTaskLanes(current=>laneEditor.lane?current.map(item=>item.key===lane.key?lane:item):[...current,lane]);setLaneEditor(null);}}
  async function reorderTaskLane(index:number,direction:-1|1){const next=[...taskLanes],target=index+direction;if(target<0||target>=next.length)return;[next[index],next[target]]=[next[target],next[index]];setTaskLanes(next);const response=await fetch('/api/task-lane-order',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({keys:next.map(item=>item.key)})});if(!response.ok)await refresh();}
  async function createTaskTag(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form),response=await fetch('/api/task-tags',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:data.get('name'),color:data.get('color')})});if(response.ok){const tag=await response.json();setTaskTags(current=>[...current,tag]);form.reset();}}
  async function openTaskClassification(task:TaskRecord){const response=await fetch(`/api/tasks/${task.id}/classification`);if(response.ok){const value=await response.json();setClassifyingTask({...task,priority:value.priority,tags:value.tags,selectedTagIds:value.tags.map((tag:TaskTag)=>tag.id)});}}
  async function saveTaskClassification(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!classifyingTask)return;const data=new FormData(event.currentTarget),priority=data.get('priority') as Priority,tagIds=data.getAll('tagIds');const response=await fetch(`/api/tasks/${classifyingTask.id}/classification`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({priority,tagIds})});if(response.ok){setClassifyingTask(null);await refresh();}}
  async function setIncidentPriority(id:string,priority:Priority){const response=await fetch(`/api/incidents/${id}/priority`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({priority})});if(response.ok){if(selectedIncident?.id===id)setSelectedIncident({...selectedIncident,priority});await refresh();}}
  async function actOnMonitoringAlert(alert:MonitoringAlert,action:"dismiss"|"incident"|"task"){const response=await fetch(`/api/monitoring-alerts/${alert.id}/${action}`,{method:'POST'});if(!response.ok)return;const result=await response.json();await refresh();if(result.incidentId){setIncidentSectionTab('incidents');await openIncident(result.incidentId);}if(result.taskId){navigate('tasks');await openTask(result.taskId);}}
  async function archiveMajorIncident(id:string){const response=await fetch(`/api/major-incidents/${id}/archive`,{method:'POST'});if(response.ok){setSelectedMajor(null);await refresh();}}
  async function saveTask(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!selectedTask)return;const data=new FormData(event.currentTarget);const response=await fetch(`/api/tasks/${selectedTask.id}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({title:data.get("title"),description:data.get("description"),status:data.get("status"),assigneeId:data.get("assigneeId")||null})});if(response.ok){await refresh();await openTask(selectedTask.id);}}
  async function addTaskUpdate(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!selectedTask)return;const form=event.currentTarget,body=new FormData(form).get("body");if((await fetch(`/api/tasks/${selectedTask.id}/updates`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({body})})).ok){form.reset();await openTask(selectedTask.id);await refresh();}}
  async function linkTaskIncidents(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!selectedTask)return;const form=event.currentTarget,incidentIds=new FormData(form).getAll("incidentIds");if(!incidentIds.length)return;if((await fetch(`/api/tasks/${selectedTask.id}/incidents`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({incidentIds})})).ok){form.reset();await openTask(selectedTask.id);await refresh();}}
  async function archiveIncident(id: string) {
    const response = await fetch(`/api/incidents/${id}/archive`, {
      method: "POST",
    });
    if (response.ok) {
      setSelectedIncident(null);
      setIncidentSectionTab("history");
      await refresh();
    } else
      setIncidentError(
        (await response.json()).error ?? "Unable to archive incident",
      );
  }
  function openChangeDialog(deviceIds:string[]){setSelectedDevices(deviceIds);setChangeError("");setChangeDialog(true);}
  async function createChange(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const form=event.currentTarget,data=new FormData(form);
    const response=await fetch("/api/changes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({changeReference:data.get("changeReference"),publicDescription:data.get("publicDescription"),managerId:data.get("managerId"),deviceIds:selectedDevices,startedAt:new Date(String(data.get("startedAt"))).toISOString(),estimatedEndAt:new Date(String(data.get("estimatedEndAt"))).toISOString()})});
    if(response.ok){form.reset();setChangeDialog(false);setSelectedDevices([]);await refresh();}
    else setChangeError((await response.json()).error??"Unable to start change");
  }
  async function returnChange(id:string){
    if(!confirm("Return every node in this change to normal monitoring?"))return;
    const response=await fetch(`/api/changes/${id}/return`,{method:"POST"});
    if(response.ok)await refresh();else setError((await response.json()).error??"Unable to return nodes");
  }
  async function saveChange(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!editingChange)return;const data=new FormData(event.currentTarget);
    const response=await fetch(`/api/changes/${editingChange.id}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({changeReference:data.get("changeReference"),publicDescription:data.get("publicDescription"),managerId:data.get("managerId"),startedAt:new Date(String(data.get("startedAt"))).toISOString(),estimatedEndAt:new Date(String(data.get("estimatedEndAt"))).toISOString()})});
    if(response.ok){setEditingChange(null);setChangeError("");await refresh();}else setChangeError((await response.json()).error??"Unable to update change");
  }
  function toggleSelectedDevice(id:string){setSelectedDevices(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);}
  async function createMajorIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    const response = await fetch("/api/major-incidents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: data.get("title"),
        impact: data.get("impact"),
        severity: data.get("severity"),
        incidentIds: data.getAll("incidentIds"),
      }),
    });
    if (response.ok) {
      const created = await response.json();
      form.reset();
      setMajorDialog(false);
      await refresh();
      await openMajorIncident(created.id);
    }
  }
  async function openMajorIncident(id: string) {
    const response = await fetch(`/api/major-incidents/${id}`);
    if (response.ok) {
      setSelectedMajor(await response.json());
      setSelectedIncident(null);
      navigate("incidents");
    }
  }
  async function addMajorUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMajor) return;
    const form = event.currentTarget,
      body = new FormData(form).get("body");
    const response = await fetch(
      `/api/major-incidents/${selectedMajor.id}/updates`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      },
    );
    if (response.ok) {
      form.reset();
      await openMajorIncident(selectedMajor.id);
      await refresh();
    }
  }
  async function addGroupedMajorUpdate(
    id: string,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = event.currentTarget,
      body = new FormData(form).get("body");
    const response = await fetch(`/api/major-incidents/${id}/updates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (response.ok) {
      form.reset();
      setIncidentError("");
      await refresh();
    } else
      setIncidentError((await response.json()).error ?? "Unable to add update");
  }
  async function resolveMajorAndChildren(id: string) {
    if (!confirm("Resolve this major incident and all linked incidents?"))
      return;
    const response = await fetch(`/api/major-incidents/${id}/resolve-all`, {
      method: "POST",
    });
    if (response.ok) {
      setIncidentError("");
      await refresh();
    } else
      setIncidentError(
        (await response.json()).error ?? "Unable to resolve linked incidents",
      );
  }
  async function exportConfiguration(){const response=await fetch("/api/settings/configuration/export");if(!response.ok){setConfigurationMessage("Unable to export configuration");return;}const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`hedgesight-configuration-${new Date().toISOString().slice(0,10)}.json`;link.click();URL.revokeObjectURL(url);setConfigurationMessage("Configuration package downloaded.");}
  async function importConfiguration(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form),file=data.get("configuration") as File;if(!file?.size){setConfigurationMessage("Choose a HedgeSight configuration package first.");return;}setConfigurationBusy(true);setConfigurationMessage("Reading and validating configuration package…");try{const configuration=JSON.parse(await file.text());const response=await fetch("/api/settings/configuration/import",{method:"POST",headers:{"content-type":"application/json","accept":"application/json"},body:JSON.stringify({mode:data.get("mode"),configuration})});const text=await response.text();let result:{error?:string;imported?:number;missingCredentials?:number}={};try{result=text?JSON.parse(text):{};}catch{throw new Error(response.redirected||response.url.includes("/login")?"Your session expired. Sign in again before importing.":`Import returned an unexpected response (HTTP ${response.status}).`);}if(!response.ok)throw new Error(result.error??`Import failed with HTTP ${response.status}`);setConfigurationMessage(`Imported ${result.imported??0} nodes${result.missingCredentials?`; ${result.missingCredentials} SSH credential assignments need reconnecting`:""}.`);form.reset();await refresh();}catch(error){setConfigurationMessage(error instanceof SyntaxError?"The selected file is not valid JSON.":error instanceof Error?error.message:"Unable to read configuration package");}finally{setConfigurationBusy(false);}}
  async function switchDatabase(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);if(!confirm("Switch HedgeSight to this PostgreSQL database? The application will restart and data is not copied automatically."))return;const response=await fetch("/api/settings/database",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({connectionString:data.get("connectionString"),confirmed:true})});if(response.ok){setConfigurationMessage("Database connected. HedgeSight is restarting…");setTimeout(()=>location.assign("/login"),3000);}else setConfigurationMessage((await response.json()).error??"Unable to connect to PostgreSQL");}
  async function addDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        address: data.get("address"),
        description: data.get("description"),
        pingIntervalSeconds: Number(data.get("pingIntervalSeconds")),
        reachabilityMode: data.get("reachabilityMode"),
        tcpPort: Number(data.get("tcpPort")),
      }),
    });
    if (response.ok) {
      setDialog(false);
      await refresh();
      navigate("monitoring");
    }
  }
  async function saveDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const data = new FormData(event.currentTarget);
    const response = await fetch(`/api/devices/${editing.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        address: data.get("address"),
        description: data.get("description"),
        enabled: data.get("enabled") === "on",
        pingIntervalSeconds: Number(data.get("pingIntervalSeconds")),
        reachabilityMode: data.get("reachabilityMode"),
        tcpPort: Number(data.get("tcpPort")),
        osName: data.get("osName") || null,
        osVersion: data.get("osVersion") || null,
        deviceType: data.get("deviceType") || null,
        vendor: data.get("vendor") || null,
        model: data.get("model") || null,
        groupIds: data.getAll("groupIds"),
        sshEnabled:monitoringPlatform==="linux"&&data.get("sshEnabled")==="on",sshCredentialId:data.get("sshCredentialId")||null,sshPort:Number(data.get("sshPort")||22),sshIntervalSeconds:Number(data.get("sshIntervalSeconds")||900),cpuThresholdPercent:Number(data.get("cpuThresholdPercent")||90),memoryThresholdPercent:Number(data.get("memoryThresholdPercent")||90),diskThresholdPercent:Number(data.get("diskThresholdPercent")||90),interfaceThresholdPercent:Number(data.get("interfaceThresholdPercent")||90),interfaceErrorThreshold:Number(data.get("interfaceErrorThreshold")||1),monitoredComponents:data.getAll("monitoredComponents"),
        vsphereEnabled:monitoringPlatform==="vmware"&&data.get("vsphereEnabled")==="on",vsphereCredentialId:data.get("vsphereCredentialId")||null,vspherePort:Number(data.get("vspherePort")||443),vsphereVerifyTls:data.get("vsphereVerifyTls")==="on",vsphereIntervalSeconds:Number(data.get("vsphereIntervalSeconds")||300),vsphereCpuThresholdPercent:Number(data.get("vsphereCpuThresholdPercent")||90),vsphereMemoryThresholdPercent:Number(data.get("vsphereMemoryThresholdPercent")||90),vsphereDatastoreThresholdPercent:Number(data.get("vsphereDatastoreThresholdPercent")||90),vsphereMonitoredComponents:data.getAll("vsphereMonitoredComponents"),
      }),
    });
    if (response.ok) {
      setEditing(null);
      await refresh();
    }
  }
  async function createCredential(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,data=new FormData(form);const response=await fetch("/api/credentials",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:data.get("name"),username:data.get("username"),password:data.get("password")})});if(response.ok){form.reset();setCredentialError("");setCredentials(await (await fetch("/api/credentials")).json());}else setCredentialError((await response.json()).error??"Unable to save credential");}
  async function deleteCredential(item:StoredCredential){if(!confirm(`Delete credential ${item.name}?`))return;const response=await fetch(`/api/credentials/${item.id}`,{method:"DELETE"});if(response.ok)setCredentials(current=>current.filter(value=>value.id!==item.id));else setCredentialError((await response.json()).error??"Unable to delete credential");}
  function toggleInterfaces(deviceId: string) {
    setExpandedDevice((current) => (current === deviceId ? null : deviceId));
  }
  async function createGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    const response = await fetch("/api/groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      setNewGroupName("");
      await refresh();
    }
  }
  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const response = await fetch("/api/settings/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: data.get("displayName"),
        email: data.get("email"),
        password: data.get("password"),
        role: data.get("role"),
      }),
    });
    if (response.ok) {
      form.reset();
      setAccountError("");
      setAccounts(await fetch("/api/settings/accounts").then((r) => r.json()));
    } else
      setAccountError(
        (await response.json()).error ?? "Unable to create account",
      );
  }
  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAccount) return;
    const data = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/settings/accounts/${editingAccount.id}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: data.get("displayName"),
          email: data.get("email"),
          role: data.get("role"),
          enabled: data.get("enabled") === "on",
          password: data.get("password"),
        }),
      },
    );
    if (response.ok) {
      setEditingAccount(null);
      setAccountError("");
      setAccounts(await fetch("/api/settings/accounts").then((r) => r.json()));
    } else
      setAccountError(
        (await response.json()).error ?? "Unable to update account",
      );
  }
  async function deleteAccount(account: Account) {
    if (
      account.isProtected ||
      account.isCurrent ||
      !confirm(`Delete ${account.displayName}? This cannot be undone.`)
    )
      return;
    const response = await fetch(`/api/settings/accounts/${account.id}`, {
      method: "DELETE",
    });
    if (response.ok)
      setAccounts((current) =>
        current.filter((item) => item.id !== account.id),
      );
    else
      setAccountError(
        (await response.json()).error ?? "Unable to delete account",
      );
  }
  async function saveOidc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/settings/authentication/oidc", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: data.get("enabled") === "on",
        localAccountsEnabled: data.get("localAccountsEnabled") === "on",
        issuerUrl: data.get("issuerUrl"),
        clientId: data.get("clientId"),
        clientSecret: data.get("clientSecret"),
        redirectUri: data.get("redirectUri"),
      }),
    });
    const body = await response.json();
    if (response.ok) {
      setAuthenticationSettings(
        await fetch("/api/settings/authentication").then((r) => r.json()),
      );
      setAuthenticationMessage("OIDC settings saved");
      window.setTimeout(() => setAuthenticationMessage(""), 2500);
    } else
      setAuthenticationMessage(body.error ?? "Unable to save OIDC settings");
  }
  async function saveRetention(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/retention", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(retention),
    });
    if (response.ok) {
      setRetentionSaved(true);
      window.setTimeout(() => setRetentionSaved(false), 2500);
    }
  }
  async function runMaintenance() {
    await fetch("/api/storage/maintenance", { method: "POST" });
    window.setTimeout(
      () =>
        void fetch("/api/storage/status")
          .then((r) => r.json())
          .then(setStorage),
      1000,
    );
  }
  async function saveLogSettings(event:FormEvent<HTMLFormElement>){event.preventDefault();const response=await fetch("/api/settings/system-logs",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(logSettings)});if(response.ok){setLogSettingsSaved(true);window.setTimeout(()=>setLogSettingsSaved(false),2500);}}
  function formatBytes(value?: string) {
    const bytes = Number(value ?? 0);
    if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }

  const total = Object.values(summary.counts).reduce(
    (sum, count) => sum + count,
    0,
  ) + summary.maintenanceCount;
  const healthyPercent = total
    ? Math.round((summary.counts.up / Math.max(1,total-summary.maintenanceCount)) * 100)
    : 0;
  const openIncidents = incidents.filter(
    (incident) => incident.status !== "resolved",
  ).length;
  const copy = pageCopy[view];
  const osNames = [
    ...new Set(
      monitoring
        .map((device) => device.osName)
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
  const filteredMonitoring = monitoring.filter((device) => {
    const haystack =
      `${device.name} ${device.address} ${device.description} ${device.osName ?? ""} ${device.vendor ?? ""} ${device.model ?? ""} ${device.groups.map((group) => group.name).join(" ")}`.toLowerCase();
    return (
      haystack.includes(search.toLowerCase()) &&
      (statusFilter === "all" ||
        (device.pingStatus ?? "unknown") === statusFilter) &&
      (osFilter === "all" || device.osName === osFilter) &&
      (groupFilter === "all" ||
        device.groups.some((group) => group.id === groupFilter))
    );
  });
  const operationalIncidents = incidents.filter((item) => !item.archivedAt),
    archivedIncidents = incidents.filter((item) => Boolean(item.archivedAt));
  const deviceHistory=incidentDeviceFilter?archivedIncidents.filter(item=>item.deviceId===incidentDeviceFilter.id):archivedIncidents;
  const visibleIncidents = incidentWindow
    ? operationalIncidents.filter((item) => {
        const value = new Date(item.openedAt);
        return value >= incidentWindow.start && value < incidentWindow.end;
      })
    : operationalIncidents;
  const visibleHistory = incidentWindow
    ? deviceHistory.filter((item) => {
        const value = new Date(item.openedAt);
        return value >= incidentWindow.start && value < incidentWindow.end;
      })
    : deviceHistory;
  const nav = (
    next: View,
    icon: ReactNode,
    label: string,
    count?: ReactNode,
  ) => (
    <button
      className={view === next ? "active" : ""}
      onClick={() => navigate(next)}
    >
      {icon}
      {label}
      {count}
    </button>
  );
  const managementToolbar = (
    <div className="management-toolbar">
      <label className="search-box">
        <Search size={16} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, address, OS, model or group…"
        />
      </label>
      <select
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
      >
        <option value="all">All states</option>
        <option value="up">Up</option>
        <option value="down">Down</option>
        <option value="unknown">Unknown</option>
      </select>
      <select
        value={osFilter}
        onChange={(event) => setOsFilter(event.target.value)}
      >
        <option value="all">All operating systems</option>
        {osNames.map((os) => (
          <option key={os}>{os}</option>
        ))}
      </select>
      <select
        value={groupFilter}
        onChange={(event) => setGroupFilter(event.target.value)}
      >
        <option value="all">All groups</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name} ({group.deviceCount})
          </option>
        ))}
      </select>
      <div className="create-group">
        <input
          value={newGroupName}
          onChange={(event) => setNewGroupName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void createGroup();
            }
          }}
          placeholder="New group"
        />
        <button onClick={() => void createGroup()} aria-label="Create group">
          <Plus size={15} />
        </button>
      </div>
      <span className="result-count">
        {filteredMonitoring.length} of {monitoring.length}
      </span>
      {view === "monitoring" && (
        <button className="maintenance-action" disabled={!selectedDevices.length} onClick={()=>openChangeDialog(selectedDevices)}>
          <Wrench size={15}/> Start change {selectedDevices.length?`(${selectedDevices.length})`:""}
        </button>
      )}
    </div>
  );

  return (
    <div className="shell">
      <aside className={mobileNav ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brandmark">
            <img src="/hedgesight-icon.svg" alt="" />
          </div>
          <span>
            Hedge<span>Sight</span>
          </span>
          <button
            className="mobile-close"
            onClick={() => setMobileNav(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>
        <nav aria-label="Main navigation">
          {nav("overview", <CircleGauge />, "Overview")}
          {nav("monitoring", <MonitorDot />, "Monitoring")}
          {nav(
            "devices",
            <Server />,
            "Devices",
            <span className="nav-count">{total}</span>,
          )}
          {nav(
            "incidents",
            <Bell />,
            "Incidents",
            <span className="nav-count alert">{openIncidents}</span>,
          )}
          {nav("tasks", <ClipboardList />, "Tasks", <span className="nav-count">{tasks.filter(item=>item.status!=="completed").length}</span>)}
          {nav("maintenance", <CalendarClock />, "Maintenance", <span className="nav-count">{changes.filter(item=>item.status!=="completed").length}</span>)}
          {nav("backups", <HardDriveDownload />, "Backups")}
          {nav("logs", <FileText />, "Logs")}
          {nav("workers", <Box />, "Platform")}
        </nav>
        <div className="sidebar-bottom">
          {nav("settings", <Settings />, "Settings")}
          <button onClick={onLogout}>
            <LogOut /> Sign out
          </button>
          <div className="signed-in">
            <strong>{user.displayName}</strong>
            <small>{user.email}</small>
          </div>
          <div className="system-state">
            <span className="pulse" />
            <div>
              <strong>System operational</strong>
              <small>Control plane online</small>
            </div>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <button
            className="menu"
            onClick={() => setMobileNav(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
          </div>
          {(view === "overview" || view === "devices") && (
            <button className="primary" onClick={() => setDialog(true)}>
              <Plus size={17} /> Add device
            </button>
          )}
          {view==="tasks"&&["admin","operator"].includes(user.role)&&<button className="primary" onClick={()=>setTaskDialog(true)}><Plus size={17}/> New task</button>}
        </header>
        {error && <div className="error">{error}. Retrying automatically.</div>}
        {view === "overview" && (
          <>
            <section className="stats" aria-label="Device status summary">
              <article className="stat hero-stat">
                <div
                  className="ring"
                  style={
                    { "--value": `${healthyPercent * 3.6}deg` } as CSSProperties
                  }
                >
                  <span>{healthyPercent}%</span>
                </div>
                <div>
                  <small>OVERALL HEALTH</small>
                  <strong>
                    {summary.counts.up} of {total} devices healthy
                  </strong>
                  <p>Calculated from active checks</p>
                </div>
              </article>
              <article className="stat">
                <span className="status-dot up" />
                <small>ONLINE</small>
                <strong>{summary.counts.up}</strong>
                <p>Devices responding</p>
              </article>
              <article className="stat">
                <span className="status-dot down" />
                <small>DOWN</small>
                <strong>{summary.counts.down}</strong>
                <p>Needs attention</p>
              </article>
              <article className="stat">
                <span className="status-dot maintenance" />
                <small>MAINTENANCE</small>
                <strong>{summary.maintenanceCount}</strong>
                <p>Protected by active changes</p>
              </article>
            </section>
            <section className="grid">
              <Panel
                title="Change schedule"
                subtitle="Scheduled and active maintenance windows"
                className="devices"
              >
                <div className="active-change-list">
                  {summary.activeChanges.length?summary.activeChanges.map(change=><article key={change.id}><span className={`change-icon ${change.status}`}><Wrench size={16}/></span><div><strong>{change.changeReference} <em className={`change-state ${change.status}`}>{change.status}</em></strong><p className="change-description">{change.publicDescription||"No public description has been added."}</p><small>{change.deviceNames.join(", ")}</small><small>{change.managerName} · {new Date(change.startedAt).toLocaleString()} → {new Date(change.estimatedEndAt).toLocaleString()}</small></div><button className="change-return" disabled={user.role!=="admin"&&change.managerId!==user.id} title={user.role!=="admin"&&change.managerId!==user.id?`Assigned to ${change.managerName}`:"End this change"} onClick={()=>void returnChange(change.id)}>{change.status==="scheduled"?"Cancel change":"Return to service"}</button></article>):<div className="change-empty"><ShieldCheck size={20}/><strong>No scheduled or active changes</strong><span>All nodes are under normal alerting.</span></div>}
                </div>
              </Panel>
              <Panel
                title="Polling workers"
                subtitle="Probe execution nodes"
                className="workers"
              >
                <WorkerList summary={summary} />
              </Panel>
              <Panel
                title="Recent incidents"
                subtitle="Latest state changes across all checks"
                className="incidents"
              >
                <IncidentList
                  summary={summary}
                  onOpen={(id) => void openIncident(id)}
                />
              </Panel>
            </section>
          </>
        )}
      {view === "monitoring" && ["admin","operator"].includes(user.role) && (
          <section className="page-grid">
            {managementToolbar}
            <Panel
              title="Operational monitoring"
              subtitle={`${monitoring.length} devices · expand a row for interface health`}
              className="full-panel"
            >
              <div className="table-wrap">
                <table className="monitoring-table">
                  <thead>
                    <tr>
                      <th className="select-column"><input type="checkbox" aria-label="Select all visible nodes" checked={filteredMonitoring.filter(item=>!item.changeId).length>0&&filteredMonitoring.filter(item=>!item.changeId).every(item=>selectedDevices.includes(item.id))} onChange={(event)=>setSelectedDevices(event.target.checked?filteredMonitoring.filter(item=>!item.changeId).map(item=>item.id):[])}/></th>
                      <th>DEVICE</th>
                      <th>REACHABILITY</th>
                      <th>RESPONSE HISTORY</th>
                      <th>LAST CHECK</th>
                      <th>STATUS</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={7} className="empty">
                          Loading live monitoring…
                        </td>
                      </tr>
                    )}
                    {!loading && filteredMonitoring.length === 0 && (
                      <tr>
                        <td colSpan={7} className="empty">
                          No devices match these filters.
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      filteredMonitoring.map((device) => (
                        <Fragment key={device.id}>
                          <tr className="expandable-row">
                            <td className="select-column"><input type="checkbox" aria-label={`Select ${device.name}`} disabled={Boolean(device.changeId)} checked={selectedDevices.includes(device.id)} onChange={()=>toggleSelectedDevice(device.id)}/></td>
                            <td>
                              <span className="device-icon">
                                <Server size={17} />
                              </span>
                              <span className="device-primary">
                                <strong>{device.name}</strong>
                                <small>{device.address}</small>
                              </span>
                            </td>
                            <td>
                              <strong className="latency">
                                {device.latencyMs === null
                                  ? "—"
                                  : `${device.latencyMs.toFixed(1)} ms`}
                              </strong>
                              <small className="cell-sub">
                                {device.reachabilityMode === "tcp"
                                  ? `TCP :${device.tcpPort}`
                                  : "ICMP"}{" "}
                                · every {device.intervalSeconds ?? 60}s
                              </small>
                            </td>
                            <td>
                              <Sparkline points={device.history} />
                            </td>
                            <td>{relativeTime(device.lastRunAt)}</td>
                            <td>
                              <StatusBadge
                                status={
                                  device.changeId
                                    ? device.changeStatus==="scheduled"?"scheduled":device.changeStatus==="active"?"maintenance":device.pingStatus??"unknown"
                                    : device.enabled
                                    ? (device.pingStatus ?? "unknown")
                                    : "disabled"
                                }
                              />
                              {device.changeId&&<small className="maintenance-detail">{device.changeReference} · {device.changeManagerName}<br/>{new Date(device.maintenanceStartedAt!).toLocaleString()} → {new Date(device.maintenanceEstimatedEndAt!).toLocaleString()}</small>}
                            </td>
                            <td>
                              <div className="row-actions">
                                {!device.changeId&&["admin","operator"].includes(user.role)&&<button className="device-jump maintenance-node" onClick={()=>openChangeDialog([device.id])} title="Put under change" aria-label={`Put ${device.name} under change`}><Wrench size={15}/></button>}
                                <button className="device-jump history-node" onClick={()=>openDeviceIncidentHistory(device)} title="Open incident history" aria-label={`Open incident history for ${device.name}`}><History size={15}/></button>
                                <button
                                  className="device-jump"
                                  onClick={() => openDevice(device)}
                                  title="Open device"
                                  aria-label={`Open ${device.name} in Devices`}
                                >
                                  <ArrowRight size={16} />
                                </button>
                                <button
                                  className={`expand-button ${expandedDevice === device.id ? "open" : ""}`}
                                  onClick={() =>
                                    void toggleInterfaces(device.id)
                                  }
                                  aria-label={`Show interfaces for ${device.name}`}
                                >
                                  <ChevronDown size={17} />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expandedDevice === device.id && (
                            <tr className="interface-detail">
                              <td colSpan={7}>
                                <section className="availability-strip" aria-label={`30 day availability for ${device.name}`}>
                                  <div><small>UPTIME · 30 DAYS</small><strong>{availabilityDuration(device.uptimeSeconds)}</strong></div>
                                  <div><small>DOWNTIME · 30 DAYS</small><strong className="downtime-value">{availabilityDuration(device.downtimeSeconds)}</strong></div>
                                  <div><small>DOWN UNDER MAINTENANCE</small><strong className="maintenance-downtime-value">{availabilityDuration(device.maintenanceDowntimeSeconds)}</strong></div>
                                  <div><small>AVAILABILITY</small><strong>{device.uptimePercent===null?"—":`${Number(device.uptimePercent).toFixed(3)}%`}</strong></div>
                                  <span>Unknown and maintenance-window time are excluded from availability. Maintenance outages are tracked separately.</span>
                                </section>
                                {device.sshProfiledAt&&<section className="ssh-metric-strip">
                                  <div><small>RESOURCE CHECK</small><strong className={device.sshStatus==="degraded"?"threshold-breach":""}>{device.sshStatus??"unknown"}</strong><span>{relativeTime(device.sshProfiledAt)}</span></div>
                                  {componentMonitored(device,"cpu")&&<button onClick={()=>setChart({deviceId:device.id,title:`${device.name} · CPU utilisation`,kind:"metric",key:"cpuUsedPercent",unit:"%"})}><small>CPU UTILISATION</small><strong className={Number(device.sshProfile.cpuUsedPercent??0)>=Number(device.sshThresholds.cpuThresholdPercent??90)?"threshold-breach":""}>{Number(device.sshProfile.cpuUsedPercent??0).toFixed(1)}%</strong><span>{String(device.sshProfile.cpuCount??"—")} cores · view history</span></button>}
                                  {componentMonitored(device,"memory")&&<button onClick={()=>setChart({deviceId:device.id,title:`${device.name} · RAM utilisation`,kind:"metric",key:"memoryUsedPercent",unit:"%"})}><small>RAM UTILISATION</small><strong className={Number(device.sshProfile.memoryUsedPercent??0)>=Number(device.sshThresholds.memoryThresholdPercent??90)?"threshold-breach":""}>{Number(device.sshProfile.memoryUsedPercent??0).toFixed(1)}%</strong><span>{formatBytes(String(device.sshProfile.memoryBytes??0))} · view history</span></button>}
                                  {((device.sshProfile.filesystems as Array<Record<string,unknown>>)||[]).filter(item=>componentMonitored(device,`disk:${String(item.mount)}`)).map(item=><button key={String(item.mount)} onClick={()=>setChart({deviceId:device.id,title:`${device.name} · ${String(item.mount)} disk usage`,kind:"metric",key:`diskUsedPercent:${String(item.mount)}`,unit:"%"})}><small>DISK · {String(item.mount)}</small><strong className={Number(item.usedPercent??0)>=Number(device.sshThresholds.diskThresholdPercent??90)?"threshold-breach":""}>{Number(item.usedPercent??0).toFixed(1)}%</strong><span>{formatBytes(String(item.usedBytes??0))} used · view history</span></button>)}
                                </section>}
                                {device.vsphereProfiledAt&&<section className="ssh-metric-strip vsphere-metric-strip">
                                  <div><small>VSPHERE CHECK</small><strong className={device.vsphereStatus==="degraded"?"threshold-breach":""}>{device.vsphereStatus??"unknown"}</strong><span>{relativeTime(device.vsphereProfiledAt)}</span></div>
                                  {(!Array.isArray(device.vsphereThresholds.monitoredComponents)||(device.vsphereThresholds.monitoredComponents as string[]).includes("cpu"))&&<button onClick={()=>setChart({deviceId:device.id,title:`${device.name} · ESXi CPU utilisation`,kind:"metric",key:"cpuUsedPercent",unit:"%"})}><small>HOST CPU</small><strong>{Number(device.vsphereProfile.cpuUsedPercent??0).toFixed(1)}%</strong><span>{String(device.vsphereProfile.cpuCount??"—")} cores · view history</span></button>}
                                  {(!Array.isArray(device.vsphereThresholds.monitoredComponents)||(device.vsphereThresholds.monitoredComponents as string[]).includes("memory"))&&<button onClick={()=>setChart({deviceId:device.id,title:`${device.name} · ESXi memory utilisation`,kind:"metric",key:"memoryUsedPercent",unit:"%"})}><small>HOST MEMORY</small><strong>{Number(device.vsphereProfile.memoryUsedPercent??0).toFixed(1)}%</strong><span>{formatBytes(String(device.vsphereProfile.memoryBytes??0))} · view history</span></button>}
                                  {((device.vsphereProfile.datastores as Array<Record<string,unknown>>)||[]).filter(item=>!Array.isArray(device.vsphereThresholds.monitoredComponents)||(device.vsphereThresholds.monitoredComponents as string[]).includes(`datastore:${String(item.id)}`)).map(item=><button key={String(item.id)} onClick={()=>setChart({deviceId:device.id,title:`${device.name} · ${String(item.name)} datastore`,kind:"metric",key:`datastoreUsedPercent:${String(item.id)}`,unit:"%"})}><small>DATASTORE · {String(item.name)}</small><strong>{Number(item.usedPercent??0).toFixed(1)}%</strong><span>{formatBytes(String(item.usedBytes??0))} used · view history</span></button>)}
                                </section>}
                                {!interfaceStats[device.id] ? (
                                  <div className="interface-empty">
                                    Loading interfaces…
                                  </div>
                                ) : interfaceStats[device.id].length === 0 ? (
                                  <div className="interface-empty">
                                    <strong>No interface telemetry yet</strong>
                                    <span>
                                      Enable Advanced Linux monitoring to collect traffic,
                                      utilization, errors and discards over SSH.
                                    </span>
                                  </div>
                                ) : (
                                  <div className="interface-grid">
                                    {interfaceStats[device.id].filter(item=>componentMonitored(device,`interface:${item.name}`)).map((item) => (
                                      <article
                                        key={item.id}
                                        role="button" tabIndex={0} onClick={()=>setChart({deviceId:device.id,title:`${device.name} · ${item.name} traffic`,kind:"interface",interfaceId:item.id,unit:"Mbps"})} onKeyDown={event=>{if(event.key==="Enter"||event.key===" ")setChart({deviceId:device.id,title:`${device.name} · ${item.name} traffic`,kind:"interface",interfaceId:item.id,unit:"Mbps"})}}
                                        className={
                                          Math.max(item.utilizationInPercent??0,item.utilizationOutPercent??0)>=Number(device.sshThresholds.interfaceThresholdPercent??90)||(Number(device.sshThresholds.interfaceErrorThreshold??1)>0&&Number(item.errorDelta??0)+Number(item.discardDelta??0) >=
                                          Number(device.sshThresholds.interfaceErrorThreshold??1)
                                          )
                                            ? "has-errors"
                                            : ""
                                        }
                                      >
                                        <div>
                                          <strong>{item.name}</strong>
                                          <small>
                                            {item.alias ||
                                              item.description ||
                                              "Network interface"}
                                          </small>
                                        </div>
                                        <dl>
                                          <div>
                                            <dt>IN</dt>
                                            <dd>
                                              {item.inBps === null
                                                ? "—"
                                                : `${(item.inBps / 1_000_000).toFixed(2)} Mbps`}
                                            </dd>
                                          </div>
                                          <div>
                                            <dt>OUT</dt>
                                            <dd>
                                              {item.outBps === null
                                                ? "—"
                                                : `${(item.outBps / 1_000_000).toFixed(2)} Mbps`}
                                            </dd>
                                          </div>
                                          <div>
                                            <dt>UTIL</dt>
                                            <dd>
                                              {Math.max(
                                                item.utilizationInPercent ?? 0,
                                                item.utilizationOutPercent ?? 0,
                                              ).toFixed(1)}
                                              %
                                            </dd>
                                          </div>
                                          <div>
                                            <dt>ERRORS</dt>
                                            <dd>
                                              +{Number(item.errorDelta ?? 0)}
                                            </dd>
                                          </div>
                                          <div>
                                            <dt>DISCARDS</dt>
                                            <dd>
                                              +{Number(item.discardDelta ?? 0)}
                                            </dd>
                                          </div>
                                        </dl>
                                      </article>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </section>
        )}
        {view === "devices" && (
          <section className="page-grid">
            {managementToolbar}
            <div className="device-card-grid">
              {filteredMonitoring.map((device) => (
                <article className="device-card" key={device.id}>
                  <div className="device-card-head">
                    <span className="device-icon">
                      <Server size={18} />
                    </span>
                    <div>
                      <h2>{device.name}</h2>
                      <p className="mono">{device.address}</p>
                    </div>
                    <div className="device-card-status">
                      {device.changeId && (
                        <StatusBadge status={device.changeStatus === "scheduled" ? "scheduled" : "maintenance"} />
                      )}
                      <StatusBadge
                        status={
                          device.enabled
                            ? (device.pingStatus ?? "unknown")
                            : "disabled"
                        }
                      />
                    </div>
                  </div>
                  <p className="device-description">
                    {device.description || "No description supplied."}
                  </p>
                  <div className="device-facts">
                    <div>
                      <span>PROFILE</span>
                      <strong>
                        {[device.vendor, device.model]
                          .filter(Boolean)
                          .join(" ") ||
                          device.deviceType ||
                          "Unprofiled"}
                      </strong>
                      <small>
                        {[device.osName, device.osVersion]
                          .filter(Boolean)
                          .join(" ") || "OS unknown"}
                      </small>
                    </div>
                    <div>
                      <span>REACHABILITY</span>
                      <strong>
                        {device.reachabilityMode === "tcp"
                          ? `TCP port ${device.tcpPort}`
                          : "ICMP Ping"}
                      </strong>
                      <small>
                        Every {device.intervalSeconds ?? 60} seconds
                      </small>
                    </div>
                    <div>
                      <span>GROUPS</span>
                      <div className="group-tags">
                        {device.groups.length ? (
                          device.groups.map((group) => (
                            <span
                              key={group.id}
                              style={{ borderColor: group.color }}
                            >
                              {group.name}
                            </span>
                          ))
                        ) : (
                          <small>Ungrouped</small>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    className="device-edit"
                    onClick={() => {setEditing(device);setDeviceEditTab("general");setMonitoringPlatform(device.vsphereEnabled||String(device.osName??"").toLowerCase().includes("vmware")?"vmware":"linux");}}
                  >
                    <Pencil size={14} /> Edit configuration
                  </button>
                  <button className="device-edit device-more" onClick={()=>setDeviceDetail(device)}><Eye size={14}/> More information</button>
                </article>
              ))}
            </div>
          </section>
        )}
        {view === "incidents" && (
          <section className="page-grid">
            {selectedMajor ? (
              <>
                <button
                  className="incident-back"
                  onClick={() => setSelectedMajor(null)}
                >
                  ← Back to incidents
                </button>
                <article className="incident-hero major-hero">
                  <div>
                    <p className="eyebrow">
                      {selectedMajor.reference} ·{" "}
                      {selectedMajor.severity.toUpperCase()}
                    </p>
                    <h2>{selectedMajor.title}</h2>
                    <p>
                      {selectedMajor.impact ||
                        "No impact statement has been added."}
                    </p>
                  </div>
                  <div className="incident-hero-state">
                    <StatusBadge status={selectedMajor.status} />
                    <small>{selectedMajor.ownerName || "Unassigned"}</small>
                  </div>
                </article>
                <div className="incident-workflow">
                  <Panel
                    title="Major incident updates"
                    subtitle="One shared operational update stream"
                    className="full-panel"
                  >
                    <div className="incident-chat">
                      {selectedMajor.updates.length ? (
                        selectedMajor.updates.map((update) => (
                          <article key={update.id}>
                            <div>
                              <strong>{update.authorName}</strong>
                              <time>
                                {new Date(update.createdAt).toLocaleString()}
                              </time>
                            </div>
                            <p>{update.body}</p>
                          </article>
                        ))
                      ) : (
                        <div className="chat-empty">
                          No major incident updates yet.
                        </div>
                      )}
                    </div>
                    {selectedMajor.status !== "resolved" && (
                      <form
                        className="incident-update-form"
                        onSubmit={addMajorUpdate}
                      >
                        <textarea
                          name="body"
                          rows={3}
                          required
                          placeholder="Post a shared major incident update…"
                        />
                        <button className="primary">Post MI update</button>
                      </form>
                    )}
                  </Panel>
                  <aside className="incident-actions">
                    <h3>Linked incidents</h3>
                    {selectedMajor.status==="resolved"&&!selectedMajor.archivedAt&&<button className="secondary archive-major" onClick={()=>void archiveMajorIncident(selectedMajor.id)}><Archive size={14}/> Archive major incident</button>}
                    {selectedMajor.incidents.map((item) => (
                      <button
                        key={item.id}
                        className="linked-incident"
                        onClick={() => void openIncident(item.id)}
                      >
                        <span>{item.deviceName}</span>
                        <small>{incidentStatus(item.status)}</small>
                      </button>
                    ))}
                  </aside>
                </div>
              </>
            ) : selectedIncident ? (
              <>
                <button
                  className="incident-back"
                  onClick={() => setSelectedIncident(null)}
                >
                  ← Back to all incidents
                </button>
                {incidentError && <div className="error">{incidentError}</div>}
                <article className="incident-hero">
                  <div>
                    <p className="eyebrow">INCIDENT DETAIL</p>
                    <h2>{selectedIncident.deviceName} stopped responding</h2>
                    <p>
                      {selectedIncident.deviceDescription ||
                        `${selectedIncident.checkName} detected that ${selectedIncident.address} was no longer responding.`}
                    </p>
                    <div className="incident-device-meta">
                      <span>
                        <Server size={15} />
                        {selectedIncident.address}
                      </span>
                      <span>
                        {selectedIncident.checkKind.toUpperCase()} ·{" "}
                        {selectedIncident.checkName}
                      </span>
                    </div>
                  </div>
                  <div className="incident-hero-state">
                    <select className={`priority-select ${selectedIncident.priority.toLowerCase()}`} value={selectedIncident.priority} onChange={event=>void setIncidentPriority(selectedIncident.id,event.target.value as Priority)}>{(["P1","P2","P3","P4"] as Priority[]).map(priority=><option key={priority}>{priority}</option>)}</select>
                    <span className={`badge ${selectedIncident.status}`}>
                      <i />
                      {incidentStatus(selectedIncident.status)}
                    </span>
                    {selectedIncident.investigatorName && (
                      <small>
                        {selectedIncident.investigatorName} is investigating
                      </small>
                    )}
                  </div>
                </article>
                <section className="incident-timeline">
                  <article>
                    <span className="timeline-dot down" />
                    <small>STOPPED RESPONDING</small>
                    <strong>
                      {new Date(selectedIncident.openedAt).toLocaleString()}
                    </strong>
                    <p>
                      {selectedIncident.openingMessage ||
                        "The active check reported the device as unavailable."}
                    </p>
                  </article>
                  <article>
                    <span
                      className={`timeline-dot ${selectedIncident.recoveredAt ? "up" : "waiting"}`}
                    />
                    <small>STARTED RESPONDING</small>
                    <strong>
                      {selectedIncident.recoveredAt
                        ? new Date(
                            selectedIncident.recoveredAt,
                          ).toLocaleString()
                        : "Still unavailable"}
                    </strong>
                    <p>
                      {selectedIncident.recoveredAt
                        ? "Monitoring has confirmed that the device is responding again."
                        : "Waiting for a successful poll."}
                    </p>
                  </article>
                  <article>
                    <span
                      className={`timeline-dot ${selectedIncident.resolvedAt ? "up" : "waiting"}`}
                    />
                    <small>INCIDENT CLOSED</small>
                    <strong>
                      {selectedIncident.resolvedAt
                        ? new Date(selectedIncident.resolvedAt).toLocaleString()
                        : "Not yet closed"}
                    </strong>
                    <p>
                      {selectedIncident.closedByName
                        ? `Closed by ${selectedIncident.closedByName}.`
                        : "Requires recovery and at least one operator update."}
                    </p>
                  </article>
                </section>
                <div className="incident-workflow">
                  <Panel
                    title="Incident updates"
                    subtitle="Timestamped operator notes and investigation history"
                    className="full-panel"
                  >
                    <div className="incident-chat">
                      {selectedIncident.updates.length === 0 ? (
                        <div className="chat-empty">
                          No updates have been added yet.
                        </div>
                      ) : (
                        selectedIncident.updates.map((update) => (
                          <article
                            key={update.id}
                            className={
                              update.authorId === user.id ? "mine" : ""
                            }
                          >
                            <div>
                              <strong>{update.authorName}</strong>
                              <time>
                                {new Date(update.createdAt).toLocaleString()}
                              </time>
                            </div>
                            <p>{update.body}</p>
                          </article>
                        ))
                      )}
                    </div>
                    {selectedIncident.status !== "resolved" && (
                      <form
                        className="incident-update-form"
                        onSubmit={addIncidentUpdate}
                      >
                        <textarea
                          name="body"
                          rows={3}
                          required
                          maxLength={4000}
                          placeholder="Add investigation notes, actions taken, or the cause…"
                        />
                        <button className="primary">Post update</button>
                      </form>
                    )}
                  </Panel>
                  <aside className="incident-actions">
                    <h3>Workflow</h3>
                    <p>
                      Recovery does not close an incident. Add context, then
                      close it once monitoring is healthy.
                    </p>
                    <form className="public-incident-form" onSubmit={savePublicIncidentMessage}>
                      <label>PUBLIC STATUS MESSAGE<textarea name="message" rows={4} maxLength={2000} defaultValue={selectedIncident.publicMessage??""} placeholder="Explain the impact and expected resolution for status-page visitors."/></label>
                      <small>Public. Do not include addresses, credentials, or internal investigation details.</small>
                      <button className="secondary"><Bell size={14}/>{selectedIncident.publicMessage?"Update public message":"Publish to status page"}</button>
                    </form>
                    {selectedIncident.status !== "resolved" && (
                        <button
                          className="secondary"
                          onClick={() => void claimIncident()}
                          disabled={selectedIncident.investigatorId === user.id}
                        >
                          <Users size={15} />
                          {selectedIncident.investigatorId === user.id
                            ? "You are investigating"
                            : "Start investigating"}
                        </button>
                      )}
                    <button
                      className="primary"
                      onClick={() => void resolveIncident()}
                      disabled={
                        selectedIncident.status === "resolved" ||
                        selectedIncident.availabilityStatus!=="up" ||
                        selectedIncident.updates.length === 0
                      }
                    >
                      <ShieldCheck size={15} />
                      {selectedIncident.status === "resolved"
                        ? "Incident resolved"
                        : "Resolve incident"}
                    </button>
                    {selectedIncident.status!=="resolved"&&<button className="secondary" onClick={()=>setIncidentTaskDialog(true)} disabled={selectedIncident.availabilityStatus!=="up"||selectedIncident.updates.length===0}><ClipboardList size={15}/>Resolve & create task</button>}
                    {selectedIncident.status === "resolved" &&
                      !selectedIncident.archivedAt && (
                        <button
                          className="secondary"
                          onClick={() => void archiveIncident(selectedIncident.id)}
                        >
                          <Archive size={15} />
                          Archive incident
                        </button>
                      )}
                    {selectedIncident.archivedAt && (
                      <small>
                        Archived {new Date(selectedIncident.archivedAt).toLocaleString()}.
                      </small>
                    )}
                    {selectedIncident.availabilityStatus!=="up" && (
                      <small>Waiting for primary availability monitoring to respond.</small>
                    )}
                    {selectedIncident.availabilityStatus==="up" &&
                      selectedIncident.updates.length === 0 && (
                        <small>Add an update before resolving.</small>
                      )}
                  </aside>
                </div>
              </>
            ) : (
              <>
                <div className="incident-section-tabs" role="tablist">
                  <button className={incidentSectionTab === "overview" ? "active" : ""} onClick={() => setIncidentSectionTab("overview")}>Overview</button>
                  <button
                    className={
                      incidentSectionTab === "incidents" ? "active" : ""
                    }
                    onClick={() => setIncidentSectionTab("incidents")}
                  >
                    Operational incidents
                  </button>
                  <button
                    className={incidentSectionTab === "major" ? "active" : ""}
                    onClick={() => setIncidentSectionTab("major")}
                  >
                    Major incidents{" "}
                    <span>
                      {
                        majorIncidents.filter(
                          (item) => item.status !== "resolved",
                        ).length
                      }
                    </span>
                  </button>
                  <button
                    className={incidentSectionTab === "history" ? "active" : ""}
                    onClick={() => setIncidentSectionTab("history")}
                  >
                    History <span>{archivedIncidents.length}</span>
                  </button>
                </div>
                {incidentSectionTab === "incidents" && (
                  <>
                    <div className="summary-row">
                      <div>
                        <span className="status-dot down" />
                        <strong>{openIncidents}</strong>
                        <small>ACTIVE</small>
                      </div>
                      <div>
                        <span className="status-dot up" />
                        <strong>
                          {
                            operationalIncidents.filter((i) => i.status === "resolved")
                              .length
                          }
                        </strong>
                        <small>RESOLVED</small>
                      </div>
                    </div>
                    {incidentError && (
                      <div className="error">{incidentError}</div>
                    )}
                    <Panel
                      title="Incident queue"
                      subtitle="Active work and resolved incidents awaiting archive"
                      className="full-panel"
                    >
                      <div className="mi-groups">
                        {majorIncidents
                          .filter((major) =>
                            visibleIncidents.some(
                              (item) => item.majorIncidentId === major.id,
                            ),
                          )
                          .map((major) => (
                            <MajorIncidentGroup
                              key={major.id}
                              major={major}
                              members={visibleIncidents.filter(
                                (item) => item.majorIncidentId === major.id,
                              )}
                              onOpenIncident={(id) => void openIncident(id)}
                              onOpenMajor={(id) => void openMajorIncident(id)}
                              onUpdate={(id, event) =>
                                void addGroupedMajorUpdate(id, event)
                              }
                              onResolve={(id) =>
                                void resolveMajorAndChildren(id)
                              }
                            />
                          ))}
                      </div>
                      <div className="table-wrap unassigned-incidents">
                        <table>
                          <thead>
                            <tr>
                              <th>DEVICE</th>
                              <th>PRIORITY</th><th>EVENT</th>
                              <th>STATUS</th>
                              <th>INVESTIGATOR</th>
                              <th>UPDATES</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleIncidents
                              .filter((incident) => !incident.majorIncidentId)
                              .map((incident) => (
                                <tr key={incident.id}>
                                  <td>
                                    <strong>{incident.deviceName}</strong>
                                    <small className="account-email">
                                      {incident.address}
                                    </small>
                                  </td>
                                  <td><span className={`priority-badge ${incident.priority.toLowerCase()}`}>{incident.priority}</span></td>
                                  <td>{relativeTime(incident.openedAt)}</td>
                                  <td>
                                    <span
                                      className={`badge ${incident.status}`}
                                    >
                                      <i />
                                      {incidentStatus(incident.status)}
                                    </span>
                                  </td>
                                  <td>
                                    {incident.investigatorName || "Unassigned"}
                                  </td>
                                  <td>{incident.updateCount}</td>
                                  <td>
                                    <div className="queue-actions">
                                      <button
                                        className="incident-open"
                                        onClick={() =>
                                          void openIncident(incident.id)
                                        }
                                      >
                                        Open incident <ArrowRight size={14} />
                                      </button>
                                      {incident.status === "resolved" && (
                                        <button
                                          className="archive-button"
                                          onClick={() => void archiveIncident(incident.id)}
                                        >
                                          <Archive size={14} /> Archive
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  </>
                )}
                {incidentSectionTab === "major" && (
                  <MajorIncidentPanel
                    majors={majorIncidents}
                    onDeclare={() => setMajorDialog(true)}
                    onOpen={(id) => void openMajorIncident(id)}
                  />
                )}
                {incidentSectionTab === "history" && (
                  <>
                    {majorIncidents.some(item=>item.archivedAt)&&<Panel title="Archived major incidents" subtitle="Resolved major incidents retained for audit and reporting" className="full-panel"><div className="major-list major-list-tab">{majorIncidents.filter(item=>item.archivedAt).map(item=><button key={item.id} onClick={()=>void openMajorIncident(item.id)}><span className={`major-severity ${item.severity}`}>{item.reference}</span><strong>{item.title}</strong><small>Archived {new Date(item.archivedAt!).toLocaleString()}</small><StatusBadge status="resolved"/></button>)}</div></Panel>}
                    {incidentDeviceFilter&&<div className="device-history-filter"><span><History size={15}/> Incident history for <strong>{incidentDeviceFilter.name}</strong></span><button onClick={()=>setIncidentDeviceFilter(null)}>Show all devices</button></div>}
                    <IncidentTimeline
                      incidents={deviceHistory}
                      onSelect={(start, end, label) =>
                        setIncidentWindow({ start, end, label })
                      }
                    />
                    {incidentWindow && (
                      <div className="time-filter">
                        <span>Showing incidents from {incidentWindow.label}</span>
                        <button onClick={() => setIncidentWindow(null)}>
                          Clear filter
                        </button>
                      </div>
                    )}
                    <IncidentHistoryTable
                      incidents={visibleHistory}
                      onOpen={(id) => void openIncident(id)}
                    />
                  </>
                )}
                {incidentSectionTab === "overview" && (
                  <>
                    <Panel title="Monitoring alerts" subtitle="Advanced monitoring problems do not automatically declare an outage" className="full-panel"><div className="monitoring-alert-list">{monitoringAlerts.map(alert=><article key={alert.id}><span className={`alert-kind ${alert.kind}`}><Activity size={15}/></span><div><strong>{alert.deviceName} · {alert.checkName}</strong><p>{alert.message}</p><small>{alert.checkKind.toUpperCase()} · seen {alert.occurrenceCount} times · latest {relativeTime(alert.lastSeenAt)}</small></div><div className="alert-actions"><button className="secondary" onClick={()=>void actOnMonitoringAlert(alert,'task')}><ClipboardList size={13}/> Create task</button><button className="secondary" onClick={()=>void actOnMonitoringAlert(alert,'incident')}><Bell size={13}/> Raise incident</button><button className="icon-button" title="Dismiss" onClick={()=>void actOnMonitoringAlert(alert,'dismiss')}><X size={13}/></button></div></article>)}{!monitoringAlerts.length&&<div className="chat-empty"><ShieldCheck size={16}/> No active advanced-monitoring alerts.</div>}</div></Panel>
                    <section className="incident-metric-cards">
                      <button onClick={()=>setIncidentSectionTab("history")}>
                        <small>TOTAL INCIDENTS</small>
                        <strong>{incidents.length}</strong>
                      </button>
                      <button onClick={()=>setIncidentSectionTab("incidents")}>
                        <small>ACTIVE</small>
                        <strong>{openIncidents}</strong>
                      </button>
                      <button onClick={()=>setIncidentSectionTab("major")}>
                        <small>MAJOR INCIDENTS</small>
                        <strong>{majorIncidents.length}</strong>
                      </button>
                      <button onClick={()=>setIncidentSectionTab("incidents")}>
                        <small>RECOVERED, AWAITING CLOSE</small>
                        <strong>
                          {
                            incidents.filter(
                              (item) => item.status === "pending_investigation",
                            ).length
                          }
                        </strong>
                      </button>
                    </section>
                  </>
                )}
              </>
            )}
          </section>
        )}
        {view === "tasks" && (<><div className="task-board-actions"><span>Move lanes with the header arrows and edit them using the pencil.</span>{["admin","operator"].includes(user.role)&&<><button className="secondary" onClick={()=>setTagDialog(true)}>Manage tags</button><button className="secondary" onClick={()=>setLaneEditor({lane:null,name:""})}><Plus size={14}/> Add lane</button></>}</div><section className="task-board">
            {taskLanes.map((lane,index)=><section className={`task-column ${lane.key}`} key={lane.key} onDragOver={event=>{event.preventDefault();event.currentTarget.classList.add('drag-over');}} onDragLeave={event=>event.currentTarget.classList.remove('drag-over')} onDrop={event=>{event.currentTarget.classList.remove('drag-over');const id=event.dataTransfer.getData("text/task-id");if(id)void moveTask(id,lane.key);}}><header><span className="task-column-dot"/><h2>{lane.name}</h2><b>{tasks.filter(item=>item.status===lane.key).length}</b>{["admin","operator"].includes(user.role)&&<span className="lane-tools"><button disabled={index===0} onClick={()=>void reorderTaskLane(index,-1)}>←</button><button disabled={index===taskLanes.length-1} onClick={()=>void reorderTaskLane(index,1)}>→</button><button onClick={()=>setLaneEditor({lane,name:lane.name})}><Pencil size={11}/></button></span>}</header><div>{tasks.filter(item=>item.status===lane.key).map(task=><article className="task-card" key={task.id} draggable={["admin","operator"].includes(user.role)} onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData("text/task-id",task.id);}} onClick={()=>void openTask(task.id)}><div className="task-priority"><span className={`priority-badge ${task.priority?.toLowerCase()}`}>{task.priority??"P3"}</span><span>{task.incidentCount} incident{task.incidentCount===1?"":"s"}</span><button onClick={event=>{event.stopPropagation();void openTaskClassification(task)}}><Settings size={12}/></button></div>{task.tags?.length>0&&<div className="task-tags">{task.tags.map(tag=><span key={tag.id} style={{'--tag-color':tag.color} as CSSProperties}>{tag.name}</span>)}</div>}<h3>{task.title}</h3><p>{task.description||"No description added."}</p><footer><span>{task.assigneeName||"Unassigned"}</span><small>{task.updateCount} updates</small></footer></article>)}</div></section>)}
          </section></>)}
        {laneEditor&&<div className="modal-backdrop" onMouseDown={()=>setLaneEditor(null)}><section className="modal lane-modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><button className="modal-close" onClick={()=>setLaneEditor(null)}><X/></button><p className="eyebrow">TASK BOARD</p><h2>{laneEditor.lane?"Rename lane":"Create lane"}</h2><p>Choose a short name that describes this workflow stage.</p><form onSubmit={saveTaskLane}><label>Lane name<input autoFocus required maxLength={80} value={laneEditor.name} onChange={event=>setLaneEditor({...laneEditor,name:event.target.value})}/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setLaneEditor(null)}>Cancel</button><button className="primary">{laneEditor.lane?"Save lane":"Create lane"}</button></div></form></section></div>}
        {tagDialog&&<div className="modal-backdrop" onMouseDown={()=>setTagDialog(false)}><section className="modal tag-modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><button className="modal-close" onClick={()=>setTagDialog(false)}><X/></button><p className="eyebrow">TASK CLASSIFICATION</p><h2>Manage tags</h2><div className="tag-catalogue">{taskTags.map(tag=><span key={tag.id} style={{'--tag-color':tag.color} as CSSProperties}>{tag.name}</span>)}</div><form onSubmit={createTaskTag}><label>Tag name<input name="name" required maxLength={40}/></label><label>Colour<input name="color" type="color" defaultValue="#41d69b"/></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setTagDialog(false)}>Done</button><button className="primary">Create tag</button></div></form></section></div>}
        {classifyingTask&&<div className="modal-backdrop" onMouseDown={()=>setClassifyingTask(null)}><section className="modal tag-modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><button className="modal-close" onClick={()=>setClassifyingTask(null)}><X/></button><p className="eyebrow">TASK CLASSIFICATION</p><h2>{classifyingTask.title}</h2><form onSubmit={saveTaskClassification}><label>Priority<select name="priority" defaultValue={classifyingTask.priority}>{(["P1","P2","P3","P4"] as Priority[]).map(item=><option key={item}>{item}</option>)}</select></label><fieldset className="tag-picker"><legend>Tags</legend>{taskTags.map(tag=><label key={tag.id}><input type="checkbox" name="tagIds" value={tag.id} defaultChecked={classifyingTask.selectedTagIds?.includes(tag.id)}/><span style={{'--tag-color':tag.color} as CSSProperties}>{tag.name}</span></label>)}</fieldset><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setClassifyingTask(null)}>Cancel</button><button className="primary">Save classification</button></div></form></section></div>}
        {view === "maintenance" && (
          <section className="maintenance-page">
            <div className="maintenance-summary">
              {(["active","scheduled","overdue","completed"] as const).map(status=><div key={status}><strong>{changes.filter(item=>item.status===status).length}</strong><span>{status}</span></div>)}
            </div>
            <Panel title="Maintenance windows" subtitle="Alert suppression is applied only between the recorded start and estimated end times." className="full-panel">
              <div className="table-wrap"><table><thead><tr><th>CHANGE</th><th>NODES</th><th>MANAGER</th><th>WINDOW</th><th>STATUS</th><th></th></tr></thead><tbody>
                {changes.map(change=><tr key={change.id}><td><strong>{change.changeReference}</strong><small className="account-email">{change.publicDescription}</small></td><td><strong>{change.deviceCount}</strong><small className="account-email">{change.deviceNames.join(", ")}</small></td><td>{change.managerName}</td><td className="maintenance-window"><strong>{new Date(change.startedAt).toLocaleString()}</strong><span>to</span><strong>{new Date(change.estimatedEndAt).toLocaleString()}</strong></td><td><StatusBadge status={change.status}/></td><td><div className="row-actions">{change.status!=="completed"&&<><button className="icon-button" onClick={()=>{setChangeError("");setEditingChange(change)}} title="Edit maintenance"><Pencil size={15}/></button><button className="secondary" disabled={user.role!=="admin"&&change.managerId!==user.id} onClick={()=>void returnChange(change.id)}>{change.status==="scheduled"?"Cancel":"Return"}</button></>}</div></td></tr>)}
                {!changes.length&&<tr><td colSpan={6} className="empty-row">No maintenance windows have been recorded.</td></tr>}
              </tbody></table></div>
            </Panel>
          </section>
        )}
        {view === "backups" && <BackupsPage devices={monitoring} credentials={credentials} canEdit={["admin","operator"].includes(user.role)}/>}
        {view === "logs" && <LogsPage/>}
        {view === "workers" && (
          <section className="page-grid">
            <Panel
              title="HedgeSight topology"
              subtitle={`Live application, database and ${summary.workers.length} registered execution node${summary.workers.length === 1 ? "" : "s"}`}
              className="full-panel"
            >
              <InfrastructureTopology summary={summary}/>
            </Panel>
            <div className="info-strip">
              <Activity />
              <div>
                <strong>Worker heartbeat</strong>
                <p>
                  Workers are shown offline when no heartbeat has been received
                  for 60 seconds.
                </p>
              </div>
            </div>
          </section>
        )}
        {view === "settings" && (
          <section className="settings-layout">
            <div
              className="settings-tabs"
              role="tablist"
              aria-label="Settings sections"
            >
              <button
                className={settingsTab === "data" ? "active" : ""}
                onClick={() => setSettingsTab("data")}
              >
                <Database />{" "}
                <span>
                  <strong>Data & retention</strong>
                  <small>Storage, rollups and lifecycle</small>
                </span>
              </button>
              <button className={settingsTab === "credentials" ? "active" : ""} onClick={() => setSettingsTab("credentials")}>
                <LockKeyhole /> <span><strong>Credentials</strong><small>SSH and vSphere accounts</small></span>
              </button>
              <button
                className={settingsTab === "accounts" ? "active" : ""}
                onClick={() => setSettingsTab("accounts")}
              >
                <Users />{" "}
                <span>
                  <strong>Account management</strong>
                  <small>Local users and roles</small>
                </span>
              </button>
              <button
                className={settingsTab === "authentication" ? "active" : ""}
                onClick={() => setSettingsTab("authentication")}
              >
                <KeyRound />{" "}
                <span>
                  <strong>Authentication</strong>
                  <small>Local login and OAuth2/OIDC</small>
                </span>
              </button>
              <button
                className={settingsTab === "system" ? "active" : ""}
                onClick={() => setSettingsTab("system")}
              >
                <Settings />{" "}
                <span>
                  <strong>System</strong>
                  <small>Runtime and maintenance</small>
                </span>
              </button>
            </div>
            <div className="settings-content">
              {settingsTab === "data" && (
                <>
                  <div className="setting-card">
                    <Database />
                    <div>
                      <span>DATA STORE</span>
                      <h2>
                        PostgreSQL · {formatBytes(storage?.databaseBytes)}
                      </h2>
                      <p>
                        {storage?.interfaces ?? 0} interfaces ·{" "}
                        {storage?.interfaceSamples ?? 0} raw samples ·{" "}
                        {storage?.rollups ?? 0} rollups
                      </p>
                    </div>
                    <StatusBadge status="up" />
                  </div>
                  <Panel
                    title="Global retention policy"
                    subtitle="Device-specific overrides inherit from these defaults"
                    className="full-panel"
                  >
                    <form className="retention-form" onSubmit={saveRetention}>
                      {(
                        [
                          ["rawDays", "Raw samples"],
                          ["fiveMinuteDays", "5-minute rollups"],
                          ["hourlyDays", "Hourly rollups"],
                          ["dailyDays", "Daily rollups"],
                          ["incidentDays", "Incidents"],
                          ["configurationDays", "Configurations"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key}>
                          <span>{label}</span>
                          <div>
                            <input
                              type="number"
                              min="1"
                              value={retention[key]}
                              onChange={(event) =>
                                setRetention({
                                  ...retention,
                                  [key]: Number(event.target.value),
                                })
                              }
                            />
                            <small>days</small>
                          </div>
                        </label>
                      ))}
                      <div className="retention-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void runMaintenance()}
                        >
                          <RefreshCw size={15} /> Run maintenance
                        </button>
                        <button className="primary">
                          {retentionSaved ? "Saved" : "Save policy"}
                        </button>
                      </div>
                    </form>
                  </Panel>
                  <Panel title="System log policy" subtitle="Controls which HedgeSight application and worker events are retained" className="full-panel"><form className="log-settings-form" onSubmit={saveLogSettings}><label>Minimum stored level<select value={logSettings.minimumLevel} onChange={event=>setLogSettings({...logSettings,minimumLevel:event.target.value as typeof logSettings.minimumLevel})}><option value="debug">Debug · everything</option><option value="info">Info · normal activity</option><option value="warn">Warning · problems only</option><option value="error">Error · failures only</option></select></label><label>Log retention<input type="number" min="1" max="3650" value={logSettings.retentionDays} onChange={event=>setLogSettings({...logSettings,retentionDays:Number(event.target.value)})}/><small>days</small></label><button className="primary">{logSettingsSaved?"Saved":"Save log policy"}</button></form></Panel>
                  <Panel title="PostgreSQL database" subtitle="Remote database changes are applied after an automatic application restart." className="full-panel">
                    <div className="database-panel-body"><div className="database-current"><Database/><div><small>CURRENT DATABASE</small><strong>{databaseStatus?`${databaseStatus.host}:${databaseStatus.port} / ${databaseStatus.database}`:"Loading…"}</strong><span>{databaseStatus?.source==="managed-file"?"Managed through HedgeSight":"Provided by deployment environment"} · TLS {databaseStatus?.tls??"unspecified"}</span></div></div>
                    <form className="database-switch-form" onSubmit={switchDatabase}><label>Remote PostgreSQL connection URL<input name="connectionString" type="password" required autoComplete="off" placeholder="postgresql://user:password@database.example.com:5432/hedgesight?sslmode=require"/></label><p>Export configuration before switching. HedgeSight creates its schema on the target, but does not copy users, incidents, metrics, credentials or configuration automatically.</p><div className="database-actions"><button className="primary"><Database size={15}/> Test, connect and restart</button></div></form></div>
                  </Panel>
                </>
              )}
              {settingsTab === "credentials"&&<><div className="settings-title"><p className="eyebrow">SECRET STORE</p><h2>Device credentials</h2><p>Encrypted, write-only credentials used by polling workers for short-lived SSH sessions.</p></div>{credentialError&&<div className="error">{credentialError}</div>}<Panel title="Stored credentials" subtitle={`${credentials.length} encrypted credential${credentials.length===1?"":"s"}`} className="full-panel"><div className="table-wrap"><table><thead><tr><th>NAME</th><th>USERNAME</th><th>ASSIGNED DEVICES</th><th>UPDATED</th><th></th></tr></thead><tbody>{credentials.map(item=><tr key={item.id}><td><strong>{item.name}</strong></td><td className="mono">{item.username}</td><td>{item.deviceCount}</td><td>{relativeTime(item.updatedAt)}</td><td><button className="icon-button danger" disabled={item.deviceCount>0} onClick={()=>void deleteCredential(item)} title={item.deviceCount?"Remove assignments first":"Delete credential"}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div></Panel><Panel title="Add SSH credential" subtitle="The password is encrypted immediately and cannot be read back through the interface." className="full-panel"><form className="account-form" onSubmit={createCredential}><label>Credential name<input name="name" required placeholder="Linux monitoring account"/></label><label>Username<input name="username" required autoComplete="off"/></label><label>Password<input name="password" type="password" required autoComplete="new-password"/></label><button className="primary"><LockKeyhole size={15}/>Encrypt and save</button></form></Panel></>}
              {settingsTab === "accounts" && (
                <>
                  <div className="settings-title">
                    <p className="eyebrow">ACCESS CONTROL</p>
                    <h2>Account management</h2>
                    <p>
                      Create local users and review how each account signs in.
                    </p>
                  </div>
                  {accountError && <div className="error">{accountError}</div>}
                  <Panel
                    title="Local and linked accounts"
                    subtitle={`${accounts.length} configured account${accounts.length === 1 ? "" : "s"}`}
                    className="full-panel"
                  >
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>USER</th>
                            <th>ROLE</th>
                            <th>SIGN-IN</th>
                            <th>LAST LOGIN</th>
                            <th>STATE</th>
                            <th>ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accounts.map((account) => (
                            <tr key={account.id}>
                              <td>
                                <strong>{account.displayName}</strong>
                                {account.isProtected && (
                                  <span className="protected-label">
                                    Original admin
                                  </span>
                                )}
                                <small className="account-email">
                                  {account.email}
                                </small>
                              </td>
                              <td>
                                <span className="role-pill">
                                  {account.role}
                                </span>
                              </td>
                              <td>
                                {[
                                  account.hasLocalPassword && "Local",
                                  account.hasOidcIdentity && "OIDC",
                                ]
                                  .filter(Boolean)
                                  .join(" + ") || "None"}
                              </td>
                              <td>{relativeTime(account.lastLoginAt)}</td>
                              <td>
                                <StatusBadge
                                  status={account.enabled ? "up" : "disabled"}
                                />
                              </td>
                              <td>
                                <div className="user-actions">
                                  <button
                                    disabled={account.isProtected}
                                    onClick={() => setEditingAccount(account)}
                                    title={
                                      account.isProtected
                                        ? "The original administrator is protected"
                                        : "Edit account"
                                    }
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    className="danger"
                                    disabled={
                                      account.isProtected || account.isCurrent
                                    }
                                    onClick={() => void deleteAccount(account)}
                                    title={
                                      account.isProtected
                                        ? "The original administrator is protected"
                                        : account.isCurrent
                                          ? "You cannot delete your current account"
                                          : "Delete account"
                                    }
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                  <Panel
                    title="Add local account"
                    subtitle="Passwords must contain at least 12 characters"
                    className="full-panel"
                  >
                    <form className="account-form" onSubmit={createAccount}>
                      <label>
                        Display name
                        <input name="displayName" required />
                      </label>
                      <label>
                        Email address
                        <input name="email" type="email" required />
                      </label>
                      <label>
                        Role
                        <select name="role" defaultValue="viewer">
                          <option value="viewer">Viewer</option>
                          <option value="operator">Operator</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </label>
                      <label>
                        Temporary password
                        <input
                          name="password"
                          type="password"
                          minLength={12}
                          required
                        />
                      </label>
                      <button className="primary">
                        <Plus size={15} /> Add account
                      </button>
                    </form>
                  </Panel>
                </>
              )}
              {settingsTab === "authentication" && (
                <>
                  <div className="settings-title">
                    <p className="eyebrow">IDENTITY</p>
                    <h2>Authentication</h2>
                    <p>Configure local sign-in and OAuth2/OpenID Connect.</p>
                  </div>
                  <div className="auth-setting-grid">
                    <article className="auth-setting-card">
                      <div>
                        <KeyRound />
                        <span>
                          <strong>Local accounts</strong>
                          <small>
                            Built-in username and password authentication
                          </small>
                        </span>
                      </div>
                      <StatusBadge
                        status={
                          authenticationSettings?.localAccountsEnabled
                            ? "up"
                            : "disabled"
                        }
                      />
                      <dl>
                        <div>
                          <dt>SESSION LIFETIME</dt>
                          <dd>
                            {authenticationSettings?.sessionDays ?? "—"} days
                          </dd>
                        </div>
                        <div>
                          <dt>SECURE COOKIE</dt>
                          <dd>
                            {authenticationSettings?.cookieSecure
                              ? "Enabled"
                              : "Disabled"}
                          </dd>
                        </div>
                      </dl>
                    </article>
                    <article className="auth-setting-card">
                      <div>
                        <ShieldCheck />
                        <span>
                          <strong>OAuth2 / OpenID Connect</strong>
                          <small>Authorization Code flow with PKCE</small>
                        </span>
                      </div>
                      <StatusBadge
                        status={
                          authenticationSettings?.oidc.enabled
                            ? "up"
                            : "disabled"
                        }
                      />
                      <dl>
                        <div>
                          <dt>CONFIGURATION SOURCE</dt>
                          <dd>{authenticationSettings?.oidc.source ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>CLIENT SECRET</dt>
                          <dd>
                            {authenticationSettings?.oidc.clientSecretConfigured
                              ? "Configured · encrypted and hidden"
                              : "Not configured"}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  </div>
                  <Panel
                    title="OAuth2 / OpenID Connect"
                    subtitle="Use your provider’s OpenID Connect discovery URL and register the callback exactly"
                    className="full-panel"
                  >
                    <form className="oidc-form" onSubmit={saveOidc}>
                      <label className="toggle-label">
                        <input
                          type="checkbox"
                          name="localAccountsEnabled"
                          defaultChecked={authenticationSettings?.localAccountsEnabled ?? true}
                        />{" "}
                        Allow local username and password sign-in
                      </label>
                      <label className="toggle-label">
                        <input
                          type="checkbox"
                          name="enabled"
                          defaultChecked={authenticationSettings?.oidc.enabled}
                        />{" "}
                        Enable OAuth2 / OIDC sign-in
                      </label>
                      <label>
                        Issuer URL
                        <input
                          name="issuerUrl"
                          type="url"
                          defaultValue={
                            authenticationSettings?.oidc.issuerUrl ?? ""
                          }
                          placeholder="https://login.example.com/realms/hedgesight"
                        />
                      </label>
                      <label>
                        Client ID
                        <input
                          name="clientId"
                          defaultValue={
                            authenticationSettings?.oidc.clientId ?? ""
                          }
                          placeholder="hedgesight"
                        />
                      </label>
                      <label>
                        Client secret
                        <input
                          name="clientSecret"
                          type="password"
                          placeholder={
                            authenticationSettings?.oidc.clientSecretConfigured
                              ? "Leave blank to keep the existing secret"
                              : "Enter client secret"
                          }
                        />
                      </label>
                      <label>
                        Callback URL
                        <input
                          name="redirectUri"
                          type="url"
                          defaultValue={
                            authenticationSettings?.oidc.redirectUri ??
                            `${location.origin}/api/auth/oidc/callback`
                          }
                        />
                      </label>
                      <div className="oidc-actions">
                        <span
                          className={
                            authenticationMessage.includes("saved")
                              ? "saved-message"
                              : "form-error"
                          }
                        >
                          {authenticationMessage}
                        </span>
                        <button className="primary">
                          <ShieldCheck size={15} /> Save OIDC settings
                        </button>
                      </div>
                    </form>
                  </Panel>
                  <div className="info-strip">
                    <ShieldCheck />
                    <div>
                      <strong>Secrets stay server-side</strong>
                      <p>
                        The client secret is encrypted with HedgeSight’s
                        configuration key and is never returned to the browser.
                        Saving takes effect immediately; no container restart is
                        required.
                      </p>
                    </div>
                  </div>
                </>
              )}
              {settingsTab === "system" && (
                <>
                  <div className="settings-title">
                    <p className="eyebrow">PLATFORM</p>
                    <h2>System</h2>
                    <p>Runtime status, configuration portability and platform maintenance.</p>
                  </div>
                  {configurationMessage&&<div className="info-strip"><Database/><div><strong>Configuration</strong><p>{configurationMessage}</p></div></div>}
                  <Panel title="Configuration export and import" subtitle="Move nodes, groups, checks, thresholds and retention settings between HedgeSight installations." className="full-panel"><div className="portable-config"><section><h3>Export configuration</h3><p>Downloads a portable JSON package. Metrics, incidents, users and secret credential values are intentionally excluded.</p><button className="primary" onClick={()=>void exportConfiguration()}><Archive size={15}/> Export configuration</button></section><form onSubmit={importConfiguration}><h3>Import configuration</h3><label>Configuration package<input name="configuration" type="file" accept="application/json,.json" required disabled={configurationBusy}/></label><label>Import mode<select name="mode" defaultValue="merge" disabled={configurationBusy}><option value="merge">Merge with existing nodes</option><option value="replace">Replace configured nodes</option></select></label><button className="secondary" disabled={configurationBusy}><RefreshCw size={15}/>{configurationBusy?" Importing…":" Import package"}</button>{configurationMessage&&<p className="configuration-feedback" role="status">{configurationMessage}</p>}</form></div></Panel>
                  <div className="setting-card">
                    <RefreshCw />
                    <div>
                      <span>LAST MAINTENANCE</span>
                      <h2>
                        {storage?.lastMaintenance?.status ?? "Not run yet"}
                      </h2>
                      <p>
                        {storage?.lastMaintenance?.finishedAt
                          ? `${relativeTime(storage.lastMaintenance.finishedAt)} · ${storage.lastMaintenance.rowsDeleted} expired rows removed`
                          : "Rollups and retention run automatically every hour."}
                      </p>
                    </div>
                    <span className="setting-value">0.1.0-dev</span>
                  </div>
                  <div className="setting-card">
                    <ShieldCheck />
                    <div>
                      <span>CONFIGURATION STORAGE</span>
                      <h2>AES-256 encrypted</h2>
                      <p>
                        {storage?.configurationSnapshots ?? 0} deduplicated
                        snapshots stored.
                      </p>
                    </div>
                    <StatusBadge status="up" />
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </main>
      {dialog && (
        <div className="modal-backdrop" onMouseDown={() => setDialog(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setDialog(false)}
              aria-label="Close"
            >
              <X />
            </button>
            <p className="eyebrow">DEVICE INVENTORY</p>
            <h2 id="add-title">Add a monitored device</h2>
            <p>
              Choose ICMP or a TCP connection to port 22 for initial
              reachability.
            </p>
            <form onSubmit={addDevice}>
              <label>
                Name
                <input
                  name="name"
                  placeholder="Core switch 01"
                  required
                  autoFocus
                />
              </label>
              <label>
                Address
                <input name="address" placeholder="10.20.0.1" required />
              </label>
              <label>
                Reachability method
                <select name="reachabilityMode" defaultValue="icmp">
                  <option value="icmp">ICMP Ping</option>
                  <option value="tcp">TCP connection</option>
                </select>
              </label>
              <label>
                TCP port
                <input
                  name="tcpPort"
                  type="number"
                  min="1"
                  max="65535"
                  defaultValue="22"
                />
              </label>
              <label>
                Polling interval
                <select name="pingIntervalSeconds" defaultValue="60">
                  <option value="10">10 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="60">1 minute</option>
                  <option value="300">5 minutes</option>
                  <option value="900">15 minutes</option>
                </select>
              </label>
              <label>
                Description
                <textarea
                  name="description"
                  placeholder="Primary distribution switch"
                  rows={3}
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setDialog(false)}
                >
                  Cancel
                </button>
                <button className="primary">Add and monitor</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {deviceDetail&&<div className="modal-backdrop" onMouseDown={()=>setDeviceDetail(null)}><section className="modal wide-modal device-profile-modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><button className="modal-close" onClick={()=>setDeviceDetail(null)}><X/></button><p className="eyebrow">DEVICE PROFILE · {deviceDetail.sshProfiledAt?`COLLECTED ${relativeTime(deviceDetail.sshProfiledAt)}`:"NOT YET COLLECTED"}</p><h2>{String(deviceDetail.sshProfile.hostname??deviceDetail.name)}</h2><p>{String(deviceDetail.sshProfile.osName??deviceDetail.osName??"Operating system unknown")} {String(deviceDetail.sshProfile.osVersion??deviceDetail.osVersion??"")}</p><div className="profile-fact-grid"><article><small>CPU</small><strong>{String(deviceDetail.sshProfile.cpuCount??"—")} logical cores</strong></article><article><small>MEMORY</small><strong>{formatBytes(String(deviceDetail.sshProfile.memoryBytes??0))}</strong></article><article><small>UPTIME</small><strong>{availabilityDuration(String(deviceDetail.sshProfile.uptimeSeconds??0))}</strong></article><article><small>KERNEL</small><strong>{String(deviceDetail.sshProfile.kernel??"—")}</strong></article></div><h3>Filesystems</h3><div className="profile-table">{((deviceDetail.sshProfile.filesystems as Array<Record<string,unknown>>) || []).map((disk,index)=><article key={index}><div><strong>{String(disk.mount)}</strong><small>{String(disk.filesystem)}</small></div><span>{formatBytes(String(disk.usedBytes))} / {formatBytes(String(disk.totalBytes))}</span><b>{String(disk.usedPercent)}%</b></article>)}</div><h3>Network adapters</h3><div className="profile-table">{((deviceDetail.sshProfile.interfaces as Array<Record<string,unknown>>) || []).map((adapter,index)=><article key={index}><div><strong>{String(adapter.name)}</strong><small>{String(adapter.macAddress??"")}</small></div><span>MTU {String(adapter.mtu??"—")}</span><b>{String(adapter.state??"unknown")}</b></article>)}</div><div className="secret-note"><LockKeyhole size={16}/><span>SSH host key: {deviceDetail.sshCredentialName?"trusted and pinned after first successful profile":"SSH profiling is not configured"}</span></div></section></div>}
      {chart&&<div className="modal-backdrop" onMouseDown={()=>setChart(null)}><section className="modal wide-modal chart-modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><button className="modal-close" onClick={()=>setChart(null)}><X/></button><div className="chart-header"><div><p className="eyebrow">METRIC HISTORY</p><h2>{chart.title}</h2></div><label>Time window<select value={chartHours} onChange={event=>setChartHours(Number(event.target.value))}><option value="1">Last hour</option><option value="6">Last 6 hours</option><option value="24">Last 24 hours</option><option value="168">Last 7 days</option><option value="720">Last 30 days</option></select></label></div>{chartLoading?<div className="chart-empty">Loading samples…</div>:<TimeChart points={chartData} kind={chart.kind} unit={chart.unit} hours={chartHours}/>}</section></div>}
      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(null)}>
          <section
            className="modal wide-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setEditing(null)}
              aria-label="Close"
            >
              <X />
            </button>
            <p className="eyebrow">DEVICE MANAGEMENT</p>
            <h2>Edit {editing.name}</h2>
            <div className="device-edit-tabs" role="tablist"><button type="button" className={deviceEditTab==="general"?"active":""} onClick={()=>setDeviceEditTab("general")}>General</button><button type="button" className={deviceEditTab==="monitoring"?"active":""} onClick={()=>setDeviceEditTab("monitoring")}>Monitoring</button></div>
            <form className={`edit-grid ${deviceEditTab}-view platform-${monitoringPlatform}`} onSubmit={saveDevice}>
              <div className="monitoring-only monitoring-platform-select"><label>Monitoring platform<select value={monitoringPlatform} onChange={event=>setMonitoringPlatform(event.target.value as "linux"|"vmware")}><option value="linux">Linux · SSH</option><option value="vmware">VMware · vSphere API</option></select></label><p>{monitoringPlatform==="linux"?"Profile Linux hosts and collect component metrics using short-lived SSH sessions.":"Profile ESXi hosts and collect supported metrics through HTTPS on the vSphere API."}</p></div>
              <label>
                Name
                <input name="name" defaultValue={editing.name} required />
              </label>
              <label>
                Address
                <input name="address" defaultValue={editing.address} required />
              </label>
              <label>
                Reachability method
                <select
                  name="reachabilityMode"
                  defaultValue={editing.reachabilityMode}
                >
                  <option value="icmp">ICMP Ping</option>
                  <option value="tcp">TCP connection</option>
                </select>
              </label>
              <label>
                TCP port
                <input
                  name="tcpPort"
                  type="number"
                  min="1"
                  max="65535"
                  defaultValue={editing.tcpPort}
                />
              </label>
              <label>
                Polling interval
                <select
                  name="pingIntervalSeconds"
                  defaultValue={editing.intervalSeconds ?? 60}
                >
                  <option value="10">10 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="60">1 minute</option>
                  <option value="300">5 minutes</option>
                  <option value="900">15 minutes</option>
                </select>
              </label>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={editing.enabled}
                />{" "}
                Monitoring enabled
              </label>
              <label>
                OS name
                <input
                  name="osName"
                  defaultValue={editing.osName ?? ""}
                  placeholder="Linux"
                />
              </label>
              <fieldset className="full-field ssh-config advanced-monitoring monitoring-only platform-linux-settings">
                <legend>Advanced Linux monitoring</legend>
                <label className="toggle-label"><input type="checkbox" name="sshEnabled" defaultChecked={Boolean(editing.sshEnabled)}/> Collect selected component metrics over SSH</label>
                <label>Stored credential<select name="sshCredentialId" defaultValue={editing.sshCredentialId??""}><option value="">Select credential</option>{credentials.map(item=><option key={item.id} value={item.id}>{item.name} · {item.username}</option>)}</select></label>
                <label>SSH port<input name="sshPort" type="number" min="1" max="65535" defaultValue={editing.sshPort??22}/></label>
                <label>Snapshot interval<select name="sshIntervalSeconds" defaultValue={editing.sshIntervalSeconds??900}><option value="60">1 minute</option><option value="300">5 minutes</option><option value="900">15 minutes</option><option value="3600">1 hour</option></select></label>
                <div className="component-inventory"><strong>Discovered components <small>Click to include or exclude</small></strong>
                  {[{id:"cpu",label:`CPU · ${String(editing.sshProfile.cpuCount??"—")} cores`},{id:"memory",label:`RAM · ${formatBytes(String(editing.sshProfile.memoryBytes??0))}`}].map(component=><label key={component.id} className="component-toggle"><input type="checkbox" name="monitoredComponents" value={component.id} defaultChecked={!Array.isArray(editing.sshThresholds.monitoredComponents)||(editing.sshThresholds.monitoredComponents as string[]).includes(component.id)}/><span>{component.label}</span></label>)}
                  {((editing.sshProfile.filesystems as Array<Record<string,unknown>>)||[]).map(item=>{const id=`disk:${String(item.mount)}`;return <label key={id} className="component-toggle"><input type="checkbox" name="monitoredComponents" value={id} defaultChecked={!Array.isArray(editing.sshThresholds.monitoredComponents)||(editing.sshThresholds.monitoredComponents as string[]).includes(id)}/><span>Disk · {String(item.mount)}</span></label>})}
                  {((editing.sshProfile.interfaces as Array<Record<string,unknown>>)||[]).map(item=>{const id=`interface:${String(item.name)}`;return <label key={id} className="component-toggle"><input type="checkbox" name="monitoredComponents" value={id} defaultChecked={!Array.isArray(editing.sshThresholds.monitoredComponents)||(editing.sshThresholds.monitoredComponents as string[]).includes(id)}/><span>Interface · {String(item.name)}</span></label>})}
                </div>
                <div className="threshold-grid"><strong>Alert thresholds</strong><label>CPU utilisation %<input name="cpuThresholdPercent" type="number" min="1" max="100" defaultValue={Number(editing.sshThresholds.cpuThresholdPercent??90)}/></label><label>Memory utilisation %<input name="memoryThresholdPercent" type="number" min="1" max="100" defaultValue={Number(editing.sshThresholds.memoryThresholdPercent??90)}/></label><label>Disk used %<input name="diskThresholdPercent" type="number" min="1" max="100" defaultValue={Number(editing.sshThresholds.diskThresholdPercent??90)}/></label><label>Interface utilisation %<input name="interfaceThresholdPercent" type="number" min="1" max="100" defaultValue={Number(editing.sshThresholds.interfaceThresholdPercent??90)}/></label><label>Interface errors<input name="interfaceErrorThreshold" type="number" min="0" defaultValue={Number(editing.sshThresholds.interfaceErrorThreshold??1)}/></label></div>
                <small>Unselected components remain discoverable but no longer store samples or trigger threshold alerts.</small>
              </fieldset>
              <fieldset className="full-field ssh-config advanced-monitoring vsphere-config monitoring-only platform-vmware-settings">
                <legend>VMware ESXi / vSphere monitoring</legend>
                <label className="toggle-label"><input type="checkbox" name="vsphereEnabled" defaultChecked={Boolean(editing.vsphereEnabled)}/> Profile and monitor this host through the supported vSphere API</label>
                <label>Stored credential<select name="vsphereCredentialId" defaultValue={editing.vsphereCredentialId??""}><option value="">Select read-only credential</option>{credentials.map(item=><option key={item.id} value={item.id}>{item.name} · {item.username}</option>)}</select></label>
                <label>HTTPS port<input name="vspherePort" type="number" min="1" max="65535" defaultValue={editing.vspherePort??443}/></label>
                <label>Snapshot interval<select name="vsphereIntervalSeconds" defaultValue={editing.vsphereIntervalSeconds??300}><option value="60">1 minute</option><option value="300">5 minutes</option><option value="900">15 minutes</option><option value="3600">1 hour</option></select></label>
                <label className="toggle-label"><input type="checkbox" name="vsphereVerifyTls" defaultChecked={editing.vsphereVerifyTls!==false}/> Verify the ESXi/vCenter TLS certificate</label>
                <div className="component-inventory"><strong>Discovered vSphere components <small>Click to include or exclude</small></strong>
                  {[{id:"cpu",label:`Host CPU · ${String(editing.vsphereProfile.cpuCount??"—")} cores`},{id:"memory",label:`Host RAM · ${formatBytes(String(editing.vsphereProfile.memoryBytes??0))}`}].map(component=><label key={component.id} className="component-toggle"><input type="checkbox" name="vsphereMonitoredComponents" value={component.id} defaultChecked={!Array.isArray(editing.vsphereThresholds.monitoredComponents)||(editing.vsphereThresholds.monitoredComponents as string[]).includes(component.id)}/><span>{component.label}</span></label>)}
                  {((editing.vsphereProfile.datastores as Array<Record<string,unknown>>)||[]).map(item=>{const id=`datastore:${String(item.id)}`;return <label key={id} className="component-toggle"><input type="checkbox" name="vsphereMonitoredComponents" value={id} defaultChecked={!Array.isArray(editing.vsphereThresholds.monitoredComponents)||(editing.vsphereThresholds.monitoredComponents as string[]).includes(id)}/><span>Datastore · {String(item.name)}</span></label>})}
                  {((editing.vsphereProfile.interfaces as Array<Record<string,unknown>>)||[]).map(item=>{const id=`interface:${String(item.name)}`;return <label key={id} className="component-toggle"><input type="checkbox" name="vsphereMonitoredComponents" value={id} defaultChecked={!Array.isArray(editing.vsphereThresholds.monitoredComponents)||(editing.vsphereThresholds.monitoredComponents as string[]).includes(id)}/><span>Physical NIC · {String(item.name)} · {String(item.speedMbps??"—")} Mbps · {item.linkUp?"link up":"link down"}</span></label>})}
                </div>
                <div className="threshold-grid"><strong>Alert thresholds</strong><label>CPU utilisation %<input name="vsphereCpuThresholdPercent" type="number" min="1" max="100" defaultValue={Number(editing.vsphereThresholds.cpuThresholdPercent??90)}/></label><label>Memory utilisation %<input name="vsphereMemoryThresholdPercent" type="number" min="1" max="100" defaultValue={Number(editing.vsphereThresholds.memoryThresholdPercent??90)}/></label><label>Datastore used %<input name="vsphereDatastoreThresholdPercent" type="number" min="1" max="100" defaultValue={Number(editing.vsphereThresholds.diskThresholdPercent??90)}/></label></div>
                <small>Uses short-lived vSphere API sessions over HTTPS. Use a read-only account. Disable certificate verification only for a trusted self-signed management endpoint.</small>
              </fieldset>
              <label>
                OS version
                <input
                  name="osVersion"
                  defaultValue={editing.osVersion ?? ""}
                />
              </label>
              <label>
                Device type
                <input
                  name="deviceType"
                  defaultValue={editing.deviceType ?? ""}
                  placeholder="Server"
                />
              </label>
              <label>
                Vendor
                <input name="vendor" defaultValue={editing.vendor ?? ""} />
              </label>
              <label>
                Model
                <input name="model" defaultValue={editing.model ?? ""} />
              </label>
              <label className="full-field">
                Description
                <textarea
                  name="description"
                  defaultValue={editing.description}
                  rows={3}
                />
              </label>
              <fieldset className="full-field group-picker">
                <legend>Groups</legend>
                {groups.length ? (
                  groups.map((group) => (
                    <label key={group.id}>
                      <input
                        type="checkbox"
                        name="groupIds"
                        value={group.id}
                        defaultChecked={editing.groups.some(
                          (item) => item.id === group.id,
                        )}
                      />
                      <span style={{ borderColor: group.color }}>
                        {group.name}
                      </span>
                    </label>
                  ))
                ) : (
                  <small>Create a group using the toolbar first.</small>
                )}
              </fieldset>
              <div className="modal-actions full-field">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button className="primary">Save changes</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {editingAccount && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setEditingAccount(null)}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setEditingAccount(null)}
              aria-label="Close"
            >
              <X />
            </button>
            <p className="eyebrow">ACCOUNT MANAGEMENT</p>
            <h2>Edit {editingAccount.displayName}</h2>
            <p>Leave the password blank to keep the current password.</p>
            <form onSubmit={saveAccount}>
              <label>
                Display name
                <input
                  name="displayName"
                  defaultValue={editingAccount.displayName}
                  required
                  autoFocus
                />
              </label>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  defaultValue={editingAccount.email}
                  required
                />
              </label>
              <label>
                Role
                <select name="role" defaultValue={editingAccount.role}>
                  <option value="viewer">Viewer</option>
                  <option value="operator">Operator</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>
              <label>
                New password
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  placeholder="Leave blank to keep current password"
                />
              </label>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={editingAccount.enabled}
                />{" "}
                Account enabled
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditingAccount(null)}
                >
                  Cancel
                </button>
                <button className="primary">Save account</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {taskDialog&&<div className="modal-backdrop" onMouseDown={()=>setTaskDialog(false)}><section className="modal task-modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><button className="modal-close" onClick={()=>setTaskDialog(false)}><X/></button><p className="eyebrow">FOLLOW-UP ACTION</p><h2>Create task</h2><form onSubmit={createTask}><label>Title<input name="title" required autoFocus maxLength={200}/></label><label>Description<textarea name="description" rows={4} maxLength={4000}/></label><label>Assignee<select name="assigneeId"><option value="">Unassigned</option>{taskAssignees.map(item=><option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label><fieldset className="task-incident-picker"><legend>Link incidents</legend>{incidents.map(item=><label key={item.id}><input type="checkbox" name="incidentIds" value={item.id}/><span>{item.deviceName}<small>{incidentStatus(item.status)} · {relativeTime(item.openedAt)}</small></span></label>)}</fieldset>{taskError&&<div className="form-error">{taskError}</div>}<div className="modal-actions"><button type="button" className="secondary" onClick={()=>setTaskDialog(false)}>Cancel</button><button className="primary">Create task</button></div></form></section></div>}
      {incidentTaskDialog&&selectedIncident&&<div className="modal-backdrop" onMouseDown={()=>setIncidentTaskDialog(false)}><section className="modal task-modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><button className="modal-close" onClick={()=>setIncidentTaskDialog(false)}><X/></button><p className="eyebrow">RESOLVE WITH FOLLOW-UP</p><h2>Create root-cause task</h2><p>The incident will close and remain linked to this backlog task.</p><form onSubmit={resolveWithTask}><label>Task title<input name="title" required autoFocus defaultValue={`${selectedIncident.deviceName}: root-cause follow-up`}/></label><label>Description<textarea name="description" rows={4} defaultValue={`Investigate the root cause of the ${selectedIncident.checkName} outage opened ${new Date(selectedIncident.openedAt).toLocaleString()}.`}/></label><label>Assignee<select name="assigneeId"><option value="">Unassigned</option>{taskAssignees.map(item=><option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setIncidentTaskDialog(false)}>Cancel</button><button className="primary">Resolve & create task</button></div></form></section></div>}
      {selectedTask&&<div className="modal-backdrop" onMouseDown={()=>setSelectedTask(null)}><section className="modal wide-modal task-detail-modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><button className="modal-close" onClick={()=>setSelectedTask(null)}><X/></button><p className="eyebrow">TASK DETAIL · {selectedTask.incidents.length} LINKED INCIDENTS</p><form className="task-edit-form" onSubmit={saveTask}><label>Title<input name="title" defaultValue={selectedTask.title} required/></label><label>Description<textarea name="description" rows={4} defaultValue={selectedTask.description}/></label><div className="task-fields"><label>Status<select name="status" defaultValue={selectedTask.status}><option value="backlog">Backlog</option><option value="in_progress">In progress</option><option value="testing">Testing</option><option value="completed">Completed</option></select></label><label>Assignee<select name="assigneeId" defaultValue={selectedTask.assigneeId??""}><option value="">Unassigned</option>{taskAssignees.map(item=><option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label></div><button className="primary">Save task</button></form><div className="task-detail-grid"><section><h3>Updates</h3><div className="task-updates">{selectedTask.updates.map(item=><article key={item.id}><strong>{item.authorName}</strong><time>{new Date(item.createdAt).toLocaleString()}</time><p>{item.body}</p></article>)}</div><form className="task-update-form" onSubmit={addTaskUpdate}><textarea name="body" required rows={3} placeholder="Add investigation notes or progress…"/><button className="primary">Post update</button></form></section><aside><h3>Linked incidents</h3>{selectedTask.incidents.map(item=><button key={item.id} className="linked-incident" onClick={()=>void openIncident(item.id)}><span>{item.deviceName}</span><small>{incidentStatus(item.status)}</small></button>)}<form className="link-incidents-form" onSubmit={linkTaskIncidents}><fieldset className="task-incident-picker"><legend>Add incidents</legend>{incidents.filter(item=>!selectedTask.incidents.some(link=>link.id===item.id)).map(item=><label key={item.id}><input type="checkbox" name="incidentIds" value={item.id}/><span>{item.deviceName}</span></label>)}</fieldset><button className="secondary">Link selected</button></form></aside></div></section></div>}
      {changeDialog && (
        <div className="modal-backdrop" onMouseDown={()=>setChangeDialog(false)}>
          <section className="modal change-modal" role="dialog" aria-modal="true" aria-labelledby="change-title" onMouseDown={event=>event.stopPropagation()}>
            <button className="modal-close" onClick={()=>setChangeDialog(false)} aria-label="Close"><X/></button>
            <p className="eyebrow">CHANGE MANAGEMENT</p>
            <h2 id="change-title">Put {selectedDevices.length} node{selectedDevices.length===1?"":"s"} under change</h2>
            <p>Polling continues, but down states and new outage incidents are suppressed until the assigned manager returns these nodes.</p>
            <form onSubmit={createChange}>
              <label>Change record<input name="changeReference" required autoFocus maxLength={200} placeholder="CHG0001234 — Core switch upgrade"/></label>
              <label>Public description<textarea name="publicDescription" required maxLength={1000} rows={3} placeholder="Briefly explain what is changing and what users may notice."/></label>
              <label>Change manager<select name="managerId" required defaultValue={user.id}>{changeManagers.map(manager=><option key={manager.id} value={manager.id}>{manager.displayName} · {manager.email}</option>)}</select></label>
              <div className="change-window-fields"><label>Start time<input name="startedAt" type="datetime-local" required defaultValue={dateTimeLocalValue()}/></label><label>Estimated end time<input name="estimatedEndAt" type="datetime-local" required defaultValue={dateTimeLocalValue(120)}/></label></div>
              <div className="change-node-list">{selectedDevices.map(id=>{const device=monitoring.find(item=>item.id===id);return device?<span key={id}><Server size={13}/>{device.name}<small>{device.address}</small></span>:null})}</div>
              {changeError&&<div className="form-error">{changeError}</div>}
              <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setChangeDialog(false)}>Cancel</button><button className="primary"><Wrench size={15}/> Start maintenance</button></div>
            </form>
          </section>
        </div>
      )}
      {editingChange&&(
        <div className="modal-backdrop" onMouseDown={()=>setEditingChange(null)}>
          <section className="modal change-modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}>
            <button className="modal-close" onClick={()=>setEditingChange(null)} aria-label="Close"><X/></button>
            <p className="eyebrow">EDIT MAINTENANCE</p><h2>{editingChange.changeReference}</h2>
            <p>The estimated end is the hard alert-suppression boundary. Extending an overdue window resumes suppression until the new end.</p>
            <form onSubmit={saveChange}>
              <label>Change record<input name="changeReference" required maxLength={200} defaultValue={editingChange.changeReference}/></label>
              <label>Public description<textarea name="publicDescription" required maxLength={1000} rows={3} defaultValue={editingChange.publicDescription}/></label>
              <label>Change manager<select name="managerId" required defaultValue={editingChange.managerId}>{changeManagers.map(manager=><option key={manager.id} value={manager.id}>{manager.displayName} · {manager.email}</option>)}</select></label>
              <div className="change-window-fields"><label>Start time<input name="startedAt" type="datetime-local" required defaultValue={localDateTime(editingChange.startedAt)}/></label><label>Estimated end time<input name="estimatedEndAt" type="datetime-local" required defaultValue={localDateTime(editingChange.estimatedEndAt)}/></label></div>
              <div className="change-node-list">{editingChange.deviceNames.map(name=><span key={name}><Server size={13}/>{name}</span>)}</div>
              {changeError&&<div className="form-error">{changeError}</div>}
              <div className="modal-actions"><button type="button" className="secondary" onClick={()=>setEditingChange(null)}>Cancel</button><button className="primary">Save maintenance</button></div>
            </form>
          </section>
        </div>
      )}
      {majorDialog && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setMajorDialog(false)}
        >
          <section
            className="modal wide-modal major-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setMajorDialog(false)}
              aria-label="Close"
            >
              <X />
            </button>
            <p className="eyebrow">MAJOR INCIDENT</p>
            <h2>Declare major incident</h2>
            <p>
              Coordinate related operational incidents through one shared update
              stream.
            </p>
            <form onSubmit={createMajorIncident}>
              <label>
                Title
                <input
                  name="title"
                  required
                  autoFocus
                  placeholder="London network outage"
                />
              </label>
              <label>
                Impact statement
                <textarea
                  name="impact"
                  rows={3}
                  placeholder="Describe affected users, locations, or services"
                />
              </label>
              <label>
                Severity
                <select name="severity">
                  <option value="major">Major</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
              <fieldset className="modal-incident-picker">
                <legend>Link active incidents</legend>
                {incidents.filter(
                  (item) => item.status !== "resolved" && !item.majorIncidentId,
                ).length ? (
                  incidents
                    .filter(
                      (item) =>
                        item.status !== "resolved" && !item.majorIncidentId,
                    )
                    .map((item) => (
                      <label key={item.id}>
                        <input
                          type="checkbox"
                          name="incidentIds"
                          value={item.id}
                        />
                        <span>
                          <strong>{item.deviceName}</strong>
                          <small>
                            {incidentStatus(item.status)} · {item.checkName}
                          </small>
                        </span>
                      </label>
                    ))
                ) : (
                  <p>No unassigned active incidents are available.</p>
                )}
              </fieldset>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setMajorDialog(false)}
                >
                  Cancel
                </button>
                <button className="primary">Declare MI</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
