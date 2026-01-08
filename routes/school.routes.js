const express = require('express');
const router = express.Router();
const schoolController = require('../controllers/school.controller');

// School routes
router.get('/', schoolController.getAllSchools);
router.get('/:id', schoolController.getSchoolById);
router.post('/', schoolController.createSchool);
router.put('/:id', schoolController.updateSchool);
router.delete('/:id', schoolController.deleteSchool);

// Program routes
router.post('/:schoolId/programs', schoolController.addProgram);
router.put('/:schoolId/programs/:programId', schoolController.updateProgram);
router.delete('/:schoolId/programs/:programId', schoolController.deleteProgram);

// Semester routes
router.post('/:schoolId/programs/:programId/semesters', schoolController.addSemester);
router.put('/:schoolId/programs/:programId/semesters/:semesterId', schoolController.updateSemester);
router.delete('/:schoolId/programs/:programId/semesters/:semesterId', schoolController.deleteSemester);

// Student routes
router.post('/:schoolId/programs/:programId/semesters/:semesterId/students', schoolController.addStudent);
router.post('/:schoolId/programs/:programId/semesters/:semesterId/students/bulk', schoolController.bulkAddStudents);
router.delete('/:schoolId/programs/:programId/semesters/:semesterId/students/:email', schoolController.removeStudent);

module.exports = router;