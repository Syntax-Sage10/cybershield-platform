export type Level = "info" | "warn" | "error";
export type JobKind = "port_scan" | "fim";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "stopped";

export interface Agent {
  id: string;
  name: string;
  hostname: string;
  platform: string;
  is_admin: boolean;
  online: boolean;
}

export interface Job {
  id: string;
  agent_id: string;
  kind: JobKind;
  params: Record<string, unknown>;
  status: JobStatus;
  error?: string | null;
  created_at: string;
}

export interface ApiEvent {
  job_id: string | null;
  agent_id: string;
  kind: "log" | "port" | "progress" | "alert" | "status";
  level: Level;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  ts: string;
}

export interface LogLine { id: number; ts: string; level: Level; stream: "stdout" | "stderr"; message: string }
export interface PortResult { job_id: string; host: string; port: number; service: string; banner: string; ts: string }
export interface ScanProgress { job_id: string; scanned: number; total: number; open: number; rate: number }
export interface MetricPoint { ts: number; rx_bps: number; tx_bps: number; cpu: number }

export interface AlertItem {
  id: number;
  ts: string;
  level: Level;
  path: string;
  change: string;
  old_sha256?: string | null;
  new_sha256?: string | null;
  offline: boolean;
}

export type WsMessage =
  | ({ type: "event" } & ApiEvent)
  | ({ type: "metrics"; agent_id: string } & MetricPoint)
  | { type: "agent"; agent_id: string; online: boolean; name?: string; hostname?: string; platform?: string; is_admin?: boolean };
