FROM node:22-bookworm-slim AS deploy

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches patches
COPY services/api/package.json services/api/package.json
COPY packages/crypto/package.json packages/crypto/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN pnpm install --frozen-lockfile --filter @heyjule/api...

COPY services/api services/api
COPY packages/crypto packages/crypto
COPY packages/shared-types packages/shared-types

RUN pnpm --filter @heyjule/api deploy /prod/api

FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production
ENV PORT=8787

WORKDIR /app

COPY --from=deploy --chown=node:node /prod/api ./
RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 8787

CMD ["./node_modules/.bin/tsx", "src/server.ts"]
