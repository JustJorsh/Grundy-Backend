// services/terminalPaymentService.js
const axios = require('axios');
const Order = require('../models/Order');
const Merchant = require('../models/Merchant');

class TerminalPaymentService {
  constructor() {
    this.paystackBaseURL = 'https://api.paystack.co';
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
  }

  async makePaystackRequest(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${this.paystackBaseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
      };

      if (data && (method === 'POST' || method === 'PUT')) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error('Paystack API error:', error.response?.data || error.message);
      throw new Error(`Paystack API request failed: ${error.response?.data?.message || error.message}`);
    }
  }

  async initiateTerminalPayment(order, merchant) {
    try {
      if (!merchant.terminal?.id) {
        throw new Error('Merchant does not have a terminal assigned');
      }

      // First create a payment request
      const paymentRequest = await this.makePaystackRequest('POST', '/paymentrequest', {
        customer: order.customer.email,
        amount: Math.round(order.payment.amount * 100), // convert to kobo
        description: `Payment for order ${order.orderId}`,
        metadata: {
          order_id: order.orderId,
          merchant_id: merchant._id.toString()
        }
      });

      if (!paymentRequest.status) {
        throw new Error('Failed to create payment request');
      }

      // Push the payment request to terminal
      const terminalEvent = await this.makePaystackRequest(
        'POST',
        `/terminal/${merchant.terminal.id}/event`,
        {
          type: 'invoice',
          action: 'process',
          data: {
            id: paymentRequest.data.id,
            reference: paymentRequest.data.offline_reference
          }
        }
      );

      // Update order with payment details
      await Order.findByIdAndUpdate(order._id, {
        'payment.status': 'pending',
        'payment.method': 'terminal',
        'payment.terminalId': merchant.terminal.id,
        'payment.requestId': paymentRequest.data.id,
        'payment.offlineReference': paymentRequest.data.offline_reference,
        'payment.eventId': terminalEvent.data.id
      });

      return {
        success: true,
        terminalId: merchant.terminal.id,
        requestId: paymentRequest.data.id,
        offlineReference: paymentRequest.data.offline_reference,
        message: 'Payment initiated on terminal'
      };

    } catch (error) {
      console.error('Terminal payment initiation error:', error);
      throw new Error(`Failed to initiate terminal payment: ${error.message}`);
    }
  }

  async handleTerminalWebhook(event) {
    try {
      if (event.event === 'paymentrequest.success') {
        const order = await Order.findOne({
          'payment.offlineReference': event.data.offline_reference
        });

        if (!order) {
          console.warn('Order not found for offline reference:', event.data.offline_reference);
          return;
        }

        // Update order status
        await Order.findByIdAndUpdate(order._id, {
          'payment.status': 'completed',
          'payment.paidAt': new Date(),
          'payment.transactionId': event.data.id
        });

        return { success: true, orderId: order.orderId };
      }
    } catch (error) {
      console.error('Terminal webhook processing error:', error);
      throw error;
    }
  }

  async getTerminalStatus(terminalId) {
    try {
      const response = await this.makePaystackRequest('GET', `/terminal/${terminalId}`);
      return response.data;
    } catch (error) {
      console.error('Get terminal status error:', error);
      throw new Error(`Failed to get terminal status: ${error.message}`);
    }
  }

  async createTerminalForMerchant(merchant) {
    try {
      if (!merchant) {
        throw new Error('Merchant details required');
      }

      const terminalPayload = {
        name: `${merchant.businessName} Terminal`,
        description: `Terminal for ${merchant.businessName}`,
        address: merchant.market?.location?.address || 'Address not specified'
      };

      const response = await this.makePaystackRequest('POST', '/terminal', terminalPayload);

      if (!response.status) {
        throw new Error('Terminal creation failed');
      }

      // Update merchant with terminal details
      await Merchant.findByIdAndUpdate(merchant._id, {
        'terminal.id': response.data.id,
        'terminal.serialNumber': response.data.serial_number,
        'terminal.name': response.data.name,
        'terminal.status': response.data.status
      });

      return {
        success: true,
        terminalId: response.data.id,
        serialNumber: response.data.serial_number,
        name: response.data.name,
        status: response.data.status
      };
    } catch (error) {
      console.error('Terminal creation error:', error);
      throw new Error(`Failed to create terminal: ${error.message}`);
    }
  }
}

module.exports = TerminalPaymentService;