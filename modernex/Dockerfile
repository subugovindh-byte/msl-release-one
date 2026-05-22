# ══════════════════════════════════════════
# Multi-stage build for Modernex Stones
# Final image: ~180 MB
# ══════════════════════════════════════════

# ─── BUILD STAGE ───
FROM node:20-alpine AS builder

WORKDIR /app

# Install build deps for better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy manifests
COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/web/package.json ./packages/web/
COPY packages/shared/package.json ./packages/shared/

# Install all deps (including dev for vite build)
RUN npm ci

# Copy sources
COPY packages/ ./packages/

# Build frontend
RUN npm run build -w @modernex/web

# Prune dev dependencies for production
RUN npm prune --production --workspaces

# ─── RUNTIME STAGE ───
FROM node:20-alpine AS runtime

WORKDIR /app

# Health check utility
RUN apk add --no-cache curl tzdata
ENV TZ=Asia/Kolkata

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/package.json ./

# Persistent data directory (mount volume here)
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/app/data/modernex.db

CMD ["node", "packages/api/src/server.js"]
