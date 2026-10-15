"use client";

import { useState } from "react";
import { FileLock2, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

interface Props {
  agentId?: string;
  ready: boolean;
  activeJobId: string | null;
  onError: (msg: string) => void;
}

export function FimControls({ agentId, ready, activeJobId, onError }: Props) {
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const running = !!activeJobId;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle><FileLock2 className="h-4 w-4 text-emerald-400" aria-hidden /> File integrity monitor</CardTitle>
        {running && (
          <Badge variant="safe"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> Watching</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label htmlFor="fim-path" className="mb-1 block text-xs text-zinc-400">Directory on the agent&apos;s machine</label>
          <Input id="fim-path" value={path} onChange={(e) => setPath(e.target.value)} disabled={running} placeholder="/home/you/projects/app/config" />
        </div>
        {running ? (
          <Button variant="destructive" className="w-full" disabled={busy} onClick={() => run(() => api.stopJob(activeJobId!))}>
            <Square className="h-4 w-4" aria-hidden /> Stop monitoring
          </Button>
        ) : (
          <Button className="w-full" disabled={busy || !ready || !path.trim()} onClick={() => run(() => api.startJob(agentId!, "fim", { path: path.trim() }))}>
            <FileLock2 className="h-4 w-4" aria-hidden /> Start monitoring
          </Button>
        )}
        <p className="text-xs leading-relaxed text-zinc-500">
          Hashes every file with SHA-256, then reports creations, edits, deletions and permission changes as they happen. Changes made while the monitor was off are caught against the saved baseline on the next start.
        </p>
      </CardContent>
    </Card>
  );
}
