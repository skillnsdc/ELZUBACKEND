const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Transaction ID
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  
  // User
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Transaction Type
  type: {
    type: String,
    enum: ['credit', 'debit', 'commission', 'refund', 'transfer'],
    required: true
  },
  
  // Service Reference
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    default: null
  },
  serviceName: {
    type: String,
    default: null
  },
  
  // Amounts
  amount: {
    type: Number,
    required: true
  },
  baseAmount: {
    type: Number,
    default: 0
  },
  adminCommission: {
    type: Number,
    default: 0
  },
  retailerCommission: {
    type: Number,
    default: 0
  },
  
  // Balance after transaction
  balanceAfter: {
    type: Number,
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'pending'
  },
  
  // Description
  description: {
    type: String,
    required: true
  },
  
  // Reference Number (from API)
  referenceNumber: {
    type: String,
    default: null
  },
  
  // API Response
  apiResponse: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  
  // Customer Details (for services)
  customerDetails: {
    name: String,
    mobile: String,
    email: String,
    number: String // Account number, consumer number, etc.
  },
  
  // Operator/Provider
  operator: {
    type: String,
    default: null
  },
  
  // Processed By
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Remarks
  remarks: {
    type: String,
    default: null
  },
  
  // IP Address
  ipAddress: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for faster queries
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ transactionId: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ createdAt: -1 });

// Static method to generate transaction ID
transactionSchema.statics.generateTransactionId = function() {
  const prefix = 'EI';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${timestamp}${random}`;
};

module.exports = mongoose.model('Transaction', transactionSchema);
