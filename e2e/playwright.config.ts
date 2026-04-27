import { defineConfig, devices } from '@playwright/test';

// URL defaults derived from mise.toml [env] vars.
// Override by passing WEB_URL explicitly (wrangler or prod modes).
const WEB_URL = process.env.WEB_URL ??
  `http://localhost:${process.env.AUTH_BETTER_WEB_PORT ?? '5174'}`;

const WORKERS = parseInt(process.env.WORKERS ?? '4');

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  globalSetup: './global-setup.ts',
  fullyParallel: WORKERS > 1,
  workers: WORKERS,
  timeout: 30_000,
  expect: { timeout: 15_000 },
  retries: 0,

  use: {
    baseURL: WEB_URL,
    headless: true,
    storageState: undefined,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--disable-save-password-bubble', '--disable-features=PasswordManagerOnboarding'],
        },
      },
    },
  ],

  reporter: [['list'], ['html', { open: 'never' }]],
});
