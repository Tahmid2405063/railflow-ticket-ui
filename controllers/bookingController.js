const crypto = require('crypto');
const pool = require('../connection');

const MAX_TICKETS_PER_PURCHASE = 4;
const VALID_GENDERS = new Set(['Male', 'Female', 'Other']);

function passengerDetailsError({ name, email, phone, age, gender }) {
  if (!name || !email || !phone || age === undefined || age === null || String(age).trim() === '' || !gender) {
    return 'Complete passenger details are required.';
  }
  if (!/^\d+$/.test(String(phone).trim())) return 'Phone number must contain digits only.';
  const numericAge = Number(age);
  if (!Number.isInteger(numericAge) || numericAge < 1 || numericAge > 120) {
    return 'Age must be a whole number from 1 to 120.';
  }
  if (!VALID_GENDERS.has(gender)) return 'Choose Male, Female, or Other for gender.';
  return null;
}

function clientError(error, fallback) {
  if (error?.code === '23514') return 'One or more values do not meet the booking requirements. Please review the form and try again.';
  if (error?.code === '23503') return 'Some journey details are no longer available. Please select the train and seats again.';
  if (error?.code === '23505') return 'This booking conflicts with an existing record. Please refresh and choose another seat.';
  return error?.message || fallback;
}

/**
 * Create a new booking with explicit transaction control (BEGIN, COMMIT, ROLLBACK)
 * and database function fn_calculate_ticket_fare (Requirement 3 & 5)
 */
