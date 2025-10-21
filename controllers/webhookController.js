// controllers/webhookController.js
const PaymentSplitService = require('../services/paymentSplitService');
const VirtualAccountService = require('../services/virtualAccountService');
const TerminalPaymentService = require('../services/terminalPaymentService');

const paymentSplitService = new PaymentSplitService();
const virtualAccountService = new VirtualAccountService();
const terminalPaymentService = new TerminalPaymentService();

class WebhookController {
  async handlePaystackWebhook(req, res) {
    try {
      const event = req.body;

      // Verify webhook signature
      const crypto = require('crypto');
      const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(req.body))
        .digest('hex');
      
      if (hash !== req.headers['x-paystack-signature']) {
        console.error('Invalid webhook signature');
        return res.status(401).json({
          success: false,
          error: 'Invalid webhook signature'
        });
      }

      console.log(`Processing webhook event: ${event.event}`);

      // Route to appropriate service based on event type
      switch (event.event) {
        case 'charge.success':
        case 'transfer.success':
        case 'transfer.failed':
          await paymentSplitService.handleWebhookEvent(event);
          break;
        
        case 'dedicatedaccount.transaction':
          await virtualAccountService.handleVirtualAccountWebhook(event);
          break;
        
        case 'terminal.payment.success':
        case 'terminal.payment.failed':
          await terminalPaymentService.handleTerminalWebhook(event);
          break;
        
        case 'invoice.update':
          await this.handleInvoiceUpdate(event.data);
          break;
        
        case 'subscription.disabled':
          await this.handleSubscriptionDisabled(event.data);
          break;
        
        default:
          console.log(`Unhandled webhook event: ${event.event}`);
      }

      res.json({ success: true, message: 'Webhook processed successfully' });

    } catch (error) {
      console.error('Webhook processing error:', error);
      // Still return 200 to prevent Paystack from retrying
      res.json({ success: false, error: error.message });
    }
  }

  async handleInvoiceUpdate(invoiceData) {
    // Handle invoice updates
    console.log('Invoice updated:', invoiceData);
  }

  async handleSubscriptionDisabled(subscriptionData) {
    // Handle subscription disabled
    console.log('Subscription disabled:', subscriptionData);
  }
}

module.exports = new WebhookController();