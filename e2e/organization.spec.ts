// auth-better/e2e/organization.spec.ts — organization screens

import { test, expect } from '@playwright/test';
import { createUser, signInViaUI, email } from './helpers';

// ── Organizations list ────────────────────────────────────────────────────────

test('account organizations tab renders create button', async ({ page }) => {
  const e = email('org-list');
  await createUser(page, e);
  await signInViaUI(page, e);
  await page.goto('/account/organizations');
  await expect(page.getByRole('button', { name: /create organization/i })).toBeVisible();
});

// ── Create organization ───────────────────────────────────────────────────────

test('create organization via UI then navigate to org view', async ({ page }) => {
  const e = email('org-create');
  await createUser(page, e);
  await signInViaUI(page, e);
  await page.goto('/account/organizations');
  await page.getByRole('button', { name: /create organization/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const ts = Date.now();
  await page.getByRole('textbox', { name: /^name$/i }).fill(`TestOrg-${ts}`);
  await page.getByRole('textbox', { name: /slug/i }).fill(`testorg-${ts}`);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/organization');
  await expect(page.getByText('Members', { exact: true })).toBeVisible();
});

test('org members tab renders after org created', async ({ page }) => {
  const e = email('org-members');
  await createUser(page, e);
  await signInViaUI(page, e);
  await page.goto('/account/organizations');
  await page.getByRole('button', { name: /create organization/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const ts = Date.now();
  await page.getByRole('textbox', { name: /^name$/i }).fill(`OrgM-${ts}`);
  await page.getByRole('textbox', { name: /slug/i }).fill(`orgm-${ts}`);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/organization/members');
  await expect(page).toHaveURL(/members/);
  await expect(page.getByRole('link', { name: /^members$/i }).first()).toBeVisible();
});

// ── Org settings ──────────────────────────────────────────────────────────────

test('org settings page shows name card', async ({ page }) => {
  const e = email('org-settings');
  await createUser(page, e);
  await signInViaUI(page, e);
  await page.goto('/account/organizations');
  await page.getByRole('button', { name: /create organization/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const ts = Date.now();
  await page.getByRole('textbox', { name: /^name$/i }).fill(`Org-${ts}`);
  await page.getByRole('textbox', { name: /slug/i }).fill(`org-${ts}`);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.goto('/organization/settings');
  await expect(page.getByText(/organization/i).first()).toBeVisible();
});
