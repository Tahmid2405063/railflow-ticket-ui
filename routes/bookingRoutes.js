const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const ticketController = require('../controllers/ticketController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Create booking (Customer only)
router.post('/', requireAuth, requireRole('Customer'), bookingController.createBooking);

// Get booking details by reference
router.get('/:reference', requireAuth, ticketController.getBookingByReference);

// Cancel booking by reference (Calls Stored Procedure sp_cancel_booking)
router.post('/:reference/cancel', requireAuth, bookingController.cancelBookingByReference);

module.exports = router;
