"use client";

import { Download, Network, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PortResult } from "@/lib/types";

export function PortTable({ ports, scanning }: { ports: PortResult[]; scanning: boolean }) {
  const rows = [...ports].sort((a, b) => a.port - b.port);

  function exportPorts(format: "json" | "csv") {
    const content = format === "json"
      ? JSON.stringify(rows, null, 2)
      : [
          ["host", "port", "protocol", "service", "banner", "timestamp"],
          ...rows.map((row) => [row.host, row.port, "tcp", row.service, row.banner, row.ts]),
        ].map((line) => line.map(csvCell).join(",")).join("\n");
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cybershield-open-ports-${new Date().toISOString().slice(0, 10)}.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className={scanning ? "border-emerald-500/25 shadow-[0_0_32px_rgba(16,185,129,.10)]" : ""}>
      <CardHeader>
        <CardTitle><Network className="h-4 w-4 text-amber-400" aria-hidden /> Open ports</CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => exportPorts("json")} aria-label="Export open ports as JSON">
              <Download className="h-3.5 w-3.5" aria-hidden /> JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportPorts("csv")} aria-label="Export open ports as CSV">
              <Download className="h-3.5 w-3.5" aria-hidden /> CSV
            </Button>
          </div>
          <Badge variant={scanning ? "scan" : rows.length ? "threat" : "safe"}>
            {scanning && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
            {rows.length} open
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-zinc-950/80 text-xs text-zinc-500 backdrop-blur">
              <tr><th className="py-2 pr-4 font-medium">Port</th><th className="py-2 pr-4 font-medium">Service</th><th className="py-2 font-medium">Banner</th></tr>
            </thead>
            <tbody className="font-mono text-xs">
              {rows.map((p) => (
                <tr key={`${p.job_id}-${p.port}`} className="border-t border-white/5">
                  <td className="py-2 pr-4 text-amber-300">{p.port}/tcp</td>
                  <td className="py-2 pr-4 text-zinc-300">{p.service}</td>
                  <td className="break-all py-2 text-zinc-400">{p.banner || <span className="text-zinc-600">no banner</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <div className="flex min-h-36 flex-col items-center justify-center gap-3 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-full border border-slate-800 bg-zinc-900 text-zinc-500">
                <Radio className={`h-5 w-5 ${scanning ? "animate-pulse text-cyan-300" : ""}`} aria-hidden="true" />
              </span>
              <p className="text-sm text-zinc-500">{scanning ? "Scanning. Open ports appear here the moment they answer." : "No open ports for the latest scan yet."}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function csvCell(value: string | number) {
  // Prefix spreadsheet formula-like values to prevent formula execution on open.
  const safe = /^[\s]*[=+@\-]/.test(String(value)) ? `'${value}` : String(value);
  return `"${safe.replaceAll('"', '""')}"`;
}
