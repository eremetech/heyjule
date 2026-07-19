FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY patches patches
COPY apps/patient-mobile/package.json apps/patient-mobile/package.json
COPY packages/crypto/package.json packages/crypto/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN pnpm install --frozen-lockfile --filter @heyjule/patient-mobile...

COPY apps/patient-mobile apps/patient-mobile
COPY packages/crypto packages/crypto
COPY packages/shared-types packages/shared-types

# No .env is present in the build context, so app-config.ts falls back to the
# production jules.agenticsonar.com URLs.
RUN CI=1 pnpm --filter @heyjule/patient-mobile exec expo export --platform web --output-dir dist

FROM nginxinc/nginx-unprivileged:1.27-alpine AS production

COPY --from=build /workspace/apps/patient-mobile/dist /usr/share/nginx/html
