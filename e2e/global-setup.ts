// auth-better/e2e/global-setup.ts
//
// Runs once before all tests — migrates the DB.
// Replaces the per-spec beforeAll migrate calls.

import { WORKER_URL } from './helpers';

export default async function globalSetup() {
  const res = await fetch(`${WORKER_URL}/auth/migrate`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>');
    throw new Error(`migrate failed: ${res.status} — ${body}`);
  }
}
