# Deployment Quickstart

## Local development

```bash
# 1. Clone and install
git clone <repo>
cd modernex
npm install

# 2. Set up environment
cp .env.example .env
# Edit: set JWT_SECRET to `openssl rand -hex 32`

# 3. Start dev servers (API + web)
npm run dev

# API:  http://localhost:8080
# Web:  http://localhost:5173
# Login: admin / admin123
```

## Docker

```bash
# Build and run
export JWT_SECRET=$(openssl rand -hex 32)
docker compose up -d

# Access: http://localhost:8080
```

## Azure production — one-time setup

```bash
# 1. Create infrastructure (see ModernexDeployment.html for full CLI)
az group create -n modernex-rg -l southindia
az appservice plan create -g modernex-rg -n modernex-plan --sku B2 --is-linux
az webapp create -g modernex-rg -p modernex-plan -n modernex-prod --runtime "NODE:20-lts"
az webapp deployment slot create -g modernex-rg -n modernex-prod --slot staging

# 2. Storage for backups
az storage account create -g modernex-rg -n modernexstorage -l southindia --sku Standard_LRS
az storage container create --account-name modernexstorage --name backups --public-access off
az storage container create --account-name modernexstorage --name modernex-photos --public-access off

# 3. Key Vault + Managed Identity
az keyvault create -g modernex-rg -n modernex-vault -l southindia
az webapp identity assign -g modernex-rg -n modernex-prod
MI=$(az webapp identity show -g modernex-rg -n modernex-prod --query principalId -o tsv)
az keyvault set-policy -n modernex-vault --object-id $MI --secret-permissions get list

az keyvault secret set --vault-name modernex-vault --name JWT-SECRET --value "$(openssl rand -hex 32)"
az keyvault secret set --vault-name modernex-vault --name BLOB-CONN \
  --value "$(az storage account show-connection-string -g modernex-rg -n modernexstorage --query connectionString -o tsv)"

# 4. Wire App Service settings to Key Vault
az webapp config appsettings set -g modernex-rg -n modernex-prod --settings \
  JWT_SECRET="@Microsoft.KeyVault(SecretUri=https://modernex-vault.vault.azure.net/secrets/JWT-SECRET/)" \
  AZURE_STORAGE_CONNECTION_STRING="@Microsoft.KeyVault(SecretUri=https://modernex-vault.vault.azure.net/secrets/BLOB-CONN/)" \
  NODE_ENV=production \
  DB_PATH=/home/data/modernex.db

# 5. Custom domain
az webapp config hostname add -g modernex-rg --webapp-name modernex-prod \
  --hostname modernex.yourcompany.in
az webapp config ssl create -g modernex-rg --name modernex-prod \
  --hostname modernex.yourcompany.in
```

## Continuous deployment

1. Add these GitHub secrets to your repo:
   - `AZURE_CREDENTIALS` — service principal JSON (from `az ad sp create-for-rbac --sdk-auth`)

2. Push to `main`:
   ```bash
   git push origin main
   ```

3. GitHub Actions:
   - Runs lint + tests
   - Builds frontend (`vite build`)
   - Packages backend + frontend dist
   - Deploys to `staging` slot
   - Smoke-tests `/api/health`
   - Swaps `staging` → `production` (zero-downtime)

Total time from push to live: ~4 minutes.

## Backups

```bash
# Manual backup (uploads to Azure Blob)
npm run backup

# List available backups
node scripts/restore-from-blob.js

# Restore a specific date
node scripts/restore-from-blob.js 2025-04-15
```

Automatic backups run at **02:00 IST** daily via `node-cron` inside the app.

## Rollback

```bash
# Slot-swap back to previous version (takes ~30 seconds)
az webapp deployment slot swap -g modernex-rg -n modernex-prod \
  --slot staging --target-slot production
```

## Monitoring

Application Insights captures logs, metrics, and traces automatically when `APPINSIGHTS_CONNECTION_STRING` is set. Key alerts to configure in Azure Monitor:

- HTTP 5xx rate > 2% for 5 min
- p95 latency > 1s for 10 min
- Backup didn't complete by 03:00 IST
- Disk > 80% on App Service persistent volume
