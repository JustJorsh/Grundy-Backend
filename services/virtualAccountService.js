// services/virtualAccountService.js
const Paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
const Order = require('../models/Order');
const PaymentSplitService = require('./paymentSplitService');

class VirtualAccountService {
  constructor() {
    this.paystack = Paystack;
    this.paymentSplitService = new PaymentSplitService();
  }

  async createVirtualAccountForOrder(order, merchant) {
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

      const response = await this.paystack.dedicated_account.create({
        customer: {
          email: order.customer.email,
          phone: order.customer.phone,
          first_name: order.customer.name?.split(' ')[0] || 'Customer',
          last_name: order.customer.name?.split(' ')[1] || ''
        },
        preferred_bank: "wema-bank", // Can be dynamic
        subaccount: merchant.paystackSubAccountCode,
        split_code: splitCode
      });

      if (!response.status) {
        throw new Error(`Virtual account creation failed: ${response.message}`);
      }

      // Update order with virtual account details
      await Order.findByIdAndUpdate(order._id, {
        'payment.virtualAccount': {
          accountNumber: response.data.account_number,
          bankName: response.data.bank.name,
          accountName: response.data.account_name,
          dedicatedAccountId: response.data.id
        },
        'payment.splitCode': splitCode,
        'payment.status': 'awaiting_payment'
      });

      return {
        accountNumber: response.data.account_number,
        bankName: response.data.bank.name,
        accountName: response.data.account_name,
        instructions: `Transfer exactly ₦${order.payment.amount} to this account. Payment will be automatically verified.`
      };

    } catch (error) {
      console.error('Virtual account creation error:', error);
      throw new Error(`Virtual account setup failed: ${error.message}`);
    }
  }

  async handleVirtualAccountWebhook(event) {
    if (event.event === 'dedicatedaccount.transaction') {
      await this.processVirtualAccountPayment(event.data);
    }
  }

  async processVirtualAccountPayment(transactionData) {
    try {
      // Find order by virtual account number
      const order = await Order.findOne({
        'payment.virtualAccount.accountNumber': transactionData.account_number
      });

      if (order && parseFloat(transactionData.amount) === order.payment.amount * 100) {
        // Process the payment
        await this.paymentSplitService.processSuccessfulPayment({
          ...transactionData,
          reference: order.orderId,
          amount: transactionData.amount,
          fees: 0, // Virtual account transfers might have different fee structure
          amount_settled: transactionData.amount,
          channel: 'bank_transfer',
          id: transactionData.id
        });

        console.log(`Virtual account payment processed for order: ${order.orderId}`);
      }
    } catch (error) {
      console.error('Error processing virtual account payment:', error);
    }
  }
}

module.exports = VirtualAccountService;