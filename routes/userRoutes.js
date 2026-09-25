const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Admin only user management routes with explicit transaction control (Requirement 2 & 3)
router.post('/', requireAuth, requireRole('Admin'), userController.createUser);
router.get('/', requireAuth, requireRole('Admin'), userController.getUsers);

module.exports = router;
