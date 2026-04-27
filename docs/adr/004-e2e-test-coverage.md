# ADR-004: E2E Test Coverage

**Status:** Done
**Date:** 2026-04-08
**Depends on:** ADR-002

---

## What is already tested

| Flow | File | Status |
|------|------|--------|
| sign-up (email+password) | auth.spec.ts | ✅ |
| sign-in (email+password) | auth.spec.ts | ✅ |
| sign-out | auth.spec.ts | ✅ |
| forgot password renders | auth.spec.ts | ✅ |
| reset password renders | auth.spec.ts | ✅ |
| UserButton in nav | auth.spec.ts | ✅ |
| account settings page | account.spec.ts | ✅ |
| account update name | account.spec.ts | ✅ |
| account security page | account.spec.ts | ✅ |
| account nav to security | account.spec.ts | ✅ |
| account sessions list | account.spec.ts | ✅ |
| org list renders | organization.spec.ts | ✅ |
| create org via UI | organization.spec.ts | ✅ |
| org members tab | organization.spec.ts | ✅ |
| org settings page | organization.spec.ts | ✅ |
| username sign-up + sign-in via username | auth.spec.ts | ✅ |
| anonymous sign-in (isAnonymous flag) | auth.spec.ts | ✅ |
| anonymous → real account upgrade | auth.spec.ts | ✅ |
| multiSession: two sign-ins = two sessions | account.spec.ts | ✅ |
| apiKey: create via UI | account.spec.ts | ✅ |

---

## Upstream source references — copy these patterns, do not reinvent

| Plugin | Upstream test file | Key test cases |
|--------|-------------------|----------------|
| username | `.src/better-auth/packages/better-auth/src/plugins/username/username.test.ts` | "should sign up with username" (line 22), "should sign-in with username" (line 44) |
| multiSession | `.src/better-auth/packages/better-auth/src/plugins/multi-session/multi-session.test.ts` | "should list all device sessions" (line 69) |
| apiKey | `.src/better-auth/packages/api-key/src/api-key.test.ts` | "should successfully create API keys from client with headers" (line 53) |
| anonymous | `.src/better-auth/packages/better-auth/src/plugins/anonymous/anon.test.ts` | "should sign in anonymously" (line 101), "link anonymous user account" (line 116) |
| e2e pattern | `.src/better-auth/e2e/integration/vanilla-node/e2e/test.spec.ts` | `window.authClient` via `page.evaluate` pattern |

---

## What needs tests (testable via Playwright)

### username sign-in

**Route:** `/auth/sign-in` and `/auth/sign-up`

**How it works:**
- `providers.tsx` sets `credentials={{ username: true, usernameRequired: false }}`
- Sign-up form shows an optional username field alongside email
- Sign-in with username uses a **separate method**: `authClient.signIn.username({ username, password })`
  (NOT `signIn.email()` with a username field — confirmed from upstream `username.test.ts` line 45)
- Plugin enabled: `username()` in `worker/src/plugins.ts`

**Test plan:**
1. Sign up via `window.authClient.signUp.email({ email, password, name, username })` — username is extra field
2. Sign out via `window.authClient.signOut()`
3. Sign in via `window.authClient.signIn.username({ username, password })` in page.evaluate
4. Assert no error returned and session exists

**Note:** This is a programmatic test via `window.authClient` — no UI form interaction needed
since the sign-in method is a separate client call, not the email form with a username field.

**File:** `auth.spec.ts`

---

### multiSession

**Route:** `/account/security`

**How it works:**
- `multiSession()` plugin enabled server-side, `multiSession` prop set in `providers.tsx`
- Sessions list is rendered on the security page
- Each session shows "Current Session" or IP address + OS/browser

**Test plan:**
1. Create user
2. Sign in (session 1) — verify on security page, sessions card visible
3. In same browser context, sign in again with same credentials (session 2)
4. Navigate to `/account/security`
5. Assert sessions card shows more than one session (or "Current Session" text visible)

**Note:** `multiSessionClient` allows multiple active sessions — signing in again adds a
session rather than replacing it. No second browser context needed.

**File:** `account.spec.ts`

---

### apiKey

**Route:** `/account/api-keys`

**How it works:**
- `apiKey()` plugin enabled server-side, `apiKeyClient()` in auth-client.ts
- `/account/api-keys` route renders API key management UI (confirmed in `home.tsx`)
- UI has: "Create API Key" button → dialog with Name field + Expiry dropdown → created key displayed

**Test plan:**
1. Create user, sign in
2. Navigate to `/account/api-keys`
3. Assert "Create API Key" button visible
4. Click it, assert dialog opens
5. Fill name field
6. Click submit
7. Assert key appears in list (masked format `prefix******`)

**File:** `account.spec.ts`

---

### anonymous

**Route:** n/a — no UI button exists for anonymous sign-in

**How it works:**
- `anonymous()` plugin enabled server-side, `anonymousClient()` in auth-client.ts
- No UI element triggers it — must call `window.authClient.signIn.anonymous()` via `page.evaluate`
- Anonymous session can be "upgraded" to a real account by signing up

**Test plan (anonymous session):**
1. Navigate to `/`
2. Call `window.authClient.signIn.anonymous()` via page.evaluate
3. Assert no error returned
4. Call `window.authClient.getSession()` — assert session exists with `user.isAnonymous === true`

**Test plan (upgrade anonymous → real account):**
1. Create anonymous session (as above)
2. Call `window.authClient.signUp.email()` with real credentials
3. Assert no error
4. Assert session user is no longer anonymous

**File:** `auth.spec.ts`

---

## What is NOT e2e testable

| Plugin | Reason |
|--------|--------|
| magicLink | URL logged to worker console — needs log capture mid-test |
| emailOTP | Code logged to worker console — same problem |
| twoFactor | Needs programmatic TOTP generation + QR secret capture |
| passkey | Requires hardware/biometrics |
| bearer / jwt / admin / oneTimeToken | API-only, no UI |

These belong in ADR-005 (worker unit tests with `testUtils` plugin).

---

## Confirmed answers (from .src/better-auth source)

1. **username sign-up**: `signUp.email({ email, password, name, username })` — pass `username`
   as an extra field. Plugin intercepts `/sign-up/email` and handles it. Source: `username/index.ts`.

2. **multiSession**: Signing in again CREATES a new session (not replace). `listDeviceSessions()`
   returns 2 after signing in twice. Source: `multi-session/index.ts` lines 342-352.

3. **anonymous user object**: `user.isAnonymous === true` after `signIn.anonymous()`.
   Method is `window.authClient.signIn.anonymous()`. Source: `anonymous/types.ts`.
