#!/usr/bin/env python3
"""
MODERNEX ERP — Management CLI
Usage: python scripts/mnx.py <command> [env] [args]
"""
import os, sys, json, subprocess, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────
ROOT       = Path(__file__).parent.parent.resolve()
PROD_URL   = os.environ.get("PROD_URL",   "https://modernex-prod.azurewebsites.net")
LOCAL_URL  = os.environ.get("LOCAL_URL",  "http://localhost:8080")
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "Admin@123")

# ── Terminal colours ──────────────────────────────────────────────────────────
GREEN  = "\033[0;32m"; YELLOW = "\033[1;33m"
RED    = "\033[0;31m"; CYAN   = "\033[0;36m"; RESET = "\033[0m"

def ok(msg):   print(f"{GREEN}✓{RESET} {msg}")
def warn(msg): print(f"{YELLOW}⚠{RESET}  {msg}")
def err(msg):  print(f"{RED}✗{RESET} {msg}"); sys.exit(1)
def hdr(msg):  print(f"\n{CYAN}━━ {msg} ━━{RESET}")

# ── HTTP helpers ──────────────────────────────────────────────────────────────
def http(method, url, *, token=None, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode()}") from e
    except Exception as e:
        raise RuntimeError(str(e)) from e

def api_login(base):
    data = http("POST", f"{base}/api/auth/login",
                body={"username": ADMIN_USER, "password": ADMIN_PASS})
    token = data.get("accessToken")
    if not token:
        err("Login failed — check ADMIN_USER / ADMIN_PASS")
    return token

def api_post(base, path, token, body=None):
    return http("POST", f"{base}{path}", token=token, body=body)

def api_get(base, path, token):
    return http("GET", f"{base}{path}", token=token)

def resolve_base(env):
    env = (env or "local").lower()
    if env in ("prod", "production"): return PROD_URL, "prod"
    if env in ("local", "dev"):       return LOCAL_URL, "local"
    err(f"Unknown env '{env}'. Use: local | prod")

def confirm(prompt, expected="yes"):
    answer = input(f"  {prompt}: ").strip()
    if answer != expected:
        print("Aborted."); sys.exit(0)

def run(cmd, *, cwd=None, check=True):
    result = subprocess.run(cmd, shell=True, cwd=cwd or ROOT, check=check)
    return result.returncode

# ── Commands ──────────────────────────────────────────────────────────────────

def cmd_help():
    print(f"""
{CYAN}MODERNEX ERP — mnx.py{RESET}

{YELLOW}LOCAL DEV{RESET}
  dev                    Start dev server (API + Web hot-reload)
  test                   Run unit test suite
  test:e2e               Run Playwright end-to-end tests
  build                  Build web + API bundles for production

{YELLOW}DEPLOYMENT{RESET}
  deploy                 Build + git push → triggers Azure CI/CD
  status                 Health check: local + production + CI/CD
  logs                   Tail Azure App Service live logs

{YELLOW}DATA MANAGEMENT{RESET}  (env = local | prod, defaults to local)
  sample        [env]    Seed all sample/demo data (customers, payroll,
                           sales, assets, bank, GST, TDS…)
  purge         [env]    Remove SAMPLE-* rows only (safe — keeps real data)
  purgeall      [env]    Wipe ALL transactional data (user accounts kept)

{YELLOW}BACKUP{RESET}
  backup        [env]    Trigger backup → uploads compressed .db.gz to Azure Blob
  backups       [env]    List backup records (server registry)

{YELLOW}USER MANAGEMENT{RESET}
  users         [env]    List all user accounts
  adduser       [env]    Create a new user (interactive)
  resetpwd      [env] <username>   Reset a user's password

{YELLOW}GO-LIVE{RESET}
  go-live                Full sequence: test → build → purgeall prod → deploy

{CYAN}ENVIRONMENT VARS{RESET}
  PROD_URL    = {PROD_URL}
  LOCAL_URL   = {LOCAL_URL}
  ADMIN_USER  = {ADMIN_USER}
  ADMIN_PASS  = (set via env var)

{CYAN}EXAMPLES{RESET}
  python scripts/mnx.py dev
  python scripts/mnx.py status
  python scripts/mnx.py sample local
  python scripts/mnx.py purgeall prod
  python scripts/mnx.py backup prod
  python scripts/mnx.py users prod
  python scripts/mnx.py go-live
""")

# ── Dev / Build / Deploy ──────────────────────────────────────────────────────

