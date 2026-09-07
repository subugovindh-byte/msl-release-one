#!/bin/bash
# ---------------------------------------------------------------------------
# modernex-prod startup (Azure App Service, Linux / NODE|22-lts)
#
# WHY THIS EXISTS:
#   The API is an npm-workspaces ESM app (packages/api, "type":"module").
#   Azure/Oryx builds deps into a COMPRESSED node_modules.tar.gz and relies on
#   extracting to an ephemeral /node_modules exposed via NODE_PATH. But ESM
#   `import` IGNORES NODE_PATH, so wwwroot/node_modules stays empty at runtime
#   -> `ERR_MODULE_NOT_FOUND: express` -> container exit 1 -> crash loop.
#   (This took prod down for ~5 weeks in Aug 2026.)
#
#   This script GUARANTEES a resolvable wwwroot/node_modules before launch, by
#   any means available, so the app cannot fail to boot for this reason again.
#
# WIRED VIA:  az webapp config set --startup-file "bash /home/site/wwwroot/startup.sh"
# ---------------------------------------------------------------------------
set -u
cd /home/site/wwwroot || { echo "[startup] FATAL: wwwroot missing"; exit 1; }

deps_ok() { [ -f node_modules/express/package.json ]; }

# 1) Fast path: extract the Oryx-built (correct Linux x64) tarball.
if ! deps_ok && [ -f node_modules.tar.gz ]; then
  echo "[startup] node_modules incomplete -> extracting node_modules.tar.gz"
  mkdir -p node_modules
  tar --no-same-owner --no-same-permissions -m -xzf node_modules.tar.gz -C node_modules 2>/dev/null || true
fi

# 2) Fallback: no usable tarball -> install from lockfile (native deps have
#    linux-x64 prebuilds, so no compiler is needed in the runtime container).
if ! deps_ok; then
  echo "[startup] tarball absent/incomplete -> npm ci --omit=dev"
  npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -25 \
    || npm install --omit=dev --no-audit --no-fund 2>&1 | tail -25
fi

if ! deps_ok; then
  echo "[startup] FATAL: could not provision node_modules (express still missing)"
  exit 1
fi

echo "[startup] node_modules ready ($(ls node_modules 2>/dev/null | wc -l) packages); launching API"
exec node packages/api/src/server.js
