"use client";

import { useEffect, useRef, useState } from "react";

const WS_URL = `${process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000"}/ws/dashboard`;
type ConnectionState = "connecting" | "connected" | "disconnected";
type TerminalLine = { id: number; time: string; message: string };

export function Terminal() {
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const scrollBox = useRef<HTMLDivElement>(null);
  const sequence = useRef(0);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;
    let attempts = 0;

    const openSocket = () => {
      if (!active) return;
      setConnection("connecting");
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        attempts = 0;
        setConnection("connected");
      };
      socket.onmessage = (event) => {
        let payload: unknown = event.data;
        try {
          payload = JSON.parse(event.data);
        } catch {
          // Keep non-JSON frames visible in the terminal as plain text.
        }
        sequence.current += 1;
        const message = typeof payload === "string" ? payload : JSON.stringify(payload);
        setLines((current) => [...current, {
          id: sequence.current,
          time: new Date().toLocaleTimeString(),
          message,
        }].slice(-1000));
      };
      socket.onclose = () => {
        if (!active) return;
        setConnection("disconnected");
        const delay = Math.min(1000 * 2 ** attempts, 15000);
        attempts += 1;
        retryTimer = setTimeout(openSocket, delay);
      };
      socket.onerror = () => socket?.close();
    };

    openSocket();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  useEffect(() => {
    const box = scrollBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines]);

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/70 shadow-xl">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 font-mono text-sm text-zinc-200">
          <span className="text-emerald-400" aria-hidden="true">&gt;_</span>
          Live agent terminal
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400" aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${connection === "connected" ? "bg-emerald-400" : connection === "connecting" ? "bg-amber-400" : "bg-rose-400"}`} />
          {connection}
        </div>
      </header>
      <div
        ref={scrollBox}
        role="log"
        aria-label="Live agent messages"
        aria-live="off"
        className="h-80 overflow-y-auto bg-black p-4 font-mono text-xs leading-6 text-emerald-300"
      >
        {lines.length === 0 ? (
          <p className="text-zinc-600">Waiting for agent messages…</p>
        ) : lines.map((line) => (
          <div key={line.id} className="whitespace-pre-wrap break-all">
            <span className="select-none text-zinc-600">[{line.time}] </span>{line.message}
          </div>
        ))}
      </div>
    </section>
  );
}
