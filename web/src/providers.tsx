// auth-better/web/src/providers.tsx
//
// AuthUIProvider — all plugin flags match the worker's enabled plugins (ADR-002).
// NavLink per official React integration docs.

import { AuthUIProvider } from '@daveyplate/better-auth-ui';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { authClient } from './auth-client';

// AuthUIProvider passes href; React Router NavLink expects to.
// This adapter bridges them so all internal navigation works correctly.
function RouterLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return <NavLink to={href} className={className}>{children}</NavLink>;
}

// Cloudflare Turnstile site key — public (safe to bake into the bundle).
// Set at build time via `VITE_TURNSTILE_SITE_KEY` (mise install pulls it
// from fnox; production builds bake it in via deploy:web).
// When unset, daveyplate skips the widget render → server captcha plugin
// is also off (gated on TURNSTILE_SECRET_KEY) → sign-in works without
// captcha. Both halves activate together once `mise run cf:turnstile:create`
// has been run AND the worker is redeployed.
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

export function Providers({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <AuthUIProvider
      authClient={authClient}
      navigate={navigate}
      Link={RouterLink}
      redirectTo="/"
      avatar
      multiSession
      magicLink
      emailOTP
      passkey
      twoFactor={['totp']}
      apiKey
      credentials={{ forgotPassword: true, username: true, usernameRequired: false }}
      deleteUser
      teams
      organization
      {...(TURNSTILE_SITE_KEY && {
        captcha: {
          provider: 'cloudflare-turnstile' as const,
          siteKey: TURNSTILE_SITE_KEY,
        },
      })}
    >
      {children}
    </AuthUIProvider>
  );
}
