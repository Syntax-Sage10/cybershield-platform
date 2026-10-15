from celery import Celery

from .config import settings

celery_app = Celery(
    "cybershield",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks"],
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,
    task_track_started=True,
    worker_prefetch_multiplier=1,
    result_expires=3600,
    timezone="UTC",
)
