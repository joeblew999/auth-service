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

## Gotchas list (re-litigated more than once — don't repeat)

These are real bugs we hit + diagnosed during build-out. Each one
cost real time. Spelled out so the next AI session doesn't redo the
forensics from scratch.

### `gh secret set --body -` is a literal `-`, NOT a stdin marker
Per `gh secret set --help`: `-b, --body string` takes a literal value.
The `-` doesn't mean "read stdin" — it sets the secret to the one-char
string `-`. Symptom: every CI deploy returned CF API 7003 "object
identifier invalid" because `CLOUDFLARE_ACCOUNT_ID` was literally `-`.
**Fix: omit `--body` entirely so gh reads stdin.** Diagnosed via
`mise run cf:diag` — SHA256 fingerprint of both env vars matched
`sha256(b'-')[:8] = 3973e022`. See `scripts/sync-github-secrets.sh`.

### mise's `shell = "bash -c"` doesn't pass positional args
Args after `--` (e.g. `mise run X -- --env staging`) get APPENDED to
the script body as text, **not** bound to `$1`/`$2`. Verified via
`echo argc=$#` → `argc=0`. Use the `ENV=staging mise run X` env-var
pattern instead.

### mise's tera template engine chokes on `${#VAR}` and `// ` in scripts
- `${#VAR}` (bash length operator) → tera reads `${#` as comment-open,
  expects `#}` to close, errors. Use `printf '%s' "$X" | wc -c` instead.
- `jq '.a // .b'` (jq alternative operator) → same issue.
- `$'\n'` (bash ANSI-C quoting) → tera mangles `$'`.
**Workaround:** extract the script to a file and call it via `bash
scripts/foo.sh` from the mise task. Standalone scripts skip tera.

### Wrangler 4.85.0 silently regressed deploy
Returns CF API 7003 on `wrangler deploy --env <name>` even when token,
account, and worker name are all valid. 4.84.1 works. Pinned to
4.84.1 in `[tools]`. Watch upstream for fix.

### `latest` for any tool is dangerous
mise will resolve `latest` differently across machines + over time. We
got bitten by `wrangler = "latest"` resolving to 4.85.0. Pin every
tool to a specific minor at minimum. See `.mise.toml [tools]` block.

### fnox provider is `age`, NOT `keychain`
Earlier guidance referenced `--provider keychain` — that's wrong.
The fnox config has `[providers.age]` (encrypted with age, key cached
in macOS Keychain). The provider NAME passed to fnox is `age`. Also:
fnox does NOT have a `--stdin` flag — it auto-reads stdin when piped
without a positional VALUE. Correct invocation:
`echo "$VALUE" | fnox set KEY --global --provider age`

### CF Email Service: NEW is different from legacy Email Routing
Same `[[send_email]]` binding name. Two different backends:
- Legacy Email Routing (`destination_address` allowlist required;
  uses `EmailMessage` + MIME). Designed for replies/forwards.
- NEW Email Service (beta, Workers Paid). Plain JSON shape:
  `send({ to, from, subject, html, text })`. Accepts ANY recipient
  ONCE the sender domain is onboarded under Email Service > Email
  Sending in CF dashboard (or via `mise run email:onboard`).
The same code can run against either backend; which one fires depends
on whether the sender subdomain is onboarded.

### pitchfork moved jdx → endevco/pitchfork
mise's default `pitchfork` alias still points at the old jdx repo.
Use `"github:endevco/pitchfork" = "2.7"` explicitly to track the
active fork.

## Multi-env model (read this BEFORE editing wrangler.toml)

**Every value that varies per deployment lives in `config/<env>.env`.**
`worker/wrangler.toml` is **generated** from `worker/wrangler.toml.template`
+ the active env's config and is **gitignored**. DO NOT edit it directly —
your changes get blown away next deploy.

  - `config/production.env` → real production values (the operational facts below)
  - `config/template.env` → schema for forking
  - `config/staging.env.example` → copy + fill for a parallel staging env

Every CF-touching mise task accepts `-- --env <name>` (default: `production`).
Examples:
  - `mise run 10-deploy -- --env staging`
  - `mise run cf:provision -- --env myorg`
  - `mise run setup:check -- --env staging`

To stop typing `-- --env <x>`: `mise run env:use -- <x>` writes
`.mise.local.toml` (gitignored) setting that as the default.

## Operational facts (production env — see config/production.env for the real source)

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
