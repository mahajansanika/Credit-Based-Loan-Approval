/**
 * Global error handling — every route error funnels here and returns
 * { error, message, statusCode }. Nothing fails silently.
 */

/** 404 for unknown routes. */
export function notFound(req, res) {
  res.status(404).json({
    error: 'NotFound',
    statusCode: 404,
    message: `Route ${req.method} ${req.originalUrl} not found.`,
  });
}

/** Express global error handler (must have 4 args). */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Multer file-size limit.
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: 'FileTooLarge',
      statusCode: 413,
      message: 'File exceeds 10MB limit.',
    });
  }
  // Multer unexpected field / generic multer errors.
  if (err?.name === 'MulterError') {
    return res.status(400).json({
      error: 'UploadError',
      statusCode: 400,
      message: err.message,
    });
  }

  const statusCode = err?.statusCode ?? 500;
  const payload = {
    error: err?.name && err.name !== 'Error' ? err.name : 'InternalServerError',
    statusCode,
    message: err?.message ?? 'Something went wrong.',
  };
  if (statusCode >= 500) {
    console.error('[error]', err);
  }
  res.status(statusCode).json(payload);
}
