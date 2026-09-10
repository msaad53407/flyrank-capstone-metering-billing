from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import Base, engine
from app.routers import billing, generate, health, usage, webhooks


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Phase 2: create tables if missing. Alembic migrations own schema from Phase 4.
    from app import models  # noqa: F401
    from scripts.seed import seed

    Base.metadata.create_all(bind=engine)
    seed()
    yield


app = FastAPI(title="Usage Metering & Billing Engine", lifespan=lifespan)

app.include_router(health.router, tags=["ops"])
app.include_router(generate.router, tags=["metering"])
app.include_router(usage.router, tags=["metering"])
app.include_router(billing.router, tags=["billing"])
app.include_router(webhooks.router, tags=["billing"])

# Demo playground (Vite + React build output). API routes always win;
# build it with `cd frontend && pnpm install && pnpm build` to serve /demo.
app.frontend("/demo", directory="frontend/dist", check_dir=False)
