import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Only proxy /auth/api/* to the worker — NOT /auth/sign-in, /auth/sign-up etc.
// Those are client-side SPA routes that Vite must serve as index.html.
//
// Ports from mise.toml [env] — passed via `mise run 2-start` (pitchfork sets env).
const workerPort = process.env.AUTH_BETTER_PORT ?? '8792';
const webPort    = parseInt(process.env.AUTH_BETTER_WEB_PORT ?? '5174');

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: webPort,
    proxy: {
      '/auth/api': {
        target: `http://localhost:${workerPort}`,
        changeOrigin: true,
        // Strip Sec-Fetch-* navigation headers so wrangler dev doesn't serve the
        // SPA index.html fallback for worker routes like /auth/api/reference.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('sec-fetch-mode');
            proxyReq.removeHeader('sec-fetch-dest');
            proxyReq.removeHeader('sec-fetch-site');
          });
        },
      },
    },
  },
});
