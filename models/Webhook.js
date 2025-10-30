// models/User.js
const mongoose = require('mongoose');

const WebhookEventLogSchema = new mongoose.Schema(
  {
    eventId: { type: String, unique: true },
    eventName: { type: String, allowNull: false },
    payload: { type: Object, allowNull: false },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('WebhookEventLog', WebhookEventLogSchema);
