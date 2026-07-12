# MyHouse + MyPro — System Design Specification

**The Operating System for Home Ownership.** This is not a marketplace. The
reverse marketplace is one workflow among many. The platform models the entire
lifecycle of a home digitally: every asset, document, warranty, repair, and
service interaction becomes structured data in a knowledge graph that makes the
system smarter with every event.

> **Reading guide** — ✅ = implemented in this repository today ·
> 🔭 = target-state design the current architecture deliberately leaves room for.
> All diagrams are Mermaid and render directly on GitHub.

---

## 1. Executive Overview

| Dimension | Position |
|---|---|
| Product | Two tightly-coupled surfaces — **MyHouse** (homeowner OS) and **MyPro** (service-business OS) — over **one shared record** |
| Core asset | The **Home Knowledge Graph**: an append-only, per-address record of assets, repairs, warranties, and outcomes that compounds in value |
| Architecture | **Modular monolith** behind an API gateway — nine service modules + an intelligence layer, splittable into microservices without app changes ✅ |
| Data flywheel | issue → structured job → bid → repair → **repair record** → contractor profile + model reliability + predictions + matching → better next issue ✅ |
| Privacy stance | tenant isolation by design (404-not-403), k-anonymized cross-home aggregates, PII scrubbing, differential-privacy hooks ✅ |
| Scale path | one house → millions: stateless gateway replicas, per-module extraction, Postgres/Redis/S3/Neo4j/pgvector behind existing abstractions 🔭 |

```mermaid
flowchart LR
    subgraph Flywheel["The data flywheel — every repair makes the platform smarter"]
        A[Issue submitted] --> B[Structured job]
        B --> C[Contractor bids]
        C --> D[Repair completed]
        D --> E[Repair record]
        E --> F[Contractor expertise profile]
        E --> G[Model reliability analytics]
        E --> H[Issue embeddings]
        F --> I[Better matching]
        G --> J[Better predictions]
        H --> K[Better diagnosis]
        I --> A
        J --> A
        K --> A
    end
```

---

## 2. C4 Level 1 — System Context

```mermaid
flowchart TB
    HO(("Homeowner"))
    PRO(("Service Pro"))
    PM(("Property Manager 🔭"))
    ADMIN(("Platform Admin"))

    subgraph PLATFORM["MyHouse + MyPro Platform"]
        SYS["Home Ownership OS<br/>digital twin · marketplace · intelligence"]
    end

    OCRAI["AI Providers<br/>OpenAI / Anthropic / Gemini"]
    PAY["Payment Rails<br/>Stripe / PayPal 🔭"]
    COMMS["Comms Providers<br/>push / email / SMS"]
    RECALLS["Recall Feeds<br/>CPSC / NHTSA 🔭"]
    IOT["Smart Home / IoT 🔭"]
    INS["Insurers / Manufacturers 🔭"]

    HO -->|manages home, requests service| SYS
    PRO -->|receives jobs, bids, gets paid| SYS
    PM -->|manages portfolios| SYS
    ADMIN -->|operates| SYS
    SYS -->|extraction and diagnosis| OCRAI
    SYS -->|escrow, payouts| PAY
    SYS -->|notifications| COMMS
    SYS -->|recall matching| RECALLS
    IOT -->|telemetry| SYS
    SYS -->|anonymized risk and reliability data| INS
```

---

## 3. C4 Level 2 — Containers

```mermaid
flowchart TB
    subgraph CLIENTS["Clients"]
        WEB["Next.js Web App ✅<br/>React 19 · Tailwind"]
        MOB["Mobile Apps 🔭<br/>React Native, offline-first"]
    end

    CDN["CDN / Edge 🔭"]
    LB["Load Balancer + Reverse Proxy<br/>nginx ✅ compose"]

    subgraph BE["Backend — Modular Monolith ✅ (Node 22 · Express · TS strict)"]
        GW["API Gateway<br/>headers · CORS · rate limit ·<br/>request-id · idempotency · errors"]
        MODS["9 Service Modules + Intelligence"]
        BUS["Event Bus<br/>retry · backoff · DLQ ✅"]
        WORKERS["Background Workers 🔭<br/>OCR · AI · notifications · schedulers"]
    end

    subgraph DATA["Storage Layer"]
        PG[("PostgreSQL 🔭<br/>JSON store today ✅")]
        RD[("Redis 🔭<br/>in-memory KV today ✅")]
        S3[("Object Storage 🔭<br/>metadata + mock URLs today ✅")]
        VEC[("Vector DB 🔭<br/>in-store vectors today ✅")]
        NEO[("Neo4j 🔭<br/>graph tables today ✅")]
    end

    OBS["Observability<br/>metrics ✅ · Prometheus/Grafana/OTel 🔭"]

    WEB --> CDN --> LB --> GW
    MOB -.-> LB
    GW --> MODS
    MODS <--> BUS
    BUS --> WORKERS
    MODS --> PG
    MODS --> RD
    MODS --> S3
    MODS --> VEC
    MODS --> NEO
    BE --> OBS
```

