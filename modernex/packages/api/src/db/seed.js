/**
 * seed.js — Production-safe first-run seeder
 *
 * Creates ONE admin user if no users exist.
 * No demo data — customers, vendors, products, transactions must be
 * entered through the application UI.
 *
 * For dev/demo data use: npm run demo:reset
 */

import bcrypt from 'bcrypt';
import { getDb } from './connection.js';
import { runMigrations } from './migrate.js';
import { logger } from '../utils/logger.js';

export async function seed() {
  runMigrations();
  const db = getDb();

  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0) {
    logger.info('Database already has users — skipping first-run seed');
    return;
  }

  logger.info('First run: creating default admin user…');

  const password  = process.env.ADMIN_PASSWORD || 'admin123';
  const fullName  = process.env.ADMIN_NAME     || 'Administrator';
  const username  = process.env.ADMIN_USERNAME || 'admin';

  const hash = await bcrypt.hash(password, 12);
  db.prepare(
    'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)'
  ).run(username, hash, fullName, 'admin');

  // Wire the new admin into user_roles (migration may have run before user existed)
  const adminRole = db.prepare("SELECT id FROM roles WHERE name = 'admin'").get();
  if (adminRole) {
    const newUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (newUser) {
      db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)')
        .run(newUser.id, adminRole.id, 'system_seed');
    }
  }

  logger.info({ username }, 'Default admin user created — change password immediately after first login');

  if (password === 'admin123') {
    logger.warn('Using default password "admin123" — set ADMIN_PASSWORD env var before production deployment');
  }
}

// Run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  await seed();
  process.exit(0);
}
