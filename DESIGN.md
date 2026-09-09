# Design Doc — Usage Metering & Billing Engine (Phase 1)

## 1. Problem
SaaS needs three answers per tenant: how much used, what does it cost, over limit?
Scope: 2 plans (Free/Pro), 2 usage types (API calls + AI tokens), 1 dummy billable endpoint `POST /generate`.
Hard parts: exactly-once metering under retries, exact boundary quotas (429/402), token pricing rules (cached-input cheaper, reasoning = output), Stripe test-mode sync via verified idempotent webhooks.

## 2. Data model (Postgres, SQLAlchemy + Alembic)
Audit mixin on mutable tables: `created_at TIMESTAMPTZ DEFAULT now(), created_by TEXT, updated_at, updated_by, deleted_at, deleted_by`. `deleted_at IS NOT NULL` = soft-deleted. Partial uniques `WHERE deleted_at IS NULL`.

- `plans(id TEXT PK 'free'/'pro', name, api_limit INT, token_limit INT, +audit)` — Free: 1000 API / 100000 tokens per month. Pro: 10000 / 1000000 (10x Free). Seed data, never edited in place; `CHECK (api_limit>0, token_limit>0)`, FK `ON DELETE RESTRICT`.
- `tenants(id UUID PK, name TEXT, plan_id FK->plans RESTRICT, stripe_customer_id TEXT UNIQUE, status CHECK IN ('active','past_due','canceled'), version INT DEFAULT 1, +audit)` — billing boundary, isolation root.
- `subscriptions(id UUID PK, tenant_id FK RESTRICT, stripe_sub_id TEXT UNIQUE NOT NULL, status TEXT, current_period_start/end TIMESTAMPTZ, version INT, +audit)` — mirror of Stripe, mutated only by webhooks (`updated_by=stripe:evt_xxx`).
- `usage_events(id UUID PK, tenant_id FK RESTRICT NOT NULL, type CHECK IN ('api_call','ai_tokens'), qty INT CHECK>0, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens INT CHECK>=0, billing_period DATE NOT NULL, idempotency_key TEXT NOT NULL, cost_cents INT NOT NULL, pricing_version INT NOT NULL, created_at, created_by)` — **append-only, no updated/deleted cols, no UPDATE/DELETE in app.** `UNIQUE(tenant_id, idempotency_key)`. Indexes `(tenant_id, billing_period)`, `(tenant_id, created_at)`.
- `stripe_events(stripe_event_id TEXT PK, type TEXT, payload_hash TEXT, processed_at, created_at)` — webhook dedup, insert-first.
- `idempotency_records(tenant_id, idempotency_key PK composite, endpoint TEXT, request_hash TEXT, response_code INT, response_body JSONB, created_at)` — generic retry store; same key + different hash -> 422.

Money: integers only (`cost_cents`). `pricing_version` per event for reproducible rollups.

## 3. API surface
- `POST /generate` — headers `Idempotency-Key (required)`, `X-Tenant-ID (required for capstone)`. Body: `{type, qty, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens}`. Flow: validate -> dedup lookup -> `current + requested <= limit` ? record : reject. Success mirrors stored response on retry.
- `GET /usage?tenant_id=` -> `{tenant_id, plan, period, api:{used,limit}, tokens:{used,limit}, cost_cents, pricing_version}`.
- `POST /billing/checkout` — body `{tenant_id}` -> Stripe Checkout Session (test mode).
- `POST /webhooks/stripe` — raw body, `Stripe-Signature` verify (`whsec_`), dedup via `stripe_events`, apply `checkout.session.completed / customer.subscription.updated|deleted` -> flip `tenants.plan_id/status`. Forged -> 400, replay -> 200 no-op.
- Quota rule (documented): allow iff `current + requested <= limit`. Exceed -> `429 + Retry-After + {reason, used, limit}`. Lapsed/canceled requiring payment -> `402`. Boundary request itself succeeds; next one fails.

## 4. Layer sketch (FastAPI)
`routers/ (validation, 4xx never 500) -> services/ (MeterService.record, QuotaService.check, PricingService.calc, StripeService.sync) -> repos/ (SQLAlchemy) -> Postgres`. `config.py` pins pricing constants + plan limits. Background job (APScheduler/celery stub): nightly rollup + Stripe reconciliation (satisfies shared req >=1 job, off request path, retries + log alert). Migrations: Alembic. Money/auth secrets via `.env` only.

## 5. Pricing constants (v1, pinned in config)
`INPUT_PER_1K=0.15c, CACHED_INPUT_PER_1K=0.04c, OUTPUT_PER_1K=0.60c, REASONING=OUTPUT`. `cost = input*P_in + cached*P_cached + (output+reasoning)*P_out`. Categories never summed as raw tokens. `GET /usage` uses same function; proof vectors in `EVIDENCE.md` Phase 4.

## 6. Non-goal (+ deferred)
No invoicing, proration, overage billing. **Deferred: `users` / memberships / api_keys.** Capstone auth stays `X-Tenant-ID`; tenant = billing boundary. For harness integration later: add `users`, `tenant_memberships`, `api_keys(key_hash, prefix, scopes, revoked_at)`, plus nullable `usage_events.attributed_user_id/api_key_id`. Stripe stays tenant-level. This keeps probes 1-5 tenant-scoped and avoids rework.

Gate: this doc committed; Phase 2 gate = same `Idempotency-Key` twice -> 1 event; boundary -> 429/402.
