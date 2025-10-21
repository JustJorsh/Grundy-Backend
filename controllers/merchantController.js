// controllers/merchantController.js
const Merchant = require('../models/Merchant');
const Order = require('../models/Order');
const SubAccountService = require('../services/subAccountService');
const InventoryService = require('../services/inventoryService');

const subAccountService = new SubAccountService();
const inventoryService = new InventoryService();

class MerchantController {
  async registerMerchant(req, res) {
    try {
      const merchantData = req.body;

      // Create merchant
      const merchant = new Merchant(merchantData);
      await merchant.save();

      // Create Paystack sub-account
      const subAccount = await subAccountService.createSubAccount(merchant);
      
      // Update merchant with sub-account code
      merchant.paystackSubAccountCode = subAccount.subaccount_code;
      await merchant.save();

      res.json({
        success: true,
        merchant: {
          id: merchant._id,
          businessName: merchant.businessName,
          type: merchant.type,
          isVerified: merchant.isVerified
        },
        message: 'Merchant registered successfully'
      });

    } catch (error) {
      console.error('Merchant registration error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getAllMerchants(req, res) {
    try {
      const merchants = await Merchant.find();
      res.json({
        success: true,
        merchants
      });
    } catch (error) {
      console.error('Get all merchants error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getMerchantOrders(req, res) {
    try {
      const merchantId = req.user.merchantId;
      const { page = 1, limit = 10, status } = req.query;

      const query = { 'merchant.merchantId': merchantId };
      if (status) query.status = status;

      const orders = await Order.find(query)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate('customer.userId', 'name phone');

      const total = await Order.countDocuments(query);

      res.json({
        success: true,
        orders,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total
      });

    } catch (error) {
      console.error('Get merchant orders error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async updateProduct(req, res) {
    try {
      const merchantId = req.user.merchantId;
      const { productId } = req.params;
      const updates = req.body;

      const merchant = await Merchant.findById(merchantId);
      const product = merchant.products.id(productId);
      
      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      Object.assign(product, updates);
      await merchant.save();

      res.json({
        success: true,
        product,
        message: 'Product updated successfully'
      });

    } catch (error) {
      console.error('Update product error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async addProduct(req, res) {
    try {
      const merchantId = req.user.merchantId;
      const productData = req.body;

      const product = await inventoryService.addProduct(merchantId, productData);

      res.json({
        success: true,
        product,
        message: 'Product added successfully'
      });

    } catch (error) {
      console.error('Add product error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getMerchantAnalytics(req, res) {
    try {
      const merchantId = req.user.merchantId;

      const totalOrders = await Order.countDocuments({ 'merchant.merchantId': merchantId });
      const completedOrders = await Order.countDocuments({ 
        'merchant.merchantId': merchantId,
        status: 'delivered'
      });
      const totalRevenue = await Order.aggregate([
        { $match: { 'merchant.merchantId': merchantId, 'payment.status': 'paid' } },
        { $group: { _id: null, total: { $sum: '$payment.merchantAmount' } } }
      ]);

      const recentOrders = await Order.find({ 'merchant.merchantId': merchantId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('customer.userId', 'name');

      res.json({
        success: true,
        analytics: {
          totalOrders,
          completedOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          pendingOrders: totalOrders - completedOrders
        },
        recentOrders
      });

    } catch (error) {
      console.error('Get merchant analytics error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new MerchantController();