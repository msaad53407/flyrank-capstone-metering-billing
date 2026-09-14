<!-- prettier-ignore -->
<div align="center">

<img src="./frontend/public/favicon.svg" alt="FlyRank Metering & Billing Engine Logo" width="72" height="72" />

# FlyRank Usage Metering & Billing Engine

*Production-grade multi-tenant usage metering, quota enforcement, and Stripe billing engine for AI workloads.*

[![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.141%2B-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Celery](https://img.shields.io/badge/Celery-5.6-37814A?style=flat-square&logo=celery&logoColor=white)](https://docs.celeryq.dev)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com)
[![Tests](https://img.shields.io/badge/Tests-Passing-4c1?style=flat-square)](tests/)

⭐ If you like this project, star it on GitHub — it helps a lot!

[Overview](#overview) • [Architecture](#architecture) • [Features](#features) • [Pricing Model](#pricing-model) • [Quick Start](#quick-start) • [API Reference](#api-reference) • [Interactive Playground](#interactive-playground) • [Verification & Testing](#verification--testing)

</div>

---

> [!NOTE]
> This engine provides enterprise guarantees for AI SaaS platforms: **exactly-once metering** under network retries, **strict boundary quota enforcement** (`429 Too Many Requests` and `402 Payment Required`), **zero-drift integer-cent financial math**, and **cryptographically verified Stripe lifecycle synchronization**.

---

## Overview

Modern AI-driven SaaS applications face critical financial and operational hurdles:
- **Duplicate billing and distorted usage**: Network retries and client timeouts frequently record duplicate usage unless strictly deduplicated.
- **Quota race conditions**: Sloppy boundary checking lets tenants burst far beyond their tier limits before rejection occurs.
- **Floating-point inaccuracies**: Representing AI token costs in floating-point dollars leads to cumulative billing discrepancies.
- **Brittle webhook processing**: Unverified or replayed Stripe events cause inconsistent subscription and tenant states.

The **FlyRank Usage Metering & Billing Engine** solves these problems with a decoupled, hardened architecture. Built with **FastAPI**, **SQLAlchemy 2.0**, **PostgreSQL 16**, **Redis**, and **Celery**, it delivers idempotent metering, atomic quota checks, integer-only financial calculations, out-of-band email alerting, and an interactive developer playground served directly from the engine.

---

## Architecture

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                     FastAPI (:8000)                     │
                    │  routers/ → services/ → SQLAlchemy 2.0 → PostgreSQL 16 │
                    │    POST /generate · GET /usage · /billing · /auth       │
                    └───────────┬─────────────────────────────────┬───────────┘
                                │ usage rows                      │ alert rows
                                ▼                                 ▼
  Stripe Checkout ──────► /webhooks/stripe ──►    PostgreSQL ◄── email_outbox ──► Celery Worker ──SMTP──► Mailpit
  (Test Mode)            verify → dedupe → sync   tenants/plans/  (Redis broker)    (retries+jitter)     :1025 (:8025 UI)
                         Free ⇄ Pro               subscriptions/                          ▲
                                                  usage_events                            │ sweep every 5m
                                                  (Alembic migrations) ── Celery Beat ────┘
```

The system is organized into distinct, isolated layers:

1. **Routing & Boundary Validation (`app/routers/`)**: Strict schema parsing and HTTP error contract enforcement. Invalid inputs immediately return standard `4xx` responses (never unhandled `500`s), and upstream payment outages return `502`/`503`.
2. **Domain Service Layer (`app/services/`)**:
   - `MeterService`: Atomic check-and-record orchestration, replay verification, and idempotency store operations.
   - `QuotaService`: Calendar-aligned billing period calculations and boundary capacity evaluation (`current + requested <= limit`).
   - `PricingService`: Half-up rounded integer cent pricing with specialized tiers (prompt caching discounts and reasoning token tracking).
   - `StripeService`: Stripe Checkout session creation and customer handling.
   - `AlertService`: Transactional outbox pattern for quota notifications.
3. **Storage & Persistence Layer (`app/models.py`, `alembic/`)**:
   - PostgreSQL schema strictly controlled by Alembic migrations.
   - `usage_events` is an immutable, append-only ledger with no `UPDATE` or `DELETE` access in the application layer.
   - Audit trail on mutable tables (`created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`, `deleted_by`) with partial unique constraints on active records.
4. **Asynchronous Background Plane (`app/worker/`, Celery + Redis)**:
   - Off the HTTP request path. Fast-path task dispatch occurs after database transaction commit.
   - Celery Beat performs periodic 5-minute sweeps as a backstop for transient Redis or worker outages.
   - Exponential backoff with jitter prevents thundering herds against mail providers.

---

## Features

- 🎯 **Exactly-Once Metering**: Replay cache in `idempotency_records` matches the request body SHA-256 hash against the client's `Idempotency-Key`. Replaying identical payloads returns the cached response code and body; reusing a key with a conflicting payload yields `422 Unprocessable Entity`. Database-level `UNIQUE(tenant_id, idempotency_key)` constraints eliminate concurrency races.
- 🛑 **Exact Boundary Quotas**: Quotas are evaluated as `used + requested <= limit`. The exact boundary request succeeds, while the subsequent request is rejected with `429 Too Many Requests` and a dynamic `Retry-After` header computing seconds until the next period reset.
- 💳 **Past-Due Protection**: Accounts marked `past_due` or `canceled` return `402 Payment Required`, prompting subscription settlement without corrupting usage state.
- 💰 **Integer-Cent Money Math**: All costs are calculated and stored in integer cents (`cost_cents`). Includes dedicated rates for standard input, cached input hits, output, and reasoning tokens.
- 🔔 **Transactional Email Outbox**: Usage thresholds (`warn_80` at 80% quota and `blocked_100` at 100% quota) are recorded into `email_outbox` with unique monthly tier constraints, dispatched to Celery workers, and viewable in local Mailpit.
- 🔄 **Stripe Webhook Sync**: Verifies cryptographic HMAC signatures (`Stripe-Signature`), deduplicates against `stripe_events`, and synchronizes lifecycle events (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`).
- 🔐 **Dual Authentication Modes**: Supports both direct multi-tenant scoping via `X-Tenant-ID` headers and tenant authentication using JWT Bearer tokens with bcrypt password hashing.
- 🖥️ **Self-Contained Demo Playground**: Includes a React 19, Tailwind CSS v4, and shadcn UI developer portal served directly by FastAPI at `/demo` without requiring additional frontend containers or CORS configuration.

---

## Pricing Model

Financial calculations are pinned in `app/config.py` (v1 pricing specification) and evaluated in integer cents using half-up rounding.

| Metric | Rate (v1) | Billing Logic |
| :--- | :--- | :--- |
| **API Calls** | 1¢ flat per call | Direct count: `qty * 1` |
| **Standard Input Tokens** | 15¢ per 1,000 tokens | Base prompt ingestion |
| **Cached Input Tokens** | 4¢ per 1,000 tokens | Prompt cache hits (~73% discount) |
| **Output Tokens** | 60¢ per 1,000 tokens | Generated response text |
| **Reasoning Tokens** | 60¢ per 1,000 tokens | Internal reasoning tokens (priced equal to output) |

### Integer Rounding Formula

$$\text{cost\_cents} = \left\lfloor \frac{\text{input} \times 15 + \text{cached} \times 4 + (\text{output} + \text{reasoning}) \times 60 + 500}{1000} \right\rfloor$$

> [!TIP]
> Token types are never summed before pricing. Each category is weighted individually, ensuring cached input discounts and reasoning token premiums are preserved down to the cent.

---

## Quick Start

### Option 1: Docker Compose (Recommended)

Run the entire system—FastAPI, Celery worker, Celery beat, PostgreSQL, Redis, and Mailpit—with a single command:

```bash
docker compose up --build
```

The database migrations run automatically, and the default plans and demo tenant are seeded on boot.

#### Service Access Points

| Service | Address | Description |
| :--- | :--- | :--- |
| **API** | `http://localhost:8000` | REST API and OpenAPI docs at `/docs` |
| **Playground UI** | `http://localhost:8000/demo` | Interactive dark-mode developer console |
| **Mailpit Web UI** | `http://localhost:8025` | Local email inspector for quota alerts |
| **PostgreSQL** | `localhost:5433` | Database (`metering` / `postgres` / `postgres`) |
| **Redis** | `localhost:6379` | Celery message broker and cache |

### Option 2: Local Development (without Docker)

You can run the API locally using `uv` and an SQLite database:

```bash
# 1. Install dependencies
uv sync

# 2. Start the API with local SQLite storage
DATABASE_URL="sqlite:///./local.db" uv run uvicorn app.main:app --reload --port 8000
```

> [!IMPORTANT]
> The application automatically creates and seeds the demo tenant on startup:
> - **Tenant ID**: `00000000-0000-0000-0000-000000000001`
> - **Email**: `demo@example.com`
> - **Password**: `demo123`
> - **Initial Plan**: `Free` (1,000 API calls / 100,000 tokens per month)

---

## API Reference

### Core Endpoints

| Method | Endpoint | Key Headers / Parameters | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/generate` | `Idempotency-Key`, `X-Tenant-ID` or `Authorization: Bearer <token>` | Billable AI token / API call generation |
| `GET` | `/usage` | `?tenant_id=<UUID>` | Real-time usage rollup, quotas, and period costs |
| `POST` | `/billing/checkout` | `{"tenant_id": "<UUID>"}` | Generates a Stripe Checkout URL for upgrading to Pro |
| `POST` | `/webhooks/stripe` | `Stripe-Signature` | Idempotent Stripe webhook receiver |
| `POST` | `/auth/login` | `{"email": "...", "password": "..."}` | Authenticates tenant and returns JWT Bearer token |
| `POST` | `/auth/demo-login` | *(None)* | Instant login for the default demo tenant |
| `GET` | `/health` | *(None)* | Liveness and healthcheck probe |

---

### Usage Examples

#### 1. Record Billable AI Tokens

```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: 00000000-0000-0000-0000-000000000001" \
  -H "Idempotency-Key: request-demo-001" \
  -d '{
    "type": "ai_tokens",
    "qty": 1,
    "input_tokens": 1200,
    "cached_input_tokens": 400,
    "output_tokens": 350,
    "reasoning_tokens": 150
  }'
```

**Sample Response (`200 OK`)**:
```json
{
  "allowed": true,
  "used": 2100,
  "limit": 100000,
  "cost_cents": 50
}
```

#### 2. Query Current Usage & Quotas

```bash
curl -X GET "http://localhost:8000/usage?tenant_id=00000000-0000-0000-0000-000000000001"
```

**Sample Response (`200 OK`)**:
```json
{
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "plan": "free",
  "period": "2026-09-01",
  "api": {
    "used": 0,
    "limit": 1000
  },
  "tokens": {
    "used": 2100,
    "limit": 100000
  },
  "cost_cents": 50,
  "pricing_version": 1
}
```

#### 3. Test Idempotency & Replay Protection

Sending the exact same request with `Idempotency-Key: request-demo-001` returns the identical `200 OK` response without incrementing the usage counters.

Attempting to send a different payload with that same key:
```bash
curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: 00000000-0000-0000-0000-000000000001" \
  -H "Idempotency-Key: request-demo-001" \
  -d '{"type": "api_call", "qty": 10}'
```

**Sample Response (`422 Unprocessable Entity`)**:
```json
{
  "detail": "Idempotency-Key already used with a different payload"
}
```

---

## Stripe Integration (Test Mode)

### Configuration

Configure the following variables in your `.env` file:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
```

### Forwarding Webhooks Locally

Use the [Stripe CLI](https://docs.stripe.com/stripe-cli) to forward test events to your running engine:

```bash
stripe listen --forward-to localhost:8000/webhooks/stripe
```

### Supported Webhook Events

| Stripe Event | Engine Action | Resulting State |
| :--- | :--- | :--- |
| `checkout.session.completed` | Extracts tenant ID, stores subscription record, syncs customer ID | Upgrades plan to `pro`, sets status to `active` (10x limit) |
| `customer.subscription.updated` | Tracks subscription lifecycle and invoices | Status `past_due` triggers `402` on billables; cancellations downgrade to Free |
| `customer.subscription.deleted` | Cancels subscription record gracefully | Downgrades plan to `free`, keeps status `active` |

---

## Interactive Playground

The project includes an interactive web dashboard located at `/demo`, built with **Vite**, **React 19**, **Tailwind CSS v4**, and **shadcn UI**. It is precompiled into `frontend/dist` and served directly from the FastAPI application.

```
http://localhost:8000/demo
```

### Key Modules in the Playground

- **Overview Dashboard**: Real-time tenant KPI cards, usage gauges, active plan tier, and an automated guided tour.
- **Metering Workbench**: Request generator with a dedicated **Double-Send** button to verify idempotency handling in real time.
- **Quota Simulator**: Fill-to-quota testing utility that demonstrates the exact boundary transitions from `warn_80` outbox triggers to `429 Too Many Requests`.
- **Pricing Calculator**: Dynamic token cost estimator illustrating cached vs non-cached and reasoning rate math.
- **Stripe Billing Panel**: One-click checkout initiator for test-mode upgrades.
- **Webhook Simulator**: Test bench for sending cryptographically signed, forged, or replayed Stripe payloads.

### Building the Frontend

To modify or rebuild the frontend assets:

```bash
cd frontend
pnpm install
pnpm build     # Outputs to frontend/dist to be served by FastAPI
pnpm dev       # Launches Vite dev server at :5173 with proxy to :8000
```

---

## Verification & Testing

### Running the Test Suite

The test suite validates idempotency, boundary quota enforcement, token pricing precision, Stripe webhook verification, and tenant authentication:

```bash
uv run pytest tests/ -q
```

```
20 passed in 1.48s
```

### Database Migrations

Alembic manages the full lifecycle of the PostgreSQL schema:

```bash
# Check current revision status
uv run alembic current

# Run all pending migrations
uv run alembic upgrade head
```

---

## Repository Structure

```
.
├── alembic/                # Database migration scripts and versions
│   └── versions/           # Versioned migration files
├── app/                    # Application backend source code
│   ├── routers/            # HTTP endpoints (auth, billing, generate, usage, webhooks)
│   ├── services/           # Domain logic (alerts, metering, pricing, quotas, stripe)
│   ├── worker/             # Celery application and background tasks
│   ├── config.py           # Application settings and pinned pricing matrix
│   ├── db.py               # SQLAlchemy database session management
│   ├── main.py             # FastAPI entrypoint, lifespan events, and demo mount
│   ├── models.py           # SQLAlchemy ORM models with audit mixin
│   └── schemas.py          # Pydantic request/response schemas
├── frontend/               # React 19 + Tailwind v4 + shadcn UI playground
│   ├── src/                # UI components and workbench pages
│   └── dist/               # Production assets served by FastAPI at /demo
├── scripts/                # Database seed scripts
│   └── seed.py             # Idempotent seed for plans and demo tenant
├── tests/                  # End-to-end and integration test suite
│   ├── test_auth.py        # Registration, login, and JWT bearer tests
│   ├── test_phase2.py      # Idempotency, boundary quotas, and pricing tests
│   └── test_phase3.py      # Stripe webhook, HMAC, and checkout tests
├── docker-compose.yml      # Multi-container stack definition
└── pyproject.toml          # Project metadata and Python dependencies
```
