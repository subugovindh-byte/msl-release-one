# Modernex Stones LLP — Accounts & Operations System v2.0

Production-ready accounts, inventory, production, and GST compliance system for a granite quarry operation. Built with Node.js + Express + SQLite (WAL) backend and **modern React 18 + TypeScript + Zustand** frontend, deployable to Azure App Service.

## Architecture

- **Backend**: Node.js 20 · Express 5 · better-sqlite3 · JWT · bcrypt · Zod · Azure Blob
- **Frontend**: React 18 · TypeScript 5.4 · Zustand · React Query · Vite 5 · CSS variables theming
- **Database**: SQLite WAL · FIFO inventory · audit triggers · 4-tier backup
- **Cloud**: Azure App Service B2 · Blob Storage · Key Vault · App Insights (India South)

## ✨ What's New in v2.0

- **TypeScript** — Full type safety across the frontend
- **Zustand** — Modern, lightweight state management (replaces Context API)
- **React Query** — Automatic caching, refetching, and optimistic updates
- **Better Developer Experience** — ESLint, type-checking, auto-complete
- **Improved Performance** — Code splitting, tree shaking, optimized re-renders

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your values

# 3. Run database migrations + seed
npm run migrate -w @modernex/api

# 4. Start dev servers (API + web concurrently)
npm run dev

# Web app: http://localhost:5173
# API:     http://localhost:8080
```

## Workspace Structure

```
modernex/
├── docs/            # All documentation and guides
│   ├── OPERATING_HANDBOOK.md   # Daily/weekly/monthly operating procedures
│   ├── DEPLOYMENT.md           # Azure deployment guide
│   ├── AZURE-HOSTING-GUIDE.md  # Azure hosting reference
│   └── HOWTO.md                # How-to guides
├── packages/
│   ├── api/         # Node.js Express API
│   ├── web/         # React + TypeScript frontend ⭐️
│   └── shared/      # Shared TypeScript types + GST logic
├── scripts/         # Backup/restore utilities
└── .github/         # CI/CD workflows
```

## Frontend Technologies

### Modern React Stack

- **React 18** with TypeScript for full type safety
- **Zustand** for state management (auth, theme, UI state)
- **React Query** for server state and data fetching
- **React Router 6** for client-side routing
- **Vite** for fast builds and HMR

### Key Features

✅ **Type-Safe API Client** — Catch errors at compile time  
✅ **Automatic Caching** — React Query handles data fetching  
✅ **Optimistic Updates** — Instant UI feedback  
✅ **Persistent State** — Theme and settings saved automatically  
✅ **Developer Tools** — Zustand DevTools + React Query DevTools  
✅ **Code Splitting** — Optimized bundle sizes

See [`docs/HOWTO.md`](docs/HOWTO.md) for detailed guides and [`docs/OPERATING_HANDBOOK.md`](docs/OPERATING_HANDBOOK.md) for operating procedures.

## Features

### Operations
- **POS**: Slab catalog with filters, cart, discount, customer GSTIN-aware invoicing
- **Inventory**: 12+ granite varieties, FIFO stock, low-stock alerts, value tracking
- **Production**: Split → Cut → Polish job cards with labour/power/consumables tracking

### Finance
- **Purchase**: Block procurement POs with MSME flag, GST ITC tracking
- **Accounts**: AR/AP ledgers, GST (CGST/SGST/IGST auto-detect), payment receipts
- **Reports**: Sales MIS, P&L, GSTR-1 and GSTR-3B worksheets

### Setup
- **Masters**: Customer/vendor management with GSTIN validation
- **System**: 4-tier backup (WAL → event → scheduled → manual), auth, compliance

### Compliance
- GST Act 2017 / e-Invoice 2024 (IRN + e-Way Bill)
- MSMED Act 2006 (45-day payment rule)
- IT Act 2000 (immutable audit trail)
- IndAS 2 / IndAS 115 (FIFO + revenue recognition)

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) and [`docs/AZURE-HOSTING-GUIDE.md`](docs/AZURE-HOSTING-GUIDE.md) for the full Azure deployment spec, including CLI commands, cost breakdown, and rollout plan.

Quick deploy:
```bash
# After setting up Azure resources per the spec
git push origin main   # Triggers GitHub Actions → slot swap deploy
```

## Testing

```bash
npm test              # All tests
npm test -w @modernex/api   # API tests only (Vitest + Supertest)
npm test -w @modernex/web   # Frontend tests only
```

## Scripts

```bash
# Development
npm run dev           # Both API (port 8080) + web (port 5173) concurrently
npm run dev:api       # API server only
npm run dev:web       # Frontend dev server only

# Build
npm run build         # Full production build (shared → web → api)
npm run build:api     # Shared + API only
npm run build:web     # Shared + frontend only

# Operations
npm run migrate       # Run DB migrations
npm run backup        # Trigger Blob backup
npm run restore -- 2025-04-15   # Restore from date
```

## Deployment modes

**Monolithic** (default) — API serves the built frontend as static files:
```bash
docker compose up -d            # uses Dockerfile + docker-compose.yml
```

**Split** — API and frontend as separate containers (recommended for scale):
```bash
docker compose -f docker-compose.split.yml up -d
# uses Dockerfile.api + Dockerfile.web (nginx)
# Set VITE_API_URL env var if frontend and API are on different domains
```

## Default Demo Accounts (dev seed)

| Username  | Password    | Role       |
|-----------|-------------|------------|
| admin     | admin123    | admin      |
| accounts  | accounts123 | accounts   |
| yard      | yard123     | yard       |
| sales     | sales123    | sales      |

**⚠️ Change all passwords before production deployment.**

## License

Proprietary — © 2025 Modernex Stones LLP
