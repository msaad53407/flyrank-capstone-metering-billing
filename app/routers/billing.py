from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Tenant
from app.services import stripe_service

router = APIRouter()


class CheckoutRequest(BaseModel):
    tenant_id: str


@router.post("/billing/checkout")
def checkout(body: CheckoutRequest, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter_by(id=body.tenant_id, deleted_at=None).first()
    if tenant is None:
        return JSONResponse(status_code=404, content={"detail": "unknown tenant"})
    if not settings.stripe_secret_key or not settings.stripe_pro_price_id:
        return JSONResponse(status_code=503, content={"detail": "stripe not configured"})
    try:
        return stripe_service.create_checkout_session(tenant)
    except Exception as exc:  # noqa: BLE001 — Stripe outage/shape change -> 502, never 500
        return JSONResponse(status_code=502, content={"detail": f"stripe error: {exc}"})
