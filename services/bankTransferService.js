// services/bankTransferService.js
const Paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
const axios = require('axios');
const Order = require('../models/Order');
const User = require('../models/User');
const Merchant = require('../models/Merchant');

const PaymentSplitService = require('./paymentSplitService');

class BankTransferService {
  constructor() {
    this.paystack = Paystack;
    this.paystackKey = process.env.PAYSTACK_SECRET_KEY;
    this.paymentSplitService = new PaymentSplitService();
  }

  async createVirtualAccountForOrder(order, merchant, paymentType) {
    try {
       let customer = await User.findById(order.customerId);
            let merchant = await Merchant.findById(order.merchantId);
            
            if (!merchant.paystackSubAccountCode) {
              throw new Error('Merchant does not have a Paystack sub-account');
            }
      
         
            const merchantSharePercent = 90;
            const platformSharePercent = 10;
            let channel;
      
            if (paymentType === "payWithCard") {
              channel = 'card';
            } else if (paymentType === "payWithTransfer") {
              channel = 'bank_transfer';
            } else {
              throw new Error('Invalid payment type specified');
            }
            
      
      
            const payload = {
              email: customer.email,
              amount: Math.round(order.payment.amount * 100),
              reference: order.orderId,
              callback_url: `${process.env.FRONTEND_URL}/track-order?orderId=${order.orderId}`,
              subaccount: merchant.paystackSubAccountCode,
              bearer: 'subaccount',
              channels: [channel],
              metadata: {
                order_id: order.orderId,
                customer_id: customer._id.toString(),
                merchant_id: merchant._id.toString(),
                merchantSharePercent,
                platformSharePercent
              }
            };
   
      
            const response = await this.paystack.transaction.initialize(payload);
      

      if (!response || response.status !== true) {
        throw new Error(response?.message || 'Virtual account creation failed');
      }

      const vaData = response.data || response;

      // Update order with virtual account details and subaccount metadata
      await Order.findByIdAndUpdate(order._id, {
        'payment.paystackReference': response.data.reference,
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
         
        authorization_url: response.data.authorization_url,
        reference: response.data.reference,
        access_code: response.data.access_code
      }
      // \\
      //   accountNumber: vaData.account_number || vaData?.account_number,
      //   bankName: vaData.bank?.name || vaData?.bank,
      //   accountName: vaData.account_name || vaData?.account_name,
      //   instructions: `Transfer exactly ₦${order.payment.amount} to this account. Payment will be automatically verified.`
      // };

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

module.exports = BankTransferService;