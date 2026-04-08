const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  // Service Info
  name: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    default: ''
  },
  
  // Category
  category: {
    type: String,
    enum: [
      'financial',
      'recharge',
      'bbps',
      'govt',
      'health',
      'education',
      'business',
      'land',
      'insurance',
      'training',
      'jobs',
      'other'
    ],
    required: true
  },
  
  // Service Type - debit (money goes out) or credit (money comes in)
  type: {
    type: String,
    enum: ['debit', 'credit'],
    required: true
  },
  
  // Amounts & Commission
  baseAmount: {
    type: Number,
    default: 0 // 0 means variable amount
  },
  minAmount: {
    type: Number,
    default: 0
  },
  maxAmount: {
    type: Number,
    default: 0
  },
  
  // Commission Structure
  adminCommission: {
    type: Number,
    default: 0 // Fixed amount or percentage
  },
  adminCommissionType: {
    type: String,
    enum: ['fixed', 'percentage'],
    default: 'fixed'
  },
  retailerCommission: {
    type: Number,
    default: 0
  },
  retailerCommissionType: {
    type: String,
    enum: ['fixed', 'percentage'],
    default: 'fixed'
  },
  
  // API Configuration
  apiConfig: {
    enabled: {
      type: Boolean,
      default: false
    },
    provider: {
      type: String,
      default: null
    },
    endpoint: {
      type: String,
      default: null
    },
    apiKey: {
      type: String,
      default: null
    },
    secretKey: {
      type: String,
      default: null
    },
    additionalParams: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Icon/Image
  icon: {
    type: String,
    default: null
  },
  
  // Display Order
  displayOrder: {
    type: Number,
    default: 0
  },
  
  // Requirements
  requirements: [{
    type: String
  }],
  
  // Instructions
  instructions: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Indexes
serviceSchema.index({ category: 1 });
serviceSchema.index({ code: 1 });
serviceSchema.index({ isActive: 1 });

module.exports = mongoose.model('Service', serviceSchema);
