# Usage Metering & Billing Engine

Answers per tenant: how much used, what does it cost, over limit? Idempotent metering,
quota enforcement (429/402), integer money math, Stripe test-mode sync (Phase 3).

## Architecture

```
Client --X-Tenant-ID/Idempotency-Key--> POST /generate
  -> MeterService.record: replay? -> quota check -> insert usage_event + receipt (atomic)
  -> over limit? 429 (Retry-After) / lapsed? 402 / ok? 200 + enqueue alert?
GET /usage <- rollup(usage_events) -> {used, limit, cost_cents}
Celery worker (Redis broker) <- email_outbox -- sends 80%/100% alerts via SMTP
Stripe Checkout/test webhooks -> Phase 3
```

Layers: `routers/ -> services/ -> repos(SQLAlchemy) -> Postgres`. Pricing pinned in `app/config.py`.

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

## Test

```bash
uv run pytest tests/ -q
```

## Limitations

- Auth is `X-Tenant-ID` header (no users/API keys yet — deferred to harness integration).
- Schema auto-creates on boot; Alembic migrations land in Phase 4.
- Stripe integration lands in Phase 3; worker sends via log backend when `SMTP_URL` is unset.
