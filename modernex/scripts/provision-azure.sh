#!/usr/bin/env bash
# =============================================================================
# provision-azure.sh — One-time Azure + GitHub CI/CD setup for Modernex
#
# Usage:
#   chmod +x scripts/provision-azure.sh
#   ./scripts/provision-azure.sh
#
# Re-running is safe (all steps are idempotent).
# Requires: Azure CLI (az), openssl
# Optional: GitHub CLI (gh) — if absent, prints manual secret instructions
# =============================================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
RESOURCE_GROUP="modernex-rg"
LOCATION="southindia"
PLAN_NAME="modernex-plan"
APP_NAME="modernex-prod"
RUNTIME="NODE:22-lts"
SP_NAME="modernex-deploy"
GITHUB_REPO="subugovindh-byte/msl-release-one"     # owner/repo on GitHub
# ─────────────────────────────────────────────────────────────────────────────

# Colours
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

# ── 0. Pre-flight checks ──────────────────────────────────────────────────────
step "0/6  Pre-flight checks"

command -v az     >/dev/null 2>&1 || die "Azure CLI (az) not found. Install from https://aka.ms/installazurecli"
command -v openssl >/dev/null 2>&1 || die "openssl not found."

# Ensure az is logged in
az account show --query "id" -o tsv >/dev/null 2>&1 || {
  info "Not logged in — launching 'az login'..."
  az login
}

SUBSCRIPTION_ID=$(az account show --query "id" -o tsv)
success "Subscription: $(az account show --query 'name' -o tsv)  ($SUBSCRIPTION_ID)"

# ── 1. Resource Group ─────────────────────────────────────────────────────────
step "1/6  Resource Group"

if [[ $(az group exists -n "$RESOURCE_GROUP") == "true" ]]; then
  success "Resource group '$RESOURCE_GROUP' already exists — skipping."
else
  info "Creating resource group '$RESOURCE_GROUP' in '$LOCATION'..."
  az group create -n "$RESOURCE_GROUP" -l "$LOCATION" --output none
  success "Created resource group '$RESOURCE_GROUP'."
fi

# ── 2. App Service Plan (F1 Free) ─────────────────────────────────────────────
step "2/6  App Service Plan (F1 Free — ₹0/month)"

if az appservice plan show -g "$RESOURCE_GROUP" -n "$PLAN_NAME" --output none 2>/dev/null; then
  success "App Service Plan '$PLAN_NAME' already exists — skipping."
else
  info "Creating App Service Plan '$PLAN_NAME' (F1 Linux)..."
  az appservice plan create \
    -g "$RESOURCE_GROUP" -n "$PLAN_NAME" \
    --sku F1 --is-linux \
    --output none
  success "Created App Service Plan '$PLAN_NAME'."
fi

# ── 3. Web App ────────────────────────────────────────────────────────────────
step "3/6  Web App"

if az webapp show -g "$RESOURCE_GROUP" -n "$APP_NAME" --output none 2>/dev/null; then
  success "Web App '$APP_NAME' already exists — skipping creation."
else
  info "Creating Web App '$APP_NAME' ($RUNTIME)..."
  az webapp create \
    -g "$RESOURCE_GROUP" -p "$PLAN_NAME" -n "$APP_NAME" \
    --runtime "$RUNTIME" \
    --output none
  success "Created Web App '$APP_NAME'."
fi

APP_URL="https://${APP_NAME}.azurewebsites.net"
success "URL: $APP_URL"

# ── 4. App Settings ───────────────────────────────────────────────────────────
step "4/6  Application Settings"

# Generate a fresh JWT secret only if one isn't already set
EXISTING_JWT=$(az webapp config appsettings list \
  -g "$RESOURCE_GROUP" -n "$APP_NAME" \
  --query "[?name=='JWT_SECRET'].value" -o tsv 2>/dev/null || true)

if [[ -n "$EXISTING_JWT" ]]; then
  info "JWT_SECRET already set — keeping existing value."
  JWT_SECRET="$EXISTING_JWT"
else
  JWT_SECRET=$(openssl rand -hex 32)
  info "Generated new JWT_SECRET."
fi

