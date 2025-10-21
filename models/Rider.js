// models/Rider.js
const mongoose = require('mongoose');

const riderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vehicle: {
    type: {
      type: String,
      enum: ['motorcycle', 'bicycle', 'car'],
      required: true
    },
    plateNumber: String,
    color: String,
    make: String
  },
  location: {
    coordinates: {
      lat: Number,
      lng: Number
    },
    lastUpdated: Date
  },
  status: {
    type: String,
    enum: ['available', 'busy', 'offline'],
    default: 'offline'
  },
  currentOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  totalDeliveries: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 0
  },
  earnings: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  documents: {
    license: String,
    insurance: String,
    vehicleRegistration: String
  }
}, {
  timestamps: true
});

// Geospatial index for location-based queries
riderSchema.index({ 'location.coordinates': '2dsphere' });

module.exports = mongoose.model('Rider', riderSchema);