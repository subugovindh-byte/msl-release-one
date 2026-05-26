#!/usr/bin/env bash
# ============================================================================
# MODERNEX ERP — Management Script
# Usage: ./scripts/mnx.sh <command> [env] [args]
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROD_URL="${PROD_URL:-https://modernex-prod.azurewebsites.net}"
LOCAL_URL="${LOCAL_URL:-http://localhost:8080}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-Admin@123}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "${RED}✗${NC} $*"; exit 1; }
hdr()  { echo -e "\n${CYAN}━━ $* ━━${NC}"; }

_confirm() {
  local prompt="${1}" expected="${2:-yes}"
  read -rp "  ${prompt}: " answer
  [[ "$answer" == "$expected" ]] || { echo "Aborted."; exit 0; }
}

_resolve_base() {
  case "${1:-local}" in
    prod|production) echo "$PROD_URL" ;;
    local|dev)       echo "$LOCAL_URL" ;;
    *) err "Unknown env '${1}'. Use: local | prod" ;;
  esac
}

# ── HTTP helpers ──────────────────────────────────────────────────────────────
_api_login() {
  local base="$1"
  local token
  token=$(curl -sf -X POST "${base}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${ADMIN_USER}\",\"password\":\"${ADMIN_PASS}\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])" 2>/dev/null) \
    || err "Login failed — check ADMIN_USER / ADMIN_PASS"
  echo "$token"
}

_api_post() {
  local base="$1" path="$2" token="$3"
  curl -sf -X POST "${base}${path}" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json"
}

_api_get() {
  local base="$1" path="$2" token="$3"
  curl -sf "${base}${path}" -H "Authorization: Bearer ${token}"
}

_jq_msg() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message', d.get('action','done')))" 2>/dev/null || true; }

# ── Help ──────────────────────────────────────────────────────────────────────
cmd_help() {
  cat <<HELP

${CYAN}MODERNEX ERP — mnx.sh${NC}

${YELLOW}LOCAL DEV${NC}
  dev                     Start dev server (API + Web hot-reload)
  test                    Run unit test suite
  test:e2e                Run Playwright end-to-end tests
  build                   Build web + API bundles for production

${YELLOW}DEPLOYMENT${NC}
  deploy                  Build + git push → triggers Azure CI/CD
  status                  Health check: local + production + CI/CD
  logs                    Tail Azure App Service live logs

${YELLOW}DATA MANAGEMENT${NC}  (env = local | prod, default: local)
  sample        [env]     Seed all sample/demo data (customers, payroll,
                            sales, assets, bank, GST, TDS…)
  purge         [env]     Remove SAMPLE-* rows only (safe — keeps real data)
  purgeall      [env]     Wipe ALL transactional data (user accounts kept)

${YELLOW}BACKUP${NC}
  backup        [env]     Trigger backup → uploads compressed .db.gz to Azure Blob
  backups       [env]     List backup records (server registry)

${YELLOW}USER MANAGEMENT${NC}
  users         [env]     List all user accounts
  adduser       [env]     Create a new user (interactive)
  resetpwd      [env] <username>   Reset a user's password

${YELLOW}GO-LIVE${NC}
  go-live                 Full sequence: test → build → purgeall prod → deploy

${CYAN}ENVIRONMENT VARS${NC}
  PROD_URL    = ${PROD_URL}
  LOCAL_URL   = ${LOCAL_URL}
  ADMIN_USER  = ${ADMIN_USER}
  ADMIN_PASS  = (set via env var)

${CYAN}EXAMPLES${NC}
  ./scripts/mnx.sh dev
  ./scripts/mnx.sh status
  ./scripts/mnx.sh sample local
  ./scripts/mnx.sh purgeall prod
  ./scripts/mnx.sh backup prod
  ./scripts/mnx.sh users prod
  ./scripts/mnx.sh go-live

HELP
}

# ── Dev / Build / Deploy ──────────────────────────────────────────────────────
cmd_dev() {
  hdr "Starting dev server"
  cd "$ROOT"
  exec npm run dev
}

cmd_test() {
  hdr "Running unit tests"
  cd "$ROOT"
  npm test
  ok "Tests passed"
}

cmd_test_e2e() {
  hdr "Running Playwright e2e tests"
  cd "$ROOT"
  npm run test:e2e
  ok "E2E tests passed"
}

cmd_build() {
  hdr "Building bundles"
  cd "$ROOT"
  npm run build
  ok "Build complete"
}

