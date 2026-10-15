import { Network } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PortResult } from "@/lib/types";

export function PortTable({ ports, scanning }: { ports: PortResult[]; scanning: boolean }) {
  const rows = [...ports].sort((a, b) => a.port - b.port);
  return (
    <Card>
      <CardHeader>
        <CardTitle><Network className="h-4 w-4 text-amber-400" aria-hidden /> Open ports</CardTitle>
        <Badge variant={scanning ? "scan" : rows.length ? "threat" : "safe"}>
          {scanning && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
          {rows.length} open
        </Badge>
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
            <p className="py-6 text-center text-sm text-zinc-500">{scanning ? "Scanning. Open ports appear here the moment they answer." : "No open ports for the latest scan yet."}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
