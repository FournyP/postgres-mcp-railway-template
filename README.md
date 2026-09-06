# Postgres MCP Railway Template

Deploys [Postgres MCP Pro](https://github.com/crystaldba/postgres-mcp) — an MCP server that gives AI agents database health checks, query plan analysis, and index tuning over any Postgres database — behind an NGINX bearer-token auth gateway.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/postgres-mcp?referralCode=C3Uv6n&utm_medium=integration&utm_source=template&utm_campaign=generic)

## 🏗️ Architecture

```
client ──Authorization: Bearer <key>──► postgres-mcp-gateway (nginx, public)
                                              │
                                              ▼ private network
                                    postgres-mcp (private) ──► Postgres
```

Two Railway services:

- **`postgres-mcp-gateway`** — `nginx:1.29.8-alpine`, exposes a public domain, validates the `Authorization: Bearer <key>` header against `API_KEYS`, and forwards streamable-HTTP traffic to the mcp service via Railway's private network.
- **`postgres-mcp`** — built from the upstream source at a pinned commit (see `mcp/Dockerfile`). Uses `--transport=streamable-http`; the legacy `sse` transport in the `0.3.0` release triggers an init-ordering race that hangs clients. **Do not give this service a public domain**; it is only reachable at `postgres-mcp.railway.internal:8000`.

## ✨ Features

- Bearer-token auth with a comma-separated allowlist of keys
- Streamable HTTP passthrough (`/mcp/`)
- Unauthenticated `/health` (and `/healthz`) on the gateway for Railway healthchecks
- SQL-level access mode (`restricted` by default) as defense-in-depth on top of the network-level bearer auth
- Optional URL-embedded key, for MCP clients that cannot send an auth header
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

## 🧱 Infrastructure as Code

`.railway/railway.ts` defines the whole project — both services and every variable.

```bash
railway link
npm install

# First apply only; later runs omit these and preserve() keeps the values.
export API_KEYS=$(openssl rand -hex 32)
export DATABASE_URI=postgresql://user:pass@host:5432/dbname

npm run plan     # read the diff before applying
npm run apply
railway domain --service postgres-mcp-gateway
```

Give the domain to the gateway only. `postgres-mcp` holds the database credentials and has
no authentication of its own.

The database is external to this template. Point `DATABASE_URI` at whichever Postgres the
agent should inspect.

Needs the Railway CLI 5.42.1 or newer: the IaC engine ships in the CLI, not in the npm
package. If you forked this repo, change `REPO` in `railway.ts` to your own before applying.

Link it to a project dedicated to this template. An apply deletes every resource **and
every variable** the file does not declare, so from then on variables live in `railway.ts`,
not the dashboard. Do not point it at a project created from the deploy button — the
service names differ, and a mismatch is a delete and recreate, not a rename.

## ⬆️ Upgrading

Railway template updates are opt-in — an existing deployment keeps running until you apply the update. See the [changelog](CHANGELOG.md) for what each update contains.

## 🔧 Variables

### Gateway service

| Variable | Required | Description |
| --- | --- | --- |
| `API_KEYS` | yes | Comma-separated list of allowed bearer tokens. Allowed chars per key: `A-Z a-z 0-9 . _ ~ + / = -` |
| `MCP_HOST` | no | Defaults to `postgres-mcp.railway.internal`. Only override if you rename the mcp service. |
| `MCP_PORT` | no | Defaults to `8000`. |
| `PATH_KEY_AUTH` | no | `true` also accepts the key in the URL as `/k/<key>/mcp` (see below). Default `false`. |

### MCP service

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URI` | yes | Postgres connection string, e.g. `postgresql://user:pass@host:5432/dbname` |
| `ACCESS_MODE` | no | `restricted` (default) — read-only transactions with execution-time limits. Set to `unrestricted` for full read/write. |
| `OPENAI_API_KEY` | no | Enables postgres-mcp's experimental LLM-based index tuning. |

## 🔑 Key in the URL instead of the header (opt-in)

Normally a client proves itself with a header: `Authorization: Bearer <key>`.

A few MCP clients ask a server "what tools do you have?" *before* the user has
typed a key into them. That request goes out with no header, the gateway
correctly returns `401`, and the client reports the server as broken — so the
user never reaches the screen where they would enter the key.

Setting `PATH_KEY_AUTH=true` lets the same key ride in the URL instead, so a
client that can only store a URL can still get in:

```
https://<gateway-domain>/k/<your-key>/mcp
```

The key is checked against the same `API_KEYS` list, then stripped — the mcp
service only ever sees `/mcp`. A missing or wrong key is still `401`, and a
valid key opens nothing but `/mcp`:

| Request | Result |
| --- | --- |
| `/k/<valid-key>/mcp` | proxied to the mcp service |
| `/k/<wrong-key>/mcp` | `401` |
| `/k//mcp` | `401` |
| `/k/<valid-key>/tools` | `401` |

**This is weaker than the header, which is why it is off by default.** Headers
are not usually logged; URLs are — by Railway's edge, by any CDN or proxy in
between, by browser history. It is the same secret in more places you do not
control. So:

- Turn it on only if a client actually needs it.
- Give that client its **own key** in `API_KEYS`, so you can rotate just that
  one if it leaks.
- Keys used this way cannot contain `/` (the header form allows it), since a
  slash would split the path segment.

## 🔒 Two layers of protection

- **Bearer auth at the gateway** is the network boundary — nothing reaches the MCP without a valid key.
- **`ACCESS_MODE=restricted`** is the SQL boundary — even if a key leaks, the attacker can only run read-only queries with time limits and cannot `commit`/`rollback`.

Postgres-mcp upstream has **no built-in client authentication** of its own (verified against v0.3.0 source). The gateway is therefore mandatory if the service is reachable from anything outside Railway's private network.

## 📝 Notes

- **Generate strong keys:** `openssl rand -hex 32`
- **Rotating a key:** update `API_KEYS` on the gateway service and redeploy it. The mcp service is untouched.
- **`/health` and `/healthz` are unauthenticated** so Railway (and any uptime monitor) can probe without a token. Everything else requires `Authorization: Bearer <key>`.
- **Invalid / missing token:** the gateway returns `401` with a `WWW-Authenticate: Bearer realm="postgres-mcp"` header.
- **Do not expose the mcp service publicly.** All traffic should enter through the gateway.
- Upstream source: https://github.com/crystaldba/postgres-mcp — built at a pinned SHA via `ARG POSTGRES_MCP_SHA` in `mcp/Dockerfile`. Bump the SHA to pick up upstream changes.

## ⚖️ License

[MIT](LICENSE)
