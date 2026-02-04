const express = require('express');
const router = express.Router();
const programController = require('../controllers/programController');

// Program routes
router.post('/', programController.createProgram);
router.get('/', programController.getAllPrograms);
router.get('/:id', programController.getProgramById);
router.put('/:id', programController.updateProgram);
router.delete('/:id', programController.deleteProgram);

module.exports = router;