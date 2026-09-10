"""Phase 2 gate: same key twice -> one event; boundary -> 429/402."""

import os

os.environ["DATABASE_URL"] = "sqlite:////tmp/opencode/phase2_test.db"

from fastapi.testclient import TestClient  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app.models import Plan, Tenant  # noqa: E402
from app.services import pricing  # noqa: E402

if os.path.exists("/tmp/opencode/phase2_test.db"):
    os.remove("/tmp/opencode/phase2_test.db")

from app.main import app  # noqa: E402

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
    assert "Retry-After" in r.headers


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
