#!/usr/bin/env bash
# Proves the Phase 1 SSO + RBAC chain end-to-end without the UI.
#
# Flow:
#   1. Sign up a fresh user against auth.ubuntusoftware.net   → captures session cookie
#   2. Create an organization                                 → user becomes owner
#   3. Call /api/me on the consumer (ifc-lite)                → identity crosses Service Binding
#   4. Call /api/me/org on the consumer                       → role=owner returns
#
# This proves: cross-subdomain cookie + Service Binding + organization plugin
# + getOrgMember() helper all work together. If this passes, any consumer
# Worker on *.ubuntusoftware.net can do role-based authz against shared SSO.
#
# Usage:
#   bash scripts/prove-sso-rbac.sh              # against production
#   AUTH_URL=... CONSUMER_URL=... bash scripts/prove-sso-rbac.sh

set -eu

AUTH_URL="${AUTH_URL:-https://auth.ubuntusoftware.net}"
CONSUMER_URL="${CONSUMER_URL:-https://ifc-lite.ubuntusoftware.net}"
PASSWORD='Tx9k!Pn2vMrQ8wL3ZcEhYsBfDjGuV6N4'   # matches e2e/helpers.ts TEST_PASSWORD
EMAIL="prove-$(date +%s)@test.ubuntusoftware.net"
ORG_SLUG="proveorg-$(date +%s)"
COOKIE_JAR="$(mktemp -t prove-cookies.XXXXXX)"
trap 'rm -f "$COOKIE_JAR"' EXIT

say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }

# 1. ─────────────────────────────────────────────────────────────────────────
say "1. Sign up $EMAIL at $AUTH_URL"
SIGNUP_BODY=$(curl -sS -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -H "Origin: $AUTH_URL" \
  -X POST "$AUTH_URL/auth/api/sign-up/email" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Prove User\"}")
echo "$SIGNUP_BODY" | jq . >/dev/null 2>&1 || die "sign-up did not return JSON: $SIGNUP_BODY"
echo "$SIGNUP_BODY" | jq -e '.user.id' >/dev/null || die "sign-up failed: $SIGNUP_BODY"
USER_ID=$(echo "$SIGNUP_BODY" | jq -r '.user.id')
ok "user created: $USER_ID"

# 2. ─────────────────────────────────────────────────────────────────────────
say "2. Create organization slug=$ORG_SLUG"
ORG_BODY=$(curl -sS -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -H "Origin: $AUTH_URL" \
  -X POST "$AUTH_URL/auth/api/organization/create" \
  -d "{\"name\":\"Prove Org\",\"slug\":\"$ORG_SLUG\"}")
echo "$ORG_BODY" | jq -e '.id' >/dev/null || die "org create failed: $ORG_BODY"
ORG_ID=$(echo "$ORG_BODY" | jq -r '.id')
ok "org created: $ORG_ID"

# Better Auth's organization plugin doesn't auto-set the new org as active.
# Set it explicitly so /api/me/org has something to return.
say "2b. Set active organization"
SETACTIVE=$(curl -sS -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -H "Origin: $AUTH_URL" \
  -X POST "$AUTH_URL/auth/api/organization/set-active" \
  -d "{\"organizationId\":\"$ORG_ID\"}")
echo "$SETACTIVE" | jq -e '.id' >/dev/null || die "set-active failed: $SETACTIVE"
ok "active org set"

# 3. ─────────────────────────────────────────────────────────────────────────
say "3. Cross-subdomain identity check: $CONSUMER_URL/api/me"
ME=$(curl -sS -b "$COOKIE_JAR" "$CONSUMER_URL/api/me")
echo "$ME" | jq -e '.id' >/dev/null || die "/api/me failed (cookie did not cross subdomain?): $ME"
ME_ID=$(echo "$ME" | jq -r '.id')
[ "$ME_ID" = "$USER_ID" ] || die "/api/me returned wrong user: got $ME_ID expected $USER_ID"
ok "consumer sees same user via Service Binding"

# 4. ─────────────────────────────────────────────────────────────────────────
say "4. RBAC check: $CONSUMER_URL/api/me/org"
ORG=$(curl -sS -b "$COOKIE_JAR" "$CONSUMER_URL/api/me/org")
echo "$ORG" | jq -e '.role' >/dev/null || die "/api/me/org returned no role: $ORG"
ROLE=$(echo "$ORG" | jq -r '.role')
RET_ORG_ID=$(echo "$ORG" | jq -r '.organizationId')
[ "$ROLE" = "owner" ] || die "expected role=owner, got $ROLE"
[ "$RET_ORG_ID" = "$ORG_ID" ] || die "wrong org returned: got $RET_ORG_ID expected $ORG_ID"
ok "consumer sees role=$ROLE for org $RET_ORG_ID"

printf '\n\033[1;32m✓✓✓ SSO + RBAC chain works end-to-end ✓✓✓\033[0m\n'
printf '   user:  %s\n' "$USER_ID"
printf '   org:   %s\n' "$ORG_ID"
printf '   role:  %s\n' "$ROLE"
