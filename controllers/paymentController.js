// controllers/paymentController.js
const Order = require('../models/Order');
const PaymentSplitService = require('../services/paymentSplitService');
const BankTransferService = require('../services/bankTransferService');
const TerminalPaymentService = require('../services/terminalPaymentService');

const paymentSplitService = new PaymentSplitService();
const bankTransferService = new BankTransferService();
const terminalPaymentService = new TerminalPaymentService();

class PaymentController {
  async verifyPayment(req, res) {
    try {
      const { reference } = req.body;

      const order = await paymentSplitService.verifyPayment(reference);

      res.json({
        success: true,
        order,
        message: 'Payment verified successfully'
      });

    } catch (error) {
      console.error('Payment verification error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  async getPaymentStatus(req, res) {
    try {
      const { orderId } = req.params;

      const order = await Order.findOne({ orderId });
      
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      res.json({
        success: true,
        payment: order.payment
      });

    } catch (error) {
      console.error('Get payment status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async processTerminalPayment(req, res) {
    try {
      const { sessionId } = req.body;
      const { riderId } = req.user; // Assuming rider is authenticated

      const result = await terminalPaymentService.processVirtualTerminalPayment(sessionId, {
        riderId: riderId,
        timestamp: new Date()
      });

      res.json(result);

    } catch (error) {
      console.error('Terminal payment processing error:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  async getVirtualAccountDetails(req, res) {
    try {
      const { orderId } = req.params;

      const order = await Order.findOne({ orderId });
      
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      if (order.payment.method !== 'bank_transfer_delivery') {
        return res.status(400).json({
          success: false,
          error: 'This order does not use bank transfer delivery'
        });
      }

      res.json({
        success: true,
        virtualAccount: order.payment.virtualAccount,
        amount: order.payment.amount,
        instructions: `Transfer exactly ₦${order.payment.amount} to the account above.`
      });

    } catch (error) {
      console.error('Get virtual account details error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async handlePaymentWebhook(req, res) {
    try {
      const event = req.body;

      // Verify webhook signature
      const crypto = require('crypto');
      const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(req.body))
        .digest('hex');
      
      if (hash !== req.headers['x-paystack-signature']) {
        return res.status(401).json({
          success: false,
          error: 'Invalid webhook signature'
        });
      }

      // Process webhook based on event type
      switch (event.event) {
        case 'charge.success':
        case 'transfer.success':
        case 'transfer.failed':
          await paymentSplitService.handleWebhookEvent(event);
          break;
        
        case 'dedicatedaccount.transaction':
          await bankTransferService.handleVirtualAccountWebhook(event);
          break;
        
        case 'terminal.payment.success':
          await terminalPaymentService.handleTerminalWebhook(event);
          break;
        
        default:
          console.log(`Unhandled webhook event: ${event.event}`);
      }

      res.json({ success: true, message: 'Webhook processed' });

    } catch (error) {
      console.error('Webhook processing error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new PaymentController();