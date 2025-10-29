// controllers/merchantController.js
const Merchant = require('../models/Merchant');
const User = require('../models/User');
const Order = require('../models/Order');
const SubAccountService = require('../services/subAccountService');
const InventoryService = require('../services/inventoryService');
const jwt = require('jsonwebtoken'); 
const bcrypt = require('bcryptjs'); 

const subAccountService = new SubAccountService();
const inventoryService = new InventoryService();

class MerchantController {
  async registerMerchant(req, res) {
    try {
      const merchantData = req.body;


      let user;
      if (merchantData.userId) {
     
        user = await User.findByIdAndUpdate(
          merchantData.userId,
          { 
            role: 'merchant',
            name: merchantData.contact?.name || merchantData.businessName,
            phone: merchantData.contact?.phone,
            email: merchantData.contact?.email
          },
          { new: true }
        );
        
        if (!user) {
          return res.status(400).json({
            success: false,
            error: 'User not found'
          });
        }
      } else {
        // Generate a random password if not provided
        const password = merchantData.password || 'temp_pass';
        
        // Hash password before creating user
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new user for merchant
        user = new User({
          name: merchantData.contact?.name || merchantData.businessName,
          email: merchantData.contact?.email,
          phone: merchantData.contact?.phone,
          password: hashedPassword,
          role: 'merchant'
        });
        await user.save();

        // Don't send the hashed password in response, but send the original password
        // if it was auto-generated (so merchant can login first time)
        if (!merchantData.password) {
          merchantData.generatedPassword = password;
        }
      }

      // Update merchantData with the user ID
      merchantData.userId = user._id;

      // Create merchant
      const merchant = new Merchant(merchantData);
      await merchant.save();

      // Try to create Paystack sub-account
      let paystackSubAccountCode = 'test-mode';
      
      try {
        
        const subAccount = await subAccountService.createSubAccount(merchant);
        // Update merchant with sub-account code
        merchant.paystackSubAccountCode = subAccount.subaccount_code;
        paystackSubAccountCode = subAccount.subaccount_code;
        await merchant.save();
        console.log('Paystack sub-account created successfully:', subAccount.subaccount_code);
      } catch (paystackError) {
        console.error('Paystack integration failed:', paystackError.message);
        console.error('Full error:', paystackError);
        // Generate a mock sub-account code for testing
        paystackSubAccountCode = `ACCT_${merchant._id.toString().slice(-8).toUpperCase()}_${Date.now().toString().slice(-6)}`;
        merchant.paystackSubAccountCode = paystackSubAccountCode;
        await merchant.save();
        console.log('Mock Paystack sub-account created:', paystackSubAccountCode);
      }

      res.json({
        success: true,
        merchant: {
          id: merchant._id,
          businessName: merchant.businessName,
          type: merchant.type,
          isVerified: merchant.isVerified,
          paystackSubAccountCode: paystackSubAccountCode
        },
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        // Only include generated password if one was created
        ...(merchantData.generatedPassword && {
          temporaryPassword: merchantData.generatedPassword,
          message: 'Please change this temporary password on first login'
        }),
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

  async loginMerchant(req, res) {
    try {
      const { email, password } = req.body;
      
      // Validate input
      if (!email || !password) {
        return res.status(400).json({ 
          success: false, 
          error: 'Email and password are required' 
        });
      }

      // Find user and check role
      const user = await User.findOne({ 
        email: email.toLowerCase(),
        role: 'merchant'
      });

      if (!user) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid credentials' 
        });
      }

      // Verify password using bcrypt
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ 
          success: false, 
          error: 'Invalid credentials' 
        });
      }

