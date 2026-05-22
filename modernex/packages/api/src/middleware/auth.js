import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AuthError, ForbiddenError } from './error.js';

/**
 * Verify JWT from Authorization header or httpOnly cookie.
 * Populates req.user = { id, username, role }
 */
export function authenticate(req, res, next) {
  let token = null;

  // Prefer cookie (more secure), fall back to Authorization header
  if (req.cookies?.access_token) {
    token = req.cookies.access_token;
  } else if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7);
  }

  if (!token) {
    return next(new AuthError('No authentication token'));
  }

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      fullName: payload.fullName,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AuthError('Token expired'));
    }
    next(new AuthError('Invalid token'));
  }
}

/**
 * Require authenticated user to have one of the given roles.
 * Usage: router.get('/admin', authenticate, requireRole('admin'), handler)
 */
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return next(new AuthError());
    if (!allowed.includes(req.user.role)) {
      return next(new ForbiddenError(
        `Role '${req.user.role}' cannot access this resource`
      ));
    }
    next();
  };
}

/**
 * Optional auth — populates req.user if token present, but doesn't fail if missing.
 */
export function optionalAuth(req, res, next) {
  const token = req.cookies?.access_token || req.headers.authorization?.slice(7);
  if (!token) return next();

  try {
    const payload = jwt.verify(token, config.jwt.secret);
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  } catch { /* ignore */ }
  next();
}
