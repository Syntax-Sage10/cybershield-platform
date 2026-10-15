#!/usr/bin/env python3
"""CyberShield local agent (Python 3.11+).

Connects out to the hub over a WebSocket, runs privileged OS/network jobs locally and streams
real results back:

  port_scan  TCP connect scan (no privileges needed) or SYN scan (scapy, needs root/Administrator)
             with service banner grabbing.
  fim        File Integrity Monitor: SHA-256 baseline + watchdog filesystem events, with
             offline-change detection against the baseline saved from the previous run.

Safety rails, enforced here on the machine that does the work (not just in the UI):
  * scans are limited to loopback/private/link-local addresses unless --allow-public is given
  * FIM may only watch directories under --fim-root (default: your home directory)
"""
from __future__ import annotations

import argparse
import asyncio
import errno
import hashlib
import ipaddress
import json
import logging
import os
import platform
import random
import socket
import stat
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Iterator

import psutil
from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, InvalidHandshake

log = logging.getLogger("cybershield")
STATE_DIR = Path(os.environ.get("CYBERSHIELD_HOME", Path.home() / ".cybershield")).resolve()


class JobError(Exception):
    """A failure we can explain to the operator in one sentence."""


# --------------------------------------------------------------------------- helpers
def is_admin() -> bool:
    try:
        return os.geteuid() == 0
    except AttributeError:  # Windows
        import ctypes

        return bool(ctypes.windll.shell32.IsUserAnAdmin())


def load_agent_id() -> str:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    f = STATE_DIR / "agent_id"
    if f.exists():
        return f.read_text().strip()
    aid = uuid.uuid4().hex
    f.write_text(aid)
    return aid


def fd_budget() -> int:
    try:
        import resource

        soft, _ = resource.getrlimit(resource.RLIMIT_NOFILE)
        return max(16, (soft if soft > 0 else 1024) - 64)
    except (ImportError, ValueError, OSError):
        return 400  # Windows


def parse_ports(spec: str) -> list[int]:
    ports: set[int] = set()
    for part in spec.replace(" ", "").split(","):
        if not part:
            continue
        lo, _, hi = part.partition("-")
        a, b = int(lo), int(hi or lo)
        if not 1 <= a <= b <= 65535:
            raise ValueError(f"{part!r} is outside 1-65535")
        ports.update(range(a, b + 1))
    if not ports:
        raise ValueError("no ports given")
    return sorted(ports)


def service_name(port: int) -> str:
    try:
        return socket.getservbyport(port, "tcp")
    except OSError:
        return "unknown"


def clean_banner(data: bytes) -> str:
    text = data.decode("utf-8", "replace")
    if text.startswith("HTTP/"):
        lines = text.split("\r\n")
        server = next((l for l in lines if l.lower().startswith("server:")), "")
        text = lines[0] + (f" | {server}" if server else "")
    elif text.strip():
        text = text.strip().splitlines()[0]
    else:
        return ""
    return "".join(c if c.isprintable() else "?" for c in text).strip()[:200]


async def resolve_in_scope(target: str, allow_public: bool) -> str:
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(target, None, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise JobError(f"Cannot resolve {target!r}: {e}")
    addrs = sorted({i[4][0].split("%")[0] for i in infos}, key=lambda a: ":" in a)  # IPv4 first
    for a in addrs:
        ip = ipaddress.ip_address(a)
        if not (ip.is_private or ip.is_loopback or ip.is_link_local) and not allow_public:
            raise JobError(
                f"{a} is outside the permitted scan scope (loopback/private ranges only). Only scan systems "
                "you own or are explicitly authorised to test; restart the agent with --allow-public to lift this guard."
            )
    return addrs[0]


# --------------------------------------------------------------------------- port scanning
async def probe_connect(ip: str, port: int, timeout: float, grab: bool) -> str | None:
    """Full TCP handshake. Returns None if closed/filtered, otherwise the banner ('' if none)."""
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(ip, port), timeout)
    except (asyncio.TimeoutError, ConnectionRefusedError):
        return None
    except OSError as e:
        if e.errno in (errno.EMFILE, errno.ENFILE):
            raise JobError("Out of file descriptors; lower the concurrency or raise `ulimit -n`.")
        return None
    banner = ""
    try:
        if grab:
            try:  # services that speak first: SSH, FTP, SMTP...
                data = await asyncio.wait_for(reader.read(256), 0.8)
            except asyncio.TimeoutError:
                data = b""
            if not data:  # otherwise nudge with a harmless HTTP HEAD
                writer.write(f"HEAD / HTTP/1.0\r\nHost: {ip}\r\n\r\n".encode())
                await writer.drain()
                data = await asyncio.wait_for(reader.read(256), 1.0)
            banner = clean_banner(data)
    except (asyncio.TimeoutError, OSError):
        pass
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
    return banner


