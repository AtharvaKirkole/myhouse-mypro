# Architecture

## Modular monolith

One process, nine service modules mounted behind an API gateway. The rule that
keeps it splittable: **services never import another service's internals**. They
communicate only via (a) HTTP routers and (b) the event queue. The single
sanctioned cross-module function call is `payments.createHold()` from the
marketplace on bid acceptance — which becomes an internal API call or a
`bid.accepted` consumer the day payments is extracted.

```
core/            cross-cutting, imported by everything
  config         env schema + fail-fast validation
  errors         typed error hierarchy
  http           context, leveled logging, security headers, rate limit, idempotency
  rbac           policy engine (Role→Action→Resource) + tenant isolation
  validate       zod schemas + validate() middleware
  redis          KV interface (sessions, locks, caches) — MemoryKV today
  metrics        Prometheus counters + latency histogram
  events         queue: retry, backoff, DLQ, idempotent delivery
  flags          feature flags
db/store         repository layer: rows, migrations, soft delete, versioning, tx
gateway/app      middleware chain + router mounts + probes
services/*       auth, users, assets, warranties, marketplace, payments,
                 notifications, ai, search
```

## Request lifecycle

```
client
  │  HTTPS (TLS terminates at nginx/ALB)
  ▼
security headers → CORS whitelist → JSON body limit → request context (id, timing)
  → rate limit (per-IP, per-user)
  → router: service tag → requireAuth (JWT) → authorize(action,resource) [tenant check]
           → validate(schema) → idempotency → handler
  → handler: db (transaction) + publish(event)
  → response  (finish hook: metrics + structured access log)
errors anywhere → typed AppError → uniform JSON envelope (no stack leak)
events → queue → consumers (notifications) with retry/backoff/DLQ
```

## Authentication sequence (refresh rotation + reuse detection)

```
login ──▶ access JWT (15m, carries sid=familyId, gen=tokenGeneration)
      └─▶ refresh token (opaque, bound to a family)

refresh(token):
   token unknown            → 401 invalid_refresh
   token revoked            → 401 session_revoked
   token already used ──────→ REVOKE ENTIRE FAMILY + emit auth.suspicious → 401 reuse_detected
   else                     → mark used, issue new access+refresh in same family

password change/reset ──▶ tokenGeneration++ ──▶ every pre-change JWT now invalid
logout-all ──▶ revoke every family for the user
```

## Data model (ER)

```
User 1───* Member *───1 Home
                        │
        ┌───────────────┼───────────────┬──────────────┐
        ▼               ▼               ▼              ▼
      Asset          Warranty          File           Job
        │ 1               (assetId?)                    │ 1
        └── position (x,y,version)                      ├──* Bid *──1 User(pro)
                                                        └──1 Payment 1──* LedgerEntry

User 1──* RefreshToken (familyId, usedAt, revokedAt)
User 1──* VerificationToken (email | password_reset)
User 1──1 Preferences
User 1──* Notification
(*)  AuditLog, Analytics — append-only
```

Every business row carries `createdAt / updatedAt / deletedAt / version`. Reads
filter `deletedAt` (soft delete); writes bump `version` (optimistic locking).

## Marketplace job state machine

```
        create                accept(bid)             complete
  ∅ ─────────────▶ open ───────────────────▶ accepted ──────────▶ completed
                     │                            │
                     └──────── cancel ────────────┴──▶ cancelled
```

Illegal transitions throw `ConflictError`. Acceptance runs inside a snapshot
transaction so the state change and the escrow hold commit atomically.

## Why it stays splittable

- Shared types live in `db/store` and `core/*`; extracting a service means giving
  it its own store + a client for the others.
- All async coordination already goes through `events` (publish/subscribe), which
  maps onto Kafka/SQS without touching publishers or consumers.
- `core/redis` and `db/store` are interfaces, so per-service datastores are a
  config change, not a rewrite.
