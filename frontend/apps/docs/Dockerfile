# Node 26 bookworm-slim. The tag keeps Dependabot's digest updates on this
# image family; a bare digest let it pick the full `node` image.
FROM node:26-bookworm-slim@sha256:298992629d69bbd5b2b03ad57094d8e4fcb3a8eeb7c4e25d29de656519568913 AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app

# Keep this version in lockstep with packageManager in frontend/package.json.
RUN npm install --global --ignore-scripts pnpm@12.16.1
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
COPY frontend/packages/contracts/package.json ./packages/contracts/
COPY frontend/services/api/package.json ./services/api/
COPY frontend/packages/mcp-app/package.json ./packages/mcp-app/
RUN pnpm install --frozen-lockfile --ignore-scripts

# The runtime only runs `wrangler dev`: ship its locked closure, not the toolchain.
FROM dependencies AS wrangler
COPY frontend/scripts/copy-wrangler-runtime.mjs ./scripts/
RUN node scripts/copy-wrangler-runtime.mjs /wrangler

FROM node:26-bookworm-slim@sha256:298992629d69bbd5b2b03ad57094d8e4fcb3a8eeb7c4e25d29de656519568913 AS builder

ARG PUBLIC_DOCS_ORIGIN
ARG PUBLIC_WEBSITE_ORIGIN
ARG PUBLIC_APP_ORIGIN
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
ENV PUBLIC_DOCS_ORIGIN=${PUBLIC_DOCS_ORIGIN}
ENV PUBLIC_WEBSITE_ORIGIN=${PUBLIC_WEBSITE_ORIGIN}
ENV PUBLIC_APP_ORIGIN=${PUBLIC_APP_ORIGIN}
WORKDIR /app

RUN npm install --global --ignore-scripts pnpm@12.16.1
COPY --from=dependencies /app/node_modules ./node_modules
COPY frontend ./
RUN pnpm build:docs

# Local Compose only: run the same static-assets Worker production deploys
# (apps/docs/wrangler.jsonc) over the built output.
FROM node:26-bookworm-slim@sha256:298992629d69bbd5b2b03ad57094d8e4fcb3a8eeb7c4e25d29de656519568913 AS runtime

ENV NODE_ENV=production     HOME=/tmp     WRANGLER_SEND_METRICS=false
WORKDIR /app

# workerd refuses to start without a system CA store, which the slim image omits.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy dependencies first so this layer is shared with the other Worker images.
COPY --from=wrangler --chown=node:node /wrangler/node_modules ./node_modules
# Wrangler keeps its local state under the working directory.
RUN chown node:node /app
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/apps/docs/wrangler.jsonc ./apps/docs/wrangler.jsonc
COPY --from=builder --chown=node:node /app/apps/docs/dist ./apps/docs/dist

USER node
EXPOSE 4322

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD node -e "fetch('http://127.0.0.1:4322/').then(r=>process.exit(r.ok ? 0 : 1)).catch(()=>process.exit(1))"

CMD ["./node_modules/.bin/wrangler", "dev", "-c", "apps/docs/wrangler.jsonc", "--local", "--ip", "0.0.0.0", "--port", "4322"]
