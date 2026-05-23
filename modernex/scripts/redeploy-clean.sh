#!/bin/bash
set -e

# ============================================
# Clean Redeploy to Azure App Service
# ============================================

RESOURCE_GROUP="modernex-rg"
APP_NAME="modernex-prod"
PLAN_NAME="modernex-plan"
LOCATION="southindia"

echo "=========================================="
echo "🔄 Clean Redeploy to Azure App Service"
echo "=========================================="
echo ""

# Get script directory and change to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "📂 Project root: $PROJECT_ROOT"
echo ""

# Check Azure login
echo "Step 1: Checking Azure login..."
if ! az account show &> /dev/null; then
  echo "❌ Not logged in to Azure. Please run: az login"
  exit 1
fi
echo "✅ Logged in"
echo ""

# Stop existing app
echo "Step 2: Stopping existing app..."
az webapp stop --name $APP_NAME --resource-group $RESOURCE_GROUP 2>/dev/null || echo "App not running or doesn't exist"
echo ""

# Delete existing app
echo "Step 3: Deleting existing app..."
az webapp delete --name $APP_NAME --resource-group $RESOURCE_GROUP --yes 2>/dev/null || echo "App already deleted"
sleep 5
echo "✅ Cleanup complete"
echo ""

# Ensure App Service Plan exists and is B1
echo "Step 4: Checking App Service Plan..."
if az appservice plan show --name $PLAN_NAME --resource-group $RESOURCE_GROUP &> /dev/null; then
  echo "✅ Plan exists, ensuring it's B1 tier..."
  az appservice plan update \
    --name $PLAN_NAME \
    --resource-group $RESOURCE_GROUP \
    --sku B1
else
  echo "Creating App Service Plan..."
  az appservice plan create \
    --name $PLAN_NAME \
    --resource-group $RESOURCE_GROUP \
    --location $LOCATION \
    --sku B1 \
    --is-linux
fi
echo ""

# Create fresh App Service
echo "Step 5: Creating fresh App Service..."
az webapp create \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --plan $PLAN_NAME \
  --runtime "NODE:22-lts"

echo "✅ App Service created"
echo ""

# Configure App Service
echo "Step 6: Configuring App Service..."

# Enable Always On
az webapp config set \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --always-on true

# Enable logging
az webapp log config \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --application-logging filesystem \
  --detailed-error-messages true \
  --failed-request-tracing true \
  --web-server-logging filesystem

echo "✅ Configuration complete"
echo ""

# Set environment variables
echo "Step 7: Setting environment variables..."
az webapp config appsettings set \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings \
    NODE_ENV=production \
    PORT=8080 \
    WEBSITES_PORT=8080 \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true

echo "✅ Environment variables set"
echo ""

# Build application
echo "Step 8: Building application..."
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Running build..."
npm run build

echo "✅ Build complete"
echo ""

# Create deployment package
echo "Step 9: Creating deployment package..."
rm -f deploy.zip

zip -r deploy.zip . \
  -x "node_modules/*" \
  -x ".git/*" \
  -x "test-results/*" \
  -x "playwright-report/*" \
  -x "*.log" \
  -x ".env*"

echo "✅ Package created"
echo ""

# Deploy to Azure
echo "Step 10: Deploying to Azure..."
az webapp deployment source config-zip \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --src deploy.zip

echo "✅ Deployment complete"
echo ""

# Wait for app to start
echo "Step 11: Waiting for app to start (90 seconds)..."
sleep 90

# Test the deployment
echo "Step 12: Testing deployment..."
RESPONSE_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://$APP_NAME.azurewebsites.net)

echo ""
echo "=========================================="
if [ "$RESPONSE_CODE" = "200" ] || [ "$RESPONSE_CODE" = "302" ]; then
  echo "✨ Deployment Successful!"
else
  echo "⚠️  Deployment completed but got HTTP $RESPONSE_CODE"
  echo "   The app may still be starting up..."
fi
echo "=========================================="
echo ""
echo "🌍 App URL: https://$APP_NAME.azurewebsites.net"
echo "🔍 Kudu URL: https://$APP_NAME.scm.azurewebsites.net"
echo "📊 Logs: az webapp log tail --name $APP_NAME --resource-group $RESOURCE_GROUP"
echo ""
echo "💡 If the app shows errors:"
echo "   1. Check logs: az webapp log tail --name $APP_NAME --resource-group $RESOURCE_GROUP"
echo "   2. Check env vars: az webapp config appsettings list --name $APP_NAME -g $RESOURCE_GROUP"
echo "   3. Restart app: az webapp restart --name $APP_NAME -g $RESOURCE_GROUP"
echo ""
