# MyHouse Backend — Modular Monolith (production-hardened)

One deployable, nine service modules behind an API gateway. Services communicate
only through routers and the event queue — never by importing each other's
internals — so any module lifts out to its own microservice without app changes.

```
                        ┌────────────────────────────┐
        request ──────▶ │  API Gateway (src/gateway) │  security headers · CORS whitelist ·
                        │                            │  request-id · leveled logging · rate
                        └──────────────┬─────────────┘  limit · idempotency · typed errors
        ┌───────────┬───────────┬──────┴────┬────────────┬───────────┐
        ▼           ▼           ▼           ▼            ▼           ▼
     Auth        Users       Assets     Warranties   Marketplace  Payments
     JWT+refresh homes,      inventory  parser,      jobs, bids,  escrow
     families,   family,     files(S3)  reminder     state machine ledger +
     MFA, RBAC   roles,      versioned  engine       optimistic   reconcile
                 tenancy                              locking
        │                                     │            │
        └──────────────┐   ┌──────────────────┘            │
                       ▼   ▼                               ▼
                  ┌─────────────┐  consumes  ┌──────────────────────┐
                  │ Event Queue │ ─────────▶ │ Notification Service  │→ push/email/sms
                  │ retry + DLQ │            │ prefs · quiet hours   │  (tracked delivery)
                  └─────────────┘            └──────────────────────┘
                       ▲
                  ┌────┴────┐     ┌────────┐
                  │ AI Svc  │     │ Search │  fuzzy · weighted · paginated
                  │ timeout │     └────────┘
                  │ retry   │   core/: config · errors · rbac · validate · redis(KV) · metrics
                  │ fallback│
                  └─────────┘
```

## Run

```bash
cd backend
npm install
npm run dev            # gateway on :4000
npm test               # 59 tests: unit + integration + security + tenant + payments + queue + validation
npm run test:coverage  # c8 coverage (~92% lines)
npm run lint           # eslint, zero errors
npm run format:check   # prettier
npm run typecheck      # tsc --noEmit, zero errors
npm run smoke          # boots app, walks the full happy path
```

Full stack (backend + frontend + postgres + redis + nginx + mailhog):

```bash
docker compose up      # from repo root
```

## What "production-grade" means here

| Concern | Implementation |
|---|---|
| **Auth** | access JWT (15m) + refresh-token **families** (one per device); rotation with **reuse detection** (replay → whole family revoked); logout-one / logout-all; token-generation counter invalidates JWTs on password change |
| **Passwords** | scrypt + per-user salt; strength policy; history (last 5); HIBP breach-check abstraction; reset + email-verification tokens (hashed, single-use) |
| **MFA** | real RFC-6238 TOTP (verified against the standard test vector), single-use recovery codes, trusted devices |
| **AuthZ** | policy engine `Role → Action → Resource` (`core/rbac.ts`); one `authorize()` middleware, no scattered checks |
| **Tenant isolation** | home = tenant boundary; non-members get **404 not 403** (no existence oracle); UUID ids; ownership resolved server-side — IDOR/BOLA closed (tested) |
| **API security** | nosniff, X-Frame DENY, CSP, HSTS, Referrer-Policy, Permissions-Policy; CORS whitelist; body-size limit; per-IP + per-user rate limit; login lockout; idempotency keys |
| **Validation** | every endpoint wears a zod schema (`core/validate.ts`); mime/size/filename/dimension rules; consistent `validation_error` envelope |
| **Errors** | typed hierarchy (`core/errors.ts`) → uniform `{error, message, details?, requestId}`; stack traces never leave the process |
| **Logging** | leveled structured JSON with requestId/userId/sessionId/houseId/ip/latency; **PII auto-redacted** |
| **Audit** | immutable who/what/when/where/before/after on every sensitive action |
| **Observability** | `/health` `/live` `/ready` `/metrics` (Prometheus); counters + latency histogram; queue + DLQ stats |
| **Data** | soft deletes, createdAt/updatedAt/version, optimistic locking, snapshot transactions, migrations, pagination |
| **Queue** | at-least-once with idempotent delivery, exponential backoff, dead-letter queue |
| **AI** | per-stage timeout + retry + fallback provider, confidence floor, **structured-output-only** (schema-validated), hallucination flag, token/cost metrics |
| **Payments** | escrow lifecycle, partial refunds, double-entry ledger + `/integrity` reconciliation, idempotent |

## Database strategy (right tool per job)

| Store | Holds | Today (demo) |
|---|---|---|
| **PostgreSQL** | users, homes, members, assets, warranties, jobs, bids, payments, ledger, audit | JSON-file store behind the same repository shape (`src/db/store.ts`) with migrations, soft deletes, versioning, transactions |
| **Redis** | sessions, rate-limit buckets, lockouts, idempotency, recent searches, caches, distributed locks | `MemoryKV` implementing the `KV` interface (`src/core/redis.ts`) |
| **S3** | images, receipts, manuals, videos | metadata rows + mock presigned URLs; server-generated keys (no client path control) |
| **Neo4j** (later) | home/contractor knowledge graph | joins over relational tables |

Swap = replace the engine behind the interface; services never touch persistence directly.

## Secrets & config

`src/core/config.ts` validates the environment at import and **fails fast** — a
production process with a weak `JWT_SECRET`, a wildcard CORS origin, or
`AI_PROVIDER=mock` refuses to boot. See `.env.example`; real secrets come from a
secret manager, never the repo.

