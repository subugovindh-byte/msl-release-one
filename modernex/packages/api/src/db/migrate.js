import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import { getDb, closeDb } from './connection.js';
import { seedVarietyDefaults } from './seedVarietyDefaults.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../migrations');

export function runMigrations() {
  const db = getDb();

  // Bootstrap migrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
  );

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let ran = 0;
  for (const file of files) {
    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match) continue;

    const version = parseInt(match[1], 10);
    const name = match[2];

    if (applied.has(version)) continue;

    logger.info({ version, name }, 'Applying migration');
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    const tx = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
        .run(version, name);
    });
    tx();

    ran++;
  }

  if (ran === 0) {
    logger.info('Database is up to date');
  } else {
    logger.info({ count: ran }, 'Migrations applied');
  }

  // Seed variety reference photos (idempotent — only fills empty rows)
  try {
    seedVarietyDefaults(db, logger);
  } catch (err) {
    logger.warn({ err: err.message }, 'Variety photo seeding failed (non-fatal)');
  }

  // Bootstrap admin user if no users exist (fresh DB on new deployment)
  try {
    const userCount = db.prepare('SELECT COUNT(*) AS cnt FROM users').get();
    if (userCount && userCount.cnt === 0) {
      const adminPass = process.env.ADMIN_PASS || 'Admin@123';
      const hash = bcrypt.hashSync(adminPass, 12);
      db.prepare(`
        INSERT INTO users (username, password_hash, full_name, role, must_change_password, active)
        VALUES ('admin', ?, 'Administrator', 'admin', 1, 1)
      `).run(hash);
      logger.info('Bootstrap: admin user created (change password on first login)');
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Admin bootstrap failed (non-fatal)');
  }

  return ran;
}

// Run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
  closeDb();
}
