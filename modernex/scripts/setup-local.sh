#!/usr/bin/env bash
# =============================================================================
# setup-local.sh — First-time local development environment setup
#
# Usage:
#   chmod +x scripts/setup-local.sh
#   ./scripts/setup-local.sh
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

step() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}  $*${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Move to repo root (modernex/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# ── 1. Node.js ────────────────────────────────────────────────────────────────
step "1/4  Node.js"

if ! command -v node >/dev/null 2>&1; then
  die "Node.js not found. Install from https://nodejs.org (v20+) or use nvm:\n  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash"
fi

NODE_VER=$(node -e "process.exit(parseInt(process.version.slice(1)) < 20 ? 1 : 0)" 2>/dev/null && echo "ok" || echo "old")
if [[ "$NODE_VER" == "old" ]]; then
  die "Node.js v20+ required. Current: $(node --version)"
fi

success "Node.js $(node --version)  |  npm $(npm --version)"

# ── 2. Install dependencies ───────────────────────────────────────────────────
step "2/4  Install dependencies"

if [[ -d node_modules ]]; then
  info "node_modules exists — running npm install to sync any changes..."
  npm install
else
  info "Running npm install..."
  npm install
fi

success "Dependencies installed."

# ── 3. Environment file ───────────────────────────────────────────────────────
step "3/4  Environment file"

ENV_FILE="packages/api/.env"
EXAMPLE_FILE=".env.example"

if [[ -f "$ENV_FILE" ]]; then
  success ".env already exists at $ENV_FILE — skipping."
else
  if [[ -f "$EXAMPLE_FILE" ]]; then
    cp "$EXAMPLE_FILE" "$ENV_FILE"
    # Generate a dev JWT secret automatically
    DEV_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "dev-secret-change-before-prod")
    sed -i.bak "s/replace-with-32-byte-random-hex-in-production/${DEV_SECRET}/" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
    success "Created $ENV_FILE from .env.example with generated JWT_SECRET."
    warn "Review $ENV_FILE and set ADMIN_PASSWORD before first run."
  else
    warn ".env.example not found — creating minimal .env..."
    cat > "$ENV_FILE" << 'ENVEOF'
NODE_ENV=development
PORT=8080
DB_PATH=./data/modernex.db
JWT_SECRET=dev-secret-change-before-production
ADMIN_USERNAME=admin
ADMIN_NAME=Administrator
ADMIN_PASSWORD=changeme123
CORS_ORIGIN=http://localhost:5173
ENVEOF
    success "Created minimal $ENV_FILE."
  fi
fi

# ── 4. Database & seed check ──────────────────────────────────────────────────
step "4/4  Database"

DB_PATH="packages/api/data/modernex.db"
if [[ -f "$DB_PATH" ]]; then
  success "Database exists at $DB_PATH."
  DB_SIZE=$(du -sh "$DB_PATH" | cut -f1)
  info "Size: $DB_SIZE"
else
  info "No database yet — it will be created (with migrations) on first server start."
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Local setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${YELLOW}Start dev servers:${NC}"
echo -e "    ${CYAN}npm run dev${NC}              — API + web (hot-reload)"
echo -e "    ${CYAN}npm run dev:api${NC}          — API only (port 8080)"
echo -e "    ${CYAN}npm run dev:web${NC}          — Web only (port 5173)"
echo ""
echo -e "  ${YELLOW}Seed sample data (optional):${NC}"
echo -e "    ${CYAN}python scripts/sample_tx.py${NC}       — seed"
echo -e "    ${CYAN}python scripts/sample_tx.py --purge${NC} — purge sample data"
echo ""
echo -e "  ${YELLOW}Run tests:${NC}"
echo -e "    ${CYAN}npm test${NC}                 — unit tests"
echo -e "    ${CYAN}npm run test:e2e${NC}         — Playwright e2e"
echo ""
