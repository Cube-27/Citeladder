# TypeScript API service (docs/plans/citeladder-typescript-migration.md PR 1).
# Node 26 strips the service's erasable TypeScript at load time, so the image
# ships source. Keep the slim variant in the tag so digest updates cannot
# silently select the full build-toolchain image.
FROM node:26-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app

# Keep this version in lockstep with packageManager in frontend/package.json.
RUN npm install --global --ignore-scripts pnpm@12.8.1
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
COPY frontend/packages/contracts/package.json ./packages/contracts/
COPY frontend/services/api/package.json ./services/api/
RUN pnpm install --frozen-lockfile --ignore-scripts --prod --filter "@citeladder/api..."
COPY frontend/packages/contracts/src ./packages/contracts/src
COPY frontend/services/api/src ./services/api/src
# Export only this service's production graph, not the workspace-wide store.
RUN pnpm --filter @citeladder/api deploy --prod --ignore-scripts /runtime
# Node strips our workspace TypeScript only outside node_modules. Keep the
# deployed contracts package linked to a source directory, as in development.
RUN mkdir -p /runtime/packages \
    && mv "$(readlink -f /runtime/node_modules/@citeladder/contracts)" /runtime/packages/contracts \
    && ln -sfn ../../packages/contracts /runtime/node_modules/@citeladder/contracts

FROM node:26-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS runtime

ARG BUILD_REVISION=unknown
LABEL org.opencontainers.image.title="citeladder-api-service" \
      org.opencontainers.image.revision="${BUILD_REVISION}"

ENV NODE_ENV=production \
    PORT=8100 \
    AGENT_SKILLS_DIRECTORY=/app/agent-skills
WORKDIR /app

# Dependencies and source stay root-owned and read-only to the runtime user.
COPY --from=dependencies --chown=0:0 /runtime ./
COPY --chown=0:0 backend/app/core/config/agent_skills ./agent-skills

USER node
EXPOSE 8100

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8100/ready').then(r=>process.exit(r.status===200 ? 0 : 1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.ts"]
