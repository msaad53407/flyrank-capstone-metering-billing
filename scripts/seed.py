"""Seed Free/Pro plans + one demo tenant. Idempotent — safe to run on every boot."""

from app.config import settings
from app.db import SessionLocal
from app.models import Plan, Tenant

DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000001"


def seed() -> None:
    db = SessionLocal()
    try:
        if db.get(Plan, "free") is None:
            db.add(Plan(id="free", name="Free", api_limit=settings.free_api_limit,
                        token_limit=settings.free_token_limit, created_by="system:seed"))
        if db.get(Plan, "pro") is None:
            db.add(Plan(id="pro", name="Pro", api_limit=settings.pro_api_limit,
                        token_limit=settings.pro_token_limit, created_by="system:seed"))
        if db.get(Tenant, DEMO_TENANT_ID) is None:
            db.add(Tenant(id=DEMO_TENANT_ID, name="Demo tenant", contact_email="demo@example.com",
                          plan_id="free", status="active", created_by="system:seed"))
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
    print("seeded")
