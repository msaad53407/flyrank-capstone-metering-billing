# BUILDLOG — AI usage (honest)

- Scaffold + MeterService/QuotaService/PricingService/routers/tests drafted with AI assistance.
- AI gotcha caught by tests: `_limits()` hardcoded free/pro so a custom-limit tenant got
  limit=1000 instead of 2 — fixed by reading limits from the `plans` table (`plans` is
  source of truth, settings only seed it). Proof: `test_boundary_429_*` failed, then passed.
- Pricing changed from sub-cent demo rates (0.15c/1K, unrepresentable in integer cents)
  to integer-safe INPUT=15 / CACHED=4 / OUTPUT=60 per 1K with half-up rounding.
- Human decisions: tenant-level auth (no users table) for capstone scope; Celery+Redis
  email alerts as the background job instead of nightly rollup; usage_events append-only.
- Phase 3: Stripe SDK 15.x `construct_event` returns a StripeObject (no `.get()`) —
  fixed by `.to_dict()` at the handler boundary. Cancel mapping decided as
  plan=free + status=active (downgrade, not block); `past_due` keeps plan with 402.
  Local `.env` holds real test keys (git-ignored, verified via `git check-ignore`).
