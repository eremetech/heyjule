FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY patches patches
COPY apps/doctor-web/package.json apps/doctor-web/package.json
COPY packages/crypto/package.json packages/crypto/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN pnpm install --frozen-lockfile --filter @heyjule/doctor-web...

COPY apps/doctor-web apps/doctor-web
COPY packages/crypto packages/crypto
COPY packages/shared-types packages/shared-types

RUN DATABASE_PATH=:memory: \
    BETTER_AUTH_SECRET=doctor-web-build-only-secret-000000000000 \
    BETTER_AUTH_URL=http://localhost:3000 \
    HEYJULE_API_URL=http://localhost:8787 \
    pnpm --filter @heyjule/doctor-web build

FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

COPY --from=build --chown=node:node /workspace/apps/doctor-web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/doctor-web/.next/static ./apps/doctor-web/.next/static

RUN mkdir -p /app/data /app/apps/doctor-web/.next/cache && chown -R node:node /app/data /app/apps/doctor-web/.next/cache

USER node

EXPOSE 3000

CMD ["node", "apps/doctor-web/server.js"]
