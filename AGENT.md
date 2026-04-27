# Notes for AI assistants working on this repo

This file captures architecture decisions and gotchas that took real time
to discover. Read it before re-litigating the same questions. Keep it
short — for deep history, see `docs/adr/` and `README.md`.

## What this repo is

A standalone Better Auth service on Cloudflare Workers that acts as the
SSO/identity provider for **every Worker on `*.ubuntusoftware.net`** via
Cloudflare Service Bindings. Was extracted from `joeblew999/plat-trunk`
on 2026-04-27 because it's the auth foundation for many apps.

Ship target: production-grade B2B SSO. Not a learning toy.

## Architecture decisions you should not reopen

### Service Bindings, NOT OAuth flows, for inter-Worker auth
Every consumer Worker (e.g. `ifc-lite-viewer`) calls `env.AUTH.fetch()`
internally — no DNS hop, no OAuth dance. The browser cookie is the only
"public" interface. We considered OAuth/OIDC for inter-app SSO; the
verdict (after reading agentic-inbox and Cloudflare's docs) is that
Service Bindings are the canonical CF pattern.

When a non-CF app needs to consume this auth, *then* enable the
`oidcProvider` plugin. Until then, OIDC is overhead.

### Cookie domain MUST be a real registered domain
`*.workers.dev` subdomains cannot share cookies (`workers.dev` is on the
public suffix list). That's why `auth.ubuntusoftware.net` and
`ifc-lite.ubuntusoftware.net` are custom-domain-routed via the workers'
own `wrangler.jsonc routes` — not just `workers.dev` URLs.

### Two CF email APIs — we use the NEW one
Same `[[send_email]]` binding name, two completely different backends:

- **Legacy Email Routing send_email**: requires `destination_address`
  allowlist OR account-verified destinations. Uses MIME via
  `EmailMessage` + `cloudflare:email`. Designed for replies/forwards.
- **NEW Email Service** (beta, Workers Paid): accepts ANY external
  recipient once the sender domain is onboarded under Email Service →
  Email Sending in the dashboard (or via `mise run email:onboard`).
  Plain JSON shape: `send({ to, from, subject, html, text })`.

We use the **new** one. `mail.ubuntusoftware.net` is the registered
sending subdomain. `AUTH_EMAIL_FROM` MUST be on this subdomain (not the
apex) — CF rejects FROM addresses outside registered subdomains.

If you see "destination address is not a verified address", the binding
fell back to legacy semantics — domain isn't onboarded. Run
`mise run email:onboard`.

### Test password ≠ Password123!
The `haveIBeenPwned` plugin rejects compromised passwords on signup.
`Password123!` is in the breach corpus. Use the `TEST_PASSWORD` constant
from `e2e/helpers.ts`. If you change the value, make sure the new one is
not in HIBP (check at <https://haveibeenpwned.com/Passwords>).

### Wrangler env inheritance is finicky — always re-declare
Top-level `[assets]`, `[vars]`, `[[d1_databases]]`, etc. do NOT inherit
into `[env.production]`. Symptoms: "Cannot read properties of undefined
(reading 'fetch')" on prod, fine in dev. Always re-declare every binding
under `[env.production.*]` blocks.

The `AUTH_BETTER_WEB_PORT` warning on every deploy is intentional —
that var is dev-only and stays out of prod.

### CORS allowlist, NOT reflect-any-origin
`worker/src/index.ts` locks cross-origin browser XHR to
`*.ubuntusoftware.net` + dev ports. Service-Binding consumers bypass
CORS (no Origin header). Do NOT replace with `(o) => o` — that
re-opens CSRF surface.

## Operational facts

| Fact | Value |
|---|---|
| Cloudflare account | gedw99@gmail.com (`7384af54e33b8a54ff240371ea368440`) |
| Custom domain (production) | `auth.ubuntusoftware.net` |
| workers.dev backup | `auth-better-worker.gedw99.workers.dev` |
| D1 database | `auth-better-db` (`69f62edf-88ec-41ef-be41-4dd341b2da0d`) |
| KV namespace | `AUTH_KV` (`476719674e124d6b9f5e70965cb017d0`) |
| Sending subdomain | `mail.ubuntusoftware.net` (DKIM `cf-bounce`) |
| FROM address | `noreply@mail.ubuntusoftware.net` |
| Workers Paid plan? | yes (required for new Email Service) |

## What plugins are enabled

See `worker/src/plugins.ts`. Currently: twoFactor, magicLink, emailOTP,
organization, admin, multiSession, anonymous, bearer, jwt, oneTimeToken,
username, apiKey, passkey, openAPI, **haveIBeenPwned**.

Not enabled (with reason):
- `captcha` — needs paired UI work in `web/` (daveyplate auto-renders
  Turnstile widget when `<AuthUIProvider captcha={...}>` is set). Server
  alone would break sign-in.
- `oidcProvider` — defer until first non-CF client.
- `sso` (`@better-auth/sso`) — defer until first enterprise customer
  brings their own SAML/OIDC IdP.
- `stripe` (`@better-auth/stripe`) — defer until billing.

## Secrets

`fnox` is the local source of truth (backed by macOS Keychain).
Per-destination push tasks:

| What | Where it lands | Mise task |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | local env (for wrangler/curl) + GH Actions | `secrets:sync-github` |
| `BETTER_AUTH_SECRET` | deployed Worker | `secrets:put-cf` |
| (rotate `BETTER_AUTH_SECRET`) | both | `secrets:rotate-better-auth` |
| `TURNSTILE_*_KEY` (when added) | deployed Worker + web/ build | TBD when captcha is wired |

## Conventions

- All mise tasks numbered (`1-install`, `2-start`, ...) so the natural
  order of "what runs when" is obvious.
- Every change that touches deploy gets a smoke step (`curl /health`,
  `curl /api/me`) before commit.
- Don't reinvent. Reuse `.src/`-vendored upstream code aggressively.
- Conventional commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`,
  `deps:`. The "why" goes in the body, not the title.
