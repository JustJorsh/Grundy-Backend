// routes/orders.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/auth');

// Public routes
router.post('/', orderController.createOrder);
router.get('/:orderId', orderController.getOrder);

// Customer routes
router.get('/user/orders', authenticate, orderController.getUserOrders);
router.patch('/:orderId/cancel', authenticate, orderController.cancelOrder);

// Merchant routes
router.get('/merchant/orders', authenticate, authorize(['merchant']), orderController.getMerchantOrders);

// Admin routes
router.patch('/:orderId/status', authenticate, authorize(['admin']), orderController.updateOrderStatus);

module.exports = router;