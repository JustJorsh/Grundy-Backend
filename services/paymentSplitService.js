// services/paymentSplitService.js
const Paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
const SplitConfig = require('../models/SplitConfig');
const Order = require('../models/Order');
const Merchant = require('../models/Merchant');
const Transaction = require('../models/Transaction');

class PaymentSplitService {
  constructor() {
    this.paystack = Paystack;
  }

  async initializePaymentWithSplit(order, merchant) {
    try {
      if (!merchant.paystackSubAccountCode) {
        throw new Error('Merchant does not have a Paystack sub-account');
      }

      const splitConfig = {
        type: 'percentage',
        currency: 'NGN',
        subaccounts: [
          {
            subaccount: merchant.paystackSubAccountCode,
            share: 90
          }
        ],
        bearer_type: 'subaccount',
        main_account_share: 10
      };

      const splitCode = await this.getOrCreateSplitCode(splitConfig, merchant._id);

      const response = await this.paystack.transaction.initialize({
        email: order.customer.email,
        amount: order.payment.amount * 100,
        reference: order.orderId,
        callback_url: `${process.env.FRONTEND_URL}/payment/verify`,
        metadata: {
          order_id: order.orderId,
          customer_id: order.customer.userId,
          merchant_id: merchant._id.toString(),
          split_config: 'active',
          split_code: splitCode
        }
      });

      if (!response.status) {
        throw new Error(`Paystack initialization failed: ${response.message}`);
      }x

      // Update order with payment details
      await Order.findByIdAndUpdate(order._id, {
        'payment.paystackReference': response.data.reference,
        'payment.splitCode': splitCode,
        'payment.splitConfig': {
          type: 'percentage',
          merchantShare: 90,
          platformShare: 10,
          bearer: 'subaccount'
        }
      });

      // Create transaction record
      await Transaction.create({
        orderId: order._id,
        paystackReference: response.data.reference,
        amount: order.payment.amount,
        platformFee: order.payment.platformFee,
        merchantAmount: order.payment.merchantAmount,
        merchantId: merchant._id,
        splitCode: splitCode,
        status: 'pending'
      });

      return {
        authorization_url: response.data.authorization_url,
        reference: response.data.reference,
        access_code: response.data.access_code
      };

    } catch (error) {
      console.error('Split payment initialization error:', error);
      throw new Error(`Split payment initialization failed: ${error.message}`);
    }
  }

  async getOrCreateSplitCode(splitConfig, merchantId) {
    try {
      const existingSplit = await SplitConfig.findOne({
        merchantId: merchantId,
        'config.subaccounts.subaccount': splitConfig.subaccounts[0].subaccount,
        isActive: true
      });

      if (existingSplit) {
        return existingSplit.splitCode;
      }

      const response = await this.paystack.transaction.split({
        name: `Grundy-Merchant-${merchantId}-${Date.now()}`,
        type: splitConfig.type,
        currency: splitConfig.currency,
        subaccounts: splitConfig.subaccounts,
        bearer_type: splitConfig.bearer_type
      });

      if (!response.status) {
        throw new Error(`Paystack split creation failed: ${response.message}`);
      }

      const newSplit = new SplitConfig({
        splitCode: response.data.split_code,
        name: response.data.name,
        config: splitConfig,
        merchantId: merchantId,
        isActive: true
      });

      await newSplit.save();
      return response.data.split_code;

    } catch (error) {
      console.error('Error creating split code:', error);
      throw new Error(`Split code creation failed: ${error.message}`);
    }
  }

  async verifyPayment(reference) {
    try {
      const response = await this.paystack.transaction.verify(reference);
      
      if (response.status && response.data.status === 'success') {
        return await this.processSuccessfulPayment(response.data);
      } else {
        throw new Error(`Payment verification failed: ${response.message}`);
      }
    } catch (error) {
      console.error('Payment verification error:', error);
      throw error;
    }
  }

