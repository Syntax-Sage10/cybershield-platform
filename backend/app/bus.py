"""Redis pub/sub plumbing shared by the API, the WebSocket routers and Celery tasks."""
import json
from datetime import datetime

import redis.asyncio as aioredis

from .config import settings

DASHBOARD_CHANNEL = "cs:dashboard"


def agent_channel(agent_id: str) -> str:
    return f"cs:agent:{agent_id}:cmd"


def online_key(agent_id: str) -> str:
    return f"cs:agent:{agent_id}:online"


redis = aioredis.from_url(settings.redis_url, decode_responses=True)


def event_message(agent_id: str, job_id: str | None, kind: str, level: str, data: dict, ts: datetime) -> dict:
    return {
        "type": "event",
        "agent_id": agent_id,
        "job_id": job_id,
        "kind": kind,
        "level": level,
        "data": data,
        "ts": ts.isoformat(),
    }


async def publish_dashboard(message: dict) -> None:
    await redis.publish(DASHBOARD_CHANNEL, json.dumps(message, default=str))
