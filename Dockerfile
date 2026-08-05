# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY services/api/package.json services/api/package.json
COPY services/worker/package.json services/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile=false
COPY apps apps
COPY services services
COPY packages packages
COPY migrations migrations
RUN pnpm --filter @hedgesight/contracts build && pnpm --filter @hedgesight/web build && pnpm --filter @hedgesight/api build
RUN pnpm --filter @hedgesight/api deploy --prod --legacy /output/api

FROM node:24-alpine AS app
RUN addgroup -S hedgesight && adduser -S hedgesight -G hedgesight && mkdir -p /data && chown hedgesight:hedgesight /data
WORKDIR /app
COPY --from=build --chown=hedgesight:hedgesight /output/api ./
COPY --from=build --chown=hedgesight:hedgesight /workspace/apps/web/dist ./apps/web/dist
COPY --from=build --chown=hedgesight:hedgesight /workspace/migrations ./migrations
ENV NODE_ENV=production APP_PORT=8080 WEB_ROOT=apps/web/dist MIGRATIONS_DIR=migrations DATABASE_CONFIG_FILE=/data/database-url
USER hedgesight
EXPOSE 8080
CMD ["node", "dist/index.js"]
