#!/bin/bash
# ══════════════════════════════════════════════════════
# Modernex Local Development Server Manager
# ══════════════════════════════════════════════════════

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

# PID files
API_PID_FILE="$PROJECT_ROOT/.dev-api.pid"
WEB_PID_FILE="$PROJECT_ROOT/.dev-web.pid"

# Log functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check if server is running
is_running() {
    local pid_file=$1
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$pid_file"
            return 1
        fi
    fi
    return 1
}

# Start API server
start_api() {
    log_info "Starting API server..."
    
    # Check if already running
    if is_running "$API_PID_FILE"; then
        log_warning "API server is already running"
        return 0
    fi
    
    # Start API in background
    cd "$PROJECT_ROOT/packages/api"
    npm run dev < /dev/null > "$PROJECT_ROOT/.api.log" 2>&1 &
    echo $! > "$API_PID_FILE"
    
    # Wait for API to be ready
    log_info "Waiting for API server to start..."
    for i in {1..30}; do
        if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
            log_success "API server started on http://localhost:8080"
            return 0
        fi
        sleep 1
    done
    
    log_error "API server failed to start"
    return 1
}

# Start Web server
start_web() {
    log_info "Starting Web server..."
    
    # Check if already running
    if is_running "$WEB_PID_FILE"; then
        log_warning "Web server is already running"
        return 0
    fi
    
    # Start Web in background
    cd "$PROJECT_ROOT/packages/web"
    npm run dev < /dev/null > "$PROJECT_ROOT/.web.log" 2>&1 &
    echo $! > "$WEB_PID_FILE"
    
    # Wait for Web to be ready
    log_info "Waiting for Web server to start..."
    for i in {1..30}; do
        if curl -s http://localhost:5173 > /dev/null 2>&1; then
            log_success "Web server started on http://localhost:5173"
            return 0
        fi
        sleep 1
    done
    
    log_error "Web server failed to start"
    return 1
}

# Stop servers
stop_servers() {
    log_info "Stopping servers..."
    
    # Stop API
    if is_running "$API_PID_FILE"; then
        local api_pid=$(cat "$API_PID_FILE")
        kill "$api_pid" 2>/dev/null || true
        rm -f "$API_PID_FILE"
        log_success "API server stopped"
    fi
    
    # Stop Web
    if is_running "$WEB_PID_FILE"; then
        local web_pid=$(cat "$WEB_PID_FILE")
        kill "$web_pid" 2>/dev/null || true
        rm -f "$WEB_PID_FILE"
        log_success "Web server stopped"
    fi
}

# Server status
status() {
    echo ""
    echo "═══════════════════════════════════════"
    echo "  Modernex Development Server Status"
    echo "═══════════════════════════════════════"
    echo ""
    
    # API status
    if is_running "$API_PID_FILE"; then
        local api_pid=$(cat "$API_PID_FILE")
        echo -e "API:  ${GREEN}Running${NC} (PID: $api_pid, http://localhost:8080)"
    else
        echo -e "API:  ${RED}Stopped${NC}"
    fi
    
    # Web status
    if is_running "$WEB_PID_FILE"; then
        local web_pid=$(cat "$WEB_PID_FILE")
        echo -e "Web:  ${GREEN}Running${NC} (PID: $web_pid, http://localhost:5173)"
    else
        echo -e "Web:  ${RED}Stopped${NC}"
    fi
    echo ""
}

