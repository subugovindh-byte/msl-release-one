import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { getDb } from '../db/connection.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema } from '@modernex/shared';
import { AuthError } from '../middleware/error.js';
import { audit } from '../services/audit.js';

export const authRouter = Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiry }
  );
}

function setAuthCookies(res, accessToken, refreshToken) {
  // httpOnly prevents XSS from reading tokens
  // secure=true in production requires HTTPS
  const common = {
    httpOnly: true,
    secure: config.isProd(),
    sameSite: 'lax',
    path: '/',
  };
  res.cookie('access_token', accessToken, { ...common, maxAge: 8 * 60 * 60 * 1000 });
  res.cookie('refresh_token', refreshToken, { ...common, maxAge: 30 * 24 * 60 * 60 * 1000 });
}

function clearAuthCookies(res) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
}

// ─── POST /auth/login ───
authRouter.post('/login', authLimiter, validate(loginSchema), async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const db = getDb();

    const user = db.prepare(
      'SELECT * FROM users WHERE username = ? AND active = 1'
    ).get(username);

    if (!user) {
      // Constant-time fail to prevent username enumeration
      await bcrypt.hash('dummy', config.bcryptRounds);
      throw new AuthError('Invalid username or password');
    }

    // Check lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(user.locked_until) - Date.now()) / 60000);
      throw new AuthError(`Account locked. Try again in ${mins} minutes.`);
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const newAttempts = user.failed_attempts + 1;
      if (newAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
        db.prepare(
          'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?'
        ).run(newAttempts, lockUntil, user.id);
        logger.warn({ username }, 'Account locked due to failed attempts');
      } else {
        db.prepare('UPDATE users SET failed_attempts = ? WHERE id = ?')
          .run(newAttempts, user.id);
      }
      throw new AuthError('Invalid username or password');
    }

    // Reset failed attempts, update last_login
    db.prepare(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = datetime(\'now\') WHERE id = ?'
    ).run(user.id);

    // Issue tokens
    const accessToken = signAccessToken(user);
    const refreshTokenId = crypto.randomUUID();
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(
      'INSERT INTO refresh_tokens (id, user_id, expires_at, ip_address) VALUES (?, ?, ?, ?)'
    ).run(refreshTokenId, user.id, refreshExpiresAt, req.ip);

    setAuthCookies(res, accessToken, refreshTokenId);

    audit(req, 'LOGIN', 'users', user.id, null, { username });
    logger.info({ username }, 'Login successful');

    res.json({
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
      },
      accessToken,  // Also returned for non-browser clients
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/refresh ───
authRouter.post('/refresh', authLimiter, (req, res, next) => {
  try {
    const refreshTokenId = req.cookies?.refresh_token || req.body?.refreshToken;
    if (!refreshTokenId) throw new AuthError('No refresh token');

    const db = getDb();
    const tokenRow = db.prepare(
      `SELECT rt.*, u.username, u.role, u.full_name, u.active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.id = ? AND rt.revoked = 0 AND rt.expires_at > datetime('now')`
    ).get(refreshTokenId);

    if (!tokenRow || !tokenRow.active) throw new AuthError('Invalid refresh token');

    // Rotate: revoke old, issue new
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(refreshTokenId);

    const newRefreshId = crypto.randomUUID();
    const newRefreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      'INSERT INTO refresh_tokens (id, user_id, expires_at, ip_address) VALUES (?, ?, ?, ?)'
    ).run(newRefreshId, tokenRow.user_id, newRefreshExpiresAt, req.ip);

    const accessToken = signAccessToken({
      id: tokenRow.user_id,
      username: tokenRow.username,
      role: tokenRow.role,
      full_name: tokenRow.full_name,
    });

    setAuthCookies(res, accessToken, newRefreshId);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/logout ───
authRouter.post('/logout', authenticate, (req, res) => {
  const refreshTokenId = req.cookies?.refresh_token;
  if (refreshTokenId) {
    const db = getDb();
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(refreshTokenId);
  }
  clearAuthCookies(res);
  audit(req, 'LOGOUT', 'users', req.user.id, null, null);
  res.json({ ok: true });
});

// ─── GET /auth/me ───
authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});