def cmd_dev():
    hdr("Starting dev server")
    os.chdir(ROOT)
    os.execvp("npm", ["npm", "run", "dev"])

def cmd_test():
    hdr("Running unit tests")
    run("npm test")
    ok("Tests passed")

def cmd_test_e2e():
    hdr("Running Playwright e2e tests")
    run("npm run test:e2e")
    ok("E2E tests passed")

def cmd_build():
    hdr("Building bundles")
    run("npm run build")
    ok("Build complete")

def cmd_deploy():
    hdr("Deploying to Azure")
    cmd_build()
    staged = subprocess.run("git diff --cached --quiet", shell=True, cwd=ROOT).returncode
    if staged != 0:
        ts = datetime.now().strftime("%Y-%m-%d %H:%M")
        run(f'git commit -m "chore: production build {ts}"')
    else:
        warn("Nothing new staged — pushing existing HEAD")
    run("git push origin main")
    ok("Pushed → GitHub Actions CI/CD will deploy to Azure")
    print(f"\n  Monitor: gh run list --limit 3\n  Health:  {PROD_URL}/api/health")

def cmd_status():
    hdr("Health check")
    for label, url, timeout in [("Local ", LOCAL_URL, 3), ("Prod  ", PROD_URL, 10)]:
        print(f"  {label} ({url}) ... ", end="", flush=True)
        try:
            data = http("GET", f"{url}/api/health", timeout=timeout)
            ok("online") if data.get("status") == "ok" else warn(f"unexpected: {data}")
        except Exception:
            warn("offline")
    print()
    try:
        result = subprocess.run(
            "gh run list --limit 1 --json status,conclusion,createdAt",
            shell=True, capture_output=True, text=True, cwd=ROOT
        )
        runs = json.loads(result.stdout)
        if runs:
            r = runs[0]
            print(f"  CI/CD: {r['status']} / {r['conclusion']} @ {r['createdAt'][:16]}")
    except Exception:
        print("  CI/CD: gh cli not available")

def cmd_logs():
    hdr("Azure App Service logs")
    code = run("az webapp log tail --name modernex-prod --resource-group modernex-rg", check=False)
    if code != 0:
        err("az CLI not logged in. Run: az login")

# ── Data Management ───────────────────────────────────────────────────────────

def cmd_sample(env=None):
    base, label = resolve_base(env)
    hdr(f"Seed sample data — {label} ({base})")
    warn("Inserts demo data: customers, invoices, payroll, TDS, bank, assets, GST…")
    confirm("Type 'yes' to confirm")
    print("  Logging in ... ", end="", flush=True)
    token = api_login(base); ok("")
    print("  Seeding ... ", end="", flush=True)
    try:
        r = api_post(base, "/api/admin/sample-tx", token)
        seeded = r.get("seeded", [])
        print(f"OK — {len(seeded)} item(s) seeded")
        for s in seeded:
            print(f"    {s}")
        ok("Sample data loaded")
    except RuntimeError as e:
        msg = str(e)
        if "409" in msg or "already" in msg.lower():
            warn("Sample data already exists — run 'purge' first to reset")
        else:
            err(f"Seed failed: {msg}")

def cmd_purge(env=None):
    base, label = resolve_base(env)
    hdr(f"Purge SAMPLE-* rows — {label} ({base})")
    warn("Removes only rows tagged SAMPLE-* (demo data). Real data is untouched.")
    confirm("Type 'yes' to confirm")
    print("  Logging in ... ", end="", flush=True)
    token = api_login(base); ok("")
    print("  Purging sample rows ... ", end="", flush=True)
    r = api_post(base, "/api/admin/sample-tx/purge", token)
    removed = r.get("removed", [])
    print(f"OK — {len(removed)} table(s) cleared")
    for item in removed:
        print(f"    {item}")
    ok("Sample data removed")

def cmd_purgeall(env=None):
    base, label = resolve_base(env)
    hdr(f"Purge ALL transaction data — {label} ({base})")
    print(f"""
  Wipes ALL transactional data:
  invoices, payments, payroll, TDS, bank, assets, journals, HR, sales, GST…

  User accounts and roles are preserved.
""")
    warn("ALL data entered via the UI will be permanently deleted.")
    confirm("Type 'purgeall' to confirm", expected="purgeall")
    print("  Logging in ... ", end="", flush=True)
    token = api_login(base); ok("")
    print("  Purging all transactions ... ", end="", flush=True)
    r = api_post(base, "/api/admin/sample-tx/purgeall", token)
    removed = r.get("removed", [])
    print(f"OK — {len(removed)} table(s) cleared")
    for item in removed:
        print(f"    {item}")
    ok("All transaction data cleared — user accounts retained")

