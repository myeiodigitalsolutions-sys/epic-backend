const express = require('express');
const router = express.Router();
const programController = require('../controllers/programController');

// Program routes
router.post('/', programController.createProgram);
router.get('/', programController.getAllPrograms);
router.get('/:id', programController.getProgramById);
router.put('/:id', programController.updateProgram);
router.delete('/:id', programController.deleteProgram);

// Get programs by semester
router.get('/semester/:semesterId', programController.getProgramsBySemester);

// Subject routes
router.post('/:programId/subjects', programController.addSubject);
router.get('/:programId/subjects', programController.getProgramSubjects);
router.put('/:programId/subjects/:subjectId', programController.updateSubject);
router.delete('/:programId/subjects/:subjectId', programController.deleteSubject);

// Staff assignment routes (multiple staff)
router.post('/:programId/subjects/:subjectId/assign-staff', programController.assignStaffToSubject);
router.delete('/:programId/subjects/:subjectId/staff/:staffId', programController.removeStaffFromSubject);
router.put('/:programId/subjects/:subjectId/staff/:staffId/role', programController.updateStaffRole);

// Student enrollment routes
router.post('/:programId/subjects/:subjectId/enroll-student', programController.enrollStudentToSubject);
router.delete('/:programId/subjects/:subjectId/students/:studentEmail', programController.removeStudentFromSubject);
router.get('/:programId/subjects/:subjectId/students', programController.getEnrolledStudents);

// Staff assigned subjects routes
router.get('/staff/:email/subjects', programController.getStaffAssignedSubjects);

// Student enrolled subjects routes
router.get('/student/:email/subjects', programController.getStudentEnrolledSubjects);

module.exports = router;