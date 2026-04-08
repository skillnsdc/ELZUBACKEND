const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const axios = require('axios');
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

// @route   GET /api/service/categories
// @desc    Get all service categories
// @access  Public
router.get('/categories', async (req, res) => {
  try {
    const categories = [
      { id: 'financial', name: 'Financial Services', icon: '💳' },
      { id: 'recharge', name: 'Recharge', icon: '📱' },
      { id: 'bbps', name: 'BBPS', icon: '⚡' },
      { id: 'govt', name: 'Government', icon: '🪪' },
      { id: 'health', name: 'Health', icon: '🏥' },
      { id: 'education', name: 'Education', icon: '🎓' },
      { id: 'business', name: 'Business', icon: '🏢' },
      { id: 'land', name: 'Land & Property', icon: '🌾' },
      { id: 'insurance', name: 'Insurance', icon: '🛡️' },
      { id: 'training', name: 'Training', icon: '🎥' },
      { id: 'jobs', name: 'Jobs', icon: '💼' }
    ];

    res.json({
      success: true,
      data: { categories }
    });

  } catch (error) {
    console.error('Get Categories Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get categories',
      error: error.message
    });
  }
});

// @route   GET /api/service/list
// @desc    Get all active services
// @access  Public
router.get('/list', async (req, res) => {
  try {
    const { category } = req.query;
    
    const query = { isActive: true };
    if (category) query.category = category;

    const services = await Service.find(query)
      .select('-apiConfig') // Don't expose API config
      .sort({ category: 1, displayOrder: 1 });

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

// @route   GET /api/service/:id
// @desc    Get service details
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .select('-apiConfig.apiKey -apiConfig.secretKey');

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      data: { service }
    });

  } catch (error) {
    console.error('Get Service Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get service',
      error: error.message
    });
  }
});

// @route   POST /api/service/:id/process
// @desc    Process a service
// @access  Private
router.post('/:id/process', auth, async (req, res) => {
  try {
    const { amount, customerDetails, operator } = req.body;
    
    const service = await Service.findById(req.params.id);
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    if (!service.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Service is currently unavailable'
      });
    }

    const user = await User.findById(req.userId);
    const wallet = await Wallet.findOne({ user: req.userId });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Calculate amounts
    let serviceAmount = parseFloat(amount) || service.baseAmount;
    let adminCommission = 0;
    let retailerCommission = 0;

    if (service.adminCommissionType === 'percentage') {
      adminCommission = (serviceAmount * service.adminCommission) / 100;
    } else {
      adminCommission = service.adminCommission;
    }

    if (service.retailerCommissionType === 'percentage') {
      retailerCommission = (serviceAmount * service.retailerCommission) / 100;
    } else {
      retailerCommission = service.retailerCommission;
    }

    // Check wallet balance for debit services
    if (service.type === 'debit') {
      const totalDeduction = serviceAmount + adminCommission;
      if (wallet.balance < totalDeduction) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance',
          data: {
            required: totalDeduction,
            available: wallet.balance
          }
        });
      }
    }

    // Create pending transaction
    const transaction = new Transaction({
      transactionId: Transaction.generateTransactionId(),
      user: req.userId,
      service: service._id,
      serviceName: service.name,
      type: service.type,
      amount: serviceAmount,
      baseAmount: serviceAmount,
      adminCommission,
      retailerCommission,
      balanceAfter: wallet.balance,
      description: `${service.name} - ${customerDetails?.name || 'Customer'}`,
      status: 'pending',
      customerDetails,
      operator,
      ipAddress: req.ip
    });

    await transaction.save();

    // Call API if configured
    let apiResponse = null;
    let apiSuccess = false;

    if (service.apiConfig?.enabled && service.apiConfig?.endpoint) {
      try {
        const apiPayload = {
          ...service.apiConfig.additionalParams,
          serviceCode: service.code,
          amount: serviceAmount,
          customerDetails,
          operator,
          referenceId: transaction.transactionId
        };

        // Add API key if available
        if (service.apiConfig.apiKey) {
          apiPayload.apiKey = service.apiConfig.apiKey;
        }

        const response = await axios.post(service.apiConfig.endpoint, apiPayload, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': service.apiConfig.apiKey || ''
          },
          timeout: 30000
        });

        apiResponse = response.data;
        apiSuccess = response.data.success || response.data.status === 'success';

        transaction.apiResponse = apiResponse;
        transaction.referenceNumber = apiResponse.referenceNumber || apiResponse.txnId;

      } catch (apiError) {
        console.error('API Call Error:', apiError.message);
        apiResponse = { error: apiError.message };
        transaction.apiResponse = apiResponse;
      }
    } else {
      // No API configured - simulate success for testing
      apiSuccess = true;
      apiResponse = { 
        success: true, 
        message: 'Service processed (No API configured)',
        referenceNumber: `SIM${Date.now()}`
      };
      transaction.referenceNumber = apiResponse.referenceNumber;
    }

    // Update transaction status
    transaction.status = apiSuccess ? 'completed' : 'failed';
    await transaction.save();

    if (apiSuccess) {
      // Update wallet based on service type
      if (service.type === 'debit') {
        // Deduct from wallet
        const totalDeduction = serviceAmount + adminCommission;
        wallet.balance -= totalDeduction;
        wallet.totalDebited += totalDeduction;
        await wallet.addToMiniStatement('debit', totalDeduction, service.name);
      } else {
        // Credit service - add commission to wallet
        wallet.balance += retailerCommission;
        wallet.totalCredited += retailerCommission;
        wallet.todayEarning += retailerCommission;
        wallet.totalEarning += retailerCommission;
        await wallet.addToMiniStatement('credit', retailerCommission, `${service.name} commission`);

        // Create commission transaction
        const commissionTransaction = new Transaction({
          transactionId: Transaction.generateTransactionId(),
          user: req.userId,
          service: service._id,
          serviceName: service.name,
          type: 'commission',
          amount: retailerCommission,
          balanceAfter: wallet.balance,
          description: `${service.name} commission earned`,
          status: 'completed',
          referenceNumber: transaction.transactionId
        });
        await commissionTransaction.save();
      }

      transaction.balanceAfter = wallet.balance;
      await transaction.save();
      await wallet.save();

      res.json({
        success: true,
        message: `${service.name} processed successfully`,
        data: {
          transaction,
          wallet: {
            balance: wallet.balance,
            todayEarning: wallet.todayEarning
          },
          apiResponse
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Service processing failed',
        data: {
          transaction,
          apiResponse
        }
      });
    }

  } catch (error) {
    console.error('Process Service Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process service',
      error: error.message
    });
  }
});

