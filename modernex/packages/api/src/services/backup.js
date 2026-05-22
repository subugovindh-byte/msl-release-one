import { BlobServiceClient } from '@azure/storage-blob';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getDb } from '../db/connection.js';

const gzipAsync = promisify(gzip);
let _eventBackupLastRun = 0;
const EVENT_DEBOUNCE_MS = 15 * 60 * 1000;  // 15 min

/**
 * Create a snapshot and upload to Azure Blob.
 * @param trigger - 'scheduled' | 'event' | 'manual' | 'migration'
 */
export async function backup(trigger = 'manual') {
  const db = getDb();

  // Debounce event-triggered backups
  if (trigger === 'event') {
    const now = Date.now();
    if (now - _eventBackupLastRun < EVENT_DEBOUNCE_MS) {
      logger.debug('Event backup debounced');
      return null;
    }
    _eventBackupLastRun = now;
  }

  try {
    // 1. Checkpoint WAL so the main DB has all committed data
    db.pragma('wal_checkpoint(TRUNCATE)');

    // 2. Read the DB file
    const dbBuffer = fs.readFileSync(config.dbPath);

    // 3. Compress
    const compressed = await gzipAsync(dbBuffer);

    // 4. Hash for integrity check
    const sha256 = crypto.createHash('sha256').update(compressed).digest('hex');

    // 5. Build blob path: trigger/YYYY-MM-DDTHH-MM-SS.db.gz
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const subdir = {
      scheduled: 'daily',
      event: 'event',
      manual: 'manual',
      migration: 'migration',
    }[trigger] || 'other';
    const blobPath = `modernex/${subdir}/${ts}.db.gz`;

    // 6. Upload (or skip in dev if no connection string)
    if (!config.azure.blobConnection) {
      logger.warn({ blobPath, size: compressed.length }, 'Backup computed but AZURE_STORAGE_CONNECTION_STRING not set; skipping upload');
      // Still log it in the backups registry as a dry-run
      db.prepare(
        `INSERT INTO backups (trigger, blob_path, size_bytes, sha256, ok, error)
         VALUES (?, ?, ?, ?, 1, ?)`
      ).run(trigger, blobPath, compressed.length, sha256, 'dry-run (no Azure conn)');
      return { blobPath, sizeBytes: compressed.length, sha256, dryRun: true };
    }

    const blobService = BlobServiceClient.fromConnectionString(config.azure.blobConnection);
    const container = blobService.getContainerClient(config.azure.blobContainer);
    await container.createIfNotExists();
    const blob = container.getBlockBlobClient(blobPath);

    await blob.uploadData(compressed, {
      blobHTTPHeaders: {
        blobContentType: 'application/gzip',
        blobContentEncoding: 'gzip',
      },
      metadata: {
        sha256,
        trigger,
        created: new Date().toISOString(),
      },
    });

    // 7. Register in DB
    db.prepare(
      `INSERT INTO backups (trigger, blob_path, size_bytes, sha256, ok)
       VALUES (?, ?, ?, ?, 1)`
    ).run(trigger, blobPath, compressed.length, sha256);

    logger.info({ blobPath, sizeBytes: compressed.length, trigger }, 'Backup uploaded');
    return { blobPath, sizeBytes: compressed.length, sha256 };

  } catch (err) {
    logger.error({ err, trigger }, 'Backup failed');
    db.prepare(
      `INSERT INTO backups (trigger, blob_path, size_bytes, ok, error)
       VALUES (?, ?, ?, 0, ?)`
    ).run(trigger, '(failed)', 0, err.message);
    throw err;
  }
}

/**
 * List backups from the registry.
 */
export function listBackups(limit = 50) {
  const db = getDb();
  return db.prepare(
    `SELECT id, ts, trigger, blob_path, size_bytes, sha256, ok, error
     FROM backups ORDER BY ts DESC LIMIT ?`
  ).all(limit);
}

/**
 * Download a specific backup blob to a local file.
 */
export async function downloadBackup(blobPath, targetPath) {
  if (!config.azure.blobConnection) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING not configured');
  }
  const blobService = BlobServiceClient.fromConnectionString(config.azure.blobConnection);
  const container = blobService.getContainerClient(config.azure.blobContainer);
  const blob = container.getBlockBlobClient(blobPath);
  await blob.downloadToFile(targetPath);
  logger.info({ blobPath, targetPath }, 'Backup downloaded');
}
