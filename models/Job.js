const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  // Job Info
  jobId: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  
  // Job Type
  type: {
    type: String,
    enum: ['document', 'certificate', 'application', 'verification', 'other'],
    default: 'other'
  },
  
  // Customer Details
  customerName: {
    type: String,
    required: true
  },
  customerMobile: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String,
    default: ''
  },
  
  // Documents
  documents: [{
    name: String,
    url: String,
    type: {
      type: String,
      enum: ['pdf', 'image', 'doc', 'other']
    }
  }],
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'assigned', 'processing', 'converted', 'completed', 'rejected'],
    default: 'pending'
  },
  
  // Amount
  amount: {
    type: Number,
    default: 0
  },
  
  // Assigned To
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedAt: {
    type: Date,
    default: null
  },
  
  // Converted Output
  convertedOutput: {
    url: String,
    type: String,
    convertedAt: Date,
    convertedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Trainer (for training-related jobs)
  trainer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Video Call Session
  videoSession: {
    roomId: String,
    startedAt: Date,
    endedAt: Date,
    recordingUrl: String
  },
  
  // Remarks
  remarks: {
    type: String,
    default: ''
  },
  
  // Uploaded By (Staff)
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Completed At
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Generate Job ID
jobSchema.pre('save', function(next) {
  if (!this.jobId) {
    const prefix = 'JOB';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.jobId = `${prefix}-${timestamp}-${random}`;
  }
  next();
});

module.exports = mongoose.model('Job', jobSchema);
