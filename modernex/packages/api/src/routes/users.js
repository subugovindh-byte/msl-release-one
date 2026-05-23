import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getDb } from '../db/connection.js';
import { config } from '../config.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError, NotFoundError } from '../middleware/error.js';
import { audit } from '../services/audit.js';
import { ROLES } from '@modernex/shared';

export const usersRouter = Router();

usersRouter.use(authenticate);
usersRouter.use(requireRole('admin'));  // ALL endpoints admin-only

const userCreateSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-z0-9_.-]+$/i),
  password: z.string().min(8).max(200).optional(),  // if omitted, random is generated
  full_name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  role: z.enum(ROLES),
  must_change_password: z.boolean().default(true),
});

const userUpdateSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(20).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
});

const passwordResetSchema = z.object({
  new_password: z.string().min(8).max(200).optional(),
  must_change: z.boolean().default(true),
});

function attachRoles(db, users) {
  if (!users.length) return users;
  const ids = users.map(u => u.id);
  const rows = db.prepare(`
    SELECT ur.user_id, r.id AS role_id, r.name, r.description, r.is_system
    FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id IN (${ids.map(() => '?').join(',')})
  `).all(...ids);
  const byUser = {};
  for (const r of rows) (byUser[r.user_id] ??= []).push({ id: r.role_id, name: r.name, description: r.description, is_system: r.is_system });
  return users.map(u => ({ ...u, roles: byUser[u.id] ?? [] }));
}

