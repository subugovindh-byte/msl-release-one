import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { multipart } from '../middleware/multipart.js';
import { AppError, NotFoundError } from '../middleware/error.js';
import {
  uploadSlabPhoto, uploadVarietyPhoto,
  streamPhoto, deletePhoto,
} from '../services/photos.js';
import { audit } from '../services/audit.js';

export const photosRouter = Router();

// ─── GET /api/photos/:path(*) — stream blob back to client (auth required) ───
// e.g. GET /api/photos/slabs%2FS001%2Fabc.jpg
photosRouter.get('/*', authenticate, async (req, res, next) => {
  try {
    // Express encodes the splat; we need the raw path after /api/photos/
    const rawPath = decodeURIComponent(req.params[0] || '');
    if (!rawPath || rawPath.includes('..')) {
      throw new AppError('Invalid path', 400);
    }
    await streamPhoto(rawPath, res);
  } catch (err) { next(err); }
});

// ─── POST /api/slabs/:id/photo — upload photo for a specific slab ───
export const slabPhotoRouter = Router();
slabPhotoRouter.use(authenticate);

slabPhotoRouter.post('/:id/photo',
  requireRole('admin', 'yard', 'sales'),
  multipart({ maxBytes: 6 * 1024 * 1024 }),
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError('No file uploaded', 400);
      const db = getDb();
      const slab = db.prepare('SELECT * FROM slabs WHERE id = ?').get(req.params.id);
      if (!slab) throw new NotFoundError('Slab not found');

      // Upload new blob
      const { url, path, size } = await uploadSlabPhoto(
        req.params.id, req.file.buffer, req.file.mimetype
      );

      // Delete old one if exists
      if (slab.photo_url) {
        const oldPath = extractBlobPath(slab.photo_url);
        if (oldPath) deletePhoto(oldPath).catch(() => {});
      }

      // Update DB
      db.prepare(`
        UPDATE slabs SET photo_url = ?, photo_uploaded_at = datetime('now'),
                         photo_uploaded_by = ?, photo_size_bytes = ?
        WHERE id = ?
      `).run(url, req.user.username, size, req.params.id);

      audit(req, 'SLAB_PHOTO_UPLOAD', 'slabs', req.params.id,
            { photo_url: slab.photo_url }, { photo_url: url });

      res.status(201).json({
        slab_id: req.params.id,
        photo_url: url,
        size_bytes: size,
      });
    } catch (err) { next(err); }
  }
);

// ─── DELETE /api/slabs/:id/photo ───
slabPhotoRouter.delete('/:id/photo',
  requireRole('admin', 'yard'),
  async (req, res, next) => {
    try {
      const db = getDb();
      const slab = db.prepare('SELECT * FROM slabs WHERE id = ?').get(req.params.id);
      if (!slab) throw new NotFoundError('Slab not found');
      if (!slab.photo_url) return res.json({ ok: true });

      const blobPath = extractBlobPath(slab.photo_url);
      if (blobPath) await deletePhoto(blobPath);

      db.prepare(`
        UPDATE slabs SET photo_url = NULL, photo_uploaded_at = NULL,
                         photo_uploaded_by = NULL, photo_size_bytes = NULL
        WHERE id = ?
      `).run(req.params.id);

      audit(req, 'SLAB_PHOTO_DELETE', 'slabs', req.params.id,
            { photo_url: slab.photo_url }, null);
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

// ─── GET /api/slabs/varieties/photos — all variety default photos ───
slabPhotoRouter.get('/varieties/photos', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT variety, photo_url, attribution FROM variety_photos').all();
  res.json({ varieties: rows });
});

// ─── POST /api/slabs/varieties/:variety/photo ───
slabPhotoRouter.post('/varieties/:variety/photo',
  requireRole('admin'),
  multipart({ maxBytes: 6 * 1024 * 1024 }),
  async (req, res, next) => {
    try {
      if (!req.file) throw new AppError('No file uploaded', 400);
      const variety = req.params.variety;

      const { url, size } = await uploadVarietyPhoto(
        variety, req.file.buffer, req.file.mimetype
      );

      const db = getDb();
      db.prepare(`
        INSERT INTO variety_photos (variety, photo_url, attribution, updated_by)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(variety) DO UPDATE SET
          photo_url = excluded.photo_url,
          attribution = excluded.attribution,
          updated_at = datetime('now'),
          updated_by = excluded.updated_by
      `).run(variety, url, req.body?.attribution || null, req.user.username);

      audit(req, 'VARIETY_PHOTO_UPLOAD', 'variety_photos', variety, null, { url });
      res.status(201).json({ variety, photo_url: url, size_bytes: size });
    } catch (err) { next(err); }
  }
);

// Helper — extract blob path from a /api/photos/... URL
function extractBlobPath(url) {
  if (!url) return null;
  if (url.startsWith('data:')) return null;
  const match = url.match(/^\/api\/photos\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}
