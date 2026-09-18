# Changelog

Notable changes to this template. Entries are named after the change they ship, because
the template pins Postgres MCP Pro to a commit rather than a release. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Pinned gateway port — 2026-09-18

### Fixed

- `railway.ts` pins the gateway's `PORT` to `80`. Railway injects a random `PORT` when the
  variable is unset, so a gateway created by hand with an explicit domain target port
  listened on one port while the edge dialled another, and every request was a `502`.

## Exact key matching — 2026-09-18

### Fixed

- The gateway escapes `.` and `+` before building its bearer-key regex. Both are allowed in
  `API_KEYS` and both are PCRE metacharacters, so a key such as `abc.def` also admitted
  `abcXdef`. Keys from `openssl rand -hex 32` were never affected.

## Infrastructure as Code — 2026-09-06

### Added

- `.railway/railway.ts`, an Infrastructure as Code definition of the project. See
  [Infrastructure as Code](README.md#-infrastructure-as-code).
- An `iac-typecheck` workflow, alongside the existing `docker-build` one.
- A `.env.example` covering both services.

### Changed

- The gateway's default `MCP_HOST` is now `postgres-mcp.railway.internal`, matching the
  service name in `railway.ts`. It was `mcp.railway.internal`.

### Upgrade notes

- Only deployments relying on the old default are affected. If your mcp service is named
  `mcp`, set `MCP_HOST=mcp.railway.internal` explicitly or rename the service.

## Path-key auth — 2026-09-04

### Added

- `PATH_KEY_AUTH=true` accepts the API key as a path segment (`/k/<key>/mcp`) for MCP
  clients that cannot send an `Authorization` header. The key is checked against the same
  `API_KEYS` list, then stripped before the request reaches the mcp service, and it
  unlocks only `/mcp` — no other path.
- A `/healthz` spelling of the health endpoint, answered by the gateway itself, so a
  healthcheck configured either way works without editing the nginx template.

### Changed

- The gateway answers `/health` and `/healthz` itself instead of proxying them, so the
  probe stays green while the mcp service restarts.

## Streamable HTTP transport — 2026-04-14

### Changed

- The mcp service is built from upstream source at a pinned commit and uses
  `--transport=streamable-http`. The `sse` transport in the `0.3.0` release triggers an
  init-ordering race that hangs clients.

### Fixed

- OAuth discovery paths return `404` so MCP clients skip the OAuth flow and fall back to
  the configured bearer token.
