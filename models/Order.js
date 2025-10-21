// models/Order.js
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  customer: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    email: String,
    phone: String,
    name: String,
    address: {
      street: String,
      city: String,
      state: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    }
  },
  merchant: {
    merchantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true
    },
    name: String,
    marketId: mongoose.Schema.Types.ObjectId,
    type: String,
    subAccountCode: String
  },
  items: [{
    productId: mongoose.Schema.Types.ObjectId,
    name: String,
    price: Number,
    quantity: Number,
    subtotal: Number
  }],
  payment: {
    method: {
      type: String,
      enum: ['online', 'bank_transfer_delivery', 'terminal_delivery'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'awaiting_payment', 'paid', 'failed', 'refunded'],
      default: 'pending'
    },
    amount: Number,
    platformFee: Number,
    merchantAmount: Number,
    paystackFee: Number,
    actualAmount: Number,
    paystackReference: String,
    splitCode: String,
    splitConfig: {
      type: {
        type: String,
        enum: ['percentage', 'flat']
      },
      merchantShare: Number,
      platformShare: Number,
      bearer: String
    },
    virtualAccount: {
      accountNumber: String,
      bankName: String,
      accountName: String,
      dedicatedAccountId: String
    },
    terminalSessionId: String,
    transactionId: String,
    channel: String,
    paidAt: Date,
    merchantPayoutStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    merchantPayoutReference: String,
    merchantPayoutDate: Date,
    payoutFailureReason: String
  },
  delivery: {
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rider'
    },
    status: {
      type: String,
      enum: ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'],
      default: 'pending'
    },
    estimatedDelivery: Date,
    actualDelivery: Date,
    riderLocation: {
      lat: Number,
      lng: Number
    },
    deliveryNotes: String
  },
  status: {
    type: String,
    enum: ['created', 'confirmed', 'preparing', 'ready', 'in_transit', 'delivered', 'cancelled'],
    default: 'created'
  },
  notes: String,
  cancellationReason: String
}, {
  timestamps: true
});

// Indexes for better performance
orderSchema.index({ orderId: 1 });
orderSchema.index({ 'customer.userId': 1 });
orderSchema.index({ 'merchant.merchantId': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'payment.status': 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);