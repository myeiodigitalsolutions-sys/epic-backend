const express = require('express');
const router = express.Router();
const classController = require('../controllers/class.controller');

router.get('/', classController.getAllClasses);
router.get('/:id', classController.getClassById);
router.post('/', classController.createClass);
router.put('/:id', classController.updateClass);
router.delete('/:id', classController.deleteClass);
router.post('/:id/students', classController.addStudent);
router.post('/:id/bulk-students', classController.bulkAddStudents);
router.delete('/:id/students/:email', classController.removeStudent);

module.exports = router;