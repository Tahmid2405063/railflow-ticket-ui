const pool = require('../connection');

function clientError(error, fallback) {
  if (error?.code === '23514') return 'One or more values do not meet the booking requirements. Please review the form and try again.';
  if (error?.code === '23503') return 'Some journey details are no longer available. Please select the train and seats again.';
  if (error?.code === '23505') return 'This booking conflicts with an existing record. Please refresh and choose another seat.';
  return error?.message || fallback;
}

/**
 * Get all tickets/bookings for current user or admin
 * Complex Query #1 (Requirement 7): Multi-table join across 7 tables with aggregation functions
 */
async function getTickets(req, res) {
  try {
    const privileged = ['Admin', 'Manager', 'Staff'].includes(req.user.role);
    const result = await pool.query(`
      SELECT COALESCE(t.booking_reference, 'LEGACY-' || t.ticket_id::text) AS booking_reference,
        min(t.booking_date) AS booking_date,
        string_agg(DISTINCT t.ticket_status, ', ') AS ticket_status,
        sum(t.fare_amount) AS fare_amount,
        min(p.email) AS passenger_email,
        min(s.schedule_id) AS schedule_id,
        to_char(min(s.journey_date), 'YYYY-MM-DD') AS journey_date,
        min(tr.train_name) AS train_name,
        string_agg(c.coach_no || '-' || st.seat_no, ', ' ORDER BY c.coach_no || '-' || st.seat_no) AS seats,
        count(*)::int AS seat_count,
        string_agg(p.name, ', ' ORDER BY t.ticket_id) AS passenger_names
      FROM ticket t
      JOIN passenger p ON p.passenger_id = t.passenger_id
      JOIN seat_availability sa ON sa.seat_avail_id = t.seat_avail_id
      JOIN seat st ON st.seat_id = sa.seat_id
      JOIN coach c ON c.coach_id = st.coach_id
      JOIN schedule s ON s.schedule_id = sa.schedule_id
      JOIN train tr ON tr.train_id = s.train_id
      WHERE ($1::boolean OR (lower(p.email) = lower($2) AND t.ticket_status = 'Booked' AND s.journey_date >= (now() AT TIME ZONE 'Asia/Dhaka')::date))
      GROUP BY COALESCE(t.booking_reference, 'LEGACY-' || t.ticket_id::text)
      ORDER BY min(t.booking_date) DESC`, [privileged, req.user.email]);

    return res.json(result.rows.map(row => ({
      ...row,
      fare_amount: Number(row.fare_amount || 0)
    })));
  } catch {
    return res.status(500).json({ error: 'Could not load tickets.' });
  }
}

/**
 * Get detailed booking receipt by booking reference
 * Complex Query #2 (Requirement 7): 10-table join including route stops and stations
 */
async function getBookingByReference(req, res) {
  try {
    const privileged = ['Admin', 'Manager', 'Staff'].includes(req.user.role);
    const result = await pool.query(`
      SELECT t.ticket_id,
        COALESCE(t.booking_reference, 'LEGACY-' || t.ticket_id::text) AS booking_reference,
        t.booking_date, t.ticket_status, t.fare_amount,
        p.name AS passenger_name, p.email AS passenger_email, p.phone,
        tr.train_name, to_char(s.journey_date, 'YYYY-MM-DD') AS journey_date, s.departure_time, s.arrival_time,
        fr.coach_class, c.coach_no, st.seat_no,
        board.station_name AS boarding_station,
        alight.station_name AS alighting_station,
        pay.payment_method, pay.payment_status
      FROM ticket t
      JOIN passenger p ON p.passenger_id = t.passenger_id
      JOIN seat_availability sa ON sa.seat_avail_id = t.seat_avail_id
      JOIN seat st ON st.seat_id = sa.seat_id
      JOIN coach c ON c.coach_id = st.coach_id
      JOIN schedule s ON s.schedule_id = sa.schedule_id
      JOIN train tr ON tr.train_id = s.train_id
      LEFT JOIN fare_rule fr ON fr.fare_rule_id = t.fare_rule_id
      JOIN route_stop br ON br.route_stop_id = t.boarding_stop_id
      JOIN station board ON board.station_id = br.station_id
      JOIN route_stop ar ON ar.route_stop_id = t.alighting_stop_id
      JOIN station alight ON alight.station_id = ar.station_id
      LEFT JOIN payment pay ON pay.ticket_id = t.ticket_id
      WHERE COALESCE(t.booking_reference, 'LEGACY-' || t.ticket_id::text) = $1
        AND ($2::boolean OR (lower(p.email) = lower($3) AND t.ticket_status = 'Booked'))
      ORDER BY t.ticket_id`, [req.params.reference, privileged, req.user.email]);

    if (!result.rows.length) return res.status(404).json({ error: 'Booking not found.' });
    return res.json(result.rows.map(row => ({
      ...row,
      fare_amount: Number(row.fare_amount || 0)
    })));
  } catch {
    return res.status(500).json({ error: 'Could not load booking details.' });
  }
}

