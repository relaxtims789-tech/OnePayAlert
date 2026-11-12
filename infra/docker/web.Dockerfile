# syntax=docker/dockerfile:1.7
# One PayAlert web dashboards (Next.js standalone). Build from the repository root:
#   docker build -f infra/docker/web.Dockerfile --build-arg APP=merchant-web -t onepay-merchant-web .
#   docker build -f infra/docker/web.Dockerfile --build-arg APP=admin-web    -t onepay-admin-web .
# All settings (API_URL, REALTIME_URL, SESSION_COOKIE_PREFIX, COOKIE_SECURE) are read at runtime,
# so the same image serves demo and production.
ARG NODE_IMAGE=node:24.21.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
ARG APP
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/web-core/package.json packages/web-core/
COPY apps/${APP}/package.json apps/${APP}/
RUN test -n "$APP" && npm ci -w @onepay/shared -w @onepay/ui -w @onepay/web-core -w @onepay/${APP} --include-workspace-root --ignore-scripts
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/${APP} apps/${APP}
RUN npm run build -w @onepay/shared \
 && cd apps/${APP} && NEXT_OUTPUT=standalone npx next build

FROM ${NODE_IMAGE} AS runtime
ARG APP
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/${APP}/.next/static ./apps/${APP}/.next/static
RUN ln -s /app/apps/${APP}/server.js /app/server.js
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
