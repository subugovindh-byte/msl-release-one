import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { NotFoundError } from '../middleware/error.js';
import { nextAssetId } from '../services/idGenerator.js';

export const fixedAssetsRouter = Router();
fixedAssetsRouter.use(authenticate);

// ─── GET /fixed-assets ──────────────────────────────────────────────────────
fixedAssetsRouter.get('/', requireRole('admin', 'accounts'), (req, res) => {
  const { category, disposed } = req.query;
  const db = getDb();
  let sql = `
    SELECT a.*, v.name AS vendor_name,
           (SELECT closing_wdv_paise FROM asset_depreciation_log WHERE asset_id = a.id ORDER BY fy DESC LIMIT 1) AS current_wdv_paise
    FROM fixed_assets a
    LEFT JOIN vendors v ON v.id = a.vendor_id
    WHERE 1=1
  `;
  const params = [];
  if (category) { sql += ' AND a.category = ?'; params.push(category); }
  if (disposed !== undefined) { sql += ' AND a.disposed = ?'; params.push(disposed === 'true' ? 1 : 0); }
  else { sql += ' AND a.disposed = 0'; }
  sql += ' ORDER BY a.purchase_date DESC';
  res.json({ assets: db.prepare(sql).all(...params) });
});

// ─── GET /fixed-assets/:id ──────────────────────────────────────────────────
fixedAssetsRouter.get('/:id', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const asset = db.prepare('SELECT * FROM fixed_assets WHERE id = ?').get(req.params.id);
    if (!asset) throw new NotFoundError('Asset not found');
    const depLog = db.prepare('SELECT * FROM asset_depreciation_log WHERE asset_id = ? ORDER BY fy').all(req.params.id);
    res.json({ asset, depreciation_log: depLog });
  } catch (err) { next(err); }
});

// ─── POST /fixed-assets ─────────────────────────────────────────────────────
fixedAssetsRouter.post('/', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { name, category, purchase_date, purchase_cost_paise, description, vendor_id,
            location, serial_no, depreciation_method, depreciation_rate_pct, account_id } = req.body;
    if (!name || !category || !purchase_date || !purchase_cost_paise)
      return res.status(400).json({ error: 'name, category, purchase_date, purchase_cost_paise required' });

    const id = nextAssetId();
    const itBlockMap = {
      'Plant & Machinery': 'Plant & Machinery',
      'Vehicles': 'Motor Vehicles',
      'Land & Building': 'Buildings',
      'Furniture & Fixtures': 'Furniture & Fittings',
      'Computer & Peripherals': 'Computer & Peripherals',
      'Other': 'Other Assets',
    };

    db.prepare(`
      INSERT INTO fixed_assets
        (id, name, category, it_block, purchase_date, purchase_cost_paise, description,
         vendor_id, location, serial_no, depreciation_method, depreciation_rate_pct, account_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(id, name, category, itBlockMap[category] || category,
           purchase_date, purchase_cost_paise,
           description || null, vendor_id || null, location || null,
           serial_no || null, depreciation_method || 'WDV',
           depreciation_rate_pct ?? 15.0, account_id || null);

    res.status(201).json({ asset: db.prepare('SELECT * FROM fixed_assets WHERE id = ?').get(id) });
  } catch (err) { next(err); }
});

// ─── PATCH /fixed-assets/:id ────────────────────────────────────────────────
fixedAssetsRouter.patch('/:id', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const asset = db.prepare('SELECT * FROM fixed_assets WHERE id = ?').get(req.params.id);
    if (!asset) throw new NotFoundError('Asset not found');
    const fields = ['name','category','description','location','serial_no','account_id'];
    const sets = [], params = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) { sets.push(`${f} = ?`); params.push(req.body[f]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'No updatable fields' });
    params.push(req.params.id);
    db.prepare(`UPDATE fixed_assets SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    res.json({ asset: db.prepare('SELECT * FROM fixed_assets WHERE id = ?').get(req.params.id) });
  } catch (err) { next(err); }
});

// ─── POST /fixed-assets/:id/dispose ─────────────────────────────────────────
fixedAssetsRouter.post('/:id/dispose', requireRole('admin'), (req, res, next) => {
  try {
    const db = getDb();
    const { disposal_date, disposal_value_paise } = req.body;
    if (!disposal_date) return res.status(400).json({ error: 'disposal_date required' });
    db.prepare('UPDATE fixed_assets SET disposed = 1, disposal_date = ?, disposal_value_paise = ? WHERE id = ?')
      .run(disposal_date, disposal_value_paise || 0, req.params.id);
    res.json({ asset: db.prepare('SELECT * FROM fixed_assets WHERE id = ?').get(req.params.id) });
  } catch (err) { next(err); }
});

// ─── POST /fixed-assets/depreciation/run ── Compute WDV depreciation for a FY
fixedAssetsRouter.post('/depreciation/run', requireRole('admin', 'accounts'), (req, res, next) => {
  try {
    const db = getDb();
    const { fy } = req.body;
    if (!fy) return res.status(400).json({ error: 'fy required (e.g. 2025-26)' });

    const assets = db.prepare('SELECT * FROM fixed_assets WHERE disposed = 0').all();
    const results = [];

    db.transaction(() => {
      for (const asset of assets) {
        const prevLog = db.prepare(
          'SELECT * FROM asset_depreciation_log WHERE asset_id = ? ORDER BY fy DESC LIMIT 1'
        ).get(asset.id);
        const openingWdv = prevLog ? prevLog.closing_wdv_paise : asset.purchase_cost_paise;
        let deprPaise = 0;
        if (asset.depreciation_method === 'WDV') {
          deprPaise = Math.round(openingWdv * asset.depreciation_rate_pct / 100);
        } else {
          // SLM: original cost / useful life, approximate as rate on cost
          deprPaise = Math.round(asset.purchase_cost_paise * asset.depreciation_rate_pct / 100);
        }
        const closingWdv = Math.max(0, openingWdv - deprPaise);
        db.prepare(`
          INSERT OR REPLACE INTO asset_depreciation_log
            (asset_id, fy, opening_wdv_paise, addition_paise, disposal_paise, depreciation_paise, closing_wdv_paise)
          VALUES (?,?,?,0,0,?,?)
        `).run(asset.id, fy, openingWdv, deprPaise, closingWdv);
        results.push({ id: asset.id, name: asset.name, fy, openingWdv, deprPaise, closingWdv });
      }
    })();

    res.json({ fy, computed: results.length, results });
  } catch (err) { next(err); }
});
