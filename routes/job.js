const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Job = require('../models/Job');
const User = require('../models/User');
const { verifyToken } = require('../utils/jwt');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/documents/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images, PDF, and DOC files are allowed'));
  }
});

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

// Middleware to check if staff
const isStaff = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user || (user.role !== 'staff' && user.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Staff only.'
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

// @route   POST /api/job/upload
// @desc    Upload new job (Staff)
// @access  Private (Staff)
router.post('/upload', auth, isStaff, upload.array('documents', 5), async (req, res) => {
  try {
    const { title, description, type, customerName, customerMobile, customerEmail, amount } = req.body;

    // Process uploaded files
    const documents = req.files ? req.files.map(file => ({
      name: file.originalname,
      url: `/uploads/documents/${file.filename}`,
      type: file.mimetype.includes('pdf') ? 'pdf' : 
            file.mimetype.includes('image') ? 'image' : 'doc'
    })) : [];

    const job = new Job({
      title,
      description,
      type: type || 'other',
      customerName,
      customerMobile,
      customerEmail,
      amount: amount || 0,
      documents,
      uploadedBy: req.userId,
      status: 'pending'
    });

    await job.save();

    res.status(201).json({
      success: true,
      message: 'Job uploaded successfully',
      data: { job }
    });

  } catch (error) {
    console.error('Upload Job Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload job',
      error: error.message
    });
  }
});

// @route   GET /api/job/list
// @desc    Get all jobs
// @access  Private
router.get('/list', auth, async (req, res) => {
  try {
    const { status, myJobs, page = 1, limit = 20 } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (myJobs === 'true') {
      const user = await User.findById(req.userId);
      if (user.role === 'trainer') {
        query.assignedTo = req.userId;
      } else if (user.role === 'staff') {
        query.uploadedBy = req.userId;
      }
    }

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

// @route   GET /api/job/:id
// @desc    Get job details
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('uploadedBy', 'name')
      .populate('assignedTo', 'name')
      .populate('trainer', 'name')
      .populate('convertedOutput.convertedBy', 'name');

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    res.json({
      success: true,
      data: { job }
    });

  } catch (error) {
    console.error('Get Job Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get job',
      error: error.message
    });
  }
});

// @route   PUT /api/job/:id/assign
// @desc    Assign job to trainer (Admin/Staff)
// @access  Private (Staff/Admin)
router.put('/:id/assign', auth, isStaff, async (req, res) => {
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
      message: 'Job assigned to trainer successfully',
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

// @route   PUT /api/job/:id/convert
// @desc    Upload converted output (Trainer)
// @access  Private (Trainer)
router.put('/:id/convert', auth, upload.single('convertedFile'), async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if user is the assigned trainer
    if (job.assignedTo?.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned trainer can convert this job'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No converted file uploaded'
      });
    }

    job.convertedOutput = {
      url: `/uploads/documents/${req.file.filename}`,
      type: req.file.mimetype.includes('pdf') ? 'pdf' : 'doc',
      convertedAt: new Date(),
      convertedBy: req.userId
    };
    job.status = 'converted';
    await job.save();

    res.json({
      success: true,
      message: 'Job converted successfully',
      data: { job }
    });

  } catch (error) {
    console.error('Convert Job Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to convert job',
      error: error.message
    });
  }
});

// @route   PUT /api/job/:id/complete
// @desc    Mark job as completed
// @access  Private (Staff/Admin)
router.put('/:id/complete', auth, isStaff, async (req, res) => {
  try {
    const { remarks } = req.body;

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    job.status = 'completed';
    job.completedAt = new Date();
    if (remarks) job.remarks = remarks;
    await job.save();

    res.json({
      success: true,
      message: 'Job marked as completed',
      data: { job }
    });

  } catch (error) {
    console.error('Complete Job Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete job',
      error: error.message
    });
  }
});

// @route   PUT /api/job/:id/video-session
// @desc    Update video session details
// @access  Private (Trainer)
router.put('/:id/video-session', auth, async (req, res) => {
  try {
    const { roomId, startedAt, endedAt, recordingUrl } = req.body;

    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Check if user is the assigned trainer
    if (job.assignedTo?.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned trainer can update video session'
      });
    }

    job.videoSession = {
      roomId,
      startedAt,
      endedAt,
      recordingUrl
    };
    await job.save();

    res.json({
      success: true,
      message: 'Video session updated',
      data: { job }
    });

  } catch (error) {
    console.error('Video Session Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update video session',
      error: error.message
    });
  }
});

// @route   DELETE /api/job/:id
// @desc    Delete job
// @access  Private (Admin/Staff who uploaded)
router.delete('/:id', auth, isStaff, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Only admin or the staff who uploaded can delete
    if (req.user.role !== 'admin' && job.uploadedBy.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete jobs you uploaded'
      });
    }

    await Job.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Job deleted successfully'
    });

  } catch (error) {
    console.error('Delete Job Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete job',
      error: error.message
    });
  }
});

module.exports = router;
