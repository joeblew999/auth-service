# ADR-001: Architecture

**Status:** Done
**Date:** 2026-04-08

---

## What

Clean reference implementation of better-auth on Cloudflare Workers.
No zanzo, no R2, no domain schema. Used to validate all better-auth plugins
work correctly before wiring into the main auth system.

## Stack

| Layer | Technology |
|-------|-----------|
| Worker | Cloudflare Workers + Hono |
| Auth | better-auth v1.5 |
| Database | Cloudflare D1 (SQLite) |
| Session cache | Cloudflare KV |
| Frontend | React + Vite + better-auth-ui |
| Tests | Playwright e2e + Vitest worker unit tests |
| Dev runner | Pitchfork (daemons) + Mise (tasks) |

## Structure

```
auth-better/
  worker/   — Cloudflare Worker (auth API)
  web/      — React SPA (auth UI)
  e2e/      — Playwright tests
  docs/adr/ — Architecture decisions
```

## Key decisions

- Worker creates auth per-request (`createAuth(env)`) — never singleton
- Worker trusts `BETTER_AUTH_URL` as origin; localhost:8792 and :5174 in dev
- Web SPA proxies `/auth/api/*` to worker in dev (Vite proxy); same-origin in production
- No email provider — magic link / OTP codes logged to console in dev
- `.src/` contains upstream better-auth and better-auth-ui repos — use as reference, do not reinvent

## ADR index

| ADR | Topic | Status |
|-----|-------|--------|
| 001 | Architecture | Done |
| 002 | Plugin parity | Done |
| 003 | Project structure: web+worker split | Planned |
| 004 | E2E test coverage | In Progress |
| 005 | Worker unit tests | Planned |
