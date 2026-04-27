// auth-better/worker/src/auth.ts
//
// Minimal clean better-auth v1.5 instance.
// No zanzo, no filesystem, no domain schema.
// One instance per request — never a singleton.

import { betterAuth } from 'better-auth';
import { SOCIAL_PROVIDERS, getPlugins, sendEmail } from './plugins';

export type Bindings = {
  AUTH_DB: D1Database;
  AUTH_KV: KVNamespace;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  // Dev only — set in wrangler.toml [vars], not in [env.production]
  AUTH_BETTER_WEB_PORT?: string;
  // CF Email Service binding — ADR-006
  // Optional: falls back to console.log when absent (vitest-pool-workers Phase 1 CI)
  SEND_EMAIL?: {
    send(msg: {
      to:      { email: string }[];
      from:    { email: string; name?: string };
      subject: string;
      text:    string;
      html?:   string;
    }): Promise<void>;
  };
  AUTH_EMAIL_FROM?:      string;   // e.g. "noreply@ubuntusoftware.net"
  AUTH_EMAIL_FROM_NAME?: string;   // e.g. "Auth"
  // ADR-007: set in [vars] (dev) only — absent in [env.production] → endpoint returns 403
  AUTH_TEST_SINK_ENABLED?: string;
  // Cross-subdomain SSO: set to ".ubuntusoftware.net" in production so the
  // session cookie spans every *.ubuntusoftware.net consumer Worker. Absent
  // in dev (localhost cookies don't need a domain attribute).
  COOKIE_DOMAIN?: string;
};

export function createAuth(env: Bindings) {
  return betterAuth({
    // D1 — first-class support in better-auth v1.5
    database: env.AUTH_DB,

    baseURL: env.BETTER_AUTH_URL,
    basePath: '/auth/api',
    secret: env.BETTER_AUTH_SECRET,

    // In prod: BETTER_AUTH_URL is the only trusted origin (same-origin SPA).
    // In dev: worker (:8792) and Vite (:AUTH_BETTER_WEB_PORT) are both trusted.
    // localhost and 127.0.0.1 variants needed — Node/browsers resolve either.
    trustedOrigins: (() => {
      const origins = [env.BETTER_AUTH_URL];
      const workerUrl = new URL(env.BETTER_AUTH_URL);
      // Add 127.0.0.1 variant of the worker URL
      origins.push(`${workerUrl.protocol}//127.0.0.1:${workerUrl.port}`);
      // Add Vite dev server if web port is set (dev only)
      if (env.AUTH_BETTER_WEB_PORT) {
        origins.push(`http://localhost:${env.AUTH_BETTER_WEB_PORT}`);
        origins.push(`http://127.0.0.1:${env.AUTH_BETTER_WEB_PORT}`);
      }
      return origins;
    })(),

    // KV — session cache + rate limiting
    secondaryStorage: {
      get: async (key) => {
        const val = await env.AUTH_KV.get(key);
        return val ? JSON.parse(val) : null;
      },
      set: async (key, value, ttl) => {
        await env.AUTH_KV.put(key, JSON.stringify(value), {
          expirationTtl: ttl ?? 86400,
        });
      },
      delete: async (key) => {
        await env.AUTH_KV.delete(key);
      },
    },

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },

    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(env, user.email, 'Verify your email', `Verify: ${url}`,
          `<p><a href="${url}">Verify your email address</a></p>`);
      },
    },

    socialProviders: SOCIAL_PROVIDERS,

    plugins: getPlugins(env),

    // Cross-subdomain SSO. When COOKIE_DOMAIN is set (production), the
    // session cookie is scoped to the parent domain so every consumer
    // Worker on *.ubuntusoftware.net sees the same session via Service
    // Binding's `env.AUTH.fetch(...)` cookie forwarding.
    ...(env.COOKIE_DOMAIN ? {
      advanced: {
        crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN },
      },
    } : {}),
  });
}
