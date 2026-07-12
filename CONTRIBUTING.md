# Contributing

## Setup

```bash
npm install            # frontend (repo root)
cd backend && npm install
```

## Before you push

Frontend:
```bash
npx tsc --noEmit
```

Backend (`/backend`):
```bash
npm run lint          # zero errors required
npm run format:check
npm run typecheck
npm test              # all green
npm run smoke
```

## Git hooks (opt-in)

Config for Husky + lint-staged + commitlint ships in the repo (`.husky/`,
`.lintstagedrc.json`, `commitlint.config.js`) but is **inert until activated** so a
plain clone never fails on missing dev tools. To turn it on:

```bash
npm i -D husky lint-staged @commitlint/cli @commitlint/config-conventional
npx husky init          # points core.hooksPath at .husky/
```

CI enforces the same gates regardless, so hooks are a local convenience.

## Conventions

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org) —
  `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`, `ci:`.
- **Branches**: short-lived, branched off `main`; open a PR (template auto-fills).
- **TypeScript**: strict; avoid `any` (lint warns).
- **New endpoints**: must have a zod schema (`core/validate.ts`) and an
  `authorize()` guard. No hand-rolled validation, no scattered permission checks.
- **New behavior**: add/extend a test; update `docs/openapi.yaml` and, for
  significant decisions, an ADR under `backend/docs/adr/`.

## Architecture rules

- Services never import another service's internals — communicate via routers or
  the event queue.
- Persistence only through `db/store`; caches/sessions only through `core/redis`.
- Never log PII (the logger redacts known keys — don't defeat it).
