"use client";

import { useMemo, useState } from "react";
import { Activity, BellRing, Radar } from "lucide-react";
import type { ReactNode } from "react";
import { AgentStatus } from "@/components/AgentStatus";
import { AlertTable } from "@/components/AlertTable";
import { FimControls } from "@/components/FimControls";
import { LiveTerminal } from "@/components/LiveTerminal";
import { NetworkChart } from "@/components/NetworkChart";
import { PortTable } from "@/components/PortTable";
import { ScanControls } from "@/components/ScanControls";
import { useDashboard } from "@/hooks/useDashboard";

export default function Page() {
  const { state, connected, clearLogs } = useDashboard();
  const [error, setError] = useState<string | null>(null);

  const agents = Object.values(state.agents);
  const agent = agents.find((a) => a.online) ?? agents[0];
  const ready = connected && !!agent?.online;
  const scanPorts = useMemo(() => state.ports.filter((p) => p.job_id === state.scanJobId), [state.ports, state.scanJobId]);
  const scansRun = state.jobs.filter((job) => job.kind === "port_scan").length;
  const activeAlerts = state.alerts.filter((alert) => alert.level === "warn" || alert.level === "error").length;

  return (
    <main className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 pb-28 pt-4 lg:px-6 lg:pt-6">
      <AgentStatus connected={connected} agent={agent} />

      <section aria-label="Dashboard summary" className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={<Radar className="h-4 w-4" />} label="Total scans run" value={scansRun.toLocaleString()} detail="Port scan jobs" />
        <SummaryCard icon={<Activity className="h-4 w-4" />} label="File monitor" value={state.active.fim ? "Active" : "Idle"} detail={state.active.fim ? "Watching agent directory" : "No directory is being watched"} active={!!state.active.fim} />
        <SummaryCard icon={<BellRing className="h-4 w-4" />} label="Active alerts" value={activeAlerts.toLocaleString()} detail="Warnings and integrity events" alert={activeAlerts > 0} />
      </section>

      {error && (
        <div role="alert" className="glass flex items-start justify-between gap-4 rounded-xl border-rose-500/40 px-4 py-3 text-sm text-rose-300">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 text-rose-200/70 hover:text-rose-100">Dismiss</button>
        </div>
      )}

      {connected && !agent?.online && (
        <div className="glass rounded-xl px-4 py-3 text-sm text-amber-300">
          No agent is connected. Run <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">scripts/run-agent.sh</code> on the machine you want to scan or monitor.
        </div>
      )}

      <section aria-label="Security controls" className="grid items-start gap-4 lg:grid-cols-2">
        <ScanControls agentId={agent?.id} ready={ready} activeJobId={state.active.port_scan} progress={state.progress} onError={setError} />
        <FimControls agentId={agent?.id} ready={ready} activeJobId={state.active.fim} onError={setError} />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <NetworkChart metrics={state.metrics} />
        <PortTable ports={scanPorts} scanning={!!state.active.port_scan} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AlertTable alerts={state.alerts} monitoring={!!state.active.fim} />
      </div>
      <LiveTerminal logs={state.logs} onClear={clearLogs} />
    </main>
  );
}

function SummaryCard({ icon, label, value, detail, active, alert }: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  active?: boolean;
  alert?: boolean;
}) {
  return (
    <article className="glass rounded-xl px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">{label}</p>
        <span className={`rounded-lg p-2 ${alert ? "bg-rose-400/10 text-rose-300" : active ? "bg-emerald-400/10 text-emerald-300" : "bg-cyan-400/10 text-cyan-300"}`}>{icon}</span>
      </div>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${active ? "text-emerald-300" : alert ? "text-rose-300" : "text-zinc-100"}`}>{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </article>
  );
}
