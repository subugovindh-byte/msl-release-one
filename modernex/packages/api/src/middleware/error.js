import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

export class AuthError extends AppError {
  constructor(msg = 'Unauthorized') { super(msg, 401, 'UNAUTHORIZED'); }
}

export class ForbiddenError extends AppError {
  constructor(msg = 'Forbidden') { super(msg, 403, 'FORBIDDEN'); }
}

export class NotFoundError extends AppError {
  constructor(msg = 'Not Found') { super(msg, 404, 'NOT_FOUND'); }
}

export class ValidationError extends AppError {
  constructor(msg, details) {
    super(msg, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class DatabaseError extends AppError {
  constructor(msg = 'Database operation failed', originalError) {
    super(msg, 500, 'DATABASE_ERROR', false);
    this.originalError = originalError;
  }
}

export class ExternalServiceError extends AppError {
  constructor(service, msg = 'External service unavailable') {
    super(msg, 503, 'SERVICE_UNAVAILABLE');
    this.service = service;
  }
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Application errors (expected)
  if (err instanceof AppError) {
    // Only log non-operational errors (unexpected)
    if (!err.isOperational) {
      logger.error({
        err: err.message,
        code: err.code,
        stack: err.stack,
        path: req.path,
      }, 'Critical error');
    }

    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.details && { details: err.details }),
    });
  }

  // Unknown/unexpected errors - always log
  logger.error({
    err: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  }, 'Unhandled error');

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && { message: err.message }),
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Route not found', path: req.path });
}

// Async handler wrapper - eliminates try-catch boilerplate
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
