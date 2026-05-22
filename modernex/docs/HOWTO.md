# 🚀 Modernex Development HOWTO

Complete guide for developing, testing, and deploying the Modernex Stones accounting system.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [First Time Setup](#first-time-setup)
3. [Daily Development](#daily-development)
4. [Testing](#testing)
5. [Building for Production](#building-for-production)
6. [Troubleshooting](#troubleshooting)
7. [Common Tasks](#common-tasks)

---

## Prerequisites

### Required Software

- **Node.js 20+** — [Download](https://nodejs.org/)
- **npm** (comes with Node.js)
- **Git** (for version control)

### Optional but Recommended

- **Docker** — For containerized deployments
- **VS Code** — Recommended IDE with extensions:
  - ESLint
  - TypeScript
  - Prettier
  - SQLite Viewer

### Verify Installation

```bash
node --version  # Should be v20.x or higher
npm --version   # Should be 10.x or higher
```

---

## First Time Setup

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd modernex
```

### 2. Run Setup Script

The easiest way to get started:

```bash
chmod +x scripts/dev.sh
./scripts/dev.sh setup
```

This will:
- ✅ Install all dependencies
- ✅ Create `.env` file with random JWT secret
- ✅ Run database migrations
- ✅ Seed demo data (in development)

### 3. Manual Setup (Alternative)

If you prefer manual setup:

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Generate JWT secret
openssl rand -hex 32
# Add the output to .env as JWT_SECRET

# Run migrations
npm run migrate -w @modernex/api

# Start development servers
npm run dev
```

### 4. Access the Application

- **Web App**: http://localhost:5173
- **API**: http://localhost:8080
- **API Health**: http://localhost:8080/api/health

### 5. Login with Demo Accounts

| Username | Password    | Role     | Permissions                    |
|----------|-------------|----------|--------------------------------|
| admin    | admin123    | admin    | Full access                    |
| accounts | accounts123 | accounts | Invoices, payments, reports    |
| yard     | yard123     | yard     | Inventory, production          |
| sales    | sales123    | sales    | POS, customers                 |

---

## Daily Development

### Quick Start/Stop

```bash
# Start servers
./scripts/dev.sh start

# Stop servers
./scripts/dev.sh stop

# Restart servers
./scripts/dev.sh restart

# Check status
./scripts/dev.sh status
```

### View Logs

```bash
# API logs
./scripts/dev.sh logs api
# or
tail -f .api.log

# Web logs
./scripts/dev.sh logs web
# or
tail -f .web.log
```

### Manual Development

If you prefer running servers manually:

```bash
# Terminal 1 - API
cd packages/api
npm run dev

# Terminal 2 - Web
cd packages/web
npm run dev
```

### Hot Reload

Both API and Web support hot reload:
- **API**: Uses Node's `--watch` flag
- **Web**: Vite HMR (Hot Module Replacement)

Just save your changes and they'll automatically reload!

---

## Testing

### Run All Tests

```bash
./scripts/dev.sh test
```

Or manually:

```bash
# All tests
npm test

# API tests only
npm test -w @modernex/api

# Web tests only
npm test -w @modernex/web
```

### Watch Mode

```bash
# API tests in watch mode
cd packages/api
npm run test:watch

# Web tests in watch mode
cd packages/web
npm run test:watch
```

### E2E Tests

```bash
# Install Playwright (first time only)
npm run test:e2e:install

# Start servers first
./scripts/dev.sh start

# Run E2E tests
./scripts/dev.sh test:e2e

# Or with UI
npm run test:e2e:ui
```

### Test Coverage

```bash
# Generate coverage report
npm test -- --coverage
```

### Type Checking

```bash
# Check TypeScript types (frontend)
npm run type-check -w @modernex/web

# Check all at once
npm run lint
```

---

## Building for Production

### Local Production Build

```bash
# Build all packages
npm run build

# This creates:
# - packages/web/dist (frontend build)
# - Backend runs directly (no build needed)
```

### Test Production Build Locally

```bash
# Build
npm run build

# Set environment
export NODE_ENV=production
export JWT_SECRET=$(openssl rand -hex 32)

# Run production server
npm start
```

Access at: http://localhost:8080

### Docker Build

```bash
# Build Docker image
docker build -t modernex:latest .

# Run container
export JWT_SECRET=$(openssl rand -hex 32)
docker compose up -d

# Access at http://localhost:8080
```

### Deploy to Azure

See [`DEPLOYMENT.md`](DEPLOYMENT.md) for full Azure deployment guide.

Quick deploy via GitHub Actions:

```bash
git push origin main
# GitHub Actions will automatically deploy to Azure
```

---

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 8080 (API)
lsof -i :8080

# Kill the process
kill -9 <PID>

# Or for port 5173 (Web)
lsof -i :5173
kill -9 <PID>
```

### Database Issues

```bash
# Reset database
rm -f packages/api/data/modernex.db*

# Re-run migrations
npm run migrate -w @modernex/api
```

### Dependency Issues

```bash
# Clean install
./scripts/dev.sh clean --all
./scripts/dev.sh setup
```

### TypeScript Errors

```bash
# Clear TypeScript cache
rm -rf packages/web/*.tsbuildinfo
rm -rf packages/web/node_modules/.vite

# Restart dev server
./scripts/dev.sh restart
```

### Node Modules Corrupted

```bash
# Remove all node_modules
find . -name "node_modules" -type d -prune -exec rm -rf '{}' +

# Reinstall
npm install
```

---

## Common Tasks

### Add a New Page

1. **Create page component**
   ```bash
   touch packages/web/src/pages/NewFeaturePage.tsx
   ```

2. **Add content**
   ```typescript
   import React from 'react';
   
   export function NewFeaturePage() {
     return (
       <div className="page">
         <h1>New Feature</h1>
         <p>Content here...</p>
       </div>
     );
   }
   ```

3. **Add route in App.tsx**
   ```typescript
   import { NewFeaturePage } from '@/pages/NewFeaturePage';
   
   <Route path="/new-feature" element={<NewFeaturePage />} />
   ```

4. **Add to navigation**
   ```typescript
   const NAV = [
     // ...
     { id: 'new-feature', path: '/new-feature', lbl: 'New Feature', icon: '[N]' },
   ];
   ```

### Add a New API Endpoint

1. **Create route file** (if new resource)
   ```bash
   touch packages/api/src/routes/newResource.js
   ```

2. **Define routes**
   ```javascript
   import { Router } from 'express';
   
   export const newResourceRouter = Router();
   
   newResourceRouter.get('/', async (req, res) => {
     // Handle GET request
   });
   
   newResourceRouter.post('/', async (req, res) => {
     // Handle POST request
   });
   ```

3. **Register in server.js**
   ```javascript
   import { newResourceRouter } from './routes/newResource.js';
   
   app.use('/api/new-resource', newResourceRouter);
   ```

### Create a Database Migration

1. **Create migration file**
   ```bash
   touch packages/api/migrations/008_new_feature.sql
   ```

2. **Add SQL**
   ```sql
   -- Add your SQL here
   CREATE TABLE IF NOT EXISTS new_table (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   );
   ```

3. **Run migration**
   ```bash
   npm run migrate -w @modernex/api
   ```

### Add React Query Hook

1. **Define in useApi.ts**
   ```typescript
   export function useNewResource() {
     return useQuery({
       queryKey: ['new-resource'],
       queryFn: () => api.get<NewResourceType>('/new-resource'),
     });
   }
   ```

2. **Use in component**
   ```typescript
   const { data, isLoading } = useNewResource();
   ```

### Add Zustand Store

1. **Define in store/index.ts**
   ```typescript
   interface NewFeatureState {
     value: string;
     setValue: (value: string) => void;
   }
   
   export const useNewFeatureStore = create<NewFeatureState>()((set) => ({
     value: '',
     setValue: (value) => set({ value }),
   }));
   ```

2. **Use anywhere**
   ```typescript
   const { value, setValue } = useNewFeatureStore();
   ```

### Update Environment Variables

1. **Add to .env.example**
   ```bash
   NEW_FEATURE_API_KEY=
   ```

2. **Add to config.js**
   ```javascript
   export const config = {
     // ...
     newFeature: {
       apiKey: process.env.NEW_FEATURE_API_KEY || '',
     },
   };
   ```

3. **Update your .env**
   ```bash
   echo "NEW_FEATURE_API_KEY=your-key-here" >> .env
   ```

---

## Performance Tips

### Frontend

- Use React Query for all server state
- Use Zustand for client state
- Lazy load heavy components with `React.lazy()`
- Optimize images (compress, use WebP)
- Keep bundle size small (check with `npm run build`)

### Backend

- Use SQLite WAL mode (already configured)
- Add indexes for frequently queried columns
- Use prepared statements (already done with better-sqlite3)
- Enable compression (already configured)

### Database

```sql
-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_slabs_variety ON slabs(variety);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
```

---

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes and commit
git add .
git commit -m "Add new feature"

# Push to remote
git push origin feature/new-feature

# Create Pull Request on GitHub
# After approval and merge to main, GitHub Actions will auto-deploy
```

---

## Useful Commands

```bash
# Check all errors
npm run lint

# Fix auto-fixable errors
npm run lint -- --fix

# Type check without building
npm run type-check -w @modernex/web

# Clean everything
./scripts/dev.sh clean --all

# View package versions
npm list --depth=0

# Update dependencies
npm update

# Check for outdated packages
npm outdated
```

---

## Documentation Links

- **TypeScript Guide**: [`packages/web/README-TYPESCRIPT.md`](packages/web/README-TYPESCRIPT.md)
- **Migration Guide**: [`packages/web/MIGRATION.md`](packages/web/MIGRATION.md)
- **Deployment**: [`DEPLOYMENT.md`](DEPLOYMENT.md)
- **API Docs**: See inline comments in `packages/api/src/routes/`

---

## Getting Help

### Check Documentation
1. This HOWTO guide
2. `README.md` — Project overview
3. `TYPESCRIPT-UPGRADE-SUMMARY.md` — Recent changes
4. Inline code comments

### Debug Mode

```bash
# API with debug logging
LOG_LEVEL=debug npm run dev -w @modernex/api

# View detailed logs
tail -f packages/api/.log
```

### Common Issues

See [Troubleshooting](#troubleshooting) section above.

---

## Quick Reference

```bash
# Setup
./scripts/dev.sh setup

# Start
./scripts/dev.sh start

# Stop
./scripts/dev.sh stop

# Test
./scripts/dev.sh test

# Logs
./scripts/dev.sh logs api
./scripts/dev.sh logs web

# Status
./scripts/dev.sh status

# Clean
./scripts/dev.sh clean
```

---

## Best Practices

### Code Style

- Use TypeScript for new frontend code
- Follow ESLint rules
- Write meaningful commit messages
- Add comments for complex logic

### Testing

- Write tests for new features
- Aim for >80% coverage
- Test edge cases
- Run tests before committing

### Security

- Never commit `.env` file
- Use environment variables for secrets
- Rotate JWT_SECRET in production
- Keep dependencies updated

### Performance

- Optimize queries before production
- Monitor bundle size
- Use React Query for caching
- Profile slow operations

---

## Next Steps

1. ✅ Complete first-time setup
2. ✅ Run the application
3. ✅ Explore demo accounts
4. ✅ Make a small change
5. ✅ Run tests
6. ✅ Create a feature branch
7. ✅ Build something awesome!

---

**Need Help?** Check the docs or create an issue on GitHub.

**Happy Coding!** 🚀
