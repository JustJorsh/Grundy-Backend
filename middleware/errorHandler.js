// middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(error => error.message);
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      details: errors
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      error: `${field} already exists`
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }

  // Paystack API errors
  if (err.message.includes('Paystack')) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }

  // Default error
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
};

module.exports = errorHandler;