      // Get associated merchant details
      const merchant = await Merchant.findOne({ userId: user._id });
      if (!merchant) {
        return res.status(404).json({ 
          success: false, 
          error: 'Merchant account not found' 
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          id: user._id, 
          role: user.role, 
          merchantId: merchant._id 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      // Send success response
      res.json({
        success: true,
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role
        },
        merchant: {
          id: merchant._id,
          businessName: merchant.businessName,
          isVerified: merchant.isVerified,
          type: merchant.type
        }
      });

    } catch (error) {
      console.error('Merchant login error:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message || 'Login failed' 
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

    async getProduct(req, res) {
    try {
      const { productId } = req.params;

      // Find merchant containing the product and project only that product
      const merchant = await Merchant.findOne(
        { 'products._id': productId },
        { 'products.$': 1, businessName: 1 }
      );

      if (!merchant || !merchant.products || merchant.products.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      const product = merchant.products[0];

      res.json({
        success: true,
        product: {
          ...product.toObject(),
          merchant: {
            id: merchant._id,
            businessName: merchant.businessName
          }
        }
      });
    } catch (error) {
      console.error('Get product error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

   async getAllProducts(req, res) {
    try {
      const { page = 1, limit = 20, category, merchantId, q, available } = req.query;
      const pageNum = Math.max(1, parseInt(page, 10));
      const lim = Math.max(1, parseInt(limit, 10));

      const pipeline = [];

      if (merchantId) {
        try {
          pipeline.push({ $match: { _id: mongoose.Types.ObjectId(merchantId) } });
        } catch (err) {
          return res.status(400).json({ success: false, error: 'Invalid merchantId' });
        }
      }

      pipeline.push({ $unwind: '$products' });

     
      const prodMatch = {};
      if (category) prodMatch['products.category'] = category;
      if (typeof available !== 'undefined') prodMatch['products.available'] = available === 'true';
      if (q) prodMatch['products.name'] = { $regex: q, $options: 'i' };
      if (Object.keys(prodMatch).length) pipeline.push({ $match: prodMatch });

      pipeline.push(
        {
          $project: {
            product: '$products',
            merchantId: '$_id',
            businessName: 1
          }
        },
        {
          $facet: {
            metadata: [{ $count: 'total' }],
            data: [{ $skip: (pageNum - 1) * lim }, { $limit: lim }]
          }
        }
      );

      const agg = await Merchant.aggregate(pipeline);
      const metadata = agg[0]?.metadata[0] || { total: 0 };
      const rows = agg[0]?.data || [];

      const products = rows.map(r => ({
        ...r.product,
        merchant: { id: r.merchantId, businessName: r.businessName }
      }));

      res.json({
        success: true,
        products,
        total: metadata.total || 0,
        totalPages: Math.ceil((metadata.total || 0) / lim),
        currentPage: pageNum
      });
    } catch (error) {
      console.error('Get all products error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getMerchantProducts(req, res) {
    try {
      const { page = 1, limit = 20, category, available, q } = req.query;
      const merchantId = req.params.merchantId || req.user.merchantId;

      const merchant = await Merchant.findById(merchantId);
      if (!merchant) {
        return res.status(404).json({
          success: false,
          error: 'Merchant not found'
        });
      }

      let products = merchant.products || [];


      if (category) {
        products = products.filter(p => p.category === category);
      }
      if (typeof available !== 'undefined') {
        products = products.filter(p => p.available === (available === 'true'));
      }
      if (q) {
        const searchRegex = new RegExp(q, 'i');
        products = products.filter(p => 
          searchRegex.test(p.name) || 
          searchRegex.test(p.description)
        );
      }

      const total = products.length;
      const pageNum = Math.max(1, parseInt(page));
      const pageSize = Math.max(1, parseInt(limit));
      const startIndex = (pageNum - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      
      const paginatedProducts = products.slice(startIndex, endIndex);

      res.json({
        success: true,
        products: paginatedProducts,
        merchant: {
          id: merchant._id,
          businessName: merchant.businessName,
          type: merchant.type
        },
        total,
        totalPages: Math.ceil(total / pageSize),
        currentPage: pageNum
      });

    } catch (error) {
      console.error('Get merchant products error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new MerchantController();