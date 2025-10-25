// routes/riders.js
const express = require('express');
const router = express.Router();
const riderController = require('../controllers/riderController');
const { authenticate, authorize } = require('../middleware/auth');

// Rider routes
router.post('/location', authenticate, authorize(['rider']), riderController.updateLocation);
router.get('/orders/available', authenticate, authorize(['rider']), riderController.getAvailableOrders);
router.post('/orders/accept', authenticate, authorize(['rider']), riderController.acceptOrder);
router.patch('/orders/:orderId/status', authenticate, authorize(['rider']), riderController.updateOrderStatus);
router.get('/stats', authenticate, authorize(['rider']), riderController.getRiderStats);
router.post('/onboard', riderController.onboardRider);

module.exports = router;