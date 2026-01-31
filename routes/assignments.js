const express = require('express');
const router = express.Router();
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const multer = require('multer');
const admin = require('firebase-admin');
const path = require('path');

const bucket = admin.storage().bucket();

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('File type not supported'));
  }
});

const uploadToFirebase = async (file) => {
  const timestamp = Date.now();
  const extension = path.extname(file.originalname);
  const baseName = file.originalname.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, '_');
  const uniqueName = `${baseName}_${timestamp}_${Math.random().toString(36).substring(2, 9)}${extension}`;
  const filePath = `assignments/${uniqueName}`;

  const fileRef = bucket.file(filePath);

  await fileRef.save(file.buffer, {
    metadata: {
      contentType: file.mimetype,
      metadata: {
        originalName: file.originalname,
        uploadedAt: new Date().toISOString(),
        size: file.size
      }
    }
  });

  await fileRef.makePublic();

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

  return {
    url: publicUrl,
    filePath: filePath,
    name: file.originalname,
    size: file.size,
    type: file.mimetype
  };
};

const deleteFromFirebase = async (filePath) => {
  if (!filePath) return;
  try {
    const fileRef = bucket.file(filePath);
    await fileRef.delete();
  } catch (err) {
    // silent fail - log only in development if needed
  }
};

router.get('/:classId/staff/:staffId', async (req, res) => {
  try {
    const assignments = await Assignment.find({
      classId: req.params.classId,
      staffId: req.params.staffId
    }).sort({ createdAt: -1 });

    const assignmentsWithStudentCount = await Promise.all(
      assignments.map(async (assignment) => {
        const submissions = await Submission.find({ assignmentId: assignment._id });
        const uniqueStudentIds = [...new Set(submissions.map(sub => sub.studentId))];
        return {
          ...assignment.toObject(),
          uniqueStudentCount: uniqueStudentIds.length
        };
      })
    );

    res.json(assignmentsWithStudentCount);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch assignments',
      error: err.message
    });
  }
});

router.get('/:classId/student/:studentId', async (req, res) => {
  try {
    const assignments = await Assignment.find({
      classId: req.params.classId
    }).sort({ createdAt: -1 });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch assignments',
      error: err.message
    });
  }
});

router.post('/staff/:staffId', upload.any(), async (req, res) => {
  try {
    const { 
      classId, 
      type = 'assignment', 
      title, 
      description = '', 
      assignmentType, 
      question = null, 
      dueDate = null,
      questions, 
      meetLink = null,
      meetTime = null 
    } = req.body;

    if (!classId || !title || !assignmentType) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const validAssignmentTypes = ['question', 'mcq', 'meet-google', 'meet-zoom', 'meet-teams'];
    if (!validAssignmentTypes.includes(assignmentType)) {
      return res.status(400).json({ 
        message: `Invalid assignmentType. Must be one of: ${validAssignmentTypes.join(', ')}`
      });
    }

    let parsedQuestions = null;

    if (assignmentType.startsWith('meet-')) {
      if (!meetLink) {
        return res.status(400).json({ message: 'Meeting assignments must have a meetLink' });
      }
      try {
        new URL(meetLink);
      } catch {
        return res.status(400).json({ message: 'Invalid meetLink URL format' });
      }
    } else if (assignmentType === 'mcq') {
      try {
        parsedQuestions = typeof questions === 'string' ? JSON.parse(questions) : questions;
        if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
          return res.status(400).json({ message: 'MCQ assignments must have questions data' });
        }

        for (let i = 0; i < parsedQuestions.length; i++) {
          const q = parsedQuestions[i];
          if (!q.question || q.question.trim() === '') {
            return res.status(400).json({ message: `Question ${i + 1} cannot be empty` });
          }
          if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
            return res.status(400).json({ message: `Question ${i + 1} must have at least 2 options` });
          }
          if (q.correctOption === null || q.correctOption === undefined) {
            return res.status(400).json({ message: `Question ${i + 1} must have a correct answer selected` });
          }
        }

        if (req.files && req.files.length > 0) {
          for (const question of parsedQuestions) {
            const fileField = `questionFile_${question.id}`;
            const file = req.files.find(f => f.fieldname === fileField);

            if (file) {
              const uploadResult = await uploadToFirebase(file);
              question.fileUrl = uploadResult.url;
              question.filePath = uploadResult.filePath;
              question.fileName = uploadResult.name;
              question.fileSize = uploadResult.size;
              question.fileType = uploadResult.type;
              question.hasFile = true;
            } else if (question.hasFile === false) {
              question.fileUrl = null;
              question.filePath = null;
              question.fileName = '';
              question.hasFile = false;
            }
          }
        }
      } catch (err) {
        return res.status(400).json({ 
          message: 'Invalid questions format',
          error: err.message 
        });
      }
    }

    if (assignmentType === 'question' && (!question || question.trim() === '')) {
      return res.status(400).json({ message: 'Question type assignments must have a question' });
    }

    const assignment = new Assignment({
      classId,
      staffId: req.params.staffId,
      type: assignmentType.startsWith('meet-') ? 'meeting' : 'assignment',
      title,
      description,
      assignmentType,
      question: assignmentType === 'question' ? question : null,
      dueDate,
      questions: assignmentType === 'mcq' ? parsedQuestions : null,
      meetTime,
      meetLink
    });

    const newAssignment = await assignment.save();
    res.status(201).json(newAssignment);
  } catch (err) {
    res.status(400).json({
      message: 'Failed to create assignment',
      error: err.message
    });
  }
});

