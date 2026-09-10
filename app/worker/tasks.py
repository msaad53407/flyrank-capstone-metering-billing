"""Event-driven usage-alert sender. Request path enqueues, worker sends."""

import logging
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage

from app.config import settings
from app.db import SessionLocal
from app.models import EmailOutbox, JobRun
from app.worker.celery_app import celery_app

log = logging.getLogger(__name__)

SUBJECTS = {
    "warn_80": "Usage alert: 80% of quota reached",
    "blocked_100": "Usage alert: quota exceeded",
}


def _send(to_email: str, kind: str, tenant_id: str) -> None:
    if not settings.smtp_url:
        log.info("SMTP_URL unset — alert %s for tenant %s to %s (log backend)", kind, tenant_id, to_email)
        return
    msg = EmailMessage()
    msg["From"] = settings.alert_from_email
    msg["To"] = to_email
    msg["Subject"] = SUBJECTS[kind]
    msg.set_content(f"Tenant {tenant_id}: {SUBJECTS[kind]}.")
    # SMTP_URL like smtp://host:port; auth via env extension later (Phase 3+)
    host_port = settings.smtp_url.removeprefix("smtp://")
    host, _, port = host_port.partition(":")
    with smtplib.SMTP(host or "localhost", int(port or 25), timeout=10) as smtp:
        smtp.send_message(msg)


@celery_app.task(bind=True, max_retries=3, retry_backoff=30, retry_jitter=True)
def send_alert_email(self, outbox_id: str):
    """Delays between attempts: 30s, 60s, 120s (+ jitter). Then gives up."""
    db = SessionLocal()
    try:
        row = db.query(EmailOutbox).filter_by(id=outbox_id).first()
        if row is None or row.status == "sent":
            return "noop"
        if row.status == "failed":
            return "gave_up"
        try:
            _send(row.to_email, row.kind, row.tenant_id)
        except Exception as exc:  # noqa: BLE001 — retry then persist failure
            row.attempts += 1
            row.last_error = str(exc)[:500]
            if row.attempts >= 3:
                row.status = "failed"
            db.commit()
            raise self.retry(exc=exc)
        row.status = "sent"
        row.sent_at = datetime.now(timezone.utc)
        db.commit()
        return "sent"
    finally:
        db.close()


@celery_app.task
def sweep_pending_alerts(limit: int = 100):
    """Beat-periodic safety net: re-queue anything stuck in pending."""
    db = SessionLocal()
    try:
        run = JobRun(job_name="sweep_pending_alerts", status="ok")
        db.add(run)
        rows = db.query(EmailOutbox).filter_by(status="pending").limit(limit).all()
        for row in rows:
            send_alert_email.delay(row.id)
        run.finished_at = datetime.now(timezone.utc)
        db.commit()
        return len(rows)
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        db.add(JobRun(job_name="sweep_pending_alerts", status="failed", last_error=str(exc)[:500]))
        db.commit()
        raise
    finally:
        db.close()
