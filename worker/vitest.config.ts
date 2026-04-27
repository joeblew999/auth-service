// worker/vitest.config.ts
//
// Runs worker unit tests inside real workerd runtime via @cloudflare/vitest-pool-workers.
//
// Key: miniflare.assets = undefined
//   wrangler.toml has [assets] directory = "../web/dist" for production SPA serving.
//   Unit tests don't need the SPA. Without this override, Miniflare would try to read
//   web/dist (doesn't exist in fresh checkout) and error before any test runs.
//
// See: docs/adr/003-project-structure.md (Option D)
//
// Note: @cloudflare/vitest-pool-workers v0.14+ uses cloudflareTest() as a plugin
// (API changed from v0.12 which used defineWorkersConfig from '/config' subpath)

import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      singleWorker: true,
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        // Stub the ASSETS binding — web/dist not needed for unit tests
        assets: undefined,
      },
    }),
  ],
  test: {
    setupFiles: ['./src/test/setup.ts'],
  },
});
