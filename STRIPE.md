# Stripe — billing for Better Auth users & orgs

Stripe lives in this repo (not in consumer Workers) because billing is bound
to **identity**, and identity lives here. The same `auth-better-worker` that
issues sessions also owns customer records, subscriptions, and webhook
ingestion. Consumer Workers ask "is this user on the Pro plan?" via the
existing Service Binding, the same way they ask "who is this user?".

## Why this lives in auth-service

- A Stripe `Customer` is 1:1 with a Better Auth `user` (or `organization`).
  Creating it anywhere else means duplicating the join.
- Webhooks need a stable, single endpoint. Putting it on the auth Worker
  means one Stripe webhook URL across the whole `*.ubuntusoftware.net`
  estate, not one per app.
- Subscription state belongs next to session state — both are read on
  every authenticated request, both want the same D1 + KV.
- Consumer Workers stay billing-ignorant. They call
  `env.AUTH.fetch('/billing/...')` the same way they call
  `/auth/api/get-session`.

## Plugin choice

Use the official Better Auth Stripe plugin:
<https://www.better-auth.com/docs/plugins/stripe>

It handles:
- Customer creation on signup
- Subscription lifecycle (`checkout`, `portal`, cancellation)
- Webhook signature verification + event → DB sync
- Per-user and per-organization plans

## Architecture

```
Browser ──cookie──→ app1.ubuntusoftware.net (consumer Worker)
                          │
                          ├─ env.AUTH.fetch('/auth/api/get-session')
                          ├─ env.AUTH.fetch('/billing/subscription')   ← new
                          └─ env.AUTH.fetch('/billing/checkout')       ← new

Stripe ──webhook──→ auth.ubuntusoftware.net/billing/webhook
                          │
                          └─→ D1 (subscriptions, invoices, customer ids)
```

## What needs filling in

- [ ] Plan catalogue: price IDs, product IDs, free/pro/team tiers
- [ ] Per-user vs per-org billing decision (Better Auth supports both)
- [ ] Webhook secret + signing-secret rotation strategy
  (Cloudflare secret, not env var)
- [ ] D1 schema additions: `subscription`, `customer` tables (the plugin
      ships migrations — wire them into the existing migration pipeline)
- [ ] Test mode keys for `wrangler dev`; live keys for production deploy
- [ ] Consumer-side helper: `getBillingStatus(req, env)` mirroring
      `getAuthUser(req, env)` in the README
- [ ] ADR in `docs/adr/` capturing the "billing belongs in auth-service"
      decision

## Out of scope (for now)

- Tax handling (Stripe Tax vs manual) — defer until first paid customer
- Usage-based metering — start with seat/flat subscriptions
- Self-serve plan changes from the SPA — Stripe Customer Portal first,
  custom UI later
