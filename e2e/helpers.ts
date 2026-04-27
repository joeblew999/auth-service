// auth-better/e2e/helpers.ts
//
// Single source of truth for test helpers and URL config.
// All spec files import from here — nothing is duplicated.
//
// URL resolution order (most → least specific):
//   1. WORKER_URL / WEB_URL env vars  (set by mise tasks for wrangler/prod modes)
//   2. AUTH_BETTER_PORT / AUTH_BETTER_WEB_PORT  (set by mise.toml [env] for local dev)
//   3. Hardcoded fallbacks              (only if running outside mise)

import { expect } from '@playwright/test';

export const WORKER_URL =
  process.env.WORKER_URL ??
  `http://127.0.0.1:${process.env.AUTH_BETTER_PORT ?? '8792'}`;

export const email = (label: string) => `${label}-${Date.now()}@test.dev`;

// All tests use this single test password. It MUST satisfy:
//   - not in HaveIBeenPwned breach corpus (the haveIBeenPwned plugin
//     blocks compromised passwords on signup / change / reset)
//   - >= 8 chars (Better Auth's default minimum)
//   - mixed case + digit + symbol (matches typical strength UI hints)
// 'Password123!' was the old fixture — that one IS breached and now fails.
export const TEST_PASSWORD = 'Tx9k!Pn2vMrQ8wL3ZcEhYsBfDjGuV6N4';

// ── Email test sink helpers (ADR-007) ─────────────────────────────────────────
// Requires AUTH_TEST_SINK_ENABLED=true in the Worker (dev only) and the CF
// Email Routing catch-all for *@test.ubuntusoftware.net → auth-better-worker.

export const TEST_SINK_DOMAIN = 'test.ubuntusoftware.net';
export const sinkEmail = (label: string) => `${label}-${Date.now()}@${TEST_SINK_DOMAIN}`;

export interface InboxEntry {
  subject: string;
  url: string | null;
  otp: string | null;
  receivedAt: number;
}

/**
 * Poll GET /auth/test/inbox until an email for `address` appears or timeout.
 * Throws if the sink is disabled (403) or nothing arrives within timeoutMs.
 */
export async function pollTestInbox(
  address: string,
  timeoutMs = 10_000,
  workerUrl = WORKER_URL,
): Promise<InboxEntry> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(
      `${workerUrl}/auth/test/inbox?email=${encodeURIComponent(address)}`,
    );
    if (res.status === 403) throw new Error('pollTestInbox: sink disabled (AUTH_TEST_SINK_ENABLED not set)');
    if (res.ok) {
      const data = await res.json() as { found: boolean } & InboxEntry;
      if (data.found) return data;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`pollTestInbox: no email for ${address} within ${timeoutMs}ms`);
}

// Creates a user via window.authClient in the browser — same origin, real auth
// client, no CSRF hacks. Matches the pattern in better-auth's own e2e tests.
// Signs out afterwards so the browser starts unauthenticated for the actual test.
export async function createUser(page: any, e: string) {
  await page.goto('/');
  const err = await page.evaluate(async (creds: any) => {
    const res = await (window as any).authClient.signUp.email(creds);
    return res.error ?? null;
  }, { email: e, password: TEST_PASSWORD, name: 'Test User' });
  if (err) throw new Error(`createUser failed: ${JSON.stringify(err)}`);
  await page.evaluate(async () => (window as any).authClient.signOut());
}

export async function signInViaUI(page: any, e: string) {
  await page.goto('/auth/sign-in');
  await page.locator('input[name="email"]').fill(e);
  await page.locator('input[name="password"]').fill(TEST_PASSWORD);

  // Wait for the sign-in API response in parallel with the form submit so we
  // don't race. daveyplate 3.4.0 returns 200 + session cookie but does NOT
  // auto-navigate to redirectTo (URL just gains '?redirectTo=%2F'). So we
  // assert the API succeeded, then navigate ourselves.
  const [resp] = await Promise.all([
    page.waitForResponse((r: any) => r.url().includes('/sign-in/email') && r.request().method() === 'POST', { timeout: 10000 }),
    page.getByRole('button', { name: /^login$/i }).click(),
  ]);
  expect(resp.status(), 'sign-in API should return 200').toBe(200);

  await page.goto('/');
  await expect(page).not.toHaveURL(/sign-in/);
}
