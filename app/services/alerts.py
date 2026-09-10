"""AlertService: enqueue-only from the request path. Worker sends."""

from sqlalchemy.orm import Session

from app import models


def maybe_enqueue(db: Session, tenant, period, ratio: float, blocked: bool) -> None:
    kind = None
    if blocked:
        kind = "blocked_100"
    elif ratio >= 0.8:
        kind = "warn_80"
    if kind is None:
        return
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        stmt = pg_insert(models.EmailOutbox).values(
            tenant_id=tenant.id,
            billing_period=period,
            kind=kind,
            to_email=tenant.contact_email,
            status="pending",
        )
        db.execute(stmt.on_conflict_do_nothing(index_elements=["tenant_id", "billing_period", "kind"]))
    else:
        row = (
            db.query(models.EmailOutbox)
            .filter_by(tenant_id=tenant.id, billing_period=period, kind=kind)
            .first()
        )
        if row is None:
            db.add(
                models.EmailOutbox(
                    tenant_id=tenant.id,
                    billing_period=period,
                    kind=kind,
                    to_email=tenant.contact_email,
                    status="pending",
                )
            )