---

## 4. C4 Level 3 — Backend Components (Modular Monolith) ✅

**Boundary rules (enforced today):** modules expose routers + typed functions
only; no module touches another module's tables directly; cross-module
side-effects travel over the event bus; every module lifts out to a
microservice without app-code changes.

```mermaid
flowchart TB
    GW["API Gateway — src/gateway/app.ts"]

    subgraph CORE["core/ — cross-cutting, dependency-free"]
        CFG["config<br/>fail-fast env schema"]
        ERR["errors<br/>typed hierarchy"]
        RBACC["rbac<br/>policy engine + tenancy"]
        VAL["validate<br/>zod schemas"]
        KV["redis KV<br/>cache · locks · rate limits"]
        MET["metrics<br/>Prometheus text"]
        EVT["events<br/>queue · retries · DLQ"]
    end

    subgraph SVC["services/ — one module per domain"]
        AUTH["auth<br/>JWT + refresh families · MFA ·<br/>sessions · lockout · audit"]
        USERS["users<br/>homes · family roles ·<br/>scoped memberships"]
        ASSETS["assets<br/>inventory · files ·<br/>append-only history"]
        WARR["warranties<br/>parser · reminder engine"]
        MKT["marketplace<br/>jobs · bids · state machine ·<br/>optimistic locking"]
        NOTIF["notifications<br/>channels · prefs · quiet hours"]
        AI["ai<br/>extract + diagnose pipelines ·<br/>provider fallback chain"]
        PAYS["payments<br/>escrow · ledger · refunds ·<br/>reconciliation"]
        SEARCH["search<br/>fuzzy · weighted · paginated"]
    end

    subgraph INTEL["intelligence/ — the data network"]
        GRAPH["graph<br/>nodes + append-only edges"]
        LEARN["learning<br/>event consumers ·<br/>repair records · profiles"]
        EMB["embeddings<br/>vectors + similarity"]
        PRED["predictive<br/>hazard curves · RUL"]
        MATCH["matching<br/>9-factor explainable scoring"]
        ANA["analytics<br/>k-anonymized aggregates"]
        REC["recommend<br/>recalls · claims · seasonal"]
        PRIV["privacy<br/>k-anonymity · DP noise ·<br/>PII scrub · retention"]
    end

    GW --> AUTH & USERS & ASSETS & WARR & MKT & NOTIF & AI & PAYS & SEARCH
    GW --> INTEL
    SVC -- publish --> EVT
    EVT -- consume --> LEARN
    EVT -- consume --> NOTIF
    LEARN --> GRAPH & EMB
    MATCH --> LEARN
    ANA --> PRIV
    SVC --> CORE
    INTEL --> CORE
```

---

## 5. C4 Level 4 — Code (two representative slices) ✅

### Marketplace job acceptance (transactional escrow)

```mermaid
sequenceDiagram
    participant C as Client
    participant GW as Gateway middleware
    participant M as marketplace.ts
    participant P as payments.ts
    participant DB as store (withTx)
    participant E as event bus

    C->>GW: POST /api/bids/:id/accept (Idempotency-Key)
    GW->>GW: auth → rate limit → idempotency → zod
    GW->>M: accept(bid)
    M->>DB: withTx: transition(job, accepted, version)
    M->>P: createHold(job, payer, payee, cents)
    P->>DB: payment(held) + ledger entry
    DB-->>M: commit or rollback together
    M->>E: publish bid.accepted
    E-->>C: async: notification + intelligence consumers
    M-->>C: 200 job + payment
```

### Learning consumer (continuous improvement)

