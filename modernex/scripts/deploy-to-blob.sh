#!/bin/bash
set -e

# ============================================
# Azure Blob Storage Static Website Deployment
# ============================================

# Configuration
RESOURCE_GROUP="modernex-rg"
STORAGE_ACCOUNT_NAME="modernexstorage"
LOCATION="southindia"
WEB_BUILD_PATH="./packages/web/dist"

echo "=========================================="
echo "🚀 Azure Blob Storage Deployment"
echo "=========================================="
echo ""

# Get script directory and change to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo "📂 Project root: $PROJECT_ROOT"
echo ""

# Step 1: Check if logged in to Azure
echo "Step 1: Checking Azure login..."
if ! az account show &> /dev/null; then
  echo "❌ Not logged in to Azure. Please run: az login"
  exit 1
fi

SUBSCRIPTION_NAME=$(az account show --query name -o tsv)
echo "✅ Logged in to Azure"
echo "   Subscription: $SUBSCRIPTION_NAME"
echo ""

# Step 2: Check if resource group exists
echo "Step 2: Checking resource group..."
if az group show --name "$RESOURCE_GROUP" &> /dev/null; then
  echo "✅ Resource group exists: $RESOURCE_GROUP"
else
  echo "❌ Resource group not found: $RESOURCE_GROUP"
  echo "   Creating resource group..."
  az group create --name "$RESOURCE_GROUP" --location "$LOCATION"
  echo "✅ Resource group created"
fi
echo ""

# Step 3: Check/Create storage account
echo "Step 3: Setting up storage account..."
ACCOUNT_EXISTS=$(az storage account check-name --name "$STORAGE_ACCOUNT_NAME" --query "nameAvailable" -o tsv)

if [ "$ACCOUNT_EXISTS" = "true" ]; then
  echo "📦 Creating storage account: $STORAGE_ACCOUNT_NAME"
  az storage account create \
    --name "$STORAGE_ACCOUNT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --allow-blob-public-access true \
    --min-tls-version TLS1_2
  
  echo "✅ Storage account created"
else
  echo "✅ Storage account already exists: $STORAGE_ACCOUNT_NAME"
fi
echo ""

# Step 4: Enable static website hosting
echo "Step 4: Enabling static website hosting..."
az storage blob service-properties update \
  --account-name "$STORAGE_ACCOUNT_NAME" \
  --static-website \
  --index-document index.html \
  --404-document index.html

echo "✅ Static website hosting enabled"
echo ""

# Step 5: Install dependencies
echo "Step 5: Installing dependencies..."
if [ ! -d "node_modules" ]; then
  echo "📦 Running npm install..."
  npm install
else
  echo "✅ Dependencies already installed"
fi
echo ""

# Step 6: Build the application
echo "Step 6: Building web application..."
echo "🔨 Running npm run build..."
npm run build

# Verify build output
if [ ! -d "$WEB_BUILD_PATH" ]; then
  echo "❌ Build failed! Directory not found: $WEB_BUILD_PATH"
  echo ""
  echo "Please check:"
  echo "  1. Your build command in package.json"
  echo "  2. The build output directory"
  echo "  3. Build logs above for errors"
  exit 1
fi

echo "✅ Build completed successfully"
echo "   Build output: $WEB_BUILD_PATH"
echo ""

# Step 7: Upload files to blob storage
echo "Step 7: Uploading files to Azure Blob Storage..."
echo "📤 Uploading to \$web container..."

az storage blob upload-batch \
  --account-name "$STORAGE_ACCOUNT_NAME" \
  --source "$WEB_BUILD_PATH" \
  --destination '$web' \
  --overwrite \
  --content-cache-control "public, max-age=31536000" \
  --pattern "*"

echo "✅ Files uploaded successfully"
echo ""

# Step 8: Set proper content types for common file types
echo "Step 8: Setting content types..."

# Set content type for HTML files
az storage blob update-batch \
  --account-name "$STORAGE_ACCOUNT_NAME" \
  --source '$web' \
  --pattern "*.html" \
  --content-type "text/html" \
  --content-cache-control "public, max-age=0, must-revalidate" 2>/dev/null || true

# Set content type for CSS files
az storage blob update-batch \
  --account-name "$STORAGE_ACCOUNT_NAME" \
  --source '$web' \
  --pattern "*.css" \
  --content-type "text/css" 2>/dev/null || true

# Set content type for JS files
az storage blob update-batch \
  --account-name "$STORAGE_ACCOUNT_NAME" \
  --source '$web' \
  --pattern "*.js" \
  --content-type "application/javascript" 2>/dev/null || true

# Set content type for JSON files
az storage blob update-batch \
  --account-name "$STORAGE_ACCOUNT_NAME" \
  --source '$web' \
  --pattern "*.json" \
  --content-type "application/json" 2>/dev/null || true

echo "✅ Content types configured"
echo ""

# Step 9: Get website URL
echo "Step 9: Getting website URL..."
WEBSITE_URL=$(az storage account show \
  --name "$STORAGE_ACCOUNT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "primaryEndpoints.web" \
  --output tsv)

echo ""
echo "=========================================="
echo "✨ Deployment Completed Successfully!"
echo "=========================================="
echo ""
echo "🌍 Website URL: $WEBSITE_URL"
echo ""
echo "📊 Deployment Summary:"
echo "   Resource Group: $RESOURCE_GROUP"
echo "   Storage Account: $STORAGE_ACCOUNT_NAME"
echo "   Location: $LOCATION"
echo ""
echo "💡 Next Steps:"
echo "   1. Visit your website: $WEBSITE_URL"
echo "   2. (Optional) Set up Azure CDN for custom domain"
echo "   3. (Optional) Configure Azure Front Door for HTTPS"
echo ""
echo "🔧 Useful Commands:"
echo "   View files: az storage blob list --account-name $STORAGE_ACCOUNT_NAME --container-name '\$web' -o table"
echo "   Clear cache: az storage blob delete-batch --account-name $STORAGE_ACCOUNT_NAME --source '\$web'"
echo "   Redeploy: ./scripts/deploy-to-blob.sh"
echo ""
