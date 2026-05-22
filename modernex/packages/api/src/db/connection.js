import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let _db = null;
let _isClosing = false;

export function getDb() {
  if (_db) return _db;
  if (_isClosing) throw new Error('Database is closing');

  try {
    // Ensure directory exists
    const dir = path.dirname(config.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    _db = new Database(config.dbPath, {
      verbose: config.isDev() ? (msg) => logger.debug({ sql: msg }) : null,
      timeout: 10000, // 10s timeout for busy database
    });

    // ── Performance + durability PRAGMAs ──
    _db.pragma('journal_mode = WAL');          // Write-ahead log → readers don't block writers
    _db.pragma('synchronous = NORMAL');         // Durability + speed balance (safe with WAL)
    _db.pragma('foreign_keys = ON');            // Enforce FK constraints
    _db.pragma('cache_size = -64000');          // 64 MB cache (negative = KB)
    _db.pragma('temp_store = MEMORY');          // Temp tables in RAM
    _db.pragma('busy_timeout = 10000');         // Wait 10s before SQLITE_BUSY error

    // Connection validation
    _db.prepare('SELECT 1').get();

    logger.info({ path: config.dbPath }, 'Database ready');
    return _db;
  } catch (err) {
    logger.error({ err: err.message }, 'Database connection failed');
    throw new Error(`Database initialization failed: ${err.message}`);
  }
}

export function closeDb() {
  if (_db && !_isClosing) {
    _isClosing = true;
    try {
      // Checkpoint WAL to ensure data durability
      _db.pragma('wal_checkpoint(TRUNCATE)');
      _db.close();
      logger.info('Database closed gracefully');
    } catch (err) {
      logger.error({ err: err.message }, 'Error closing database');
    } finally {
      _db = null;
      _isClosing = false;
    }
  }
}

// For testing: force reset connection (call after changing process.env.DB_PATH)
export function resetDbConnection() {
  closeDb();
  _db = null;
  _isClosing = false;
}

// Health check
export function checkDbHealth() {
  try {
    const db = getDb();
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

// Graceful shutdown
let shutdownInProgress = false;
async function gracefulShutdown(signal) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  logger.info({ signal }, 'Shutdown initiated');
  
  // Give ongoing operations time to complete
  setTimeout(() => {
    closeDb();
    process.exit(0);
  }, 5000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
