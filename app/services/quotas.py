from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models

TOTAL_TOKEN_COLS = (
    models.UsageEvent.input_tokens
    + models.UsageEvent.cached_input_tokens
    + models.UsageEvent.output_tokens
    + models.UsageEvent.reasoning_tokens
)


def current_period() -> date:
    today = date.today()
    return date(today.year, today.month, 1)


def api_used(db: Session, tenant_id: str, period: date) -> int:
    return db.scalar(
        select(func.coalesce(func.sum(models.UsageEvent.qty), 0)).where(
            models.UsageEvent.tenant_id == tenant_id,
            models.UsageEvent.billing_period == period,
            models.UsageEvent.type == "api_call",
        )
    ) or 0


def tokens_used(db: Session, tenant_id: str, period: date) -> int:
    return db.scalar(
        select(func.coalesce(func.sum(TOTAL_TOKEN_COLS), 0)).where(
            models.UsageEvent.tenant_id == tenant_id,
            models.UsageEvent.billing_period == period,
            models.UsageEvent.type == "ai_tokens",
        )
    ) or 0


def cost_used(db: Session, tenant_id: str, period: date) -> int:
    return db.scalar(
        select(func.coalesce(func.sum(models.UsageEvent.cost_cents), 0)).where(
            models.UsageEvent.tenant_id == tenant_id,
            models.UsageEvent.billing_period == period,
        )
    ) or 0


def requested_tokens(body) -> int:
    return body.input_tokens + body.cached_input_tokens + body.output_tokens + body.reasoning_tokens
