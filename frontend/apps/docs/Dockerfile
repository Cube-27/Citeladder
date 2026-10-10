# Node 26 bookworm-slim; preserve this image family when updating the digest.
FROM node@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app

# Keep this version in lockstep with packageManager in frontend/package.json.
RUN npm install --global --ignore-scripts pnpm@12.10.1
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
COPY frontend/patches ./patches
COPY frontend/packages/contracts/package.json ./packages/contracts/
COPY frontend/services/api/package.json ./services/api/
COPY frontend/packages/mcp-app/package.json ./packages/mcp-app/
RUN pnpm install --frozen-lockfile --ignore-scripts

# The runtime only runs `wrangler dev`: ship its locked closure, not the toolchain.
FROM dependencies AS wrangler
COPY frontend/scripts/copy-wrangler-runtime.mjs ./scripts/
RUN node scripts/copy-wrangler-runtime.mjs /wrangler

FROM node@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS builder

ARG PUBLIC_DOCS_ORIGIN
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
ENV PUBLIC_DOCS_ORIGIN=${PUBLIC_DOCS_ORIGIN}
WORKDIR /app

RUN npm install --global --ignore-scripts pnpm@12.10.1
COPY --from=dependencies /app/node_modules ./node_modules
COPY frontend ./
RUN pnpm build:docs

# Local Compose only: run the same static-assets Worker production deploys
# (apps/docs/wrangler.jsonc) over the built output.
FROM node@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS runtime

ENV NODE_ENV=production     HOME=/tmp     WRANGLER_SEND_METRICS=false
WORKDIR /app

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
