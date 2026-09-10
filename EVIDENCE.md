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
instead of sending again. Client-side, `429` carries `Retry-After: 60`;
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

## Phase 3 — Stripe (pending)

## Phase 4 — Cost & finalization (pending)
