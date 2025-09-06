const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error
  let error = {
    success: false,
    message: err.message || 'Internal Server Error',
    statusCode: err.statusCode || 500
  };

  // MySQL duplicate entry error
  if (err.code === 'ER_DUP_ENTRY') {
    const field = err.sqlMessage.match(/for key '(.+?)'/);
    if (field && field[1].includes('email')) {
      error.message = 'Email already exists';
      error.statusCode = 400;
    } else if (field && field[1].includes('phone')) {
      error.message = 'Phone number already exists';
      error.statusCode = 400;
    } else {
      error.message = 'Duplicate entry';
      error.statusCode = 400;
    }
  }

  // MySQL foreign key constraint error
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    error.message = 'Referenced record not found';
    error.statusCode = 400;
  }

  // Validation error
  if (err.name === 'ValidationError') {
    error.message = Object.values(err.errors).map(val => val.message).join(', ');
    error.statusCode = 400;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token';
    error.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired';
    error.statusCode = 401;
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    error.message = 'File too large';
    error.statusCode = 400;
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    error.message = 'Too many files';
    error.statusCode = 400;
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error.message = 'Unexpected file field';
    error.statusCode = 400;
  }

  // Include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    error.stack = err.stack;
  }

  res.status(error.statusCode).json(error);
};

module.exports = errorHandler;
