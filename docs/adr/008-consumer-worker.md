# ADR-008: Consumer Worker + Main Router

**Status:** Planned
**Date:** 2026-04-09

---

## Problem

auth-better is intended to be the platform auth service for all workers in plat-trunk.
But right now it is a standalone demo — nothing actually consumes it as a platform service.

The real plat-trunk topology has a root router (`cad.ubuntusoftware.net`) that sits in
front of all workers. Before wiring auth-better into that real router, we need to prove
the entire topology works in isolation — inside auth-better itself, across all phases.

---

## Decision

Mirror the plat-trunk root router pattern exactly, inside auth-better:

| auth-better | plat-trunk |
|-------------|------------|
| `wrangler.toml` (root) | `wrangler.toml` (repo root) |
| `src/` (main router) | `src/router.ts` |
| `worker/` | auth-better-worker (same) |
| `consumer/` | truck, sync, etc. |

auth-better root IS the main router. Same structure as plat-trunk root.

---

## Topology

```
browser
  ↓
auth-better root (wrangler.toml at auth-better/)   — main router, owns the domain
  ├── /auth/*   → worker   via [[services]] binding
  └── /app/*    → consumer via [[services]] binding

worker/    — auth platform service, internal only
consumer/  — demo consumer app, internal only
web/       — React SPA (Vite dev server, Phase 1 only)
```

In this topology:
- Browser only ever talks to the root router
- `worker` and `consumer` are internal — service bindings only, never hit directly
- Cookies set for the root router's domain → shared across all routes ✓
- Cross-origin cookie problem does not exist

---

## Structure

```
auth-better/
  wrangler.toml       — root router (main) — NEW, replaces nothing, this IS main
  src/
    index.ts          — Hono router: auth check + proxy to worker/consumer
    require-auth.ts   — THE reusable helper — copy this to real root router
  worker/             — auth platform service (existing, unchanged structure)
    wrangler.toml
    src/
      auth.ts         — add AUTH_MAIN_PORT to trustedOrigins
      ...
  consumer/           — NEW demo consumer worker
    wrangler.toml     — port 8793, no service bindings (receives from root only)
    src/
      index.ts        — Hono app: reads X-User-* headers, renders pages
    package.json
    tsconfig.json
  web/                — React SPA (existing, unchanged)
  e2e/
    *.spec.ts         — all tests updated to run against root (port 8794)
    consumer.spec.ts  — NEW: full redirect flow tests
  docs/adr/
```

---

## Ports

| Service | Port | Inspector |
|---------|------|-----------|
| Auth worker | 8792 (existing) | 9233 |
| Web SPA (Vite) | 5174 (existing) | — |
| Consumer worker | 8793 (new) | 9234 |
| Root router | 8794 (new) | 9235 |

---

## The `require-auth.ts` helper

Lives in `src/require-auth.ts` (root router source). This is the key reusable artifact.
The real plat-trunk root router copies this one file.

```ts
export async function requireAuth(
  request: Request,
  authWorker: Fetcher,   // CF service binding to auth-better-worker
  signInPath: string,    // e.g. "/auth/sign-in"
): Promise<AuthUser | Response>
```

Behaviour:
1. Calls `GET http://auth/auth/api/get-session` via service binding, forwarding headers
2. If user found → returns the user object
3. If no user → returns `Response.redirect(signInPath?redirectTo=<original-url>)`

Root router usage:
```ts
const result = await requireAuth(request, env.WORKER, '/auth/sign-in');
if (result instanceof Response) return result;
// forward to consumer with X-User-* headers
```

Consumer receives and trusts `X-User-Id`, `X-User-Email`, `X-User-Name` headers —
safe because consumer is only reachable via service binding, never from the browser.

---

## Trusted origins

Root router runs on `localhost:8794` in dev, `https://auth-better-main.gedw99.workers.dev`
in Phase 3, and the custom domain in Phase 4.
Auth worker's `trustedOrigins` must include the root router's origin (what the browser sees).

Add to worker `wrangler.toml` vars:
```toml
AUTH_MAIN_PORT = "8794"          # dev only — not in [env.production]
```

Add to `worker/src/auth.ts` trustedOrigins builder:
```ts
if (env.AUTH_MAIN_PORT) {
  origins.push(`http://localhost:${env.AUTH_MAIN_PORT}`);
  origins.push(`http://127.0.0.1:${env.AUTH_MAIN_PORT}`);
}
```

Production trusted origins set via `BETTER_AUTH_URL` (already the mechanism).

---

## Redirect flow (end-to-end)

```
1. Browser hits http://localhost:8794/app (no session)
2. Root calls worker via service binding → no user
3. Root returns 302 → /auth/sign-in?redirectTo=/app
4. Browser hits http://localhost:8794/auth/sign-in
5. Root proxies to worker → auth handler → SPA served
6. User signs in — better-auth-ui reads ?redirectTo → navigates to /app
7. Browser hits http://localhost:8794/app (now has session cookie for localhost)
8. Root calls worker → user returned → adds X-User-* headers → forwards to consumer
9. Consumer renders protected content using X-User-* headers
```

Everything through one domain. Cookie set once. Clean.

---

## Four phases

### Phase 1 — Coding loop (hot-reload dev servers)

All processes via pitchfork:

| Process | How | Port |
|---------|-----|------|
| `worker/` | `wrangler dev` | 8792 |
| `web/` | `vite dev` | 5174 |
| `consumer/` | `wrangler dev` | 8793 |
| root router | `wrangler dev` | 8794 |

- Browser entry point: `http://localhost:8794`
- wrangler dev local service registry connects root → worker → consumer automatically
- `worker` knows about Vite at 5174 via `AUTH_BETTER_WEB_PORT` — serves React SPA with HMR
- Tests (`4-test`) run against root at 8794

