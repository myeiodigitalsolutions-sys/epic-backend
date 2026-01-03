const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  classId: {
    type: String,
    required: true
  },
  staffId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['assignment', 'meeting'], // Only two main types
    default: 'assignment'
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  assignmentType: {
    type: String,
    enum: ['question', 'mcq', 'meet-google', 'meet-zoom', 'meet-teams'], // Specific meeting types here
    required: true
  },
  question: {
    type: String,
    default: null
  },
  dueDate: {
    type: Date,
    default: null
  },
  questions: {
    type: Array,
    default: null
  },
  meetTime: {
    type: String,
    default: null
  },
  meetLink: {
    type: String,
    default: null,
    validate: {
      validator: function(v) {
        // Only validate if assignmentType is a meeting type
        if (this.assignmentType && this.assignmentType.startsWith('meet-') && v) {
          try {
            new URL(v);
            return true;
          } catch (e) {
            return false;
          }
        }
        return true;
      },
      message: 'Please provide a valid URL for meetLink'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Virtual field for determining if it's a meeting
assignmentSchema.virtual('isMeeting').get(function() {
  return this.assignmentType.startsWith('meet-');
});

// Method to get meeting platform
assignmentSchema.methods.getMeetingPlatform = function() {
  if (this.assignmentType.startsWith('meet-')) {
    return this.assignmentType.replace('meet-', ''); // Returns 'google', 'zoom', or 'teams'
  }
  return null;
};

// Update the updatedAt field on save
assignmentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Set type based on assignmentType
  if (this.assignmentType.startsWith('meet-')) {
    this.type = 'meeting';
  } else {
    this.type = 'assignment';
  }
  
  // Validate meeting-specific fields
  if (this.assignmentType.startsWith('meet-')) {
    if (!this.meetLink) {
      const err = new Error('Meeting assignments must have a meetLink');
      return next(err);
    }
  }
  
  next();
});

// Pre-update hook for findOneAndUpdate operations
assignmentSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  
  const update = this.getUpdate();
  
  // If assignmentType is being updated to a meeting type, ensure type is set to 'meeting'
  if (update.assignmentType && update.assignmentType.startsWith('meet-')) {
    update.type = 'meeting';
  } else if (update.assignmentType && (update.assignmentType === 'question' || update.assignmentType === 'mcq')) {
    update.type = 'assignment';
  }
  
  next();
});

module.exports = mongoose.model('Assignment', assignmentSchema);