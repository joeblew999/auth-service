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
    >
      {children}
    </AuthUIProvider>
  );
}
