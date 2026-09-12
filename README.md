# Usage Metering & Billing Engine

Answers per tenant: how much used, what does it cost, over limit? Idempotent metering,
quota enforcement (429/402), integer money math, Stripe test-mode sync (Phase 3).

## Architecture

```
                    ┌─────────────────────────────────────────────────┐
                    │                   api (:8000)                    │
                    │  routers/ → services/ → SQLAlchemy → Postgres   │
                    │  POST /generate · GET /usage · /billing · /demo │
                    └───────┬─────────────────────────────┬───────────┘
                            │ usage rows                  │ alert rows
                            ▼                             ▼
  Stripe Checkout ──► /webhooks/stripe ──►   Postgres ◄── email_outbox ──► worker ──SMTP──► Mailpit
  (test mode)        verify→dedupe→sync      tenants/plans/  (Celery+Redis)  :1025  (:8025 UI)
                     Free ⇄ Pro              subscriptions/                        ▲
                                             usage_events                          │ sweep q5m
                                             (Alembic migrations) ── beat ─────────┘
```

Money is integer cents only; `usage_events` is append-only; every retry path is
idempotent (metering keys, webhook event ids, outbox unique kinds). Pricing pinned
in `app/config.py` (v1: INPUT 15 / CACHED 4 / OUTPUT 60 per 1K, reasoning = output).

Layers: `routers/ (validation, 4xx never 500) → services/ (MeterService, QuotaService,
PricingService, StripeService, AlertService) → Postgres`. One background job plane
(Celery worker + beat) off the request path, retries with exponential backoff.

## Run

```bash
uv sync
docker compose up --build        # api :8000, worker, beat, redis, postgres, mailpit :8025
```

Local (no Docker): `DATABASE_URL=sqlite:///./local.db uv run uvicorn app.main:app`
Seed runs on boot (Free/Pro plans + demo tenant `00000000-0000-0000-0000-000000000001`).

## Try it

```bash
curl -X POST localhost:8000/generate -H 'Content-Type: application/json' \
  -H 'X-Tenant-ID: 00000000-0000-0000-0000-000000000001' -H 'Idempotency-Key: demo-1' \
  -d '{"type":"api_call","qty":1}'
curl 'localhost:8000/usage?tenant_id=00000000-0000-0000-0000-000000000001'
```

## Demo playground

Vite + React + Tailwind + shadcn, served by the API itself at `/demo`
(one image, no extra container, no CORS).

```bash
cd frontend && pnpm install && pnpm build   # build once to serve from FastAPI
pnpm dev                                     # or dev server (:5173/demo/, proxies API to :8000)
```

Dark-first dashboard with sidebar: Overview KPIs + probe-by-probe demo script,
request builder with double-send, fill-to-quota runner, pricing calculator,
Checkout launcher, signed/replay/forged webhook composer. Auth nav is a
placeholder until harness integration.

## Test

```bash
uv run pytest tests/ -q              # 15 tests: idempotency, quotas, pricing, webhooks
uv run alembic upgrade head          # schema migrations (also run on boot)
```

## Stripe (test mode)

```bash
# .env needs: STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_...
#             STRIPE_PRO_PRICE_ID=price_... (from Product catalog, test mode)
stripe listen --forward-to localhost:8000/webhooks/stripe
stripe trigger checkout.session.completed   # or complete a real test Checkout with 4242...
```

`POST /billing/checkout {"tenant_id"}` returns a Stripe URL. The webhook flips
the tenant to Pro; `customer.subscription.deleted` downgrades to Free.

## Limitations

- Auth is `X-Tenant-ID` header (no users/API keys yet — deferred to harness integration).
- Schema is owned by Alembic migrations (`alembic/versions`), applied on boot.
- Worker sends via log backend when `SMTP_URL` is unset.