cmd_deploy() {
  hdr "Deploying to Azure"
  cmd_build
  cd "$ROOT"
  if git diff --cached --quiet; then
    warn "Nothing new staged — pushing existing HEAD"
  else
    git commit -m "chore: production build $(date '+%Y-%m-%d %H:%M')"
  fi
  git push origin main
  ok "Pushed → GitHub Actions CI/CD will deploy to Azure"
  echo -e "\n  Monitor: gh run list --limit 3\n  Health:  ${PROD_URL}/api/health"
}

cmd_status() {
  hdr "Health check"
  echo -n "  Local  (${LOCAL_URL}) ... "
  if curl -sf --max-time 3 "${LOCAL_URL}/api/health" \
       | python3 -c "import sys,json; assert json.load(sys.stdin)['status']=='ok'" 2>/dev/null
  then ok "online"; else warn "offline"; fi

  echo -n "  Prod   (${PROD_URL}) ... "
  if curl -sf --max-time 10 "${PROD_URL}/api/health" \
       | python3 -c "import sys,json; assert json.load(sys.stdin)['status']=='ok'" 2>/dev/null
  then ok "online"; else warn "offline"; fi

  echo ""
  echo "  CI/CD: $(gh run list --limit 1 --json status,conclusion,createdAt 2>/dev/null \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print(r[0]['status'],'/',r[0]['conclusion'],'@',r[0]['createdAt'][:16])" 2>/dev/null \
    || echo 'gh cli not available')"
}

cmd_logs() {
  hdr "Azure App Service logs"
  az webapp log tail --name modernex-prod --resource-group modernex-rg 2>/dev/null \
    || err "az CLI not logged in. Run: az login"
}

# ── Data Management ───────────────────────────────────────────────────────────
cmd_sample() {
  local env="${1:-local}" base
  base=$(_resolve_base "$env")
  hdr "Seed sample data — ${env} (${base})"
  warn "Inserts demo data: customers, invoices, payroll, TDS, bank, assets, GST…"
  _confirm "Type 'yes' to confirm"

  echo -n "  Logging in ... "
  local token; token=$(_api_login "$base"); ok ""

  echo -n "  Seeding ... "
  _api_post "$base" "/api/admin/sample-tx" "$token" | python3 -c "
import sys, json
d = json.load(sys.stdin)
seeded = d.get('seeded', [])
print(f'OK — {len(seeded)} item(s) seeded')
for s in seeded:
    print(f'    {s}')
" 2>/dev/null
  ok "Sample data loaded"
}

cmd_purge() {
  local env="${1:-local}" base
  base=$(_resolve_base "$env")
  hdr "Purge SAMPLE-* rows — ${env} (${base})"
  warn "Removes only rows tagged SAMPLE-* (demo data). Real data is untouched."
  _confirm "Type 'yes' to confirm"

  echo -n "  Logging in ... "
  local token; token=$(_api_login "$base"); ok ""

  echo -n "  Purging sample rows ... "
  _api_post "$base" "/api/admin/sample-tx/purge" "$token" | python3 -c "
import sys, json
d = json.load(sys.stdin)
removed = d.get('removed', [])
print(f'OK — {len(removed)} table(s) cleared')
for r in removed:
    print(f'    {r}')
" 2>/dev/null
  ok "Sample data removed"
}

cmd_purgeall() {
  local env="${1:-local}" base
  base=$(_resolve_base "$env")
  hdr "Purge ALL transaction data — ${env} (${base})"
  echo ""
  echo "  Wipes ALL transactional data:"
  echo "  invoices, payments, payroll, TDS, bank, assets, journals, HR, sales, GST…"
  echo ""
  echo "  User accounts and roles are preserved."
  echo ""
  warn "ALL data entered via the UI will be permanently deleted."
  _confirm "Type 'purgeall' to confirm" "purgeall"

  echo -n "  Logging in ... "
  local token; token=$(_api_login "$base"); ok ""

  echo -n "  Purging all transactions ... "
  _api_post "$base" "/api/admin/sample-tx/purgeall" "$token" | python3 -c "
import sys, json
d = json.load(sys.stdin)
removed = d.get('removed', [])
print(f'OK — {len(removed)} table(s) cleared')
for r in removed:
    print(f'    {r}')
" 2>/dev/null
  ok "All transaction data cleared — user accounts retained"
}

