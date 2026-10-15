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
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={metrics} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rx" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.45} /><stop offset="100%" stopColor="#34d399" stopOpacity={0} /></linearGradient>
                <linearGradient id="tx" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fbbf24" stopOpacity={0.45} /><stop offset="100%" stopColor="#fbbf24" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
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
