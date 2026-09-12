# EVIDENCE — one proof per Requirements checkbox (Sec 6)

## Phase 2 — Metering + Quotas

### Metering: same request twice -> exactly one usage event
`uv run pytest tests/test_phase2.py::test_idempotent_metering_same_key_twice_one_event -q`
Result: `9 passed` (full file). The test posts `POST /generate` twice with
`Idempotency-Key: gate-key-1`, asserts both `200` with identical bodies and
`GET /usage` shows `api.used == 1`.

### Alerts: warn_80 enqueues + fast-path dispatch, sweep is backstop
`test_warn_80_enqueues_outbox_and_dispatches_fast_path` — an 80k-token request
(ratio 0.8) inserts a `pending warn_80` row and calls `send_alert_email.delay`
after commit. `.delay()` is wrapped so Redis downtime never fails the request;
the beat sweep re-queues anything stuck.

### Retries: exponential backoff with jitter, then give up
`test_retry_policy_is_exponential_backoff_with_jitter` pins
`max_retries=3, retry_backoff=30, retry_jitter=True` → waits ~30s, 60s, 120s.
`test_failed_row_is_not_retried` proves a `failed` row returns `gave_up`
instead of sending again. Client-side, `429` carries a dynamic `Retry-After`
(seconds until the next billing period);
concurrent duplicate writes collapse on `UNIQUE(tenant_id, idempotency_key)`.

### Metering: key reuse with different payload -> 422
`test_key_reuse_different_payload_rejected` — same key, different body returns `422`.

### Quotas: boundary -> 429 with message + Retry-After
`test_boundary_429_with_message_and_retry_after` — tenant with `api_limit=2`:
two `200`s, third returns `429 {"detail":"usage quota exceeded","used":2,"limit":2}`
with `Retry-After` header. Past-due tenant returns `402` (`test_past_due_returns_402`).

### Cost: pricing vectors (pinned constants INPUT=15 / CACHED=4 / OUTPUT=60 per 1K)
`test_pricing_cached_cheaper_reasoning_is_output`:
- 1000 input -> 15c; 1000 cached -> 4c (cheaper)
- 500 output + 500 reasoning -> 60c (reasoning = output)
- 2000 in + 1000 cached + 500 out + 500 reasoning -> 94c

## Phase 3 — Stripe (test mode)

### Checkout flips Free -> Pro via webhook
`test_checkout_completed_flips_free_to_pro` — a correctly HMAC-signed
`checkout.session.completed` (tenant in metadata) flips the tenant to Pro,
stores the `subscriptions` row + `stripe_customer_id`; `GET /usage` shows
10k/1M limits. `test_replay_of_same_event_processed_once` reposts it ->
`{"deduped": true}`, still one subscription row.

### Forged webhook -> 400, nothing changes
`test_forged_signature_400_nothing_changes` — bad `Stripe-Signature` -> 400,
plan untouched. Unknown types acked (`test_unknown_event_type_acked`).

### Cancel -> Free
`test_subscription_deleted_downgrades_to_free` — `customer.subscription.deleted`
sets plan=free, status=active (downgraded, not blocked).

### Checkout route
`test_checkout_route_validation` — unknown tenant -> 404; unconfigured keys ->
503 (never 500, never touches network). Live end-to-end (test card 4242...)
is manual: `stripe listen --forward-to localhost:8000/webhooks/stripe`,
complete Checkout, watch the tenant flip.

## Phase 4 — Cost & finalization

### Migrations own the schema
`alembic/versions/ad88ab7ed361_*` creates all 8 tables + indexes.
`uv run alembic upgrade head` on a scratch DB yields byte-identical tables to
the models (`match: True` check), and API boot runs `upgrade head` before seed.
`uv run pytest tests/ -q` → 15 passed through that path.

### Background job, end to end on compose
Live stack proof: one 80k-token request (80k/100k) → `email_outbox` row
`warn_80|sent`, and Mailpit (`:8025/api/v1/messages`) holds 1 message to
`demo@example.com`, subject `Usage alert: 80% of quota reached`. Fast-path
`.delay()` after commit; beat sweep every 300s as backstop; 30/60/120s
exponential backoff + jitter, then `failed`.

### Data model, tests & docs
Tables: tenants, plans, subscriptions, usage_events (append-only),
stripe_events, idempotency_records, email_outbox, job_runs; tenant FKs
`ON DELETE RESTRICT`, partial uniques on soft-deleted rows. Required files
present: README (arch diagram, run + seed, limitations), capstone.yaml,
EVIDENCE.md, BUILDLOG.md, .env.example (placeholders only).

### Shared requirements
Layered (routers/services/SQLAlchemy) · boundary validation (4xx, never 500;
Stripe failures → 502/503) · Celery+beat job with retries + `job_runs` audit ·
Alembic migrations + indexes + tenant isolation · idempotency everywhere retries
happen · secrets in env only (`git grep` shows placeholders/test values, `.env`
git-ignored) · integer-cent money math, no AI spend.
