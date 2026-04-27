// worker/src/test/setup.ts
//
// Runs once before all worker unit tests.
// Uses SELF.fetch() — calls the worker itself inside the workerd runtime.
// This is the correct way to run migrations in @cloudflare/vitest-pool-workers.

import { SELF } from 'cloudflare:test';
import { beforeAll } from 'vitest';

beforeAll(async () => {
  // SELF.fetch hostname is irrelevant — workerd intercepts all requests to the worker.
  const res = await SELF.fetch('http://worker/auth/migrate', { method: 'POST' });
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>');
    throw new Error(`migrate failed: ${res.status} — ${body}`);
  }
});
