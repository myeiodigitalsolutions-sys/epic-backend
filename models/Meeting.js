const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class'
    // Remove required: true to make it optional
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program.subjects'
  },
  programId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Program'
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  meetingType: {
    type: String,
    enum: ['meet-google', 'meet-zoom', 'meet-teams', 'other'],
    required: true
  },
  meetingLink: {
    type: String,
    required: true,
    trim: true
  },
  scheduledTime: {
    type: String,
    default: ''
  },
  scheduledDate: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    staffId: String,
    staffName: String,
    staffEmail: String
  },
  status: {
    type: String,
    enum: ['scheduled', 'live', 'ended', 'cancelled'],
    default: 'scheduled'
  },
  startTime: {
    type: Date
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number, // in minutes
    default: 0
  },
  attendees: [{
    studentId: String,
    studentName: String,
    studentEmail: String,
    regNo: String,
    joinTime: Date,
    leaveTime: Date,
    duration: Number, // in minutes
    status: {
      type: String,
      enum: ['joined', 'left', 'absent'],
      default: 'absent'
    }
  }],
  totalAttendees: {
    type: Number,
    default: 0
  },
  maxAttendees: {
    type: Number
  },
  notes: {
    type: String,
    default: ''
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

// Add a custom validation to ensure either classId or subjectId is present
meetingSchema.pre('validate', function(next) {
  if (!this.classId && !this.subjectId) {
    this.invalidate('classId', 'Either classId or subjectId is required');
    this.invalidate('subjectId', 'Either classId or subjectId is required');
  }
  next();
});

// Update updatedAt timestamp
meetingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Meeting', meetingSchema);