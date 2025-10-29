// routes/merchants.js
const express = require('express');
const router = express.Router();
const merchantController = require('../controllers/merchantController');
const { authenticate, authorize } = require('../middleware/auth');

// Public routes
router.post('/register', merchantController.registerMerchant);
router.post('/login', merchantController.loginMerchant); // <= added

// Public product retrieval
router.get('/products', merchantController.getAllProducts); // <= added
router.get('/products/:productId', merchantController.getProduct);

// Public route to view a merchant's products
router.get('/:merchantId/products', merchantController.getMerchantProducts);

// Merchant routes
router.get('/orders', authenticate, authorize(['merchant']), merchantController.getMerchantOrders);
router.get('/analytics', authenticate, authorize(['merchant']), merchantController.getMerchantAnalytics);
router.post('/products', authenticate, authorize(['merchant']), merchantController.addProduct);


// Admin routes
router.get('/', authenticate, authorize(['admin']), merchantController.getAllMerchants);

module.exports = router;