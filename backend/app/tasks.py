"""Celery tasks. dispatch_job routes a queued job to the target agent's command channel,
retrying while the agent is not connected and failing the job if it never shows up."""
import json
import logging

import redis

from .bus import DASHBOARD_CHANNEL, agent_channel, event_message
from .celery_app import celery_app
from .config import settings
from .db import SyncSessionLocal
from .models import Event, Job, utcnow

log = logging.getLogger(__name__)
sync_redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)


def _fail(db, job: Job, reason: str) -> None:
    ts = utcnow()
    job.status, job.error, job.finished_at = "failed", reason, ts
    data = {"job_kind": job.kind, "status": "failed", "message": reason}
    db.add(Event(job_id=job.id, agent_id=job.agent_id, kind="status", level="error", data=data, ts=ts))
    db.commit()
    msg = event_message(job.agent_id, job.id, "status", "error", data, ts)
    sync_redis.publish(DASHBOARD_CHANNEL, json.dumps(msg))


@celery_app.task(bind=True, max_retries=5)
def dispatch_job(self, job_id: str) -> str:
    with SyncSessionLocal() as db:
        job = db.get(Job, job_id)
        if job is None or job.status != "queued":
            return "skipped"  # stopped or already picked up
        payload = json.dumps(
            {"type": "job.start", "job_id": job.id, "kind": job.kind, "params": job.params}
        )
        # publish() returns the number of subscribers: 0 means no agent connection is listening.
        if sync_redis.publish(agent_channel(job.agent_id), payload) == 0:
            if self.request.retries >= self.max_retries:
                _fail(db, job, "The agent is not connected to the hub.")
                return "failed"
            raise self.retry(countdown=2)
        log.info("dispatched %s job %s to agent %s", job.kind, job.id, job.agent_id)
        return "dispatched"
