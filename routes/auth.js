const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { generateToken } = require('../utils/jwt');
const { generateOTPWithExpiry, verifyOTP, formatMobile } = require('../utils/otp');

// @route   POST /api/auth/register
// @desc    Register new user (Retailer)
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      mobile,
      password,
      aadhaarNumber,
      panNumber,
      address,
      city,
      state,
      pincode,
      shopName,
      shopAddress
    } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ email }, { mobile }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or mobile'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      name,
      email,
      mobile: formatMobile(mobile),
      password: hashedPassword,
      role: 'retailer',
      status: 'pending',
      kycData: {
        aadhaarNumber,
        panNumber,
        address,
        city,
        state,
        pincode,
        shopName,
        shopAddress
      }
    });

    await user.save();

    // Create wallet for user
    const wallet = new Wallet({
      user: user._id,
      balance: 0
    });
    await wallet.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Registration successful. Waiting for admin approval.',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          role: user.role,
          status: user.status,
          kycVerified: user.kycVerified
        },
        token
      }
    });

  } catch (error) {
    console.error('Register Error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { mobile, password } = req.body;

    // Find user
    const user = await User.findOne({ mobile: formatMobile(mobile) });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Account is ${user.status}. Please contact admin.`
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          role: user.role,
          status: user.status,
          kycVerified: user.kycVerified
        },
        token
      }
    });

  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// @route   POST /api/auth/send-otp
// @desc    Send OTP to mobile
// @access  Public
router.post('/send-otp', async (req, res) => {
  try {
    const { mobile } = req.body;

    const user = await User.findOne({ mobile: formatMobile(mobile) });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate OTP
    const { otp, expiry } = generateOTPWithExpiry(10);

    // Save OTP to user
    user.otpCode = otp;
    user.otpExpiry = expiry;
    await user.save();

    // TODO: Integrate with SMS gateway (Firebase/MSG91/Twilio)
    // For now, return OTP in response (development only)
    console.log(`OTP for ${mobile}: ${otp}`);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        mobile: formatMobile(mobile),
        // Remove otp in production
        otp: process.env.NODE_ENV === 'development' ? otp : undefined
      }
    });

  } catch (error) {
    console.error('Send OTP Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message
    });
  }
});

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP
// @access  Public
router.post('/verify-otp', async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    const user = await User.findOne({ mobile: formatMobile(mobile) });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify OTP
    const result = verifyOTP(otp, user.otpCode, user.otpExpiry);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    // Mark OTP as verified
    user.otpVerified = true;
    user.otpCode = null;
    user.otpExpiry = null;
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'OTP verified successfully',
      data: {
        token
      }
    });

  } catch (error) {
    console.error('Verify OTP Error:', error);
    res.status(500).json({
      success: false,
      message: 'OTP verification failed',
      error: error.message
    });
  }
});

// @route   POST /api/auth/firebase-login
// @desc    Login with Firebase UID (after OTP verification)
// @access  Public
router.post('/firebase-login', async (req, res) => {
  try {
    const { mobile, firebaseUid } = req.body;

    const user = await User.findOne({ mobile: formatMobile(mobile) });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Account is ${user.status}. Please contact admin.`
      });
    }

    // Update Firebase UID
    user.firebaseUid = firebaseUid;
    user.otpVerified = true;
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          mobile: user.mobile,
          role: user.role,
          status: user.status,
          kycVerified: user.kycVerified
        },
        token
      }
    });

  } catch (error) {
    console.error('Firebase Login Error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// @route   GET /api/auth/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const { verifyToken } = require('../utils/jwt');
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user
      }
    });

  } catch (error) {
    console.error('Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    });
  }
});

module.exports = router;
