// models/staff.model.js
const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema(
  {
    uid: {
      type: String,
      required: true,
      unique: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    role: {
      type: String,
      default: 'staff'
    },
    exams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exam'
      }
    ]
  },
  {
    timestamps: true
  }
);

// ✅ IMPORTANT: unique model name + overwrite-safe export
module.exports =
  mongoose.models.StaffV2 || mongoose.model('StaffV2', staffSchema);
