# Security

## Threat model (STRIDE, abbreviated)

| Threat | Control |
|---|---|
| **Spoofing** | JWT (HS256) access tokens; refresh-token families bound to devices; MFA (TOTP) |
| **Tampering** | Server-side authorization on every write; optimistic-locking `version`; immutable audit log; payment ledger reconciliation |
| **Repudiation** | Audit log records who/what/when/where/before/after with requestId |
| **Information disclosure** | Tenant isolation (404 for non-members — no existence oracle); PII redaction in logs; no stack traces in responses; security headers |
| **Denial of service** | Per-IP + per-user rate limits; login lockout; body-size cap; AI stage timeouts; edge rate limit at nginx |
| **Elevation of privilege** | Policy engine `Role→Action→Resource`; contractor/guest time-boxed; admin gate on analytics/DLQ |

## Authentication

- **Access JWT**, 15-minute TTL, carries `sid` (session/family) and `gen` (token generation).
- **Refresh tokens** are opaque, grouped into a **family** per device. Rotation
  marks the old token used; presenting a used token is treated as theft and
  **revokes the entire family** (and emits `auth.suspicious`).
- **Session invalidation**: password change/reset increments `tokenGeneration`,
  instantly invalidating every previously issued access token.
- **logout** revokes the current family; **logout-all** revokes every family.

## Passwords

- scrypt with a per-user 16-byte salt; constant-time comparison.
- Strength policy: ≥10 chars, ≥3 character classes, common-password blocklist.
- Breach check via a `BreachChecker` abstraction (HIBP k-anonymity in prod).
- History of the last 5 hashes; reuse rejected on change/reset.
- Reset + email-verification tokens are random, **stored hashed**, single-use, expiring.

## MFA

RFC-6238 TOTP (validated against the standard SHA-1 test vector), ±1 step drift
window, 10 single-use recovery codes (stored hashed), 30-day trusted devices.

## Authorization & multi-tenancy

The home is the tenant boundary. `authorize(action, resource, homeIdFrom)` is the
only gate: it checks authentication → membership+existence (404 if either fails,
so home ids can't be probed) → policy. Ids are UUIDs, eliminating sequential
enumeration. Client-supplied ids are never trusted; ownership is always
re-resolved from membership rows.

## API hardening

Security headers (nosniff, X-Frame DENY, CSP `default-src 'none'`, HSTS in prod,
Referrer-Policy, Permissions-Policy), CORS origin whitelist, JSON body-size limit,
idempotency keys for unsafe methods, and a consistent typed-error envelope.

## Secrets

`config.ts` fails fast in production on a missing/short `JWT_SECRET`, a wildcard
CORS origin, or `AI_PROVIDER=mock`. No secrets in the repo; `.env.example`
documents the surface. CI runs a gitleaks secret scan.

## Data protection

Soft deletes keep data recoverable and auditable. Encryption at rest (KMS-backed
volumes) and in transit (TLS at the proxy) are infrastructure controls, noted here
and configured in IaC — not application code.

## Known demo-only simplifications

- JSON-file store instead of PostgreSQL (same repository interface).
- In-memory KV instead of Redis (same `KV` interface).
- Channel/breach/virus-scan providers are stubs behind interfaces.
None of these change the security *surface* — they're swapped at the seam.
