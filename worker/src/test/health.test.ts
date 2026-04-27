// worker/src/test/health.test.ts
//
// Smoke tests — verify the worker starts and responds correctly inside workerd.

import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('worker smoke', () => {
  it('GET /health returns ok', async () => {
    const res = await SELF.fetch('http://worker/health');
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('GET /auth/api/get-session returns 200 (no session)', async () => {
    const res = await SELF.fetch('http://worker/auth/api/get-session', {
      headers: { Origin: 'http://worker' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as unknown;
    expect(body).toBeNull();
  });

  it('POST sign-up/email creates a user', async () => {
    const email = `smoke-${crypto.randomUUID()}@test.dev`;
    // Must not be in HaveIBeenPwned breach corpus (haveIBeenPwned plugin
    // is enabled and rejects compromised passwords). 'Password123!' fails.
    const password = 'Tx9k!Pn2vMrQ8wL3ZcEhYsBfDjGuV6N4';
    const res = await SELF.fetch('http://worker/auth/api/sign-up/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://worker',
      },
      body: JSON.stringify({ email, password, name: 'Smoke User' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { user?: { email: string } };
    expect(body.user?.email).toBe(email);
  });
});