info "Applying application settings..."
az webapp config appsettings set \
  -g "$RESOURCE_GROUP" -n "$APP_NAME" \
  --settings \
    NODE_ENV=production \
    "DB_PATH=/home/data/modernex.db" \
    "JWT_SECRET=${JWT_SECRET}" \
    JWT_EXPIRY=8h \
    REFRESH_EXPIRY=30d \
    BCRYPT_ROUNDS=12 \
    PORT=8080 \
    "CORS_ORIGIN=${APP_URL}" \
    SCM_DO_BUILD_DURING_DEPLOYMENT=false \
    LOG_LEVEL=info \
  --output none

success "Application settings applied."
warn "  DB_PATH=/home/data/modernex.db  (persists across deployments — outside wwwroot)"
warn "  To add SMTP/WhatsApp/GST keys later: az webapp config appsettings set -g $RESOURCE_GROUP -n $APP_NAME --settings KEY=VALUE"

# ── 5. Service Principal for GitHub Actions ───────────────────────────────────
step "5/6  Service Principal (GitHub Actions CI/CD)"

SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}"

# Check if SP already exists
EXISTING_SP_ID=$(az ad sp list --display-name "$SP_NAME" --query "[0].appId" -o tsv 2>/dev/null || true)

if [[ -n "$EXISTING_SP_ID" && "$EXISTING_SP_ID" != "None" ]]; then
  warn "Service principal '$SP_NAME' already exists (appId: $EXISTING_SP_ID)."
  warn "Cannot re-export its secret. Delete it first if you need fresh credentials:"
  warn "  az ad sp delete --id $EXISTING_SP_ID"
  CREDS_JSON=""
else
  info "Creating service principal '$SP_NAME'..."
  CREDS_JSON=$(az ad sp create-for-rbac \
    --name "$SP_NAME" \
    --role contributor \
    --scopes "$SCOPE" \
    --sdk-auth \
    --output json 2>/dev/null)
  success "Service principal '$SP_NAME' created."
fi

# ── 6. Set GitHub Secret ──────────────────────────────────────────────────────
step "6/6  GitHub Secret (AZURE_CREDENTIALS)"

if [[ -z "$CREDS_JSON" ]]; then
  warn "No new credentials to set (SP already existed)."
elif command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  info "GitHub CLI found — setting secret automatically..."
  echo "$CREDS_JSON" | gh secret set AZURE_CREDENTIALS --repo "$GITHUB_REPO"
  success "Secret AZURE_CREDENTIALS set on $GITHUB_REPO via GitHub CLI."
else
  # Save credentials to a temp file and instruct user
  CREDS_FILE="$(dirname "$0")/../.azure-deploy-creds.json"
  echo "$CREDS_JSON" > "$CREDS_FILE"
  echo ""
  echo -e "${YELLOW}══════════════════════════════════════════════════════════════${NC}"
  echo -e "${YELLOW}  MANUAL STEP REQUIRED — GitHub CLI (gh) not found${NC}"
  echo -e "${YELLOW}══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "  1. Open: ${CYAN}https://github.com/${GITHUB_REPO}/settings/secrets/actions${NC}"
  echo -e "  2. Click ${GREEN}New repository secret${NC}"
  echo -e "  3. Name:  ${GREEN}AZURE_CREDENTIALS${NC}"
  echo -e "  4. Value: contents of ${YELLOW}$(realpath "$CREDS_FILE")${NC}"
  echo ""
  echo -e "  After setting the secret, ${RED}delete the file:${NC}"
  echo -e "  ${CYAN}rm $(realpath "$CREDS_FILE")${NC}"
  echo -e "${YELLOW}══════════════════════════════════════════════════════════════${NC}"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  App URL:       ${CYAN}${APP_URL}${NC}"
echo -e "  Health check:  ${CYAN}${APP_URL}/api/health${NC}"
echo -e "  Azure Portal:  ${CYAN}https://portal.azure.com/#resource/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RESOURCE_GROUP}${NC}"
echo -e "  GitHub Actions:${CYAN}https://github.com/${GITHUB_REPO}/actions${NC}"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo -e "  1. Set AZURE_CREDENTIALS secret in GitHub (see above if not done)"
echo -e "  2. Push to 'main' branch — deployment triggers automatically"
echo -e "  3. On first deploy, run: ${CYAN}python scripts/sample_tx.py${NC}  (optional sample data)"
echo ""
