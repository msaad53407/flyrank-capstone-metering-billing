"""Phase 3 gate: Checkout flips Free->Pro via webhook; forged -> 400; replay ignored."""

import hashlib
import hmac
import json
import os
import time

import pytest

os.environ["DATABASE_URL"] = "sqlite:////tmp/opencode/phase2_test.db"

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import Subscription, Tenant  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)

SECRET = "whsec_test_phase3"
TENANT = "00000000-0000-0000-0000-0000000000A1"


@pytest.fixture(autouse=True)
def _stripe_secret(monkeypatch):
    monkeypatch.setattr(settings, "stripe_webhook_secret", SECRET)


def setup_module():
    with TestClient(app):
        pass
    db = SessionLocal()
    try:
        if db.get(Tenant, TENANT) is None:
            db.add(Tenant(id=TENANT, name="stripe tenant", contact_email="s@example.com",
                          plan_id="free", status="active", created_by="test"))
        db.commit()
    finally:
        db.close()


def _signed(payload: dict, secret: str = SECRET):
    raw = json.dumps(payload).encode()
    ts = int(time.time())
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + raw, hashlib.sha256).hexdigest()
    return raw, f"t={ts},v1={sig}"


def _post(raw: bytes, sig: str):
    return client.post("/webhooks/stripe", content=raw,
                       headers={"Stripe-Signature": sig, "Content-Type": "application/json"})


def _session_event():
    return {
        "id": "evt_completed_1", "object": "event", "type": "checkout.session.completed",
        "data": {"object": {"id": "cs_1", "object": "checkout.session",
                            "client_reference_id": TENANT,
                            "metadata": {"tenant_id": TENANT},
                            "customer": "cus_123", "subscription": "sub_123"}},
    }


def _plan_of():
    db = SessionLocal()
    try:
        return db.get(Tenant, TENANT).plan_id
    finally:
        db.close()


def test_checkout_completed_flips_free_to_pro():
    raw, sig = _signed(_session_event())
    r = _post(raw, sig)
    assert r.status_code == 200, r.text
    assert _plan_of() == "pro"
    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter_by(stripe_sub_id="sub_123").one()
        assert sub.status == "active"
        assert db.get(Tenant, TENANT).stripe_customer_id == "cus_123"
    finally:
        db.close()
    usage = client.get("/usage", params={"tenant_id": TENANT}).json()
    assert usage["plan"] == "pro" and usage["api"]["limit"] == 10000


def test_replay_of_same_event_processed_once():
    raw, sig = _signed(_session_event())
    r = _post(raw, sig)
    assert r.status_code == 200 and r.json().get("deduped") is True
    db = SessionLocal()
    try:
        assert db.query(Subscription).filter_by(stripe_sub_id="sub_123").count() == 1
    finally:
        db.close()


def test_forged_signature_400_nothing_changes():
    raw, _ = _signed(_session_event())
    raw2, _ = _signed({"id": "evt_forged", "object": "event",
                       "type": "checkout.session.completed", "data": {"object": {}}})
    r = _post(raw2, "t=123,v1=deadbeef")
    assert r.status_code == 400, r.text
    assert _plan_of() == "pro"  # unchanged by the forgery
    _ = raw


def test_subscription_deleted_downgrades_to_free():
    payload = {"id": "evt_deleted_1", "object": "event", "type": "customer.subscription.deleted",
               "data": {"object": {"id": "sub_123", "object": "subscription", "status": "canceled"}}}
    raw, sig = _signed(payload)
    r = _post(raw, sig)
    assert r.status_code == 200, r.text
    assert _plan_of() == "free"


def test_unknown_event_type_acked():
    raw, sig = _signed({"id": "evt_unknown_1", "object": "event",
                        "type": "customer.created", "data": {"object": {}}})
    r = _post(raw, sig)
    assert r.status_code == 200 and r.json().get("ignored") == "customer.created"


def test_checkout_route_validation(monkeypatch):
    r = client.post("/billing/checkout", json={"tenant_id": "no-such-tenant"})
    assert r.status_code == 404
    monkeypatch.setattr(settings, "stripe_secret_key", "")
    monkeypatch.setattr(settings, "stripe_pro_price_id", "")
    r = client.post("/billing/checkout", json={"tenant_id": TENANT})
    assert r.status_code == 503  # stripe keys unset -> never touches network
