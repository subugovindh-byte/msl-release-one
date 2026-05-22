#!/usr/bin/env bash
# Local Maintenance Script for Modernex (without Docker)
# Usage: ./scripts/maintain-local.sh [command]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Environment file
ENV_FILE="$PROJECT_ROOT/.env.local"
DB_PATH="${DB_PATH:-$PROJECT_ROOT/data/modernex.db}"
DATA_DIR="$(dirname "$DB_PATH")"

# Functions
print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    local missing=0
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed (required: >=20.0.0)"
        missing=1
    else
        local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$node_version" -lt 20 ]; then
            print_error "Node.js version is too old (found: $(node -v), required: >=20.0.0)"
            missing=1
        else
            print_success "Node.js $(node -v)"
        fi
    fi
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        missing=1
    else
        print_success "npm $(npm -v)"
    fi
    
    if [ $missing -eq 1 ]; then
        print_error "Please install missing prerequisites before continuing"
        exit 1
    fi
    
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        print_error "package.json not found in $PROJECT_ROOT"
        exit 1
    fi
    
    print_success "All prerequisites met"
}

# Setup environment
setup_env() {
    print_header "Setting Up Environment"
    
    if [ ! -f "$ENV_FILE" ]; then
        print_info "Creating .env.local file..."
        cat > "$ENV_FILE" << 'EOF'
# Modernex Local Environment Configuration
NODE_ENV=development
PORT=8080
DB_PATH=./data/modernex.db

# Security (generate strong secrets in production)
JWT_SECRET=dev-secret-change-in-production

# CORS
CORS_ORIGIN=http://localhost:8080

# Azure Blob Storage (optional for local development)
# AZURE_STORAGE_CONNECTION_STRING=
# AZURE_BLOB_CONTAINER=backups

# Company Configuration
COMPANY_NAME=Modernex Stones LLP
COMPANY_UPI=modernexstones@hdfcbank
GSTIN=33AABFM1234A1Z7
HSN_CODE=2516

# Email (optional)
# EMAIL_HOST=smtp.gmail.com
# EMAIL_PORT=587
# EMAIL_USER=
# EMAIL_PASSWORD=

# WhatsApp (optional)
# WHATSAPP_API_URL=
# WHATSAPP_API_KEY=

# IRP Integration (optional)
# IRP_BASE_URL=
# IRP_CLIENT_ID=
# IRP_CLIENT_SECRET=
EOF
        print_success "Created $ENV_FILE"
        print_warning "Please review and update the configuration in $ENV_FILE"
    else
        print_success "Environment file already exists: $ENV_FILE"
    fi
    
    # Create data directory
    if [ ! -d "$DATA_DIR" ]; then
        mkdir -p "$DATA_DIR"
        print_success "Created data directory: $DATA_DIR"
    fi
}

# Install dependencies
install_deps() {
    print_header "Installing Dependencies"
    
    if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
        print_info "Installing workspace dependencies..."
        npm install
        print_success "Dependencies installed"
    else
        print_info "Updating dependencies..."
        npm install
        print_success "Dependencies updated"
    fi
}

# Run database migrations
migrate_db() {
    print_header "Running Database Migrations"
    
    if [ ! -f "$DB_PATH" ]; then
        print_info "Database does not exist, will be created during migration"
    fi
    
    npm run migrate
    print_success "Migrations completed"
}

# Seed database
seed_db() {
    print_header "Seeding Database"
    
    print_warning "This will populate the database with sample data"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        npm run seed -w @modernex/api
        print_success "Database seeded"
    else
        print_info "Seed cancelled"
    fi
}

# Start development server
start_dev() {
    print_header "Starting Development Server"
    
    if [ ! -f "$ENV_FILE" ]; then
        print_error "Environment file not found. Run: ./scripts/maintain-local.sh setup"
        exit 1
    fi
    
    # Load environment variables
    export $(grep -v '^#' "$ENV_FILE" | xargs)
    
    print_info "Starting API and Web servers..."
    print_info "API: http://localhost:8080/api"
    print_info "Web: http://localhost:5173"
    print_info "Press Ctrl+C to stop"
    echo
    
    npm run dev
}

