import path from 'node:path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { runMigrations } from './db/migrate.js';
import { seed } from './db/seed.js';
import { startScheduler } from './services/scheduler.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';

// Routes
import { authRouter } from './routes/auth.js';
import { slabsRouter } from './routes/slabs.js';
import { productsRouter } from './routes/products.js';
import { locationsRouter } from './routes/locations.js';
import { customersRouter } from './routes/customers.js';
import { vendorsRouter } from './routes/vendors.js';
import { invoicesRouter } from './routes/invoices.js';
import { purchaseRouter } from './routes/purchase.js';
import { productionRouter } from './routes/production.js';
import { paymentsRouter } from './routes/payments.js';
import { reportsRouter } from './routes/reports.js';
import { backupsRouter } from './routes/backups.js';
import { invoiceDeliveryRouter } from './routes/invoiceDelivery.js';
import { usersRouter, selfServiceRouter } from './routes/users.js';
import { rolesRouter, permissionsRouter } from './routes/roles.js';
import { consumablesRouter } from './routes/consumables.js';
import { whatsappWebhookRouter } from './routes/webhooks.js';
import { photosRouter, slabPhotoRouter } from './routes/photos.js';
import { collectionAccountsRouter } from './routes/collectionAccounts.js';
import { qrRouter } from './routes/qr.js';
import { varietyDefaultsRouter } from './routes/varietyDefaults.js';
import { companyRouter } from './routes/company.js';
import { varietyMasterRouter } from './routes/varietyMaster.js';
import { dcnRouter } from './routes/debitCreditNotes.js';
import { grnRouter, mountTransportUpdate } from './routes/grn.js';
import { tdsRouter } from './routes/tds.js';
import { fixedAssetsRouter } from './routes/fixedAssets.js';
import { payrollRouter } from './routes/payroll.js';
import { pdcRouter } from './routes/pdc.js';
import { chartOfAccountsRouter } from './routes/chartOfAccounts.js';
import { bankReconRouter } from './routes/bankRecon.js';
import { budgetsRouter } from './routes/budgets.js';
import { msmeRouter } from './routes/msme.js';
import { adminSampleTxRouter } from './routes/adminSampleTx.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);  // Azure App Service sits behind Front Door

  // ── SECURITY ──
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // ── CORS — strict origin check ──
  app.use(cors({
    origin: config.corsOrigin.split(',').map(s => s.trim()),
    credentials: true,
  }));

  // ── STANDARD MIDDLEWARE ──
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => req.url === '/api/health',
    },
  }));

  // ── HEALTH CHECK ──
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      env: config.env,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // ── API ROUTES ──
  // Webhooks first — no auth, no rate limit (providers retry aggressively)
  app.use('/webhooks', whatsappWebhookRouter);

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRouter);
  app.use('/api/slabs', slabsRouter);
  app.use('/api/slabs', slabPhotoRouter);       // /:id/photo and /varieties/:v/photo
  app.use('/api/products', productsRouter);     // v5 polymorphic product routes
  app.use('/api/locations', locationsRouter);
  app.use('/api/variety-defaults', varietyDefaultsRouter); // v7 variety reference photos
  app.use('/api/photos', photosRouter);         // streams blobs back to clients
  app.use('/api/customers', customersRouter);
  app.use('/api/vendors', vendorsRouter);
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/invoices', invoiceDeliveryRouter);  // /pdf, /send-email, /send-whatsapp
  app.use('/api/purchase', purchaseRouter);
  app.use('/api/production', productionRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/backups', backupsRouter);
  app.use('/api/users', usersRouter);           // admin user management (admin-only)
  app.use('/api/users', selfServiceRouter);     // /me/change-password (any auth'd user)
  app.use('/api/roles', rolesRouter);           // role CRUD (admin-only)
  app.use('/api/permissions', permissionsRouter); // permission list (admin-only)
  app.use('/api/consumable-purchases', consumablesRouter);
  app.use('/api/collection-accounts', collectionAccountsRouter);
  app.use('/api/company', companyRouter);
  app.use('/api/qr', qrRouter);
  app.use('/api/variety-master', varietyMasterRouter);
  app.use('/api/dcn', dcnRouter);
  app.use('/api/grn', grnRouter);
  mountTransportUpdate(purchaseRouter);  // adds PATCH /api/purchase/:id/transport
  app.use('/api/tds', tdsRouter);
  app.use('/api/fixed-assets', fixedAssetsRouter);
  app.use('/api/payroll', payrollRouter);
  app.use('/api/pdc', pdcRouter);
  app.use('/api/coa', chartOfAccountsRouter);
  app.use('/api/bank-recon', bankReconRouter);
  app.use('/api/budgets', budgetsRouter);
  app.use('/api/msme', msmeRouter);
  app.use('/api/admin/sample-tx', adminSampleTxRouter);

  // ── STATIC FRONTEND (production) ──
  if (config.isProd()) {
    // __dirname = packages/api/src/ → ../../web/dist = packages/web/dist
    const webDist = path.join(__dirname, '../../web/dist');
    app.use(express.static(webDist));
    // SPA fallback
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) return notFoundHandler(req, res);
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  // ── ERRORS ──
  app.use('/api/*', notFoundHandler);
  app.use(errorHandler);

  return app;
}

// ── STARTUP ──
export async function start() {
  try {
    // 1. Run DB migrations
    const migrationsRan = runMigrations();
    if (migrationsRan > 0) {
      logger.info({ count: migrationsRan }, 'Migrations applied on startup');
    }

    // 2. First-run seed: create admin user if no users exist (dev + prod)
    await seed();

    // 3. Start scheduler (nightly backup, token cleanup)
    startScheduler();

    // 4. Verify SMTP connection (non-fatal)
    import('./services/email.js').then(({ verifySMTP }) => verifySMTP());

    // 5. Boot server
    const app = createApp();
    const server = app.listen(config.port, () => {
      logger.info({
        port: config.port,
        env: config.env,
      }, '🗿  Modernex API listening');
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`Port ${config.port} busy — retrying in 1s...`);
        setTimeout(() => server.listen(config.port), 1000);
      } else {
        logger.fatal({ err }, 'Server error');
        process.exit(1);
      }
    });
  } catch (err) {
    logger.fatal({ err }, 'Startup failed');
    process.exit(1);
  }
}

// Run directly - check if this module is the main entry point
// In ES modules, we need to compare the resolved file URLs
const isMainModule = process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  start();
}
