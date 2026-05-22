#!/usr/bin/env node
// ══════════════════════════════════════════
// One-off backup trigger (outside the running API)
// Usage: node scripts/backup-to-blob.js
// ══════════════════════════════════════════

import 'dotenv/config';
import { backup } from '../packages/api/src/services/backup.js';
import { closeDb } from '../packages/api/src/db/connection.js';

try {
  const result = await backup('manual');
  if (result?.dryRun) {
    console.log('\n✓ Backup computed (dry-run — no Azure conn set)');
    console.log(`  Size: ${Math.round(result.sizeBytes / 1024)} KB`);
    console.log(`  SHA-256: ${result.sha256}`);
  } else if (result) {
    console.log('\n✓ Backup uploaded');
    console.log(`  Path: ${result.blobPath}`);
    console.log(`  Size: ${Math.round(result.sizeBytes / 1024)} KB`);
    console.log(`  SHA-256: ${result.sha256}`);
  }
} catch (err) {
  console.error('\n✗ Backup failed:', err.message);
  process.exit(1);
} finally {
  closeDb();
}
