import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Agent } from "@/lib/types";

const Dot = ({ online }: { online: boolean }) => (
  <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${online ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)]" : "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,.7)]"}`} />
);

export function AgentStatus({ connected, agent }: { connected: boolean; agent?: Agent }) {
  return (
    <header className="glass flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-400/30 shadow-[0_0_24px_rgba(16,185,129,.25)]">
          <ShieldCheck className="h-5 w-5 text-emerald-400" aria-hidden />
        </div>
        <div>
          <h1 className="font-mono text-base font-semibold text-zinc-100">
            Cyber<span className="text-emerald-400">Shield</span>
          </h1>
          <p className="text-xs text-zinc-500">Live scanning and file integrity monitoring</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={connected ? "safe" : "threat"}>
          <Dot online={connected} /> Hub {connected ? "connected" : "unreachable"}
        </Badge>
        {agent ? (
          <>
            <Badge variant={agent.online ? "safe" : "muted"}>
              <Dot online={agent.online} /> {agent.name} {agent.online ? "online" : "offline"}
            </Badge>
            <Badge variant={agent.is_admin ? "safe" : "scan"}>{agent.is_admin ? "Privileged" : "Unprivileged: SYN scans unavailable"}</Badge>
            <span className="font-mono text-xs text-zinc-500">{agent.platform}</span>
          </>
        ) : (
          <Badge variant="muted"><Dot online={false} /> No agent registered</Badge>
        )}
      </div>
    </header>
  );
}
