FROM node:26-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app

# Keep this version in lockstep with packageManager in frontend/package.json.
RUN npm install --global --ignore-scripts pnpm@12.21.0
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
COPY frontend/packages/contracts/package.json ./packages/contracts/
COPY frontend/services/api/package.json ./services/api/
COPY frontend/packages/mcp-app/package.json ./packages/mcp-app/
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY frontend/packages/contracts/src ./packages/contracts/src
COPY frontend/services/api/src ./services/api/src
COPY frontend/services/api/assets ./services/api/assets
COPY frontend/services/api/migrations ./services/api/migrations
COPY frontend/packages/mcp-app ./packages/mcp-app
COPY frontend/components ./components
COPY frontend/lib ./lib
COPY frontend/vp-shared-config.ts ./vp-shared-config.ts
COPY frontend/scripts/max-params-baseline.json ./scripts/max-params-baseline.json
COPY frontend/vite.config.ts ./vite.config.ts
COPY frontend/apps/app/src/*.css ./apps/app/src/
RUN pnpm --filter @citeladder/mcp-app build \
    && mkdir -p services/api/assets/mcp-app/v1 \
    && cp packages/mcp-app/dist/analytics.html services/api/assets/mcp-app/v1/analytics.html \
    && sed -n "s/^@import '\\.\\/\\(.*\\)';$/apps\\/app\\/src\\/\\1/p" apps/app/src/globals.css | xargs cat > services/api/assets/design-tokens.css
RUN pnpm --filter @citeladder/api deploy --prod --ignore-scripts /runtime
# Node strips our workspace TypeScript only outside node_modules. Keep the
# deployed contracts package linked to a source directory, as in development.
RUN mkdir -p /runtime/packages \
    && mv "$(readlink -f /runtime/node_modules/@citeladder/contracts)" /runtime/packages/contracts \
    && ln -sfn ../../packages/contracts /runtime/node_modules/@citeladder/contracts

FROM node:26-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS runtime

ARG BUILD_REVISION=unknown
LABEL org.opencontainers.image.title="citeladder-api-service" \
      org.opencontainers.image.revision="${BUILD_REVISION}"

ENV NODE_ENV=production \
    PORT=8100
WORKDIR /app

COPY --from=dependencies --chown=0:0 /runtime ./

USER node
EXPOSE 8100

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8100/ready').then(r=>process.exit(r.status===200 ? 0 : 1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.ts"]
