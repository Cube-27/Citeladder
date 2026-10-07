# Node 26 bookworm-slim; preserve this image family when updating the digest.
FROM node@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app

# Keep this version in lockstep with packageManager in frontend/package.json.
RUN npm install --global --ignore-scripts pnpm@12.9.1
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

ARG NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS
ARG NEXT_PUBLIC_BOOTSTRAP_READ_TIMEOUT_MS
ARG NEXT_PUBLIC_DEMO_MODE=false
ARG NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE
ARG PUBLIC_WEBSITE_ORIGIN
ARG PUBLIC_APP_ORIGIN
ARG PUBLIC_DOCS_ORIGIN
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
ENV NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS=${NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS}
ENV NEXT_PUBLIC_BOOTSTRAP_READ_TIMEOUT_MS=${NEXT_PUBLIC_BOOTSTRAP_READ_TIMEOUT_MS}
ENV NEXT_PUBLIC_DEMO_MODE=${NEXT_PUBLIC_DEMO_MODE}
ENV NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE=${NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE}
ENV PUBLIC_WEBSITE_ORIGIN=${PUBLIC_WEBSITE_ORIGIN}
ENV PUBLIC_APP_ORIGIN=${PUBLIC_APP_ORIGIN}
ENV PUBLIC_DOCS_ORIGIN=${PUBLIC_DOCS_ORIGIN}
ENV LOCAL_COMPOSE_BUILD=true
WORKDIR /app

RUN npm install --global --ignore-scripts pnpm@12.9.1
COPY --from=dependencies /app/node_modules ./node_modules
COPY frontend ./
RUN pnpm build:vite

# Local Compose only: production serves this build through the product Worker
# (wrangler.jsonc). Run that same Worker so routing, headers and the API proxy
# match production; LOCAL_WORKER_ORIGIN admits HTTP and the API container.
FROM node@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS runtime

ENV NODE_ENV=production     HOME=/tmp     WRANGLER_SEND_METRICS=false
WORKDIR /app

COPY --from=wrangler --chown=node:node /wrangler/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json /app/tsconfig.json ./
COPY --from=builder --chown=node:node /app/lib ./lib
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/app ./apps/app

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok ? 0 : 1)).catch(()=>process.exit(1))"

CMD ["./node_modules/.bin/wrangler", "dev", "-c", "apps/app/wrangler.jsonc", "--local", "--ip", "0.0.0.0", "--port", "3001", "--var", "ORIGIN_UPSTREAM:http://api-service:8100", "--var", "ORIGIN_TOKEN:local-dev-only-token-32-characters", "--var", "LOCAL_WORKER_ORIGIN:true"]
