FROM node:20.11.1-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json eslint.config.js ./
COPY .editorconfig .editorconfig
COPY packages/config packages/config
COPY packages/types packages/types
COPY packages/db packages/db
COPY apps/api/package.json apps/api/package.json
RUN npm ci

FROM deps AS build
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/tsconfig.build.json apps/api/tsconfig.build.json
COPY apps/api/vitest.config.ts apps/api/vitest.config.ts
COPY packages/config packages/config
COPY packages/types packages/types
COPY packages/db packages/db
COPY apps/api/src apps/api/src
RUN npm run build
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