  async processSuccessfulPayment(paymentData) {
    try {
      const order = await Order.findOne({ orderId: paymentData.reference });
      
      if (!order) {
        throw new Error(`Order not found for reference: ${paymentData.reference}`);
      }

      // Calculate amounts after fees
      const totalAmount = paymentData.amount / 100;
      const fees = paymentData.fees / 100;
      const settledAmount = paymentData.amount_settled / 100;

      // Update order
      order.payment.status = 'paid';
      order.payment.paidAt = new Date();
      order.payment.paystackFee = fees;
      order.payment.actualAmount = settledAmount;
      order.payment.transactionId = paymentData.id;
      order.payment.channel = paymentData.channel;
      order.status = 'confirmed';

      await order.save();

      // Update transaction
      await Transaction.findOneAndUpdate(
        { paystackReference: paymentData.reference },
        {
          status: 'success',
          amount: totalAmount,
          fees: fees,
          netAmount: settledAmount,
          channel: paymentData.channel,
          paidAt: new Date()
        }
      );

      // Notify parties
      await this.notifyPaymentSuccess(order);

      return order;

    } catch (error) {
      console.error('Error processing successful payment:', error);
      throw error;
    }
  }

  async notifyPaymentSuccess(order) {
    // Implementation for sending notifications
    console.log(`Payment successful for order: ${order.orderId}`);
    
    // Here you would integrate with your notification service
    // to send emails, SMS, or push notifications to customer and merchant
  }

  async handleWebhookEvent(event) {
    try {
      switch (event.event) {
        case 'charge.success':
          await this.processSuccessfulPayment(event.data);
          break;
        
        case 'transfer.success':
          await this.confirmMerchantPayout(event.data);
          break;
        
        case 'transfer.failed':
          await this.handleFailedPayout(event.data);
          break;

        default:
          console.log(`Unhandled webhook event: ${event.event}`);
      }
    } catch (error) {
      console.error('Error processing webhook:', error);
      throw error;
    }
  }

  async confirmMerchantPayout(transferData) {
    try {
      const transaction = await Transaction.findOne({
        paystackReference: transferData.reference
      });

      if (transaction) {
        transaction.merchantPayout.status = 'completed';
        transaction.merchantPayout.reference = transferData.transfer_code;
        transaction.merchantPayout.paidAt = new Date();
        await transaction.save();

        // Update order if needed
        await Order.findOneAndUpdate(
          { _id: transaction.orderId },
          {
            'payment.merchantPayoutStatus': 'completed',
            'payment.merchantPayoutReference': transferData.transfer_code,
            'payment.merchantPayoutDate': new Date()
          }
        );

        console.log(`Merchant payout confirmed for transaction: ${transaction.paystackReference}`);
      }
    } catch (error) {
      console.error('Error confirming merchant payout:', error);
    }
  }

  async handleFailedPayout(transferData) {
    try {
      const transaction = await Transaction.findOne({
        paystackReference: transferData.reference
      });

      if (transaction) {
        transaction.merchantPayout.status = 'failed';
        transaction.merchantPayout.failureReason = transferData.reason;
        await transaction.save();

        // Update order
        await Order.findOneAndUpdate(
          { _id: transaction.orderId },
          {
            'payment.merchantPayoutStatus': 'failed',
            'payment.payoutFailureReason': transferData.reason
          }
        );

        console.error(`Merchant payout failed for transaction: ${transaction.paystackReference}`);
        
        // Notify admin
        await this.notifyAdmin(
          'Payout Failed',
          `Payout failed for transaction ${transaction.paystackReference}: ${transferData.reason}`
        );
      }
    } catch (error) {
      console.error('Error handling failed payout:', error);
    }
  }

  async notifyAdmin(subject, message) {
    // Implementation for admin notifications
    console.log(`Admin Alert - ${subject}: ${message}`);
  }
}

module.exports = PaymentSplitService;