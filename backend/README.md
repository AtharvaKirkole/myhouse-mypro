# MyHouse Backend — Modular Monolith

One deployable, eight service modules behind an API gateway. Services communicate
only through routers and the event queue — never by importing each other's
internals — so any module lifts out to its own microservice without app changes.

```
                        ┌────────────────────────────┐
        request ──────▶ │  API Gateway (src/gateway) │  request-id · logging ·
                        │                            │  rate limit · CORS · errors
                        └──────────────┬─────────────┘
        ┌───────────┬───────────┬──────┴────┬────────────┬───────────┐
        ▼           ▼           ▼           ▼            ▼           ▼
     Auth        Users       Assets     Warranties   Marketplace  Payments
     JWT+refresh homes,      inventory  parser,      jobs, bids,  escrow
     MFA, RBAC   family,     files(S3)  reminder     accept       ledger
                 roles                  engine
        │                                     │            │
        └──────────────┐   ┌──────────────────┘            │
                       ▼   ▼                               ▼
                  ┌─────────────┐  consumes  ┌──────────────────────┐
                  │ Event Queue │ ─────────▶ │ Notification Service  │→ push/email/sms
                  └─────────────┘            └──────────────────────┘
                       ▲
                  ┌────┴────┐     ┌────────┐
                  │ AI Svc  │     │ Search │  (global, cross-entity)
                  │ pipeline│     └────────┘
                  └─────────┘
```

## Run

```bash
cd backend
npm install
npm run dev        # gateway on :4000
npm test           # 22 unit + integration tests
npm run smoke      # boots app, walks signup→home→AI→asset→job→search→notifications
npm run typecheck
```

## Database strategy (right tool per job)

| Store | Holds | Today (demo) |
|---|---|---|
| **PostgreSQL** | users, homes, members, assets, warranties, providers, jobs, bids, payments, audit | JSON-file store behind the same repository shape (`src/db/store.ts`) |
| **Redis** | sessions (refresh tokens), rate-limit buckets, event queue, caches (manuals, provider search) | in-memory maps / in-process queue |
| **S3** | images, receipts, manuals, videos | metadata rows + mock presigned URLs (`POST /api/assets/homes/:id/files`) |
| **Neo4j** (later) | home knowledge graph, contractor graph, relationship queries | joins over the relational tables |

Swap = replace the store engine; services never touch persistence directly.

## AI pipeline (own service, provider-swappable)

`Upload → compress/thumbnail → OCR → Vision → LLM → structured JSON → DB`

`src/services/ai.ts` defines an `AiProvider` interface (`ocr`, `vision`, `llm`).
`AI_PROVIDER=mock|openai|anthropic|gemini` selects the implementation — the app
never changes. The mock is deterministic so tests and demos are stable.
Image compression happens **before** OCR/vision to cut model costs.

## Security

- **JWT access tokens** (15 min) + **opaque refresh tokens** with rotation — reuse of a rotated token is rejected (tested)
- **scrypt** password hashing (salted, constant-time compare)
- **MFA** hook on login (demo TOTP; swap in otplib)
- **RBAC** as Role → Permission → Resource (`src/core/rbac.ts`): owner edits/deletes, child sees chores only, roommate views utilities, guest sees emergency info — enforced by `requireHomePermission` middleware, unit + HTTP tested
- **Rate limiting** per IP (token bucket; Redis in prod)
- **Audit log** on sensitive actions (home create/delete, member add, bid accept)
- Encryption at rest/in transit = infra concerns (TLS, encrypted volumes/KMS) — documented here, not app code

## Events & notifications

Business logic **publishes** (`warranty.expiring`, `bid.accepted`, `payment.released`…);
the notification service **consumes** and fans out to in-app + push/email/sms
channel stubs. The queue is in-process today, Redis Streams/SQS later — the
publish/subscribe API is already shaped for it.

## Observability

Every request gets `requestId`, `userId`, timestamp, and the owning `service`,
emitted as structured JSON logs (one line per request with status + latency).
Production adds: OpenTelemetry traces → Prometheus/Grafana (API + AI latency,
OCR failure rate, upload failure rate), Sentry for crashes. The log line format
is already machine-parseable for that pipeline.

## Feature flags

`src/core/flags.ts`: off → beta cohort → all (`twin_3d` is beta, `predictive_maintenance` off).
`GET /api/flags` returns the caller's resolved flags.

## Environments & CI/CD

`dev → test → staging → production`, each with its own `DATA_DIR`/database.
GitHub Actions (`.github/workflows/ci.yml`):
lint/typecheck → unit + integration tests → Next build + Docker image → Playwright
e2e → **auto-deploy staging** (+ smoke test) → **production behind a manual
approval** (GitHub environment protection rule).

Load testing: `k6 run backend/load/k6-load.js` — ramps to 10k VUs with
1000 uploads/min and 500 repair requests/min scenarios and p95<500ms thresholds.

## API map

| Prefix | Service |
|---|---|
| `POST /api/auth/signup·login·refresh·logout`, `GET /me` | Auth |
| `POST/GET /api/users/homes`, `POST …/members`, `GET …/audit` | Users/Family |
| `POST/GET/PATCH/DELETE /api/assets/homes/:id/assets`, `POST …/files` | Assets |
| `POST/GET /api/warranties/homes/:id/warranties` | Warranties |
| `POST /api/marketplace/homes/:id/jobs`, `GET /jobs/feed`, `POST /jobs/:id/bids`, `POST /bids/:id/accept` | Marketplace |
| `GET /api/notifications`, `POST /read-all` | Notifications |
| `POST /api/ai/extract`, `GET /providers` | AI |
| `POST /api/payments/:id/release·refund`, `GET /ledger` | Payments |
| `GET /api/search?q=` | Global search |
| `GET /api/flags`, `GET /api/analytics/summary`, `GET /health` | Platform |

REST for MVP; GraphQL only if client query patterns demand it.

## MVP scope (deliberately small)

Shipped here: **1)** accounts/homes/family/permissions, **2)** asset + warranty
management with AI extraction + reminders, **3)** asset positions for the 2D map,
**4)** marketplace (jobs → bids → accept → escrow), **5)** provider feed + payouts.
Deferred: AI diagnostics, IoT, 3D twins server-side, predictive maintenance
(feature-flagged off), HOA integrations, offline sync (client-side concern —
the frontend already keeps homes/assets/schedules in local storage and can
reconcile via `PATCH` endpoints).
