# Node 26 bookworm-slim; preserve this image family when updating the digest.
FROM node:26-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app

# Node 26 no longer bundles corepack, so pnpm is installed from npm.
# Keep this version in lockstep with the packageManager field in frontend/package.json.
RUN npm install --global --ignore-scripts pnpm@12.8.1
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
COPY frontend/packages/contracts/package.json ./packages/contracts/
COPY frontend/services/api/package.json ./services/api/
COPY frontend/packages/mcp-app/package.json ./packages/mcp-app/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM node:26-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS builder

ARG BUILD_REVISION=unknown
ARG NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS
ARG PUBLIC_WEBSITE_ORIGIN
ARG PUBLIC_APP_ORIGIN
ARG PUBLIC_DOCS_ORIGIN
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS=${NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS}
ENV PUBLIC_WEBSITE_ORIGIN=${PUBLIC_WEBSITE_ORIGIN}
ENV PUBLIC_APP_ORIGIN=${PUBLIC_APP_ORIGIN}
ENV PUBLIC_DOCS_ORIGIN=${PUBLIC_DOCS_ORIGIN}
ENV LOCAL_COMPOSE_BUILD=true
WORKDIR /app

RUN npm install --global --ignore-scripts pnpm@12.8.1
COPY --from=dependencies /app/node_modules ./node_modules
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
COPY frontend/apps/marketing ./apps/marketing
COPY frontend/apps/app/src/globals.css frontend/apps/app/src/website-type.css frontend/apps/app/src/ui-motion.css ./apps/app/src/
COPY frontend/components ./components
COPY frontend/lib ./lib
COPY frontend/packages ./packages
COPY frontend/public ./public
COPY frontend/scripts ./scripts
COPY frontend/postcss.config.mjs frontend/tsconfig.json ./
RUN pnpm build:marketing

FROM node:26-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS runtime

ARG BUILD_REVISION=unknown
LABEL org.opencontainers.image.title="citeladder-marketing" \
      org.opencontainers.image.revision="${BUILD_REVISION}"

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
WORKDIR /app

# This image runs the marketing Worker in local Compose only. Protected GCP
# delivery keeps the captured pre-cutover image digest for rollback.
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/apps/marketing/dist ./apps/marketing/dist
COPY --from=builder --chown=node:node /app/apps/marketing/wrangler.jsonc ./apps/marketing/wrangler.jsonc
COPY --from=builder --chown=node:node /app/package.json ./package.json

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok ? 0 : 1)).catch(()=>process.exit(1))"

# Wrangler local maps inbound 127.0.0.1 requests to the configured Custom
# Domain URL (citeladder.com); keep PUBLIC_WEBSITE_HOST at that domain.
CMD ["./node_modules/.bin/wrangler", "dev", "-c", "apps/marketing/dist/server/wrangler.json", "--local", "--ip", "0.0.0.0", "--port", "3000", "--var", "ORIGIN_UPSTREAM:http://api-service:8100", "--var", "ORIGIN_TOKEN:local-dev-only-token-32-characters", "--var", "PUBLIC_APP_ORIGIN:http://127.0.0.1:3001", "--var", "LOCAL_WORKER_ORIGIN:true", "--var", "LOCAL_COMPOSE_BUILD:true"]
