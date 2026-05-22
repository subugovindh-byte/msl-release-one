/**
 * clean-data.js — Wipe all transactional and master data, keep schema + users.
 *
 * Usage:  node packages/api/src/scripts/clean-data.js
 *     OR: npm run clean -w @modernex/api
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.resolve(__dirname, '../../data/modernex.db');

console.log('\n🗑  Dropping database…');
for (const ext of ['', '-shm', '-wal']) {
  const f = DB_PATH + ext;
  if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('   deleted', path.basename(f)); }
}

console.log('\n📦 Running migrations…');
runMigrations();

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Users to create — change passwords here before production
const USERS_RAW = [
  { username: 'admin',    pw: 'admin123',    name: 'Administrator', role: 'admin' },
  { username: 'accounts', pw: 'accounts123', name: 'Accounts',      role: 'accounts' },
  { username: 'sales',    pw: 'sales123',    name: 'Sales',         role: 'sales' },
  { username: 'yard',     pw: 'yard123',     name: 'Yard',          role: 'yard' },
];
const USERS = await Promise.all(
  USERS_RAW.map(async u => ({ ...u, hash: await bcrypt.hash(u.pw, 10) }))
);
const insUser = db.prepare('INSERT INTO users (username,password_hash,full_name,role) VALUES (?,?,?,?)');
db.transaction(() => { for (const u of USERS) insUser.run(u.username, u.hash, u.name, u.role); })();
console.log(`\n✅ Created ${USERS.length} users`);

db.close();

// Touch server.js so node --watch restarts the API automatically
const serverPath = path.resolve(__dirname, '../server.js');
const now = new Date();
fs.utimesSync(serverPath, now, now);
console.log('↺  Touched server.js — API server restarting…');

console.log(`
╔══════════════════════════════════════════════════════╗
║  Database cleaned. All sample data removed.          ║
║                                                      ║
║  Users:  admin / admin123                            ║
║          accounts / accounts123                      ║
║          sales / sales123                            ║
║          yard / yard123                              ║
║                                                      ║
║  ⚠  Change all passwords before production use.     ║
╚══════════════════════════════════════════════════════╝
`);
