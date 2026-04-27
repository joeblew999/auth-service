// auth-better/web/src/main.tsx
//
// Route structure per official better-auth-ui React integration docs:
//   /auth/:pathname  → AuthRoute  — sign-in, sign-up, forgot-password, etc.
//   /account/:pathname? → AccountRoute — settings, security, etc. (auth-protected)
//   /organization/*  → OrganizationRoute
//   /               → Home (redirects to sign-in if not signed in)

import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { authClient } from './auth-client';
import { Layout } from './layout';
import { Providers } from './providers';
import { AccountRoute } from './routes/account';
import { AuthRoute } from './routes/auth';
import { Home } from './routes/home';
import { OrganizationRoute } from './routes/organization';

// Expose authClient on window so Playwright tests can call it from page.evaluate()
// — same origin, real browser context, no CSRF hacks needed.
(window as any).authClient = authClient;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Providers>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/auth/:pathname" element={<AuthRoute />} />
            <Route path="/account" element={<AccountRoute />} />
            <Route path="/account/:pathname" element={<AccountRoute />} />
            <Route path="/organization" element={<OrganizationRoute />} />
            <Route path="/organization/:pathname" element={<OrganizationRoute />} />
          </Route>
        </Routes>
      </Providers>
    </BrowserRouter>
  </StrictMode>
);
