# TypeScript API service (docs/plans/citeladder-typescript-migration.md PR 1).
# Node 26 strips the service's erasable TypeScript at load time, so the image
# ships source and has no build stage. Same Node base as the frontend images.
FROM node@sha256:e961046fec20896e8904f2b4a8b4c7e5ca91826d84d8d33d83dbaa61f942069e AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app

# Keep this version in lockstep with packageManager in frontend/package.json.
RUN npm install --global --ignore-scripts pnpm@12.4.2
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
COPY frontend/packages/contracts/package.json ./packages/contracts/
COPY frontend/services/api/package.json ./services/api/
RUN pnpm install --frozen-lockfile --ignore-scripts --prod --filter "@citeladder/api..."

FROM node@sha256:e961046fec20896e8904f2b4a8b4c7e5ca91826d84d8d33d83dbaa61f942069e AS runtime

ARG BUILD_REVISION=unknown
LABEL org.opencontainers.image.title="citeladder-api-service" \
      org.opencontainers.image.revision="${BUILD_REVISION}"

ENV NODE_ENV=production \
    PORT=8100
WORKDIR /app

# Dependencies and source stay root-owned and read-only to the runtime user.
COPY --from=dependencies --chown=0:0 /app/node_modules ./node_modules
COPY --from=dependencies --chown=0:0 /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=dependencies --chown=0:0 /app/services/api/node_modules ./services/api/node_modules
COPY --chown=0:0 frontend/packages/contracts/package.json ./packages/contracts/package.json
COPY --chown=0:0 frontend/packages/contracts/src ./packages/contracts/src
COPY --chown=0:0 frontend/services/api/package.json ./services/api/package.json
COPY --chown=0:0 frontend/services/api/src ./services/api/src

USER node
WORKDIR /app/services/api
EXPOSE 8100

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8100/ready').then(r=>process.exit(r.status===200 ? 0 : 1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.ts"]