/**
 * Cancel a single ticket with explicit transaction control (Requirement 3)
 * Uses database function fn_calculate_cancellation_refund (Requirement 5)
 * and fires shadow audit trigger trg_ticket_status_audit (Requirement 4)
 */
async function cancelTicket(req, res) {
  const client = await pool.connect();
  try {
    // Explicit transaction control: BEGIN (Requirement 3)
    await client.query('BEGIN');

    const ticket = await client.query(`
      SELECT t.ticket_id, t.fare_amount, t.seat_avail_id, p.email AS passenger_email,
        s.journey_date, s.departure_time
      FROM ticket t
      JOIN passenger p ON p.passenger_id = t.passenger_id
      JOIN seat_availability sa ON sa.seat_avail_id = t.seat_avail_id
      JOIN schedule s ON s.schedule_id = sa.schedule_id
      WHERE t.ticket_id = $1 AND t.ticket_status = $2
      FOR UPDATE`, [req.params.ticketId, 'Booked']);

    if (!ticket.rows[0]) throw new Error('This ticket cannot be cancelled.');

    const privileged = ['Admin', 'Manager', 'Staff'].includes(req.user.role);
    if (!privileged && String(ticket.rows[0].passenger_email).toLowerCase() !== String(req.user.email).toLowerCase()) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only cancel your own tickets.' });
    }

    // Call database function fn_calculate_cancellation_refund (Requirement 5)
    const refundCalc = await client.query(
      'SELECT * FROM fn_calculate_cancellation_refund($1, $2, $3)',
      [ticket.rows[0].fare_amount, ticket.rows[0].journey_date, ticket.rows[0].departure_time]
    );

    const refund = Number(refundCalc.rows[0]?.refund_amount || 0);

    // Multi-table updates
    await client.query(
      'INSERT INTO cancellation (cancellation_date, reason, refund_amount, ticket_id) VALUES (now(), $1, $2, $3)',
      [req.body.reason || 'Change of travel plan', refund, ticket.rows[0].ticket_id]
    );

    // Triggers shadow audit log (Requirement 4)
    await client.query("UPDATE ticket SET ticket_status='Cancelled' WHERE ticket_id=$1", [ticket.rows[0].ticket_id]);
    await client.query("UPDATE seat_availability SET seat_status='Available' WHERE seat_avail_id=$1", [ticket.rows[0].seat_avail_id]);
    await client.query("UPDATE payment SET payment_status='Refunded' WHERE ticket_id=$1", [ticket.rows[0].ticket_id]);

    // Explicit transaction control: COMMIT (Requirement 3)
    await client.query('COMMIT');

    return res.json({ ticket_id: ticket.rows[0].ticket_id, refund_amount: refund });
  } catch (error) {
    // Explicit transaction control: ROLLBACK (Requirement 3)
    await client.query('ROLLBACK');
    return res.status(400).json({ error: clientError(error, 'Could not cancel ticket.') });
  } finally {
    client.release();
  }
}

module.exports = {
  getTickets,
  getBookingByReference,
  cancelTicket
};