```mermaid
sequenceDiagram
    participant MK as marketplace
    participant BUS as event bus
    participant L as intelligence/learning
    participant G as graph
    participant V as embeddings
    participant CP as contractor profile

    MK->>BUS: job.completed {rootCause, parts, cost, rating, zip}
    BUS->>L: deliver (at-least-once, idempotent)
    L->>L: buildRepairRecord (PII-scrubbed notes)
    L->>G: projectRepair — Issue-REPAIRED_BY-Contractor, USED_PART edges
    L->>V: upsert issue vector
    L->>CP: recomputeContractorProfile
    Note over L: retry w/ exponential backoff → DLQ on poison
```

---

## 6. Frontend Architecture

```mermaid
flowchart TB
    subgraph PRES["Presentation Layer — Next.js App Router ✅"]
        PAGES["Pages: / · /myhouse · /myhouse/twin · /assets ·<br/>/marketplace · /request · /mypro · /auth/*"]
    end
    subgraph FEAT["Feature Modules"]
        F1["Dashboard ✅"]
        F2["Digital Twin ✅<br/>2D · iso-3D · infra · maintenance"]
        F3["Reverse Marketplace ✅"]
        F4["Marketplace ✅"]
        F5["Asset Manager + AI intake ✅"]
        F6["Warranty Vault ✅"]
        F7["Family Mgmt ✅"]
        F8["Emergency Mode ✅"]
        F9["MyPro Dashboard ✅"]
        F10["Notifications ✅"]
        F11["Calendar · Documents · Payments UI 🔭"]
    end
    COMP["Shared Components<br/>Nav · StatusPill · EnergyChart · shared.tsx ✅"]
    HOOKS["Hooks + Context 🔭<br/>useSession · useHome · useTwin"]
    RQ["React Query 🔭<br/>dedupe · optimistic updates · Suspense"]
    API["API Client 🔭<br/>typed fetch · auth header · retry"]
    AUTHF["Auth<br/>localStorage session ✅ → JWT client 🔭"]
    BEE["Backend :4000"]

    PAGES --> FEAT --> COMP
    FEAT --> HOOKS --> RQ --> API --> AUTHF --> BEE
```

**Migration note 🔭:** today feature modules read from `lib/*` mock stores; the
cutover replaces `lib/` internals with the API client while page components
stay untouched — that seam is why the mocks live in `lib/`, not in components.

---

## 7. Data Architecture — ER Diagrams ✅

Engine mapping: **PostgreSQL** = relational rows below · **Redis** = sessions,
rate limits, idempotency, caches · **S3** = file bytes (rows keep metadata) ·
**pgvector/Vector DB** = `ISSUE_VECTOR.vector` · **Neo4j** = `GRAPH_NODE`/`GRAPH_EDGE`.

### 7.1 Identity, tenancy, and access

```mermaid
erDiagram
    USER ||--o{ MEMBER : "belongs via"
    HOME ||--o{ MEMBER : "grants roles"
    USER ||--o{ REFRESH_TOKEN : "device sessions"
    USER ||--o{ VERIFICATION_TOKEN : "email / reset"
    USER ||--o{ AUDIT_LOG : "actions recorded"
    USER {
        uuid id PK
        string email UK
        string passwordHash "scrypt + salt"
        string accountType "consumer | pro"
        bool mfaEnabled
        json proProfile "business, professions, license"
        int tokenGeneration "bumped on password change"
    }
    MEMBER {
        uuid id PK
        uuid homeId FK
        uuid userId FK
        string role "owner..guest, contractor"
        date expiresAt "temporary scoped access"
    }
    HOME {
        uuid id PK
        string address
        uuid createdBy FK
        date deletedAt "soft delete"
        int version "optimistic locking"
    }
    REFRESH_TOKEN {
        string id PK "opaque"
        uuid familyId "one per device"
        date usedAt "reuse = theft signal"
        date revokedAt
    }
```

### 7.2 Home, assets, and documents

