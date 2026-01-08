// exam.controller.js
const Exam = require('../models/exam.model');
const School = require('../models/school.model');
const Student = require('../models/student.model');
const Staff = require('../models/StaffV2');
const Submission = require('../models/submission.model');
const ExamReport = require('../models/examReport.model');
const SavedAnswer = require('../models/savedAnswer.model'); // Add new model
const admin = require('../firebaseAdmin');
const multer = require('multer');
const archiver = require('archiver');
const { Readable } = require('stream');

// Helper function to get school and semester by semesterId (classId)
async function getSchoolAndSemester(classId) {
  const school = await School.findOne({ 'programs.semesters._id': classId });
  if (!school) return null;

  let semester;
  let programIndex, semesterIndex;
  for (programIndex = 0; programIndex < school.programs.length; programIndex++) {
    const program = school.programs[programIndex];
    semesterIndex = program.semesters.findIndex(s => s._id.toString() === classId.toString());
    if (semesterIndex !== -1) {
      semester = program.semesters[semesterIndex];
      break;
    }
  }

  if (!semester) return null;
  return { school, semester, programIndex, semesterIndex };
}

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only PDF, JPG, PNG, DOC, DOCX files are allowed'), false);
    }
    cb(null, true);
  }
}).fields([{ name: 'questionFiles[0]', maxCount: 1 }, { name: 'questionFiles[1]', maxCount: 1 }, { name: 'questionFiles[2]', maxCount: 1 }, { name: 'questionFiles[3]', maxCount: 1 }, { name: 'questionFiles[4]', maxCount: 1 }, { name: 'questionFiles[5]', maxCount: 1 }, { name: 'questionFiles[6]', maxCount: 1 }, { name: 'questionFiles[7]', maxCount: 1 }, { name: 'questionFiles[8]', maxCount: 1 }, { name: 'questionFiles[9]', maxCount: 1 }]);

// Multer for single file upload (student files)
const uploadStudentFile = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only PDF, JPG, PNG, DOC, DOCX files are allowed'), false);
    }
    cb(null, true);
  }
}).single('file');

// Multer for report file upload
const uploadReportFile = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit for reports
}).single('reportFile');

// Initialize Firebase Storage bucket
const bucket = admin.storage().bucket();

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err.message);
    return res.status(400).json({ error: `Multer error: ${err.message}` });
  }
  if (err.message.includes('Only PDF, JPG, PNG, DOC, DOCX files are allowed') || err.message.includes('Only PDF files are allowed')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
};

