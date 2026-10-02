# Runtime interpreter. Pinned to 3.12 so the image, backend/.python-version,
# the CI gate, and the `requires-python` floor are one version: a Dependabot
# bump had moved this to 3.14 while every gate still validated 3.12, so the
# container shipped an interpreter nothing tested. Bump all four together.
# python:3.12.14-slim-bookworm
FROM python:3.12-slim-bookworm@sha256:392307d22300de8b5986851a12d9176dfc0fc073e65bf6523ebd7dcbeb23564e AS dependencies

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
FROM python:3.12-slim-bookworm@sha256:392307d22300de8b5986851a12d9176dfc0fc073e65bf6523ebd7dcbeb23564e AS runtime

ARG BUILD_REVISION=unknown
LABEL org.opencontainers.image.title="citeladder-backend" \
      org.opencontainers.image.revision="${BUILD_REVISION}"

ENV PATH="/app/backend/.venv/bin:${PATH}" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

RUN groupadd --gid 10001 appuser \
    && useradd --no-create-home --uid 10001 --gid 10001 --shell /usr/sbin/nologin appuser \
    && install -d -o 10001 -g 10001 /app/backend/.runtime

# Dependencies and source remain root-owned/read-only to the runtime identity.
COPY --from=dependencies --chown=0:0 /app/backend/.venv ./.venv

COPY --chown=0:0 backend/app ./app
COPY --chown=0:0 backend/scripts/account_manager.py ./scripts/account_manager.py
COPY --chown=0:0 backend/alembic.ini ./alembic.ini
COPY --chown=0:0 migrations /app/migrations

USER 10001:10001

# Schema and operator image. Deployments explicitly select migrations/bootstrap.
CMD ["python", "-m", "scripts.account_manager", "--help"]