// ─── GET /users ───
usersRouter.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, username, full_name, email, phone, role, active, last_login,
           failed_attempts, locked_until, must_change_password,
           created_at, created_by, deactivated_at, deactivated_by
    FROM users ORDER BY role, username
  `).all();
  res.json({ users: attachRoles(db, rows) });
});

// ─── GET /users/:id ───
usersRouter.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare(`
      SELECT id, username, full_name, email, phone, role, active, last_login,
             failed_attempts, locked_until, must_change_password,
             created_at, updated_at, created_by, deactivated_at, deactivated_by, deactivation_reason
      FROM users WHERE id = ?
    `).get(req.params.id);
    if (!user) throw new NotFoundError('User not found');
    res.json({ user });
  } catch (err) { next(err); }
});

// ─── POST /users ───
usersRouter.post('/', validate(userCreateSchema), async (req, res, next) => {
  try {
    const db = getDb();
    const { username, full_name, email, phone, role, must_change_password } = req.body;

    // Check duplicates
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) throw new AppError('Username already exists', 409);
    if (email) {
      const emailDup = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (emailDup) throw new AppError('Email already in use', 409);
    }

    // Generate password if not provided (e.g. admin sends welcome email)
    const password = req.body.password || crypto.randomBytes(9).toString('base64').slice(0, 12);
    const password_hash = await bcrypt.hash(password, config.bcryptRounds);

    const result = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, email, phone, role,
                         must_change_password, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      username, password_hash, full_name,
      email || null, phone || null, role,
      must_change_password ? 1 : 0, req.user.username
    );

    const user = db.prepare(
      `SELECT id, username, full_name, email, phone, role, active, must_change_password, created_at
       FROM users WHERE id = ?`
    ).get(result.lastInsertRowid);

    // Insert into user_roles (lookup the role's id)
    const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get(role);
    if (roleRow) {
      db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)')
        .run(result.lastInsertRowid, roleRow.id, req.user.username);
    }

    audit(req, 'USER_CREATE', 'users', user.id, null, user);

    // Return the generated password ONCE (so admin can share it with the user out-of-band)
    res.status(201).json({
      user,
      generated_password: req.body.password ? undefined : password,
    });
  } catch (err) { next(err); }
});

// ─── PATCH /users/:id ───
usersRouter.patch('/:id', validate(userUpdateSchema), (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) throw new NotFoundError('User not found');

    // Prevent admins from demoting themselves (last admin safeguard)
    if (existing.id === req.user.id && req.body.role && req.body.role !== 'admin') {
      throw new AppError('You cannot change your own role', 400);
    }
    if (existing.id === req.user.id && req.body.active === false) {
      throw new AppError('You cannot deactivate yourself', 400);
    }

    const allowed = ['full_name', 'email', 'phone', 'role', 'active'];
    const updates = [];
    const params = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        let v = req.body[k];
        if (k === 'active') v = v ? 1 : 0;
        if (k === 'email' && v === '') v = null;
        updates.push(`${k} = ?`);
        params.push(v);
      }
    }

    // Deactivation metadata
    if (req.body.active === false && existing.active === 1) {
      updates.push('deactivated_at = datetime(\'now\')', 'deactivated_by = ?');
      params.push(req.user.username);
    }
    if (req.body.active === true && existing.active === 0) {
      updates.push('deactivated_at = NULL', 'deactivated_by = NULL', 'deactivation_reason = NULL');
    }

    if (updates.length === 0) return res.json({ user: existing });
    params.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare(
      `SELECT id, username, full_name, email, phone, role, active, last_login, must_change_password
       FROM users WHERE id = ?`
    ).get(req.params.id);

    audit(req, 'USER_UPDATE', 'users', req.params.id,
          { role: existing.role, active: existing.active, email: existing.email },
          { role: updated.role, active: updated.active, email: updated.email });

    res.json({ user: updated });
  } catch (err) { next(err); }
});

// ─── POST /users/reset-password-all ───
usersRouter.post('/reset-password-all', validate(z.object({ new_password: z.string().min(8).max(200) })), async (req, res, next) => {
  try {
    const db = getDb();
    const hash = await bcrypt.hash(req.body.new_password, config.bcryptRounds);

    const result = db.prepare(`
      UPDATE users SET password_hash = ?, must_change_password = 1,
        failed_attempts = 0, locked_until = NULL
      WHERE active = 1 AND id != ?
    `).run(hash, req.user.id);

    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id != ?').run(req.user.id);

    audit(req, 'USER_PASSWORD_RESET_ALL', 'users', null, null,
          { count: result.changes, reset_by: req.user.username });

    res.json({ ok: true, count: result.changes });
  } catch (err) { next(err); }
});

// ─── POST /users/:id/reset-password ───
usersRouter.post('/:id/reset-password', validate(passwordResetSchema), async (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) throw new NotFoundError('User not found');

    const newPassword = req.body.new_password || crypto.randomBytes(9).toString('base64').slice(0, 12);
    const hash = await bcrypt.hash(newPassword, config.bcryptRounds);

    db.prepare(`
      UPDATE users SET password_hash = ?, must_change_password = ?,
        failed_attempts = 0, locked_until = NULL
      WHERE id = ?
    `).run(hash, req.body.must_change ? 1 : 0, req.params.id);

    // Revoke all existing refresh tokens for this user
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(req.params.id);

    audit(req, 'USER_PASSWORD_RESET', 'users', req.params.id,
          null, { reset_by: req.user.username });

    res.json({
      ok: true,
      generated_password: req.body.new_password ? undefined : newPassword,
    });
  } catch (err) { next(err); }
});

// ─── POST /users/:id/unlock ───
usersRouter.post('/:id/unlock', (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) throw new NotFoundError('User not found');

    db.prepare(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?'
    ).run(req.params.id);

    audit(req, 'USER_UNLOCK', 'users', req.params.id, null, null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── GET /users/:id/roles ───
usersRouter.get('/:id/roles', (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) throw new NotFoundError('User not found');
    const roles = db.prepare(`
      SELECT r.id, r.name, r.description, r.is_system
      FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ?
    `).all(req.params.id);
    res.json({ roles });
  } catch (err) { next(err); }
});

// ─── PUT /users/:id/roles — replace full role set ───
usersRouter.put('/:id/roles', validate(z.object({ role_ids: z.array(z.number().int().positive()).min(1) })), (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) throw new NotFoundError('User not found');

    // Validate all role IDs exist
    for (const rid of req.body.role_ids) {
      if (!db.prepare('SELECT id FROM roles WHERE id = ?').get(rid)) {
        throw new AppError(`Role id ${rid} not found`, 400);
      }
    }

    // Replace existing assignments
    db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(user.id);
    const insert = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)');
    for (const rid of req.body.role_ids) insert.run(user.id, rid, req.user.username);

    // Keep users.role in sync with primary role (admin > accounts > sales > yard > custom)
    const PRIORITY = ['admin', 'accounts', 'sales', 'yard'];
    const assignedRoles = db.prepare(`
      SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?
    `).all(user.id).map(r => r.name);
    const primary = PRIORITY.find(p => assignedRoles.includes(p)) ?? assignedRoles[0];
    if (primary) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(primary, user.id);

    audit(req, 'USER_ROLES_UPDATE', 'users', user.id, null, { role_ids: req.body.role_ids });
    res.json({ ok: true, roles: assignedRoles });
  } catch (err) { next(err); }
});

// ─── DELETE /users/:id — soft delete (mark inactive) ───
usersRouter.delete('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!existing) throw new NotFoundError('User not found');
    if (existing.id === req.user.id) throw new AppError('Cannot delete yourself', 400);

    // Soft delete — keep the record so audit log attributions still resolve
    db.prepare(`
      UPDATE users SET active = 0,
        deactivated_at = datetime('now'),
        deactivated_by = ?,
        deactivation_reason = ?
      WHERE id = ?
    `).run(req.user.username, req.body?.reason || 'deleted', req.params.id);

    // Revoke tokens
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(req.params.id);

    audit(req, 'USER_DELETE', 'users', req.params.id, existing, null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── POST /users/me/change-password — non-admin self-service ───
// Exception to the admin-only router guard
export const selfServiceRouter = Router();
selfServiceRouter.use(authenticate);

selfServiceRouter.post('/me/change-password', async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      throw new AppError('Both current_password and new_password required', 400);
    }
    if (new_password.length < 8) throw new AppError('New password too short (min 8)', 400);

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) throw new AppError('Current password is incorrect', 401);

    const hash = await bcrypt.hash(new_password, config.bcryptRounds);
    db.prepare(
      'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?'
    ).run(hash, req.user.id);

    // Revoke all other refresh tokens (force re-login on other devices)
    db.prepare(
      'UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND id != ?'
    ).run(req.user.id, req.cookies?.refresh_token || '');

    audit(req, 'USER_PASSWORD_CHANGE_SELF', 'users', req.user.id, null, null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
