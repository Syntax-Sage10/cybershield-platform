"use client";

import { useEffect, useRef } from "react";
import { Terminal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { clock } from "@/lib/utils";
import type { LogLine } from "@/lib/types";

const tone = { info: "text-zinc-300", warn: "text-amber-300", error: "text-rose-400" } as const;

export function LiveTerminal({ logs, onClear }: { logs: LogLine[]; onClear: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // follow the tail unless the reader scrolled up

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle><Terminal className="h-4 w-4 text-emerald-400" aria-hidden /> Agent output</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear terminal"><Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear</Button>
      </CardHeader>
      <div
        ref={box}
        onScroll={() => {
          const el = box.current!;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="m-5 mt-3 h-80 overflow-y-auto rounded-lg border border-white/10 bg-black/60 p-3 font-mono text-xs leading-relaxed"
        role="log"
        aria-live="off"
      >
        {logs.length === 0 && <p className="text-zinc-600">Waiting for output. Start a scan or a monitor and the agent&apos;s stdout and stderr appear here.</p>}
        {logs.map((l) => (
          <div key={l.id} className={`whitespace-pre-wrap break-all ${tone[l.level]}`}>
            <span className="select-none text-zinc-600">{clock(l.ts)} </span>
            <span className={`select-none ${l.stream === "stderr" ? "text-rose-500/70" : "text-emerald-500/60"}`}>{l.stream === "stderr" ? "err " : "out "}</span>
            {l.message}
          </div>
        ))}
      </div>
    </Card>
  );
}
