// models/submission.model.js
const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    uid: {
      type: String,
      required: true
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true
    },
    fileUrl: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// ✅ overwrite-safe model export
module.exports =
  mongoose.models.Submission ||
  mongoose.model('Submission', submissionSchema);
