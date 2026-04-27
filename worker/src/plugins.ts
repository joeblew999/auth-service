// auth-better/worker/src/plugins.ts
//
// All better-auth plugins — full parity with auth-client.ts per ADR-002.
// Email delivery via CF Email Service binding (ADR-006).
// Falls back to console.log when SEND_EMAIL binding is absent (Phase 1 CI, vitest).

import { apiKey } from '@better-auth/api-key';
import { passkey } from '@better-auth/passkey';
import {
  twoFactor,
  magicLink,
  emailOTP,
  organization,
  admin,
  bearer,
  jwt,
  multiSession,
  anonymous,
  oneTimeToken,
  username,
  openAPI,
} from 'better-auth/plugins';
// Cloudflare Email Service (new, beta) — uses a plain JSON shape via
// `env.SEND_EMAIL.send({ to, from, subject, html, text })`. NOT the
// older Email Routing `cloudflare:email` MIME-based API.
//
// This works for arbitrary external recipients (magic links, OTPs,
// verification — explicitly supported per Cloudflare docs) once the
// sending domain is onboarded under Email Service > Email Sending in
// the CF dashboard, with auto-provisioned SPF + DKIM + DMARC.
//
// Docs: https://developers.cloudflare.com/email-service/examples/email-sending/magic-link/
import type { Bindings } from './auth';

export const SOCIAL_PROVIDERS = {
  // Uncomment + add env vars to enable:
  // google:  { clientId: '', clientSecret: '' },
  // github:  { clientId: '', clientSecret: '' },
} as const;

// Shared email helper — used by plugins and emailVerification in auth.ts.
// Uses the NEW Cloudflare Email Service when SEND_EMAIL binding + onboarded
// domain are present; logs to console otherwise (Phase 1 CI / vitest).
//
// Sends to ARBITRARY external recipients — no destination verification
// needed once the sender domain is onboarded under Email Service > Email
// Sending in the CF dashboard.
export async function sendEmail(
  env: Bindings,
  to: string,
  subject: string,
  text: string,
  html: string,
): Promise<void> {
  if (!env.SEND_EMAIL || !env.AUTH_EMAIL_FROM) {
    console.log(`[email] ${subject} → ${to}\n${text}`);
    return;
  }
  await env.SEND_EMAIL.send({
    to,
    from: env.AUTH_EMAIL_FROM,
    subject,
    html,
    text,
  });
}

export function getPlugins(env: Bindings) {
  return [
    // 2FA — TOTP authenticator app
    twoFactor(),

    // Magic link — click link in email to sign in (ADR-006)
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendEmail(env, email, 'Your sign-in link',
          `Click to sign in: ${url}\n\nExpires in 5 minutes.`,
          `<p><a href="${url}">Click here to sign in</a></p><p>Expires in 5 minutes.</p>`);
      },
    }),

    // Email OTP — 6-digit code (ADR-006)
    emailOTP({
      sendVerificationOTP: async ({ email, otp, type }) => {
        const subject = type === 'sign-in' ? 'Your sign-in code' : 'Your verification code';
        await sendEmail(env, email, subject,
          `Your code: ${otp}\n\nExpires in 10 minutes.`,
          `<p>Your code: <strong style="font-size:1.5em;letter-spacing:0.1em">${otp}</strong></p><p>Expires in 10 minutes.</p>`);
      },
    }),

    // Organizations — teams, roles (owner / admin / member)
    organization({
      teams: {
        enabled: true,
      },
    }),

    // Admin — user management, ban, impersonate
    admin(),

    // Multiple active sessions
    multiSession(),

    // Guest sessions that upgrade on sign-up
    anonymous(),

    // Bearer tokens for CLI / MCP clients
    bearer(),

    // JWT stateless tokens
    jwt(),

    // Short-lived share tokens
    oneTimeToken(),

    // Username login
    username(),

    // API keys
    apiKey(),

    // Passkeys (WebAuthn)
    passkey(),

    // OpenAPI reference UI — /auth/api/reference
    openAPI(),
  ];
}
