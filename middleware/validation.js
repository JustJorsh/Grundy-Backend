// middleware/validation.js
const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

const validateOrder = [
  body('customer.userId').isMongoId(),
  body('customer.email').isEmail(),
  body('customer.phone').isMobilePhone(),
  body('items').isArray({ min: 1 }),
  body('items.*.productId').isMongoId(),
  body('items.*.quantity').isInt({ min: 1 }),
  body('paymentMethod').isIn(['online', 'bank_transfer_delivery', 'terminal_delivery']),
  handleValidationErrors
];

const validatePayment = [
  body('reference').notEmpty(),
  handleValidationErrors
];

module.exports = {
  validateOrder,
  validatePayment,
  handleValidationErrors
};