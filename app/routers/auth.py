"""Auth router: register, login, demo login, and session introspection."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    create_access_token,
    get_current_tenant,
    hash_password,
    verify_password,
)
from app.db import get_db
from app.models import Tenant, _uuid
from scripts.seed import DEMO_TENANT_ID, seed

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    email: str = Field(..., max_length=256, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(..., max_length=256, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str


class TenantResponse(BaseModel):
    id: str
    name: str
    email: str
    plan_id: str
    status: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    tenant: TenantResponse


def _to_tenant_response(tenant: Tenant) -> TenantResponse:
    return TenantResponse(
        id=tenant.id,
        name=tenant.name,
        email=tenant.contact_email,
        plan_id=tenant.plan_id,
        status=tenant.status,
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(Tenant).filter_by(contact_email=str(body.email), deleted_at=None).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A tenant with this contact email already exists",
        )

    tenant = Tenant(
        id=_uuid(),
        name=body.name.strip(),
        contact_email=str(body.email).lower().strip(),
        password_hash=hash_password(body.password),
        plan_id="free",
        status="active",
        created_by="api:auth:register",
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    token = create_access_token(tenant.id, tenant.contact_email)
    return AuthResponse(access_token=token, tenant=_to_tenant_response(tenant))


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    tenant = db.query(Tenant).filter_by(contact_email=str(body.email).lower().strip(), deleted_at=None).first()
    if not tenant or not verify_password(body.password, tenant.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(tenant.id, tenant.contact_email)
    return AuthResponse(access_token=token, tenant=_to_tenant_response(tenant))


@router.post("/demo-login", response_model=AuthResponse)
def demo_login(db: Session = Depends(get_db)):
    demo = db.get(Tenant, DEMO_TENANT_ID)
    if not demo:
        seed()
        demo = db.get(Tenant, DEMO_TENANT_ID)

    if not demo:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to initialize demo tenant",
        )

    token = create_access_token(demo.id, demo.contact_email)
    return AuthResponse(access_token=token, tenant=_to_tenant_response(demo))


@router.get("/me", response_model=TenantResponse)
def get_me(current_tenant: Tenant = Depends(get_current_tenant)):
    return _to_tenant_response(current_tenant)
