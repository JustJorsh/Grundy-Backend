// services/virtualTerminalService.js
const axios = require('axios');
const Order = require('../models/Order');
const Merchant = require('../models/Merchant');
const User = require('../models/User');
const Rider = require('../models/Rider');

const PaymentSplitService = require('./paymentSplitService');

class VirtualTerminalService {
  constructor() {
    this.paystackBaseURL = 'https://api.paystack.co';
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.paymentSplitService = new PaymentSplitService();
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

  async createVirtualTerminalForOrder(order, merchant) {
    try {
      if (!merchant.paystackSubAccountCode) {
        throw new Error('Merchant does not have a Paystack sub-account');
      }

      // reate a virtual terminal for this merchant if it doesn't exist
      let terminalCode = merchant.virtualTerminalCode;
      
      if (!terminalCode) {
        const terminalPayload = {
          name: `${merchant.businessName} - Order ${order.orderId}`,
          destinations: merchant.notificationPhone ? [
            {
              target: merchant.notificationPhone,
              name: `${merchant.businessName} Notifications`,
            }
          ] : [],
          metadata: JSON.stringify({
            order_id: order.orderId,
            merchant_id: merchant._id.toString(),
            customer_id: customer._id.toString(),
            type: 'order_payment'
          }),
          currency: merchant.currency || 'NGN',
        };

        const terminalResponse = await this.makePaystackRequest('POST', '/virtual_terminal', terminalPayload);
        
        if (!terminalResponse.status) {
          throw new Error(`Virtual terminal creation failed: ${terminalResponse.message}`);
        }

        terminalCode = terminalResponse.data.code;
        
        // Update merchant with virtual terminal code
        await Merchant.findByIdAndUpdate(merchant._id, {
          virtualTerminalCode: terminalCode,
          virtualTerminalId: terminalResponse.data.id,
        });
      }

      const merchantSharePercent = 90;
      const platformSharePercent = 10;

      
      const splitPayload = {
        name: `Split for Order ${order.orderId}`,
        type: 'percentage',
        currency: merchant.currency || 'NGN',
        subaccounts: [
          {
            subaccount: merchant.paystackSubAccountCode,
            share: merchantSharePercent,
          },
 
        ],
        bearer_type: 'subaccount',
        bearer_subaccount: merchant.paystackSubAccountCode,
      };

      const splitResponse = await this.makePaystackRequest('POST', '/split', splitPayload);
      
      if (splitResponse.status) {
        // Assign split code to virtual terminal
        await this.makePaystackRequest(
          'PUT', 
          `/virtual_terminal/${terminalCode}/split_code`, 
          { split_code: splitResponse.data.split_code }
        );
      }

      // Update order with virtual terminal information
      await Order.findByIdAndUpdate(order._id, {
        'payment.virtualTerminalCode': terminalCode,
        'payment.splitCode': splitResponse.data?.split_code,
        'payment.subaccount': merchant.paystackSubAccountCode,
        'payment.splitConfig': {
          type: 'percentage',
          merchantSharePercent,
          platformSharePercent,
          bearer: 'subaccount',
        },
        'payment.status': 'awaiting_payment',
        'payment.paymentUrl': `https://terminal.paystack.com/${terminalCode}`,
      });

      return {
        success: true,
        terminalCode: terminalCode,
        paymentUrl: `https://terminal.paystack.com/${terminalCode}`,
        amount: order.payment.amount,
        currency: merchant.currency || 'NGN',
        instructions: `Visit https://terminal.paystack.com/${terminalCode} to complete your payment of ${order.payment.amount} ${merchant.currency || 'NGN'}`,
        message: 'Virtual terminal created successfully',
      };
    } catch (error) {
      console.error('Create virtual terminal for order error:', error);
      throw new Error(`Virtual terminal setup failed: ${error.message}`);
    }
  }

  async processVirtualTerminalPayment(terminalCode, paymentData) {
    try {
      // Get virtual terminal details to verify payment
      const terminalResponse = await this.makePaystackRequest('GET', `/virtual_terminal/${terminalCode}`);
      
      if (!terminalResponse.status) {
        throw new Error('Virtual terminal not found');
      }
      
      const order = await Order.findOne({
        'payment.virtualTerminalCode': terminalCode,
        'payment.status': 'awaiting_payment'
      });

      if (!order) {
        throw new Error('Order not found for virtual terminal');
      }
      
      await this.paymentSplitService.processSuccessfulPayment({
        reference: `VT_${terminalCode}_${Date.now()}`,
        amount: order.payment.amount * 100,
        currency: order.payment.currency || 'NGN',
        metadata: {
          terminal_code: terminalCode,
          order_id: order.orderId
        }
      });

      // Update order status
      await Order.findByIdAndUpdate(order._id, {
        'payment.status': 'completed',
        'payment.paidAt': new Date(),
        'payment.transactionReference': `VT_${terminalCode}_${Date.now()}`,
      });

      return {
        success: true,
        order,
        message: 'Virtual terminal payment processed successfully',
      };
    } catch (error) {
      console.error('Virtual terminal payment processing error:', error);
      throw new Error(`Virtual terminal payment processing failed: ${error.message}`);
    }
  }

  async handleVirtualTerminalWebhook(event) {
    try {
      if (event.event === 'charge.success') {
        const transaction = event.data;
        
        // Extract terminal code from metadata or reference
        const terminalCode = transaction.metadata?.terminal_code || 
                           transaction.reference?.split('_')[1];
        
        if (terminalCode) {
          const order = await Order.findOne({
            'payment.virtualTerminalCode': terminalCode,
            'payment.status': 'awaiting_payment'
          });

          if (order) {
           
            await this.paymentSplitService.processSuccessfulPayment(transaction);

            // Update order status
            await Order.findByIdAndUpdate(order._id, {
              'payment.status': 'completed',
              'payment.paidAt': new Date(),
              'payment.transactionReference': transaction.reference,
              'payment.method': 'virtual_terminal',
            });

            console.log(`Virtual terminal payment completed for order ${order.orderId}`);
          }
        }
      }

      return { success: true, processed: true };
    } catch (error) {
      console.error('Virtual terminal webhook error:', error);
      throw error;
    }
  }

 

  async createVirtualTerminal(terminalData) {
    try {
      const payload = {
        name: terminalData.name,
        destinations: terminalData.destinations || [],
        metadata: terminalData.metadata ? JSON.stringify(terminalData.metadata) : null,
        currency: terminalData.currency || 'NGN',
        custom_fields: terminalData.custom_fields || [],
      };

      const response = await this.makePaystackRequest('POST', '/virtual_terminal', payload);

      if (!response.status) {
        throw new Error(response.message || 'Failed to create virtual terminal');
      }

      return {
        success: true,
        terminal: response.data,
        message: 'Virtual terminal created successfully',
      };
    } catch (error) {
      console.error('Create virtual terminal error:', error);
      throw new Error(`Virtual terminal creation failed: ${error.message}`);
    }
  }

  async getVirtualTerminal(terminalCode) {
    try {
      const response = await this.makePaystackRequest('GET', `/virtual_terminal/${terminalCode}`);

      if (!response.status) {
        throw new Error(response.message || 'Failed to fetch virtual terminal');
      }

      return {
        success: true,
        terminal: response.data,
      };
    } catch (error) {
      console.error('Get virtual terminal error:', error);
      throw new Error(`Failed to get virtual terminal: ${error.message}`);
    }
  }

  async listVirtualTerminals(options = {}) {
    try {
      const queryParams = new URLSearchParams();
      
      if (options.status) queryParams.append('status', options.status);
      if (options.perPage) queryParams.append('perPage', options.perPage.toString());
      if (options.search) queryParams.append('search', options.search);
      if (options.next) queryParams.append('next', options.next);
      if (options.previous) queryParams.append('previous', options.previous);

      const endpoint = `/virtual_terminal${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const response = await this.makePaystackRequest('GET', endpoint);

      if (!response.status) {
        throw new Error(response.message || 'Failed to fetch virtual terminals');
      }

      return {
        success: true,
        terminals: response.data,
        meta: response.meta,
      };
    } catch (error) {
      console.error('List virtual terminals error:', error);
      throw new Error(`Failed to list virtual terminals: ${error.message}`);
    }
  }

  async updateVirtualTerminal(terminalCode, updateData) {
    try {
      const payload = {
        name: updateData.name,
      };

      const response = await this.makePaystackRequest('PUT', `/virtual_terminal/${terminalCode}`, payload);

      if (!response.status) {
        throw new Error(response.message || 'Failed to update virtual terminal');
      }

      return {
        success: true,
        terminal: response.data,
        message: 'Virtual terminal updated successfully',
      };
    } catch (error) {
      console.error('Update virtual terminal error:', error);
      throw new Error(`Failed to update virtual terminal: ${error.message}`);
    }
  }

  async deactivateVirtualTerminal(terminalCode) {
    try {
      const response = await this.makePaystackRequest('PUT', `/virtual_terminal/${terminalCode}/deactivate`);

      if (!response.status) {
        throw new Error(response.message || 'Failed to deactivate virtual terminal');
      }

      return {
        success: true,
        message: response.message || 'Virtual terminal deactivated successfully',
      };
    } catch (error) {
      console.error('Deactivate virtual terminal error:', error);
      throw new Error(`Failed to deactivate virtual terminal: ${error.message}`);
    }
  }

  async assignDestination(terminalCode, destinations) {
    try {
      const payload = {
        destinations: destinations,
      };

      const response = await this.makePaystackRequest('POST', `/virtual_terminal/${terminalCode}/destination/assign`, payload);

      if (!response.status) {
        throw new Error(response.message || 'Failed to assign destination');
      }

      return {
        success: true,
        destinations: response.data,
        message: 'Destination assigned successfully',
      };
    } catch (error) {
      console.error('Assign destination error:', error);
      throw new Error(`Failed to assign destination: ${error.message}`);
    }
  }

  async addSplitCode(terminalCode, splitCode) {
    try {
      const payload = {
        split_code: splitCode,
      };

      const response = await this.makePaystackRequest('PUT', `/virtual_terminal/${terminalCode}/split_code`, payload);

      if (!response.status) {
        throw new Error(response.message || 'Failed to add split code');
      }

      return {
        success: true,
        splitConfig: response.data,
        message: 'Split code added successfully',
      };
    } catch (error) {
      console.error('Add split code error:', error);
      throw new Error(`Failed to add split code: ${error.message}`);
    }
  }

  async getTerminalStatus(terminalCode) {
    try {
      const response = await this.makePaystackRequest('GET', `/virtual_terminal/${terminalCode}`);
      return response.data;
    } catch (error) {
      console.error('Get terminal status error:', error);
      throw new Error(`Failed to get terminal status: ${error.message}`);
    }
  }
}

module.exports = VirtualTerminalService;