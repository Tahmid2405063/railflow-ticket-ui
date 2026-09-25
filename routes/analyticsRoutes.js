const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { requireAuth } = require('../middleware/auth');

// Analytics routes (Requirement 7: Demonstrating Complex Queries & Aggregations)
router.get('/top-routes', requireAuth, analyticsController.getTopRoutes);
router.get('/train-performance', requireAuth, analyticsController.getTrainPerformance);
router.get('/financial-summary', requireAuth, analyticsController.getFinancialSummary);
router.get('/audit-logs', requireAuth, analyticsController.getAuditLogs);

module.exports = router;
