// models/student.model.js
const mongoose = require('mongoose');

const studentV2Schema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, default: 'student' },
  exams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Exam' }]
}, { timestamps: true });

module.exports =
  mongoose.models.StudentV2 ||
  mongoose.model('StudentV2', studentV2Schema);
