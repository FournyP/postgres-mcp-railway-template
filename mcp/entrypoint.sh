#!/bin/sh
set -e

ACCESS_MODE="${ACCESS_MODE:-restricted}"
PORT="${PORT:-8000}"

exec postgres-mcp \
  --transport=streamable-http \
  --streamable-http-host=0.0.0.0 \
  --streamable-http-port="${PORT}" \
  --access-mode="${ACCESS_MODE}"