def syn_sweep(ip: str, ports: list[int], timeout: float) -> list[int]:
    """Half-open SYN scan of one chunk of ports (blocking; run in an executor). Needs raw sockets."""
    from scapy.all import IP, TCP, send, sr  # imported lazily: only SYN mode needs scapy

    sport = random.randint(20000, 60000)
    answered, _ = sr(IP(dst=ip) / TCP(sport=sport, dport=ports, flags="S"), timeout=timeout, verbose=0)
    open_ports, resets = [], []
    for sent, rcv in answered:
        if rcv.haslayer(TCP) and (int(rcv[TCP].flags) & 0x12) == 0x12:  # SYN+ACK
            open_ports.append(int(sent[TCP].dport))
            resets.append(IP(dst=ip) / TCP(sport=sport, dport=int(sent[TCP].dport), flags="R"))
    if resets:
        send(resets, verbose=0)
    return open_ports


# --------------------------------------------------------------------------- file integrity
def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def snapshot_file(path: Path) -> dict | None:
    """None if the path vanished or is not a regular file. May raise PermissionError/OSError."""
    try:
        st = path.stat()
        if not stat.S_ISREG(st.st_mode):
            return None
        return {"sha256": sha256_file(path), "size": st.st_size, "mtime": st.st_mtime, "mode": oct(st.st_mode & 0o777)}
    except FileNotFoundError:
        return None


def build_baseline(root: Path, on_error: Callable[[OSError], None]) -> dict[str, dict]:
    base: dict[str, dict] = {}
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False, onerror=on_error):
        dirnames[:] = [d for d in dirnames if (Path(dirpath) / d) != STATE_DIR]
        for name in filenames:
            p = Path(dirpath) / name
            try:
                snap = snapshot_file(p)
            except OSError as e:
                on_error(e)
                continue
            if snap:
                base[str(p)] = snap
    return base


def diff_baselines(old: dict, new: dict) -> Iterator[tuple[str, str, dict | None, dict | None]]:
    for p in sorted(old.keys() - new.keys()):
        yield p, "deleted", old[p], None
    for p in sorted(new.keys() - old.keys()):
        yield p, "created", None, new[p]
    for p in sorted(old.keys() & new.keys()):
        if old[p]["sha256"] != new[p]["sha256"]:
            yield p, "modified", old[p], new[p]
        elif old[p]["mode"] != new[p]["mode"]:
            yield p, "permissions_changed", old[p], new[p]


def baseline_file(root: Path) -> Path:
    return STATE_DIR / "baselines" / (hashlib.sha256(str(root).encode()).hexdigest()[:16] + ".json")


def load_baseline(path: Path) -> dict | None:
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, ValueError):
        return None


def save_baseline(path: Path, baseline: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(baseline))
    try:
        os.chmod(tmp, 0o600)
    except OSError:
        pass
    os.replace(tmp, path)


