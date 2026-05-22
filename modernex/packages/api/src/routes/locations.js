import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate } from '../middleware/auth.js';

export const locationsRouter = Router();
locationsRouter.use(authenticate);

locationsRouter.get('/', (_req, res) => {
  const db = getDb();
  const locations = db.prepare(`
    SELECT id, name, location_type, stage_hint, is_active, sort_order
    FROM locations
    WHERE is_active = 1
    ORDER BY sort_order, name
  `).all();
  res.json({ locations });
});