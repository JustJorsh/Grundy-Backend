// controllers/orderController.js
const Order = require('../models/Order');
const Merchant = require('../models/Merchant');
const PaymentSplitService = require('../services/paymentSplitService');
const VirtualAccountService = require('../services/virtualAccountService');
const TerminalPaymentService = require('../services/terminalPaymentService');
const InventoryService = require('../services/inventoryService');
const NotificationService = require('../services/notificationService');

const paymentSplitService = new PaymentSplitService();
const virtualAccountService = new VirtualAccountService();
const terminalPaymentService = new TerminalPaymentService();
const inventoryService = new InventoryService();
const notificationService = new NotificationService();

class OrderController {
  async createOrder(req, res) {
    try {
      const { customer, items, paymentMethod, deliveryAddress, notes } = req.body;

      // Calculate totals
      const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const platformFee = subtotal * 0.10;
      const paystackFee = this.calculatePaystackFee(subtotal);
      const totalAmount = subtotal;

      // Assign merchant (simplified - in production, you'd have logic to select the best merchant)
      const merchant = await this.assignMerchant(items);
      
      if (!merchant) {
        return res.status(400).json({
          success: false,
          error: 'No merchant available for the selected items'
        });
      }

      // Check stock availability
      const stockCheck = await inventoryService.checkStockAvailability(items, merchant._id);
      if (!stockCheck.available) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for ${stockCheck.product}`,
          details: stockCheck
        });
      }

      const order = new Order({
        orderId: `GRUNDY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        customer: {
          userId: customer.userId,
          email: customer.email,
          phone: customer.phone,
          name: customer.name,
          address: deliveryAddress
        },
        merchant: {
          merchantId: merchant._id,
          name: merchant.businessName,
          type: merchant.type,
          subAccountCode: merchant.paystackSubAccountCode
        },
        items: items.map(item => ({
          ...item,
          subtotal: item.price * item.quantity
        })),
        payment: {
          method: paymentMethod,
          status: paymentMethod === 'online' ? 'pending' : 'awaiting_payment',
          amount: totalAmount,
          platformFee: platformFee,
          merchantAmount: totalAmount - platformFee - paystackFee,
          paystackFee: paystackFee
        },
        delivery: {
          status: 'pending',
          estimatedDelivery: this.calculateEstimatedDelivery()
        },
        status: 'created',
        notes: notes
      });

      await order.save();

      let paymentData;
      switch (paymentMethod) {
        case 'online':
          paymentData = await paymentSplitService.initializePaymentWithSplit(order, merchant);
          break;
        case 'bank_transfer_delivery':
          paymentData = await virtualAccountService.createVirtualAccountForOrder(order, merchant);
          break;
        case 'terminal_delivery':
          paymentData = await terminalPaymentService.createTerminalSession(order, merchant);
          break;
        default:
          throw new Error('Invalid payment method');
      }

      // Send notification
      await notificationService.sendOrderNotification(order, 'created');

      res.json({
        success: true,
        order: {
          id: order._id,
          orderId: order.orderId,
          status: order.status,
          totalAmount: order.payment.amount
        },
        paymentData
      });

    } catch (error) {
      console.error('Order creation error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getOrder(req, res) {
    try {
      const { orderId } = req.params;
      
      const order = await Order.findOne({ orderId })
        .populate('customer.userId', 'name email phone')
        .populate('merchant.merchantId', 'businessName type')
        .populate('delivery.riderId', 'userId vehicle')
        .populate('delivery.riderId.userId', 'name phone');

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      res.json({
        success: true,
        order
      });

    } catch (error) {
      console.error('Get order error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getUserOrders(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10, status } = req.query;

      const query = { 'customer.userId': userId };
      if (status) query.status = status;

      const orders = await Order.find(query)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate('merchant.merchantId', 'businessName');

      const total = await Order.countDocuments(query);

      res.json({
        success: true,
        orders,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total
      });

    } catch (error) {
      console.error('Get user orders error:', error);
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
        .populate('customer.userId', 'name email phone');

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

  async updateOrderStatus(req, res) {
    try {
      const { orderId } = req.params;
      const { status, notes } = req.body;

      const order = await Order.findOne({ orderId });
      
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      order.status = status;
      if (notes) order.notes = notes;
      
      await order.save();

      // Send notification
      await notificationService.sendOrderNotification(order, status);

      res.json({
        success: true,
        order
      });

    } catch (error) {
      console.error('Update order status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async cancelOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { reason } = req.body;

      const order = await Order.findOne({ orderId });
      
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      if (order.status === 'delivered' || order.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          error: `Cannot cancel order in ${order.status} status`
        });
      }

      order.status = 'cancelled';
      order.cancellationReason = reason;
      
      await order.save();

      // Send notification
      await notificationService.sendOrderNotification(order, 'cancelled');

      // If payment was made, process refund
      if (order.payment.status === 'paid') {
        await this.processRefund(order);
      }

      res.json({
        success: true,
        order
      });

    } catch (error) {
      console.error('Cancel order error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async assignMerchant(items) {
    // Simplified merchant assignment
    // In production, this would consider:
    // - Product availability
    // - Merchant location
    // - Merchant rating and capacity
    // - Current order load
    
    return await Merchant.findOne({
      'products._id': { $in: items.map(item => item.productId) },
      isActive: true
    });
  }

  calculatePaystackFee(amount) {
    // Paystack fee: 1.5% + ₦100 for local cards
    return (amount * 0.015) + 100;
  }

  calculateEstimatedDelivery() {
    const deliveryTime = new Date();
    deliveryTime.setHours(deliveryTime.getHours() + 2); // 2-hour estimate
    return deliveryTime;
  }

  async processRefund(order) {
    // Implementation for processing refunds through Paystack
    console.log(`Processing refund for order: ${order.orderId}`);
    // This would integrate with Paystack's refund API
  }
}

module.exports = new OrderController();