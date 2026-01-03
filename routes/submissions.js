// routes/submissions.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // Make sure this is imported
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max file size
  }
});

// Get submission status for all assignments in a class for a student
router.get('/status/:classId/student/:studentId', async (req, res) => {
  try {
    const submissions = await Submission.find({
      classId: req.params.classId,
      studentId: req.params.studentId
    })
      .select('assignmentId submitted submissionDate answer files studentName marks staffComment')
      .populate('files', 'name url type size _id');

    const status = {};
    submissions.forEach(sub => {
      if (!status[sub.assignmentId]) {
        status[sub.assignmentId] = { submissions: [] };
      }
      if (sub.answer || sub.files.length > 0) {
        status[sub.assignmentId].submissions.push({
          _id: sub._id,
          submitted: true,
          submissionDate: sub.submissionDate,
          answer: sub.answer,
          files: sub.files,
          studentName: sub.studentName,
          marks: sub.marks,
          staffComment: sub.staffComment
        });
      }
    });

    const assignments = await Assignment.find({ classId: req.params.classId });
    assignments.forEach(assignment => {
      if (!status[assignment._id]) {
        status[assignment._id] = { submissions: [] };
      }
    });

    res.json(status);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch submission status',
      error: err.message
    });
  }
});

// Create a new submission
router.post('/', upload.array('files'), async (req, res) => {
  try {
    const { assignmentId, classId, studentId, answer, studentName } = req.body;

    if (!assignmentId || !classId || !studentId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const files = req.files.map(file => ({
      name: file.originalname,
      path: file.path,
      type: file.mimetype,
      size: file.size,
      url: `/uploads/${file.filename}`
    }));

    if (!answer && files.length === 0) {
      return res.status(400).json({ message: 'Submission must include an answer or files' });
    }

    const submission = new Submission({
      assignmentId,
      classId,
      studentId,
      answer,
      files,
      submitted: true,
      submissionDate: new Date(),
      studentName
    });

    await submission.save();
    res.status(201).json(submission);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a submission
router.delete('/:id', async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    for (const file of submission.files) {
      try {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (fileErr) {
        console.error(`Failed to delete file ${file.path}:`, fileErr.message);
      }
    }

    await submission.deleteOne();
    res.json({ message: 'Submission deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete a specific file from a submission
router.delete('/:submissionId/file/:fileId', async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.submissionId);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    const fileIndex = submission.files.findIndex(file => file._id.toString() === req.params.fileId);
    if (fileIndex === -1) {
      return res.status(404).json({ message: 'File not found' });
    }

    const file = submission.files[fileIndex];
    try {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (fileErr) {
      console.error(`Failed to delete file ${file.path}:`, fileErr.message);
    }

    submission.files.splice(fileIndex, 1);

    if (!submission.answer && submission.files.length === 0) {
      await submission.deleteOne();
      return res.json({ message: 'File and empty submission deleted successfully' });
    }

    await submission.save();
    res.json({ message: 'File deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UPDATE SUBMISSION FEEDBACK - FIXED with better error handling
router.patch('/:id/feedback', async (req, res) => {
  console.log('=== FEEDBACK UPDATE REQUEST ===');
  console.log('Submission ID:', req.params.id);
  console.log('Request Body:', req.body);
  console.log('Request Headers:', req.headers);
  
  try {
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.log('Invalid ObjectId format');
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid submission ID format' 
      });
    }

    console.log('Looking for submission with ID:', req.params.id);
    
    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      console.log('Submission not found in database');
      return res.status(404).json({ 
        success: false, 
        message: 'Submission not found' 
      });
    }

    console.log('Found submission:', {
      id: submission._id,
      marks: submission.marks,
      staffComment: submission.staffComment,
      assignmentId: submission.assignmentId,
      studentId: submission.studentId
    });

    // Parse marks if provided
    if (req.body.marks !== undefined) {
      if (req.body.marks === '' || req.body.marks === null) {
        submission.marks = null;
        console.log('Setting marks to null');
      } else {
        // Try to convert to number
        const marksValue = req.body.marks;
        const marksNum = typeof marksValue === 'string' ? parseFloat(marksValue) : marksValue;
        
        if (isNaN(marksNum)) {
          console.log('Invalid marks value:', marksValue);
          return res.status(400).json({
            success: false,
            message: 'Invalid marks value. Must be a number.'
          });
        }
        
        submission.marks = marksNum;
        console.log('Setting marks to:', marksNum);
      }
    }

    // Update comment if provided
    if (req.body.comment !== undefined) {
      submission.staffComment = req.body.comment || '';
      console.log('Setting comment to:', submission.staffComment);
    }

    submission.updatedAt = Date.now();
    
    console.log('Attempting to save submission...');
    const savedSubmission = await submission.save();
    console.log('Submission saved successfully:', savedSubmission._id);
    
    res.json({
      success: true,
      message: 'Feedback saved successfully',
      data: {
        _id: savedSubmission._id,
        marks: savedSubmission.marks,
        staffComment: savedSubmission.staffComment,
        updatedAt: savedSubmission.updatedAt
      }
    });
    
  } catch (err) {
    console.error('=== ERROR UPDATING FEEDBACK ===');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    
    // Check if it's a validation error
    if (err.name === 'ValidationError') {
      console.error('Validation errors:', err.errors);
    }
    
    // Check if it's a CastError
    if (err.name === 'CastError') {
      console.error('Cast error details:', err);
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Failed to save feedback',
      error: err.message,
      errorType: err.name
    });
  }
});

// Get a specific submission by ID
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid submission ID format' });
    }
    
    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }
    res.json(submission);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Test endpoint to check if submission exists
router.get('/test/:id/exists', async (req, res) => {
  try {
    const exists = await Submission.exists({ _id: req.params.id });
    res.json({ exists: !!exists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;