// @route   POST /api/service/recharge/mobile
// @desc    Mobile recharge
// @access  Private
router.post('/recharge/mobile', auth, async (req, res) => {
  try {
    const { mobile, operator, amount, circle } = req.body;

    const service = await Service.findOne({ code: 'MOB_RECH' });
    
    if (!service || !service.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Mobile recharge service unavailable'
      });
    }

    const wallet = await Wallet.findOne({ user: req.userId });

    if (wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Process recharge
    const transaction = new Transaction({
      transactionId: Transaction.generateTransactionId(),
      user: req.userId,
      service: service._id,
      serviceName: 'Mobile Recharge',
      type: 'debit',
      amount: parseFloat(amount),
      balanceAfter: wallet.balance - amount,
      description: `Mobile Recharge - ${mobile}`,
      status: 'completed',
      customerDetails: { mobile, name: 'Recharge' },
      operator,
      referenceNumber: `RCH${Date.now()}`
    });

    await transaction.save();

    // Deduct from wallet
    wallet.balance -= parseFloat(amount);
    wallet.totalDebited += parseFloat(amount);
    await wallet.addToMiniStatement('debit', amount, 'Mobile Recharge');
    await wallet.save();

    res.json({
      success: true,
      message: 'Recharge successful',
      data: {
        transaction,
        wallet: {
          balance: wallet.balance
        }
      }
    });

  } catch (error) {
    console.error('Mobile Recharge Error:', error);
    res.status(500).json({
      success: false,
      message: 'Recharge failed',
      error: error.message
    });
  }
});

// @route   POST /api/service/bbps/bill
// @desc    Pay BBPS bill
// @access  Private
router.post('/bbps/bill', auth, async (req, res) => {
  try {
    const { biller, consumerNumber, amount, billDetails } = req.body;

    const service = await Service.findOne({ 
      code: { $in: ['ELEC_BILL', 'WATER_BILL', 'GAS_BILL', 'BB_BILL'] }
    });
    
    if (!service || !service.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Bill payment service unavailable'
      });
    }

    const wallet = await Wallet.findOne({ user: req.userId });

    if (wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance'
      });
    }

    // Process bill payment
    const transaction = new Transaction({
      transactionId: Transaction.generateTransactionId(),
      user: req.userId,
      service: service._id,
      serviceName: `${biller} Bill Payment`,
      type: 'debit',
      amount: parseFloat(amount),
      balanceAfter: wallet.balance - amount,
      description: `${biller} Bill - ${consumerNumber}`,
      status: 'completed',
      customerDetails: { number: consumerNumber },
      operator: biller,
      referenceNumber: `BILL${Date.now()}`
    });

    await transaction.save();

    // Deduct from wallet
    wallet.balance -= parseFloat(amount);
    wallet.totalDebited += parseFloat(amount);
    await wallet.addToMiniStatement('debit', amount, `${biller} Bill`);
    await wallet.save();

    res.json({
      success: true,
      message: 'Bill payment successful',
      data: {
        transaction,
        wallet: {
          balance: wallet.balance
        }
      }
    });

  } catch (error) {
    console.error('Bill Payment Error:', error);
    res.status(500).json({
      success: false,
      message: 'Bill payment failed',
      error: error.message
    });
  }
});

