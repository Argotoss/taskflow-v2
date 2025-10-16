FROM node:20.11.1-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json eslint.config.js ./
COPY .editorconfig .editorconfig
COPY scripts scripts
COPY packages/config packages/config
COPY packages/types packages/types
COPY packages/db packages/db
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
# Generate Prisma client during dependencies installation
RUN npm run prisma:generate

FROM deps AS build
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/tsconfig.build.json apps/api/tsconfig.build.json
COPY apps/api/vitest.config.ts apps/api/vitest.config.ts
COPY packages/config packages/config
COPY packages/types packages/types
COPY packages/db packages/db
COPY scripts scripts
COPY apps/api/src apps/api/src
COPY apps/web apps/web
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/packages/config/package.json ./packages/config/package.json
COPY --from=build /app/packages/types/package.json ./packages/types/package.json
COPY --from=build /app/packages/db/package.json ./packages/db/package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/packages/config/dist ./packages/config/dist
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/packages/db/dist ./packages/db/dist
# Copy generated Prisma client
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
