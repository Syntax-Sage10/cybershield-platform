import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { clock, shortHash } from "@/lib/utils";
import type { AlertItem } from "@/lib/types";

export function AlertTable({ alerts, monitoring }: { alerts: AlertItem[]; monitoring: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle><ShieldAlert className="h-4 w-4 text-rose-400" aria-hidden /> Integrity alerts</CardTitle>
        <Badge variant={alerts.length ? "threat" : monitoring ? "safe" : "muted"}>
          {alerts.length ? `${alerts.length} alert${alerts.length === 1 ? "" : "s"}` : monitoring ? "No changes detected" : "Not monitoring"}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-zinc-950/80 text-xs text-zinc-500 backdrop-blur">
              <tr><th className="py-2 pr-3 font-medium">Time</th><th className="py-2 pr-3 font-medium">Change</th><th className="py-2 pr-3 font-medium">File</th><th className="py-2 font-medium">SHA-256</th></tr>
            </thead>
            <tbody className="font-mono text-xs">
              {alerts.map((a) => (
                <tr key={a.id} className="border-t border-white/5 align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-zinc-500">{clock(a.ts)}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={a.level === "error" ? "threat" : "scan"}>{a.change.replace("_", " ")}</Badge>
                    {a.offline && <div className="mt-1 text-[11px] text-zinc-500">while monitor was off</div>}
                  </td>
                  <td className="break-all py-2 pr-3 text-zinc-200">{a.path}</td>
                  <td className="whitespace-nowrap py-2 text-zinc-400">{a.old_sha256 ? shortHash(a.old_sha256) : "none"} → {a.new_sha256 ? shortHash(a.new_sha256) : "none"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {alerts.length === 0 && (
            <p className="py-10 text-center text-sm text-zinc-500">{monitoring ? "Every file matches its baseline hash." : "Start the monitor on a directory to watch it for changes."}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
