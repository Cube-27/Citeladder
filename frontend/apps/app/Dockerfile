FROM node@sha256:a723b54c35a76e947095a20a67d39585bb09c862e6b1adeb8a9f518f95e34fb0 AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app

# Keep this version in lockstep with packageManager in frontend/package.json.
RUN npm install --global --ignore-scripts pnpm@12.4.2
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
COPY frontend/packages/contracts/package.json ./packages/contracts/
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM node@sha256:a723b54c35a76e947095a20a67d39585bb09c862e6b1adeb8a9f518f95e34fb0 AS builder

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

RUN npm install --global --ignore-scripts pnpm@12.4.2
COPY --from=dependencies /app/node_modules ./node_modules
COPY frontend ./
RUN pnpm build:vite

FROM caddy@sha256:0c994536bddb66445885237f1a5dcc1916bccea922661c76b4e9fc24061f9b52 AS runtime

COPY frontend/apps/app/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/apps/app/dist /srv

USER 1000:1000

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --output-document=- http://127.0.0.1:3001/health >/dev/null || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
