const express = require('express');
const router = express.Router();
const Training = require('../models/Training');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
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

// Middleware to check if trainer
const isTrainer = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user || (user.role !== 'trainer' && user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Trainer only.'
      });
    }

    req.user = user;
    next();

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Authorization failed',
      error: error.message
    });
  }
};

// @route   GET /api/training/sessions
// @desc    Get all training sessions
// @access  Private
router.get('/sessions', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (status) query.status = status;

    const sessions = await Training.find(query)
      .populate('trainer', 'name')
      .populate('participants.user', 'name')
      .sort({ scheduledDate: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Training.countDocuments(query);

    res.json({
      success: true,
      data: {
        sessions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get Sessions Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get training sessions',
      error: error.message
    });
  }
});

// @route   GET /api/training/sessions/:id
// @desc    Get training session details
// @access  Private
router.get('/sessions/:id', auth, async (req, res) => {
  try {
    const session = await Training.findById(req.params.id)
      .populate('trainer', 'name email mobile')
      .populate('participants.user', 'name mobile')
      .populate('createdBy', 'name');

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Training session not found'
      });
    }

    res.json({
      success: true,
      data: { session }
    });

  } catch (error) {
    console.error('Get Session Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get training session',
      error: error.message
    });
  }
});

// @route   POST /api/training/sessions
// @desc    Create new training session (Trainer/Admin)
// @access  Private (Trainer/Admin)
router.post('/sessions', auth, isTrainer, async (req, res) => {
  try {
    const { title, description, scheduledDate, duration, fee, maxParticipants } = req.body;

    const session = new Training({
      title,
      description,
      trainer: req.userId,
      scheduledDate,
      duration: duration || 60,
      fee: fee || 300,
      maxParticipants: maxParticipants || 50,
      createdBy: req.userId
    });

    await session.save();

    res.status(201).json({
      success: true,
      message: 'Training session created successfully',
      data: { session }
    });

  } catch (error) {
    console.error('Create Session Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create training session',
      error: error.message
    });
  }
});

// @route   POST /api/training/sessions/:id/join
// @desc    Join training session
// @access  Private
router.post('/sessions/:id/join', auth, async (req, res) => {
  try {
    const session = await Training.findById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Training session not found'
      });
    }

    // Check if already joined
    const alreadyJoined = session.participants.find(
      p => p.user.toString() === req.userId
    );

    if (alreadyJoined) {
      return res.json({
        success: true,
        message: 'Already joined this session',
        data: {
          session,
          roomId: session.roomId
        }
      });
    }

    // Check if session is full
    if (session.participants.length >= session.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: 'Session is full'
      });
    }

    // Check wallet balance for fee
    const wallet = await Wallet.findOne({ user: req.userId });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    if (wallet.balance < session.fee) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance for training fee',
        data: {
          required: session.fee,
          available: wallet.balance
        }
      });
    }

    // Deduct fee from wallet
    wallet.balance -= session.fee;
    wallet.totalDebited += session.fee;
    await wallet.addToMiniStatement('debit', session.fee, `Training: ${session.title}`);
    await wallet.save();

    // Create transaction
    const transaction = new Transaction({
      transactionId: Transaction.generateTransactionId(),
      user: req.userId,
      type: 'debit',
      amount: session.fee,
      balanceAfter: wallet.balance,
      description: `Training fee: ${session.title}`,
      status: 'completed',
      referenceNumber: session.roomId
    });
    await transaction.save();

    // Add participant
    session.participants.push({
      user: req.userId,
      paymentStatus: 'completed',
      transactionId: transaction.transactionId
    });

    await session.save();

    res.json({
      success: true,
      message: 'Successfully joined training session',
      data: {
        session,
        roomId: session.roomId,
        transaction
      }
    });

  } catch (error) {
    console.error('Join Session Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join training session',
      error: error.message
    });
  }
});

// @route   PUT /api/training/sessions/:id/start
// @desc    Start training session
// @access  Private (Trainer)
router.put('/sessions/:id/start', auth, isTrainer, async (req, res) => {
  try {
    const session = await Training.findById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Training session not found'
      });
    }

    // Check if user is the trainer
    if (session.trainer.toString() !== req.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned trainer can start this session'
      });
    }

    session.status = 'ongoing';
    await session.save();

    res.json({
      success: true,
      message: 'Training session started',
      data: { session }
    });

  } catch (error) {
    console.error('Start Session Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start training session',
      error: error.message
    });
  }
});

// @route   PUT /api/training/sessions/:id/end
// @desc    End training session
// @access  Private (Trainer)
router.put('/sessions/:id/end', auth, isTrainer, async (req, res) => {
  try {
    const { recordingUrl } = req.body;
    const session = await Training.findById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Training session not found'
      });
    }

    // Check if user is the trainer
    if (session.trainer.toString() !== req.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned trainer can end this session'
      });
    }

    session.status = 'completed';
    if (recordingUrl) {
      session.recording.url = recordingUrl;
    }
    await session.save();

    res.json({
      success: true,
      message: 'Training session ended',
      data: { session }
    });

  } catch (error) {
    console.error('End Session Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end training session',
      error: error.message
    });
  }
});

// @route   GET /api/training/my-sessions
// @desc    Get user's training sessions
// @access  Private
router.get('/my-sessions', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    let sessions;
    if (user.role === 'trainer') {
      // Get sessions where user is trainer
      sessions = await Training.find({ trainer: req.userId })
        .populate('participants.user', 'name')
        .sort({ scheduledDate: -1 });
    } else {
      // Get sessions where user is participant
      sessions = await Training.find({
        'participants.user': req.userId
      })
        .populate('trainer', 'name')
        .sort({ scheduledDate: -1 });
    }

    res.json({
      success: true,
      data: { sessions }
    });

  } catch (error) {
    console.error('Get My Sessions Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get training sessions',
      error: error.message
    });
  }
});

// @route   GET /api/training/room/:roomId
// @desc    Get room details for video call
// @access  Private
router.get('/room/:roomId', auth, async (req, res) => {
  try {
    const session = await Training.findOne({ roomId: req.params.roomId })
      .populate('trainer', 'name')
      .populate('participants.user', 'name');

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    // Check if user is participant or trainer
    const isParticipant = session.participants.some(
      p => p.user._id.toString() === req.userId
    );
    const isTrainer = session.trainer._id.toString() === req.userId;

    if (!isParticipant && !isTrainer) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to join this room'
      });
    }

    res.json({
      success: true,
      data: {
        session,
        isTrainer
      }
    });

  } catch (error) {
    console.error('Get Room Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get room details',
      error: error.message
    });
  }
});

// @route   DELETE /api/training/sessions/:id
// @desc    Delete training session
// @access  Private (Trainer/Admin)
router.delete('/sessions/:id', auth, isTrainer, async (req, res) => {
  try {
    const session = await Training.findById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Training session not found'
      });
    }

    // Check if user is the trainer or admin
    if (session.trainer.toString() !== req.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned trainer or admin can delete this session'
      });
    }

    await Training.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Training session deleted successfully'
    });

  } catch (error) {
    console.error('Delete Session Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete training session',
      error: error.message
    });
  }
});

module.exports = router;
