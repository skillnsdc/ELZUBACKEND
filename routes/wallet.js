const express = require('express');
const router = express.Router();
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { verifyToken } = require('../utils/jwt');

// Middleware to verify token
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    req.userId = decoded.userId;
    next();

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

// @route   GET /api/wallet/balance
// @desc    Get wallet balance
// @access  Private
router.get('/balance', auth, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.userId });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Reset today earning if needed
    await wallet.resetTodayEarning();

    res.json({
      success: true,
      data: {
        balance: wallet.balance,
        todayEarning: wallet.todayEarning,
        totalEarning: wallet.totalEarning,
        totalCredited: wallet.totalCredited,
        totalDebited: wallet.totalDebited,
        miniStatement: wallet.miniStatement
      }
    });

  } catch (error) {
    console.error('Get Balance Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get wallet balance',
      error: error.message
    });
  }
});

// @route   GET /api/wallet/transactions
// @desc    Get wallet transactions
// @access  Private
router.get('/transactions', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const transactions = await Transaction.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments({ user: req.userId });

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

// @route   POST /api/wallet/transfer
// @desc    Transfer money to another user
// @access  Private
router.post('/transfer', auth, async (req, res) => {
  try {
    const { toUserId, amount, description } = req.body;

    const senderWallet = await Wallet.findOne({ user: req.userId });
    const receiverWallet = await Wallet.findOne({ user: toUserId });

    if (!senderWallet) {
      return res.status(404).json({
        success: false,
        message: 'Sender wallet not found'
      });
    }

    if (!receiverWallet) {
      return res.status(404).json({
        success: false,
        message: 'Receiver wallet not found'
      });
    }

    if (senderWallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Deduct from sender
    senderWallet.balance -= parseFloat(amount);
    senderWallet.totalDebited += parseFloat(amount);
    await senderWallet.addToMiniStatement('debit', amount, `Transfer to ${toUserId}`);
    await senderWallet.save();

    // Add to receiver
    receiverWallet.balance += parseFloat(amount);
    receiverWallet.totalCredited += parseFloat(amount);
    await receiverWallet.addToMiniStatement('credit', amount, `Transfer from ${req.userId}`);
    await receiverWallet.save();

    // Create transactions
    const senderTransaction = new Transaction({
      transactionId: Transaction.generateTransactionId(),
      user: req.userId,
      type: 'transfer',
      amount: parseFloat(amount),
      balanceAfter: senderWallet.balance,
      description: description || 'Wallet transfer',
      status: 'completed'
    });
    await senderTransaction.save();

    const receiverTransaction = new Transaction({
      transactionId: Transaction.generateTransactionId(),
      user: toUserId,
      type: 'transfer',
      amount: parseFloat(amount),
      balanceAfter: receiverWallet.balance,
      description: description || 'Wallet transfer received',
      status: 'completed'
    });
    await receiverTransaction.save();

    res.json({
      success: true,
      message: 'Transfer successful',
      data: {
        senderBalance: senderWallet.balance,
        transaction: senderTransaction
      }
    });

  } catch (error) {
    console.error('Transfer Error:', error);
    res.status(500).json({
      success: false,
      message: 'Transfer failed',
      error: error.message
    });
  }
});

// @route   GET /api/wallet/earnings
// @desc    Get earnings summary
// @access  Private
router.get('/earnings', auth, async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ user: req.userId });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Get today's earnings from transactions
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayEarnings = await Transaction.aggregate([
      {
        $match: {
          user: wallet.user,
          type: 'commission',
          createdAt: { $gte: today }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    // Get monthly earnings
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const monthlyEarnings = await Transaction.aggregate([
      {
        $match: {
          user: wallet.user,
          type: 'commission',
          createdAt: { $gte: thisMonth }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        todayEarning: todayEarnings[0]?.total || 0,
        monthlyEarning: monthlyEarnings[0]?.total || 0,
        totalEarning: wallet.totalEarning,
        balance: wallet.balance
      }
    });

  } catch (error) {
    console.error('Get Earnings Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get earnings',
      error: error.message
    });
  }
});

module.exports = router;
