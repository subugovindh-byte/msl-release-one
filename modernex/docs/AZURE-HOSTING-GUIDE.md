# 💰 Azure Hosting Options for Modernex - Cost Comparison

## Quick Answer

**For production use: Azure Container Apps (cheapest + best)**  
**For development/testing: Azure App Service Free tier**

---

## 🏆 Recommended: Azure Container Apps

**Cost: ₹840-1,260/month (~$10-15/month)**

### Why Best Choice:
- ✅ **Cheapest** for production workloads
- ✅ Auto-scales to zero (pay only when used)
- ✅ Built-in HTTPS/SSL
- ✅ Container-based (use existing Dockerfile)
- ✅ Integrated with Azure Monitor
- ✅ Regional vNet support

### Pricing:
- **Compute**: ₹0.0009/vCPU-second + ₹0.00011/GB-second
- **Typical usage** (0.5 vCPU, 1GB RAM, 10% utilization):
  - ~₹840/month for low traffic
  - ~₹2,500/month for medium traffic

### Setup:
```bash
# 1. Create environment
az containerapp env create \
  -n modernex-env \
  -g modernex-rg \
  -l southindia

# 2. Deploy app
az containerapp create \
  -n modernex-app \
  -g modernex-rg \
  --environment modernex-env \
  --image <your-registry>/modernex:latest \
  --target-port 8080 \
  --ingress external \
  --cpu 0.5 \
  --memory 1.0Gi \
  --min-replicas 0 \
  --max-replicas 3 \
  --env-vars \
    NODE_ENV=production \
    JWT_SECRET=secretref:jwt-secret

# Auto-HTTPS included (*.azurecontainerapps.io)
```

---

## 💵 Option 2: Azure App Service (Basic B1)

**Cost: ₹1,350/month (~$16/month)**

### Current Deployment (B2 tier):
- **B2**: ₹2,700/month (~$32/month)
- 2 cores, 3.5GB RAM
- **Too expensive** for this app's needs

### Recommended: Downgrade to B1
- **B1**: ₹1,350/month (~$16/month)
- 1 core, 1.75GB RAM
- Sufficient for 100-500 users
- Always-on enabled
- Custom domains + SSL included

### Setup:
```bash
# Create B1 app
az appservice plan create \
  -g modernex-rg \
  -n modernex-plan \
  --sku B1 \
  --is-linux

az webapp create \
  -g modernex-rg \
  -p modernex-plan \
  -n modernex-prod \
  --runtime "NODE:20-lts"
```

### When to use:
- Need 24/7 availability
- Predictable traffic
- Prefer PaaS over containers

---

## 🆓 Option 3: Azure App Service (Free Tier)

**Cost: ₹0/month (FREE!)**

### Limitations:
- ❌ No custom domain
- ❌ No SSL/HTTPS
- ❌ 60 minutes/day CPU quota
- ❌ No always-on
- ❌ 1GB RAM, shared CPU
- ❌ 1GB disk space

### When to use:
- **Development/testing only**
- Demo environments
- POC/prototype
- Internal-only access

### Setup:
```bash
az appservice plan create \
  -g modernex-rg \
  -n modernex-free-plan \
  --sku F1 \
  --is-linux

az webapp create \
  -g modernex-rg \
  -p modernex-free-plan \
  -n modernex-dev \
  --runtime "NODE:20-lts"
```

---

## 🐳 Option 4: Azure Container Instances (ACI)

**Cost: ₹750-1,500/month (~$9-18/month)**

### Pricing:
- **Per-second billing**: ₹0.0013/vCPU-second + ₹0.00013/GB-second
- **Typical**: 1 vCPU, 1.5GB RAM = ~₹1,000/month

### Pros:
- Simple container deployment
- Fast cold starts
- No cluster management

### Cons:
- ❌ No built-in load balancer
- ❌ Manual SSL setup required
- ❌ No auto-scaling
- ❌ Less features than Container Apps

### When to use:
- Simple containerized workload
- No scaling needed
- Short-lived tasks

---

## 📊 Cost Comparison Table

| Option | Monthly Cost | Best For | Scalability | SSL/HTTPS | Custom Domain |
|--------|-------------|----------|-------------|-----------|---------------|
| **Container Apps** | **₹840-1,260** | **Production** | Auto (0-N) | ✅ Free | ✅ Yes |
| App Service F1 | ₹0 | Dev/Test | None | ❌ | ❌ |
| App Service B1 | ₹1,350 | Production | Manual | ✅ | ✅ |
| App Service B2 | ₹2,700 | High traffic | Manual | ✅ | ✅ |
| Container Instance | ₹750-1,500 | Simple apps | None | Manual | Manual |
| VM (B1s) | ₹750 | Full control | Manual | Manual | Manual |

---

## 🎯 Recommended Setup by Use Case

### Startup / Small Business (Recommended)
```
Azure Container Apps
- Cost: ₹840-1,260/month
- Scale to zero when idle
- Auto-scale during business hours
```

### Established Business
```
App Service B1
- Cost: ₹1,350/month
- Always available
- Predictable costs
```

### Development/Testing
```
App Service F1 (Free)
- Cost: ₹0/month
- Good for staging environments
```

---

## 💡 Cost Optimization Tips

### 1. Use Container Apps with Scale-to-Zero
```bash
# Scale to zero outside business hours
az containerapp update \
  -n modernex-app \
  -g modernex-rg \
  --min-replicas 0 \
  --scale-rule-name "http-requests" \
  --scale-rule-type "http" \
  --scale-rule-http-concurrency 10
```