class _FimHandler(FileSystemEventHandler):
    """Runs on watchdog's thread; hands changed paths to the asyncio loop."""

    def __init__(self, loop: asyncio.AbstractEventLoop, queue: asyncio.Queue):
        super().__init__()
        self.loop, self.queue = loop, queue

    def on_any_event(self, event):
        if event.is_directory or event.event_type not in ("created", "modified", "deleted", "moved"):
            return
        for raw in (event.src_path, getattr(event, "dest_path", "")):
            if raw:
                p = os.fsdecode(raw)
                if not Path(p).is_relative_to(STATE_DIR):  # never react to our own baseline writes
                    self.loop.call_soon_threadsafe(self.queue.put_nowait, p)


# --------------------------------------------------------------------------- agent core
class WSLogHandler(logging.Handler):
    """Mirrors every log record to the dashboard terminal (stdout vs stderr by severity)."""

    def __init__(self, agent: "LocalAgent"):
        super().__init__(logging.INFO)
        self.agent = agent
        self.setFormatter(logging.Formatter("%(message)s"))

    def emit(self, record: logging.LogRecord) -> None:
        try:
            level = "error" if record.levelno >= logging.ERROR else "warn" if record.levelno >= logging.WARNING else "info"
            stream = "stderr" if record.levelno >= logging.WARNING else "stdout"
            self.agent.send_event(getattr(record, "job_id", None), "log", {"message": self.format(record)[:2000], "stream": stream}, level)
        except Exception:
            self.handleError(record)