// @route   POST /api/service/govt/pan
// @desc    PAN Card Application
// @access  Private
router.post('/govt/pan', auth, async (req, res) => {
  try {
    const { name, fatherName, dob, address, aadhaar, mobile, email, panType } = req.body;

    const serviceCode = panType === 'new' ? 'PAN_NEW' : 'PAN_CORR';
    const service = await Service.findOne({ code: serviceCode });
    
    if (!service || !service.isActive) {
      return res.status(400).json({
        success: false,
        message: 'PAN service unavailable'
      });
    }

    // Credit service - no wallet deduction
    const wallet = await Wallet.findOne({ user: req.userId });
    const commission = service.retailerCommission;

    // Add commission to wallet
    wallet.balance += commission;
    wallet.totalCredited += commission;
    wallet.todayEarning += commission;
    wallet.totalEarning += commission;
    await wallet.addToMiniStatement('credit', commission, `PAN ${panType} - Commission`);
    await wallet.save();

    // Create transaction
    const transaction = new Transaction({
      transactionId: Transaction.generateTransactionId(),
      user: req.userId,
      service: service._id,
      serviceName: `PAN Card ${panType}`,
      type: 'credit',
      amount: service.baseAmount,
      retailerCommission: commission,
      balanceAfter: wallet.balance,
      description: `PAN Card ${panType} - ${name}`,
      status: 'completed',
      customerDetails: { name, mobile, email },
      referenceNumber: `PAN${Date.now()}`
    });

    await transaction.save();

    // Create commission transaction
    const commissionTransaction = new Transaction({
      transactionId: Transaction.generateTransactionId(),
      user: req.userId,
      service: service._id,
      serviceName: `PAN Card ${panType}`,
      type: 'commission',
      amount: commission,
      balanceAfter: wallet.balance,
      description: `PAN Card ${panType} commission`,
      status: 'completed',
      referenceNumber: transaction.transactionId
    });
    await commissionTransaction.save();

    res.json({
      success: true,
      message: 'PAN application submitted successfully',
      data: {
        transaction,
        commission,
        wallet: {
          balance: wallet.balance,
          todayEarning: wallet.todayEarning
        }
      }
    });

  } catch (error) {
    console.error('PAN Application Error:', error);
    res.status(500).json({
      success: false,
      message: 'PAN application failed',
      error: error.message
    });
  }
});

// @route   POST /api/service/insurance/apply
// @desc    Apply for Insurance
// @access  Private
router.post('/insurance/apply', auth, async (req, res) => {
  try {
    const { type, name, age, mobile, email, sumAssured } = req.body;

    const serviceCode = type === 'life' ? 'LIFE_INS' : type === 'health' ? 'HEALTH_INS' : 'VEH_INS';
    const service = await Service.findOne({ code: serviceCode });
    
    if (!service || !service.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Insurance service unavailable'
      });
    }

    const wallet = await Wallet.findOne({ user: req.userId });
    const commission = service.retailerCommission;

    // Add commission to wallet
    wallet.balance += commission;
    wallet.totalCredited += commission;
    wallet.todayEarning += commission;
    wallet.totalEarning += commission;
    await wallet.addToMiniStatement('credit', commission, `${type} Insurance - Commission`);
    await wallet.save();

    // Create transaction
    const transaction = new Transaction({
      transactionId: Transaction.generateTransactionId(),
      user: req.userId,
      service: service._id,
      serviceName: `${type.charAt(0).toUpperCase() + type.slice(1)} Insurance`,
      type: 'credit',
      amount: 0,
      retailerCommission: commission,
      balanceAfter: wallet.balance,
      description: `${type} Insurance - ${name}`,
      status: 'completed',
      customerDetails: { name, mobile, email },
      referenceNumber: `INS${Date.now()}`
    });

    await transaction.save();

    // Create commission transaction
    const commissionTransaction = new Transaction({
      transactionId: Transaction.generateTransactionId(),
      user: req.userId,
      service: service._id,
      serviceName: `${type} Insurance`,
      type: 'commission',
      amount: commission,
      balanceAfter: wallet.balance,
      description: `${type} Insurance commission`,
      status: 'completed',
      referenceNumber: transaction.transactionId
    });
    await commissionTransaction.save();

    res.json({
      success: true,
      message: 'Insurance application submitted successfully',
      data: {
        transaction,
        commission,
        wallet: {
          balance: wallet.balance,
          todayEarning: wallet.todayEarning
        }
      }
    });

  } catch (error) {
    console.error('Insurance Application Error:', error);
    res.status(500).json({
      success: false,
      message: 'Insurance application failed',
      error: error.message
    });
  }
});

module.exports = router;
