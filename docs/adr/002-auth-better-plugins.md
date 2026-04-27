# ADR-002: Plugin Parity — Backend and Frontend

**Status:** Done
**Date:** 2026-04-08
**Depends on:** ADR-001

---

## Source of truth

| Side | File |
|------|------|
| Frontend | `web/src/auth-client.ts` |
| Backend | `worker/src/plugins.ts` |

---

## Plugin parity table

| Plugin | Frontend client | Backend server | Status |
|--------|----------------|---------------|--------|
| twoFactor | `twoFactorClient` | `twoFactor` | ✅ |
| magicLink | `magicLinkClient` | `magicLink` | ✅ |
| emailOTP | `emailOTPClient` | `emailOTP` | ✅ |
| multiSession | `multiSessionClient` | `multiSession` | ✅ |
| anonymous | `anonymousClient` | `anonymous` | ✅ |
| organization | `organizationClient({ teams: { enabled: true } })` | `organization({ teams: { enabled: true } })` | ✅ |
| username | `usernameClient` | `username` | ✅ |
| apiKey | `apiKeyClient` | `apiKey` | ✅ |
| passkey | `passkeyClient` | `passkey` | ✅ |
| oneTap | — | — | ⛔ skip — requires Google clientId |
| genericOAuth | — | — | ⛔ skip — requires OAuth provider credentials |

---

## What is skipped and why

| Plugin | Reason |
|--------|--------|
| `oneTap` | Requires Google `clientId` to verify JWT — no credentials in dev |
| `genericOAuth` | Requires at least one OAuth provider with `clientId` + `clientSecret` |

Both can be added when real credentials exist.

---

## Test coverage gaps (ADR-003 scope)

Plugin parity is complete. Test coverage is not — these plugins are wired up but
have no e2e tests yet:

| Plugin | Testable now | Notes |
|--------|-------------|-------|
| username | ✅ yes | sign up / sign in via username field |
| multiSession | ✅ yes | sign in twice, list sessions |
| apiKey | ✅ yes | create key in account settings |
| anonymous | ✅ yes | create guest session, upgrade on sign-up |
| magicLink | ⚠️ needs log capture | URL logged to worker console |
| emailOTP | ⚠️ needs log capture | code logged to worker console |
| twoFactor | ⚠️ needs TOTP generation | requires programmatic TOTP |
| passkey | ❌ not e2e testable | requires hardware/biometrics |
| bearer / jwt / admin / oneTimeToken | ❌ API-only | no UI, not e2e testable |
