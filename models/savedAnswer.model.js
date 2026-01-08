const mongoose = require('mongoose');

const savedAnswerSchema = new mongoose.Schema({
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true,
  },
  uid: {
    type: String,
    required: true,
  },
  userAnswers: {
    type: Object,
    default: {},
  },
  uploadedFileUrls: {
    type: Object,
    default: {},
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure unique combination of examId and uid
savedAnswerSchema.index({ examId: 1, uid: 1 }, { unique: true });

savedAnswerSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('SavedAnswer', savedAnswerSchema);