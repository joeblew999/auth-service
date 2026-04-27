# auth-better — better-auth reference system

Backend: https://github.com/better-auth/better-auth (Cloudflare Worker)
Frontend: https://github.com/better-auth-ui/better-auth-ui (React SPA)
- https://better-auth-ui.com/integrations/react


## Test users 


The e2e tests generate random emails like signup-1234567890@test.dev and always use Password123! as the password.

I use:
- 1234567890@test.dev
- Password123!

## Run it

```sh
mise install          # install tools (pitchfork, bun, node, wrangler)
mise run 1-install    # install npm deps — first time only
mise run 2-start      # start worker (:8792) + web (:5174)
mise run 3-migrate    # create DB schema — first time only
```

Open http://localhost:5174

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
wrangler secret put BETTER_AUTH_SECRET   # openssl rand -base64 32
# Fill in real IDs in worker/wrangler.toml [env.production.*] blocks

mise run 10-deploy         # build web + deploy worker to Cloudflare
mise run 10b-migrate-prod  # run DB migrations on production
mise run 11-test-prod      # run tests against production

mise run ci-prod           # shortcut: deploy → migrate → test
```

## URLs

| | Dev | Production |
|--|-----|------------|
| Frontend | http://localhost:5174 | https://auth-better-worker.gedw99.workers.dev |
| Sign-in | http://localhost:5174/auth/sign-in | https://auth-better-worker.gedw99.workers.dev/auth/sign-in |
| Sign-up | http://localhost:5174/auth/sign-up | https://auth-better-worker.gedw99.workers.dev/auth/sign-up |
| Account | http://localhost:5174/account/settings | https://auth-better-worker.gedw99.workers.dev/account/settings |
| Worker health | http://localhost:8792/health | https://auth-better-worker.gedw99.workers.dev/health |
| API Reference | http://localhost:5174/auth/api/reference | https://auth-better-worker.gedw99.workers.dev/auth/api/reference |

No email needed — sign up with any address. Magic link / OTP codes print to `pitchfork logs worker`.

## CLAUDE

.src/ contains the upstream repos — use them as reference, do not reinvent the wheel !!! Us theior code AS MUCH AS POSSIBLE !!! 

Keep Mise files (https://mise.jdx.dev) and Pitchfork files (https://pitchfork.jdx.dev) correct — you and devs use this to run things.

All tasks in Mise to be numbered so the natural order of what to run when is obvious.

Keep README up to date with Mise.

All e2e tests must pass.

Dog food everything yourself.
