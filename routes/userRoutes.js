const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');

router.post('/user', UserController.createUser);
router.post('/bulk-users', UserController.bulkCreateUsers);
router.get('/', UserController.getUsers);
router.get('/:id', UserController.getUser);
router.put('/:id', UserController.updateUser);
router.delete('/:id', UserController.deleteUser);
router.patch('/:id/deactivate', UserController.deactivateUser);

module.exports = router;