class LocalAgent:
    def __init__(self, url: str, token: str, name: str, fim_roots: list[Path], allow_public: bool):
        self.url, self.token, self.name = url, token, name
        self.fim_roots, self.allow_public = fim_roots, allow_public
        self.agent_id = load_agent_id()
        self.out: asyncio.Queue[str] = asyncio.Queue(maxsize=10000)
        self.loop: asyncio.AbstractEventLoop | None = None
        self.jobs: dict[str, asyncio.Event] = {}
        self._bg: set[asyncio.Task] = set()
        self._unsent: str | None = None

    # ---- outbound messages (thread-safe: logging and watchdog call this from other threads)
    def send_event(self, job_id: str | None, kind: str, data: dict[str, Any], level: str = "info") -> None:
        if self.loop is None:
            return
        msg = json.dumps({"type": "event", "job_id": job_id, "kind": kind, "level": level, "data": data})
        self.loop.call_soon_threadsafe(self._enqueue, msg, kind)

    def _enqueue(self, msg: str, kind: str) -> None:
        try:
            self.out.put_nowait(msg)
        except asyncio.QueueFull:
            if kind in ("alert", "status"):  # never lose these: evict the oldest message instead
                try:
                    self.out.get_nowait()
                    self.out.put_nowait(msg)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    pass

    def hello(self) -> dict:
        return {
            "type": "hello", "agent_id": self.agent_id, "name": self.name, "hostname": socket.gethostname(),
            "platform": f"{platform.system()} {platform.release()}", "is_admin": is_admin(),
            "running_jobs": list(self.jobs),
        }

    # ---- connection lifecycle
    async def run(self) -> None:
        self.loop = asyncio.get_running_loop()
        backoff = 1
        while True:
            try:
                async with connect(
                    self.url, additional_headers={"Authorization": f"Bearer {self.token}"},
                    max_size=2**20, ping_interval=20, ping_timeout=20,
                ) as ws:
                    backoff = 1
                    log.info("Connected to hub %s as %r (%s)", self.url, self.name, "privileged" if is_admin() else "unprivileged")
                    await ws.send(json.dumps(self.hello()))
                    tasks = [asyncio.create_task(c) for c in (self.reader(ws), self.writer(ws), self.metrics_loop(ws))]
                    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                    for t in pending:
                        t.cancel()
                    await asyncio.gather(*pending, return_exceptions=True)
                    for t in done:
                        t.result()
            except (OSError, ConnectionClosed, InvalidHandshake, TimeoutError) as e:
                log.warning("Hub connection lost (%s); retrying in %ss", e, backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)

    async def writer(self, ws) -> None:
        while True:
            if self._unsent is None:
                self._unsent = await self.out.get()
            await ws.send(self._unsent)
            self._unsent = None  # only cleared after a successful send, so nothing is lost on reconnect

    async def reader(self, ws) -> None:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if msg.get("type") == "job.start" and msg.get("job_id") not in self.jobs:
                task = asyncio.create_task(self.run_job(msg["job_id"], msg["kind"], msg.get("params") or {}))
                self._bg.add(task)
                task.add_done_callback(self._bg.discard)
            elif msg.get("type") == "job.stop":
                stop = self.jobs.get(msg.get("job_id"))
                if stop:
                    stop.set()

    async def metrics_loop(self, ws) -> None:
        prev, t0 = psutil.net_io_counters(), time.monotonic()
        psutil.cpu_percent(None)
        while True:
            await asyncio.sleep(2)
            cur, t1 = psutil.net_io_counters(), time.monotonic()
            dt = max(t1 - t0, 1e-6)
            data = {
                "ts": time.time(), "cpu": psutil.cpu_percent(None),
                "rx_bps": (cur.bytes_recv - prev.bytes_recv) / dt, "tx_bps": (cur.bytes_sent - prev.bytes_sent) / dt,
            }
            await ws.send(json.dumps({"type": "metrics", "data": data}))
            prev, t0 = cur, t1

    # ---- job runner
    async def run_job(self, job_id: str, kind: str, params: dict) -> None:
        stop = self.jobs[job_id] = asyncio.Event()
        jlog = logging.LoggerAdapter(log, {"job_id": job_id})
        self.send_event(job_id, "status", {"job_kind": kind, "status": "running"})
        status, message = "completed", None
        try:
            if kind == "port_scan":
                await self.port_scan(job_id, params, stop, jlog)
            elif kind == "fim":
                await self.fim(job_id, params, stop, jlog)
            else:
                raise JobError(f"Unknown job kind {kind!r}")
            if stop.is_set():
                status = "stopped"
        except JobError as e:
            status, message = "failed", str(e)
            jlog.error("%s", message)
        except PermissionError as e:
            status = "failed"
            message = f"Permission denied: {e}. This task needs elevated privileges; restart the agent with sudo / as Administrator."
            jlog.error("%s", message)
        except Exception as e:  # noqa: BLE001 - report anything unexpected instead of dying silently
            status, message = "failed", f"{type(e).__name__}: {e}"
            jlog.exception("Job crashed")
        finally:
            self.jobs.pop(job_id, None)
        self.send_event(job_id, "status", {"job_kind": kind, "status": status, "message": message}, "error" if status == "failed" else "info")

    # ---- port scan
    async def port_scan(self, job_id: str, params: dict, stop: asyncio.Event, jlog) -> None:
        loop = asyncio.get_running_loop()
        try:
            ports = parse_ports(str(params.get("ports", "1-1024")))
        except ValueError as e:
            raise JobError(f"Invalid port specification: {e}")
        target, mode = str(params.get("target", "")), params.get("mode", "connect")
        timeout, grab = float(params.get("timeout", 1.0)), bool(params.get("grab_banner", True))
        ip = await resolve_in_scope(target, self.allow_public)
        if mode == "syn" and not is_admin():
            raise JobError("SYN scanning needs raw sockets. Restart the agent with sudo / as Administrator, or use connect mode.")
        concurrency = min(int(params.get("concurrency", 200)), fd_budget())

        jlog.info("Starting %s scan of %s (%s): %d ports, concurrency %d", mode, target, ip, len(ports), concurrency)
        started = time.monotonic()
        scanned = open_count = 0

        def progress() -> None:
            rate = scanned / max(time.monotonic() - started, 1e-6)
            self.send_event(job_id, "progress", {"scanned": scanned, "total": len(ports), "open": open_count, "rate": round(rate, 1)})

        def report_open(port: int, banner: str) -> None:
            nonlocal open_count
            open_count += 1
            svc = service_name(port)
            self.send_event(job_id, "port", {"host": ip, "port": port, "proto": "tcp", "service": svc, "banner": banner})
            jlog.info("%s:%d/tcp open  %-12s %s", ip, port, svc, banner[:100])

        done = asyncio.Event()

        async def reporter() -> None:
            while not done.is_set():
                progress()
                try:
                    await asyncio.wait_for(done.wait(), 0.5)
                except asyncio.TimeoutError:
                    pass

        rep = asyncio.create_task(reporter())
        try:
            if mode == "syn":
                for i in range(0, len(ports), 256):
                    if stop.is_set():
                        break
                    chunk = ports[i : i + 256]
                    try:
                        found = await loop.run_in_executor(None, syn_sweep, ip, chunk, timeout)
                    except ImportError:
                        raise JobError("scapy is not installed (pip install scapy).")
                    for port in found:
                        banner = await probe_connect(ip, port, timeout, grab) if grab else ""
                        report_open(port, banner or "")
                    scanned += len(chunk)
            else:
                todo: asyncio.Queue[int] = asyncio.Queue()
                for p in ports:
                    todo.put_nowait(p)

                async def worker() -> None:
                    nonlocal scanned
                    while not stop.is_set():
                        try:
                            port = todo.get_nowait()
                        except asyncio.QueueEmpty:
                            return
                        banner = await probe_connect(ip, port, timeout, grab)
                        scanned += 1
                        if banner is not None:
                            report_open(port, banner)

                results = await asyncio.gather(*(worker() for _ in range(concurrency)), return_exceptions=True)
                for r in results:
                    if isinstance(r, BaseException):
                        raise r
        finally:
            done.set()
            await rep
            progress()
        verb = "stopped" if stop.is_set() else "complete"
        jlog.info("Scan %s: %d/%d ports probed, %d open, %.1fs", verb, scanned, len(ports), open_count, time.monotonic() - started)

    # ---- file integrity monitor
    def resolve_fim_root(self, raw: str) -> Path:
        if not raw.strip():
            raise JobError("No directory given.")
        try:
            root = Path(raw).expanduser().resolve(strict=True)
        except (OSError, RuntimeError):
            raise JobError(f"Path does not exist: {raw!r}")
        if not root.is_dir():
            raise JobError(f"Not a directory: {root}")
        if not any(root == r or root.is_relative_to(r) for r in self.fim_roots):
            allowed = ", ".join(map(str, self.fim_roots))
            raise JobError(f"{root} is outside this agent's permitted FIM roots ({allowed}). Start the agent with --fim-root to widen the scope.")
        return root

    async def fim(self, job_id: str, params: dict, stop: asyncio.Event, jlog) -> None:
        loop = asyncio.get_running_loop()
        root = self.resolve_fim_root(str(params.get("path", "")))
        jlog.info("Initialising file integrity monitor on %s", root)

        queue: asyncio.Queue[str] = asyncio.Queue()
        observer = Observer()
        try:  # watch first so changes made while we hash are not missed
            observer.schedule(_FimHandler(loop, queue), str(root), recursive=True)
            observer.start()
        except PermissionError:
            raise
        except OSError as e:
            raise JobError(f"Cannot watch {root}: {e}. On Linux this is often the inotify limit (sysctl fs.inotify.max_user_watches).")

        baseline: dict[str, dict] = {}
        bfile = baseline_file(root)
        dirty = False

        def emit_change(path: str, change: str, old: dict | None, new: dict | None, offline: bool = False) -> None:
            level = "error" if change in ("modified", "deleted") else "warn"
            self.send_event(job_id, "alert", {
                "path": path, "change": change, "offline": offline,
                "old_sha256": old and old["sha256"], "new_sha256": new and new["sha256"],
                "old_size": old and old["size"], "new_size": new and new["size"],
            }, level)
            jlog.log(logging.ERROR if level == "error" else logging.WARNING, "[FIM] %s%s %s", "(offline) " if offline else "", change.upper(), path)

        async def reconcile(path: str) -> None:
            nonlocal dirty
            try:
                cur = await loop.run_in_executor(None, snapshot_file, Path(path))
            except OSError as e:
                jlog.warning("[FIM] cannot read %s: %s", path, e)
                return
            old = baseline.get(path)
            if cur is None and old is None:
                return
            if old is None:
                change = "created"
            elif cur is None:
                change = "deleted"
            elif cur["sha256"] != old["sha256"]:
                change = "modified"
            elif cur["mode"] != old["mode"]:
                change = "permissions_changed"
            else:
                return  # touched but identical content: not an integrity event
            if cur is None:
                baseline.pop(path, None)
            else:
                baseline[path] = cur
            dirty = True
            emit_change(path, change, old, cur)

        try:
            t0 = time.monotonic()
            fresh = await loop.run_in_executor(None, build_baseline, root, lambda e: jlog.warning("[FIM] skipped unreadable path: %s", e))
            jlog.info("Baseline: %d files hashed with SHA-256 in %.1fs", len(fresh), time.monotonic() - t0)
            saved = load_baseline(bfile)
            if saved is None:
                jlog.info("No earlier baseline for this directory; recorded the current state as trusted.")
            else:
                changes = list(diff_baselines(saved, fresh))
                jlog.info("Compared with the baseline from the previous run: %d change(s) while the monitor was off.", len(changes))
                for path, change, old, new in changes:
                    emit_change(path, change, old, new, offline=True)
            baseline = fresh
            await loop.run_in_executor(None, save_baseline, bfile, baseline)
            jlog.info("Monitoring %s in real time.", root)

            pending: dict[str, float] = {}
            last_flush = time.monotonic()
            while not stop.is_set():
                try:
                    pending[await asyncio.wait_for(queue.get(), 0.25)] = time.monotonic()
                    while not queue.empty():
                        pending[queue.get_nowait()] = time.monotonic()
                except asyncio.TimeoutError:
                    pass
                now = time.monotonic()
                for p in [p for p, t in pending.items() if now - t >= 0.4]:  # debounce bursts of writes
                    del pending[p]
                    await reconcile(p)
                if dirty and now - last_flush > 10:
                    await loop.run_in_executor(None, save_baseline, bfile, dict(baseline))
                    dirty, last_flush = False, now
        finally:
            observer.stop()
            await loop.run_in_executor(None, observer.join, 5)
            if baseline:
                await loop.run_in_executor(None, save_baseline, bfile, dict(baseline))
            jlog.info("File integrity monitor stopped.")


