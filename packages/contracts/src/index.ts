export const checkKinds = ["ping", "http", "snmp", "ssh", "vsphere"] as const;
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
  observations?: Record<string, unknown>;
}

export interface InterfaceObservation {
  stableKey: string;
  snmpIndex?: number;
  name: string;
  alias?: string;
  description?: string;
  macAddress?: string;
  interfaceType?: number;
  speedBps?: string;
  adminStatus?: number;
  operationalStatus?: number;
  counters: {
    inOctets?: string;
    outOctets?: string;
    inUnicastPackets?: string;
    outUnicastPackets?: string;
    inErrors?: string;
    outErrors?: string;
    inDiscards?: string;
    outDiscards?: string;
  };
  metadata?: Record<string, string | number | boolean | null>;
}

export interface InterfaceSampleBatch {
  deviceId: string;
  collectedAt: string;
  deviceUptimeTicks?: string;
  interfaces: InterfaceObservation[];
}

export interface RetentionPolicy {
  rawDays: number;
  fiveMinuteDays: number;
  hourlyDays: number;
  dailyDays: number;
  incidentDays: number;
  configurationDays: number;
}

export interface DashboardSummary {
  counts: Record<Status, number>;
  maintenanceCount: number;
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
    status: "open" | "pending_investigation" | "under_investigation" | "resolved";
    openedAt: string;
    resolvedAt: string | null;
    recoveredAt: string | null;
    investigatorName: string | null;
    coveredByChange: boolean;
    changeReference: string | null;
    changeManagerName: string | null;
  }>;
  activeChanges: Array<{
    id: string;
    changeReference: string;
    publicDescription: string;
    managerId: string;
    managerName: string;
    startedAt: string;
    estimatedEndAt: string;
    status: "scheduled" | "active" | "overdue";
    deviceCount: number;
    deviceNames: string[];
  }>;
}
