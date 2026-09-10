"""Stripe webhook handler: verify -> dedupe -> sync. Payment truth lives at Stripe.

Status mapping (documented):
- checkout.session.completed / sub active|trialing -> plan=pro, status=active
- customer.subscription.updated past_due      -> status=past_due (plan kept; usage -> 402)
- customer.subscription.updated/deleted with ended access
  (canceled/unpaid/incomplete_expired/deleted) -> plan=free, status=active
"""

import hashlib
import logging
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.db import get_db

router = APIRouter()
log = logging.getLogger(__name__)


def _touch(tenant, actor: str) -> None:
    tenant.version += 1
    tenant.updated_at = datetime.now(timezone.utc)
    tenant.updated_by = actor


def _on_checkout_completed(db: Session, event, obj: dict) -> dict:
    tenant_id = ((obj.get("metadata") or {}).get("tenant_id")) or obj.get("client_reference_id")
    if not tenant_id:
        log.warning("stripe %s without tenant metadata; acked", event["id"])
        return {"warn": "missing tenant"}
    tenant = db.query(models.Tenant).filter_by(id=tenant_id, deleted_at=None).first()
    if tenant is None:
        log.warning("stripe %s for unknown tenant %s; acked", event["id"], tenant_id)
        return {"warn": "unknown tenant"}
    tenant.stripe_customer_id = obj.get("customer") or tenant.stripe_customer_id
    sub_id = obj.get("subscription")
    if sub_id and db.query(models.Subscription).filter_by(stripe_sub_id=sub_id).first() is None:
        db.add(models.Subscription(tenant_id=tenant.id, stripe_sub_id=sub_id,
                                   status="active", created_by=f"stripe:{event['id']}"))
    tenant.plan_id = "pro"
    tenant.status = "active"
    _touch(tenant, f"stripe:{event['id']}")
    return {"tenant": tenant.id, "plan": "pro"}


def _tenant_for_subscription(db: Session, event, obj: dict):
    sub = db.query(models.Subscription).filter_by(stripe_sub_id=obj.get("id")).first()
    if sub is None:
        # Subscription created outside Checkout (e.g. dashboard): adopt via metadata.
        tenant_id = (obj.get("metadata") or {}).get("tenant_id")
        tenant = db.query(models.Tenant).filter_by(id=tenant_id, deleted_at=None).first() if tenant_id else None
        if tenant is None:
            log.warning("stripe %s for unknown subscription; acked", event["id"])
            return None, None
        sub = models.Subscription(tenant_id=tenant.id, stripe_sub_id=obj.get("id"),
                                  status=obj.get("status", ""), created_by=f"stripe:{event['id']}")
        db.add(sub)
    tenant = db.query(models.Tenant).filter_by(id=sub.tenant_id, deleted_at=None).first()
    return sub, tenant


def _period(dt_value):
    if not dt_value:
        return None
    try:
        return datetime.fromtimestamp(int(dt_value), tz=timezone.utc)
    except (TypeError, ValueError):
        return None


def _on_subscription_updated(db: Session, event, obj: dict) -> dict:
    sub, tenant = _tenant_for_subscription(db, event, obj)
    if sub is None or tenant is None:
        return {"warn": "unknown subscription"}
    status = obj.get("status", "")
    sub.status = status
    sub.current_period_start = _period(obj.get("current_period_start"))
    sub.current_period_end = _period(obj.get("current_period_end"))
    sub.version += 1
    sub.updated_by = f"stripe:{event['id']}"
    if status in ("active", "trialing"):
        tenant.status = "active"
    elif status == "past_due":
        tenant.status = "past_due"
    elif status in ("canceled", "unpaid", "incomplete_expired"):
        tenant.plan_id = "free"
        tenant.status = "active"
    _touch(tenant, f"stripe:{event['id']}")
    return {"tenant": tenant.id, "subscription": sub.stripe_sub_id, "status": status}


def _on_subscription_deleted(db: Session, event, obj: dict) -> dict:
    sub, tenant = _tenant_for_subscription(db, event, obj)
    if sub is None or tenant is None:
        return {"warn": "unknown subscription"}
    sub.status = "canceled"
    sub.version += 1
    sub.updated_by = f"stripe:{event['id']}"
    tenant.plan_id = "free"
    tenant.status = "active"
    _touch(tenant, f"stripe:{event['id']}")
    return {"tenant": tenant.id, "plan": "free"}


HANDLERS = {
    "checkout.session.completed": _on_checkout_completed,
    "customer.subscription.updated": _on_subscription_updated,
    "customer.subscription.deleted": _on_subscription_deleted,
}


@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
):
    payload = await request.body()  # raw bytes: JSON parsing would break verification
    if not stripe_signature:
        return JSONResponse(status_code=400, content={"detail": "missing Stripe-Signature"})
    try:
        raw_event = stripe.Webhook.construct_event(payload, stripe_signature, settings.stripe_webhook_secret)
        event = raw_event.to_dict()  # plain dicts downstream (StripeObject has no .get())
    except stripe.error.SignatureVerificationError:
        return JSONResponse(status_code=400, content={"detail": "invalid webhook signature"})
    except Exception:  # noqa: BLE001 — malformed JSON etc.
        return JSONResponse(status_code=400, content={"detail": "malformed webhook payload"})

    try:
        db.add(models.StripeEvent(
            stripe_event_id=event["id"], type=event["type"],
            payload_hash=hashlib.sha256(payload).hexdigest(),
        ))
        db.flush()  # replay of a PK -> IntegrityError -> no-op below
    except IntegrityError:
        db.rollback()
        return {"received": True, "deduped": True}

    handler = HANDLERS.get(event["type"])
    if handler is None:
        db.commit()
        return {"received": True, "ignored": event["type"]}
    result = handler(db, event, event["data"]["object"])
    db.commit()
    return {"received": True, **result}
