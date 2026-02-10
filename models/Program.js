const mongoose = require('mongoose');

const programSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Program name is required'],
    trim: true,
    unique: true
  },
  semester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Semester',
    required: [true, 'Semester is required']
  },
  subjects: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    assignedStaff: [{
      staffId: String,
      staffName: String,
      staffEmail: String,
      staffDepartment: String,
      role: {
        type: String,
        default: 'Instructor'
      },
      assignedAt: {
        type: Date,
        default: Date.now
      }
    }],
    enrolledStudents: [{
      studentId: String,
      studentName: String,
      studentEmail: String,
      regNo: String,
      enrolledAt: {
        type: Date,
        default: Date.now
      }
    }],
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
programSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Update subject updatedAt when modified
programSchema.pre('findOneAndUpdate', function(next) {
  if (this._update.$set && this._update.$set['subjects.$[elem].updatedAt']) {
    this._update.$set['subjects.$[elem].updatedAt'] = new Date();
  }
  next();
});

const Program = mongoose.model('Program', programSchema);

module.exports = Program;