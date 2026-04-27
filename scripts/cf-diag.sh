#!/usr/bin/env bash
# Direct CF API probe — verifies the env's token + account ID can reach
# the exact endpoints wrangler uses. Run identically local + CI to
# isolate token-vs-wrangler-vs-network issues.
#
# Reads:
#   ENV                    (default "production")
#   CLOUDFLARE_API_TOKEN   (env first, fnox fallback)
#   CLOUDFLARE_ACCOUNT_ID  (env first, fnox fallback)

set -eu

ENV="${ENV:-production}"
CFG="config/${ENV}.env"
if [ ! -f "$CFG" ]; then
  echo "✗ $CFG not found"
  exit 1
fi

# shellcheck disable=SC1090
set -a
. "$CFG"
set +a

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  CLOUDFLARE_API_TOKEN=$(fnox get CLOUDFLARE_API_TOKEN 2>/dev/null || true)
fi
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  CLOUDFLARE_ACCOUNT_ID=$(fnox get CLOUDFLARE_ACCOUNT_ID 2>/dev/null || true)
fi
[ -n "$CLOUDFLARE_API_TOKEN" ]  || { echo "✗ CLOUDFLARE_API_TOKEN missing";  exit 1; }
[ -n "$CLOUDFLARE_ACCOUNT_ID" ] || { echo "✗ CLOUDFLARE_ACCOUNT_ID missing"; exit 1; }

# Strip any trailing CR/LF from the secrets (sync-bug suspect).
CLOUDFLARE_API_TOKEN=$(printf '%s' "$CLOUDFLARE_API_TOKEN" | tr -d '\r\n')
CLOUDFLARE_ACCOUNT_ID=$(printf '%s' "$CLOUDFLARE_ACCOUNT_ID" | tr -d '\r\n')

TLEN=$(printf '%s' "$CLOUDFLARE_API_TOKEN"  | wc -c | tr -d ' ')
ALEN=$(printf '%s' "$CLOUDFLARE_ACCOUNT_ID" | wc -c | tr -d ' ')

CF="https://api.cloudflare.com/client/v4"
H="Authorization: Bearer $CLOUDFLARE_API_TOKEN"

echo "================================"
echo "  cf:diag for env=$ENV"
echo "  WORKER_NAME=$WORKER_NAME"
echo "  account_id len=$ALEN"
echo "  api_token len=$TLEN"
echo "================================"

probe() {
  local label="$1" path="$2"
  local resp code
  resp=$(curl -sS -w '\n%{http_code}' -H "$H" "$CF$path")
  code=$(echo "$resp" | tail -1)
  printf '%-55s' "$label"
  if [ "$code" = "200" ]; then
    echo "✓ 200"
  else
    echo "✗ $code"
    echo "$resp" | sed '$d' | head -c 300
    echo
  fi
}

probe "GET /user/tokens/verify"                         "/user/tokens/verify"
probe "GET /accounts"                                   "/accounts?per_page=1"
probe "GET /accounts/<ID>"                              "/accounts/$CLOUDFLARE_ACCOUNT_ID"
probe "GET /accounts/<ID>/workers/scripts"              "/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts?per_page=1"
probe "GET /accounts/<ID>/workers/services"             "/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/services?per_page=1"
probe "GET /workers/services/$WORKER_NAME"              "/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/services/$WORKER_NAME"
probe "GET /workers/scripts/$WORKER_NAME"               "/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$WORKER_NAME"

echo
echo "Token info:"
curl -sS -H "$H" "$CF/user/tokens/verify" | head -c 300
echo