## CI/CD

`ci/github-actions-ci.yml`: quality (lint · format · typecheck) + security scan
(gitleaks · npm audit) → tests with coverage → Next build + Docker build with a
live container **health check** → Playwright e2e → **auto-deploy staging** (+ smoke)
→ **production behind a manual approval** environment gate.

> **Activate CI:** the workflow lives at `ci/github-actions-ci.yml` because the
> current `gh` OAuth token lacks the `workflow` scope needed to push into
> `.github/workflows/`. To enable it:
> ```bash
> gh auth refresh -h github.com -s workflow
> git mv ci/github-actions-ci.yml .github/workflows/ci.yml
> git commit -m "ci: enable workflow" && git push
> ```

Load testing: `k6 run backend/loadtest/k6-smoke.js` (ramps to 200 VUs; p95<500ms,
error-rate<1% thresholds).

## Docs

- `docs/ARCHITECTURE.md` — module map, request lifecycle, sequence + ER diagrams
- `docs/SECURITY.md` — threat model and control catalog
- `docs/openapi.yaml` — REST contract
- `docs/adr/` — architecture decision records
- `docs/RUNBOOK.md` — incident response & disaster recovery

## API map

| Prefix | Service |
|---|---|
| `POST /api/auth/signup·login·refresh·logout·logout-all`, `GET /sessions`, `POST /mfa/*`, `POST /password/*` | Auth |
| `POST/GET /api/users/homes`, `POST/DELETE …/members`, `GET …/audit` | Users/Family |
| `POST/GET/PATCH/DELETE /api/assets/homes/:id/assets`, `POST …/files` | Assets |
| `POST/GET /api/warranties/homes/:id/warranties` | Warranties |
| `POST /api/marketplace/homes/:id/jobs`, `GET /jobs/feed`, `POST /jobs/:id/bids`, `POST /bids/:id/accept·complete` | Marketplace |
| `GET/PUT /api/notifications`, `/preferences` | Notifications |
| `POST /api/ai/extract·diagnose`, `GET /providers` | AI |
| `POST /api/payments/:id/release·refund`, `GET /ledger·integrity` | Payments |
| `GET /api/search?q=`, `/recent` | Global search |
| `GET /api/intel/homes/:id/graph·predictions·recommendations`, `GET /jobs/:id/matches·similar`, `GET /reliability/*`, `GET /analytics/*`, `GET /contractors/me/profile` | Intelligence |
| `GET /health·/live·/ready·/metrics`, `/api/flags` | Platform |

REST for MVP; GraphQL only if client query patterns demand it.

## Intelligence platform (knowledge graph & data network)

No new user-facing features — every interaction now feeds structured data that
compounds (`src/intelligence/`):

| Piece | What it does |
|---|---|
| **Knowledge graph** (`graph.ts`) | every home/room/asset/warranty/issue/contractor/manufacturer/model/part is a UUID node; relationships are **append-only edges** (`retractedAt`, never deleted). Manufacturer/Model/Part nodes are global and deduped across tenants; home subgraphs are tenant-guarded. Neo4j swaps in behind the same functions. |
| **Asset history** (`assetEvents`) | updates append, never overwrite — creation, moves (before/after), repairs, deletion all accumulate per asset (`GET …/assets/:id/history`) |
| **Repair records** (`learning.ts`) | job completion captures root cause, parts, labor, cost, rating, warranty coverage, season, ZIP; notes are **PII-scrubbed** before storage |
| **Contractor profiles** | materialized expertise: brands/models/categories worked, quote accuracy, repeat customers, reliability/quality scores, skill confidence — recomputed on every completed repair |
| **Matching engine** (`matching.ts`) | never "closest first": 9 weighted factors (model/brand/category experience, rating, quality, pricing consistency, proximity, availability, emergency fit) with an **explainable per-factor breakdown** |
| **Similarity engine** (`embeddings.ts`, `similarity.ts`) | issues embed into vectors (deterministic feature-hash today, pgvector + real embeddings later); new issues return k-anonymized aggregates: avg cost, top root causes, replacement probability, best contractor |
| **Predictive maintenance** (`predictive.ts`) | per-asset failure probability (logistic hazard on age/lifespan, blended with cohort analytics), remaining useful life, expected cost, repair/replace recommendation — each with reasons + confidence |
| **Model analytics** (`analytics.ts`) | cross-home reliability scores, failure-prone models, seasonal peaks, issues by region (3-digit ZIP prefixes only) |
| **Recommendations** (`recommend.ts`) | proactive feed: recalls first, then replace/repair, warranty-claims-before-expiry, seasonal, efficiency |
| **Domain-event log** (`domainEvents`) | immutable, **versioned-schema**, PII-minimized event log — training data for future ML (failure/cost prediction, fraud, ranking) |
| **Diagnose pipeline** (`POST /api/ai/diagnose`) | classification → severity → entity extraction → symptoms → root causes **learned from repair records** (priors as fallback) → actions → contractor ranking; structured JSON only |

**Privacy contract** (`privacy.ts`): cross-home data is published *only* as
aggregates behind a k-anonymity floor (`INTEL_MIN_COHORT`); optional Laplace
noise (`DP_EPSILON`); PII scrubbing on stored free text; domain-event retention
window (`RETENTION_DAYS`); home-scoped queries ride the same RBAC policy engine
(`intel` resource) with 404 tenant isolation.
