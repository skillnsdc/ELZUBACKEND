const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  
  // Balance
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Statistics
  totalCredited: {
    type: Number,
    default: 0
  },
  totalDebited: {
    type: Number,
    default: 0
  },
  todayEarning: {
    type: Number,
    default: 0
  },
  totalEarning: {
    type: Number,
    default: 0
  },
  
  // Last reset date for today earning
  lastResetDate: {
    type: Date,
    default: Date.now
  },
  
  // Mini statement (last 10 transactions summary)
  miniStatement: [{
    type: {
      type: String,
      enum: ['credit', 'debit']
    },
    amount: Number,
    description: String,
    date: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Method to reset today earning
walletSchema.methods.resetTodayEarning = function() {
  const today = new Date();
  const lastReset = new Date(this.lastResetDate);
  
  if (today.getDate() !== lastReset.getDate() || 
      today.getMonth() !== lastReset.getMonth() || 
      today.getFullYear() !== lastReset.getFullYear()) {
    this.todayEarning = 0;
    this.lastResetDate = today;
    return this.save();
  }
  return Promise.resolve(this);
};

// Method to add to mini statement
walletSchema.methods.addToMiniStatement = function(type, amount, description) {
  this.miniStatement.unshift({
    type,
    amount,
    description,
    date: new Date()
  });
  
  // Keep only last 10
  if (this.miniStatement.length > 10) {
    this.miniStatement = this.miniStatement.slice(0, 10);
  }
  
  return this.save();
};

module.exports = mongoose.model('Wallet', walletSchema);
