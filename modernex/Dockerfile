# ══════════════════════════════════════════════════════════════════════════
# Modernex Stones — production image
#
# WHY THIS EXISTS:
#   Prod used to assemble node_modules ON the server — Oryx at deploy time,
#   Kudu by hand, startup.sh at boot. The native deps (better-sqlite3, bcrypt)
#   then ended up compiled against whichever Node happened to run npm, and the
#   SCM/Kudu container is Node 18 while the runtime is Node 22. That took prod
#   down twice:
#     - Aug 2026: ERR_MODULE_NOT_FOUND (ESM ignores NODE_PATH)
#     - Sep 2026: NODE_MODULE_VERSION 108 vs 127 (better_sqlite3.node)
#
#   Here the native addons are installed in the SAME image that runs them, so
#   an ABI mismatch is structurally impossible. Nothing is built on the server.
#
# BUILD:  az acr build -r <registry> -t modernex/api:<tag> -f Dockerfile .
# ══════════════════════════════════════════════════════════════════════════

# Pinned deliberately: the runtime Node version is a property of the image,
# not of whatever the platform happens to provide.
ARG NODE_IMAGE=node:22-bookworm-slim

# ─── STAGE 1: production dependencies ─────────────────────────────────────
# Resolved by `npm ci --omit=dev` from the lockfile rather than by pruning a
# dev tree, so what ships is exactly what the lockfile says.
FROM ${NODE_IMAGE} AS deps-prod
WORKDIR /app

# Toolchain so a native dep can compile from source if no prebuilt binary
# matches this platform. Without it, a missing prebuild fails the build.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/api/package.json    ./packages/api/
COPY packages/web/package.json    ./packages/web/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --omit=dev --no-audit --no-fund

# ─── STAGE 2: build the web bundle ────────────────────────────────────────
# Needs the full dev tree: the web build is `tsc && vite build`.
FROM ${NODE_IMAGE} AS builder
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/api/package.json    ./packages/api/
COPY packages/web/package.json    ./packages/web/
COPY packages/shared/package.json ./packages/shared/

# NODE_ENV must not be "production" here or npm skips devDependencies and the
# build dies with `sh: 1: tsc: not found` — exactly how the Oryx build failed.
ENV NODE_ENV=development
RUN npm ci --no-audit --no-fund

COPY packages/ ./packages/

# shared: no build step. api: runs JS directly. Only web produces artifacts.
RUN npm run build -w @modernex/web

# ─── STAGE 3: runtime ─────────────────────────────────────────────────────
# Same base image as the stage that installed the addons, so the compiled
# .node files match this Node's ABI.
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl tzdata \
 && rm -rf /var/lib/apt/lists/*
ENV TZ=Asia/Kolkata

# Production dependency tree (stage 1).
COPY --from=deps-prod /app/node_modules ./node_modules
# Application source + the built web bundle at packages/web/dist, which
# server.js serves statically via path.join(__dirname, '../../web/dist').
COPY --from=builder   /app/packages     ./packages
COPY --from=builder   /app/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=8080
# Local/compose default. In Azure the DB_PATH app setting overrides this to
# /home/data/modernex.db, which lives on the mounted persistent share.
ENV DB_PATH=/app/data/modernex.db

RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:8080/api/health || exit 1

CMD ["node", "packages/api/src/server.js"]
