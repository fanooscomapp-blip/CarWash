export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (msg, details) => new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'You do not have permission to perform this action') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (msg, details) => new AppError(409, 'CONFLICT', msg, details);
export const validationFailed = (msg, details) => new AppError(422, 'VALIDATION_FAILED', msg, details);

// Wrap async handlers so thrown errors go to the error middleware
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.name === 'ZodError') {
    return res.status(422).json({
      error: { code: 'VALIDATION_FAILED', message: 'Invalid input', details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    });
  }
  // Postgres errors (Drizzle wraps them in DrizzleQueryError with `cause`)
  const pgErr = err?.cause?.code ? err.cause : err;
  if (pgErr?.code === '23505') {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record with the same unique value already exists', details: { constraint: pgErr.constraint } } });
  }
  if (pgErr?.code === '23503') {
    return res.status(409).json({ error: { code: 'FK_VIOLATION', message: 'This record is referenced by other records and cannot be changed this way', details: { constraint: pgErr.constraint } } });
  }
  if (pgErr?.code === '22P02') {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid identifier or value format' } });
  }
  if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Uploaded file is too large' } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Unexpected server error' } });
}