# ── Backup ────────────────────────────────────────────────────────────────────

def cmd_backup(env=None):
    base, label = resolve_base(env)
    hdr(f"Backup — {label} ({base})")
    print("  Logging in ... ", end="", flush=True)
    token = api_login(base); ok("")
    print("  Triggering backup (gzip → Azure Blob) ... ", end="", flush=True)
    try:
        r = api_post(base, "/api/backups/trigger", token)
        result = r.get("result", {})
        blob    = result.get("blobPath") or result.get("blob") or "?"
        size_kb = (result.get("sizeBytes") or 0) // 1024
        sha     = (result.get("sha256") or "")[:12]
        ok(f"{blob}  ({size_kb} KB  sha256:{sha}…)")
    except RuntimeError as e:
        msg = str(e)
        if "not configured" in msg.lower() or "azure" in msg.lower():
            warn("Skipped — AZURE_STORAGE_CONNECTION_STRING not set on server")
        else:
            warn(f"Backup failed: {msg}")

def cmd_backups(env=None):
    base, label = resolve_base(env)
    hdr(f"Backup list — {label} ({base})")
    print("  Logging in ... ", end="", flush=True)
    token = api_login(base); ok("")

    data = api_get(base, "/api/backups?limit=20", token)
    backups = data.get("backups", [])

    print()
    if not backups:
        print("  (no backups recorded)")
        return

    print(f"  {'Blob Path':<60} {'KB':>6}  {'Trigger':<10} Created")
    print(f"  {'-'*60} {'-'*6}  {'-'*10} {'-'*19}")
    for b in backups:
        kb   = (b.get("size_bytes") or b.get("sizeBytes") or 0) // 1024
        trig = b.get("trigger", "?")
        ts   = (b.get("created_at") or b.get("createdAt") or "")[:19].replace("T", " ")
        path = b.get("blob_path") or b.get("blobPath") or "?"
        print(f"  {path:<60} {kb:>6}  {trig:<10} {ts}")
    print(f"\n  Total: {len(backups)} backup(s)")

# ── User Management ───────────────────────────────────────────────────────────

def _get_users(base, token):
    data = api_get(base, "/api/users", token)
    return data.get("users", data) if isinstance(data, dict) else data

def cmd_users(env=None):
    base, label = resolve_base(env)
    hdr(f"User accounts — {label} ({base})")
    print("  Logging in ... ", end="", flush=True)
    token = api_login(base); ok("")

    users = _get_users(base, token)
    if not users:
        print("  No users found."); return

    w = 18
    print(f"\n  {'Username':<{w}} {'Full Name':<22} {'Role':<12} {'Email':<28} Active")
    print(f"  {'-'*w} {'-'*22} {'-'*12} {'-'*28} {'-'*6}")
    for u in users:
        active = f"{GREEN}yes{RESET}" if u.get("active", u.get("is_active", True)) else f"{RED}no{RESET} "
        role   = u.get("role") or ((u.get("roles") or [{}])[0].get("name", ""))
        name   = u.get("fullName") or u.get("full_name", "")
        email  = u.get("email", "")
        print(f"  {u.get('username',''):<{w}} {name:<22} {role:<12} {email:<28} {active}")
    print(f"\n  Total: {len(users)} user(s)")

def cmd_adduser(env=None):
    base, label = resolve_base(env)
    hdr(f"Add user — {label} ({base})")
    print("  Logging in ... ", end="", flush=True)
    token = api_login(base); ok("")
    print()

    username  = input("  Username      : ").strip()
    full_name = input("  Full name     : ").strip()
    email     = input("  Email         : ").strip()
    phone     = input("  Phone         : ").strip()
    print("  Roles: admin | accounts | sales | yard | viewer")
    role      = input("  Role          : ").strip().lower() or "viewer"
    password  = input("  Password (blank = auto-generate): ").strip() or None

    if not username or not full_name:
        err("Username and full name are required")

    payload = {
        "username": username, "full_name": full_name,
        "email": email, "phone": phone, "role": role,
        "must_change_password": True,
    }
    if password:
        payload["password"] = password

    print(f"\n  Creating user '{username}' ... ", end="", flush=True)
    try:
        r = api_post(base, "/api/users", token, body=payload)
        u    = r.get("user", r)
        temp = r.get("generated_password") or r.get("tempPassword")
        ok(f"Created — id={u.get('id')}")
        if temp:
            print(f"\n  {YELLOW}Temp password: {temp}{RESET}")
            print("  Share this with the user — shown only once.")
    except RuntimeError as e:
        err(f"Create failed: {e}")

