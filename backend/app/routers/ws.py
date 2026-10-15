import asyncio
import hmac
import logging

from fastapi import APIRouter, WebSocket
from sqlalchemy import select

from ..bus import DASHBOARD_CHANNEL, agent_channel, event_message, online_key, publish_dashboard, redis
from ..config import settings
from ..db import AsyncSessionLocal
from ..models import Agent, Event, Job, utcnow

log = logging.getLogger("cybershield.ws")
router = APIRouter()

ONLINE_TTL = 15  # seconds; the agent's 2s metrics tick keeps this key alive
EVENT_KINDS = {"log", "port", "progress", "alert", "status"}
JOB_STATES = {"running", "completed", "failed", "stopped"}
TERMINAL = {"completed", "failed", "stopped"}


async def upsert_agent(hello: dict) -> Agent:
    async with AsyncSessionLocal() as db:
        agent = await db.get(Agent, hello["agent_id"])
        if agent is None:
            agent = Agent(id=hello["agent_id"])
            db.add(agent)
        agent.name = str(hello.get("name", ""))[:128]
        agent.hostname = str(hello.get("hostname", ""))[:255]
        agent.platform = str(hello.get("platform", ""))[:255]
        agent.is_admin = bool(hello.get("is_admin", False))
        agent.last_seen = utcnow()
        await db.commit()
        return agent


async def fail_orphaned_jobs(agent_id: str, still_running: list[str]) -> None:
    """Jobs the DB thinks are running but the (restarted) agent no longer knows about."""
    async with AsyncSessionLocal() as db:
        q = select(Job).where(Job.agent_id == agent_id, Job.status == "running", Job.id.not_in(still_running))
        for job in (await db.execute(q)).scalars():
            ts = utcnow()
            job.status, job.error, job.finished_at = "failed", "Agent restarted while the job was running.", ts
            data = {"job_kind": job.kind, "status": "failed", "message": job.error}
            db.add(Event(job_id=job.id, agent_id=agent_id, kind="status", level="error", data=data, ts=ts))
            await publish_dashboard(event_message(agent_id, job.id, "status", "error", data, ts))
        await db.commit()


async def handle_agent_message(agent_id: str, msg: dict) -> None:
    mtype = msg.get("type")
    if mtype == "port_scan":
        # Standalone scanner events keep their compact wire format while still being
        # relayed through the same authenticated, Redis-backed dashboard broker.
        port, status = msg.get("port"), msg.get("status")
        if type(port) is int and 1 <= port <= 65535 and status in {"open", "closed"}:
            await publish_dashboard({"type": "port_scan", "port": port, "status": status})
        return
    if mtype == "metrics":
        data = msg.get("data") or {}
        await publish_dashboard({"type": "metrics", "agent_id": agent_id, **data})
        return
    if mtype != "event":
        return
    kind = msg.get("kind")
    if kind not in EVENT_KINDS:
        return
    level = msg.get("level") if msg.get("level") in {"info", "warn", "error"} else "info"
    data = msg.get("data") if isinstance(msg.get("data"), dict) else {}
    job_id = msg.get("job_id")
    ts = utcnow()

    if kind != "progress":  # progress is high-frequency and only useful live
        async with AsyncSessionLocal() as db:
            db.add(Event(job_id=job_id, agent_id=agent_id, kind=kind, level=level, data=data, ts=ts))
            if kind == "status" and job_id and data.get("status") in JOB_STATES:
                job = await db.get(Job, job_id)
                if job and job.agent_id == agent_id:
                    job.status = data["status"]
                    if job.status in TERMINAL:
                        job.finished_at = ts
                        job.error = str(data.get("message") or "")[:2000] or None
            await db.commit()
    await publish_dashboard(event_message(agent_id, job_id, kind, level, data, ts))


@router.websocket("/ws/agent")
async def agent_socket(ws: WebSocket):
    expected = f"Bearer {settings.agent_token}".encode()
    if not hmac.compare_digest(ws.headers.get("authorization", "").encode(), expected):
        await ws.close(code=4401)
        return
    await ws.accept()
    try:
        hello = await asyncio.wait_for(ws.receive_json(), timeout=10)
    except Exception:
        await ws.close(code=4400)
        return
    if not isinstance(hello, dict) or hello.get("type") != "hello" or not hello.get("agent_id"):
        await ws.close(code=4400)
        return
    hello["agent_id"] = str(hello["agent_id"])[:64]
    agent_id = hello["agent_id"]

    await upsert_agent(hello)
    await fail_orphaned_jobs(agent_id, [str(j) for j in hello.get("running_jobs", [])])
    await redis.set(online_key(agent_id), "1", ex=ONLINE_TTL)
    await publish_dashboard({
        "type": "agent", "agent_id": agent_id, "online": True, "name": str(hello.get("name", "")),
        "hostname": str(hello.get("hostname", "")), "platform": str(hello.get("platform", "")),
        "is_admin": bool(hello.get("is_admin", False)),
    })
    log.info("agent %s connected", agent_id)

    pubsub = redis.pubsub()
    await pubsub.subscribe(agent_channel(agent_id))

    async def pump_commands():  # Redis -> agent
        async for m in pubsub.listen():
            if m["type"] == "message":
                await ws.send_text(m["data"])

    async def pump_events():  # agent -> DB + dashboards
        while True:
            msg = await ws.receive_json()
            await redis.set(online_key(agent_id), "1", ex=ONLINE_TTL)
            try:
                await handle_agent_message(agent_id, msg)
            except Exception:
                log.exception("failed to process agent message")

    tasks = [asyncio.create_task(pump_commands()), asyncio.create_task(pump_events())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await pubsub.unsubscribe(agent_channel(agent_id))
        await pubsub.aclose()
        await redis.delete(online_key(agent_id))
        await publish_dashboard({"type": "agent", "agent_id": agent_id, "online": False})
        log.info("agent %s disconnected", agent_id)


@router.websocket("/ws/dashboard")
async def dashboard_socket(ws: WebSocket):
    origin = ws.headers.get("origin")
    if origin and origin not in settings.origins:  # blocks cross-site WebSocket hijacking
        await ws.close(code=4403)
        return
    await ws.accept()
    pubsub = redis.pubsub()
    await pubsub.subscribe(DASHBOARD_CHANNEL)

    async def forward():
        async for m in pubsub.listen():
            if m["type"] == "message":
                await ws.send_text(m["data"])

    async def watch_disconnect():
        while True:
            await ws.receive_text()

    tasks = [asyncio.create_task(forward()), asyncio.create_task(watch_disconnect())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await pubsub.unsubscribe(DASHBOARD_CHANNEL)
        await pubsub.aclose()
