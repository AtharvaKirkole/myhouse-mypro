# Runbook & Disaster Recovery

## Health surface

| Endpoint | Meaning | Used by |
|---|---|---|
| `GET /health` | process responds | load balancer |
| `GET /live` | liveness (event loop alive) | k8s livenessProbe |
| `GET /ready` | dependencies usable; returns queue + DLQ stats | k8s readinessProbe |
| `GET /metrics` | Prometheus counters + latency histogram | Prometheus scrape |

## Common incidents

### Elevated 5xx rate
1. `GET /metrics` → `http_errors_total{route=…}` to localize.
2. Grep structured logs by `errorId` from the client's response envelope.
3. Check `/ready` for `deadLetters` growth (a failing consumer).

### Dead-letter queue growing
- `GET /api/admin/dead-letters` (admin) lists poisoned events with the error.
- Fix the consumer, redeploy; replay tooling drains the DLQ back onto the queue.

### Auth lockouts / suspicious activity
- `auth.suspicious` events fire on refresh-token reuse. Correlate by `familyId`.
- A locked account clears after `LOCKOUT_DURATION_SEC`; support can also clear the
  `locked:<email>` KV key.

### AI extraction failures
- `ai_stage_retries_total`, `ai_fallbacks_total`, `ai_hallucination_flags_total`.
- Sustained fallbacks → primary provider degraded; confirm provider status, the
  fallback keeps serving. Low-confidence responses return 422 by design.

### Payment discrepancy
- `GET /api/payments/integrity` reconciles every payment against its ledger and
  reports mismatches. A non-empty `mismatches` array is a P1.

## Deploy / rollback

- Deploys are image-tagged by git SHA; rollback = redeploy the previous tag.
- Migrations are forward-only and versioned (`db/store` MIGRATIONS); the schema
  version is persisted, so a redeploy is idempotent.
- Production requires manual approval (GitHub environment gate) after staging
  smoke passes.

## Disaster recovery

- **RPO**: PostgreSQL PITR (WAL archiving) — target ≤5 min. S3 versioned with
  cross-region replication.
- **RTO**: infra is IaC (`infra/`, compose today → Terraform/K8s manifests);
  target ≤30 min to restore in a clean region from the latest snapshot.
- **Backups**: nightly full + continuous WAL; monthly restore drill.
- **Secrets**: held in the secret manager, re-injected at boot; rotating
  `JWT_SECRET` invalidates all sessions (acceptable break-glass action).