```mermaid
erDiagram
    HOME ||--o{ ASSET : contains
    HOME ||--o{ WARRANTY : holds
    HOME ||--o{ FILE : stores
    ASSET ||--o{ ASSET_EVENT : "append-only history"
    ASSET ||--o{ WARRANTY : "covered by"
    ASSET {
        uuid id PK
        uuid homeId FK
        string brand
        string model
        string serial
        string room "location in house"
        int x "twin position"
        int y "twin position"
        int version
    }
    ASSET_EVENT {
        uuid id PK
        uuid assetId FK
        string kind "created|moved|repaired|deleted"
        json before
        json after
        uuid actorId
    }
    WARRANTY {
        uuid id PK
        date expiresAt
        string source "receipt|amazon|manual"
        json remindersSent
    }
    FILE {
        uuid id PK
        string kind "receipt|manual|photo"
        string url "s3 key"
        string sha256 "dedupe"
        string mime "whitelisted"
    }
```

### 7.3 Marketplace and payments

```mermaid
erDiagram
    HOME ||--o{ JOB : raises
    JOB ||--o{ BID : receives
    JOB ||--|| PAYMENT : "escrow on accept"
    PAYMENT ||--o{ LEDGER_ENTRY : "double-entry"
    JOB ||--o| REPAIR_RECORD : "learning on complete"
    USER ||--o{ BID : "pro places"
    JOB {
        uuid id PK
        string status "open|accepted|completed|cancelled"
        string category "classifier output"
        string urgency
        uuid acceptedBidId
        int version "optimistic locking"
    }
    BID {
        uuid id PK
        int price
        string warranty "workmanship"
    }
    PAYMENT {
        uuid id PK
        int amountCents
        int refundedCents
        string status "held|released|refunded|partial"
    }
    LEDGER_ENTRY {
        uuid id PK
        string type "hold|release|refund"
        string requestId "traceability"
    }
```

### 7.4 Intelligence layer

```mermaid
erDiagram
    GRAPH_NODE ||--o{ GRAPH_EDGE : "from / to"
    JOB ||--o| ISSUE_VECTOR : embedded
    USER ||--o| CONTRACTOR_PROFILE : materialized
    REPAIR_RECORD }o--|| CONTRACTOR_PROFILE : recomputes
    GRAPH_NODE {
        uuid id PK
        string type "House|Room|Asset|Manufacturer|ModelNode|Part|Issue|Contractor|Warranty"
        string key "natural dedupe key"
        uuid homeId "null = global entity"
    }
    GRAPH_EDGE {
        uuid id PK
        string rel "HAS_ASSET|INSTANCE_OF|MADE_BY|REPAIRED_BY|USED_PART"
        date retractedAt "append-only: retired, never deleted"
    }
    REPAIR_RECORD {
        uuid id PK
        string issueCategory
        string rootCause
        json partsReplaced
        int costCents
        int bidCents "quote accuracy"
        string season
        string zip "3-digit prefix in aggregates"
        string notes "PII-scrubbed"
    }
    ISSUE_VECTOR {
        uuid id PK
        json vector "L2-normalized"
        string category
    }
    CONTRACTOR_PROFILE {
        uuid userId PK
        json brands "counts"
        json models "counts"
        float quoteAccuracy
        int reliabilityScore
        float skillConfidence
    }
    DOMAIN_EVENT {
        uuid id PK
        string name
        int schemaVersion "versioned schemas"
        json payload "PII-minimized"
    }
```

---

## 8. Reverse Marketplace — End-to-End Flow ✅

```mermaid
flowchart TD
    A[Homeowner describes issue<br/>text · photos 🔭 · voice 🔭] --> B["AI diagnose pipeline<br/>POST /api/ai/diagnose"]
    B --> C[Issue classification<br/>hit-count scoring]
    C --> D[Severity detection]
    D --> E[Entity extraction<br/>brand · model · affected asset]
    E --> F[Root-cause prediction<br/>learned from repair records]
    F --> G[Structured job created<br/>POST /api/marketplace/homes/:id/jobs]
    G --> H[Matching engine ranks pros<br/>9 weighted factors, explainable]
    H --> I[Job distributed to feed<br/>profession-filtered]
    I --> J[Pros submit bids<br/>price · ETA · warranty]
    J --> K[Homeowner compares<br/>side-by-side + similarity stats]
    K --> L[Bid accepted<br/>optimistic lock + state machine]
    L --> M[Escrow hold<br/>transactional with acceptance]
    M --> N[Scheduling 🔭 · repair executed]
    N --> O[Completion + structured capture<br/>root cause · parts · labor · rating]
    O --> P[Escrow released on verification]
    O --> Q[Repair record + PII scrub]
    Q --> R[Knowledge graph update]
    Q --> S[Contractor profile recompute]
    Q --> T[Model reliability analytics]
    Q --> U[Issue embeddings index]
    R & S & T & U --> V[Better matching, predictions,<br/>and diagnosis for the next issue]
```

