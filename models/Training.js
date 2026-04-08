const mongoose = require('mongoose');

const trainingSchema = new mongoose.Schema({
  // Training Info
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  
  // Trainer
  trainer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Schedule
  scheduledDate: {
    type: Date,
    required: true
  },
  duration: {
    type: Number, // in minutes
    default: 60
  },
  
  // Fee
  fee: {
    type: Number,
    default: 300
  },
  
  // Status
  status: {
    type: String,
    enum: ['scheduled', 'ongoing', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  
  // Room
  roomId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Participants
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'refunded'],
      default: 'pending'
    },
    transactionId: {
      type: String,
      default: null
    }
  }],
  
  maxParticipants: {
    type: Number,
    default: 50
  },
  
  // Recording
  recording: {
    enabled: {
      type: Boolean,
      default: true
    },
    url: {
      type: String,
      default: null
    },
    duration: {
      type: Number,
      default: 0
    }
  },
  
  // Materials
  materials: [{
    name: String,
    url: String,
    type: {
      type: String,
      enum: ['pdf', 'video', 'doc', 'other']
    }
  }],
  
  // Created By
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Generate room ID
trainingSchema.pre('save', function(next) {
  if (!this.roomId) {
    this.roomId = 'TRAIN-' + Date.now().toString(36).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Training', trainingSchema);
