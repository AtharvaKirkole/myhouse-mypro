# ADR 0003 — Return 404 (not 403) for cross-tenant access

- **Status**: Accepted
- **Date**: 2026-07

## Context
The home is the tenant boundary. When a caller references a home they don't belong
to, a `403 Forbidden` confirms the home *exists* — an existence oracle that lets an
attacker enumerate valid ids (BOLA/IDOR reconnaissance).

## Decision
`authorize()` returns **404 not_found** when the target home either doesn't exist
*or* the caller isn't a member. A genuine member who lacks the specific permission
still gets 403 — the distinction (member vs. not) is only ever revealed to members.
Combined with UUID ids, this removes both enumeration and existence signals.

## Consequences
- No cross-tenant existence oracle; verified in `tests/tenant.test.ts`.
- Slightly less precise errors for legitimate members hitting the wrong home — an
  acceptable trade for closing the oracle.