// Get all exams
exports.getAllExams = async (req, res) => {
  try {
    const exams = await Exam.find({}).lean();
    res.json(exams);
  } catch (error) {
    console.error('Error fetching exams:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get exam by ID
exports.getExamById = async (req, res) => {
  const { examId } = req.params;
  try {
    const exam = await Exam.findById(examId).lean();
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json(exam);
  } catch (error) {
    console.error('Error fetching exam:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get exam questions
exports.getExamQuestions = async (req, res) => {
  const { examId } = req.params;
  try {
    const exam = await Exam.findById(examId).select('questions').lean();
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    res.json(exam.questions);
  } catch (error) {
    console.error('Error fetching exam questions:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create a new exam
exports.createExam = [upload, handleMulterError, async (req, res) => {
  const { title, class: classId, startDate, endDate, duration, uploadDuration, questions } = req.body;

  try {
    let parsedQuestions = [];
    try {
      parsedQuestions = JSON.parse(questions);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid questions format' });
    }

    // Validate questions
    if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
      return res.status(400).json({ error: 'At least one question is required' });
    }

    parsedQuestions.forEach(q => {
      if (!q.description) {
        throw new Error('All questions must have a description');
      }
      if (q.type === 'mcq' && (!q.options || q.options.length < 2)) {
        throw new Error('MCQ questions must have at least 2 options');
      }
      if (q.type === 'file' && !q.fileTypesAllowed) {
        q.fileTypesAllowed = {
          pdf: true,
          doc: false,
          docx: false,
          jpg: true,
          png: true
        };
      }
    });

    // Handle file uploads only for file-type questions
    const files = req.files;
    if (files) {
      const uploadPromises = Object.entries(files).map(([fieldName, fileArray]) => {
        const file = fileArray[0];
        const match = fieldName.match(/questionFiles\[(\d+)\]/);
        if (!match) return;
        const index = match[1];
        if (!parsedQuestions[index] || parsedQuestions[index].type !== 'file') return;
        return new Promise((resolve, reject) => {
          const filename = `exam-questions/${Date.now()}-${file.originalname}`;
          const blob = bucket.file(filename);
          const blobStream = blob.createWriteStream({
            metadata: { contentType: file.mimetype }
          });
          blobStream.on('error', reject);
          blobStream.on('finish', async () => {
            await blob.makePublic();
            const url = `https://storage.googleapis.com/${bucket.name}/${filename}`;
            resolve({ index: parseInt(index), url, fileType: file.mimetype });
          });
          blobStream.end(file.buffer);
        });
      }).filter(Boolean);

      const uploadedFiles = await Promise.all(uploadPromises);
      uploadedFiles.forEach(({ index, url, fileType }) => {
        if (parsedQuestions[index]) {
          parsedQuestions[index].fileUrl = url;
          parsedQuestions[index].fileType = fileType;
        }
      });
    }

    // Create exam
    const exam = new Exam({
      title,
      class: classId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      duration: parseInt(duration),
      uploadDuration: parseInt(uploadDuration),
      questions: parsedQuestions
    });
    await exam.save();
    console.log('Exam saved to MongoDB:', exam._id);

    // Add to semester (class)
    const result = await getSchoolAndSemester(classId);
    if (!result) {
      return res.status(404).json({ error: 'Class not found' });
    }
    const { school, semester } = result;
    semester.exams.push(exam._id);
    await school.save();
    console.log('Exam added to class:', classId);

    // Add to students
    if (semester.students && semester.students.length > 0) {
      const students = await Student.find({ _id: { $in: semester.students } });
      for (const student of students) {
        student.exams.push(exam._id);
        await student.save();
        console.log('Exam added to student:', student.uid);
      }
    }

    // Add to all staff
    const staffs = await Staff.find({});
    for (const staff of staffs) {
      staff.exams.push(exam._id);
      await staff.save();
      console.log('Exam added to staff:', staff.uid);
    }

    res.status(201).json(exam);
  } catch (error) {
    console.error('Error creating exam:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message).join(', ');
      return res.status(400).json({ error: messages });
    }
    res.status(400).json({ error: error.message });
  }
}];

// Update an exam
exports.updateExam = [upload, handleMulterError, async (req, res) => {
  const { id } = req.params;
  const { title, class: classId, startDate, endDate, duration, uploadDuration, questions } = req.body;

  try {
    const oldExam = await Exam.findById(id);
    if (!oldExam) {
      console.log('Exam not found for ID:', id);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const oldClassId = oldExam.class.toString();

    let parsedQuestions = [];
    try {
      parsedQuestions = JSON.parse(questions);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid questions format' });
    }

    parsedQuestions.forEach(q => {
      if (!q.description) {
        throw new Error('All questions must have a description');
      }
      if (q.type === 'mcq' && (!q.options || q.options.length < 2)) {
        throw new Error('MCQ questions must have at least 2 options');
      }
      if (q.type === 'file' && !q.fileTypesAllowed) {
        q.fileTypesAllowed = {
          pdf: true,
          doc: false,
          docx: false,
          jpg: true,
          png: true
        };
      }
    });

    // Handle file uploads only for file-type questions
    const files = req.files;
    if (files) {
      const uploadPromises = Object.entries(files).map(([fieldName, fileArray]) => {
        const file = fileArray[0];
        const match = fieldName.match(/questionFiles\[(\d+)\]/);
        if (!match) return;
        const index = match[1];
        if (!parsedQuestions[index] || parsedQuestions[index].type !== 'file') return;
        return new Promise((resolve, reject) => {
          const filename = `exam-questions/${Date.now()}-${file.originalname}`;
          const blob = bucket.file(filename);
          const blobStream = blob.createWriteStream({
            metadata: { contentType: file.mimetype }
          });
          blobStream.on('error', reject);
          blobStream.on('finish', async () => {
            await blob.makePublic();
            const url = `https://storage.googleapis.com/${bucket.name}/${filename}`;
            resolve({ index: parseInt(index), url, fileType: file.mimetype });
          });
          blobStream.end(file.buffer);
        });
      }).filter(Boolean);

      const uploadedFiles = await Promise.all(uploadPromises);
      uploadedFiles.forEach(({ index, url, fileType }) => {
        if (parsedQuestions[index]) {
          parsedQuestions[index].fileUrl = url;
          parsedQuestions[index].fileType = fileType;
        }
      });
    }

    // Update exam fields
    oldExam.title = title;
    oldExam.class = classId;
    oldExam.startDate = new Date(startDate);
    oldExam.endDate = new Date(endDate);
    oldExam.duration = parseInt(duration);
    oldExam.uploadDuration = parseInt(uploadDuration);
    oldExam.questions = parsedQuestions;
    await oldExam.save();

    // Handle class change
    const newResult = await getSchoolAndSemester(classId);
    if (!newResult) {
      return res.status(404).json({ error: 'Class not found' });
    }
    const { school: newSchool, semester: newSemester } = newResult;

    if (oldClassId !== classId) {
      // Remove from old semester
      const oldResult = await getSchoolAndSemester(oldClassId);
      if (oldResult) {
        const { school: oldSchool, semester: oldSemester } = oldResult;
        oldSemester.exams = oldSemester.exams.filter(e => e.toString() !== id);
        await oldSchool.save();

        // Remove from old students
        const oldStudents = await Student.find({ _id: { $in: oldSemester.students } });
        for (const student of oldStudents) {
          student.exams = student.exams.filter(e => e.toString() !== id);
          await student.save();
        }
      }

      // Add to new semester
      newSemester.exams.push(id);
      await newSchool.save();

      // Add to new students
      const newStudents = await Student.find({ _id: { $in: newSemester.students } });
      for (const student of newStudents) {
        if (!student.exams.some(e => e.toString() === id)) {
          student.exams.push(id);
          await student.save();
        }
      }
    } else {
      // If same class, ensure added (though should be)
      if (!newSemester.exams.some(e => e.toString() === id)) {
        newSemester.exams.push(id);
        await newSchool.save();
      }
    }


    res.json(oldExam);
  } catch (error) {
    console.error('Error updating exam:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message).join(', ');
      return res.status(400).json({ error: messages });
    }
    res.status(400).json({ error: error.message });
  }
}];

// Delete an exam
exports.deleteExam = async (req, res) => {
  const { id } = req.params;
  try {
    const exam = await Exam.findById(id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    const classId = exam.class.toString();

    // Remove from semester
    const result = await getSchoolAndSemester(classId);
    if (result) {
      const { school, semester } = result;
      semester.exams = semester.exams.filter(e => e.toString() !== id);
      await school.save();
    }

    // Remove from students (all who have it)
    const students = await Student.find({ exams: id });
    for (const student of students) {
      student.exams.pull(id);
      await student.save();
    }

    // Remove from staff
    const staffs = await Staff.find({ exams: id });
    for (const staff of staffs) {
      staff.exams.pull(id);
      await staff.save();
    }

    // Delete submissions and reports
    await Submission.deleteMany({ examId: id });
    await ExamReport.deleteMany({ examId: id });

    // Delete exam
    await Exam.findByIdAndDelete(id);

    res.json({ message: 'Exam deleted successfully' });
  } catch (error) {
    console.error('Error deleting exam:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Upload student file
exports.uploadStudentFile = [uploadStudentFile, handleMulterError, async (req, res) => {
  const { examId, questionId, uid } = req.body;
  try {
    const student = await Student.findOne({ uid });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const filename = `student-submissions/${examId}/${uid}/${Date.now()}-${req.file.originalname}`;
    const blob = bucket.file(filename);
    const blobStream = blob.createWriteStream({
      metadata: { contentType: req.file.mimetype }
    });

    blobStream.on('error', (err) => {
      console.error('Upload stream error:', err);
      res.status(500).json({ error: 'Failed to upload file' });
    });

    blobStream.on('finish', async () => {
      await blob.makePublic();
      const fileUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
      console.log('Student file uploaded to Firebase:', fileUrl);

      const submission = new Submission({
        examId,
        questionId,
        uid,
        studentId: student._id,
        fileUrl
      });
      await submission.save();
      console.log('Submission saved to MongoDB:', submission._id);

      res.json({ fileUrl });
    });

    blobStream.end(req.file.buffer);
  } catch (error) {
    console.error('Error uploading student file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
}];

// Get student submissions
exports.getStudentSubmissions = async (req, res) => {
  const { examId, uid } = req.params;
  try {
    console.log(`Fetching submissions for exam ID: ${examId}, UID: ${uid}`);
    const exam = await Exam.findById(examId);
    if (!exam) {
      console.log(`Exam not found for ID: ${examId}`);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const student = await Student.findOne({ uid });
    if (!student) {
      console.log(`Student not found for UID: ${uid}`);
      return res.status(404).json({ error: 'Student not found' });
    }

    const submissions = await Submission.find({ examId, uid })
      .populate('studentId', 'name uid email')
      .lean();

    if (!submissions || submissions.length === 0) {
      console.log(`No submissions found for exam ID: ${examId}, UID: ${uid}`);
      return res.json([]); // Return empty array instead of 404 to match frontend expectation
    }

    console.log(`Found ${submissions.length} submissions for exam ID: ${examId}, UID: ${uid}`);
    res.json(submissions);
  } catch (error) {
    console.error(`Error fetching submissions for exam ID: ${examId}, UID: ${uid}:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Get students by exam submissions
exports.getStudentsByExamSubmissions = async (req, res) => {
  const { examId } = req.params;
  try {
    console.log(`Fetching students for exam ID: ${examId}`);
    const exam = await Exam.findById(examId);
    if (!exam) {
      console.log(`Exam not found for ID: ${examId}`);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const classId = exam.class.toString();
    const result = await getSchoolAndSemester(classId);
    if (!result) {
      console.log(`No class associated with exam ID: ${examId}`);
      return res.status(404).json({ error: 'No class associated with this exam' });
    }
    const { semester } = result;

    const students = await Student.find({ _id: { $in: semester.students } })
      .select('email uid')
      .lean();

    const reports = await ExamReport.find({ examId }).lean();
    const reportsByUid = reports.reduce((acc, report) => {
      acc[report.uid] = report;
      return acc;
    }, {});

    const studentsWithAttendance = students.map((student) => ({
      _id: student._id,
      email: student.email,
      uid: student.uid,
      attended: !!reportsByUid[student.uid]?.completed, 
    }));

    console.log(`Found ${studentsWithAttendance.length} students for exam ID: ${examId}`);
    res.json(studentsWithAttendance);
  } catch (error) {
    console.error(`Error fetching students for exam ID: ${examId}:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Download all submissions as a ZIP file
exports.downloadAllSubmissions = async (req, res) => {
  const { examId } = req.params;
  try {
    console.log(`Fetching all submissions for exam ID: ${examId}`);
    const exam = await Exam.findById(examId).select('title');
    if (!exam) {
      console.log(`Exam not found for ID: ${examId}`);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const submissions = await Submission.find({ examId })
      .populate('studentId', 'name email uid')
      .lean();

    if (!submissions || submissions.length === 0) {
      console.log(`No submissions found for exam ID: ${examId}`);
      return res.status(404).json({ error: 'No submissions found for this exam' });
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const sanitizedExamTitle = exam.title.replace(/[^a-zA-Z0-9-_]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${sanitizedExamTitle}_submissions.zip`);

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.status(500).json({ error: 'Failed to create ZIP file' });
    });

    archive.pipe(res);

    for (const submission of submissions) {
      const fileUrl = submission.fileUrl;
      if (!fileUrl) continue;

      try {
        const filePath = fileUrl.split(`${bucket.name}/`)[1];
        if (!filePath) {
          console.warn(`Invalid file URL for submission: ${fileUrl}`);
          continue;
        }

        const file = bucket.file(filePath);
        const [metadata] = await file.getMetadata();
        const fileName = `${submission.studentId.name || submission.studentId.uid}_Q${submission.questionId}_${filePath.split('/').pop()}`;
        
        const [fileBuffer] = await file.download();
        archive.append(Readable.from(fileBuffer), { name: fileName });
        console.log(`Added file to ZIP: ${fileName}`);
      } catch (err) {
        console.warn(`Failed to download file ${fileUrl}:`, err.message);
      }
    }

    await archive.finalize();
    console.log(`ZIP file created for exam ID: ${examId}`);
  } catch (error) {
    console.error(`Error downloading submissions for exam ID: ${examId}:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Download all reports as a ZIP file
exports.downloadAllReports = async (req, res) => {
  const { examId } = req.params;
  try {
    console.log(`Fetching all reports for exam ID: ${examId}`);
    const exam = await Exam.findById(examId).select('title');
    if (!exam) {
      console.log(`Exam not found for ID: ${examId}`);
      return res.status(404).json({ error: 'Exam not found' });
    }

    const reports = await ExamReport.find({ examId })
      .populate('studentId', 'name email uid')
      .lean();

    if (!reports || reports.length === 0) {
      console.log(`No reports found for exam ID: ${examId}`);
      return res.status(404).json({ error: 'No reports found for this exam' });
    }

    const archive = archiver('zip', { zlib: { level: 9 } });
    const sanitizedExamTitle = exam.title.replace(/[^a-zA-Z0-9-_]/g, '_');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${sanitizedExamTitle}_reports.zip`);

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.status(500).json({ error: 'Failed to create ZIP file' });
    });

    archive.pipe(res);

    for (const report of reports) {
      const fileUrl = report.reportUrl;
      if (!fileUrl) continue;

      try {
        const filePath = fileUrl.split(`${bucket.name}/`)[1];
        if (!filePath) {
          console.warn(`Invalid file URL for report: ${fileUrl}`);
          continue;
        }

        const file = bucket.file(filePath);
        const [metadata] = await file.getMetadata();
        const fileName = `${report.studentId.name || report.studentId.uid}_ExamReport_${filePath.split('/').pop()}`;
        
        const [fileBuffer] = await file.download();
        archive.append(Readable.from(fileBuffer), { name: fileName });
        console.log(`Added report to ZIP: ${fileName}`);
      } catch (err) {
        console.warn(`Failed to download report ${fileUrl}:`, err.message);
      }
    }

    await archive.finalize();
    console.log(`ZIP file created for exam ID: ${examId}`);
  } catch (error) {
    console.error(`Error downloading reports for exam ID: ${examId}:`, error.message);
    res.status(500).json({ error: `Server error: ${error.message}` });
  }
};

// Upload exam report (assuming implementation based on context)
exports.uploadExamReport = [uploadReportFile, handleMulterError, async (req, res) => {
  const { examId } = req.params;
  const { uid } = req.body; // Assuming uid is sent in body
  try {
    const student = await Student.findOne({ uid });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const filename = `exam-reports/${examId}/${uid}/${Date.now()}-${req.file.originalname}`;
    const blob = bucket.file(filename);
    const blobStream = blob.createWriteStream({
      metadata: { contentType: req.file.mimetype }
    });

    blobStream.on('error', (err) => {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Failed to upload report' });
    });

    blobStream.on('finish', async () => {
      await blob.makePublic();
      const reportUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;

      const examReport = new ExamReport({
        examId,
        uid,
        studentId: student._id,
        reportUrl,
        completed: true 
      });
      await examReport.save();

      res.json({ reportUrl });
    });

    blobStream.end(req.file.buffer);
  } catch (error) {
    console.error('Error uploading report:', error);
    res.status(500).json({ error: 'Server error' });
  }
}];

// Get exam report
exports.getExamReport = async (req, res) => {
  const { examId, uid } = req.params;
  try {
    const report = await ExamReport.findOne({ examId, uid }).lean();
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json(report);
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all exam reports
exports.getExamReports = async (req, res) => {
  const { examId } = req.params;
  try {
    const reports = await ExamReport.find({ examId }).lean();
    res.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Server error' });
  }
};


// Save student answers
exports.saveAnswers = async (req, res) => {
  const { examId } = req.params;
  const { uid, userAnswers, uploadedFileUrls } = req.body;

  try {
    const student = await Student.findOne({ uid });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (!student.exams.some(id => id.toString() === examId)) {
      return res.status(403).json({ error: 'Student not enrolled in this exam' });
    }

    // Validate answers against exam questions
    const validQuestionIds = exam.questions.map(q => q._id.toString());
    for (const questionId of Object.keys(userAnswers)) {
      if (!validQuestionIds.includes(questionId)) {
        return res.status(400).json({ error: `Invalid question ID: ${questionId}` });
      }
    }
    for (const questionId of Object.keys(uploadedFileUrls)) {
      if (!validQuestionIds.includes(questionId)) {
        return res.status(400).json({ error: `Invalid question ID for file URL: ${questionId}` });
      }
    }

    // Update or create saved answers
    const savedAnswer = await SavedAnswer.findOneAndUpdate(
      { examId, uid },
      { userAnswers, uploadedFileUrls },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`Answers saved for exam ID: ${examId}, UID: ${uid}`);
    res.json({ message: 'Answers saved successfully', savedAnswer });
  } catch (error) {
    console.error('Error saving answers:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get saved answers
exports.getSavedAnswers = async (req, res) => {
  const { examId, uid } = req.params;

  try {
    const student = await Student.findOne({ uid });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (!student.exams.some(id => id.toString() === examId)) {
      return res.status(403).json({ error: 'Student not enrolled in this exam' });
    }

    const savedAnswer = await SavedAnswer.findOne({ examId, uid }).lean();
    if (!savedAnswer) {
      return res.json({ userAnswers: {}, uploadedFileUrls: {} }); // Return empty if no saved answers
    }

    console.log(`Fetched saved answers for exam ID: ${examId}, UID: ${uid}`);
    res.json({
      userAnswers: savedAnswer.userAnswers || {},
      uploadedFileUrls: savedAnswer.uploadedFileUrls || {},
    });
  } catch (error) {
    console.error('Error fetching saved answers:', error);
    res.status(500).json({ error: 'Server error' });
  }
};


exports.upload = upload;