# Start production mode
start_prod() {
    print_header "Starting Production Server"
    
    if [ ! -f "$ENV_FILE" ]; then
        print_error "Environment file not found. Run: ./scripts/maintain-local.sh setup"
        exit 1
    fi
    
    # Build first
    print_info "Building application..."
    npm run build
    
    # Load environment variables
    export $(grep -v '^#' "$ENV_FILE" | xargs)
    
    print_info "Starting production server..."
    print_info "Server: http://localhost:${PORT:-8080}"
    echo
    
    npm run start
}

# Run tests
run_tests() {
    print_header "Running Tests"
    
    print_info "Running unit tests..."
    npm run test
    
    print_success "All tests passed"
}

# Run E2E tests
run_e2e_tests() {
    print_header "Running E2E Tests"
    
    # Check if Playwright is installed
    if [ ! -d "$PROJECT_ROOT/node_modules/@playwright" ]; then
        print_info "Installing Playwright..."
        npm run test:e2e:install
    fi
    
    print_info "Running E2E tests..."
    npm run test:e2e
    
    print_success "E2E tests completed"
}

# Backup database
backup_db() {
    print_header "Backing Up Database"
    
    if [ ! -f "$DB_PATH" ]; then
        print_error "Database not found: $DB_PATH"
        exit 1
    fi
    
    local backup_dir="$PROJECT_ROOT/backups"
    mkdir -p "$backup_dir"
    
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="$backup_dir/modernex_backup_$timestamp.db"
    
    print_info "Creating backup..."
    cp "$DB_PATH" "$backup_file"
    
    # Compress backup
    gzip "$backup_file"
    
    print_success "Backup created: $backup_file.gz"
    
    # Show backup size
    local size=$(du -h "$backup_file.gz" | cut -f1)
    print_info "Backup size: $size"
}

# Restore database
restore_db() {
    print_header "Restoring Database"
    
    local backup_dir="$PROJECT_ROOT/backups"
    
    if [ ! -d "$backup_dir" ] || [ -z "$(ls -A "$backup_dir"/*.gz 2>/dev/null)" ]; then
        print_error "No backups found in $backup_dir"
        exit 1
    fi
    
    print_info "Available backups:"
    select backup in "$backup_dir"/*.gz; do
        if [ -n "$backup" ]; then
            print_warning "This will replace the current database!"
            read -p "Continue? (y/N): " -n 1 -r
            echo
            
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                print_info "Restoring from $backup..."
                
                # Backup current database first
                if [ -f "$DB_PATH" ]; then
                    local safety_backup="$DB_PATH.before_restore_$(date +%Y%m%d_%H%M%S)"
                    cp "$DB_PATH" "$safety_backup"
                    print_info "Current database backed up to: $safety_backup"
                fi
                
                # Restore
                gunzip -c "$backup" > "$DB_PATH"
                print_success "Database restored successfully"
            else
                print_info "Restore cancelled"
            fi
            break
        fi
    done
}

# Clean up
cleanup() {
    print_header "Cleaning Up"
    
    print_info "Removing build artifacts..."
    rm -rf packages/web/dist
    print_success "Build artifacts removed"
    
    print_info "Clearing logs..."
    find . -name "*.log" -type f -delete 2>/dev/null || true
    print_success "Logs cleared"
    
    print_info "Removing temp files..."
    find . -name ".DS_Store" -type f -delete 2>/dev/null || true
    find . -name "*.tmp" -type f -delete 2>/dev/null || true
    print_success "Temp files removed"
    
    print_warning "Keep node_modules? (y/N): "
    read -p "" -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Removing node_modules..."
        rm -rf node_modules packages/*/node_modules
        print_success "node_modules removed"
    fi
    
    print_success "Cleanup completed"
}

