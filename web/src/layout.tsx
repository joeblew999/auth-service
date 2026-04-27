// auth-better/web/src/layout.tsx
//
// App shell — nav bar with user + org components, content area.
// UserButton/OrganizationSwitcher handle their own loading states internally.

import { OrganizationSwitcher, UserButton } from '@daveyplate/better-auth-ui';
import { Link, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';

export function Layout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-4 px-4">
          <Link to="/" className="font-semibold tracking-tight">
            Auth Better
          </Link>
          <div className="flex-1" />
          <a
            href="/auth/api/reference"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            API Reference
          </a>
          <OrganizationSwitcher />
          <UserButton size="icon" />
        </div>
      </header>
      <main className="mx-auto max-w-screen-xl px-4 py-8">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
