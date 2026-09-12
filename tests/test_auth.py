import os

os.environ["DATABASE_URL"] = "sqlite:////tmp/opencode/phase2_test.db"

from fastapi.testclient import TestClient

from app.main import app
from app.models import Tenant
from app.db import SessionLocal
from scripts.seed import DEMO_TENANT_ID

client = TestClient(app)


def setup_module():
    with TestClient(app):
        pass  # run lifespan (migrate + seed)


def test_demo_login():
    res = client.post("/auth/demo-login")
    assert res.status_code == 200, res.text
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["tenant"]["id"] == DEMO_TENANT_ID
    assert data["tenant"]["email"] == "demo@example.com"


def test_register_and_login():
    email = "newtenant@example.com"
    password = "secretpassword123"

    # Register
    reg_res = client.post(
        "/auth/register",
        json={"name": "Acme Corp", "email": email, "password": password},
    )
    assert reg_res.status_code == 201, reg_res.text
    reg_data = reg_res.json()
    assert "access_token" in reg_data
    tenant_id = reg_data["tenant"]["id"]
    assert reg_data["tenant"]["name"] == "Acme Corp"
    assert reg_data["tenant"]["plan_id"] == "free"

    # Duplicate registration should fail
    dup_res = client.post(
        "/auth/register",
        json={"name": "Acme Corp 2", "email": email, "password": password},
    )
    assert dup_res.status_code == 409

    # Login with invalid password
    bad_login = client.post(
        "/auth/login",
        json={"email": email, "password": "wrongpassword"},
    )
    assert bad_login.status_code == 401

    # Login with correct credentials
    login_res = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    # Test /auth/me with Bearer token
    me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["id"] == tenant_id
    assert me_res.json()["email"] == email

    # Test /generate using Bearer token without X-Tenant-ID header
    gen_res = client.post(
        "/generate",
        headers={
            "Authorization": f"Bearer {token}",
            "Idempotency-Key": "auth-test-key-001",
        },
        json={
            "type": "ai_tokens",
            "qty": 1,
            "input_tokens": 100,
            "output_tokens": 50,
        },
    )
    assert gen_res.status_code == 200, gen_res.text
    assert gen_res.json()["allowed"] is True
    assert gen_res.json()["used"] == 150
