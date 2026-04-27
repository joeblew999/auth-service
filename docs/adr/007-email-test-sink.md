# ADR-007: Cloudflare Email Routing as a Test Sink

**Status:** Done  
**Date:** 2026-04-09  
**Depends on:** ADR-006 (CF Email Service binding)

---

## Problem

The e2e suite has zero coverage of magic link, email OTP, and email verification flows.
These paths call `sendEmail()` which uses the live CF `SEND_EMAIL` binding in production —
but tests can't intercept a real inbox, and third-party sandboxes (Mailtrap, Mailosaur) add
external dependencies and cost.

---

## Decision: CF Email Routing catch-all as a test inbox

Cloudflare Email Routing supports an `email` export on Workers. Any email sent to
`*@test.ubuntusoftware.net` is routed to the Worker's `email` handler, which stores the
parsed payload in `AUTH_KV`. A `GET /auth/test/inbox?email=...` endpoint reads it back.
Tests use `unique-id@test.ubuntusoftware.net` addresses — no external service, no polling
a real SMTP inbox, zero latency beyond the CF edge round-trip.

```
test triggers magic link → noreply@ubuntusoftware.net sends to user@test.ubuntusoftware.net
  → CF Email Routing → Worker email handler → AUTH_KV (TTL 5 min)
  → test polls GET /auth/test/inbox?email=user@test.ubuntusoftware.net
  → extracts url/otp, completes auth flow
```

### Why this beats alternatives

| | Mailtrap / Mailosaur | KV intercept in sendEmail | CF Email Routing sink |
|--|--|--|--|
| Tests real SEND_EMAIL path | ✗ | ✗ | ✓ |
| External dependency | ✓ | ✗ | ✗ |
| Cost at volume | ✓ | ✗ | ✗ |
| Parallel test safety | ✗ | unique key | unique address |

The KV intercept approach (intercepting inside `sendEmail()`) only proves the Worker
*attempted* to send — it doesn't prove CF actually delivered. The routing sink exercises
the full round-trip.

---

## MacBook steps (one-time — CF dashboard, network blocked in Claude's container)

### 1. Add `test.ubuntusoftware.net` to Email Routing

Cloudflare dashboard → `ubuntusoftware.net` → **Email** → **Email Routing** → **Routes**:
- Add custom address: `*@test.ubuntusoftware.net` (catch-all)
- Destination: **Send to a Worker** → select `auth-better-worker`

Or via Wrangler CLI:
```bash
wrangler email routing address add "*@test.ubuntusoftware.net" \
  --worker auth-better-worker \
  --zone ubuntusoftware.net
```

### 2. Verify

```bash
# Should 404 (no email yet), NOT 403 (disabled)
curl "https://auth-better-worker.gedw99.workers.dev/auth/test/inbox?email=probe@test.ubuntusoftware.net"
```

---

## Implementation

### Worker — `email` export (`worker/src/index.ts`)

```ts
interface InboundEmail {
  from: string;
  to: string;
  headers: Headers;
  raw: ReadableStream;
  setReject(reason: string): void;
}

async function emailHandler(message: InboundEmail, env: Bindings): Promise<void> {
  if (!message.to.endsWith('@test.ubuntusoftware.net')) {
    message.setReject('Not a test sink address');
    return;
  }
  const raw   = await new Response(message.raw).text();
  const url   = raw.match(/https?:\/\/[^\s<>"']+/)?.[0] ?? null;
  const otp   = raw.match(/\b(\d{6})\b/)?.[1] ?? null;
  const subject = message.headers.get('subject') ?? '';
  await env.AUTH_KV.put(
    `test-inbox:${message.to}`,
    JSON.stringify({ subject, url, otp, receivedAt: Date.now() }),
    { expirationTtl: 300 },
  );
}

export default { fetch: app.fetch.bind(app), email: emailHandler };
```

### Worker — test inbox endpoint (`worker/src/index.ts`)

```ts
// Guarded by AUTH_TEST_SINK_ENABLED — only set in dev [vars], not [env.production]
app.get('/auth/test/inbox', async (c) => {
  if (!c.env.AUTH_TEST_SINK_ENABLED) return c.json({ error: 'disabled' }, 403);
  const addr = c.req.query('email');
  if (!addr) return c.json({ error: 'email param required' }, 400);
  const val = await c.env.AUTH_KV.get(`test-inbox:${addr}`);
  if (!val) return c.json({ found: false }, 404);
  return c.json({ found: true, ...JSON.parse(val) });
});
```

### wrangler.toml

```toml
[vars]
AUTH_TEST_SINK_ENABLED = "true"   # dev only — NOT in [env.production.vars]
```

### e2e helper — `pollTestInbox`

```ts
export const TEST_SINK_DOMAIN = 'test.ubuntusoftware.net';
export const sinkEmail = (label: string) => `${label}-${Date.now()}@${TEST_SINK_DOMAIN}`;

export async function pollTestInbox(
  workerUrl: string,
  address: string,
  timeoutMs = 10_000,
): Promise<{ subject: string; url: string | null; otp: string | null }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${workerUrl}/auth/test/inbox?email=${encodeURIComponent(address)}`);
    if (res.ok) {
      const data = await res.json() as any;
      if (data.found) return data;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`pollTestInbox: no email for ${address} within ${timeoutMs}ms`);
}
```

---

## Local dev simulation (wrangler dev)

`wrangler dev` emulates the `email` event. You can fire a fake inbound email via:

```bash
curl -s http://localhost:8792/__mf__/email \
  -H "Content-Type: message/rfc822" \
  --data-binary $'From: noreply@ubuntusoftware.net\r\nTo: test@test.ubuntusoftware.net\r\nSubject: Your sign-in code\r\n\r\nYour code: 123456\r\nExpires in 10 minutes.'
```

Note: the exact local endpoint may vary across wrangler versions — check `wrangler dev` output.

---

## CI behaviour by phase

| Phase | Email delivery | Sink works? |
|-------|---------------|-------------|
| Phase 1 (pitchfork/vitest) | console.log fallback | No — skip email.spec.ts |
| Phase 2 (wrangler dev) | wrangler emulates SEND_EMAIL | Yes — if email event simulation is triggered manually |
| Phase 3 (production) | Live CF delivery | Yes — full round-trip |

Email flow tests require `AUTH_TEST_SINK_ENABLED=true` in the test environment.
The spec file skips automatically when the env var is absent.

---

## What's done

| Item | Status |
|------|--------|
| ADR written | ✅ |
| Worker `email` handler + KV storage | ✅ |
| `GET /auth/test/inbox` endpoint | ✅ |
| `AUTH_TEST_SINK_ENABLED` guard in wrangler.toml | ✅ |
| `pollTestInbox` + `sinkEmail` helpers in e2e | ✅ |
| `e2e/email.spec.ts` — magic link, OTP, email verification | ✅ |
| CF dashboard: catch-all route for `*@test.ubuntusoftware.net` | MacBook step |