### 2. Downgrade from B2 to B1
Your current B2 plan (₹2,700/month) is overkill. Downgrade to B1:
```bash
az appservice plan update \
  -g modernex-rg \
  -n modernex-plan \
  --sku B1

# Saves ₹1,350/month (50% reduction)
```

### 3. Use Blob Storage Archive Tier
For old backups:
```bash
az storage blob set-tier \
  --account-name modernexstorage \
  --container-name backups \
  --name "backup-2025-01-01.db.gz" \
  --tier Archive

# Saves 90% on storage costs for old backups
```

### 4. Enable Azure Advisor
Free cost recommendations:
```bash
az advisor recommendation list --category Cost
```

### 5. Reserved Instances (1-year commitment)
Save 30-40% on App Service:
- B1: ₹1,350 → ₹940/month
- Requires 1-year commitment

---

## 🚀 Migration Guide: B2 → Container Apps

### Step 1: Build Container Image
```bash
# Build image
docker build -t modernex:latest .

# Tag for Azure Container Registry
docker tag modernex:latest modernex.azurecr.io/modernex:latest

# Push to ACR
az acr login --name modernex
docker push modernex.azurecr.io/modernex:latest
```

### Step 2: Create Container App Environment
```bash
az containerapp env create \
  -n modernex-env \
  -g modernex-rg \
  -l southindia
```

### Step 3: Migrate Storage Connection
```bash
# Get current connection string
BLOB_CONN=$(az webapp config appsettings list \
  -g modernex-rg \
  -n modernex-prod \
  --query "[?name=='AZURE_STORAGE_CONNECTION_STRING'].value" -o tsv)

# Create secret in Container Apps
az containerapp secret set \
  -n modernex-app \
  -g modernex-rg \
  --secrets blob-conn="$BLOB_CONN"
```

### Step 4: Deploy Container App
```bash
az containerapp create \
  -n modernex-app \
  -g modernex-rg \
  --environment modernex-env \
  --image modernex.azurecr.io/modernex:latest \
  --target-port 8080 \
  --ingress external \
  --cpu 0.5 \
  --memory 1.0Gi \
  --min-replicas 1 \
  --max-replicas 3 \
  --secrets \
    jwt-secret="$(openssl rand -hex 32)" \
    blob-conn="$BLOB_CONN" \
  --env-vars \
    NODE_ENV=production \
    JWT_SECRET=secretref:jwt-secret \
    AZURE_STORAGE_CONNECTION_STRING=secretref:blob-conn \
    DB_PATH=/data/modernex.db
```

### Step 5: Mount Persistent Volume (for SQLite)
```bash
# Create Azure Files share
az storage share create \
  --name modernex-data \
  --account-name modernexstorage

# Mount to Container App
az containerapp create \
  # ... (previous settings) ...
  --storage-mount \
    name=data \
    storage-type=AzureFile \
    storage-account=modernexstorage \
    storage-share=modernex-data \
    mount-path=/data
```

### Step 6: Update DNS
```bash
# Get Container App URL
FQDN=$(az containerapp show \
  -n modernex-app \
  -g modernex-rg \
  --query properties.configuration.ingress.fqdn -o tsv)

# Update your DNS CNAME record
# modernex.yourcompany.in → $FQDN
```

### Step 7: Delete Old App Service (after testing)
```bash
# Delete B2 App Service
az webapp delete -g modernex-rg -n modernex-prod

# Delete App Service Plan
az appservice plan delete -g modernex-rg -n modernex-plan

# Saves ₹2,700/month!
```

---

## 📈 Real-World Cost Examples

### Scenario 1: Small Business (10 users)
- **Traffic**: 1,000 requests/day
- **Uptime**: 8 hours/day (business hours)
- **Container Apps**: ₹840/month
- **Storage**: ₹100/month (10GB data + backups)
- **Total**: **₹940/month (~$11/month)**

### Scenario 2: Medium Business (50 users)
- **Traffic**: 10,000 requests/day
- **Uptime**: 16 hours/day
- **Container Apps**: ₹1,680/month
- **Storage**: ₹200/month (50GB data)
- **Total**: **₹1,880/month (~$22/month)**

### Scenario 3: Always-On (100+ users)
- **Traffic**: 50,000 requests/day
- **Uptime**: 24/7
- **App Service B1**: ₹1,350/month
- **Storage**: ₹300/month (100GB data)
- **Total**: **₹1,650/month (~$20/month)**

---

## ✅ Final Recommendation

**For Modernex Stones LLP:**

1. **Immediate action**: Downgrade B2 → B1 (save ₹1,350/month)
2. **Long-term**: Migrate to Container Apps (save ₹1,860/month vs B2)
3. **Storage**: Archive old backups (save 90% on backup storage)

**Estimated savings: ₹18,000-22,000/year (₹1,500-1,800/month)**

---

## 🔗 Additional Resources

- [Azure Pricing Calculator](https://azure.microsoft.com/en-in/pricing/calculator/)
- [Container Apps Pricing](https://azure.microsoft.com/en-in/pricing/details/container-apps/)
- [App Service Pricing](https://azure.microsoft.com/en-in/pricing/details/app-service/linux/)
- [Azure Advisor](https://portal.azure.com/#blade/Microsoft_Azure_Expert/AdvisorMenuBlade/Cost)

---

**Last Updated**: April 2026  
**Prices**: INR (Indian Rupees), may vary by region