# Check health
check_health() {
    print_header "Health Check"
    
    local api_port=${PORT:-8080}
    
    if curl -f -s "http://localhost:$api_port/api/health" > /dev/null 2>&1; then
        print_success "API server is running on port $api_port"
        
        # Get health info
        local health=$(curl -s "http://localhost:$api_port/api/health")
        echo "$health" | jq . 2>/dev/null || echo "$health"
    else
        print_error "API server is not responding on port $api_port"
        print_info "Start the server with: ./scripts/maintain-local.sh dev"
    fi
}

# Show logs
show_logs() {
    print_header "Recent Logs"
    
    local log_file="$PROJECT_ROOT/logs/app.log"
    
    if [ -f "$log_file" ]; then
        tail -n 50 "$log_file"
    else
        print_warning "No log file found at $log_file"
        print_info "Logs will be created when the application starts"
    fi
}

# Database info
db_info() {
    print_header "Database Information"
    
    if [ ! -f "$DB_PATH" ]; then
        print_error "Database not found: $DB_PATH"
        exit 1
    fi
    
    local size=$(du -h "$DB_PATH" | cut -f1)
    print_info "Database path: $DB_PATH"
    print_info "Database size: $size"
    
    if command -v sqlite3 &> /dev/null; then
        print_info "Tables:"
        sqlite3 "$DB_PATH" ".tables"
        
        echo
        print_info "Migration status:"
        sqlite3 "$DB_PATH" "SELECT version, name, applied_at FROM schema_migrations ORDER BY version;"
    else
        print_warning "sqlite3 CLI not installed - install it to view database details"
    fi
}

# Show help
show_help() {
    cat << EOF
${BLUE}Modernex Local Maintenance Script${NC}

${GREEN}Usage:${NC}
  ./scripts/maintain-local.sh [command]

${GREEN}Commands:${NC}
  ${YELLOW}setup${NC}          Set up environment and create .env.local file
  ${YELLOW}install${NC}        Install/update npm dependencies
  ${YELLOW}migrate${NC}        Run database migrations
  ${YELLOW}seed${NC}           Seed database with sample data
  ${YELLOW}dev${NC}            Start development server (API + Web with hot reload)
  ${YELLOW}start${NC}          Build and start production server
  ${YELLOW}test${NC}           Run unit tests
  ${YELLOW}test:e2e${NC}       Run E2E tests with Playwright
  ${YELLOW}backup${NC}         Create database backup
  ${YELLOW}restore${NC}        Restore database from backup
  ${YELLOW}health${NC}         Check if server is running
  ${YELLOW}logs${NC}           Show recent application logs
  ${YELLOW}db-info${NC}        Show database information
  ${YELLOW}clean${NC}          Clean up build artifacts and temporary files
  ${YELLOW}check${NC}          Check prerequisites
  ${YELLOW}help${NC}           Show this help message

${GREEN}Quick Start:${NC}
  1. ./scripts/maintain-local.sh setup      # Create environment file
  2. ./scripts/maintain-local.sh install    # Install dependencies
  3. ./scripts/maintain-local.sh migrate    # Set up database
  4. ./scripts/maintain-local.sh dev        # Start development server

${GREEN}Environment:${NC}
  Config file: $ENV_FILE
  Database:    $DB_PATH
  Data dir:    $DATA_DIR

EOF
}

# Main script
main() {
    local command=${1:-help}
    
    case "$command" in
        setup)
            check_prerequisites
            setup_env
            ;;
        install)
            check_prerequisites
            install_deps
            ;;
        migrate)
            migrate_db
            ;;
        seed)
            seed_db
            ;;
        dev)
            start_dev
            ;;
        start|prod)
            start_prod
            ;;
        test)
            run_tests
            ;;
        test:e2e|e2e)
            run_e2e_tests
            ;;
        backup)
            backup_db
            ;;
        restore)
            restore_db
            ;;
        health)
            check_health
            ;;
        logs)
            show_logs
            ;;
        db-info|dbinfo)
            db_info
            ;;
        clean|cleanup)
            cleanup
            ;;
        check)
            check_prerequisites
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            echo
            show_help
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
