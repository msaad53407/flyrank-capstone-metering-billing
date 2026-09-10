from fastapi import APIRouter, Depends, Header
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import GenerateRequest
from app.services import metering

router = APIRouter()


@router.post("/generate")
def generate(
    body: GenerateRequest,
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    tenant_id: str | None = Header(default=None, alias="X-Tenant-ID"),
):
    if not idempotency_key:
        return JSONResponse(status_code=400, content={"detail": "Idempotency-Key header is required"})
    if not tenant_id:
        return JSONResponse(status_code=400, content={"detail": "X-Tenant-ID header is required"})
    code, payload = metering.record(db, tenant_id, idempotency_key, body, actor=f"tenant:{tenant_id}")
    headers = {"Retry-After": "60"} if code == 429 else {}
    return JSONResponse(status_code=code, content=payload, headers=headers)
