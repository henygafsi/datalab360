# syntax=docker/dockerfile:1
# Frontend — Next.js 14 (App Router) in a pnpm Turborepo, app = apps/data360 (pkg "iso").
# Uses Next standalone output. Build context = the FRONT repo root.
#   docker build -f deploy/frontend.Dockerfile -t data360-web:$(git rev-parse --short HEAD) .
# Requires apps/data360/next.config.mjs → `output: 'standalone'` (add if absent).

# ---- deps: install once, cache on lockfile ----
FROM node:20-slim AS deps
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* turbo.json* .npmrc* ./
COPY apps/data360/package.json apps/data360/package.json
# copy any other workspace manifests the app depends on (packages/*) if present
COPY packages* ./packages/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter data360... || pnpm install --frozen-lockfile

# ---- builder: build only the target app ----
FROM deps AS builder
WORKDIR /repo
COPY . .
# public build-time env only (NEXT_PUBLIC_*). Secrets are runtime env, never baked.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production
RUN pnpm --filter data360 build

# ---- runtime: standalone server, non-root ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd -r app && useradd -r -g app app
WORKDIR /srv
# standalone output bundles the minimal server + traced node_modules
COPY --from=builder --chown=app:app /repo/apps/data360/.next/standalone ./
COPY --from=builder --chown=app:app /repo/apps/data360/.next/static ./apps/data360/.next/static
COPY --from=builder --chown=app:app /repo/apps/data360/public ./apps/data360/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"
CMD ["node","apps/data360/server.js"]
