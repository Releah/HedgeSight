export const checkKinds = ["ping", "http", "snmp", "ssh"] as const;
export type CheckKind = (typeof checkKinds)[number];
export type Status = "up" | "down" | "degraded" | "unknown";

export interface ProbeJob {
  id: string;
  checkId: string;
  deviceId: string;
  kind: CheckKind;
  target: string;
  timeoutMs: number;
  config: Record<string, unknown>;
  leasedUntil: string;
}

export interface ProbeResult {
  status: Status;
  startedAt: string;
  finishedAt: string;
  latencyMs?: number;
  message?: string;
  metrics?: Record<string, number>;
  observations?: Record<string, string | number | boolean | null>;
}

export interface DashboardSummary {
  counts: Record<Status, number>;
  devices: Array<{
    id: string;
    name: string;
    address: string;
    status: Status;
    lastSeenAt: string | null;
    checks: number;
  }>;
  workers: Array<{
    id: string;
    name: string;
    version: string;
    status: "online" | "offline";
    lastSeenAt: string;
  }>;
  recentIncidents: Array<{
    id: string;
    deviceName: string;
    checkName: string;
    status: "open" | "resolved";
    openedAt: string;
    resolvedAt: string | null;
  }>;
}
