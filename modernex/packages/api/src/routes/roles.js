import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError, NotFoundError } from '../middleware/error.js';
import { audit } from '../services/audit.js';

export const rolesRouter = Router();
export const permissionsRouter = Router();

rolesRouter.use(authenticate);
rolesRouter.use(requireRole('admin'));
permissionsRouter.use(authenticate);
permissionsRouter.use(requireRole('admin'));

const roleSchema = z.object({
  name: z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/, 'Lowercase letters, numbers, _ - only'),
  description: z.string().max(200).optional(),
  permission_ids: z.array(z.number().int().positive()).optional(),
});

// ─── GET /roles ───
rolesRouter.get('/', (req, res) => {
  const db = getDb();
  const roles = db.prepare(`
    SELECT r.id, r.name, r.description, r.is_system, r.created_at, r.created_by
    FROM roles r ORDER BY r.is_system DESC, r.name
  `).all();

  const permMap = db.prepare(`
    SELECT rp.role_id, p.id, p.resource, p.action, p.description
    FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
  `).all();

  const byRole = {};
  for (const p of permMap) {
    (byRole[p.role_id] ??= []).push({ id: p.id, resource: p.resource, action: p.action, description: p.description });
  }

  res.json({ roles: roles.map(r => ({ ...r, permissions: byRole[r.id] ?? [] })) });
});

// ─── GET /permissions ───
permissionsRouter.get('/', (req, res) => {
  const db = getDb();
  const perms = db.prepare(
    'SELECT id, resource, action, description FROM permissions ORDER BY resource, action'
  ).all();
  res.json({ permissions: perms });
});

// ─── POST /roles ───
rolesRouter.post('/', validate(roleSchema), (req, res, next) => {
  try {
    const db = getDb();
    const { name, description, permission_ids = [] } = req.body;

    const existing = db.prepare('SELECT id FROM roles WHERE name = ?').get(name);
    if (existing) throw new AppError('Role name already exists', 409);

    const result = db.prepare(
      'INSERT INTO roles (name, description, is_system, created_by) VALUES (?, ?, 0, ?)'
    ).run(name, description ?? null, req.user.username);

    const roleId = result.lastInsertRowid;

    if (permission_ids.length) {
      const insert = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
      for (const pid of permission_ids) insert.run(roleId, pid);
    }

    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(roleId);
    audit(req, 'ROLE_CREATE', 'roles', roleId, null, { name });
    res.status(201).json({ role: { ...role, permissions: permission_ids } });
  } catch (err) { next(err); }
});

// ─── PATCH /roles/:id ───
rolesRouter.patch('/:id', validate(roleSchema.partial()), (req, res, next) => {
  try {
    const db = getDb();
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!role) throw new NotFoundError('Role not found');

    const { name, description, permission_ids } = req.body;

    // System roles: only permissions can be changed, not name
    if (role.is_system && name && name !== role.name) {
      throw new AppError('Cannot rename a system role', 400);
    }

    if (name || description !== undefined) {
      const fields = [];
      const vals = [];
      if (name) { fields.push('name = ?'); vals.push(name); }
      if (description !== undefined) { fields.push('description = ?'); vals.push(description); }
      vals.push(role.id);
      db.prepare(`UPDATE roles SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    }

    if (permission_ids !== undefined) {
      db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(role.id);
      const insert = db.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
      for (const pid of permission_ids) insert.run(role.id, pid);
    }

    const updated = db.prepare('SELECT * FROM roles WHERE id = ?').get(role.id);
    audit(req, 'ROLE_UPDATE', 'roles', role.id, { name: role.name }, { name: updated.name });
    res.json({ role: updated });
  } catch (err) { next(err); }
});

// ─── DELETE /roles/:id ───
rolesRouter.delete('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(req.params.id);
    if (!role) throw new NotFoundError('Role not found');
    if (role.is_system) throw new AppError('Cannot delete system roles', 400);

    const inUse = db.prepare('SELECT COUNT(*) AS n FROM user_roles WHERE role_id = ?').get(role.id).n;
    if (inUse > 0) throw new AppError(`Role is assigned to ${inUse} user(s) — unassign first`, 409);

    db.prepare('DELETE FROM roles WHERE id = ?').run(role.id);
    audit(req, 'ROLE_DELETE', 'roles', role.id, { name: role.name }, null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