# Setup environment
setup() {
    log_info "Setting up development environment..."
    
    # Check Node.js version
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 20 ]; then
        log_error "Node.js 20 or higher is required (found: $(node -v))"
        exit 1
    fi
    log_success "Node.js $(node -v) detected"
    
    # Install dependencies
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies..."
        npm install
        log_success "Dependencies installed"
    else
        log_success "Dependencies already installed"
    fi
    
    # Setup .env
    if [ ! -f ".env" ]; then
        log_info "Creating .env file..."
        cp .env.example .env
        
        # Generate JWT secret
        JWT_SECRET=$(openssl rand -hex 32)
        if [ "$(uname)" == "Darwin" ]; then
            sed -i '' "s/replace-with-32-byte-random-hex-in-production/$JWT_SECRET/" .env
        else
            sed -i "s/replace-with-32-byte-random-hex-in-production/$JWT_SECRET/" .env
        fi
        
        log_success ".env file created with random JWT_SECRET"
    else
        log_success ".env file already exists"
    fi
    
    # Run migrations
    log_info "Running database migrations..."
    npm run migrate -w @modernex/api
    log_success "Database migrations completed"
    
    log_success "Setup complete!"
    echo ""
    log_info "Run './scripts/dev.sh start' to start the servers"
}

# Run tests
test() {
    log_info "Running tests..."
    
    # Backend tests
    log_info "Running API tests..."
    npm test -w @modernex/api
    
    # Frontend tests
    log_info "Running Web tests..."
    npm test -w @modernex/web
    
    log_success "All tests passed!"
}

# Run E2E tests
test_e2e() {
    log_info "Running E2E tests..."
    
    # Check if servers are running
    if ! is_running "$API_PID_FILE" || ! is_running "$WEB_PID_FILE"; then
        log_error "Servers must be running for E2E tests"
        log_info "Run './scripts/dev.sh start' first"
        exit 1
    fi
    
    npm run test:e2e
    log_success "E2E tests passed!"
}

# View logs
logs() {
    local service=$1
    
    case "$service" in
        api)
            if [ -f "$PROJECT_ROOT/.api.log" ]; then
                tail -f "$PROJECT_ROOT/.api.log"
            else
                log_error "API log file not found"
            fi
            ;;
        web)
            if [ -f "$PROJECT_ROOT/.web.log" ]; then
                tail -f "$PROJECT_ROOT/.web.log"
            else
                log_error "Web log file not found"
            fi
            ;;
        *)
            log_error "Unknown service: $service"
            echo "Usage: ./scripts/dev.sh logs [api|web]"
            ;;
    esac
}

# Clean up
clean() {
    log_info "Cleaning up..."
    
    stop_servers
    
    # Remove log files
    rm -f "$PROJECT_ROOT/.api.log"
    rm -f "$PROJECT_ROOT/.web.log"
    
    # Remove node_modules (optional)
    if [ "$1" == "--all" ]; then
        log_info "Removing node_modules..."
        rm -rf node_modules
        rm -rf packages/*/node_modules
        log_success "node_modules removed"
    fi
    
    log_success "Cleanup complete"
}

# Restart servers
restart() {
    stop_servers
    sleep 2
    start_api
    start_web
}

# Main command handler
case "$1" in
    setup)
        setup
        ;;
    start)
        start_api
        start_web
        status
        echo ""
        log_info "Logs:"
        echo "  API: tail -f $PROJECT_ROOT/.api.log"
        echo "  Web: tail -f $PROJECT_ROOT/.web.log"
        echo ""
        log_info "To stop: ./scripts/dev.sh stop"
        ;;
    stop)
        stop_servers
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    test)
        test
        ;;
    test:e2e)
        test_e2e
        ;;
    logs)
        logs "$2"
        ;;
    clean)
        clean "$2"
        ;;
    *)
        echo ""
        echo "Modernex Development Server Manager"
        echo ""
        echo "Usage: ./scripts/dev.sh [command]"
        echo ""
        echo "Commands:"
        echo "  setup       - Initial setup (install deps, create .env, run migrations)"
        echo "  start       - Start API and Web servers"
        echo "  stop        - Stop all servers"
        echo "  restart     - Restart all servers"
        echo "  status      - Show server status"
        echo "  test        - Run all unit tests"
        echo "  test:e2e    - Run E2E tests (requires servers running)"
        echo "  logs [api|web] - View server logs"
        echo "  clean       - Stop servers and clean logs"
        echo "  clean --all - Also remove node_modules"
        echo ""
        exit 1
        ;;
esac
