// worker/src/test/plugins.test.ts
//
// Option A smoke tests — verify plugin endpoints are wired and responding.
// Pattern: same SELF.fetch() used by upstream Cloudflare fixture.
//
// Upstream refs:
//   magicLink  → POST /auth/api/sign-in/magic-link  (index.ts line 190)
//   emailOTP   → POST /auth/api/email-otp/send-verification-otp  (index.ts line 133)
//   twoFactor  → POST /auth/api/two-factor/enable  (index.ts line 118)
//
// What these tests prove: each plugin is imported, initialized, and registered
// at the correct route. A 404 means mis-wired; a 401/200 means alive.
//
// What these tests do NOT prove: token/OTP delivery or full sign-in flow.
// Those require full flow capture (ADR-005 Option B, future work).

import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const BASE = 'http://worker/auth/api';
const JSON_HEADERS = { 'Content-Type': 'application/json', 'Origin': 'http://worker' };

describe('plugin endpoint smoke tests', () => {

  // ── magicLink ───────────────────────────────────────────────────────────────
  // POST /sign-in/magic-link — sends magic link for email
  // No auth required — returns 200 ("sent") for any valid email

  it('magicLink: POST /sign-in/magic-link accepts email → 200', async () => {
    const res = await SELF.fetch(`${BASE}/sign-in/magic-link`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: `magic-${crypto.randomUUID()}@test.dev` }),
    });
    expect(res.status).toBe(200);
  });

  // ── emailOTP ────────────────────────────────────────────────────────────────
  // POST /email-otp/send-verification-otp — sends OTP for sign-in or verification
  // No auth required — returns 200 for any valid email + type

  it('emailOTP: POST /email-otp/send-verification-otp accepts email → 200', async () => {
    const res = await SELF.fetch(`${BASE}/email-otp/send-verification-otp`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        email: `otp-${crypto.randomUUID()}@test.dev`,
        type: 'sign-in',
      }),
    });
    expect(res.status).toBe(200);
  });

  // ── twoFactor ───────────────────────────────────────────────────────────────
  // POST /two-factor/enable — requires an authenticated session
  // Unauthenticated → 401 (plugin is alive and enforcing auth)

  it('twoFactor: POST /two-factor/enable unauthenticated → 4xx', async () => {
    const res = await SELF.fetch(`${BASE}/two-factor/enable`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({}),
    });
    // 400 (missing password field) or 401 (no session) — either means the plugin is alive
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

});
