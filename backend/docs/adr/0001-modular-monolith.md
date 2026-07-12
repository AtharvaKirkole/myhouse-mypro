# ADR 0001 — Modular monolith over microservices (for now)

- **Status**: Accepted
- **Date**: 2026-07

## Context
The product spans auth, assets, warranties, marketplace, payments, notifications,
AI, and search. A microservice-per-domain layout is the eventual target, but at
current scale it would add network hops, distributed-transaction complexity, and
operational overhead before there is load to justify it.

## Decision
Ship a **modular monolith**: one deployable, nine modules with hard internal
boundaries. Modules talk only through HTTP routers and an event queue; no module
imports another's internals. Cross-cutting concerns live in `core/`.

## Consequences
- Fast local dev, one deploy, atomic refactors across modules.
- Splitting a module later is mechanical: give it its own store + event bus client.
- Requires discipline: the "no internal imports" rule is enforced by review and
  the single documented exception (`payments.createHold`).
