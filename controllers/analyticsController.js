const pool = require('../connection');

/**
 * Analytics Controller
 * Fulfills Requirement 7: Complex Queries with multi-table joins and aggregation functions
 */

/**
 * Complex Query #1: Top Routes by Revenue and Passenger Volume
 * Multi-table join across ticket, fare_rule, route, schedule, and train with multiple aggregations
 */
async function getTopRoutes(_req, res) {
  try {
    const result = await pool.query(`
      SELECT 
        r.route_id,
        r.route_name,
        r.total_distance_km,
        COUNT(t.ticket_id)::int AS total_passengers,
        COUNT(DISTINCT s.schedule_id)::int AS trips_conducted,
        COALESCE(SUM(t.fare_amount), 0)::numeric AS total_revenue,
        ROUND(COALESCE(AVG(t.fare_amount), 0), 2)::numeric AS average_ticket_fare
      FROM route r
      JOIN schedule s ON s.route_id = r.route_id
      JOIN seat_availability sa ON sa.schedule_id = s.schedule_id
      JOIN ticket t ON t.seat_avail_id = sa.seat_avail_id
      WHERE t.ticket_status = 'Booked'
      GROUP BY r.route_id, r.route_name, r.total_distance_km
      ORDER BY total_revenue DESC
      LIMIT 5
    `);
    return res.json(result.rows);
  } catch (error) {
    console.error('Analytics Top Routes Error:', error);
    return res.status(500).json({ error: 'Could not load top routes analytics.' });
  }
}

/**
 * Complex Query #2: Train Fleet Performance and Occupancy Analysis
 * Multi-table join across train, schedule, coach, seat, and seat_availability
 * Uses database statistical function fn_get_schedule_occupancy (Requirement 5)
 */
async function getTrainPerformance(_req, res) {
  try {
    const result = await pool.query(`
      SELECT 
        t.train_id,
        t.train_name,
        t.train_type,
        COUNT(DISTINCT s.schedule_id)::int AS total_schedules,
        COUNT(DISTINCT c.coach_id)::int AS total_coaches,
        COUNT(st.seat_id)::int AS fleet_capacity,
        COUNT(sa.seat_avail_id) FILTER (WHERE UPPER(sa.seat_status) = 'BOOKED')::int AS total_seats_booked,
        ROUND(
          COALESCE(
            AVG(fn_get_schedule_occupancy(s.schedule_id)),
            0
          ), 
          2
        )::numeric AS average_occupancy_percent
      FROM train t
      LEFT JOIN schedule s ON s.train_id = t.train_id
      LEFT JOIN coach c ON c.train_id = t.train_id
      LEFT JOIN seat st ON st.coach_id = c.coach_id
      LEFT JOIN seat_availability sa ON sa.schedule_id = s.schedule_id AND sa.seat_id = st.seat_id
      GROUP BY t.train_id, t.train_name, t.train_type
      ORDER BY average_occupancy_percent DESC, total_seats_booked DESC
    `);
    return res.json(result.rows);
  } catch (error) {
    console.error('Analytics Train Performance Error:', error);
    return res.status(500).json({ error: 'Could not load train performance analytics.' });
  }
}

/**
 * Complex Query #3: Booking & Cancellation Financial Summary
 * Multi-table aggregation across ticket, payment, and cancellation
 */
async function getFinancialSummary(_req, res) {
  try {
    const result = await pool.query(`
      SELECT 
        t.ticket_status,
        COUNT(t.ticket_id)::int AS ticket_count,
        COALESCE(SUM(t.fare_amount), 0)::numeric AS gross_amount,
        COALESCE(SUM(c.refund_amount), 0)::numeric AS refunded_amount,
        (COALESCE(SUM(t.fare_amount), 0) - COALESCE(SUM(c.refund_amount), 0))::numeric AS net_revenue
      FROM ticket t
      LEFT JOIN cancellation c ON c.ticket_id = t.ticket_id
      GROUP BY t.ticket_status
      ORDER BY t.ticket_status
    `);
    return res.json(result.rows);
  } catch (error) {
    console.error('Analytics Financial Summary Error:', error);
    return res.status(500).json({ error: 'Could not load financial summary.' });
  }
}

/**
 * Complex Query #4: Shadow Audit Log History (Demonstrating Trigger Requirement 4)
 */
async function getAuditLogs(_req, res) {
  try {
    const result = await pool.query(`
      SELECT 
        a.audit_id,
        a.ticket_id,
        a.old_status,
        a.new_status,
        a.changed_at,
        a.action_note,
        t.booking_reference,
        p.name AS passenger_name
      FROM ticket_audit_log a
      LEFT JOIN ticket t ON t.ticket_id = a.ticket_id
      LEFT JOIN passenger p ON p.passenger_id = t.passenger_id
      ORDER BY a.changed_at DESC
      LIMIT 15
    `);
    return res.json(result.rows);
  } catch (error) {
    console.error('Analytics Audit Logs Error:', error);
    return res.status(500).json({ error: 'Could not load audit logs.' });
  }
}

module.exports = {
  getTopRoutes,
  getTrainPerformance,
  getFinancialSummary,
  getAuditLogs
};
