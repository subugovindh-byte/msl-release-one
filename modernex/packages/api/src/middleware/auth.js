import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getDb } from '../db/connection.js';
import { AuthError, ForbiddenError } from './error.js';

export function authenticate(req, res, next) {
  let token = null;

  if (req.cookies?.access_token) {
    token = req.cookies.access_token;
  } else if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7);
  }

  if (!token) return next(new AuthError('No authentication token'));

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      roles: payload.roles ?? [payload.role],  // backward compat with old tokens
      fullName: payload.fullName,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return next(new AuthError('Token expired'));
    next(new AuthError('Invalid token'));
  }
}

// Require user to have at least one of the specified legacy roles.
// Also satisfied if the user's roles[] array contains any of the allowed values.
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return next(new AuthError());
    const userRoles = req.user.roles ?? [req.user.role];
    if (!allowed.some(r => userRoles.includes(r))) {
      return next(new ForbiddenError('Insufficient role for this resource'));
    }
    next();
  };
}

// Require a specific permission (resource + action).
// Admin role always passes. Other roles are checked against role_permissions in DB.
export function requirePermission(resource, action) {
  return (req, res, next) => {
    if (!req.user) return next(new AuthError());
    const userRoles = req.user.roles ?? [req.user.role];
    if (userRoles.includes('admin')) return next();

    const db = getDb();
    const granted = db.prepare(`
      SELECT 1 FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ? AND p.resource = ? AND p.action = ?
      LIMIT 1
    `).get(req.user.id, resource, action);

    if (!granted) return next(new ForbiddenError('Insufficient permissions'));
    next();
  };
}

export function optionalAuth(req, res, next) {
  const token = req.cookies?.access_token || req.headers.authorization?.slice(7);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      roles: payload.roles ?? [payload.role],
    };
  } catch { /* ignore */ }
  next();
}
