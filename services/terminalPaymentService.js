// services/terminalPaymentService.js
const Paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
const Order = require('../models/Order');
const PaymentSplitService = require('./paymentSplitService');

class TerminalPaymentService {
  constructor() {
    this.paystack = Paystack;
    this.paymentSplitService = new PaymentSplitService();
  }

  async createTerminalSession(order, merchant) {
    try {
      const splitConfig = {
        type: 'percentage',
        currency: 'NGN',
        subaccounts: [
          {
            subaccount: merchant.paystackSubAccountCode,
            share: 90
          }
        ],
        bearer_type: 'account',
        main_account_share: 10
      };

      const splitCode = await this.paymentSplitService.getOrCreateSplitCode(splitConfig, merchant._id);

      // Note: Paystack Terminal API might have different endpoints
      // This is a conceptual implementation
      const response = await this.paystack.terminal.createSession({
        amount: order.payment.amount * 100,
        order_id: order.orderId,
        customer_email: order.customer.email,
        split_code: splitCode,
        metadata: {
          order_id: order.orderId,
          merchant_id: merchant._id.toString(),
          payment_method: 'terminal_delivery'
        }
      });

      if (!response.status) {
        throw new Error(`Terminal session creation failed: ${response.message}`);
      }

      // Update order with terminal session details
      await Order.findByIdAndUpdate(order._id, {
        'payment.terminalSessionId': response.data.session_id,
        'payment.splitCode': splitCode,
        'payment.status': 'awaiting_payment'
      });

      return {
        sessionId: response.data.session_id,
        amount: order.payment.amount,
        instructions: 'Please have your card ready for the rider.'
      };

    } catch (error) {
      console.error('Terminal session creation error:', error);
      throw new Error(`Terminal payment setup failed: ${error.message}`);
    }
  }

  async processTerminalPayment(sessionId, paymentData) {
    try {
      // Verify terminal payment with Paystack
      const verification = await this.paystack.terminal.verifyPayment(sessionId);

      if (verification.data.status === 'success') {
        const order = await Order.findOne({
          'payment.terminalSessionId': sessionId
        });

        if (order) {
          await this.paymentSplitService.processSuccessfulPayment({
            ...verification.data,
            reference: order.orderId
          });

          return {
            success: true,
            order,
            message: 'Terminal payment completed successfully'
          };
        } else {
          throw new Error('Order not found for terminal session');
        }
      } else {
        throw new Error('Terminal payment verification failed');
      }

    } catch (error) {
      console.error('Terminal payment processing error:', error);
      throw new Error(`Terminal payment processing failed: ${error.message}`);
    }
  }

  async handleTerminalWebhook(event) {
    if (event.event === 'terminal.payment.success') {
      await this.processTerminalPayment(event.data.session_id, event.data);
    }
  }
}

module.exports = TerminalPaymentService;