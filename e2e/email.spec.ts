// auth-better/e2e/email.spec.ts
//
// Tests for email-based auth flows: magic link, OTP sign-in, email verification.
// Requires the CF Email Routing catch-all for *@test.ubuntusoftware.net → Worker
// and AUTH_TEST_SINK_ENABLED=true in the Worker (set automatically in dev via wrangler.toml).
//
// These tests are skipped when AUTH_TEST_SINK_ENABLED is not in the environment —
// i.e. Phase 1 CI (pitchfork/vitest) where SEND_EMAIL binding is absent.
// They run in Phase 2 (wrangler dev) and Phase 3 (production smoke).
//
// ADR-007: docs/adr/007-email-test-sink.md

import { test, expect } from '@playwright/test';
import { WORKER_URL, sinkEmail, pollTestInbox } from './helpers';

const SINK_ENABLED = process.env.AUTH_TEST_SINK_ENABLED === 'true';

test.describe('email flows', () => {
  test.skip(!SINK_ENABLED, 'requires AUTH_TEST_SINK_ENABLED=true (wrangler dev or prod smoke)');

  // ── Magic link ──────────────────────────────────────────────────────────────

  test('magic link — request delivered and link is valid', async ({ request }) => {
    const addr = sinkEmail('magic');

    // 1. Sign up so the account exists (magic link requires existing account)
    await request.post(`${WORKER_URL}/auth/api/sign-up/email`, {
      data: { email: addr, password: 'Ignored1!', name: 'Magic User' },
      headers: { 'Content-Type': 'application/json', 'Origin': WORKER_URL },
    });

    // 2. Request magic link
    const send = await request.post(`${WORKER_URL}/auth/api/sign-in/magic-link`, {
      data: { email: addr },
      headers: { 'Content-Type': 'application/json', 'Origin': WORKER_URL },
    });
    expect(send.status()).toBe(200);

    // 3. Poll sink — email should arrive within 10 s
    const entry = await pollTestInbox(addr);
    expect(entry.subject).toMatch(/sign.in/i);
    expect(entry.url).toBeTruthy();
    expect(entry.url).toContain('/auth/api/');

    // 4. Follow the magic link — should create a session
    const verify = await request.get(entry.url!);
    expect(verify.status()).toBeLessThan(400);
  });

  // ── Email OTP sign-in ───────────────────────────────────────────────────────

  test('email OTP — code delivered and accepted', async ({ request }) => {
    const addr = sinkEmail('otp');

    // 1. Sign up
    await request.post(`${WORKER_URL}/auth/api/sign-up/email`, {
      data: { email: addr, password: 'Ignored1!', name: 'OTP User' },
      headers: { 'Content-Type': 'application/json', 'Origin': WORKER_URL },
    });

    // 2. Request OTP
    const send = await request.post(`${WORKER_URL}/auth/api/email-otp/send-verification-otp`, {
      data: { email: addr, type: 'sign-in' },
      headers: { 'Content-Type': 'application/json', 'Origin': WORKER_URL },
    });
    expect(send.status()).toBe(200);

    // 3. Poll sink
    const entry = await pollTestInbox(addr);
    expect(entry.otp).toMatch(/^\d{6}$/);

    // 4. Verify OTP
    const verify = await request.post(`${WORKER_URL}/auth/api/sign-in/email-otp`, {
      data: { email: addr, otp: entry.otp },
      headers: { 'Content-Type': 'application/json', 'Origin': WORKER_URL },
    });
    expect(verify.status()).toBe(200);
    const body = await verify.json();
    expect(body.user?.email).toBe(addr);
  });

  // ── Email verification on sign-up ───────────────────────────────────────────

  test('email verification — link delivered and verifies account', async ({ request }) => {
    const addr = sinkEmail('verify');

    // 1. Sign up (triggers sendVerificationEmail when requireEmailVerification=true)
    //    Currently requireEmailVerification=false in auth.ts — this test documents
    //    the flow for when it is enabled. It still verifies the email is delivered.
    await request.post(`${WORKER_URL}/auth/api/sign-up/email`, {
      data: { email: addr, password: 'Verify1!', name: 'Verify User' },
      headers: { 'Content-Type': 'application/json', 'Origin': WORKER_URL },
    });

    // 2. Request verification email explicitly
    const send = await request.post(`${WORKER_URL}/auth/api/send-verification-email`, {
      data: { email: addr },
      headers: { 'Content-Type': 'application/json', 'Origin': WORKER_URL },
    });
    expect(send.status()).toBe(200);

    // 3. Poll sink
    const entry = await pollTestInbox(addr);
    expect(entry.subject).toMatch(/verif/i);
    expect(entry.url).toBeTruthy();

    // 4. Follow the verification link
    const verify = await request.get(entry.url!);
    expect(verify.status()).toBeLessThan(400);
  });
});
