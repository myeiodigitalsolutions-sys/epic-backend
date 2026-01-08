const express = require('express');
const router = express.Router();
const examController = require('../controllers/exam.controller');

router.get('/', examController.getAllExams);
router.get('/:examId', examController.getExamById);
router.get('/:examId/questions', examController.getExamQuestions);
router.post('/', examController.createExam);
router.put('/:id', examController.updateExam);
router.delete('/:id', examController.deleteExam);
router.post('/upload-file', examController.uploadStudentFile);
router.get('/:examId/submissions/:uid', examController.getStudentSubmissions);
router.get('/:examId/students', examController.getStudentsByExamSubmissions);
router.post('/:examId/report/upload', examController.uploadExamReport);
router.get('/:examId/report/:uid', examController.getExamReport);
router.get('/:examId/reports', examController.getExamReports);
router.get('/:examId/download-submissions', examController.downloadAllSubmissions);
router.get('/:examId/download-reports', examController.downloadAllReports);
router.post('/:examId/save-answers', examController.saveAnswers);
router.get('/:examId/saved-answers/:uid', examController.getSavedAnswers);

module.exports = router;