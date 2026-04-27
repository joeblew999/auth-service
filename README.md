# auth-service — Better Auth SSO for `*.ubuntusoftware.net`

A single Cloudflare Worker that runs [Better Auth](https://better-auth.com)
v1.5 against D1 + KV + Cloudflare Email, and acts as the **shared identity
provider for every other Worker on `*.ubuntusoftware.net`** via Cloudflare
Service Bindings.

- Backend: [better-auth/better-auth](https://github.com/better-auth/better-auth)
- React SPA UI: [better-auth-ui/better-auth-ui](https://github.com/better-auth-ui/better-auth-ui) ([docs](https://better-auth-ui.com/integrations/react))
- Was extracted from `joeblew999/plat-trunk/systems/auth/auth-better` — see ADRs in [`docs/adr/`](docs/adr) for design decisions.

## Live URLs

| Endpoint | URL |
| --- | --- |
| Sign in | [auth.ubuntusoftware.net/auth/sign-in](https://auth.ubuntusoftware.net/auth/sign-in) |
| Sign up | [auth.ubuntusoftware.net/auth/sign-up](https://auth.ubuntusoftware.net/auth/sign-up) |
| Account | [auth.ubuntusoftware.net/account/settings](https://auth.ubuntusoftware.net/account/settings) |
| Health  | [auth.ubuntusoftware.net/health](https://auth.ubuntusoftware.net/health) |
| API ref | [auth.ubuntusoftware.net/auth/api/reference](https://auth.ubuntusoftware.net/auth/api/reference) |
| Backup (workers.dev) | [auth-better-worker.gedw99.workers.dev](https://auth-better-worker.gedw99.workers.dev) |

## Architecture: SSO across multiple Workers

```
Browser ──cookie──→ app1.ubuntusoftware.net  (your Worker)
                          │
                          ├─ Service Binding ─→ auth-better-worker (THIS REPO)
                          │                            │
                          │                            └─→ D1 (users, sessions, orgs)
                          │
                          └─ business logic, no auth code beyond getAuthUser()
```

- The browser cookie is set on `.ubuntusoftware.net` (parent domain), so it
  travels to **every subdomain automatically** — single sign-in, all apps
  authenticated. (`crossSubDomainCookies` in `worker/src/auth.ts`.)
- Consumer Workers never bundle Better Auth or touch the DB. They forward
  the cookie via `env.AUTH.fetch(...)` — an internal Cloudflare network
  call (no public DNS hop, no egress cost, ~1 ms).
- The same `auth-better-worker` deploy serves every consumer; only this
  repo's `wrangler deploy` needs to run when auth changes.

## Adding a new consumer Worker (~5 minutes per app)

In your app's `wrangler.jsonc` (or `.toml`):
```jsonc
{
  "name": "myapp",
  "main": "worker/index.ts",
  "services": [
    { "binding": "AUTH", "service": "auth-better-worker" }
  ],
  "routes": [
    { "pattern": "myapp.ubuntusoftware.net", "custom_domain": true }
  ]
  // Both Workers must be in the same Cloudflare account for the binding
  // to resolve.
}
```

In your Worker code (Hono, plain fetch, anything):
```ts
interface Env { AUTH: Fetcher; /* ...your other bindings... */ }

// Forward the browser session cookie to auth-better-worker via the
// Service Binding. The hostname is irrelevant — Service Bindings route
// by service name, not DNS — but the URL must be valid.
async function getAuthUser(req: Request, env: Env) {
  const r = await env.AUTH.fetch(new Request('https://auth/auth/api/get-session', {
    headers: { cookie: req.headers.get('cookie') ?? '' }
  }));
  return r.ok ? (await r.json() as { user?: unknown } | null)?.user ?? null : null;
}

export default {
  async fetch(req: Request, env: Env) {
    const user = await getAuthUser(req, env);
    if (!user) return new Response('please sign in', { status: 401 });
    // user.id, user.email, etc — full user object
    return Response.json({ greeting: `hi ${user.email}` });
  },
};
```

Redirect unsigned-in users to the login page on this Worker:
```ts
return Response.redirect(`https://auth.ubuntusoftware.net/auth/sign-in?next=${encodeURIComponent(req.url)}`, 302);
```

That's it. Reference implementation:
[`joeblew999/ifc-lite/apps/viewer/worker/index.ts`](https://github.com/joeblew999/ifc-lite/blob/cloudflare/deploy/apps/viewer/worker/index.ts).

## Email — Cloudflare Email Service (status: code wired, real-inbox delivery untested)

Magic-link, email-OTP, and email-verification all flow through
`worker/src/plugins.ts → sendEmail()` which calls the native
`env.SEND_EMAIL.send()` binding (no API keys, no SMTP — see
[ADR-006](docs/adr/006-cloudflare-email.md)).

**What's done:**
- Code wired in `plugins.ts` (uses `env.SEND_EMAIL.send`, falls back to `console.log` when binding absent).
- `[[send_email]]` binding declared in `worker/wrangler.toml` for both dev and `[env.production]`.
- `AUTH_EMAIL_FROM = noreply@ubuntusoftware.net` set in production vars.

**One manual step still required** — onboard the sender domain under the
new Cloudflare Email Service (beta) so it can deliver to **arbitrary
external recipients** (i.e. real customer addresses):

1. Cloudflare dashboard → **Email Service → Email Sending → Add domain**
2. Pick `ubuntusoftware.net` (already on Cloudflare DNS, so SPF + DKIM + DMARC
   are auto-provisioned — single-click).
3. Wait for green status (~1 min).
4. Trigger a magic link in a test browser — it should deliver to any
   inbox without further configuration.

Until that one-time step is done, `env.SEND_EMAIL.send()` returns
`destination address is not a verified address` because the binding is
still using the **legacy** Email Routing semantics (which require
recipients to be account-verified destinations). Onboarding flips it
to the new Email Service backend automatically — no code change needed,
no `wrangler.toml` change needed.

Reference: [Cloudflare Email Service magic-link example](https://developers.cloudflare.com/email-service/examples/email-sending/magic-link/).

Until then, email-driven flows (`magicLink`, `emailOTP`,
`emailVerification`) silently fall back to `console.log` — visible in
`pitchfork logs worker` (dev) or `wrangler tail` (prod). Password sign-up
works end-to-end without email and is the proven path today. Test sink at
`/auth/test/inbox?email=foo@test.ubuntusoftware.net`
([ADR-007](docs/adr/007-email-test-sink.md)) covers automated tests but
isn't the same as real-inbox delivery.

## Test users

The e2e tests generate random emails like `signup-1234567890@test.ubuntusoftware.net`
and use the canonical `TEST_PASSWORD` exported from `e2e/helpers.ts`.

The old fixture `Password123!` is now **rejected** at signup because the
`haveIBeenPwned` plugin (enabled in `worker/src/plugins.ts`) blocks any
password that appears in the HIBP breach corpus. Use a non-breached
fixture for any new manual or scripted test.

Manual sign-in:
- `1234567890@test.ubuntusoftware.net` / *use the value of `TEST_PASSWORD`*

## First-time setup (fresh laptop → everything working)

This repo follows a strict **mise-as-SSOT** convention: install `mise` once,
and `.mise.toml` provisions every other tool you need (`bun`, `node`,
`wrangler`, `pitchfork`, `fnox`, `age`, `gh`). Same toolchain CI uses, no
"works-on-my-machine" version skew, no manual installs of 7 different
package managers.

### 1. Install `mise` (one-time, per machine)

```sh
# macOS
brew install mise
# OR (any platform)
curl https://mise.run | sh
```

Then activate it in your shell — once, in `~/.zshrc` (or `~/.bashrc` /
`~/.config/fish/config.fish`):

```sh
eval "$(mise activate zsh)"     # zsh
eval "$(mise activate bash)"    # bash
mise activate fish | source     # fish
```

Restart your shell (or `source ~/.zshrc`).

### 2. Provision the toolchain (in this repo)

```sh
git clone https://github.com/joeblew999/auth-service && cd auth-service
mise trust       # one-time, allow this repo's .mise.toml
mise install     # downloads bun + node + wrangler + pitchfork + fnox + age + gh
```

### 3. Authenticate

```sh
wrangler login   # opens browser; OAuths your Cloudflare account
gh auth login    # opens browser; OAuths your GitHub account
```

### 4. Set up secrets (fnox + macOS Keychain)

You need `CLOUDFLARE_API_TOKEN` (and optionally `BETTER_AUTH_SECRET`)
in fnox before deploys can use them. The token bootstrap is wrapped:

```sh
mise run cf:token:create   # opens browser, prints exact scopes, saves to fnox
mise run cf:token:check    # verifies the token has every scope this repo needs
```

That's it. From here on, every command in the repo is `mise run <task>`.

## Run it (local dev)

```sh
mise run 1-install    # install npm deps — first time only
mise run 2-start      # start worker (:8792) + web (:5174)
mise run 3-migrate    # create DB schema — first time only
```

Open <http://localhost:5174>.

```sh
mise run 5-stop       # stop everything
mise run ci           # shortcut: kill → install → start → migrate → test → stop
```

## Test it

```sh
# Phase 1 — dev servers
mise run 4-test

# Phase 2 — wrangler bundle (build first)
mise run 6-build
mise run 7-start-wrangler   # foreground — open new terminal for tests
mise run 8-test-wrangler
mise run 9-stop-wrangler

# Phase 3 — production
mise run 11-test-prod
```

## Deploy (MacBook only)

```sh
# One-time: provision Cloudflare resources
wrangler d1 create auth-better-db
wrangler kv namespace create AUTH_KV
wrangler secret put BETTER_AUTH_SECRET --env production   # openssl rand -base64 32
# Fill in real IDs in worker/wrangler.toml [env.production.*] blocks

mise run 10-deploy         # build web + deploy worker to Cloudflare
mise run 10b-migrate-prod  # run DB migrations on production
mise run 11-test-prod      # run tests against production

mise run ci-prod           # shortcut: deploy → migrate → test
```

## Secrets (fnox → macOS Keychain → Cloudflare / GitHub)

This repo follows the same fnox + age + macOS Keychain SSOT pattern as
`joeblew999/ifc-lite`. Set values once globally, sync to the right
destination per task.

```sh
mise run secrets:list             # show the canonical mapping table
mise run secrets:status           # what's in fnox vs what's in GH repo secrets
mise run secrets:sync-github-dry  # preview push to GitHub Actions secrets
mise run secrets:sync-github      # actual push (gh CLI must be authed)
mise run secrets:put-cf           # push BETTER_AUTH_SECRET → deployed Worker
```

Edit the mapping in [`scripts/sync-github-secrets.sh`](scripts/sync-github-secrets.sh)
when you enable new social providers (Google/GitHub/Microsoft) — uncomment
the matching rows.

## Conventions (for AI assistants and humans)

- `.src/` (gitignored) holds vendored upstream sources — use them as reference,
  don't reinvent the wheel; reuse upstream code aggressively.
- Keep [mise](https://mise.jdx.dev) and [pitchfork](https://pitchfork.jdx.dev)
  files correct — you and devs use this to run things.
- Tasks in `mise.toml` are numbered so the natural order of what-to-run-when
  is obvious.
- Keep this README in sync with `mise.toml`.
- All e2e tests must pass before deploy.
- Dog-food everything yourself.
