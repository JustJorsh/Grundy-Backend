// services/subAccountService.js
const Paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);
const Merchant = require('../models/Merchant');

class SubAccountService {
  constructor() {
    this.paystack = Paystack;
  }

  async createSubAccount(merchantData) {
    try {
      const response = await this.paystack.subaccount.create({
        business_name: merchantData.businessName,
        settlement_bank: merchantData.bankDetails.bankName,
        account_number: merchantData.bankDetails.accountNumber,
        percentage_charge: 0, // We handle split manually
        description: `Grundy LLC - ${merchantData.type} merchant`,
        primary_contact_email: merchantData.contact.email,
        primary_contact_name: merchantData.businessName,
        primary_contact_phone: merchantData.contact.phone,
        metadata: {
          merchant_id: merchantData._id.toString(),
          type: merchantData.type
        }
      });

      if (!response.status) {
        throw new Error(`Sub-account creation failed: ${response.message}`);
      }

      return response.data;

    } catch (error) {
      console.error('Sub-account creation error:', error);
      throw new Error(`Failed to create sub-account: ${error.message}`);
    }
  }

  async updateSubAccount(merchantId, updates) {
    try {
      const merchant = await Merchant.findById(merchantId);
      
      if (!merchant.paystackSubAccountCode) {
        throw new Error('Merchant does not have a sub-account');
      }

      const response = await this.paystack.subaccount.update(
        merchant.paystackSubAccountCode,
        updates
      );

      if (!response.status) {
        throw new Error(`Sub-account update failed: ${response.message}`);
      }

      return response.data;

    } catch (error) {
      console.error('Sub-account update error:', error);
      throw error;
    }
  }

  async getSubAccount(subaccountCode) {
    try {
      const response = await this.paystack.subaccount.fetch(subaccountCode);
      
      if (!response.status) {
        throw new Error(`Sub-account fetch failed: ${response.message}`);
      }

      return response.data;

    } catch (error) {
      console.error('Sub-account fetch error:', error);
      throw error;
    }
  }

  async listSubAccounts() {
    try {
      const response = await this.paystack.subaccount.list();
      
      if (!response.status) {
        throw new Error(`Sub-account list failed: ${response.message}`);
      }

      return response.data;

    } catch (error) {
      console.error('Sub-account list error:', error);
      throw error;
    }
  }
}

module.exports = SubAccountService;