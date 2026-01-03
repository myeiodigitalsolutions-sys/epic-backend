const express = require('express');
const router = express.Router();
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images, PDFs, and documents
    const filetypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Error: File type not supported!'));
    }
  }
});

// Get all assignments for a class and staff
router.get('/:classId/staff/:staffId', async (req, res) => {
  try {
    const assignments = await Assignment.find({
      classId: req.params.classId,
      staffId: req.params.staffId
    }).sort({ createdAt: -1 });

    // Calculate unique student count for each assignment
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
    console.error('Error fetching staff assignments:', err);
    res.status(500).json({
      message: 'Failed to fetch assignments',
      error: err.message
    });
  }
});

// Get all assignments for a class (for students)
router.get('/:classId/student/:studentId', async (req, res) => {
  try {
    const assignments = await Assignment.find({
      classId: req.params.classId
    }).sort({ createdAt: -1 });
    res.json(assignments);
  } catch (err) {
    console.error('Error fetching student assignments:', err);
    res.status(500).json({
      message: 'Failed to fetch assignments',
      error: err.message
    });
  }
});

// Create a new assignment (with optional file uploads)
router.post('/staff/:staffId', upload.any(), async (req, res) => {
  try {
    console.log('Creating assignment with data:', req.body);
    console.log('Staff ID from params:', req.params.staffId);
    console.log('Uploaded files:', req.files);
    
    const { 
      classId, 
      type = 'assignment', 
      title, 
      description = '', 
      assignmentType, 
      question = null, 
      dueDate = null,
      questions, // Could be stringified or parsed
      meetLink = null,
      meetTime = null 
    } = req.body;

    // Simple validation
    if (!classId) {
      return res.status(400).json({ 
        message: 'Missing required field: classId'
      });
    }
    
    if (!title) {
      return res.status(400).json({ 
        message: 'Missing required field: title'
      });
    }
    
    if (!assignmentType) {
      return res.status(400).json({ 
        message: 'Missing required field: assignmentType'
      });
    }

    // Validate assignmentType - now includes meeting types
    const validAssignmentTypes = ['question', 'mcq', 'meet-google', 'meet-zoom', 'meet-teams'];
    if (!validAssignmentTypes.includes(assignmentType)) {
      return res.status(400).json({ 
        message: `Invalid assignmentType. Must be one of: ${validAssignmentTypes.join(', ')}`
      });
    }

    let parsedQuestions = null;
    
    // Special handling for meeting type assignments
    if (assignmentType.startsWith('meet-')) {
      // For meetings, we need meetLink
      if (!meetLink) {
        return res.status(400).json({ 
          message: 'Meeting assignments must have a meetLink'
        });
      }
      
      // Validate meetLink is a valid URL
      try {
        new URL(meetLink);
      } catch (urlErr) {
        return res.status(400).json({ 
          message: 'Invalid meetLink URL format'
        });
      }
      
      // Don't validate or parse questions for meeting types
    } else if (assignmentType === 'mcq') {
      // Parse and validate MCQ questions
      try {
        // Parse questions if they're stringified
        if (typeof questions === 'string') {
          parsedQuestions = JSON.parse(questions);
        } else if (Array.isArray(questions)) {
          parsedQuestions = questions;
        } else {
          return res.status(400).json({ 
            message: 'MCQ assignments must have questions data' 
          });
        }
        
        console.log('Parsed questions count:', parsedQuestions.length);
        
        // Basic validation
        if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
          return res.status(400).json({ 
            message: 'MCQ assignments must have at least one question' 
          });
        }
        
        // Validate each question
        for (let i = 0; i < parsedQuestions.length; i++) {
          const q = parsedQuestions[i];
          if (!q.question || q.question.trim() === '') {
            return res.status(400).json({ 
              message: `Question ${i + 1} cannot be empty` 
            });
          }
          if (!q.options || !Array.isArray(q.options) || q.options.length < 2) {
            return res.status(400).json({ 
              message: `Question ${i + 1} must have at least 2 options` 
            });
          }
          if (q.correctOption === null || q.correctOption === undefined) {
            return res.status(400).json({ 
              message: `Question ${i + 1} must have a correct answer selected` 
            });
          }
        }

        // Handle files for MCQ questions
        if (req.files && req.files.length > 0) {
          for (const question of parsedQuestions) {
            const fileField = `questionFile_${question.id}`;
            const file = req.files.find(f => f.fieldname === fileField);

            if (file) {
              // Set new file information
              question.filePath = '/uploads/' + file.filename;
              question.fileName = file.originalname || file.filename;
              question.hasFile = true;
            } else if (question.hasFile === false) {
              // If explicitly set to false, clear file info
              question.filePath = null;
              question.fileName = '';
              question.hasFile = false;
            } else {
              // Keep existing file info if present
              question.hasFile = question.hasFile || false;
            }
          }
        } else {
          // No files uploaded, ensure file info is set properly
          for (const question of parsedQuestions) {
            question.hasFile = question.hasFile || false;
            question.filePath = question.filePath || null;
            question.fileName = question.fileName || '';
          }
        }
      } catch (parseErr) {
        console.error('Error parsing questions:', parseErr);
        return res.status(400).json({ 
          message: 'Invalid questions format',
          error: parseErr.message 
        });
      }
    }

    // For question type assignment, validate question field
    if (assignmentType === 'question' && (!question || question.trim() === '')) {
      return res.status(400).json({ 
        message: 'Question type assignments must have a question' 
      });
    }

    const assignment = new Assignment({
      classId: classId,
      staffId: req.params.staffId,
      type: assignmentType.startsWith('meet-') ? 'meeting' : 'assignment', // Set type based on assignmentType
      title: title,
      description: description,
      assignmentType: assignmentType,
      question: assignmentType === 'question' ? question : null,
      dueDate: dueDate,
      questions: assignmentType === 'mcq' ? parsedQuestions : null,
      meetTime: meetTime,
      meetLink: meetLink,
    });

    const newAssignment = await assignment.save();
    console.log('Assignment created successfully:', newAssignment._id);
    
    res.status(201).json(newAssignment);
  } catch (err) {
    console.error('Error creating assignment:', err);
    res.status(400).json({
      message: 'Failed to create assignment',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Update an assignment (with optional file uploads)
router.put('/:id/staff/:staffId', upload.any(), async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      staffId: req.params.staffId,
    });
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found or you are not authorized' });
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

    // Update assignment fields
    if (type !== undefined) assignment.type = type;
    if (title !== undefined) assignment.title = title;
    if (description !== undefined) assignment.description = description;
    if (assignmentType !== undefined) assignment.assignmentType = assignmentType;
    if (question !== undefined) assignment.question = question;
    if (dueDate !== undefined) assignment.dueDate = dueDate;
    if (meetTime !== undefined) assignment.meetTime = meetTime;
    if (meetLink !== undefined) assignment.meetLink = meetLink;
    
    // Update questions for MCQ assignments
    if (assignmentType === 'mcq' && questions !== undefined) {
      try {
        // Parse questions if they're stringified
        let parsedQuestions;
        if (typeof questions === 'string') {
          parsedQuestions = JSON.parse(questions);
        } else if (Array.isArray(questions)) {
          parsedQuestions = questions;
        } else {
          return res.status(400).json({ 
            message: 'Invalid questions data format' 
          });
        }
        
        // Validate questions
        if (Array.isArray(parsedQuestions)) {
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

          // Handle removed questions - delete their files
          const oldQuestions = assignment.questions || [];
          const newQuestionIds = parsedQuestions.map(q => q.id);
          const removedQuestions = oldQuestions.filter(q => !newQuestionIds.includes(q.id));
          for (const removed of removedQuestions) {
            if (removed.filePath) {
              try {
                const fullPath = path.join(__dirname, '..', removed.filePath);
                if (fs.existsSync(fullPath)) {
                  fs.unlinkSync(fullPath);
                }
              } catch (fileErr) {
                console.error(`Failed to delete file for removed question: ${fileErr.message}`);
              }
            }
          }

          // Handle files for remaining/updated questions
          if (req.files && req.files.length > 0) {
            for (const question of parsedQuestions) {
              const fileField = `questionFile_${question.id}`;
              const file = req.files.find(f => f.fieldname === fileField);

              if (file) {
                // Find old question to check for existing file
                const oldQuestion = oldQuestions.find(q => q.id === question.id);
                
                // Delete old file if exists
                if (oldQuestion && oldQuestion.filePath) {
                  try {
                    const oldPath = path.join(__dirname, '..', oldQuestion.filePath);
                    if (fs.existsSync(oldPath)) {
                      fs.unlinkSync(oldPath);
                    }
                  } catch (fileErr) {
                    console.error(`Failed to delete old file: ${fileErr.message}`);
                  }
                }
                
                // Set new file
                question.filePath = '/uploads/' + file.filename;
                question.fileName = file.originalname || file.filename;
                question.hasFile = true;
              } else {
                // Keep existing file info if question exists
                const existingQuestion = oldQuestions.find(q => q.id === question.id);
                if (existingQuestion) {
                  question.filePath = existingQuestion.filePath;
                  question.fileName = existingQuestion.fileName;
                  question.hasFile = existingQuestion.hasFile || false;
                } else {
                  // New question without file
                  question.hasFile = question.hasFile || false;
                  question.filePath = question.filePath || null;
                  question.fileName = question.fileName || '';
                }
              }
            }
          } else {
            // No new files, preserve existing file info
            for (const question of parsedQuestions) {
              const existingQuestion = oldQuestions.find(q => q.id === question.id);
              if (existingQuestion) {
                question.filePath = existingQuestion.filePath;
                question.fileName = existingQuestion.fileName;
                question.hasFile = existingQuestion.hasFile || false;
              } else {
                question.hasFile = question.hasFile || false;
                question.filePath = question.filePath || null;
                question.fileName = question.fileName || '';
              }
            }
          }

          assignment.questions = parsedQuestions;
        } else {
          return res.status(400).json({ 
            message: 'Questions must be an array' 
          });
        }
      } catch (parseErr) {
        return res.status(400).json({ 
          message: 'Invalid questions data',
          error: parseErr.message 
        });
      }
    }

    assignment.updatedAt = Date.now();

    const updatedAssignment = await assignment.save();
    res.json(updatedAssignment);
  } catch (err) {
    console.error('Error updating assignment:', err);
    res.status(400).json({
      message: 'Failed to update assignment',
      error: err.message,
    });
  }
});

