"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Terminal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clock } from "@/lib/utils";
import type { LogLine } from "@/lib/types";

const tone = { info: "text-zinc-300", warn: "text-amber-300", error: "text-rose-400" } as const;

export function LiveTerminal({ logs, onClear }: { logs: LogLine[]; onClear: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // follow the tail unless the reader scrolled up
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [logs, expanded]);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[1500px] px-3 pb-3 lg:px-6">
      <section aria-label="Live Activity Console" className="glass overflow-hidden rounded-xl border border-emerald-500/20 shadow-[0_0_28px_rgba(16,185,129,.10)] backdrop-blur-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="live-activity-console-content"
            onClick={() => setExpanded((open) => !open)}
            className="flex min-w-0 items-center gap-2 text-left font-mono text-sm font-semibold text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Terminal className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
            <span className="truncate">&gt;_ Live Activity Console</span>
            <span className="ml-1 rounded-full border border-slate-800 px-2 py-0.5 text-[10px] font-normal text-zinc-500">{logs.length} lines</span>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            {expanded && <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear live activity console"><Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear</Button>}
            <Button variant="ghost" size="sm" onClick={() => setExpanded((open) => !open)} aria-label={expanded ? "Collapse live activity console" : "Expand live activity console"}>
              {expanded ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronUp className="h-4 w-4" aria-hidden />}
            </Button>
          </div>
        </header>
        {expanded && (
          <div
            id="live-activity-console-content"
            ref={box}
            onScroll={() => {
              const el = box.current!;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
            }}
            className="h-64 overflow-y-auto bg-black/70 p-4 font-mono text-xs leading-relaxed"
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
        )}
      </section>
    </div>
  );
}
