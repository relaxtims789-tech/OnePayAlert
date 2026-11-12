# syntax=docker/dockerfile:1.7
# One PayAlert API (NestJS). Build from the repository root:
#   docker build -f infra/docker/api.Dockerfile --target runtime -t onepay-api .
#   docker build -f infra/docker/api.Dockerfile --target migrate -t onepay-migrate .
#
# No packages are installed from the internet: the full Node image already has OpenSSL, and the
# slim runtime gets just the two OpenSSL 3 libraries Prisma's query engine loads. Node itself uses
# its bundled CA store for outbound HTTPS (FCM).
ARG NODE_BUILD_IMAGE=node:24.21.0-bookworm
ARG NODE_RUNTIME_IMAGE=node:24.21.0-bookworm-slim

FROM ${NODE_BUILD_IMAGE} AS manifests
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# ── Full dependencies + build.
FROM manifests AS build
RUN npm ci -w @onepay/shared -w @onepay/api --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @onepay/shared \
 && cd apps/api && npx prisma generate && npx nest build \
 && mkdir -p /opt/openssl \
 && cp -L /usr/lib/*-linux-gnu/libssl.so.3 /usr/lib/*-linux-gnu/libcrypto.so.3 /opt/openssl/

# ── One-shot job: apply migrations, then (re)load reference data (payment providers, plans).
# With APP_ENV=production the seed never creates demo providers or staff accounts.
FROM build AS migrate
WORKDIR /app/apps/api
CMD ["sh", "-c", "npx prisma migrate deploy && npx ts-node prisma/seed.ts"]

# ── Production dependencies only.
FROM manifests AS prod-deps
RUN npm ci -w @onepay/shared -w @onepay/api --include-workspace-root --omit=dev --ignore-scripts \
 # The PDF report uses two weights of each font; drop the rest (~90 MB of Chinese font files).
 && for f in noto-sans-sc kantumruy-pro; do \
      cd /app/node_modules/@expo-google-fonts/$f \
      && find . -mindepth 1 -maxdepth 1 -type d ! -name 400Regular ! -name 700Bold -exec rm -rf {} + \
      && find 400Regular 700Bold -name '*.png' -delete; \
    done \
 # Pulled in only as peer dependencies of @prisma/client; the runtime needs just the generated
 # client in node_modules/.prisma (copied below), not the CLI, its engines or TypeScript.
 && rm -rf /app/node_modules/prisma /app/node_modules/@prisma/engines /app/node_modules/@prisma/config \
           /app/node_modules/effect /app/node_modules/typescript

# ── Runtime: compiled code, production dependencies, generated Prisma client. No sources or dev tools.
FROM ${NODE_RUNTIME_IMAGE} AS runtime
ENV NODE_ENV=production PORT=4100
COPY --from=build /opt/openssl /opt/openssl
RUN echo /opt/openssl > /etc/ld.so.conf.d/openssl3.conf && ldconfig
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma/schema.prisma ./apps/api/prisma/schema.prisma
WORKDIR /app/apps/api
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4100)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
