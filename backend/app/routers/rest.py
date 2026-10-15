import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..bus import agent_channel, online_key, redis
from ..db import get_session
from ..models import Agent, Event, Job, utcnow
from ..schemas import FimParams, JobCreate, PortScanParams
from ..tasks import dispatch_job

router = APIRouter()
ACTIVE = ("queued", "running")


def event_dict(e: Event) -> dict:
    return {
        "id": e.id, "job_id": e.job_id, "agent_id": e.agent_id, "kind": e.kind,
        "level": e.level, "data": e.data, "ts": e.ts.isoformat(),
    }


def job_dict(j: Job) -> dict:
    return {
        "id": j.id, "agent_id": j.agent_id, "kind": j.kind, "params": j.params, "status": j.status,
        "error": j.error, "created_at": j.created_at.isoformat(),
    }


@router.get("/agents")
async def list_agents(db: AsyncSession = Depends(get_session)):
    agents = (await db.execute(select(Agent).order_by(Agent.last_seen.desc()))).scalars().all()
    return [
        {
            "id": a.id, "name": a.name, "hostname": a.hostname, "platform": a.platform,
            "is_admin": a.is_admin, "online": bool(await redis.exists(online_key(a.id))),
        }
        for a in agents
    ]


@router.get("/jobs")
async def list_jobs(limit: int = Query(50, ge=1, le=200), db: AsyncSession = Depends(get_session)):
    rows = (await db.execute(select(Job).order_by(Job.created_at.desc()).limit(limit))).scalars().all()
    return [job_dict(j) for j in rows]


@router.get("/events")
async def list_events(limit: int = Query(500, ge=1, le=2000), db: AsyncSession = Depends(get_session)):
    q = select(Event).where(Event.kind.in_(["log", "port", "alert", "status"])).order_by(Event.id.desc()).limit(limit)
    rows = (await db.execute(q)).scalars().all()
    return [event_dict(e) for e in reversed(rows)]  # oldest first


@router.post("/jobs", status_code=201)
async def create_job(body: JobCreate, db: AsyncSession = Depends(get_session)):
    agent = await db.get(Agent, body.agent_id)
    if agent is None:
        raise HTTPException(404, "Unknown agent.")
    if not await redis.exists(online_key(agent.id)):
        raise HTTPException(409, "The agent is offline. Start agent.py and try again.")

    model = PortScanParams if body.kind == "port_scan" else FimParams
    try:
        params = model.model_validate(body.params).model_dump()
    except ValidationError as e:
        raise HTTPException(422, "; ".join(f"{'.'.join(map(str, x['loc']))}: {x['msg']}" for x in e.errors()))

    busy = await db.execute(
        select(Job.id).where(Job.agent_id == agent.id, Job.kind == body.kind, Job.status.in_(ACTIVE)).limit(1)
    )
    if busy.first():
        raise HTTPException(409, f"A {body.kind.replace('_', ' ')} job is already active on this agent.")

    job = Job(agent_id=agent.id, kind=body.kind, params=params, status="queued")
    db.add(job)
    await db.commit()
    dispatch_job.delay(job.id)
    return job_dict(job)


@router.post("/jobs/{job_id}/stop")
async def stop_job(job_id: str, db: AsyncSession = Depends(get_session)):
    job = await db.get(Job, job_id)
    if job is None:
        raise HTTPException(404, "Unknown job.")
    if job.status == "queued":
        job.status, job.finished_at = "stopped", utcnow()
        await db.commit()
    elif job.status != "running":
        raise HTTPException(409, f"Job already {job.status}.")
    receivers = await redis.publish(agent_channel(job.agent_id), json.dumps({"type": "job.stop", "job_id": job.id}))
    if job.status == "running" and receivers == 0:
        raise HTTPException(409, "The agent is not connected, so the stop request could not be delivered.")
    return {"ok": True}
