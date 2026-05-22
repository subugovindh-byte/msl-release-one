import { ValidationError } from './error.js';

/**
 * Validates req.body against a Zod schema.
 * Usage: router.post('/x', validate(mySchema), handler)
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      req[source] = parsed;  // replace with parsed/coerced values
      next();
    } catch (err) {
      next(err);  // ZodError handled by errorHandler
    }
  };
}

/**
 * Validate query params
 */
export const validateQuery = (schema) => validate(schema, 'query');

/**
 * Validate URL params
 */
export const validateParams = (schema) => validate(schema, 'params');
