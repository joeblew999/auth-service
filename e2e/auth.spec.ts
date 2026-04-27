// auth-better/e2e/auth.spec.ts — auth flows

import { test, expect } from '@playwright/test';
import { createUser, signInViaUI, email } from './helpers';

// ── Sign-up ───────────────────────────────────────────────────────────────────

test('sign-up with email + password', async ({ page }) => {
  const e = email('signup');
  await page.goto('/auth/sign-up');
  await page.locator('input[name="name"]').fill('Test User');
  await page.locator('input[name="email"]').fill(e);
  await page.getByRole('textbox', { name: /password/i }).first().fill('Password123!');
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/sign-up/);
});

// ── Sign-in ───────────────────────────────────────────────────────────────────

test('sign-in with email + password', async ({ page }) => {
  const e = email('signin');
  await createUser(page, e);
  await signInViaUI(page, e);
});

// ── Sign-out ──────────────────────────────────────────────────────────────────

test('sign-out', async ({ page }) => {
  const e = email('signout');
  await createUser(page, e);
  await signInViaUI(page, e);
  await page.goto('/auth/sign-out');
  await expect(page).toHaveURL(/sign-in/);
});

// ── Forgot / reset password ───────────────────────────────────────────────────

test('forgot password screen renders', async ({ page }) => {
  await page.goto('/auth/forgot-password');
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});

test('reset password page renders', async ({ page }) => {
  await page.goto('/auth/reset-password');
  await expect(page.getByRole('textbox', { name: /password/i }).first()).toBeVisible();
});

test('UserButton visible in nav when signed in', async ({ page }) => {
  const e = email('userbutton');
  await createUser(page, e);
  await signInViaUI(page, e);
  await expect(page.locator('header').getByRole('button').first()).toBeVisible();
});

// ── Username plugin ───────────────────────────────────────────────────────────
// Upstream ref: packages/better-auth/src/plugins/username/username.test.ts line 22, 44
// signIn.username() is a SEPARATE method — not signIn.email() with a username field

test('sign-up with username field, then sign-in via username', async ({ page }) => {
  const e = email('username');
  const uname = `user_${Date.now()}`;

  await page.goto('/');

  // Sign up — username is an extra field on signUp.email (plugin intercepts)
  const signUpErr = await page.evaluate(async (creds: any) => {
    const res = await (window as any).authClient.signUp.email(creds);
    return res.error ?? null;
  }, { email: e, password: 'Password123!', name: 'Username User', username: uname });
  expect(signUpErr).toBeNull();

  // Sign out before testing sign-in
  await page.evaluate(async () => (window as any).authClient.signOut());

  // Sign in via username — separate client method, not the email form
  const result = await page.evaluate(async (creds: any) => {
    const res = await (window as any).authClient.signIn.username(creds);
    return { error: res.error ?? null, hasToken: !!res.data?.token };
  }, { username: uname, password: 'Password123!' });

  expect(result.error).toBeNull();
  expect(result.hasToken).toBe(true);
});

// ── Anonymous plugin ──────────────────────────────────────────────────────────
// Upstream ref: packages/better-auth/src/plugins/anonymous/anon.test.ts line 101, 116
// signIn.anonymous() → user.isAnonymous === true

test('anonymous sign-in sets isAnonymous on session', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const res = await (window as any).authClient.signIn.anonymous();
    if (res.error) return { error: res.error, isAnonymous: null };
    const session = await (window as any).authClient.getSession();
    return { error: null, isAnonymous: session.data?.user.isAnonymous ?? null };
  });

  expect(result.error).toBeNull();
  expect(result.isAnonymous).toBe(true);
});

test('anonymous account upgrades to real account via signUp.email', async ({ page }) => {
  const e = email('anon-upgrade');
  await page.goto('/');

  // Start as anonymous
  await page.evaluate(async () => (window as any).authClient.signIn.anonymous());

  // Upgrade by signing up with real credentials
  const result = await page.evaluate(async (creds: any) => {
    const res = await (window as any).authClient.signUp.email(creds);
    if (res.error) return { error: res.error, isAnonymous: null };
    const session = await (window as any).authClient.getSession();
    return { error: null, isAnonymous: session.data?.user.isAnonymous ?? null };
  }, { email: e, password: 'Password123!', name: 'Upgraded User' });

  expect(result.error).toBeNull();
  // After upgrade, user is no longer anonymous (null or false)
  expect(result.isAnonymous).toBeFalsy();
});
