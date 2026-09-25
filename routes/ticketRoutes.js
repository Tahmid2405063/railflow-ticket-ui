const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { requireAuth } = require('../middleware/auth');

// Get tickets for user or admin
router.get('/', requireAuth, ticketController.getTickets);

// Cancel individual ticket
router.post('/:ticketId/cancel', requireAuth, ticketController.cancelTicket);

module.exports = router;
