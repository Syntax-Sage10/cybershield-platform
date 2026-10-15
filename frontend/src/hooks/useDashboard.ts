"use client";

import { useCallback, useReducer } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";
import { api } from "@/lib/api";
import type {
  Agent, AlertItem, ApiEvent, Job, JobKind, LogLine, MetricPoint, PortResult, ScanProgress, WsMessage,
} from "@/lib/types";

const WS_URL = `${process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000"}/ws/dashboard`;

interface State {
  agents: Record<string, Agent>;
  jobs: Job[];
  logs: LogLine[];
  ports: PortResult[];
  alerts: AlertItem[];
  progress: ScanProgress | null;
  metrics: MetricPoint[];
  active: Record<JobKind, string | null>;
  scanJobId: string | null;
  seq: number;
}

const initial: State = {
  agents: {}, jobs: [], logs: [], ports: [], alerts: [], progress: null, metrics: [],
  active: { port_scan: null, fim: null }, scanJobId: null, seq: 0,
};

const cap = <T,>(arr: T[], n: number) => (arr.length > n ? arr.slice(arr.length - n) : arr);

/** Fold one backend event into state. `live` is false while replaying history. */
function applyEvent(s: State, ev: ApiEvent, live: boolean): State {
  const seq = s.seq + 1;
  switch (ev.kind) {
    case "log":
      return {
        ...s, seq,
        logs: cap([...s.logs, { id: seq, ts: ev.ts, level: ev.level, stream: ev.data.stream === "stderr" ? "stderr" : "stdout", message: String(ev.data.message ?? "") }], 1500),
      };
    case "port":
      if (s.ports.some((p) => p.job_id === ev.job_id && p.port === ev.data.port)) return s;
      return {
        ...s, seq,
        ports: cap([...s.ports, { job_id: ev.job_id ?? "", host: ev.data.host, port: ev.data.port, service: ev.data.service, banner: ev.data.banner ?? "", ts: ev.ts }], 5000),
      };
    case "progress":
      return { ...s, progress: { job_id: ev.job_id ?? "", scanned: ev.data.scanned, total: ev.data.total, open: ev.data.open, rate: ev.data.rate } };
    case "alert":
      return {
        ...s, seq,
        alerts: cap([{ id: seq, ts: ev.ts, level: ev.level, path: ev.data.path, change: ev.data.change, old_sha256: ev.data.old_sha256, new_sha256: ev.data.new_sha256, offline: !!ev.data.offline }, ...s.alerts], 500),
      };
    case "status": {
      if (!live) return s; // history replay must not resurrect finished jobs; hydrate() sets `active` from /api/jobs
      const kind = ev.data.job_kind as JobKind;
      const running = ev.data.status === "running" || ev.data.status === "queued";
      const active = { ...s.active };
      if (running) active[kind] = ev.job_id;
      else if (active[kind] === ev.job_id) active[kind] = null;
      const fresh = running && kind === "port_scan" && s.scanJobId !== ev.job_id;
      return { ...s, active, ...(fresh ? { scanJobId: ev.job_id, progress: null } : {}) };
    }
  }
}

type Action =
  | { type: "hydrate"; agents: Agent[]; jobs: Job[]; events: ApiEvent[] }
  | { type: "ws"; msg: WsMessage }
  | { type: "clear_logs" };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "clear_logs":
      return { ...s, logs: [] };
    case "hydrate": {
      const active: State["active"] = { port_scan: null, fim: null };
      for (const j of a.jobs) if ((j.status === "queued" || j.status === "running") && !active[j.kind]) active[j.kind] = j.id;
      let next: State = {
        ...s, logs: [], ports: [], alerts: [], active,
        jobs: a.jobs,
        agents: Object.fromEntries(a.agents.map((x) => [x.id, x])),
        scanJobId: a.jobs.find((j) => j.kind === "port_scan")?.id ?? null,
      };
      for (const ev of a.events) next = applyEvent(next, ev, false);
      return next;
    }
    case "ws": {
      const m = a.msg;
      if (m.type === "event") {
        const next = applyEvent(s, m, true);
        if (m.kind !== "status" || !m.job_id) return next;
        const status = String(m.data.status) as Job["status"];
        const existing = next.jobs.some((job) => job.id === m.job_id);
        if (existing) {
          return { ...next, jobs: next.jobs.map((job) => job.id === m.job_id ? { ...job, status } : job) };
        }
        const kind = m.data.job_kind as JobKind;
        if (kind !== "port_scan" && kind !== "fim") return next;
        const job: Job = { id: m.job_id, agent_id: m.agent_id, kind, params: {}, status, created_at: m.ts };
        return { ...next, jobs: [...next.jobs, job] };
      }
      if (m.type === "metrics") return { ...s, metrics: cap([...s.metrics, { ts: m.ts, rx_bps: m.rx_bps, tx_bps: m.tx_bps, cpu: m.cpu }], 90) };
      if (m.type === "agent") {
        const prev = s.agents[m.agent_id];
        if (!prev && !m.name) return s;
        const merged: Agent = {
          id: m.agent_id, name: m.name ?? prev?.name ?? m.agent_id, hostname: m.hostname ?? prev?.hostname ?? "",
          platform: m.platform ?? prev?.platform ?? "", is_admin: m.is_admin ?? prev?.is_admin ?? false, online: m.online,
        };
        return { ...s, agents: { ...s.agents, [m.agent_id]: merged } };
      }
      return s;
    }
  }
}

export function useDashboard() {
  const [state, dispatch] = useReducer(reducer, initial);

  const hydrate = useCallback(async () => {
    try {
      const [agents, jobs, events] = await Promise.all([api.agents(), api.jobs(), api.events(600)]);
      dispatch({ type: "hydrate", agents, jobs, events });
    } catch {
      /* hub unreachable: the socket's reconnect loop will hydrate again on the next open */
    }
  }, []);

  const { readyState } = useWebSocket(WS_URL, {
    shouldReconnect: () => true,
    reconnectAttempts: Number.MAX_SAFE_INTEGER,
    reconnectInterval: 2000,
    retryOnError: true,
    onOpen: hydrate, // initial load and every reconnect
    onMessage: (e) => {
      try {
        dispatch({ type: "ws", msg: JSON.parse(e.data) as WsMessage });
      } catch {
        /* ignore malformed frames */
      }
    },
  });

  return { state, connected: readyState === ReadyState.OPEN, clearLogs: () => dispatch({ type: "clear_logs" }) };
}
