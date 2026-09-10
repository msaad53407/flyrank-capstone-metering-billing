from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Plan, Tenant
from app.services import quotas

router = APIRouter()


@router.get("/usage")
def usage(tenant_id: str = Query(...), db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter_by(id=tenant_id, deleted_at=None).first()
    if tenant is None:
        return JSONResponse(status_code=404, content={"detail": "unknown tenant"})
    period = quotas.current_period()
    plan = db.query(Plan).filter_by(id=tenant.plan_id, deleted_at=None).first()
    if plan is not None:
        api_limit, token_limit = plan.api_limit, plan.token_limit
    elif tenant.plan_id == "pro":
        api_limit, token_limit = settings.pro_api_limit, settings.pro_token_limit
    else:
        api_limit, token_limit = settings.free_api_limit, settings.free_token_limit
    return {
        "tenant_id": tenant.id,
        "plan": tenant.plan_id,
        "period": period.isoformat(),
        "api": {"used": quotas.api_used(db, tenant.id, period), "limit": api_limit},
        "tokens": {"used": quotas.tokens_used(db, tenant.id, period), "limit": token_limit},
        "cost_cents": quotas.cost_used(db, tenant.id, period),
        "pricing_version": settings.pricing_version,
    }
