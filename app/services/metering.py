"""MeterService.record: exactly-once metering + quota enforcement.

Order: validate -> replay check -> quota check -> insert event + receipt atomically.
Concurrent duplicate inserts collapse via UNIQUE(tenant_id, idempotency_key).
"""

import hashlib
import json

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.services import alerts, pricing, quotas


def _request_hash(body) -> str:
    canonical = json.dumps(body.model_dump(), sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _limits(db: Session, plan_id: str) -> tuple[int, int]:
    plan = db.query(models.Plan).filter_by(id=plan_id, deleted_at=None).first()
    if plan is not None:
        return plan.api_limit, plan.token_limit
    if plan_id == "pro":
        return settings.pro_api_limit, settings.pro_token_limit
    return settings.free_api_limit, settings.free_token_limit


def _replay(db: Session, tenant_id: str, key: str, req_hash: str):
    rec = (
        db.query(models.IdempotencyRecord)
        .filter_by(tenant_id=tenant_id, idempotency_key=key)
        .first()
    )
    if rec is None:
        return None
    if rec.request_hash != req_hash:
        return {"conflict": True, "record": rec}
    return {"conflict": False, "record": rec}


def record(db: Session, tenant_id: str, key: str, body, actor: str):
    req_hash = _request_hash(body)
    seen = _replay(db, tenant_id, key, req_hash)
    if seen is not None:
        if seen["conflict"]:
            return 422, {"detail": "Idempotency-Key already used with a different payload"}
        rec = seen["record"]
        return rec.response_code, rec.response_body

    tenant = db.query(models.Tenant).filter_by(id=tenant_id, deleted_at=None).first()
    if tenant is None:
        return 404, {"detail": "unknown tenant"}

    period = quotas.current_period()
    api_limit, token_limit = _limits(db, tenant.plan_id)

    if body.type == "api_call":
        used, limit = quotas.api_used(db, tenant_id, period), api_limit
        requested = body.qty
    else:
        used, limit = quotas.tokens_used(db, tenant_id, period), token_limit
        requested = quotas.requested_tokens(body)
        if requested <= 0:
            return 400, {"detail": "ai_tokens request must include at least 1 token"}

    if tenant.status in ("past_due", "canceled"):
        code, payload = 402, {
            "detail": "subscription requires payment — upgrade or settle the invoice",
            "used": used,
            "limit": limit,
        }
        _store_receipt(db, tenant_id, key, "POST /generate", req_hash, code, payload)
        db.commit()
        return code, payload

    if used + requested > limit:
        code, payload = 429, {
            "detail": "usage quota exceeded",
            "used": used,
            "limit": limit,
        }
        alerts.maybe_enqueue(db, tenant, period, ratio=1.0, blocked=True)
        _store_receipt(db, tenant_id, key, "POST /generate", req_hash, code, payload)
        db.commit()
        return code, payload

    cost = pricing.event_cost_cents(
        body.type, body.qty, body.input_tokens,
        body.cached_input_tokens, body.output_tokens, body.reasoning_tokens,
    )
    try:
        db.add(
            models.UsageEvent(
                tenant_id=tenant_id,
                type=body.type,
                qty=body.qty if body.type == "api_call" else requested,
                input_tokens=body.input_tokens,
                cached_input_tokens=body.cached_input_tokens,
                output_tokens=body.output_tokens,
                reasoning_tokens=body.reasoning_tokens,
                billing_period=period,
                idempotency_key=key,
                cost_cents=cost,
                pricing_version=settings.pricing_version,
                created_by=actor,
            )
        )
        db.flush()  # surface UNIQUE violation before storing receipt
        payload = {
            "allowed": True,
            "used": used + requested,
            "limit": limit,
            "cost_cents": cost,
        }
        _store_receipt(db, tenant_id, key, "POST /generate", req_hash, 200, payload)
        ratio = (used + requested) / limit if limit else 1.0
        alerts.maybe_enqueue(db, tenant, period, ratio=ratio, blocked=False)
        db.commit()
        return 200, payload
    except IntegrityError:
        db.rollback()
        seen = _replay(db, tenant_id, key, req_hash)
        if seen is not None and not seen["conflict"]:
            rec = seen["record"]
            return rec.response_code, rec.response_body
        # Key exists but payload differs (lost race with a conflicting write)
        return 422, {"detail": "Idempotency-Key already used with a different payload"}


def _store_receipt(db: Session, tenant_id, key, endpoint, req_hash, code, payload) -> None:
    db.add(
        models.IdempotencyRecord(
            tenant_id=tenant_id,
            idempotency_key=key,
            endpoint=endpoint,
            request_hash=req_hash,
            response_code=code,
            response_body=payload,
        )
    )