---

## 9. Service Category Taxonomy

Categories are **data, not code**: the classifier vocabulary, pro professions,
and matching factors are configuration rows, so adding "Holiday Lighting
Installation" is a taxonomy insert — no new module. The same job → bid → escrow
→ repair-record loop serves all of them.

| Cluster | Examples (60+ supported by the same pipeline) |
|---|---|
| Core trades | plumbing, electrical, HVAC, roofing, painting |
| Cleaning | deep/window/carpet/kitchen/bathroom, pressure washing, move-in/out |
| Flow & vents | drain, sewer, water line, dryer vent, chimney, gutters |
| Outdoor | lawn, landscaping, tree trimming, snow/leaf removal, pool, solar wash |
| Removal | junk, bulk waste, appliance/furniture removal, recycling pickup |
| Install & inspect | smart home, security, EV charger, internet, home/termite inspection |
| Recurring ops 🔭 | trash collection, pet waste, housekeeping, generator maintenance |
| Professional | inspector, interior designer, architect, property manager |

Recurring services reuse the marketplace with a `recurrence` field on JOB 🔭 —
the event bus already re-emits scheduled jobs the same way one-off jobs flow.

---

## 10. AI Pipeline ✅ (providers swappable per stage)

```mermaid
flowchart TD
    subgraph INPUTS["Inputs"]
        I1[Text ✅]
        I2[Receipts · manuals ✅ simulated OCR]
        I3[Photos 🔭 vision]
        I4[Voice 🔭 STT]
        I5[IoT telemetry 🔭]
    end
    subgraph PIPE["AI Service — per-stage timeout · retry · fallback provider ✅"]
        OCR[OCR stage] --> VIS[Vision stage] --> LLM[LLM stage]
        LLM --> SCHEMA{zod schema valid?}
        SCHEMA -- no --> ERRX[ai_malformed_output<br/>never guessed at]
        SCHEMA -- yes --> HALL{hallucination check<br/>LLM vs OCR/vision evidence}
        HALL -- conflict --> CAP[confidence capped + flagged]
        HALL -- consistent --> CONF{confidence >= floor?}
        CONF -- no --> HUMAN[422 partial —<br/>user confirms, never silent junk]
        CONF -- yes --> OUT[Structured JSON only]
    end
    subgraph SINKS["Consumers"]
        KG[Knowledge graph]
        EMBS[Embeddings]
        RECS[Recommendations]
        SRCH[Search index]
        MKTP[Marketplace jobs]
        PREDM[Predictive maintenance]
    end
    INPUTS --> PIPE
    OUT --> KG & EMBS & RECS & SRCH & MKTP & PREDM
    PIPE -. tokens · cost · retries · fallbacks .-> METRICS[/metrics ✅/]
```

---

## 11. Knowledge Graph ✅

```mermaid
flowchart TD
    HOUSE((House))
    ROOM((Room))
    ASSET((Asset))
    MODEL((Model — global))
    MFR((Manufacturer — global))
    PART((Part — global))
    WTY((Warranty))
    ISSUE((Issue))
    CONTR((Contractor — global))
    DOC((Document 🔭))

    HOUSE -->|HAS_ROOM| ROOM
    HOUSE -->|HAS_ASSET| ASSET
    ASSET -->|LOCATED_IN| ROOM
    ASSET -->|INSTANCE_OF| MODEL
    MODEL -->|MADE_BY| MFR
    HOUSE -->|HAS_WARRANTY| WTY
    ASSET -->|COVERED_BY| WTY
    HOUSE -->|RAISED_ISSUE| ISSUE
    ISSUE -->|AFFECTS| ASSET
    ISSUE -->|REPAIRED_BY| CONTR
    ISSUE -->|USED_PART| PART
    ASSET -.->|HAS_DOCUMENT| DOC
```

Properties that make this ML-grade: every node has a **globally unique id**;
edges are **append-only** (`retractedAt` retires, never deletes → full
relationship history); Manufacturer/Model/Part/Contractor nodes are **global
and deduped** across tenants, so cross-home learning happens at the model
level while home subgraphs stay tenant-guarded.

