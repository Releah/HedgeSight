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
  X,
} from "lucide-react";

type View =
  | "overview"
  | "monitoring"
  | "devices"
  | "incidents"
  | "tasks"
  | "maintenance"
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
  uptimeSeconds: string | null;
  downtimeSeconds: string | null;
  maintenanceDowntimeSeconds: string | null;
  uptimePercent: string | null;
};
type ChangeManager = { id:string;displayName:string;email:string };
type ChangeRecord={id:string;changeReference:string;publicDescription:string;managerId:string;managerName:string;startedAt:string;estimatedEndAt:string;endedAt:string|null;deviceCount:number;deviceNames:string[];status:"scheduled"|"active"|"overdue"|"completed"};
type TaskStatus="backlog"|"in_progress"|"testing"|"completed";
type TaskRecord={id:string;title:string;description:string;status:TaskStatus;createdAt:string;updatedAt:string;assigneeId:string|null;assigneeName:string|null;incidentCount:number;updateCount:number};
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
type ChartRequest={deviceId:string;title:string;kind:"metric"|"interface";key?:string;interfaceId?:string;unit:string};
type ChartPoint={timestamp:string;value?:number;inBps?:number|null;outBps?:number|null;utilizationInPercent?:number|null;utilizationOutPercent?:number|null};
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
  openingMessage: string | null;
  investigatorId: string | null;
  closedByName: string | null;
  updates: Array<{
    id: string;
    body: string;
    createdAt: string;
    authorName: string;
    authorId: string | null;
  }>;
};
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
  counts: { up: 0, down: 0, degraded: 0, unknown: 0 },
  maintenanceCount: 0,
  devices: [],
  workers: [],
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
  workers: {
    eyebrow: "POLLING",
    title: "Workers",
    description: "Monitor the nodes executing checks across your networks.",
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
      {status}
    </span>
  );
}
function componentMonitored(device:MonitoringDevice,id:string):boolean{const selected=device.sshThresholds.monitoredComponents;return !Array.isArray(selected)||(selected as string[]).includes(id);}
function linePoints(values:number[],maximum?:number,width=720,height=230):string{if(!values.length)return "";const range=Math.max(1,maximum??Math.max(...values,1));return values.map((value,index)=>`${values.length===1?width/2:index/(values.length-1)*width},${height-value/range*height}`).join(" ");}
function TimeChart({points,kind,unit}:{points:ChartPoint[];kind:"metric"|"interface";unit:string}){const primary=points.map(item=>kind==="interface"?Number(item.inBps??0)/1_000_000:Number(item.value??0)),secondary=kind==="interface"?points.map(item=>Number(item.outBps??0)/1_000_000):[],all=[...primary,...secondary],maximum=Math.max(...all,0);if(!points.length)return <div className="chart-empty">No samples in this time window yet.</div>;return <><div className="chart-scale"><span>{maximum.toFixed(maximum<10?2:1)} {unit}</span><span>0 {unit}</span></div><svg className="history-chart" viewBox="0 0 720 230" preserveAspectRatio="none" aria-label="Metric history"><line x1="0" y1="0" x2="720" y2="0"/><line x1="0" y1="115" x2="720" y2="115"/><line x1="0" y1="230" x2="720" y2="230"/><polyline className="chart-primary" points={linePoints(primary,maximum)}/>{secondary.length>0&&<polyline className="chart-secondary" points={linePoints(secondary,maximum)}/>}</svg><div className="chart-axis"><span>{new Date(points[0].timestamp).toLocaleString()}</span><span>{new Date(points[points.length-1].timestamp).toLocaleString()}</span></div>{kind==="interface"&&<div className="chart-legend"><span className="in">Inbound</span><span className="out">Outbound</span></div>}</>}
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
        {majors.length === 0 ? (
          <div className="chat-empty">
            No major incidents have been declared.
          </div>
        ) : (
          majors.map((item) => (
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

type AuthStatus = { setupRequired: boolean; oidcEnabled: boolean };
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
            <Radar size={24} />
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
      : { email: data.get("email"), password: data.get("password") };
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
          <Radar size={29} />
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
        <form onSubmit={submit}>
          {status.setupRequired && (
            <label>
              Display name
              <input name="displayName" required autoFocus />
            </label>
          )}
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              autoFocus={!status.setupRequired}
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
        </form>
        {status.oidcEnabled && !status.setupRequired && (
          <>
            <div className="login-divider">
              <span>or</span>
            </div>
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
  const [monitoring, setMonitoring] = useState<MonitoringDevice[]>([]);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [osFilter, setOsFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [newGroupName, setNewGroupName] = useState("");
  const [editing, setEditing] = useState<MonitoringDevice | null>(null);
  const [deviceDetail,setDeviceDetail]=useState<MonitoringDevice|null>(null);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [interfaceStats, setInterfaceStats] = useState<
    Record<string, InterfaceStats[]>
  >({});
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("data");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [credentials,setCredentials]=useState<StoredCredential[]>([]);
  const [credentialError,setCredentialError]=useState("");
  const [authenticationSettings, setAuthenticationSettings] =
    useState<AuthenticationSettings | null>(null);
  const [accountError, setAccountError] = useState("");
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [authenticationMessage, setAuthenticationMessage] = useState("");
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
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
    "incidents" | "major" | "history" | "metrics"
  >("incidents");
  const [majorDialog, setMajorDialog] = useState(false);
  const [changeDialog,setChangeDialog]=useState(false);
  const [selectedDevices,setSelectedDevices]=useState<string[]>([]);
  const [changeManagers,setChangeManagers]=useState<ChangeManager[]>([]);
  const [changes,setChanges]=useState<ChangeRecord[]>([]);
  const [editingChange,setEditingChange]=useState<ChangeRecord|null>(null);
  const [changeError,setChangeError]=useState("");
  const [tasks,setTasks]=useState<TaskRecord[]>([]);
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
        assigneesResponse,
      ] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/monitoring"),
        fetch("/api/groups"),
        fetch("/api/incidents"),
        fetch("/api/major-incidents"),
        fetch("/api/change-managers"),
        fetch("/api/changes"),
        fetch("/api/tasks"),fetch("/api/task-assignees"),
      ]);
      if (
        !dashboardResponse.ok ||
        !monitoringResponse.ok ||
        !groupsResponse.ok ||
        !incidentsResponse.ok ||
        !majorResponse.ok
        || !managersResponse.ok || !changesResponse.ok || !tasksResponse.ok || !assigneesResponse.ok
      )
        throw new Error("Dashboard is unavailable");
      setSummary(await dashboardResponse.json());
      setMonitoring(await monitoringResponse.json());
      setGroups(await groupsResponse.json());
      setIncidents(await incidentsResponse.json());
      setMajorIncidents(await majorResponse.json());
      setChangeManagers(await managersResponse.json());
      setChanges(await changesResponse.json());
      setTasks(await tasksResponse.json());setTaskAssignees(await assigneesResponse.json());
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
  async function moveTask(id:string,status:TaskStatus){await fetch(`/api/tasks/${id}/status`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status})});await refresh();}
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
        sshEnabled:data.get("sshEnabled")==="on",sshCredentialId:data.get("sshCredentialId")||null,sshPort:Number(data.get("sshPort")||22),sshIntervalSeconds:Number(data.get("sshIntervalSeconds")||900),cpuThresholdPercent:Number(data.get("cpuThresholdPercent")||90),memoryThresholdPercent:Number(data.get("memoryThresholdPercent")||90),diskThresholdPercent:Number(data.get("diskThresholdPercent")||90),interfaceThresholdPercent:Number(data.get("interfaceThresholdPercent")||90),interfaceErrorThreshold:Number(data.get("interfaceErrorThreshold")||1),monitoredComponents:data.getAll("monitoredComponents"),
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
            <Radar size={24} />
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
          {nav("workers", <Box />, "Workers")}
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
                    <StatusBadge
                      status={
                        device.enabled
                          ? (device.pingStatus ?? "unknown")
                          : "disabled"
                      }
                    />
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
                    onClick={() => setEditing(device)}
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
                    {selectedIncident.status !== "resolved" &&
                      !selectedIncident.recoveredAt && (
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
                        !selectedIncident.recoveredAt ||
                        selectedIncident.updates.length === 0
                      }
                    >
                      <ShieldCheck size={15} />
                      {selectedIncident.status === "resolved"
                        ? "Incident resolved"
                        : "Resolve incident"}
                    </button>
                    {selectedIncident.status!=="resolved"&&<button className="secondary" onClick={()=>setIncidentTaskDialog(true)} disabled={!selectedIncident.recoveredAt||selectedIncident.updates.length===0}><ClipboardList size={15}/>Resolve & create task</button>}
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
                    {!selectedIncident.recoveredAt && (
                      <small>Waiting for the device to respond.</small>
                    )}
                    {selectedIncident.recoveredAt &&
                      selectedIncident.updates.length === 0 && (
                        <small>Add an update before resolving.</small>
                      )}
                  </aside>
                </div>
              </>
            ) : (
              <>
                <div className="incident-section-tabs" role="tablist">
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
                  <button
                    className={incidentSectionTab === "metrics" ? "active" : ""}
                    onClick={() => setIncidentSectionTab("metrics")}
                  >
                    Metrics
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
                              <th>EVENT</th>
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
                {incidentSectionTab === "metrics" && (
                  <>
                    <section className="incident-metric-cards">
                      <article>
                        <small>TOTAL INCIDENTS</small>
                        <strong>{incidents.length}</strong>
                      </article>
                      <article>
                        <small>ACTIVE</small>
                        <strong>{openIncidents}</strong>
                      </article>
                      <article>
                        <small>MAJOR INCIDENTS</small>
                        <strong>{majorIncidents.length}</strong>
                      </article>
                      <article>
                        <small>RECOVERED, AWAITING CLOSE</small>
                        <strong>
                          {
                            incidents.filter(
                              (item) => item.status === "pending_investigation",
                            ).length
                          }
                        </strong>
                      </article>
                    </section>
                  </>
                )}
              </>
            )}
          </section>
        )}
        {view === "tasks" && (
          <section className="task-board">
            {(["backlog","in_progress","testing","completed"] as TaskStatus[]).map(status=><section className={`task-column ${status}`} key={status} onDragOver={event=>event.preventDefault()} onDrop={event=>{const id=event.dataTransfer.getData("text/task-id");if(id)void moveTask(id,status);}}><header><span className="task-column-dot"/><h2>{status==="in_progress"?"In progress":status[0].toUpperCase()+status.slice(1)}</h2><b>{tasks.filter(item=>item.status===status).length}</b></header><div>{tasks.filter(item=>item.status===status).map(task=><article className="task-card" key={task.id} draggable={["admin","operator"].includes(user.role)} onDragStart={event=>event.dataTransfer.setData("text/task-id",task.id)} onClick={()=>void openTask(task.id)}><div className="task-priority"><i className={task.incidentCount>=5?"critical":task.incidentCount>=3?"high":task.incidentCount>=2?"medium":"normal"}/><span>{task.incidentCount} incident{task.incidentCount===1?"":"s"}</span></div><h3>{task.title}</h3><p>{task.description||"No description added."}</p><footer><span>{task.assigneeName||"Unassigned"}</span><small>{task.updateCount} updates</small></footer></article>)}</div></section>)}
          </section>
        )}
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
        {view === "workers" && (
          <section className="page-grid">
            <Panel
              title="Polling workers"
              subtitle={`${summary.workers.length} registered execution node${summary.workers.length === 1 ? "" : "s"}`}
              className="full-panel"
            >
              <WorkerList summary={summary} />
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
                <LockKeyhole /> <span><strong>Credentials</strong><small>SSH accounts and assignments</small></span>
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
                    <p>Runtime status and background maintenance details.</p>
                  </div>
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
      {chart&&<div className="modal-backdrop" onMouseDown={()=>setChart(null)}><section className="modal wide-modal chart-modal" role="dialog" aria-modal="true" onMouseDown={event=>event.stopPropagation()}><button className="modal-close" onClick={()=>setChart(null)}><X/></button><div className="chart-header"><div><p className="eyebrow">METRIC HISTORY</p><h2>{chart.title}</h2></div><label>Time window<select value={chartHours} onChange={event=>setChartHours(Number(event.target.value))}><option value="1">Last hour</option><option value="6">Last 6 hours</option><option value="24">Last 24 hours</option><option value="168">Last 7 days</option><option value="720">Last 30 days</option></select></label></div>{chartLoading?<div className="chart-empty">Loading samples…</div>:<TimeChart points={chartData} kind={chart.kind} unit={chart.unit}/>}</section></div>}
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
            <form className="edit-grid" onSubmit={saveDevice}>
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
              <fieldset className="full-field ssh-config advanced-monitoring">
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
