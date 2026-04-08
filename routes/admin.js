const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Service = require('../models/Service');
const Job = require('../models/Job');
const { generateToken } = require('../utils/jwt');

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
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

    const user = await User.findById(decoded.userId);

    if (!user || user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }

    req.user = user;
    next();

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

// @route   POST /api/admin/login
// @desc    Admin login
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, role: 'admin' });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials'
      });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Admin login successful',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        token
      }
    });

  } catch (error) {
    console.error('Admin Login Error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard stats
// @access  Admin
router.get('/dashboard', isAdmin, async (req, res) => {
  try {
    // Count stats
    const totalUsers = await User.countDocuments({ role: 'retailer' });
    const activeUsers = await User.countDocuments({ role: 'retailer', status: 'active' });
    const pendingUsers = await User.countDocuments({ role: 'retailer', status: 'pending' });
    const totalTrainers = await User.countDocuments({ role: 'trainer' });
    const totalStaff = await User.countDocuments({ role: 'staff' });

    // Wallet stats
    const wallets = await Wallet.find();
    const totalWalletBalance = wallets.reduce((sum, w) => sum + w.balance, 0);
    const totalEarnings = wallets.reduce((sum, w) => sum + w.totalEarning, 0);

    // Transaction stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayTransactions = await Transaction.countDocuments({
      createdAt: { $gte: today }
    });
    
    const todayRevenue = await Transaction.aggregate([
      { $match: { createdAt: { $gte: today }, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$adminCommission' } } }
    ]);

    // Recent transactions
    const recentTransactions = await Transaction.find()
      .populate('user', 'name mobile')
      .sort({ createdAt: -1 })
      .limit(10);

    // Pending KYC
    const pendingKYC = await User.find({
      role: 'retailer',
      kycVerified: false,
      status: 'pending'
    }).select('name mobile email createdAt');

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          activeUsers,
          pendingUsers,
          totalTrainers,
          totalStaff,
          totalWalletBalance,
          totalEarnings,
          todayTransactions,
          todayRevenue: todayRevenue[0]?.total || 0
        },
        recentTransactions,
        pendingKYC
      }
    });

  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard data',
      error: error.message
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users
// @access  Admin
router.get('/users', isAdmin, async (req, res) => {
  try {
    const { role, status, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (role) query.role = role;
    if (status) query.status = status;

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get Users Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/users/:id/approve
// @desc    Approve retailer
// @access  Admin
router.put('/users/:id/approve', isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.status = 'active';
    user.isActive = true;
    user.kycVerified = true;
    await user.save();

    res.json({
      success: true,
      message: 'User approved successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Approve User Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve user',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/users/:id/reject
// @desc    Reject retailer
// @access  Admin
router.put('/users/:id/reject', isAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.status = 'rejected';
    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      message: 'User rejected',
      data: { user, reason }
    });

  } catch (error) {
    console.error('Reject User Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject user',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/users/:id/suspend
// @desc    Suspend user
// @access  Admin
router.put('/users/:id/suspend', isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.status = 'suspended';
    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      message: 'User suspended successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Suspend User Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to suspend user',
      error: error.message
    });
  }
});

// @route   POST /api/admin/users
// @desc    Create new user (staff/trainer)
// @access  Admin
router.post('/users', isAdmin, async (req, res) => {
  try {
    const { name, email, mobile, password, role } = req.body;

    const existingUser = await User.findOne({
      $or: [{ email }, { mobile }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      mobile,
      password: hashedPassword,
      role,
      status: 'active',
      isActive: true,
      kycVerified: true,
      createdBy: req.user._id
    });

    await user.save();

    // Create wallet for staff/trainer
    if (role !== 'admin') {
      const wallet = new Wallet({
        user: user._id,
        balance: 0
      });
      await wallet.save();
    }

    res.status(201).json({
      success: true,
      message: `${role} created successfully`,
      data: { user }
    });

  } catch (error) {
    console.error('Create User Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
});

// @route   POST /api/admin/wallet/add-money
// @desc    Add money to retailer wallet
// @access  Admin
router.post('/wallet/add-money', isAdmin, async (req, res) => {
  try {
    const { userId, amount, description } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Update wallet
    wallet.balance += parseFloat(amount);
    wallet.totalCredited += parseFloat(amount);
    await wallet.addToMiniStatement('credit', amount, description || 'Admin credit');
    await wallet.save();

    // Create transaction
    const transaction = new Transaction({
      transactionId: Transaction.generateTransactionId(),
      user: userId,
      type: 'credit',
      amount: parseFloat(amount),
      balanceAfter: wallet.balance,
      description: description || 'Wallet recharge by admin',
      status: 'completed',
      processedBy: req.user._id
    });
    await transaction.save();

    res.json({
      success: true,
      message: `₹${amount} added to wallet successfully`,
      data: {
        wallet: {
          balance: wallet.balance,
          totalCredited: wallet.totalCredited
        },
        transaction
      }
    });

  } catch (error) {
    console.error('Add Money Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add money',
      error: error.message
    });
  }
});

// @route   POST /api/admin/wallet/deduct
// @desc    Deduct money from retailer wallet
// @access  Admin
router.post('/wallet/deduct', isAdmin, async (req, res) => {
  try {
    const { userId, amount, description } = req.body;

    const wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    if (wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Update wallet
    wallet.balance -= parseFloat(amount);
    wallet.totalDebited += parseFloat(amount);
    await wallet.addToMiniStatement('debit', amount, description || 'Admin debit');
    await wallet.save();

    // Create transaction
    const transaction = new Transaction({
      transactionId: Transaction.generateTransactionId(),
      user: userId,
      type: 'debit',
      amount: parseFloat(amount),
      balanceAfter: wallet.balance,
      description: description || 'Wallet deduction by admin',
      status: 'completed',
      processedBy: req.user._id
    });
    await transaction.save();

    res.json({
      success: true,
      message: `₹${amount} deducted from wallet successfully`,
      data: {
        wallet: {
          balance: wallet.balance,
          totalDebited: wallet.totalDebited
        },
        transaction
      }
    });

  } catch (error) {
    console.error('Deduct Money Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deduct money',
      error: error.message
    });
  }
});

// @route   GET /api/admin/services
// @desc    Get all services
// @access  Admin
router.get('/services', isAdmin, async (req, res) => {
  try {
    const services = await Service.find().sort({ category: 1, displayOrder: 1 });

    res.json({
      success: true,
      data: { services }
    });

  } catch (error) {
    console.error('Get Services Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get services',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/services/:id
// @desc    Update service (commission, API config)
// @access  Admin
router.put('/services/:id', isAdmin, async (req, res) => {
  try {
    const {
      baseAmount,
      minAmount,
      maxAmount,
      adminCommission,
      adminCommissionType,
      retailerCommission,
      retailerCommissionType,
      apiConfig,
      isActive
    } = req.body;

    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Update fields
    if (baseAmount !== undefined) service.baseAmount = baseAmount;
    if (minAmount !== undefined) service.minAmount = minAmount;
    if (maxAmount !== undefined) service.maxAmount = maxAmount;
    if (adminCommission !== undefined) service.adminCommission = adminCommission;
    if (adminCommissionType) service.adminCommissionType = adminCommissionType;
    if (retailerCommission !== undefined) service.retailerCommission = retailerCommission;
    if (retailerCommissionType) service.retailerCommissionType = retailerCommissionType;
    if (apiConfig) service.apiConfig = { ...service.apiConfig, ...apiConfig };
    if (isActive !== undefined) service.isActive = isActive;

    await service.save();

    res.json({
      success: true,
      message: 'Service updated successfully',
      data: { service }
    });

  } catch (error) {
    console.error('Update Service Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service',
      error: error.message
    });
  }
});

// @route   POST /api/admin/services
// @desc    Create new service
// @access  Admin
router.post('/services', isAdmin, async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      category,
      type,
      baseAmount,
      adminCommission,
      retailerCommission
    } = req.body;

    const existingService = await Service.findOne({ code });
    if (existingService) {
      return res.status(400).json({
        success: false,
        message: 'Service with this code already exists'
      });
    }

    const service = new Service({
      name,
      code,
      description,
      category,
      type,
      baseAmount,
      adminCommission,
      retailerCommission
    });

    await service.save();

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      data: { service }
    });

  } catch (error) {
    console.error('Create Service Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create service',
      error: error.message
    });
  }
});

// @route   GET /api/admin/transactions
// @desc    Get all transactions
// @access  Admin
router.get('/transactions', isAdmin, async (req, res) => {
  try {
    const { user, type, status, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (user) query.user = user;
    if (type) query.type = type;
    if (status) query.status = status;

    const transactions = await Transaction.find(query)
      .populate('user', 'name mobile')
      .populate('processedBy', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments(query);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get Transactions Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get transactions',
      error: error.message
    });
  }
});

// @route   GET /api/admin/jobs
// @desc    Get all jobs
// @access  Admin
router.get('/jobs', isAdmin, async (req, res) => {
  try {
    const { status, assignedTo, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (assignedTo) query.assignedTo = assignedTo;

    const jobs = await Job.find(query)
      .populate('uploadedBy', 'name')
      .populate('assignedTo', 'name')
      .populate('trainer', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Job.countDocuments(query);

    res.json({
      success: true,
      data: {
        jobs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get Jobs Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get jobs',
      error: error.message
    });
  }
});

// @route   PUT /api/admin/jobs/:id/assign
// @desc    Assign job to trainer
// @access  Admin
router.put('/jobs/:id/assign', isAdmin, async (req, res) => {
  try {
    const { trainerId } = req.body;

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    const trainer = await User.findById(trainerId);
    if (!trainer || trainer.role !== 'trainer') {
      return res.status(400).json({
        success: false,
        message: 'Invalid trainer'
      });
    }

    job.assignedTo = trainerId;
    job.trainer = trainerId;
    job.status = 'assigned';
    job.assignedAt = new Date();
    await job.save();

    res.json({
      success: true,
      message: 'Job assigned successfully',
      data: { job }
    });

  } catch (error) {
    console.error('Assign Job Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign job',
      error: error.message
    });
  }
});

// @route   GET /api/admin/reports
// @desc    Get reports
// @access  Admin
router.get('/reports', isAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateQuery = {};
    if (startDate || endDate) {
      dateQuery.createdAt = {};
      if (startDate) dateQuery.createdAt.$gte = new Date(startDate);
      if (endDate) dateQuery.createdAt.$lte = new Date(endDate);
    }

    // Transaction summary
    const transactionSummary = await Transaction.aggregate([
      { $match: dateQuery },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalAdminCommission: { $sum: '$adminCommission' },
          totalRetailerCommission: { $sum: '$retailerCommission' }
        }
      }
    ]);

    // Service-wise summary
    const serviceSummary = await Transaction.aggregate([
      { $match: { ...dateQuery, status: 'completed' } },
      {
        $group: {
          _id: '$serviceName',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    // Daily summary
    const dailySummary = await Transaction.aggregate([
      { $match: dateQuery },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          adminCommission: { $sum: '$adminCommission' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      success: true,
      data: {
        transactionSummary,
        serviceSummary,
        dailySummary
      }
    });

  } catch (error) {
    console.error('Reports Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get reports',
      error: error.message
    });
  }
});

module.exports = router;