---

## 12. Recommendation Engine ✅

```mermaid
flowchart LR
    subgraph IN["Inputs"]
        A[Asset ages + lifespans]
        B[Cohort model analytics]
        C[Own repair history]
        D[Warranty expirations]
        E[Recall feeds]
        F[Seasonality]
        G[Issue embeddings]
    end
    RANK["Ranking engine<br/>priority: recall → replace →<br/>warranty claim → repair →<br/>seasonal → efficiency"]
    subgraph OUT["Proactive feed"]
        O1[Recalls — free remedy]
        O2[Replace-vs-repair decisions]
        O3[Claims before expiry]
        O4[Preventative inspections]
        O5[Seasonal maintenance]
        O6[Efficiency upgrades + credits]
    end
    IN --> RANK --> OUT
```

---

## 13. API Layer ✅

| Route prefix | Module | Highlights |
|---|---|---|
| `/api/auth` | Auth | signup/login/refresh/logout(-all), sessions, MFA, password flows |
| `/api/users` | Users | homes CRUD, family members, scoped/expiring roles, audit |
| `/api/assets` | Assets | inventory, files (presigned mock), position, **/history** |
| `/api/warranties` | Warranties | create/parse, reminder scan |
| `/api/marketplace` | Marketplace | jobs, feed, bids, accept (escrow), complete (capture) |
| `/api/payments` | Payments | release, refund (partial), ledger, integrity |
| `/api/notifications` | Notifications | list, read, preferences, quiet hours |
| `/api/ai` | AI | extract, **diagnose**, providers |
| `/api/search` | Search | global fuzzy weighted search, recents |
| `/api/intel` | Intelligence | graph, predictions, recommendations, matches, similar, reliability, analytics |
| `/health /live /ready /metrics /api/flags` | Platform | probes, Prometheus, feature flags |

### Gateway request lifecycle

```mermaid
sequenceDiagram
    participant C as Client
    participant G as Gateway
    participant R as Module router
    participant DB as Store

    C->>G: HTTPS request
    G->>G: security headers → CORS whitelist → body limit
    G->>G: request-id + structured log context
    G->>G: rate limit (per-IP, per-user)
    G->>R: route
    R->>R: requireAuth (JWT + generation check)
    R->>R: authorize(action, resource, home) — 404 tenant wall
    R->>R: zod validate (body/query/params)
    R->>R: idempotency replay check
    R->>DB: repository call (soft-delete aware, versioned)
    R-->>C: typed response
    Note over G: errors → typed envelope, requestId, never a stack trace
```

---

## 14. Event-Driven Architecture ✅

```mermaid
flowchart LR
    subgraph PRODUCERS
        P1[auth] --> E
        P2[assets] --> E
        P3[warranties] --> E
        P4[marketplace] --> E
        P5[payments] --> E
    end
    E["Event Bus ✅<br/>at-least-once · idempotent handlers ·<br/>exponential backoff · DLQ<br/>(BullMQ / Kafka / SQS behind same API 🔭)"]
    subgraph CONSUMERS
        C1["Notifications<br/>channels · quiet hours"]
        C2["Intelligence: domain-event log<br/>immutable · versioned · PII-minimized"]
        C3["Intelligence: learning<br/>records · graph · vectors · profiles"]
        C4["Search indexing 🔭"]
        C5["Analytics counters"]
    end
    E --> C1 & C2 & C3 & C4 & C5
```

**Event catalog:** `user.signed_up` · `asset.created` · `warranty.expiring` ·
`job.created` (v2) · `bid.placed` · `bid.accepted` · `job.completed` (v2) ·
`payment.released` · `auth.suspicious` — every payload lands in the immutable
`domainEvents` log with a **schema version**, so future ML training data
survives payload evolution.

---

## 15. Infrastructure & Deployment

