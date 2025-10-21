// models/Transaction.js
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  paystackReference: {
    type: String,
    required: true,
    unique: true
  },
  amount: {
    type: Number,
    required: true
  },
  fees: {
    type: Number,
    default: 0
  },
  netAmount: {
    type: Number,
    required: true
  },
  platformFee: {
    type: Number,
    required: true
  },
  merchantAmount: {
    type: Number,
    required: true
  },
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Merchant',
    required: true
  },
  splitCode: String,
  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'reversed'],
    default: 'pending'
  },
  channel: String,
  paidAt: Date,
  merchantPayout: {
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    reference: String,
    paidAt: Date,
    failureReason: String
  },
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

transactionSchema.index({ paystackReference: 1 });
transactionSchema.index({ orderId: 1 });
transactionSchema.index({ merchantId: 1 });
transactionSchema.index({ status: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);