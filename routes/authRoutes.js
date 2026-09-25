const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/send-reset-code', authController.sendResetCode);
router.post('/forgot-password', authController.forgotPassword);

// Protected routes (Requirement 2)
router.post('/logout', requireAuth, authController.logout);
router.post('/change-password', requireAuth, authController.changePassword);

module.exports = router;
