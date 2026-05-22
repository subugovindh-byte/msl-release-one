import cron from 'node-cron';
import { backup } from './backup.js';
import { getDb } from '../db/connection.js';
import { logger } from '../utils/logger.js';

/**
 * Register all scheduled jobs.
 * Called once from server.js after DB is ready.
 */
export function startScheduler() {
  // Nightly backup at 02:00 IST (India timezone)
  cron.schedule('0 2 * * *', async () => {
    logger.info('Running scheduled nightly backup');
    try {
      await backup('scheduled');
    } catch (err) {
      logger.error({ err }, 'Scheduled backup failed');
    }
  }, { timezone: 'Asia/Kolkata' });

  // Every 6 hours: cleanup old refresh tokens
  cron.schedule('0 */6 * * *', () => {
    const db = getDb();
    const deleted = db.prepare(
      `DELETE FROM refresh_tokens WHERE expires_at < datetime('now') OR revoked = 1`
    ).run();
    if (deleted.changes > 0) {
      logger.info({ count: deleted.changes }, 'Cleaned up expired refresh tokens');
    }
  }, { timezone: 'Asia/Kolkata' });

  // Weekly: WAL checkpoint to prevent unbounded WAL growth
  cron.schedule('0 3 * * 0', () => {
    const db = getDb();
    db.pragma('wal_checkpoint(TRUNCATE)');
    logger.info('Weekly WAL checkpoint complete');
  }, { timezone: 'Asia/Kolkata' });

  logger.info('Scheduler started (nightly backup @ 02:00 IST)');
}
