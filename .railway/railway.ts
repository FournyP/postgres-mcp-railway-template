// Railway Infrastructure as Code: railway config plan | apply
//
// An apply deletes every resource this file does not declare, so link it to a
// project dedicated to this template.
//
// Secrets stay out of here. Export them for the first apply; later runs omit
// them and preserve() keeps what Railway holds.
//
//   export API_KEYS=$(openssl rand -hex 32)
//   export DATABASE_URI=postgresql://user:pass@host:5432/dbname

import { defineRailway, github, preserve, project, service } from "railway/iac";

const REPO = "FournyP/postgres-mcp-railway-template";

// Matched by name, so keep these identical to Railway: a mismatch is a
// delete and recreate, not a rename.
const GATEWAY_SERVICE = "postgres-mcp-gateway";
const MCP_SERVICE = "postgres-mcp";

// The gateway needs this as a literal for its upstream URL, and for the Host
// rewrite that gets past the MCP SDK's DNS-rebinding allowlist.
const MCP_PORT = "8000";

/** Push the value from the local environment if present, else keep Railway's. */
const fromEnvOrPreserve = (name: string) => process.env[name] ?? preserve();

export default defineRailway(() => {
  // No domain here: auth lives in the gateway, and this service has none.
  // The database itself is external to this template.
  const mcp = service(MCP_SERVICE, {
    // Each service builds from its own directory; there is no root Dockerfile.
    source: github(REPO, { branch: "main", rootDirectory: "mcp" }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    env: {
      // The port the upstream binds. Pinned rather than left to Railway, so the
      // gateway's MCP_PORT literal below cannot drift from it.
      PORT: "8000",

      DATABASE_URI: fromEnvOrPreserve("DATABASE_URI"),

      // Optional: enables the index-tuning tools that call an LLM.
      OPENAI_API_KEY: fromEnvOrPreserve("OPENAI_API_KEY"),

      // The SQL boundary: read-only, time-limited, no commit/rollback.
      ACCESS_MODE: process.env.ACCESS_MODE ?? "restricted",
    },
  });

  const gateway = service(GATEWAY_SERVICE, {
    source: github(REPO, { branch: "main", rootDirectory: "gateway" }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    deploy: {
      // Answered by nginx, so it stays green while the mcp service restarts.
      healthcheckPath: "/health",
    },
    env: {
      // Comma-separated bearer tokens. Per key: A-Z a-z 0-9 . _ ~ + / = -
      API_KEYS: fromEnvOrPreserve("API_KEYS"),

      MCP_HOST: mcp.env.RAILWAY_PRIVATE_DOMAIN,
      MCP_PORT,

      // true also accepts /k/<key>/mcp, for clients that cannot send a header.
      PATH_KEY_AUTH: process.env.PATH_KEY_AUTH ?? "false",
    },
  });

  return project("Postgres MCP", { resources: [mcp, gateway] });
});
