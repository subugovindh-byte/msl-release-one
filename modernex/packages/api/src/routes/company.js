import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { audit } from '../services/audit.js';

export const companyRouter = Router();

companyRouter.use(authenticate);

companyRouter.get('/', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM company_details WHERE id = 1').get();
  res.json({ company: row });
});

companyRouter.put('/',
  requireRole('admin'),
  (req, res, next) => {
    try {
      const db = getDb();
      const { name, trade_name, gstin, pan, hsn, address, city, state, pincode, phone, email, fy } = req.body;

      const before = db.prepare('SELECT * FROM company_details WHERE id = 1').get();

      db.prepare(`
        UPDATE company_details SET
          name       = COALESCE(?, name),
          trade_name = COALESCE(?, trade_name),
          gstin      = COALESCE(?, gstin),
          pan        = COALESCE(?, pan),
          hsn        = COALESCE(?, hsn),
          address    = COALESCE(?, address),
          city       = COALESCE(?, city),
          state      = COALESCE(?, state),
          pincode    = COALESCE(?, pincode),
          phone      = ?,
          email      = ?,
          fy         = COALESCE(?, fy),
          updated_at = datetime('now'),
          updated_by = ?
        WHERE id = 1
      `).run(name, trade_name, gstin, pan, hsn, address, city, state, pincode,
             phone ?? null, email ?? null, fy, req.user?.username ?? null);

      const after = db.prepare('SELECT * FROM company_details WHERE id = 1').get();

      audit(req, 'COMPANY_UPDATE', 'company_details', 1, before, after);

      res.json({ company: after });
    } catch (err) { next(err); }
  }
);
