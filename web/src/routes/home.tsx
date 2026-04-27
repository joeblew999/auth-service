// auth-better/web/src/routes/home.tsx
//
// Protected home page.
// SignedIn — shows navigation cards.
// SignedOut — redirects immediately to sign-in.

import { RedirectToSignIn, SignedIn, SignedOut } from '@daveyplate/better-auth-ui';
import { Link } from 'react-router-dom';

const NAV_CARDS = [
  { to: '/account/settings', label: 'Account Settings', desc: 'Update your name, email, and profile.' },
  { to: '/account/security', label: 'Security', desc: 'Manage password and two-factor auth.' },
  { to: '/account/api-keys', label: 'API Keys', desc: 'Create and revoke API keys.' },
  { to: '/organization', label: 'Organization', desc: 'Manage your teams and members.' },
];

export function Home() {
  return (
    <>
      <SignedIn>
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {NAV_CARDS.map(({ to, label, desc }) => (
            <Link
              key={to}
              to={to}
              className="rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <p className="font-semibold">{label}</p>
              <p className="text-sm text-muted-foreground mt-1">{desc}</p>
            </Link>
          ))}
        </div>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