# ── Backup ────────────────────────────────────────────────────────────────────
cmd_backup() {
  local env="${1:-local}" base
  base=$(_resolve_base "$env")
  hdr "Backup — ${env} (${base})"

  echo -n "  Logging in ... "
  local token; token=$(_api_login "$base"); ok ""

  echo -n "  Triggering backup (gzip → Azure Blob) ... "
  _api_post "$base" "/api/backups/trigger" "$token" | python3 -c "
import sys, json
d = json.load(sys.stdin)
result = d.get('result', {})
blob = result.get('blobPath', result.get('blob', '?'))
size_kb = result.get('sizeBytes', 0) // 1024
sha = (result.get('sha256') or '')[:12]
print(f'{blob}  ({size_kb} KB  sha256:{sha}…)')
" 2>/dev/null \
    && ok "Backup complete" \
    || warn "Backup failed or Azure Blob not configured (AZURE_STORAGE_CONNECTION_STRING)"
}

cmd_backups() {
  local env="${1:-local}" base
  base=$(_resolve_base "$env")
  hdr "Backup list — ${env} (${base})"

  echo -n "  Logging in ... "
  local token; token=$(_api_login "$base"); ok ""

  echo ""
  _api_get "$base" "/api/backups?limit=20" "$token" | python3 -c "
import sys, json
data = json.load(sys.stdin)
backups = data.get('backups', [])
if not backups:
    print('  (no backups recorded)')
    sys.exit(0)
print(f\"  {'Blob Path':<60} {'KB':>6}  {'Trigger':<10} Created\")
print(f\"  {'-'*60} {'-'*6}  {'-'*10} {'-'*19}\")
for b in backups:
    kb   = (b.get('size_bytes') or b.get('sizeBytes') or 0) // 1024
    trig = b.get('trigger','?')
    ts   = (b.get('created_at') or b.get('createdAt',''))[:19].replace('T',' ')
    path = b.get('blob_path') or b.get('blobPath','?')
    print(f'  {path:<60} {kb:>6}  {trig:<10} {ts}')
print(f'\n  Total: {len(backups)} backup(s)')
" 2>/dev/null
}

# ── User Management ───────────────────────────────────────────────────────────
cmd_users() {
  local env="${1:-local}" base
  base=$(_resolve_base "$env")
  hdr "User accounts — ${env} (${base})"

  echo -n "  Logging in ... "
  local token; token=$(_api_login "$base"); ok ""

  _api_get "$base" "/api/users" "$token" | python3 -c "
import sys, json
G = '\033[0;32m'; R = '\033[0;31m'; NC = '\033[0m'
data = json.load(sys.stdin)
users = data.get('users', data) if isinstance(data, dict) else data
if not users:
    print('  No users found.'); sys.exit(0)
print(f\"\n  {'Username':<18} {'Full Name':<22} {'Role':<12} {'Email':<28} {'Active'}\")
print(f\"  {'-'*18} {'-'*22} {'-'*12} {'-'*28} {'-'*6}\")
for u in users:
    active = f'{G}yes{NC}' if u.get('active', u.get('is_active', True)) else f'{R}no {NC}'
    role   = u.get('role') or (u.get('roles') or [{}])[0].get('name','')
    email  = u.get('email','')
    print(f\"  {u.get('username',''):<18} {u.get('fullName', u.get('full_name','')):<22} {role:<12} {email:<28} {active}\")
print(f\"\n  Total: {len(users)} user(s)\")
" 2>/dev/null
}

cmd_adduser() {
  local env="${1:-local}" base
  base=$(_resolve_base "$env")
  hdr "Add user — ${env} (${base})"

  echo -n "  Logging in ... "
  local token; token=$(_api_login "$base"); ok ""
  echo ""

  read -rp "  Username      : " username
  read -rp "  Full name     : " full_name
  read -rp "  Email         : " email
  read -rp "  Phone         : " phone
  echo "  Roles: admin | accounts | sales | yard | viewer"
  read -rp "  Role          : " role
  read -rsp "  Password (blank = auto-generate): " password; echo ""

  [[ -n "$username" && -n "$full_name" ]] || err "Username and full name are required"
  role="${role:-viewer}"

  local payload
  if [[ -n "$password" ]]; then
    payload=$(python3 -c "import json; print(json.dumps({'username':'$username','full_name':'$full_name','email':'$email','phone':'$phone','role':'$role','password':'$password','must_change_password': True}))")
  else
    payload=$(python3 -c "import json; print(json.dumps({'username':'$username','full_name':'$full_name','email':'$email','phone':'$phone','role':'$role','must_change_password': True}))")
  fi

  echo -n "  Creating user '$username' ... "
  curl -sf -X POST "${base}/api/users" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d "$payload" | python3 -c "
import sys, json
Y = '\033[1;33m'; NC = '\033[0m'
d = json.load(sys.stdin)
u = d.get('user', d)
temp = d.get('generated_password') or d.get('tempPassword')
print(f\"Created — id={u.get('id')}\")
if temp:
    print(f'\n  {Y}Temp password: {temp}{NC}')
    print('  Share this with the user — shown only once.')
" 2>/dev/null
  ok ""
}

cmd_resetpwd() {
  local env="${1:-local}" username="${2:-}" base
  [[ -n "$username" ]] || err "Usage: ./scripts/mnx.sh resetpwd [env] <username>"
  base=$(_resolve_base "$env")
  hdr "Reset password — ${env} (${base})"

  echo -n "  Logging in ... "
  local token; token=$(_api_login "$base"); ok ""

  # Find user id
  local user_id
  user_id=$(_api_get "$base" "/api/users" "$token" \
    | python3 -c "
import sys, json
data = json.load(sys.stdin)
users = data.get('users', data) if isinstance(data, dict) else data
u = next((x for x in users if x.get('username')=='$username'), None)
print(u['id'] if u else '')
" 2>/dev/null)
  [[ -n "$user_id" ]] || err "User '$username' not found"

  read -rsp "  New password (blank = auto-generate): " password; echo ""
  local payload
  if [[ -n "$password" ]]; then
    payload=$(python3 -c "import json; print(json.dumps({'password':'$password'}))")
  else
    payload="{}"
  fi

  echo -n "  Resetting password for '$username' ... "
  curl -sf -X POST "${base}/api/users/${user_id}/reset-password" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    -d "$payload" | python3 -c "
import sys, json
Y = '\033[1;33m'; NC = '\033[0m'
d = json.load(sys.stdin)
temp = d.get('generated_password') or d.get('tempPassword')
print('Done')
if temp:
    print(f'\n  {Y}Temp password: {temp}{NC}')
    print('  Share this with the user — shown only once.')
" 2>/dev/null
  ok ""
}

# ── Go-live ───────────────────────────────────────────────────────────────────
cmd_golive() {
  cat <<'BANNER'

  ╔══════════════════════════════════════════╗
  ║   MODERNEX ERP — GO-LIVE SEQUENCE       ║
  ║   test → build → purgeall prod → deploy ║
  ╚══════════════════════════════════════════╝

BANNER
  warn "Step 3 will purge ALL transaction data in PRODUCTION (user accounts kept)."
  _confirm "Type 'go-live' to confirm" "go-live"

  hdr "Step 1/4 — Run unit tests"
  cmd_test

  hdr "Step 2/4 — Build bundles"
  cmd_build

  hdr "Step 3/4 — Purge production data"
  echo -n "  Logging in to production ... "
  local token; token=$(_api_login "$PROD_URL"); ok ""
  echo -n "  Purging all transactions ... "
  _api_post "$PROD_URL" "/api/admin/sample-tx/purgeall" "$token" | python3 -c "
import sys, json; d = json.load(sys.stdin); print(f\"{len(d.get('removed',[]))} table(s) cleared\")
" 2>/dev/null
  ok "Production data cleared (user accounts retained)"

  hdr "Step 4/4 — Deploy to Azure"
  git push origin main
  ok "Pushed. Azure CI/CD will build → staging → swap to production."

  echo ""
  ok "Go-live complete!"
  echo ""
  echo "  Monitor CI: gh run list --limit 3"
  echo "  Health:     ${PROD_URL}/api/health"
  echo "  App:        ${PROD_URL}"
  echo ""
  warn "Reminder: set JWT_SECRET and strong ADMIN_PASS in Azure App Settings."
}

# ── Dispatch ──────────────────────────────────────────────────────────────────
cd "$ROOT"
cmd="${1:-help}"; shift || true

case "$cmd" in
  dev)                    cmd_dev "$@" ;;
  test)                   cmd_test "$@" ;;
  test:e2e|e2e)           cmd_test_e2e "$@" ;;
  build)                  cmd_build "$@" ;;
  deploy)                 cmd_deploy "$@" ;;
  status)                 cmd_status "$@" ;;
  logs)                   cmd_logs "$@" ;;
  sample)                 cmd_sample "$@" ;;
  purge)                  cmd_purge "$@" ;;
  purgeall)               cmd_purgeall "$@" ;;
  backup)                 cmd_backup "$@" ;;
  backups)                cmd_backups "$@" ;;
  users)                  cmd_users "$@" ;;
  adduser)                cmd_adduser "$@" ;;
  resetpwd)               cmd_resetpwd "$@" ;;
  go-live|golive)         cmd_golive ;;
  help|-h|--help)         cmd_help ;;
  *) err "Unknown command: '$cmd'. Run: ./scripts/mnx.sh help" ;;
esac