// Delete an assignment
router.delete('/:id/staff/:staffId', async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      staffId: req.params.staffId
    });
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found or you are not authorized' });
    }

    // Delete MCQ question files
    if (assignment.assignmentType === 'mcq' && assignment.questions) {
      for (const question of assignment.questions) {
        if (question.filePath) {
          try {
            const fullPath = path.join(__dirname, '..', question.filePath);
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
            }
          } catch (fileErr) {
            console.error(`Failed to delete MCQ file ${question.filePath}:`, fileErr.message);
          }
        }
      }
    }

    // Delete submission files
    const submissions = await Submission.find({ assignmentId: req.params.id });
    for (const submission of submissions) {
      if (submission.files && submission.files.length > 0) {
        for (const file of submission.files) {
          try {
            if (file.path && fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          } catch (fileErr) {
            console.error(`Failed to delete file ${file.path}:`, fileErr.message);
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
    console.error('Error deleting assignment:', err);
    res.status(500).json({
      message: 'Failed to delete assignment',
      error: err.message
    });
  }
});

// Get all submissions for an assignment
router.get('/:id/submissions', async (req, res) => {
  try {
    const submissions = await Submission.find({ assignmentId: req.params.id })
      .sort({ submissionDate: -1 });
    res.json(submissions);
  } catch (err) {
    console.error('Error fetching submissions:', err);
    res.status(500).json({
      message: 'Failed to fetch submissions',
      error: err.message
    });
  }
});

// New endpoint for MCQ submissions
router.post('/:id/mcq-submit', async (req, res) => {
  try {
    const { studentId, studentName, answers } = req.body;
    
    if (!studentId || !studentName || !answers) {
      return res.status(400).json({ 
        message: 'Missing required fields: studentId, studentName, or answers' 
      });
    }

    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    if (assignment.assignmentType !== 'mcq') {
      return res.status(400).json({ message: 'This is not an MCQ assignment' });
    }

    // Calculate score
    let score = 0;
    const totalQuestions = assignment.questions.length;
    
    assignment.questions.forEach((question, index) => {
      if (answers[index] === question.correctOption) {
        score++;
      }
    });

    const percentage = Math.round((score / totalQuestions) * 100);

    // Create or update submission
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
        score: score,
        totalQuestions: totalQuestions,
        percentage: percentage
      });
    } else {
      const submission = new Submission({
        assignmentId: req.params.id,
        classId: assignment.classId,
        studentId: studentId,
        studentName: studentName,
        answer: JSON.stringify(answers),
        submitted: true,
        marks: percentage
      });

      const newSubmission = await submission.save();
      res.status(201).json({
        success: true,
        message: 'MCQ submitted successfully',
        submission: newSubmission,
        score: score,
        totalQuestions: totalQuestions,
        percentage: percentage
      });
    }
  } catch (err) {
    console.error('Error submitting MCQ:', err);
    res.status(500).json({
      message: 'Failed to submit MCQ',
      error: err.message
    });
  }
});

// Get MCQ submission for a student
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
      submission: submission
    });
  } catch (err) {
    console.error('Error fetching MCQ submission:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch submission',
      error: err.message
    });
  }
});

// Get a specific assignment
router.get('/:id', async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found' });
    }
    res.json(assignment);
  } catch (err) {
    console.error('Error fetching assignment:', err);
    res.status(500).json({
      message: 'Failed to fetch assignment',
      error: err.message
    });
  }
});

// Get student's submission for an assignment
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
      submission: submission
    });
  } catch (err) {
    console.error('Error fetching submission:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch submission',
      error: err.message
    });
  }
});

module.exports = router;