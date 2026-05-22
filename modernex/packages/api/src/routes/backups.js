import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import { backup, listBackups } from '../services/backup.js';
import { audit } from '../services/audit.js';

export const backupsRouter = Router();

backupsRouter.use(authenticate);

backupsRouter.get('/', (req, res) => {
  res.json({ backups: listBackups(Number(req.query.limit || 50)) });
});

backupsRouter.post('/trigger',
  requireRole('admin'),
  async (req, res, next) => {
    try {
      const result = await backup('manual');
      audit(req, 'BACKUP_MANUAL', 'backups', result?.blobPath || 'failed', null, result);
      res.json({ result });
    } catch (err) { next(err); }
  }
);
