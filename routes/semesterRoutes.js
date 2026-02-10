const express = require('express');
const router = express.Router();
const semesterController = require('../controllers/semesterController');

// @route   GET /api/semesters
// @desc    Get all semesters
// @access  Public
router.get('/', semesterController.getSemesters);

// @route   GET /api/semesters/:id
// @desc    Get semester by ID
// @access  Public
router.get('/:id', semesterController.getSemesterById);

// @route   POST /api/semesters
// @desc    Create new semester
// @access  Private
router.post('/', semesterController.createSemester);

// @route   PUT /api/semesters/:id
// @desc    Update semester
// @access  Private
router.put('/:id', semesterController.updateSemester);

// @route   DELETE /api/semesters/:id
// @desc    Delete semester
// @access  Private
router.delete('/:id', semesterController.deleteSemester);

module.exports = router;