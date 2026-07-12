# ADR 0002 — Refresh-token families with reuse detection

- **Status**: Accepted
- **Date**: 2026-07

## Context
Long-lived refresh tokens are a theft target. Simple rotation (issue new, forget
old) detects nothing if an attacker steals a token and races the legitimate user.

## Decision
Group refresh tokens into a **family** per login/device. Rotation marks the
presented token `used` and issues a successor in the same family. If a token that
is already `used` is presented again, treat it as compromise and **revoke the
entire family**, emitting `auth.suspicious`.

## Consequences
- Token theft is contained: the attacker and victim diverge, and the next rotation
  by either kills the family — both must re-authenticate.
- Per-device sessions become listable and individually revocable.
- Slightly more state per session; acceptable and Redis-friendly.

## Alternatives rejected
- **Stateless-only JWTs**: no revocation, no logout-all.
- **Single rotating token**: no theft detection.
