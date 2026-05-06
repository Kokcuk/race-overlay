#!/usr/bin/env bash
# Configure Cloudflare for race-overlay.com:
#   - A record race-overlay.com → DEPLOY_HOST (proxied)
#   - A record www.race-overlay.com → DEPLOY_HOST (proxied)
#   - SSL mode: Flexible (TLS terminated at the edge; origin runs HTTP)
#   - Always Use HTTPS: on
#
# Idempotent: existing matching records are updated rather than duplicated.
set -euo pipefail

cd "$(dirname "$0")/.."

# shellcheck disable=SC1091
source .env

: "${CF_API_TOKEN:?CF_API_TOKEN not set in .env}"
: "${DEPLOY_HOST:?DEPLOY_HOST not set in .env}"

ZONE_NAME="race-overlay.com"
API="https://api.cloudflare.com/client/v4"
AUTH=(-H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json")

echo "==> Looking up zone id for $ZONE_NAME"
ZONE_ID=$(curl -s "${AUTH[@]}" "$API/zones?name=$ZONE_NAME" \
  | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print(r[0]['id'] if r else '')")

if [[ -z "$ZONE_ID" ]]; then
  echo "ERROR: zone $ZONE_NAME not found in this Cloudflare account." >&2
  exit 1
fi
echo "  zone id: $ZONE_ID"

upsert_a_record() {
  local name="$1"
  local content="$2"
  local existing
  existing=$(curl -s "${AUTH[@]}" "$API/zones/$ZONE_ID/dns_records?type=A&name=$name" \
    | python3 -c "import json,sys; r=json.load(sys.stdin)['result']; print(r[0]['id'] if r else '')")

  local body
  body=$(python3 -c "import json; print(json.dumps({'type':'A','name':'$name','content':'$content','ttl':1,'proxied':True}))")

  if [[ -n "$existing" ]]; then
    echo "  updating $name → $content (id $existing)"
    curl -s -X PUT "${AUTH[@]}" "$API/zones/$ZONE_ID/dns_records/$existing" --data "$body" >/dev/null
  else
    echo "  creating $name → $content"
    curl -s -X POST "${AUTH[@]}" "$API/zones/$ZONE_ID/dns_records" --data "$body" >/dev/null
  fi
}

echo "==> Upserting DNS A records"
upsert_a_record "race-overlay.com" "$DEPLOY_HOST"
upsert_a_record "www.race-overlay.com" "$DEPLOY_HOST"

try_setting() {
  local key="$1"
  local body="$2"
  local resp
  resp=$(curl -s -X PATCH "${AUTH[@]}" "$API/zones/$ZONE_ID/settings/$key" --data "$body")
  local ok
  ok=$(printf '%s' "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('success'))")
  if [[ "$ok" != "True" ]]; then
    echo "  WARN: setting $key failed (token may lack Zone Settings:Edit): $resp" >&2
    return 1
  fi
}

echo "==> Setting SSL mode = flexible"
try_setting ssl '{"value":"flexible"}' || \
  echo "  Set SSL mode manually in the CF dashboard: SSL/TLS -> Overview -> Flexible." >&2

echo "==> Setting Always Use HTTPS = on"
try_setting always_use_https '{"value":"on"}' || \
  echo "  Set 'Always Use HTTPS' manually in the CF dashboard: SSL/TLS -> Edge Certificates." >&2

echo "==> Zone status:"
curl -s "${AUTH[@]}" "$API/zones/$ZONE_ID" \
  | python3 -c "import json,sys; z=json.load(sys.stdin)['result']; print(f'  status: {z[\"status\"]}'); print('  name servers:'); [print(f'    {ns}') for ns in z.get('name_servers',[])]"

echo
echo "==> Done."
echo "    If status is 'pending', set the above name servers at your domain registrar."
echo "    Once propagated, https://race-overlay.com will serve via Cloudflare."
