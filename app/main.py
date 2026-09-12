from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI

from app.routers import billing, generate, health, usage, webhooks

ROOT = Path(__file__).resolve().parent.parent


def _migrate() -> None:
    """Migrations own the schema (shared req: real persistence)."""
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "alembic"))
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from scripts.seed import seed

    _migrate()
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