def main() -> None:
    ap = argparse.ArgumentParser(description="CyberShield local agent")
    ap.add_argument("--url", default=os.environ.get("CYBERSHIELD_URL", "ws://127.0.0.1:8000/ws/agent"))
    ap.add_argument("--token", default=os.environ.get("AGENT_TOKEN"))
    ap.add_argument("--name", default=socket.gethostname())
    ap.add_argument("--fim-root", action="append", help="directory the FIM may watch (repeatable; default: home)")
    ap.add_argument("--allow-public", action="store_true", help="permit scanning non-private addresses (authorised targets only)")
    args = ap.parse_args()
    if not args.token:
        ap.error("set AGENT_TOKEN or pass --token")

    roots = [Path(r).expanduser().resolve() for r in (args.fim_root or [Path.home()])]
    agent = LocalAgent(args.url, args.token, args.name, roots, args.allow_public)

    log.setLevel(logging.INFO)
    console = logging.StreamHandler()
    console.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(message)s", "%H:%M:%S"))
    log.addHandler(console)
    log.addHandler(WSLogHandler(agent))
    log.info("FIM roots: %s | scan scope: %s", ", ".join(map(str, roots)), "ANY address" if args.allow_public else "private/loopback only")

    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        print("\nagent stopped", file=sys.stderr)


if __name__ == "__main__":
    main()
