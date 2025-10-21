// routes/webhooks.js
const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Paystack webhooks
router.post('/paystack', webhookController.handlePaystackWebhook);

module.exports = router;