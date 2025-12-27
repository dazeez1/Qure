/**
 * Global error handler middleware
 * Ensures all errors return clean JSON responses suitable for toast notifications
 */
export const errorHandler = (err, req, res, next) => {
  // Log error for debugging (but never log passwords)
  console.error('Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = err.message || 'An unexpected error occurred';

  // Return clean JSON response (no stack traces in production)
  res.status(statusCode).json({
    success: false,
    message: message,
  });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
  });
};

