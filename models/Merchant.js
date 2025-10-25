// models/Merchant.js
const mongoose = require('mongoose');

const merchantSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  businessName: {
    type: String,
    required: true
  },
  description: String,
  type: {
    type: String,
    enum: ['open_air_market', 'grocery_shop', 'supermarket'],
    required: true
  },
  market: {
    name: String,
    location: {
      address: String,
      coordinates: {
        lat: Number,
        lng: Number
      }
    }
  },
  contact: {
    phone: String,
    email: String,
    address: String
  },
  bankDetails: {
    accountNumber: String,
    bankName: String,
    accountName: String
  },
  paystackSubAccountCode: String,
  products: [{
    name: String,
    description: String,
    price: Number,
    category: String,
    image: String,
    stock: Number,
    available: {
      type: Boolean,
      default: true
    },
    unit: String
  }],
  rating: {
    type: Number,
    default: 0
  },
  totalOrders: {
    type: Number,
    default: 0
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Merchant', merchantSchema);