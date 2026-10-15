#!/usr/bin/env python3
"""Stream TCP port scan results to the CyberShield API.

Private, loopback, and link-local targets are allowed by default. Public targets
require ``--allow-public`` and should only be scanned with explicit authorization.
"""

from __future__ import annotations

import argparse
import asyncio
import ipaddress
import json
import os
import platform
import socket
import uuid
from collections.abc import Iterator

from websockets.asyncio.client import connect


def _resolve_target(target_ip: str, allow_public: bool) -> tuple[int, tuple]:
    """Resolve once and return a socket family/address pair for the scan."""
    try:
        addresses = socket.getaddrinfo(target_ip, 0, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise ValueError(f"Could not resolve target {target_ip!r}: {exc}") from exc

    # Prefer IPv4 where available, while retaining IPv6 support.
    addresses.sort(key=lambda info: info[0] != socket.AF_INET)
    for family, socktype, proto, _canonname, sockaddr in addresses:
        address = ipaddress.ip_address(sockaddr[0].split("%")[0])
        permitted = address.is_private or address.is_loopback or address.is_link_local
        if not permitted and not allow_public:
            raise ValueError(
                f"{address} is outside the default scan scope; pass --allow-public only "
                "for a system you own or are explicitly authorized to test"
            )
        return family, sockaddr
    raise ValueError(f"No TCP addresses found for {target_ip!r}")


def scan_ports(
    target_ip: str,
    start_port: int,
    end_port: int,
    *,
    timeout: float = 0.5,
    allow_public: bool = False,
) -> Iterator[dict[str, int | str]]:
    """Yield an ``open`` or ``closed`` result as soon as each TCP port is probed."""
    if not (1 <= start_port <= end_port <= 65535):
        raise ValueError("Ports must satisfy 1 <= start_port <= end_port <= 65535")
    if timeout <= 0:
        raise ValueError("timeout must be greater than zero")

    family, resolved = _resolve_target(target_ip, allow_public)
    for port in range(start_port, end_port + 1):
        # getaddrinfo(..., 0) gives IPv4 and IPv6 socket address tuples; replace
        # the port while preserving IPv6 flowinfo and scope ID fields.
        address = (resolved[0], port, *resolved[2:])
        with socket.socket(family, socket.SOCK_STREAM) as sock:
            sock.settimeout(timeout)
            try:
                result = sock.connect_ex(address)
                status = "open" if result == 0 else "closed"
            except OSError:
                status = "closed"
        yield {"type": "port_scan", "port": port, "status": status}


async def stream_scan(args: argparse.Namespace) -> None:
    token = args.token or os.environ.get("AGENT_TOKEN")
    if not token:
        raise SystemExit("Set AGENT_TOKEN or pass --token to authenticate with the API.")

    headers = {"Authorization": f"Bearer {token}"}
    async with connect(args.url, additional_headers=headers, ping_interval=20, ping_timeout=20) as ws:
        await ws.send(json.dumps({
            "type": "hello",
            "agent_id": args.agent_id or uuid.uuid4().hex,
            "name": args.name or socket.gethostname(),
            "hostname": socket.gethostname(),
            "platform": f"{platform.system()} {platform.release()}",
            "is_admin": False,
            "running_jobs": [],
        }))

        for result in scan_ports(
            args.target,
            args.start_port,
            args.end_port,
            timeout=args.timeout,
            allow_public=args.allow_public,
        ):
            await ws.send(json.dumps(result, separators=(",", ":")))
            print(json.dumps(result), flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scan TCP ports and stream results to CyberShield.")
    parser.add_argument("target", help="Target IP address or hostname")
    parser.add_argument("--start-port", type=int, default=1)
    parser.add_argument("--end-port", type=int, default=1024)
    parser.add_argument("--timeout", type=float, default=0.5, help="Per-port TCP timeout in seconds")
    parser.add_argument("--url", default=os.environ.get("CYBERSHIELD_URL", "ws://localhost:8000/ws/agent"))
    parser.add_argument("--token", help="Agent token (defaults to AGENT_TOKEN environment variable)")
    parser.add_argument("--agent-id", help="Stable agent ID; generated for this run when omitted")
    parser.add_argument("--name", help="Display name for this agent")
    parser.add_argument("--allow-public", action="store_true", help="Allow a public target you are authorized to scan")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        asyncio.run(stream_scan(args))
    except (OSError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