### Phase 2 — Bundle check (production-like, local)

No Vite. Built SPA. All wrangler dev, no pitchfork.

1. `6-build` — build `web/` SPA into `web/dist/`
2. Start `worker/` wrangler dev (8792) — serves built SPA via `[assets]`
3. Start `consumer/` wrangler dev (8793)
4. Start root wrangler dev (8794)
5. Wait for health on 8794
6. `3-migrate`
7. Tests run against root at 8794

`AUTH_BETTER_WEB_PORT` NOT set in Phase 2 — worker serves built SPA directly.

### Phase 3 — Deploy to `*.workers.dev` (real CF edge, no custom domain)

Real Cloudflare infrastructure. Real service bindings. Real D1/KV.
No custom domain yet — smoke test on `workers.dev` URLs first.

Deploy order (dependencies first):
1. `wrangler deploy` `worker/` → `auth-better-worker.gedw99.workers.dev`
2. `wrangler deploy` `consumer/` → `auth-better-consumer.gedw99.workers.dev`
3. `wrangler deploy` root → `auth-better-main.gedw99.workers.dev`

Update `BETTER_AUTH_URL` in worker's `[env.production]` to the root's `workers.dev` URL
(the browser-facing URL — this sets the cookie domain correctly).

Tests run against `https://auth-better-main.gedw99.workers.dev`.

### Phase 4 — Custom domain (production)

Add custom domain route to root `wrangler.toml`:
```toml
routes = [
  { pattern = "auth.ubuntusoftware.net", custom_domain = true },
]
```

Update `BETTER_AUTH_URL` in worker `[env.production]` to the custom domain.
Redeploy root only (worker + consumer unchanged).

Tests run against `https://auth.ubuntusoftware.net`.

---

## Mise tasks

New env vars in `[env]`:
```toml
AUTH_BETTER_CONSUMER_PORT = "8793"
AUTH_BETTER_MAIN_PORT     = "8794"
AUTH_BETTER_MAIN_PROD_URL = "https://auth-better-main.gedw99.workers.dev"
```

| Task | Phase | What |
|------|-------|------|
| `1-install` | 1 | add `consumer/` bun install (root uses worker's deps) |
| `2-start` | 1 | pitchfork: worker + web + consumer + root |
| `3-migrate` | 1/2 | migrate via root (8794) |
| `4c-wait-worker` | 1/2 | wait for worker health (8792) |
| `4d-wait-main` | 1/2 | wait for root health (8794) — NEW |
| `4-test` | 1 | tests against root (8794) |
| `5-stop` | 1 | stop all pitchfork daemons |
| `6-build` | 2 | build web SPA |
| `7-start-wrangler` | 2 | start all three wrangler dev processes |
| `8-test-wrangler` | 2 | tests against root (8794) |
| `9-stop-wrangler` | 2 | kill all three ports |
| `10-deploy` | 3 | deploy worker → consumer → root (in order) |
| `10b-migrate-prod` | 3 | migrate on workers.dev |
| `11-test-prod` | 3 | tests against `AUTH_BETTER_MAIN_PROD_URL` |
| `12-deploy-domain` | 4 | redeploy root with custom domain route — NEW |
| `13-test-domain` | 4 | tests against custom domain — NEW |

---

## E2e tests

All tests run against the root router — never direct to worker or consumer.
`MAIN_URL` env var (default `http://localhost:8794`).

Existing tests: update `WEB_URL` / `WORKER_URL` → `MAIN_URL`.

New `consumer.spec.ts`:
1. **Unauthenticated** — `GET /app` → redirected to `/auth/sign-in?redirectTo=/app`
2. **Full redirect flow** — sign in → back to `/app` → user details visible
3. **Public route** — `GET /` accessible without auth
4. **User headers** — protected page shows correct name/email
5. **Sign-out** — after sign-out, `/app` redirects to sign-in again

---

## What this proves for the real plat-trunk root router

When ready:
1. Copy `src/require-auth.ts` to plat-trunk `src/`
2. Add `[[services]]` binding to auth-better-worker in root `wrangler.toml`
3. Add plat-trunk root URL to auth worker's trusted origins
4. Wire routes: `/auth/*` → auth-better, `/*` → respective worker with auth check

Pattern identical — just bigger.

---

## Out of scope (future ADRs)

- Role-based access (org/team membership checks in requireAuth)
- Bearer token flow for truly cross-domain deployments
- Exposing `requireAuth` as a published npm package
