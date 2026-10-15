"use client";

import { useState } from "react";
import { Radar, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { ScanProgress } from "@/lib/types";

interface Props {
  agentId?: string;
  ready: boolean;
  activeJobId: string | null;
  progress: ScanProgress | null;
  onError: (msg: string) => void;
}

const label = "mb-1 block text-xs text-zinc-400";

export function ScanControls({ agentId, ready, activeJobId, progress, onError }: Props) {
  const [target, setTarget] = useState("127.0.0.1");
  const [ports, setPorts] = useState("1-1024");
  const [mode, setMode] = useState<"connect" | "syn">("connect");
  const [concurrency, setConcurrency] = useState(200);
  const [busy, setBusy] = useState(false);
  const running = !!activeJobId;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }

  const pct = progress && progress.total ? Math.round((progress.scanned / progress.total) * 100) : 0;
  const done = !running && progress !== null && pct >= 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle><Radar className="h-4 w-4 text-amber-400" aria-hidden /> Port scanner</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label htmlFor="scan-target" className={label}>Target host or IP</label>
          <Input id="scan-target" value={target} onChange={(e) => setTarget(e.target.value)} disabled={running} placeholder="192.168.1.10" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="scan-ports" className={label}>Ports</label>
            <Input id="scan-ports" value={ports} onChange={(e) => setPorts(e.target.value)} disabled={running} placeholder="22,80,443,8000-9000" />
          </div>
          <div>
            <label htmlFor="scan-conc" className={label}>Concurrency</label>
            <Input id="scan-conc" type="number" min={1} max={1000} value={concurrency} onChange={(e) => setConcurrency(Number(e.target.value) || 1)} disabled={running} />
          </div>
        </div>
        <div>
          <label htmlFor="scan-mode" className={label}>Method</label>
          <select
            id="scan-mode" value={mode} onChange={(e) => setMode(e.target.value as "connect" | "syn")} disabled={running}
            className="h-9 w-full rounded-md border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30"
          >
            <option value="connect">TCP connect (no privileges needed)</option>
            <option value="syn">SYN half-open (agent needs root/Administrator)</option>
          </select>
        </div>

        {running ? (
          <Button variant="destructive" className="w-full" disabled={busy} onClick={() => run(() => api.stopJob(activeJobId!))}>
            <Square className="h-4 w-4" aria-hidden /> Stop scan
          </Button>
        ) : (
          <Button variant="scan" className="w-full" disabled={busy || !ready || !target.trim()}
            onClick={() => run(() => api.startJob(agentId!, "port_scan", { target: target.trim(), ports, mode, concurrency }))}>
            <Radar className="h-4 w-4" aria-hidden /> Start scan
          </Button>
        )}

        {(running || progress) && (
          <div aria-live="polite">
            <div className="mb-1 flex justify-between font-mono text-xs text-zinc-400">
              <span>{progress ? `${progress.scanned.toLocaleString()} / ${progress.total.toLocaleString()} ports` : "Starting…"}</span>
              <span>{progress ? `${progress.rate.toFixed(0)}/s · ${progress.open} open` : ""}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full transition-[width] duration-300 ${done ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" : "bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,.8)]"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
