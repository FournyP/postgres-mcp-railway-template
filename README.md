# Postgres MCP Railway Template

Deploys [Postgres MCP Pro](https://github.com/crystaldba/postgres-mcp) — an MCP server that gives AI agents database health checks, query plan analysis, and index tuning over any Postgres database — behind an NGINX bearer-token auth gateway.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/postgres-mcp?referralCode=C3Uv6n&utm_medium=integration&utm_source=template&utm_campaign=generic)

## 🏗️ Architecture

```
client ──Authorization: Bearer <key>──► gateway (nginx, public)
                                              │
                                              ▼ private network
                                        mcp (postgres-mcp, private) ──► Postgres
```

Two Railway services:

- **`gateway`** — `nginx:alpine`, exposes a public domain, validates the `Authorization: Bearer <key>` header against `API_KEYS`, and forwards streamable-HTTP traffic to the mcp service via Railway's private network.
- **`mcp`** — built from the upstream source at a pinned commit (see `mcp/Dockerfile`). Uses `--transport=streamable-http`; the legacy `sse` transport in the `0.3.0` release triggers an init-ordering race that hangs clients. **Do not give this service a public domain**; it is only reachable at `mcp.railway.internal:8000`.

## ✨ Features

- Bearer-token auth with a comma-separated allowlist of keys
- Streamable HTTP passthrough (`/mcp/`)
- Unauthenticated `/health` on the gateway for Railway healthchecks
- SQL-level access mode (`restricted` by default) as defense-in-depth on top of the network-level bearer auth
- Zero custom code — gateway is plain nginx, mcp is the upstream prebuilt image

## 💁‍♀️ How to use

1. Click the Railway button 👆
2. Fill in the variables (see below)
3. Deploy! 🚄
4. Point your MCP client at `https://<gateway-domain>/mcp/` (streamable-HTTP, `"type": "http"`) with header `Authorization: Bearer <your-key>`. Quick check:
   ```bash
   curl -sS -X POST https://<gateway-domain>/mcp/ \
     -H "Authorization: Bearer <your-key>" \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
   ```

## 🔧 Variables

### Gateway service

| Variable | Required | Description |
| --- | --- | --- |
| `API_KEYS` | yes | Comma-separated list of allowed bearer tokens. Allowed chars per key: `A-Z a-z 0-9 . _ ~ + / = -` |
| `MCP_HOST` | no | Defaults to `mcp.railway.internal`. Only override if you rename the mcp service. |
| `MCP_PORT` | no | Defaults to `8000`. |

### MCP service

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URI` | yes | Postgres connection string, e.g. `postgresql://user:pass@host:5432/dbname` |
| `ACCESS_MODE` | no | `restricted` (default) — read-only transactions with execution-time limits. Set to `unrestricted` for full read/write. |
| `OPENAI_API_KEY` | no | Enables postgres-mcp's experimental LLM-based index tuning. |

## 🔒 Two layers of protection

- **Bearer auth at the gateway** is the network boundary — nothing reaches the MCP without a valid key.
- **`ACCESS_MODE=restricted`** is the SQL boundary — even if a key leaks, the attacker can only run read-only queries with time limits and cannot `commit`/`rollback`.

Postgres-mcp upstream has **no built-in client authentication** of its own (verified against v0.3.0 source). The gateway is therefore mandatory if the service is reachable from anything outside Railway's private network.

## 📝 Notes

- **Generate strong keys:** `openssl rand -hex 32`
- **Rotating a key:** update `API_KEYS` on the gateway service and redeploy it. The mcp service is untouched.
- **`/health` is unauthenticated** so Railway (and any uptime monitor) can probe without a token. Everything else requires `Authorization: Bearer <key>`.
- **Invalid / missing token:** the gateway returns `401` with a `WWW-Authenticate: Bearer realm="postgres-mcp"` header.
- **Do not expose the mcp service publicly.** All traffic should enter through the gateway.
- Upstream source: https://github.com/crystaldba/postgres-mcp — built at a pinned SHA via `ARG POSTGRES_MCP_SHA` in `mcp/Dockerfile`. Bump the SHA to pick up upstream changes.
