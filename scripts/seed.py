"""Seed Free/Pro plans + one demo tenant. Idempotent — safe to run on every boot."""

from app.auth import hash_password
from app.config import settings
from app.db import SessionLocal
from app.models import Plan, Tenant

DEMO_TENANT_ID = "00000000-0000-0000-0000-000000000001"
DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo123"


def seed() -> None:
    db = SessionLocal()
    try:
        if db.get(Plan, "free") is None:
            db.add(Plan(id="free", name="Free", api_limit=settings.free_api_limit,
                        token_limit=settings.free_token_limit, created_by="system:seed"))
        if db.get(Plan, "pro") is None:
            db.add(Plan(id="pro", name="Pro", api_limit=settings.pro_api_limit,
                        token_limit=settings.pro_token_limit, created_by="system:seed"))
        demo = db.get(Tenant, DEMO_TENANT_ID)
        if demo is None:
            db.add(Tenant(id=DEMO_TENANT_ID, name="Demo tenant", contact_email=DEMO_EMAIL,
                          password_hash=hash_password(DEMO_PASSWORD),
                          plan_id="free", status="active", created_by="system:seed"))
        elif demo.password_hash is None:
            demo.password_hash = hash_password(DEMO_PASSWORD)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed()
    print("seeded")
