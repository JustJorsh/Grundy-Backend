// routes/merchants.js
const express = require('express');
const router = express.Router();
const merchantController = require('../controllers/merchantController');
const { authenticate, authorize } = require('../middleware/auth');

// Public routes
router.post('/register', merchantController.registerMerchant);

// Merchant routes
router.get('/orders', authenticate, authorize(['merchant']), merchantController.getMerchantOrders);
router.get('/analytics', authenticate, authorize(['merchant']), merchantController.getMerchantAnalytics);
router.post('/products', authenticate, authorize(['merchant']), merchantController.addProduct);
router.patch('/products/:productId', authenticate, authorize(['merchant']), merchantController.updateProduct);

// Admin routes
router.get('/', authenticate, authorize(['admin']), merchantController.getAllMerchants);

module.exports = router;