```mermaid
flowchart TB
    U((Users)) --> CDN["CDN / edge cache 🔭"]
    CDN --> LB["Load balancer / nginx ✅ compose"]
    LB --> FE["Next.js (SSR) ✅"]
    LB --> GWY["API gateway replicas<br/>stateless — scale horizontally"]
    subgraph K8S["Kubernetes 🔭 (docker-compose today ✅)"]
        GWY
        W1["notification workers"]
        W2["OCR / AI workers"]
        W3["schedulers: reminders · retention"]
    end
    GWY --> PGx[("PostgreSQL<br/>primary + replicas")]
    GWY --> RDx[("Redis<br/>sessions · queues · cache")]
    GWY --> S3x[("Object storage<br/>signed URLs")]
    GWY --> VDB[("Vector DB / pgvector")]
    Q["Message queue"] --> W1 & W2
    GWY --> Q
    subgraph OPS["Operations"]
        CI["GitHub Actions ✅<br/>lint → types → tests → build →<br/>docker → staging → gated prod"]
        SEC2["Secrets manager 🔭<br/>.env schema + fail-fast ✅"]
        MON["Prometheus + Grafana + OTel + Sentry 🔭<br/>/metrics endpoint ✅"]
    end
```

Environments: `development → test → staging → production`, each with isolated
data stores ✅ (per-env `DATA_DIR` today, per-env databases 🔭).

---

## 16. Security Architecture ✅

```mermaid
flowchart TD
    REQ[Request] --> L1["Edge: TLS · HSTS · CORS whitelist"]
    L1 --> L2["Gateway: security headers · body limits ·<br/>per-IP + per-user rate limits · brute-force lockout"]
    L2 --> L3["Identity: access JWT 15m · refresh families ·<br/>reuse detection revokes family · MFA · device sessions"]
    L3 --> L4["Policy engine: role → permission → resource → action ·<br/>single authorize() gate · admin bypass audited"]
    L4 --> L5["Tenant wall: membership resolved server-side ·<br/>outsiders get 404 — no existence oracle · UUIDs everywhere"]
    L5 --> L6["Input: zod on every endpoint · safe filenames ·<br/>mime whitelist · size caps · idempotency keys"]
    L6 --> L7["Data: scrypt+salt · soft deletes · audit log with before/after ·<br/>PII-scrubbed learning data · k-anonymized aggregates ·<br/>DP noise hook · retention windows"]
    L7 --> APP[Application logic]
```

Extended to intelligence ✅: `intel` is a first-class RBAC resource (children
and guests are denied), cross-home statistics pass a k-anonymity floor
(`INTEL_MIN_COHORT`), regional analytics use 3-digit ZIP prefixes only, and
free text is scrubbed before entering any learning table.

---

## 17. Analytics Layer

| Audience | Dashboard content | Source |
|---|---|---|
| Homeowner | home health score, predictions, spend history, energy | `/api/intel/homes/:id/*` ✅ |
| Contractor | first-time-fix, quote accuracy, repeat rate, expertise profile | `/api/intel/contractors/me/profile` ✅ |
| Admin | event counts, active homes, DLQ depth, queue stats | `/api/analytics/summary` + `/ready` ✅ |
| Marketplace ops | bid depth, acceptance rate, time-to-fill 🔭 | domain-event log |
| AI ops | tokens, cost, fallbacks, hallucination flags, stage latency | `/metrics` ✅ |
| Data network | graph growth, cohort coverage, model reliability movement | analytics module ✅ |

---

## 18. User Journeys (sequence diagrams)

### New homeowner onboarding → first intelligence

```mermaid
sequenceDiagram
    actor H as Homeowner
    participant FE as Frontend
    participant API as Backend
    participant BUS as Events
    participant INT as Intelligence

    H->>FE: sign up (email/social)
    FE->>API: POST /auth/signup
    API-->>FE: access + refresh (device session)
    H->>FE: add home (address, type)
    FE->>API: POST /users/homes
    H->>FE: upload receipt photo of dishwasher
    FE->>API: POST /ai/extract
    API-->>FE: structured asset (brand/model/serial/warranty) conf 0.94
    FE->>API: POST /assets/homes/:id/assets
    API->>BUS: asset.created
    BUS->>INT: project graph + creation history
    Note over INT: House—HAS_ASSET→Asset—INSTANCE_OF→Model—MADE_BY→Manufacturer
    H->>FE: open dashboard
    FE->>API: GET /intel/homes/:id/predictions + recommendations
    API-->>H: failure risks, recall matches, maintenance plan
```

### Issue → repair → payment → learning loop