def cmd_resetpwd(env=None, username=None):
    if not username:
        err("Usage: python scripts/mnx.py resetpwd [env] <username>")
    base, label = resolve_base(env)
    hdr(f"Reset password — {label} ({base})")
    print("  Logging in ... ", end="", flush=True)
    token = api_login(base); ok("")

    users = _get_users(base, token)
    user  = next((u for u in users if u.get("username") == username), None)
    if not user:
        err(f"User '{username}' not found")

    new_pass = input(f"  New password for '{username}' (blank = auto-generate): ").strip() or None
    payload  = {}
    if new_pass:
        payload["password"] = new_pass

    print(f"  Resetting password ... ", end="", flush=True)
    try:
        r = http("POST", f"{base}/api/users/{user['id']}/reset-password",
                 token=token, body=payload)
        ok("Done")
        temp = r.get("generated_password") or r.get("tempPassword")
        if temp:
            print(f"\n  {YELLOW}Temp password: {temp}{RESET}")
            print("  Share this with the user — shown only once.")
    except RuntimeError as e:
        err(f"Reset failed: {e}")

# ── Go-live ───────────────────────────────────────────────────────────────────

def cmd_golive():
    print(f"""
  {CYAN}╔══════════════════════════════════════════╗
  ║   MODERNEX ERP — GO-LIVE SEQUENCE       ║
  ║   test → build → purgeall prod → deploy ║
  ╚══════════════════════════════════════════╝{RESET}
""")
    warn("Step 3 will purge ALL transaction data in PRODUCTION (user accounts kept).")
    confirm("Type 'go-live' to confirm", expected="go-live")

    hdr("Step 1/4 — Run unit tests")
    cmd_test()

    hdr("Step 2/4 — Build bundles")
    cmd_build()

    hdr("Step 3/4 — Purge production data")
    print("  Logging in to production ... ", end="", flush=True)
    try:
        token = api_login(PROD_URL); ok("")
    except SystemExit:
        err("Cannot login to production. Is it reachable?")
    print("  Purging all transactions ... ", end="", flush=True)
    r = api_post(PROD_URL, "/api/admin/sample-tx/purgeall", token)
    removed = r.get("removed", [])
    ok(f"Production cleared — {len(removed)} table(s)")

    hdr("Step 4/4 — Deploy to Azure")
    run("git push origin main")
    ok("Pushed. Azure CI/CD will build → staging → swap to production.")

    print()
    ok("Go-live complete!")
    print(f"\n  Monitor CI: gh run list --limit 3")
    print(f"  Health:     {PROD_URL}/api/health")
    print(f"  App:        {PROD_URL}")
    print()
    warn("Reminder: ensure JWT_SECRET and strong ADMIN_PASS are set in Azure App Settings.")

# ── Dispatch ──────────────────────────────────────────────────────────────────
COMMANDS = {
    "help":          (cmd_help,       0),
    "dev":           (cmd_dev,        0),
    "test":          (cmd_test,       0),
    "test:e2e":      (cmd_test_e2e,   0),
    "e2e":           (cmd_test_e2e,   0),
    "build":         (cmd_build,      0),
    "deploy":        (cmd_deploy,     0),
    "status":        (cmd_status,     0),
    "logs":          (cmd_logs,       0),
    "sample":        (cmd_sample,     1),
    "purge":         (cmd_purge,      1),
    "purgeall":      (cmd_purgeall,   1),
    "backup":        (cmd_backup,     1),
    "backups":       (cmd_backups,    1),
    "users":         (cmd_users,      1),
    "adduser":       (cmd_adduser,    1),
    "resetpwd":      (cmd_resetpwd,   2),
    "go-live":       (cmd_golive,     0),
    "golive":        (cmd_golive,     0),
}

def main():
    args = sys.argv[1:]
    cmd  = args[0].lower() if args else "help"
    rest = args[1:]

    if cmd not in COMMANDS:
        err(f"Unknown command: '{cmd}'. Run: python scripts/mnx.py help")

    fn, n_args = COMMANDS[cmd]
    fn(*rest[:n_args]) if n_args else fn()

if __name__ == "__main__":
    main()
