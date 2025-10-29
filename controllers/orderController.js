const Order = require('../models/Order');
const Merchant = require('../models/Merchant');
const User = require('../models/User');
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



function calculatePaystackFee(amount) {
  try {
    const feePercentage = 0.015; // 1.5%
    const flatFee = 100; // ₦100
    const calculatedFee = (amount * feePercentage) + flatFee;
    return Math.min(calculatedFee, 2000); // Cap at ₦2000
  } catch (error) {
    console.error('Error calculating Paystack fee:', error);
    return 150;
  }
}

function calculateEstimatedDelivery() {
  const deliveryTime = new Date();
  deliveryTime.setHours(deliveryTime.getHours() + 2);
  return deliveryTime;
}

async function assignMerchant(products) {
  try {
    const productIds = products.map(item => item.productId);
    console.log('Assigning merchant for products:', productIds);
    const merchant = await Merchant.findOne({
      'products._id': { $in: productIds },
      isActive: true
    });
    return merchant;
  } catch (error) {
    console.error('Error assigning merchant:', error);
    return null;
  }
}
async function computeOrderTotals(items, merchant) {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('No items provided for total computation');
    }
    if (!merchant) {
      throw new Error('Merchant is required to compute totals');
    }

    const detailed = [];
    let subtotal = 0;

    for (const it of items) {
      const productId = it.productId;
      const qty = Number(it.quantity || 1);

      // find product in merchant catalog
      const prod = merchant.products.find(p => String(p._id) === String(productId));
      if (!prod) {
        throw new Error(`Product ${productId} not found for merchant ${merchant._id}`);
      }

      const price = Number(prod.price || 0);
      const lineTotal = price * qty;
      detailed.push({
        productId,
        name: prod.name,
        price,
        quantity: qty,
        lineTotal
      });
      subtotal += lineTotal;
    }

    // platform & fees (same logic as existing controller)
    const platformFee = +(subtotal * 0.10).toFixed(2);
    const paystackFee = calculatePaystackFee(subtotal);
    const merchantAmount = +(subtotal - platformFee - paystackFee).toFixed(2);

    return {
      items: detailed,
      subtotal: +subtotal.toFixed(2),
      totalAmount: +subtotal.toFixed(2),
      platformFee,
      paystackFee,
      merchantAmount
    };
  } catch (err) {
    console.error('computeOrderTotals error:', err.message);
    throw err;
  }
}

async function processRefund(order) {
  try {
    console.log(`Processing refund for order: ${order.orderId}`);
    const refundData = {
      transaction: order.payment.paystackReference,
      amount: order.payment.amount * 100, // Convert to kobo
      merchant_note: `Refund for cancelled order ${order.orderId}`
    };
    console.log('Refund data:', refundData);
  } catch (error) {
    console.error('Refund processing error:', error);
    throw error;
  }
}

// --- Controller Methods --- //

async function createOrder(req, res) {
  try {
    const { customer, items, paymentMethod, deliveryAddress, notes } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Order must contain at least one product ID'
      });
    }

    let user = null;
    let userCreated = false;

    // Check if customer exists by email (optional - for returning customers)
    if (customer.email) {
      user = await User.findOne({ email: customer.email });
      
      if (!user) {
        // Create new user for guest checkout
        user = new User({
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          role: 'customer',
          address: {
            street: deliveryAddress,
            city: 'Lagos',
            state: 'Lagos'
          }
        });
        await user.save();
        userCreated = true;
        console.log('New user created for order:', user._id);
      }
    }

    const merchant = await assignMerchant(items);
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
        error: `Insufficient stock for product ${stockCheck.product}`,
        details: stockCheck
      });
    }

    const totals = await computeOrderTotals(items, merchant);
    const totalAmount = totals.totalAmount;
    const paystackFee = totals.paystackFee;
    const platformFee = totals.platformFee;

    const order = new Order({

      orderId: `GRUNDY_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      customerId: user ? user._id : null, // Allow null for true guest checkout
      merchantId: merchant._id,
      items: items, 
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
        estimatedDelivery: calculateEstimatedDelivery()
      },
      status: 'created',
      notes: notes,
      deliveryAddress: deliveryAddress,
      customerEmail: customer.email, // Store email even for guest checkout
      customerPhone: customer.phone,
      customerName: customer.name
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
        paymentData = await terminalPaymentService.createVirtualTerminalForOrder(order, merchant);
        break;
      default:
        throw new Error('Invalid payment method');
    }

    await notificationService.sendOrderNotification(order, 'created');

    res.json({
      success: true,
      order: {
        id: order._id,
        orderId: order.orderId,
        status: order.status,
        totalAmount: order.payment.amount
      },
      paymentData,
      userCreated: userCreated,
      userId: user ? user._id : null,
      message: userCreated ? 'New customer account created' : 'Returning customer'
    });
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

async function getOrder(req, res) {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId })
      .populate('customerId', 'name email phone')
      .populate('merchantId', 'businessName type')
      .populate('riderId', 'userId vehicle')
      .populate('items', 'name price image'); // still populate products if needed

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

async function getUserOrders(req, res) {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;

    const query = { customerId: userId };
    if (status) query.status = status;

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('merchantId', 'businessName')
      .populate('items', 'name price image');

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

async function getMerchantOrders(req, res) {
  try {
    const merchantId = req.user.merchantId;
    const { page = 1, limit = 10, status } = req.query;

    const query = { merchantId };
    if (status) query.status = status;

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('customerId', 'name email phone')
      .populate('items', 'name price image');

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

async function updateOrderStatus(req, res) {
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

async function cancelOrder(req, res) {
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

    if (['delivered', 'cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel order in ${order.status} status`
      });
    }

    order.status = 'cancelled';
    order.cancellationReason = reason;
    await order.save();

    await notificationService.sendOrderNotification(order, 'cancelled');

    if (order.payment.status === 'paid') {
      await processRefund(order);
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

// Export all controller functions
module.exports = {
  createOrder,
  getOrder,
  getUserOrders,
  getMerchantOrders,
  updateOrderStatus,
  cancelOrder
};
