const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const multer = require('multer');
const admin = require('firebase-admin');

const bucket = admin.storage().bucket();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported'));
    }
  }
});

const uploadToFirebase = async (file, assignmentId, studentId) => {
  if (!bucket) {
    throw new Error('Firebase Storage not available');
  }

  const timestamp = Date.now();
  const originalName = file.originalname;
  const extension = originalName.split('.').pop();
  const baseName = originalName.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, '_');
  const uniqueName = `${baseName}_${timestamp}_${Math.random().toString(36).substring(2, 9)}.${extension}`;
  const filePath = `submissions/${assignmentId}/${studentId}/${uniqueName}`;

  const fileRef = bucket.file(filePath);

  await fileRef.save(file.buffer, {
    metadata: {
      contentType: file.mimetype,
      metadata: {
        originalName,
        uploadedAt: new Date().toISOString(),
        assignmentId,
        studentId,
        size: file.size
      }
    }
  });

  await fileRef.makePublic();

  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

  return {
    url: publicUrl,
    filePath,
    name: originalName,
    type: file.mimetype,
    size: file.size,
    uploadedAt: new Date().toISOString()
  };
};

const deleteFromFirebase = async (filePath) => {
  if (!bucket || !filePath) return;
  try {
    const fileRef = bucket.file(filePath);
    const [exists] = await fileRef.exists();
    if (exists) {
      await fileRef.delete();
    }
  } catch {
    // silent fail - file may already be gone
  }
};

router.get('/status/:classId/student/:studentId', async (req, res) => {
  try {
    const submissions = await Submission.find({
      classId: req.params.classId,
      studentId: req.params.studentId
    })
      .select('assignmentId submitted submissionDate answer files studentName marks staffComment')
      .sort({ submissionDate: -1 });

    const status = {};
    submissions.forEach(sub => {
      if (!status[sub.assignmentId]) {
        status[sub.assignmentId] = { submissions: [] };
      }
      if (sub.answer || (sub.files && sub.files.length > 0)) {
        status[sub.assignmentId].submissions.push({
          _id: sub._id,
          submitted: true,
          submissionDate: sub.submissionDate,
          answer: sub.answer,
          files: sub.files || [],
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

router.post('/', upload.array('files', 10), async (req, res) => {
  try {
    const { assignmentId, classId, studentId, answer, studentName } = req.body;

    if (!assignmentId || !classId || !studentId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: assignmentId, classId, studentId'
      });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }

    let uploadedFiles = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const firebaseFile = await uploadToFirebase(file, assignmentId, studentId);
        uploadedFiles.push({
          name: firebaseFile.name,
          path: firebaseFile.filePath,
          url: firebaseFile.url,
          type: firebaseFile.type,
          size: firebaseFile.size,
          uploadedAt: firebaseFile.uploadedAt
        });
      }
    }

    if (!answer && uploadedFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Submission must include an answer or at least one file'
      });
    }

    const existingSubmission = await Submission.findOne({
      assignmentId,
      studentId
    });

    let submission;
    const submissionDate = new Date();

    if (existingSubmission) {
      existingSubmission.answer = answer || existingSubmission.answer;
      existingSubmission.files = [...(existingSubmission.files || []), ...uploadedFiles];
      existingSubmission.submitted = true;
      existingSubmission.submissionDate = submissionDate;
      existingSubmission.studentName = studentName || existingSubmission.studentName;
      existingSubmission.updatedAt = submissionDate;
      submission = await existingSubmission.save();
    } else {
      submission = new Submission({
        assignmentId,
        classId,
        studentId,
        answer: answer || '',
        files: uploadedFiles,
        submitted: true,
        submissionDate,
        studentName: studentName || 'Unknown Student',
        createdAt: submissionDate,
        updatedAt: submissionDate
      });
      await submission.save();
    }

    res.status(201).json({
      success: true,
      message: 'Submission saved successfully',
      submission,
      files: uploadedFiles
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: 'Failed to submit assignment',
      error: err.message
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    if (submission.files && submission.files.length > 0) {
      for (const file of submission.files) {
        if (file.path) await deleteFromFirebase(file.path);
      }
    }

    await submission.deleteOne();
    res.json({
      success: true,
      message: 'Submission deleted successfully'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete submission',
      error: err.message
    });
  }
});

router.delete('/:submissionId/file/:fileId', async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.submissionId);
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    const fileIndex = submission.files.findIndex(file =>
      file._id && file._id.toString() === req.params.fileId
    );

    if (fileIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'File not found in submission'
      });
    }

    const file = submission.files[fileIndex];
    if (file.path) await deleteFromFirebase(file.path);

    submission.files.splice(fileIndex, 1);

    if (!submission.answer && submission.files.length === 0) {
      await submission.deleteOne();
      return res.json({
        success: true,
        message: 'File and empty submission deleted successfully'
      });
    }

    submission.updatedAt = Date.now();
    await submission.save();

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete file',
      error: err.message
    });
  }
});

router.patch('/:id/feedback', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid submission ID format'
      });
    }

    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    if (req.body.marks !== undefined) {
      if (req.body.marks === '' || req.body.marks === null) {
        submission.marks = null;
      } else {
        const marksNum = typeof req.body.marks === 'string'
          ? parseFloat(req.body.marks)
          : req.body.marks;

        if (isNaN(marksNum)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid marks value. Must be a number.'
          });
        }
        submission.marks = marksNum;
      }
    }

    if (req.body.comment !== undefined) {
      submission.staffComment = req.body.comment || '';
    }

    submission.updatedAt = Date.now();
    const savedSubmission = await submission.save();

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
    res.status(500).json({
      success: false,
      message: 'Failed to save feedback',
      error: err.message
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid submission ID format'
      });
    }

    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
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

router.get('/test/:id/exists', async (req, res) => {
  try {
    const exists = await Submission.exists({ _id: req.params.id });
    res.json({
      success: true,
      exists: !!exists
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;