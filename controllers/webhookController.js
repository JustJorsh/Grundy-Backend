// controllers/webhookController.js
const PaymentSplitService = require('../services/paymentSplitService');
const VirtualAccountService = require('../services/virtualAccountService');
const TerminalPaymentService = require('../services/terminalPaymentService');
const WebhookEventLog = require('../models/Webhook');

const paymentSplitService = new PaymentSplitService();
const virtualAccountService = new VirtualAccountService();
const terminalPaymentService = new TerminalPaymentService();

class WebhookController {
  async handlePaystackWebhook(req, res) {
    try {
  

      // Verify webhook signature
      const crypto = require('crypto');
      const hash = crypto
        .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
        .update(JSON.stringify(req.body))
        .digest('hex');
      if (hash !== req.headers['x-paystack-signature']) {
        console.error('Invalid webhook signature');
        return res
          .status(401)
          .json({ success: false, error: 'Invalid webhook signature' });
      }
      const event = req.body;
      const eventName = event.event;
      const eventId = event.id || event.data?.id; // Paystack events often include an `id` field

      // Optional: Idempotency check — ensure the same event is not processed multiple times
      if (eventId) {
        const already = await WebhookEventLog.findOne({ eventId });
        if (already) {
          console.warn('Duplicate webhook event, ignoring:', eventId);
          return res
            .status(200)
            .json({ success: true, message: 'Already processed' });
        }
      }

      console.log(`Received Paystack webhook: ${eventName}`, event);

      // Route to appropriate service
      switch (eventName) {
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

        default:
          console.log(`Unhandled Paystack event: ${eventName}`);
      }

      // Record that this event is processed (so duplicates are ignored next time)
      if (eventId) {
        await WebhookEventLog.create({ eventId, eventName, payload: event });
      }

      return res
        .status(200)
        .json({ success: true, message: 'Webhook processed' });
    } catch (err) {
      console.error('Error processing Paystack webhook:', err);
      // Return 200 (or at least non-5xx) so Paystack does not constantly retry
      return res.status(200).json({ success: false, error: err.message });
    }
  }
}

module.exports = new WebhookController();
