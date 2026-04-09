const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Basic Info
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  mobile: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  
  // Role & Status
  role: {
    type: String,
    enum: ['admin', 'retailer', 'trainer', 'staff'],
    default: 'retailer'
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended', 'rejected'],
    default: 'pending'
  },
  isActive: {
    type: Boolean,
    default: false
  },
  
  // KYC Information
  kycVerified: {
    type: Boolean,
    default: false
  },
  kycData: {
    aadhaarNumber: String,
    panNumber: String,
    address: String,
    city: String,
    state: String,
    pincode: String,
    shopName: String,
    shopAddress: String,
    shopPhoto: String,
    idProof: String,
    addressProof: String
  },
  
  // Bank Details
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    accountHolder: String
  },
  
  // Profile
  profilePhoto: {
    type: String,
    default: null
  },
  
  // OTP Verification
  otpVerified: {
    type: Boolean,
    default: false
  },
  otpCode: String,
  otpExpiry: Date,
  
  // Firebase UID
  firebaseUid: {
    type: String,
    default: null
  },
  
  // Timestamps
  lastLogin: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});
const bcrypt = require("bcrypt");

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});
// Index for faster queries
userSchema.index({ mobile: 1 });
userSchema.index({ email: 1 });
userSchema.index({ role: 1, status: 1 });

module.exports = mongoose.model('User', userSchema);
