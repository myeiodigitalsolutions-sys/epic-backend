const express = require('express');
const router = express.Router();
const meetingController = require('../controllers/meetingController');

// Create meeting (for both class and subject)
router.post('/', meetingController.createMeeting);

// Get meeting by ID
router.get('/:meetingId', meetingController.getMeeting);

// Update meeting
router.put('/:meetingId', meetingController.updateMeeting);

// Delete meeting
router.delete('/:meetingId', meetingController.deleteMeeting);

// Start meeting
router.post('/:meetingId/start', meetingController.startMeeting);

// End meeting
router.post('/:meetingId/end', meetingController.endMeeting);

// Join meeting (for students)
router.post('/:meetingId/join', meetingController.joinMeeting);

// Get meetings for a class (GENERAL)
router.get('/class/:classId', meetingController.getClassMeetings);

// Get meetings for student's specific class
router.get('/class/:classId/student', meetingController.getStudentClassMeetings);

// Get live meetings for a class
router.get('/class/:classId/live', meetingController.getClassLiveMeetings);

// Get meetings for a subject
router.get('/subject/:subjectId', meetingController.getSubjectMeetings);

// Get live meetings for a subject
router.get('/subject/:subjectId/live', meetingController.getSubjectLiveMeetings);

// Get meetings for student's specific subject
router.get('/subject/:subjectId/student', meetingController.getStudentSubjectMeetings);

// Get meeting attendance report
router.get('/:meetingId/attendance', meetingController.getMeetingAttendance);

module.exports = router;