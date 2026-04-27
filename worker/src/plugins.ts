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
// Cloudflare Email Service — built-in, no npm install. The binding's
// .send() method requires an EmailMessage instance wrapping a real MIME
// message (NOT a JSON envelope — the {to:[{email}], from, subject}
// shape that ADR-006 documented was never the actual API).
import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';
import type { Bindings } from './auth';

export const SOCIAL_PROVIDERS = {
  // Uncomment + add env vars to enable:
  // google:  { clientId: '', clientSecret: '' },
  // github:  { clientId: '', clientSecret: '' },
} as const;

// Shared email helper — used by plugins and emailVerification in auth.ts.
// Uses CF Email Service binding when available; logs to console otherwise.
//
// CF send_email expects an EmailMessage(from, to, rawMime). Build the MIME
// via mimetext so we get proper headers + multipart text+html.
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

  const msg = createMimeMessage();
  msg.setSender({
    addr: env.AUTH_EMAIL_FROM,
    name: env.AUTH_EMAIL_FROM_NAME ?? 'Auth',
  });
  msg.setRecipient(to);
  msg.setSubject(subject);
  msg.addMessage({ contentType: 'text/plain', data: text });
  msg.addMessage({ contentType: 'text/html', data: html });

  const email = new EmailMessage(env.AUTH_EMAIL_FROM, to, msg.asRaw());
  await env.SEND_EMAIL.send(email);
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
