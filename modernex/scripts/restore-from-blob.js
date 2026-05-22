#!/usr/bin/env node
// ══════════════════════════════════════════
// Restore SQLite DB from Azure Blob snapshot
//
// Usage:
//   node scripts/restore-from-blob.js                    # list available
//   node scripts/restore-from-blob.js 2025-04-15         # restore that date
//   node scripts/restore-from-blob.js modernex/daily/... # explicit path
// ══════════════════════════════════════════

import 'dotenv/config';
import { BlobServiceClient } from '@azure/storage-blob';
import { createReadStream, createWriteStream, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline/promises';

const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_BLOB_CONTAINER || 'backups';
const dbPath = process.env.DB_PATH || './data/modernex.db';

if (!conn) {
  console.error('✗ AZURE_STORAGE_CONNECTION_STRING not set');
  process.exit(1);
}

const arg = process.argv[2];
const service = BlobServiceClient.fromConnectionString(conn);
const container = service.getContainerClient(containerName);

async function listAvailable() {
  console.log(`\nAvailable backups in ${containerName}:\n`);
  const grouped = { daily: [], event: [], manual: [] };
  for await (const blob of container.listBlobsFlat({ prefix: 'modernex/' })) {
    const parts = blob.name.split('/');
    const category = parts[1];
    if (grouped[category]) {
      grouped[category].push({ name: blob.name, size: blob.properties.contentLength, modified: blob.properties.lastModified });
    }
  }
  for (const [cat, items] of Object.entries(grouped)) {
    if (items.length === 0) continue;
    console.log(`  ${cat.toUpperCase()}  (${items.length})`);
    items.slice(-10).forEach(b => {
      console.log(`    ${b.name}  ${Math.round(b.size / 1024)}KB  ${b.modified.toISOString()}`);
    });
    console.log('');
  }
  console.log('Usage:  node scripts/restore-from-blob.js <date-or-path>');
}

async function restoreByDate(date) {
  // Find the daily snapshot matching YYYY-MM-DD
  console.log(`Searching for daily backup on ${date}...`);
  let match = null;
  for await (const blob of container.listBlobsFlat({ prefix: `modernex/daily/${date}` })) {
    match = blob.name;
    break;
  }
  if (!match) {
    console.error(`✗ No daily backup found for ${date}`);
    console.error('  Run without args to list available backups');
    process.exit(1);
  }
  return restoreBlob(match);
}

async function restoreBlob(blobPath) {
  console.log(`\nRestoring: ${blobPath}`);

  // Confirm overwrite
  if (existsSync(dbPath)) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await rl.question(`  Target ${dbPath} exists. Overwrite? [y/N] `);
    rl.close();
    if (ans.toLowerCase() !== 'y') {
      console.log('Aborted.');
      process.exit(0);
    }

    // Back up the existing one
    const bkpPath = dbPath + '.bak.' + Date.now();
    copyFileSync(dbPath, bkpPath);
    console.log(`  Existing DB backed up to ${bkpPath}`);
  }

  // Ensure target directory exists
  mkdirSync(path.dirname(dbPath), { recursive: true });

  // Download + decompress
  const tmpGz = dbPath + '.downloading.gz';
  const blob = container.getBlockBlobClient(blobPath);
  const props = await blob.getProperties();

  console.log(`  Downloading ${Math.round(props.contentLength / 1024)} KB...`);
  await blob.downloadToFile(tmpGz);

  console.log('  Decompressing...');
  const tmpDb = dbPath + '.restoring';
  await pipeline(
    createReadStream(tmpGz),
    createGunzip(),
    createWriteStream(tmpDb)
  );

  // Verify SHA-256 if metadata has it
  if (props.metadata?.sha256) {
    console.log('  Verifying checksum...');
    const h = crypto.createHash('sha256');
    await pipeline(createReadStream(tmpGz), h);
    const computed = h.digest('hex');
    if (computed !== props.metadata.sha256) {
      console.error('  ✗ SHA-256 mismatch!');
      console.error(`    Expected: ${props.metadata.sha256}`);
      console.error(`    Got:      ${computed}`);
      process.exit(1);
    }
    console.log('  ✓ Checksum verified');
  }

  // Atomic move into place
  copyFileSync(tmpDb, dbPath);
  console.log(`\n✓ Restored to ${dbPath}`);
  console.log('\nNext steps:');
  console.log('  1. Restart the API: npm run dev  (or pm2 restart)');
  console.log('  2. Verify: curl http://localhost:8080/api/health');
}

// ─── Main ───
try {
  if (!arg) {
    await listAvailable();
  } else if (arg.startsWith('modernex/')) {
    await restoreBlob(arg);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    await restoreByDate(arg);
  } else {
    console.error('✗ Invalid argument. Use YYYY-MM-DD or full blob path');
    process.exit(1);
  }
} catch (err) {
  console.error('\n✗ Restore failed:', err.message);
  process.exit(1);
}
