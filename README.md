# Postgres MCP Railway Template

Deploys [Postgres MCP Pro](https://github.com/crystaldba/postgres-mcp) — an MCP server that gives AI agents database health checks, query plan analysis, and index tuning over any Postgres database — behind an NGINX bearer-token auth gateway.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template)

## 🏗️ Architecture

```
client ──Authorization: Bearer <key>──► gateway (nginx, public)
                                              │
                                              ▼ private network
                                        mcp (postgres-mcp, private) ──► Postgres
```

Two Railway services:

- **`gateway`** — `nginx:alpine`, exposes a public domain, validates the `Authorization: Bearer <key>` header against `API_KEYS`, and forwards SSE traffic to the mcp service via Railway's private network.
- **`mcp`** — pinned to `crystaldba/postgres-mcp:0.3.0`. **Do not give this service a public domain**; it is only reachable at `mcp.railway.internal:8000`.

## ✨ Features

- Bearer-token auth with a comma-separated allowlist of keys
- SSE passthrough (`/sse`, `/messages/...`)
- Unauthenticated `/health` on the gateway for Railway healthchecks
- SQL-level access mode (`restricted` by default) as defense-in-depth on top of the network-level bearer auth
- Zero custom code — gateway is plain nginx, mcp is the upstream prebuilt image

## 💁‍♀️ How to use

1. Click the Railway button 👆
2. Fill in the variables (see below)
3. Deploy! 🚄
4. Point your MCP client at `https://<gateway-domain>/sse` with header `Authorization: Bearer <your-key>`. Quick check:
   ```bash
   curl -N -H "Authorization: Bearer <your-key>" https://<gateway-domain>/sse
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
- Upstream image: `crystaldba/postgres-mcp:0.3.0` (Docker Hub)
- Source: https://github.com/crystaldba/postgres-mcp
