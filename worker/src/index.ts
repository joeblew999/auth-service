// auth-better/worker/src/index.ts
//
// Routes:
//   GET  /health                    — health check
//   POST /auth/migrate              — run better-auth DB migrations (first boot)
//   ALL  /auth/api/*                — better-auth handler (sign-in, sign-up, sessions, plugins)
//   GET  /auth/test/inbox?email=..  — test email sink (dev only, ADR-007)
//   *                               — fall through to ASSETS (built React SPA)
//
// Exports:
//   fetch — HTTP handler (Hono)
//   email — CF Email Routing handler: stores inbound @test.ubuntusoftware.net mail in KV (ADR-007)
//
// Dev:  Vite runs separately on :5174 with a proxy — ASSETS binding unused.
// Prod: wrangler serves web/dist/ via ASSETS binding for all non-API routes.

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getMigrations } from 'better-auth/db/migration';
import { createAuth } from './auth';
import type { Bindings } from './auth';

// ── CF Email Routing handler (ADR-007) ────────────────────────────────────────
// Receives inbound emails routed to *@test.ubuntusoftware.net and stores them
// in AUTH_KV keyed by recipient address (TTL 5 min). Test suite polls
// GET /auth/test/inbox to retrieve the stored url/otp without a real inbox.

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
  const raw     = await new Response(message.raw).text();
  const url     = raw.match(/https?:\/\/[^\s<>"']+/)?.[0] ?? null;
  const otp     = raw.match(/\b(\d{6})\b/)?.[1] ?? null;
  const subject = message.headers.get('subject') ?? '';
  await env.AUTH_KV.put(
    `test-inbox:${message.to}`,
    JSON.stringify({ subject, url, otp, receivedAt: Date.now() }),
    { expirationTtl: 300 },
  );
}

// ── Hono app ──────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Bindings & { ASSETS: Fetcher } }>();

// ── CORS (dev only — in prod everything is same-origin) ───────────────────────

app.use('/auth/api/*', cors({
  origin: (origin) => origin, // reflect origin — BETTER_AUTH_URL handles validation
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/health', (c) => c.json({ ok: true, service: 'auth-better-worker' }));

// ── Migrate — run once on first boot ─────────────────────────────────────────

app.post('/auth/migrate', async (c) => {
  try {
    const auth = createAuth(c.env);
    const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
    if (toBeCreated.length === 0 && toBeAdded.length === 0) {
      return c.json({ ok: true, message: 'No migrations needed' });
    }
    await runMigrations();
    return c.json({ ok: true, created: toBeCreated, added: toBeAdded });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// ── Test email sink (ADR-007) — dev only ──────────────────────────────────────
// AUTH_TEST_SINK_ENABLED is set in wrangler.toml [vars] but NOT [env.production.vars].
// Returns 403 in production.

app.get('/auth/test/inbox', async (c) => {
  if (!c.env.AUTH_TEST_SINK_ENABLED) return c.json({ error: 'disabled' }, 403);
  const addr = c.req.query('email');
  if (!addr) return c.json({ error: 'email param required' }, 400);
  const val = await c.env.AUTH_KV.get(`test-inbox:${addr}`);
  if (!val) return c.json({ found: false }, 404);
  return c.json({ found: true, ...JSON.parse(val) });
});

// ── better-auth handler ───────────────────────────────────────────────────────

app.all('/auth/api/*', async (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

// ── Static assets — React SPA (production) ───────────────────────────────────
// In dev, Vite serves the frontend on :5174 — this route is never hit.
// In production, wrangler serves web/dist/ via the ASSETS binding.

app.get('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default { fetch: app.fetch.bind(app), email: emailHandler };
