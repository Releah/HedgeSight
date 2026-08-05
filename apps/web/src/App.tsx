import { useEffect, useState, type FormEvent } from "react";
import type { DashboardSummary } from "@hedgesight/contracts";
import { Activity, Bell, Box, ChevronRight, CircleGauge, Menu, Plus, Radar, Server, Settings, ShieldCheck, X } from "lucide-react";

const empty: DashboardSummary = {
  counts: { up: 0, down: 0, degraded: 0, unknown: 0 }, devices: [], workers: [], recentIncidents: [],
};

function relativeTime(value: string | null): string {
  if (!value) return "Never";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function App() {
  const [summary, setSummary] = useState<DashboardSummary>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/dashboard");
      if (!response.ok) throw new Error("Dashboard is unavailable");
      setSummary(await response.json()); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load dashboard"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 10_000); return () => clearInterval(timer); }, []);

  async function addDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/devices", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: data.get("name"), address: data.get("address"), description: data.get("description") }) });
    if (response.ok) { setDialog(false); await refresh(); }
  }

  const total = Object.values(summary.counts).reduce((sum, count) => sum + count, 0);
  const healthyPercent = total ? Math.round((summary.counts.up / total) * 100) : 0;

  return <div className="shell">
    <aside className={mobileNav ? "sidebar open" : "sidebar"}>
      <div className="brand"><div className="brandmark"><Radar size={24} /></div><span>Hedge<span>Sight</span></span><button className="mobile-close" onClick={() => setMobileNav(false)}><X /></button></div>
      <nav aria-label="Main navigation">
        <a className="active" href="#overview"><CircleGauge /> Overview</a>
        <a href="#devices"><Server /> Devices <span className="nav-count">{total}</span></a>
        <a href="#incidents"><Bell /> Incidents <span className="nav-count alert">{summary.recentIncidents.filter(i => i.status === "open").length}</span></a>
        <a href="#workers"><Box /> Workers</a>
      </nav>
      <div className="sidebar-bottom">
        <a href="#settings"><Settings /> Settings</a>
        <div className="system-state"><span className="pulse"/><div><strong>System operational</strong><small>Control plane online</small></div></div>
      </div>
    </aside>

    <main>
      <header><button className="menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu /></button><div><p className="eyebrow">ACTIVE MONITORING</p><h1>Good morning.</h1><p>Here’s what’s happening across your infrastructure.</p></div><button className="primary" onClick={() => setDialog(true)}><Plus size={17}/> Add device</button></header>
      {error && <div className="error">{error}. Retrying automatically.</div>}

      <section className="stats" aria-label="Device status summary">
        <article className="stat hero-stat"><div className="ring" style={{"--value": `${healthyPercent * 3.6}deg`} as React.CSSProperties}><span>{healthyPercent}%</span></div><div><small>OVERALL HEALTH</small><strong>{summary.counts.up} of {total} devices healthy</strong><p>Calculated from active checks</p></div></article>
        <article className="stat"><span className="status-dot up"/><small>ONLINE</small><strong>{summary.counts.up}</strong><p>Devices responding</p></article>
        <article className="stat"><span className="status-dot down"/><small>DOWN</small><strong>{summary.counts.down}</strong><p>Needs attention</p></article>
        <article className="stat"><span className="status-dot unknown"/><small>UNKNOWN</small><strong>{summary.counts.unknown + summary.counts.degraded}</strong><p>Pending or degraded</p></article>
      </section>

      <section className="grid">
        <article className="panel devices" id="devices">
          <div className="panel-heading"><div><h2>Infrastructure</h2><p>Live device health from your polling workers</p></div><button className="text-button">View all <ChevronRight size={16}/></button></div>
          <div className="table-wrap"><table><thead><tr><th>DEVICE</th><th>ADDRESS</th><th>CHECKS</th><th>LAST RESPONSE</th><th>STATUS</th></tr></thead><tbody>
            {loading && <tr><td colSpan={5} className="empty">Loading infrastructure…</td></tr>}
            {!loading && summary.devices.length === 0 && <tr><td colSpan={5} className="empty">No devices yet. Add your first monitored device.</td></tr>}
            {summary.devices.map(device => <tr key={device.id}><td><span className="device-icon"><Server size={17}/></span><strong>{device.name}</strong></td><td className="mono">{device.address}</td><td>{device.checks}</td><td>{relativeTime(device.lastSeenAt)}</td><td><span className={`badge ${device.status}`}><i/>{device.status}</span></td></tr>)}
          </tbody></table></div>
        </article>

        <article className="panel workers" id="workers">
          <div className="panel-heading"><div><h2>Polling workers</h2><p>Probe execution nodes</p></div><Activity size={18}/></div>
          <div className="worker-list">
            {summary.workers.length === 0 && <div className="empty worker-empty">Waiting for a worker to connect…</div>}
            {summary.workers.map(worker => <div className="worker" key={worker.id}><span className={`worker-symbol ${worker.status}`}><Box size={18}/></span><div><strong>{worker.name}</strong><small>v{worker.version} · {relativeTime(worker.lastSeenAt)}</small></div><span className={`badge ${worker.status === "online" ? "up" : "down"}`}><i/>{worker.status}</span></div>)}
          </div>
          <div className="secure"><ShieldCheck size={18}/><div><strong>Outbound-only connection</strong><small>Workers never access the database directly.</small></div></div>
        </article>

        <article className="panel incidents" id="incidents">
          <div className="panel-heading"><div><h2>Recent incidents</h2><p>Latest state changes across all checks</p></div></div>
          {summary.recentIncidents.length === 0 ? <div className="calm"><ShieldCheck/><strong>All quiet</strong><p>No incidents have been recorded.</p></div> : <div className="incident-list">{summary.recentIncidents.map(incident => <div key={incident.id}><span className={`status-dot ${incident.status === "open" ? "down" : "up"}`}/><div><strong>{incident.deviceName}</strong><p>{incident.checkName}</p></div><time>{relativeTime(incident.openedAt)}</time></div>)}</div>}
        </article>
      </section>
    </main>

    {dialog && <div className="modal-backdrop" onMouseDown={() => setDialog(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title" onMouseDown={e => e.stopPropagation()}><button className="modal-close" onClick={() => setDialog(false)}><X/></button><p className="eyebrow">DEVICE INVENTORY</p><h2 id="add-title">Add a monitored device</h2><p>Create the device first, then attach protocol checks through the API.</p><form onSubmit={addDevice}><label>Name<input name="name" placeholder="Core switch 01" required autoFocus /></label><label>Address<input name="address" placeholder="10.20.0.1" required /></label><label>Description<textarea name="description" placeholder="Primary distribution switch" rows={3}/></label><div className="modal-actions"><button type="button" className="secondary" onClick={() => setDialog(false)}>Cancel</button><button className="primary">Add device</button></div></form></section></div>}
  </div>;
}
