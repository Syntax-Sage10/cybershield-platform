"use client";

import { useMemo, useState } from "react";
import { Terminal } from "../components/Terminal";
import { AgentStatus } from "@/components/AgentStatus";
import { AlertTable } from "@/components/AlertTable";
import { FimControls } from "@/components/FimControls";
import { NetworkChart } from "@/components/NetworkChart";
import { PortTable } from "@/components/PortTable";
import { ScanControls } from "@/components/ScanControls";
import { useDashboard } from "@/hooks/useDashboard";

export default function Page() {
  const { state, connected } = useDashboard();
  const [error, setError] = useState<string | null>(null);

  const agents = Object.values(state.agents);
  const agent = agents.find((a) => a.online) ?? agents[0];
  const ready = connected && !!agent?.online;
  const scanPorts = useMemo(() => state.ports.filter((p) => p.job_id === state.scanJobId), [state.ports, state.scanJobId]);

  return (
    <main className="mx-auto flex max-w-[1500px] flex-col gap-4 p-4 lg:p-6">
      <AgentStatus connected={connected} agent={agent} />

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

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4">
          <ScanControls agentId={agent?.id} ready={ready} activeJobId={state.active.port_scan} progress={state.progress} onError={setError} />
          <FimControls agentId={agent?.id} ready={ready} activeJobId={state.active.fim} onError={setError} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2">
          <NetworkChart metrics={state.metrics} />
          <PortTable ports={scanPorts} scanning={!!state.active.port_scan} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Terminal />
        <AlertTable alerts={state.alerts} monitoring={!!state.active.fim} />
      </div>
    </main>
  );
}
