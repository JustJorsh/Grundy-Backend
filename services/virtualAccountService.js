// services/virtualAccountService.js
const Paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
const axios = require('axios');
const Order = require('../models/Order');
const User = require('../models/User');
const Merchant = require('../models/Merchant');

const PaymentSplitService = require('./paymentSplitService');

class VirtualAccountService {
  constructor() {
    this.paystack = Paystack;
    this.paystackKey = process.env.PAYSTACK_SECRET_KEY;
    this.paymentSplitService = new PaymentSplitService();
  }

  async createVirtualAccountForOrder(order, merchant) {
    try {
      if (!merchant.paystackSubAccountCode) {
        throw new Error('Merchant does not have a Paystack sub-account');
      }

            let customer = await User.findById(order.customerId);
    

      const merchantSharePercent = 90;
      const platformSharePercent = 10;

      const payload = { customer: 481193, 
        preferred_bank:"wema-bank"
      }

      // const payload = {
      //   customer: {
      //     email: customer.email,
      //     phone: customer.phone,
      //     first_name: customer.name?.split(' ')[0] || 'Customer',
      //     last_name: customer.name?.split(' ')[1] || ''
      //   },
      //   preferred_bank: "test-bank",
      //   metadata: {
      //     order_id: order.orderId,
      //     merchant_id: merchant._id.toString(),
      //     subaccount: merchant.paystackSubAccountCode,
      //     bearer: 'subaccount',
      //     merchantSharePercent,
      //     platformSharePercent
      //   }
      // };

      let response;
      
        if (!this.paystackKey) throw new Error('PAYSTACK_SECRET_KEY not configured');
        const resp = await axios.post('https://api.paystack.co/dedicated_account', payload, {
          headers: {
            Authorization: `Bearer ${this.paystackKey}`,
            'Content-Type': 'application/json'
          }
        });
        response = resp.data;
      

      if (!response || response.status !== true) {
        throw new Error(response?.message || 'Virtual account creation failed');
      }

      const vaData = response.data || response;

      // Update order with virtual account details and subaccount metadata
      await Order.findByIdAndUpdate(order._id, {
        'payment.virtualAccount': {
          accountNumber: vaData.account_number || vaData?.account_number,
          bankName: vaData.bank?.name || vaData?.bank,
          accountName: vaData.account_name || vaData?.account_name,
          dedicatedAccountId: vaData.id || vaData?.id,
          metadata: payload.metadata
        },
        'payment.subaccount': merchant.paystackSubAccountCode,
        'payment.splitConfig': {
          type: 'subaccount',
          merchantSharePercent,
          platformSharePercent,
          bearer: 'subaccount'
        },
        'payment.status': 'awaiting_payment'
      });

      return {
        accountNumber: vaData.account_number || vaData?.account_number,
        bankName: vaData.bank?.name || vaData?.bank,
        accountName: vaData.account_name || vaData?.account_name,
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

      
      if (order && Number(transactionData.amount) === Number(order.payment.amount) * 100) {

        await this.paymentSplitService.processSuccessfulPayment({
          ...transactionData,
          reference: order.orderId,
          amount: transactionData.amount,
          fees: transactionData.fees || 0,
          amount_settled: transactionData.amount,
          channel: 'bank_transfer',
          id: transactionData.id
        });

        console.log(`Virtual account payment processed for order: ${order.orderId}`);
      } else {
        console.warn('Virtual account payment received but no matching order or amount mismatch', {
          account: transactionData.account_number,
          amount: transactionData.amount
        });
      }
    } catch (error) {
      console.error('Error processing virtual account payment:', error);
    }
  }
}

module.exports = VirtualAccountService;