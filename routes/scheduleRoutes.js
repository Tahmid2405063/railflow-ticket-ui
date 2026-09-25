const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/scheduleController');
const { requireAuth } = require('../middleware/auth');

// Protected schedule endpoints (Requirement 2)
router.get('/', requireAuth, scheduleController.getSchedules);
router.get('/:scheduleId/seats', requireAuth, scheduleController.getScheduleSeats);
router.get('/:scheduleId/stops', requireAuth, scheduleController.getScheduleStops);
router.get('/:scheduleId/fares', requireAuth, scheduleController.getScheduleFares);

module.exports = router;
