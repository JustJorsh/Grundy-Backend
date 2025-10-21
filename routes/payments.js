// routes/payments.js
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate, authorize } = require('../middleware/auth');

// Public routes
router.post('/verify', paymentController.verifyPayment);
router.post('/webhook/paystack', paymentController.handlePaymentWebhook);

// Customer routes
router.get('/order/:orderId/status', authenticate, paymentController.getPaymentStatus);
router.get('/order/:orderId/virtual-account', authenticate, paymentController.getVirtualAccountDetails);

// Rider routes
router.post('/terminal/process', authenticate, authorize(['rider']), paymentController.processTerminalPayment);

module.exports = router;