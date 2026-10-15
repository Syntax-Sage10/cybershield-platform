"use client";

import { Activity } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtRate } from "@/lib/utils";
import type { MetricPoint } from "@/lib/types";

const time = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" });

export function NetworkChart({ metrics }: { metrics: MetricPoint[] }) {
  const last = metrics[metrics.length - 1];
  return (
    <Card>
      <CardHeader>
        <CardTitle><Activity className="h-4 w-4 text-emerald-400" aria-hidden /> Network traffic on the agent&apos;s machine</CardTitle>
        <div className="flex gap-4 font-mono text-xs">
          <span className="text-emerald-300">In {last ? fmtRate(last.rx_bps) : "waiting"}</span>
          <span className="text-amber-300">Out {last ? fmtRate(last.tx_bps) : "waiting"}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative h-56 overflow-hidden rounded-lg border border-slate-800/80 bg-zinc-950/50">
          {metrics.length === 0 && (
            <div aria-hidden="true" className="absolute inset-0">
              <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(rgba(148,163,184,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.12) 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
              <div className="absolute bottom-8 left-12 right-4 top-4 border-b border-l border-slate-700/70">
                <svg className="h-full w-full" viewBox="0 0 600 180" preserveAspectRatio="none">
                  <path d="M0 125 C55 118 70 138 120 116 S190 103 230 120 S300 132 345 102 S420 114 455 86 S530 102 600 65" fill="none" stroke="#34d399" strokeDasharray="5 8" strokeOpacity=".24" strokeWidth="2" />
                  <path d="M0 145 C60 138 95 152 145 134 S230 145 275 126 S360 148 410 126 S500 142 600 112" fill="none" stroke="#22d3ee" strokeDasharray="4 9" strokeOpacity=".18" strokeWidth="2" />
                </svg>
                <span className="absolute -left-10 top-0 -rotate-90 origin-top-left text-[10px] uppercase tracking-widest text-zinc-600">Speed</span>
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-widest text-zinc-600">Time</span>
              </div>
              <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-xs text-zinc-500">Waiting for agent telemetry...</p>
            </div>
          )}
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rx" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.45} /><stop offset="100%" stopColor="#34d399" stopOpacity={0} /></linearGradient>
                <linearGradient id="tx" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbbf24" stopOpacity={0.45} /><stop offset="100%" stopColor="#fbbf24" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="ts" tickFormatter={time} stroke="#52525b" tick={{ fontSize: 10 }} minTickGap={48} />
              <YAxis tickFormatter={fmtRate} stroke="#52525b" tick={{ fontSize: 10 }} width={72} />
              <Tooltip
                contentStyle={{ background: "rgba(9,9,11,0.92)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                labelFormatter={(v) => time(Number(v))}
                formatter={(v: number) => fmtRate(v)}
              />
              <Area type="monotone" dataKey="rx_bps" name="Inbound" stroke="#34d399" strokeWidth={1.5} fill="url(#rx)" isAnimationActive={false} />
              <Area type="monotone" dataKey="tx_bps" name="Outbound" stroke="#fbbf24" strokeWidth={1.5} fill="url(#tx)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