router.put('/:id/staff/:staffId', upload.any(), async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      staffId: req.params.staffId,
    });
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found or unauthorized' });
    }

    const { 
      meetLink, 
      type, 
      title, 
      description, 
      assignmentType, 
      question, 
      dueDate,
      meetTime,
      questions 
    } = req.body;

    if (type !== undefined) assignment.type = type;
    if (title !== undefined) assignment.title = title;
    if (description !== undefined) assignment.description = description;
    if (assignmentType !== undefined) assignment.assignmentType = assignmentType;
    if (question !== undefined) assignment.question = question;
    if (dueDate !== undefined) assignment.dueDate = dueDate;
    if (meetTime !== undefined) assignment.meetTime = meetTime;
    if (meetLink !== undefined) assignment.meetLink = meetLink;

    if (assignmentType === 'mcq' && questions !== undefined) {
      try {
        let parsedQuestions = typeof questions === 'string' ? JSON.parse(questions) : questions;

        if (!Array.isArray(parsedQuestions)) {
          return res.status(400).json({ message: 'Questions must be an array' });
        }

        for (let i = 0; i < parsedQuestions.length; i++) {
          const q = parsedQuestions[i];
          if (!q.question || q.question.trim() === '') {
            throw new Error(`Question ${i + 1} cannot be empty`);
          }
          if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
            throw new Error(`Question ${i + 1} must have at least 2 options`);
          }
          if (q.correctOption === null || q.correctOption === undefined) {
            throw new Error(`Question ${i + 1} must have a correct answer selected`);
          }
        }

        const oldQuestions = assignment.questions || [];
        const newQuestionIds = parsedQuestions.map(q => q.id);

        const removedQuestions = oldQuestions.filter(q => !newQuestionIds.includes(q.id));
        for (const removed of removedQuestions) {
          if (removed.filePath) await deleteFromFirebase(removed.filePath);
        }

        if (req.files && req.files.length > 0) {
          for (const question of parsedQuestions) {
            const fileField = `questionFile_${question.id}`;
            const file = req.files.find(f => f.fieldname === fileField);

            if (file) {
              const oldQuestion = oldQuestions.find(q => q.id === question.id);
              if (oldQuestion && oldQuestion.filePath) {
                await deleteFromFirebase(oldQuestion.filePath);
              }

              const uploadResult = await uploadToFirebase(file);
              question.fileUrl = uploadResult.url;
              question.filePath = uploadResult.filePath;
              question.fileName = uploadResult.name;
              question.fileSize = uploadResult.size;
              question.fileType = uploadResult.type;
              question.hasFile = true;
            } else {
              const existing = oldQuestions.find(q => q.id === question.id);
              if (existing) {
                question.fileUrl = existing.fileUrl;
                question.filePath = existing.filePath;
                question.fileName = existing.fileName;
                question.fileSize = existing.fileSize;
                question.fileType = existing.fileType;
                question.hasFile = existing.hasFile;
              }
            }
          }
        } else {
          for (const question of parsedQuestions) {
            const existing = oldQuestions.find(q => q.id === question.id);
            if (existing) {
              question.fileUrl = existing.fileUrl;
              question.filePath = existing.filePath;
              question.fileName = existing.fileName;
              question.fileSize = existing.fileSize;
              question.fileType = existing.fileType;
              question.hasFile = existing.hasFile;
            }
          }
        }

        assignment.questions = parsedQuestions;
      } catch (err) {
        return res.status(400).json({ 
          message: 'Invalid questions data',
          error: err.message 
        });
      }
    }

    assignment.updatedAt = Date.now();
    const updatedAssignment = await assignment.save();
    res.json(updatedAssignment);
  } catch (err) {
    res.status(400).json({
      message: 'Failed to update assignment',
      error: err.message
    });
  }
});

