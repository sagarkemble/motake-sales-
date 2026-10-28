# Notification service image (ADR-0001, Spec K): the Node app and the self-hosted Inngest server in
# one container. Build from the repo root:
#   docker build -f apps/notification/Dockerfile -t motake-notification:latest .

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /repo

# Only apps/notification and the workspace packages it depends on.
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.7.2 prune @repo/notification --docker

FROM base AS builder
COPY --from=pruner /repo/out/json/ .
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm --filter @repo/notification build \
  && pnpm --filter @repo/notification deploy --prod /app

FROM node:22-bookworm-slim AS runner
# Self-hosted Inngest server; the npm package fetches the pinned release binary.
ARG INNGEST_CLI_VERSION=1.46.0
RUN npm install -g "inngest-cli@${INNGEST_CLI_VERSION}" && inngest version

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /repo/apps/notification/dist ./dist
COPY apps/notification/docker/start.sh /usr/local/bin/start-notification
RUN chmod +x /usr/local/bin/start-notification && mkdir -p /var/lib/inngest \
  && mkdir -m 700 -p /var/lib/motake-secrets

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=8100 \
  INNGEST_PORT=8288 \
  INNGEST_BASE_URL=http://127.0.0.1:8288 \
  WHATSAPP_TOKEN_FILE=/var/lib/motake-secrets/whatsapp-access-token

# Inngest's local state (queued runs) lives on a named volume so it survives restarts.
VOLUME ["/var/lib/inngest"]
EXPOSE 8100

CMD ["start-notification"]
