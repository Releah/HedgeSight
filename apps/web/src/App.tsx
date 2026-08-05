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
  ChevronDown,
  CircleGauge,
  Database,
  Eye,
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
  X,
} from "lucide-react";

type View =
  | "overview"
  | "monitoring"
  | "devices"
  | "incidents"
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
};
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
type SettingsTab = "data" | "accounts" | "authentication" | "system";
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
  devices: [],
  workers: [],
  recentIncidents: [],
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
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {status}
    </span>
  );
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
    total: number;
  };
  activeIncidents: number;
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
  const healthy = status?.counts.total
    ? Math.round((status.counts.up / status.counts.total) * 100)
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
              <span className="status-dot unknown" />
              <strong>
                {(status?.counts.unknown ?? 0) + (status?.counts.degraded ?? 0)}
              </strong>
              <small>OTHER</small>
            </article>
            <article>
              <Bell />
              <strong>{status?.activeIncidents ?? "—"}</strong>
              <small>ACTIVE INCIDENTS</small>
            </article>
          </div>
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
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [interfaceStats, setInterfaceStats] = useState<
    Record<string, InterfaceStats[]>
  >({});
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("data");
  const [accounts, setAccounts] = useState<Account[]>([]);
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
  const [majorIncidents, setMajorIncidents] = useState<MajorIncident[]>([]);
  const [selectedMajor, setSelectedMajor] =
    useState<MajorIncidentDetail | null>(null);
  const [incidentSectionTab, setIncidentSectionTab] = useState<
    "incidents" | "major" | "history" | "metrics"
  >("incidents");
  const [majorDialog, setMajorDialog] = useState(false);

  async function refresh() {
    try {
      const [
        dashboardResponse,
        monitoringResponse,
        groupsResponse,
        incidentsResponse,
        majorResponse,
      ] = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/monitoring"),
        fetch("/api/groups"),
        fetch("/api/incidents"),
        fetch("/api/major-incidents"),
      ]);
      if (
        !dashboardResponse.ok ||
        !monitoringResponse.ok ||
        !groupsResponse.ok ||
        !incidentsResponse.ok ||
        !majorResponse.ok
      )
        throw new Error("Dashboard is unavailable");
      setSummary(await dashboardResponse.json());
      setMonitoring(await monitoringResponse.json());
      setGroups(await groupsResponse.json());
      setIncidents(await incidentsResponse.json());
      setMajorIncidents(await majorResponse.json());
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
      }),
    });
    if (response.ok) {
      setEditing(null);
      await refresh();
    }
  }
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
  );
  const healthyPercent = total
    ? Math.round((summary.counts.up / total) * 100)
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
  const visibleIncidents = incidentWindow
    ? operationalIncidents.filter((item) => {
        const value = new Date(item.openedAt);
        return value >= incidentWindow.start && value < incidentWindow.end;
      })
    : operationalIncidents;
  const visibleHistory = incidentWindow
    ? archivedIncidents.filter((item) => {
        const value = new Date(item.openedAt);
        return value >= incidentWindow.start && value < incidentWindow.end;
      })
    : archivedIncidents;
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
                <span className="status-dot unknown" />
                <small>UNKNOWN</small>
                <strong>
                  {summary.counts.unknown + summary.counts.degraded}
                </strong>
                <p>Pending or degraded</p>
              </article>
            </section>
            <section className="grid">
              <Panel
                title="Infrastructure"
                subtitle="Live device health from your polling workers"
                className="devices"
              >
                <DeviceTable summary={summary} loading={loading} />
                <button
                  className="panel-link"
                  onClick={() => navigate("devices")}
                >
                  Open device inventory
                </button>
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
        {view === "monitoring" && (
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
                        <td colSpan={6} className="empty">
                          Loading live monitoring…
                        </td>
                      </tr>
                    )}
                    {!loading && filteredMonitoring.length === 0 && (
                      <tr>
                        <td colSpan={6} className="empty">
                          No devices match these filters.
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      filteredMonitoring.map((device) => (
                        <Fragment key={device.id}>
                          <tr className="expandable-row">
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
                                  device.enabled
                                    ? (device.pingStatus ?? "unknown")
                                    : "disabled"
                                }
                              />
                            </td>
                            <td>
                              <div className="row-actions">
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
                              <td colSpan={6}>
                                {!interfaceStats[device.id] ? (
                                  <div className="interface-empty">
                                    Loading interfaces…
                                  </div>
                                ) : interfaceStats[device.id].length === 0 ? (
                                  <div className="interface-empty">
                                    <strong>No interface telemetry yet</strong>
                                    <span>
                                      SNMP discovery will populate traffic,
                                      utilization, errors and discards here.
                                    </span>
                                  </div>
                                ) : (
                                  <div className="interface-grid">
                                    {interfaceStats[device.id].map((item) => (
                                      <article
                                        key={item.id}
                                        className={
                                          Number(item.inErrors ?? 0) +
                                            Number(item.outErrors ?? 0) +
                                            Number(item.inDiscards ?? 0) +
                                            Number(item.outDiscards ?? 0) >
                                          0
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
                                              {Number(item.inErrors ?? 0) +
                                                Number(item.outErrors ?? 0)}
                                            </dd>
                                          </div>
                                          <div>
                                            <dt>DISCARDS</dt>
                                            <dd>
                                              {Number(item.inDiscards ?? 0) +
                                                Number(item.outDiscards ?? 0)}
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
                    <IncidentTimeline
                      incidents={archivedIncidents}
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
