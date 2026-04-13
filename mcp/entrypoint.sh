#!/bin/sh
set -e

ACCESS_MODE="${ACCESS_MODE:-restricted}"
PORT="${PORT:-8000}"

exec /app/docker-entrypoint.sh postgres-mcp \
  --transport=sse \
  --sse-host=0.0.0.0 \
  --sse-port="${PORT}" \
  --access-mode="${ACCESS_MODE}"