async function createBooking(req, res) {
  const { scheduleId, boardingStopId, alightingStopId, paymentMethod, passenger, seatIds, coPassengerNames = [] } = req.body;

  if (!Array.isArray(seatIds) || seatIds.length < 1 || seatIds.length > MAX_TICKETS_PER_PURCHASE) {
    return res.status(400).json({ error: `A purchase must contain between 1 and ${MAX_TICKETS_PER_PURCHASE} seats.` });
  }
  if (new Set(seatIds.map(String)).size !== seatIds.length) {
    return res.status(400).json({ error: 'Each selected seat must be different.' });
  }
  if (!Array.isArray(coPassengerNames) || coPassengerNames.length !== Math.max(0, seatIds.length - 1) || coPassengerNames.some(name => !String(name || '').trim())) {
    return res.status(400).json({ error: 'Enter a full name for every co-passenger.' });
  }
  const detailError = passengerDetailsError(passenger || {});
  if (detailError) return res.status(400).json({ error: detailError });
  if (String(passenger.email).trim().toLowerCase() !== String(req.user.email).toLowerCase()) {
    return res.status(403).json({ error: 'The purchaser email must match the signed-in customer account.' });
  }

  const client = await pool.connect();
  try {
    // Explicit transaction control: BEGIN (Requirement 3)
    await client.query('BEGIN');

    const schedule = await client.query(
      'SELECT schedule_id, route_id, journey_date FROM schedule WHERE schedule_id=$1',
      [scheduleId]
    );
    if (!schedule.rows[0]) throw new Error('Selected schedule is no longer available.');

    const dailyTickets = await client.query(`
      SELECT count(*)::int AS ticket_count
      FROM ticket t
      JOIN passenger p ON p.passenger_id = t.passenger_id
      JOIN seat_availability sa ON sa.seat_avail_id = t.seat_avail_id
      JOIN schedule booked_schedule ON booked_schedule.schedule_id = sa.schedule_id
      WHERE lower(p.email) = lower($1)
        AND booked_schedule.journey_date = $2
        AND t.ticket_status = 'Booked'`, [req.user.email, schedule.rows[0].journey_date]);

    const bookedToday = Number(dailyTickets.rows[0]?.ticket_count || 0);
    if (bookedToday + seatIds.length > MAX_TICKETS_PER_PURCHASE) {
      throw new Error(`You already have ${bookedToday} booked ticket${bookedToday === 1 ? '' : 's'} for ${schedule.rows[0].journey_date}. You can book only ${Math.max(0, MAX_TICKETS_PER_PURCHASE - bookedToday)} more.`);
    }

    const stops = await client.query(
      'SELECT route_stop_id FROM route_stop WHERE route_id=$1 AND route_stop_id IN ($2,$3)',
      [schedule.rows[0].route_id, boardingStopId, alightingStopId]
    );
    if (stops.rows.length !== 2 || String(boardingStopId) === String(alightingStopId)) {
      throw new Error('Choose different valid boarding and destination stations.');
    }
    if (!['CARD', 'MOBILE_BANKING'].includes(paymentMethod)) {
      throw new Error('Choose a valid payment method.');
    }

    const purchaser = await client.query(
      'INSERT INTO passenger (name, email, phone, age, gender) VALUES ($1, $2, $3, $4, $5) RETURNING passenger_id, name, email, phone, age, gender',
      [passenger.name.trim(), passenger.email.trim().toLowerCase(), passenger.phone.trim(), Number(passenger.age), passenger.gender]
    );

    const created = [];
    const purchaseId = `RF-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    for (const [index, seatId] of seatIds.entries()) {
      // Use database function fn_calculate_ticket_fare (Requirement 5)
      const seat = await client.query(`
        SELECT st.seat_id, st.seat_no, c.coach_no, c.coach_class, fr.fare_rule_id,
          fn_calculate_ticket_fare(fr.base_fare, fr.fare_per_km, r.total_distance_km) AS calculated_fare
        FROM seat st
        JOIN coach c ON c.coach_id = st.coach_id
        JOIN schedule sc ON sc.train_id = c.train_id
        JOIN route r ON r.route_id = sc.route_id
        JOIN fare_rule fr ON fr.route_id = r.route_id AND fr.coach_class = c.coach_class
        WHERE sc.schedule_id = $1 AND st.seat_id = $2
          AND fr.effective_from <= sc.journey_date AND fr.effective_to >= sc.journey_date
        ORDER BY fr.effective_from DESC LIMIT 1`, [scheduleId, seatId]);

      if (!seat.rows[0]) throw new Error('A selected seat has no active fare rule for this journey.');
      const fare = Number(seat.rows[0].calculated_fare);

      let availability = await client.query(
        'SELECT seat_avail_id, seat_status FROM seat_availability WHERE schedule_id=$1 AND seat_id=$2 FOR UPDATE',
        [scheduleId, seatId]
      );
      let seatAvailId;
      if (!availability.rows[0]) {
        seatAvailId = (await client.query(
          "INSERT INTO seat_availability (seat_status, schedule_id, seat_id) VALUES ('Booked', $1, $2) RETURNING seat_avail_id",
          [scheduleId, seatId]
        )).rows[0].seat_avail_id;
      } else {
        if (String(availability.rows[0].seat_status).toUpperCase() !== 'AVAILABLE') {
          throw new Error('One or more seats were just booked. Please choose another seat.');
        }
        seatAvailId = (await client.query(
          "UPDATE seat_availability SET seat_status='Booked' WHERE seat_avail_id=$1 RETURNING seat_avail_id",
          [availability.rows[0].seat_avail_id]
        )).rows[0].seat_avail_id;
      }

      const traveller = index === 0
        ? purchaser.rows[0]
        : (await client.query(
            'INSERT INTO passenger (name, email, phone, age, gender) VALUES ($1, $2, $3, $4, $5) RETURNING passenger_id, name',
            [String(coPassengerNames[index - 1]).trim(), purchaser.rows[0].email, purchaser.rows[0].phone, purchaser.rows[0].age, purchaser.rows[0].gender]
          )).rows[0];

      // Insert ticket (which triggers trg_ticket_status_audit shadow audit table!)
      const ticket = await client.query(
        "INSERT INTO ticket (booking_date, ticket_status, fare_amount, passenger_id, boarding_stop_id, alighting_stop_id, fare_rule_id, seat_avail_id, booking_reference) VALUES (now(), 'Booked', $1, $2, $3, $4, $5, $6, $7) RETURNING ticket_id, ticket_status, fare_amount",
        [fare, traveller.passenger_id, boardingStopId, alightingStopId, seat.rows[0].fare_rule_id, seatAvailId, purchaseId]
      );

      const dbPaymentMethod = paymentMethod === 'MOBILE_BANKING' ? 'Wallet' : 'Credit Card';
      await client.query(
        "INSERT INTO payment (transaction_id, payment_date, payment_method, payment_status, amount, ticket_id) VALUES ($1, now(), $2, 'Success', $3, $4)",
        [`${purchaseId}-${index + 1}`, dbPaymentMethod, fare, ticket.rows[0].ticket_id]
      );

      created.push({
        ...ticket.rows[0],
        passenger_name: traveller.name,
        seat_id: seatId,
        seat_no: seat.rows[0].seat_no,
        coach_no: seat.rows[0].coach_no,
        coach_class: seat.rows[0].coach_class
      });
    }

    // Explicit transaction control: COMMIT (Requirement 3)
    await client.query('COMMIT');

    return res.status(201).json({
      purchase_id: purchaseId,
      ticket_count: created.length,
      passenger: purchaser.rows[0],
      tickets: created,
      total_amount: created.reduce((total, ticket) => total + Number(ticket.fare_amount), 0)
    });
  } catch (error) {
    // Explicit transaction control: ROLLBACK (Requirement 3)
    await client.query('ROLLBACK');
    return res.status(400).json({ error: clientError(error, 'Could not complete booking.') });
  } finally {
    client.release();
  }
}

/**
 * Cancel a booking using the PostgreSQL Stored Procedure `sp_cancel_booking` (Requirement 6)
 * Demonstrates Stored Procedure executing multi-table modifications in a single operation
 */
async function cancelBookingByReference(req, res) {
  const reference = req.params.reference;
  const reason = req.body.reason || 'Change of travel plan';

  const client = await pool.connect();
  try {
    // Check permission: customers can only cancel their own bookings
    const privileged = ['Admin', 'Manager', 'Staff'].includes(req.user.role);
    const bookingCheck = await client.query(`
      SELECT p.email
      FROM ticket t
      JOIN passenger p ON p.passenger_id = t.passenger_id
      WHERE COALESCE(t.booking_reference, 'LEGACY-' || t.ticket_id::text) = $1
        AND t.ticket_status = 'Booked'
      LIMIT 1`, [reference]);

    if (!bookingCheck.rows.length) {
      return res.status(400).json({ error: 'This booking cannot be cancelled (it may already be cancelled or not exist).' });
    }

    if (!privileged && String(bookingCheck.rows[0].email).toLowerCase() !== String(req.user.email).toLowerCase()) {
      return res.status(403).json({ error: 'You can only cancel your own booking.' });
    }

    // Explicit transaction control: BEGIN (Requirement 3)
    await client.query('BEGIN');

    // Call Stored Procedure sp_cancel_booking (Requirement 6)
    // Procedure modifies cancellation, ticket, seat_availability, payment
    // and fires the shadow audit trigger trg_ticket_status_audit (Requirement 4)
    const procResult = await client.query(
      'CALL sp_cancel_booking($1, $2, $3, $4)',
      [reference, reason, 0, 0]
    );

    // Explicit transaction control: COMMIT (Requirement 3)
    await client.query('COMMIT');

    const refundAmount = procResult.rows[0]?.p_refund_total || 0;
    const feePercent = procResult.rows[0]?.p_fee_percent || 0;

    return res.json({
      booking_reference: reference,
      fee_percent: Number(feePercent),
      refund_amount: Number(refundAmount)
    });
  } catch (error) {
    // Explicit transaction control: ROLLBACK (Requirement 3)
    await client.query('ROLLBACK');
    return res.status(error.status || 400).json({
      error: clientError(error, 'Could not cancel booking.')
    });
  } finally {
    client.release();
  }
}

module.exports = {
  createBooking,
  cancelBookingByReference
};
