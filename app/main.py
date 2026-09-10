from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import Base, engine
from app.routers import generate, health, usage


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