router.delete('/:id/staff/:staffId', async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      staffId: req.params.staffId
    });
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found or unauthorized' });
    }

    if (assignment.assignmentType === 'mcq' && assignment.questions) {
      for (const question of assignment.questions) {
        if (question.filePath) {
          await deleteFromFirebase(question.filePath);
        }
      }
    }

    const submissions = await Submission.find({ assignmentId: req.params.id });
    for (const submission of submissions) {
      if (submission.files && submission.files.length > 0) {
        for (const file of submission.files) {
          if (file.path) {
            await deleteFromFirebase(file.path);
          }
        }
      }
    }

    await Submission.deleteMany({ assignmentId: req.params.id });
    await Assignment.deleteOne({ _id: req.params.id });

    res.json({
      success: true,
      message: 'Assignment and associated submissions deleted successfully'
    });
  } catch (err) {
    res.status(500).json({
      message: 'Failed to delete assignment',
      error: err.message
    });
  }
});

router.get('/:id/submissions', async (req, res) => {
  try {
    const submissions = await Submission.find({ assignmentId: req.params.id })
      .sort({ submissionDate: -1 });
    res.json(submissions);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch submissions',
      error: err.message
    });
  }
});

router.post('/:id/mcq-submit', async (req, res) => {
  try {
    const { studentId, studentName, answers } = req.body;
    
    if (!studentId || !studentName || !answers) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (assignment.assignmentType !== 'mcq') {
      return res.status(400).json({ message: 'This is not an MCQ assignment' });
    }

    let score = 0;
    const totalQuestions = assignment.questions.length;
    
    assignment.questions.forEach((question, index) => {
      if (answers[index] === question.correctOption) {
        score++;
      }
    });

    const percentage = Math.round((score / totalQuestions) * 100);

    const existingSubmission = await Submission.findOne({
      assignmentId: req.params.id,
      studentId: studentId
    });

    if (existingSubmission) {
      existingSubmission.answer = JSON.stringify(answers);
      existingSubmission.marks = percentage;
      existingSubmission.submitted = true;
      existingSubmission.submissionDate = Date.now();
      await existingSubmission.save();
      res.json({
        success: true,
        message: 'MCQ submission updated successfully',
        submission: existingSubmission,
        score,
        totalQuestions,
        percentage
      });
    } else {
      const submission = new Submission({
        assignmentId: req.params.id,
        classId: assignment.classId,
        studentId,
        studentName,
        answer: JSON.stringify(answers),
        submitted: true,
        marks: percentage
      });

      const newSubmission = await submission.save();
      res.status(201).json({
        success: true,
        message: 'MCQ submitted successfully',
        submission: newSubmission,
        score,
        totalQuestions,
        percentage
      });
    }
  } catch (err) {
    res.status(500).json({
      message: 'Failed to submit MCQ',
      error: err.message
    });
  }
});

router.get('/:id/mcq-submission/:studentId', async (req, res) => {
  try {
    const submission = await Submission.findOne({
      assignmentId: req.params.id,
      studentId: req.params.studentId
    });

    if (!submission) {
      return res.status(404).json({ 
        success: false, 
        message: 'No submission found' 
      });
    }

    res.json({
      success: true,
      submission
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch submission',
      error: err.message
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }
    res.json(assignment);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch assignment',
      error: err.message
    });
  }
});

router.get('/:id/submission/:studentId', async (req, res) => {
  try {
    const submission = await Submission.findOne({
      assignmentId: req.params.id,
      studentId: req.params.studentId
    });
    
    if (!submission) {
      return res.status(404).json({ 
        success: false, 
        message: 'No submission found' 
      });
    }
    
    res.json({
      success: true,
      submission
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch submission',
      error: err.message
    });
  }
});

module.exports = router;