import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV !== 'production';

// Tight limiter for login/auth endpoints — prevents brute force
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,         // 1 minute
  max: isDev ? 200 : 10,       // relaxed in dev/test; 10 in production
  message: { error: 'Too many authentication attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API limiter
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDev ? 1000 : 100,      // relaxed in dev/test; 100 in production
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
