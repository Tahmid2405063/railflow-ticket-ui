const express = require('express');
const router = express.Router();
const pool = require('../connection');

// Import modular routes
const authRoutes = require('./authRoutes');
const bookingRoutes = require('./bookingRoutes');
const scheduleRoutes = require('./scheduleRoutes');
const ticketRoutes = require('./ticketRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const userRoutes = require('./userRoutes');

// Import controllers for direct sub-paths
const authController = require('../controllers/authController');
const scheduleController = require('../controllers/scheduleController');
const analyticsController = require('../controllers/analyticsController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Health Check
router.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: 'Database is unavailable.' });
  }
});

// Mount Sub-routers
router.use('/auth', authRoutes);
router.use('/bookings', bookingRoutes);
router.use('/schedules', scheduleRoutes);
router.use('/tickets', ticketRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/users', userRoutes);

// Direct Profile endpoints
router.get('/profile', requireAuth, authController.getProfile);
router.put('/profile', requireAuth, authController.updateProfile);
router.post('/profile/change-password', requireAuth, authController.changePassword);

// Direct Station suggestions endpoint
router.get('/stations', requireAuth, scheduleController.getStations);

// Legacy admin booking summary for backwards compatibility
router.get('/admin/booking-summary', requireAuth, requireRole('Admin', 'Manager', 'Staff'), analyticsController.getFinancialSummary);

module.exports = router;
