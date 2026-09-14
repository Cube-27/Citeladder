FROM node@sha256:367679cf9792759492a486e4aa4b421764d71a9546a6dae8aab81a99eb797b3e AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app

# Node 26 no longer bundles corepack, so pnpm is installed from npm.
# Keep this version in lockstep with the packageManager field in frontend/package.json.
RUN npm install --global --ignore-scripts pnpm@11.25.0
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM dependencies AS production-dependencies
RUN pnpm prune --prod

FROM node@sha256:367679cf9792759492a486e4aa4b421764d71a9546a6dae8aab81a99eb797b3e AS builder

ARG BUILD_REVISION=unknown
ARG NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS=${NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS}
WORKDIR /app

RUN npm install --global --ignore-scripts pnpm@11.25.0
COPY --from=dependencies /app/node_modules ./node_modules
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
COPY frontend/apps/marketing ./apps/marketing
COPY frontend/apps/app/src/globals.css frontend/apps/app/src/website-type.css frontend/apps/app/src/ui-motion.css ./apps/app/src/
COPY frontend/components ./components
COPY frontend/lib ./lib
COPY frontend/public ./public
COPY frontend/postcss.config.mjs frontend/tsconfig.json ./
RUN pnpm build

FROM node@sha256:367679cf9792759492a486e4aa4b421764d71a9546a6dae8aab81a99eb797b3e AS runtime

ARG BUILD_REVISION=unknown
LABEL org.opencontainers.image.title="citeladder-marketing" \
      org.opencontainers.image.revision="${BUILD_REVISION}"

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
WORKDIR /app

# Astro's standalone Node entry requires only production packages alongside
# its generated server and client output.
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/apps/marketing/dist ./dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok ? 0 : 1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/entry.mjs"]
