# Build postgres-mcp from source at a pinned commit.
# Reason: the 0.3.0 release only supports the legacy SSE transport, which races
# with strict init-ordering in the MCP SDK and causes clients to hang.
# Commit 07eb329 adds streamable-http transport, which serialises initialize →
# notifications/initialized → subsequent calls over single HTTP round-trips.
# https://github.com/crystaldba/postgres-mcp/commit/07eb329c8c48e49640e0d1b5b35465d4d024c3ee

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0

ARG POSTGRES_MCP_SHA=07eb329c8c48e49640e0d1b5b35465d4d024c3ee

RUN apt-get update \
  && apt-get install -y --no-install-recommends git libpq-dev gcc ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN git clone https://github.com/crystaldba/postgres-mcp.git /app \
  && git -C /app checkout "${POSTGRES_MCP_SHA}"

RUN uv sync --frozen --no-dev


FROM python:3.12-slim-bookworm

RUN groupadd -r app && useradd -r -g app app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libpq-dev \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=app:app /app /app
ENV PATH="/app/.venv/bin:$PATH"

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER app
EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
