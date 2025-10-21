// models/SplitConfig.js
const mongoose = require('mongoose');

const splitConfigSchema = new mongoose.Schema({
  splitCode: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  config: {
    type: {
      type: String,
      enum: ['percentage', 'flat'],
      default: 'percentage'
    },
    currency: {
      type: String,
      default: 'NGN'
    },
    subaccounts: [{
      subaccount: {
        type: String,
        required: true
      },
      share: {
        type: Number,
        required: true
      },
      amount: {
        type: Number,
        default: null
      }
    }],
    bearer_type: {
      type: String,
      enum: ['account', 'subaccount', 'all-proportional', 'all'],
      default: 'account'
    },
    bearer_subaccount: {
      type: String,
      default: null
    },
    main_account_share: {
      type: Number,
      default: 0
    }
  },
  merchantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Merchant',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

splitConfigSchema.index({ merchantId: 1, isActive: 1 });
splitConfigSchema.index({ splitCode: 1 });

module.exports = mongoose.model('SplitConfig', splitConfigSchema);