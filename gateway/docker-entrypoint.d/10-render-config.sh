#!/bin/sh
set -eu

: "${API_KEYS:?API_KEYS is required (comma-separated list of allowed bearer tokens)}"
: "${MCP_HOST:=mcp.railway.internal}"
: "${MCP_PORT:=8000}"
: "${PORT:=80}"

# Validate each key. Keys are interpolated into an nginx map regex, so we
# restrict to characters that are safe inside a regex alternation group.
# Allowed: A-Z a-z 0-9 . _ ~ + / = -   (covers base64, base64url, hex, UUID)
echo "$API_KEYS" | tr ',' '\n' | while IFS= read -r key; do
  [ -z "$key" ] && continue
  case "$key" in
    *[!A-Za-z0-9._~+/=-]*)
      echo "gateway: API_KEYS contains an invalid character; allowed: A-Z a-z 0-9 . _ ~ + / = -" >&2
      exit 1
      ;;
  esac
done

API_KEY_PATTERN=$(echo "$API_KEYS" | tr ',' '\n' | sed '/^$/d' | paste -sd '|' -)
if [ -z "$API_KEY_PATTERN" ]; then
  echo "gateway: API_KEYS must contain at least one non-empty key" >&2
  exit 1
fi
export API_KEY_PATTERN

# Railway private DNS (*.railway.internal) is IPv6-only; pick up the container's
# nameserver from resolv.conf so nginx can resolve it.
RESOLVER=$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf)
: "${RESOLVER:=127.0.0.11}"
# nginx requires IPv6 resolver addresses wrapped in brackets (otherwise the
# trailing `:xx` is parsed as a port). Railway's resolv.conf is IPv6.
case "$RESOLVER" in
  *:*) RESOLVER="[$RESOLVER]" ;;
esac
export RESOLVER

export MCP_HOST MCP_PORT PORT

envsubst '${API_KEY_PATTERN} ${RESOLVER} ${MCP_HOST} ${MCP_PORT} ${PORT}' \
  < /etc/nginx/nginx.conf.template \
  > /etc/nginx/nginx.conf
