"""Phase 2 gate: same key twice -> one event; boundary -> 429/402."""

import os
from datetime import date

import pytest

os.environ["DATABASE_URL"] = "sqlite:////tmp/opencode/phase2_test.db"

from fastapi.testclient import TestClient  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import EmailOutbox, Plan, Tenant  # noqa: E402
from app.services import metering, pricing, quotas  # noqa: E402

if os.path.exists("/tmp/opencode/phase2_test.db"):
    os.remove("/tmp/opencode/phase2_test.db")

from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _stub_celery_delay(monkeypatch):
    """No Redis in tests: capture .delay() calls instead of sending them."""
    calls = []

    class FakeTask:
        def delay(self, outbox_id):
            calls.append(outbox_id)

    monkeypatch.setattr(metering, "send_alert_email", FakeTask())
    return calls

client = TestClient(app)

DEMO = "00000000-0000-0000-0000-000000000001"
TINY = "00000000-0000-0000-0000-000000000002"
LATE = "00000000-0000-0000-0000-000000000003"


def setup_module():
    with TestClient(app):
        pass  # run lifespan (create + seed)
    db = SessionLocal()
    try:
        if db.get(Plan, "tiny") is None:
            db.add(Plan(id="tiny", name="Tiny", api_limit=2, token_limit=10, created_by="test"))
        for tid, status, plan in ((TINY, "active", "tiny"), (LATE, "past_due", "free")):
            if db.get(Tenant, tid) is None:
                db.add(Tenant(id=tid, name=tid, contact_email="t@example.com",
                              plan_id=plan, status=status, created_by="test"))
        db.commit()
    finally:
        db.close()


def _gen(tenant, key, payload):
    return client.post("/generate", json=payload,
                       headers={"X-Tenant-ID": tenant, "Idempotency-Key": key})


def test_idempotent_metering_same_key_twice_one_event():
    payload = {"type": "api_call", "qty": 1}
    r1 = _gen(DEMO, "gate-key-1", payload)
    r2 = _gen(DEMO, "gate-key-1", payload)
    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    assert r1.json() == r2.json()
    usage = client.get("/usage", params={"tenant_id": DEMO}).json()
    assert usage["api"]["used"] == 1, usage


def test_key_reuse_different_payload_rejected():
    assert _gen(DEMO, "gate-key-1", {"type": "api_call", "qty": 1}).status_code == 200
    r = _gen(DEMO, "gate-key-1", {"type": "ai_tokens", "input_tokens": 5})
    assert r.status_code == 422, r.text


def test_boundary_429_with_message_and_retry_after():
    assert _gen(TINY, "b1", {"type": "api_call", "qty": 1}).status_code == 200
    assert _gen(TINY, "b2", {"type": "api_call", "qty": 1}).status_code == 200
    r = _gen(TINY, "b3", {"type": "api_call", "qty": 1})
    assert r.status_code == 429, r.text
    assert r.json()["used"] == 2 and r.json()["limit"] == 2
    retry_after = int(r.headers["Retry-After"])
    assert abs(retry_after - quotas.seconds_until_reset()) <= 2 and retry_after > 0


def test_past_due_returns_402():
    r = _gen(LATE, "late-1", {"type": "api_call", "qty": 1})
    assert r.status_code == 402, r.text
    assert "payment" in r.json()["detail"].lower()


def test_missing_headers_400():
    r = client.post("/generate", json={"type": "api_call", "qty": 1})
    assert r.status_code == 400


def test_pricing_cached_cheaper_reasoning_is_output():
    assert pricing.token_cost_cents(1000, 0, 0, 0) == 15
    assert pricing.token_cost_cents(0, 1000, 0, 0) == 4  # cached cheaper
    assert pricing.token_cost_cents(0, 0, 500, 500) == 60  # reasoning = output
    assert pricing.token_cost_cents(2000, 1000, 500, 500) == 94


def test_retry_policy_is_exponential_backoff_with_jitter():
    from app.worker.tasks import send_alert_email

    assert send_alert_email.max_retries == 3
    assert send_alert_email.retry_backoff is True or send_alert_email.retry_backoff == 30
    assert send_alert_email.retry_jitter is True


def test_failed_row_is_not_retried():
    from app.worker.tasks import send_alert_email

    db = SessionLocal()
    try:
        row = EmailOutbox(tenant_id=DEMO, billing_period=date(2026, 9, 1),
                          kind="blocked_100", to_email="t@example.com", status="failed")
        # unique (tenant, period, kind) may already exist from earlier tests; reuse it
        existing = db.query(EmailOutbox).filter_by(
            tenant_id=DEMO, billing_period=date(2026, 9, 1), kind="blocked_100").first()
        target = existing or row
        if existing is None:
            db.add(row)
            db.commit()
            target = row
        else:
            existing.status = "failed"
            db.commit()
        assert send_alert_email.run(target.id) == "gave_up"
    finally:
        db.close()


def test_warn_80_enqueues_outbox_and_dispatches_fast_path(_stub_celery_delay):
    r = _gen(DEMO, "warn-80-key", {"type": "ai_tokens", "input_tokens": 80000})
    assert r.status_code == 200, r.text
    assert len(_stub_celery_delay) == 1
    db = SessionLocal()
    try:
        row = db.query(EmailOutbox).filter_by(id=_stub_celery_delay[0]).one()
        assert row.kind == "warn_80" and row.status == "pending"
    finally:
        db.close()
