"""Authentication helpers: password hashing, JWT generation, and tenant dependencies."""

from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import Tenant

security_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hash a plaintext password using bcrypt with salt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str | None) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    if not hashed_password:
        return False
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(tenant_id: str, email: str, expires_delta: timedelta | None = None) -> str:
    """Create a signed JWT access token for a tenant."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.jwt_expire_minutes)
    )
    payload = {
        "sub": tenant_id,
        "email": email,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """Decode and validate a signed JWT token."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def get_current_tenant(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    x_tenant_id: str | None = Header(default=None, alias="X-Tenant-ID"),
    db: Session = Depends(get_db),
) -> Tenant:
    """Resolve the active tenant from either Bearer JWT or fallback X-Tenant-ID header.

    Allows smooth migration from header-based testing to full JWT auth.
    """
    tenant_id: str | None = None

    if credentials and credentials.scheme.lower() == "bearer":
        try:
            payload = decode_access_token(credentials.credentials)
            tenant_id = payload.get("sub")
        except jwt.PyJWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid or expired authentication token: {exc}",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

    if not tenant_id and x_tenant_id:
        tenant_id = x_tenant_id

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided (Bearer token or X-Tenant-ID header required)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    tenant = db.query(Tenant).filter_by(id=tenant_id, deleted_at=None).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant '{tenant_id}' does not exist or has been deleted",
        )

    return tenant


def get_optional_current_tenant(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    x_tenant_id: str | None = Header(default=None, alias="X-Tenant-ID"),
    db: Session = Depends(get_db),
) -> Tenant | None:
    """Optionally resolve the active tenant without raising 401 if missing."""
    tenant_id: str | None = None

    if credentials and credentials.scheme.lower() == "bearer":
        try:
            payload = decode_access_token(credentials.credentials)
            tenant_id = payload.get("sub")
        except jwt.PyJWTError:
            return None

    if not tenant_id and x_tenant_id:
        tenant_id = x_tenant_id

    if not tenant_id:
        return None

    return db.query(Tenant).filter_by(id=tenant_id, deleted_at=None).first()

