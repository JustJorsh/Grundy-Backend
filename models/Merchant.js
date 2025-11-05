// models/Merchant.js
const mongoose = require('mongoose');

const merchantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    businessName: {
      type: String,
      required: true,
    },
    description: String,
    type: {
      type: String,
      enum: ['open_air_market', 'grocery_shop', 'supermarket'],
      required: true,
    },
    market: {
      name: String,
      location: {
        address: String,
        coordinates: {
          lat: Number,
          lng: Number,
        },
      },
    },
    contact: {
      phone: String,
      email: String,
      address: String,
    },
    bankDetails: {
      accountNumber: String,
      bankName: String,
      accountName: String,
    },
    paystackSubAccountCode: String,
    virtualTerminalCode: String,
    virtualTerminalId: String,

    products: [
      {
        name: String,
        image: {
          type: String,
          default:
            'https://mcusercontent.com/933f2f0339a6edfcdbb136db1/images/5bfe091d-3610-864b-e153-d395d5ef09dc.jpg',
        },
        description: String,
        price: Number,
        category: String,
        stock: Number,
        available: {
          type: Boolean,
          default: true,
        },
        unit: String,
      },
    ],
    rating: {
      type: Number,
      default: 0,
    },
    totalOrders: {
      type: Number,
      default: 0,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Merchant', merchantSchema);
