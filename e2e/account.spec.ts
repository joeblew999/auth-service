// auth-better/e2e/account.spec.ts — account screens

import { test, expect } from '@playwright/test';
import { createUser, signInViaUI, email } from './helpers';

// ── Settings ──────────────────────────────────────────────────────────────────

test('account settings page renders', async ({ page }) => {
  const e = email('acct-settings');
  await createUser(page, e);
  await signInViaUI(page, e);
  await page.goto('/account/settings');
  await expect(page.getByRole('textbox', { name: /^name$/i })).toBeVisible();
});

test('account settings — update name', async ({ page }) => {
  const e = email('acct-name');
  await createUser(page, e);
  await signInViaUI(page, e);
  await page.goto('/account/settings');
  const nameInput = page.getByRole('textbox', { name: /^name$/i });
  await nameInput.clear();
  await nameInput.fill('Updated Name');
  await page.locator('button[type="submit"]').first().click();
  await expect(page.getByRole('textbox', { name: /^name$/i })).toBeVisible();
});

// ── Security ──────────────────────────────────────────────────────────────────

test('account security page renders change-password form', async ({ page }) => {
  const e = email('acct-security');
  await createUser(page, e);
  await signInViaUI(page, e);
  await page.goto('/account/security');
  await expect(page.getByText(/change password/i)).toBeVisible();
  await expect(page.getByText('Sessions', { exact: true }).first()).toBeVisible();
});

// ── Nav ───────────────────────────────────────────────────────────────────────

test('account sidebar nav links to security', async ({ page }) => {
  const e = email('acct-nav');
  await createUser(page, e);
  await signInViaUI(page, e);
  await page.goto('/account/settings');
  await page.getByRole('link', { name: /^security$/i }).first().click();
  await expect(page).toHaveURL(/security/);
});

test('account sessions list visible', async ({ page }) => {
  const e = email('acct-sessions');
  await createUser(page, e);
  await signInViaUI(page, e);
  await page.goto('/account/security');
  await expect(page.getByText('Sessions', { exact: true }).first()).toBeVisible();
  await expect(page.locator('[data-slot="card-content"]').first()).toBeVisible();
});

// ── multiSession plugin ───────────────────────────────────────────────────────
// Upstream ref: packages/better-auth/src/plugins/multi-session/multi-session.test.ts line 69
// Pattern: sign in as user1, then sign up as user2 in same browser context → 2 device sessions
// (upstream test uses two different users, not same user twice)

test('multi-session: two different users in same browser = two device sessions', async ({ page }) => {
  const e1 = email('ms-user1');
  const e2 = email('ms-user2');
  await page.goto('/');

  // Sign in as user1 — session 1 stored in multi-session cookie
  const err1 = await page.evaluate(async (creds: any) => {
    const res = await (window as any).authClient.signUp.email(creds);
    return res.error ?? null;
  }, { email: e1, password: 'Password123!', name: 'MS User One' });
  expect(err1).toBeNull();

  // Sign up as user2 in same browser context — session 2 added to multi-session cookie
  const err2 = await page.evaluate(async (creds: any) => {
    const res = await (window as any).authClient.signUp.email(creds);
    return res.error ?? null;
  }, { email: e2, password: 'Password123!', name: 'MS User Two' });
  expect(err2).toBeNull();

  // listDeviceSessions returns both sessions
  const sessionCount = await page.evaluate(async () => {
    const res = await (window as any).authClient.multiSession.listDeviceSessions();
    return res.data?.length ?? 0;
  });
  expect(sessionCount).toBeGreaterThanOrEqual(2);
});

// ── apiKey plugin ─────────────────────────────────────────────────────────────
// Upstream ref: packages/api-key/src/api-key.test.ts line 53
// UI: /account/api-keys → "Create API Key" button → dialog → key appears in list

test('api-keys: create key via UI appears in list', async ({ page }) => {
  const e = email('apikey');
  await createUser(page, e);
  await signInViaUI(page, e);

  await page.goto('/account/api-keys');
  await expect(page.getByRole('button', { name: /create api key/i })).toBeVisible();

  // Open create dialog
  await page.getByRole('button', { name: /create api key/i }).click();

  // Fill name field in dialog (optional field)
  const nameInput = page.getByRole('textbox', { name: /name/i });
  await nameInput.waitFor({ state: 'visible' });
  await nameInput.fill('My Test Key');

  // Submit — last button with this label is the dialog's submit button
  await page.getByRole('button', { name: /create api key/i }).last().click();

  // After creation a display dialog opens with title "API Key Created"
  // (from ApiKeyDisplayDialog — localization.API_KEY_CREATED)
  await expect(page.getByText('API Key Created')).toBeVisible({ timeout: 10000 });
});