```mermaid
sequenceDiagram
    actor H as Homeowner
    actor P as Pro
    participant API as Backend
    participant PAY as Payments
    participant INT as Intelligence

    H->>API: POST /ai/diagnose "dishwasher not draining e24"
    API-->>H: category, root causes (learned), ranked pros
    H->>API: POST /marketplace/homes/:id/jobs
    P->>API: GET /marketplace/jobs/feed → POST bid
    H->>API: GET /intel/jobs/:id/similar (cohort stats)
    H->>API: POST /bids/:id/accept
    API->>PAY: escrow hold (same transaction)
    P->>P: performs repair
    H->>API: POST /jobs/:id/complete {rootCause, parts, rating}
    API->>PAY: release on verification
    API->>INT: job.completed → record, graph, profile, vectors
    H->>API: review 🔭 (rating captured at completion today)
    Note over INT: next identical issue anywhere gets better answers
```

---

## 19. Repository / Module Layout ✅

```text
UrbanClap/
├─ app/                      # Next.js App Router (frontend)
│  ├─ myhouse/ (+ twin/)     # dashboard + digital twin
│  ├─ assets/ marketplace/ request/ mypro/ auth/*
├─ components/  lib/         # shared UI · data/mock stores (API seam)
├─ backend/
│  ├─ src/gateway/           # API gateway (middleware chain, mounts)
│  ├─ src/core/              # config·errors·rbac·validate·redis·metrics·events·flags
│  ├─ src/services/          # auth·users·assets·warranties·marketplace·
│  │                         # notifications·ai·payments·search
│  ├─ src/intelligence/      # graph·learning·embeddings·predictive·
│  │                         # matching·analytics·recommend·similarity·privacy·router
│  ├─ src/db/store.ts        # typed store + migrations (PG repos later)
│  ├─ tests/ (72)            # unit·integration·security·tenant·intel
│  ├─ docs/                  # ARCHITECTURE·SECURITY·RUNBOOK·openapi·ADRs
│  └─ Dockerfile  scripts/smoke.ts
├─ docs/SYSTEM-DESIGN.md     # ← this document
├─ ci/github-actions-ci.yml  # move to .github/workflows (needs workflow scope)
├─ docker-compose.yml  e2e/  load/
```

---

## 20. Microservice Split Roadmap 🔭

Strangler-fig order, chosen by scaling pressure and blast radius:

```mermaid
flowchart LR
    M["Modular monolith ✅"] --> S1["1. AI Service<br/>bursty, GPU-adjacent,<br/>already isolated behind provider API"]
    S1 --> S2["2. Notifications<br/>pure event consumer —<br/>zero synchronous callers"]
    S2 --> S3["3. Search + Embeddings<br/>own index store, read-heavy"]
    S3 --> S4["4. Payments<br/>PCI boundary, audit isolation"]
    S4 --> S5["5. Intelligence analytics<br/>batch/OLAP workload profile"]
    S5 --> CORE2["Core stays: auth · users · homes ·<br/>assets · marketplace (transactional heart)"]
```

Why it's cheap later: modules already communicate only via routers + events,
never shared tables; the event bus API matches BullMQ/Kafka semantics
(at-least-once, idempotent consumers, DLQ); repositories hide the store.

---

## 21. Future Expansion (no redesign required)

| Expansion | Mechanism already in place |
|---|---|
| HOAs / apartment complexes | `MEMBER.role` is open-ended; a Community entity is a HOME-like tenant with bulk membership ✅ pattern |
| Rental portfolios / property managers | `property_manager` role exists in RBAC today ✅ |
| Insurance companies | consume k-anonymized reliability + risk aggregates via the analytics API ✅ shape |
| Manufacturers | warranty-fulfillment jobs enter the same marketplace pipeline; recall feed adapter slots into `recommend.ts` ✅ shape |
| IoT / smart home | telemetry lands as `ASSET_EVENT(kind: condition)` + events on the bus — same learning consumers 🔭 |
| Municipal services (trash, recycling) | recurring-job taxonomy rows + scheduling module 🔭 |
| Mobile apps | same gateway, JWT + refresh families already device-aware ✅ |

---

*Written against commit `02d1dc5` on branch `intelligence`. Companion docs:
[backend/README.md](../backend/README.md),
[backend/docs/ARCHITECTURE.md](../backend/docs/ARCHITECTURE.md),
[backend/docs/SECURITY.md](../backend/docs/SECURITY.md),
[backend/docs/openapi.yaml](../backend/docs/openapi.yaml), ADRs in
[backend/docs/adr/](../backend/docs/adr/).*
