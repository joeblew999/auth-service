// auth-better/web/src/auth-client.ts
//
// Full plugin parity per ADR-002.
// Copied from .src/better-auth-ui/src/types/auth-client.ts
// minus oneTapClient (requires Google clientId) and genericOAuthClient (requires OAuth provider).
//
// No baseURL — uses current origin (http://localhost:5174).
// Vite proxies /auth/api/* → http://localhost:8792.
// basePath must match the server's basePath in auth-better/worker/src/auth.ts.

import { apiKeyClient } from '@better-auth/api-key/client';
import { passkeyClient } from '@better-auth/passkey/client';
import {
  anonymousClient,
  emailOTPClient,
  magicLinkClient,
  multiSessionClient,
  organizationClient,
  twoFactorClient,
  usernameClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  basePath: '/auth/api',
  plugins: [
    apiKeyClient(),
    passkeyClient(),
    multiSessionClient(),
    anonymousClient(),
    usernameClient(),
    magicLinkClient(),
    emailOTPClient(),
    twoFactorClient(),
    organizationClient({
      teams: {
        enabled: true,
      },
    }),
  ],
});

export type AuthClient = typeof authClient;
export type Session = AuthClient['$Infer']['Session']['session'];
export type User = AuthClient['$Infer']['Session']['user'];
