const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true
  },

  // --- References --- //
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Merchant',
    required: true
  },
  riderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Rider'
  },

  // --- Simplified Items --- //
  items: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      quantity: {
        type: Number,
        required: true,
        min: 1
      }
    }
  ],

  // --- Payment --- //
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
    paystackReference: String,
    paidAt: Date,
     terminalId: String,
    requestId: String,
    offlineReference: String,
    eventId: String,
    transactionId: String,
    paidAt: Date
  },

  // --- Delivery --- //
  delivery: {
    status: {
      type: String,
      enum: ['pending', 'assigned', 'picked_up', 'in_transit', 'delivered', 'failed'],
      default: 'pending'
    },
    estimatedDelivery: Date,
    actualDelivery: Date
  },

  status: {
    type: String,
    enum: ['created', 'confirmed', 'delivered', 'cancelled'],
    default: 'created'
  },

  notes: String,

  deliveryAddress: {
    street: String,
    city: String,
    state: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  }

}, { timestamps: true });

// --- Indexes --- //
orderSchema.index({ orderId: 1 });
orderSchema.index({ customerId: 1 });
orderSchema.index({ merchantId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
