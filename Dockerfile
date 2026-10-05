# node:26-bookworm-slim
FROM node:26-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS native
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app
RUN npm install --global --ignore-scripts pnpm@12.8.1
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
COPY frontend/packages/contracts/package.json ./packages/contracts/
COPY frontend/services/api/package.json ./services/api/
COPY frontend/packages/mcp-app/package.json ./packages/mcp-app/
RUN pnpm install --frozen-lockfile --ignore-scripts --prod --filter "@citeladder/api..."
COPY frontend/packages/contracts/src ./packages/contracts/src
# This native graph supports schema/bootstrap execution, not an MCP server.
# The serving API image builds and packages the UI (frontend/services/api/Dockerfile).
COPY frontend/services/api/src ./services/api/src
COPY frontend/services/api/assets ./services/api/assets
RUN pnpm --filter @citeladder/api deploy --prod --ignore-scripts /runtime \
    && mkdir -p /runtime/packages \
    && mv "$(readlink -f /runtime/node_modules/@citeladder/contracts)" /runtime/packages/contracts \
    && ln -sfn ../../packages/contracts /runtime/node_modules/@citeladder/contracts

# Runtime interpreter. Pinned to 3.12 so the image, backend/.python-version,
# the CI gate, and the `requires-python` floor are one version: a Dependabot
# bump had moved this to 3.14 while every gate still validated 3.12, so the
# container shipped an interpreter nothing tested. Bump all four together.
# python:3.12.14-slim-bookworm
FROM python@sha256:392307d22300de8b5986851a12d9176dfc0fc073e65bf6523ebd7dcbeb23564e AS dependencies

ARG UV_VERSION=0.11.28
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app/backend

# Native toolchains exist only in the dependency stage; the runtime image does
# not contain a compiler or development headers.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --only-binary :all: "uv==${UV_VERSION}"

COPY backend/pyproject.toml backend/uv.lock ./
# `--no-build` holds the install to published wheels, so no dependency's
# setup.py runs during the image build. Every runtime dependency ships one
# today; if that ever stops the build fails here instead of quietly
# executing a setup script.
RUN uv sync --frozen --no-dev --no-install-project --no-build

# python:3.12.14-slim-bookworm
FROM python@sha256:392307d22300de8b5986851a12d9176dfc0fc073e65bf6523ebd7dcbeb23564e AS runtime

ARG BUILD_REVISION=unknown
LABEL org.opencontainers.image.title="citeladder-schema" \
      org.opencontainers.image.revision="${BUILD_REVISION}"

ENV PATH="/app/backend/.venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

RUN groupadd --gid 10001 appuser \
    && useradd --no-create-home --uid 10001 --gid 10001 --shell /usr/sbin/nologin appuser \
    && install -d -o 10001 -g 10001 /app/backend/.runtime \
    && apt-get update && apt-get install -y --no-install-recommends libstdc++6 libatomic1 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=native --chown=0:0 /usr/local/bin/node /usr/local/bin/node
COPY --from=native --chown=0:0 /runtime /app/native
COPY --chown=0:0 --chmod=755 scripts/bootstrap-environment.sh /app/bootstrap-environment.sh

# Dependencies and source remain root-owned/read-only to the runtime identity.
COPY --from=dependencies --chown=0:0 /app/backend/.venv ./.venv

COPY --chown=0:0 backend/app ./app
COPY --chown=0:0 backend/alembic.ini ./alembic.ini
COPY --chown=0:0 migrations /app/migrations

USER 10001:10001

# One-shot schema image with native identity/access/catalog bootstrap. API and worker images stay Python-free.
# Deployments explicitly select migrations/bootstrap.
CMD ["alembic", "--help"]
