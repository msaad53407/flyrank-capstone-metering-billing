from celery import Celery

from app.config import settings

celery_app = Celery("metering", broker=settings.celery_broker_url)
celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_default_retry_delay=30,
    task_annotations={"app.worker.tasks.send_alert_email": {"max_retries": 3}},
    beat_schedule={"sweep-pending-alerts": {"task": "app.worker.tasks.sweep_pending_alerts", "schedule": 300.0}},
)
celery_app.autodiscover_tasks(["app.worker"])
