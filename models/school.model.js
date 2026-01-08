const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  programs: [{
    name: { type: String, required: true },
    semesters: [{
      name: { type: String, required: true },
      students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
      exams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Exam' }],
    }],
  }],
}, { timestamps: true });

module.exports = mongoose.model('School', schoolSchema);