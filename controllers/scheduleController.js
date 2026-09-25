const pool = require('../connection');

/**
 * Get station suggestions
 */
async function getStations(_req, res) {
  try {
    const result = await pool.query(
      'SELECT min(station_id) as station_id, min(station_name) as station_name, city FROM station GROUP BY city ORDER BY city'
    );
    return res.json(result.rows);
  } catch {
    return res.status(500).json({ error: 'Could not load station suggestions.' });
  }
}

/**
 * Search schedules using multi-table joins and the database function fn_calculate_ticket_fare (Requirement 5)
 */
async function getSchedules(req, res) {
  const date = String(req.query.date || '').trim() || null;
  const from = String(req.query.from || '').trim() || null;
  const to = String(req.query.to || '').trim() || null;
  const seatClass = String(req.query.seatClass || '').trim() || null;

  try {
    // Note: fn_calculate_ticket_fare is called directly in SQL to compute fare via database function (Requirement 5)
    const result = await pool.query(`
      SELECT s.schedule_id, to_char(s.journey_date, 'YYYY-MM-DD') AS journey_date, s.departure_time, s.arrival_time, t.train_id, t.train_name, t.train_type,
        r.route_id, r.route_name, r.total_distance_km, fr.fare_rule_id, fr.coach_class, fr.base_fare, fr.fare_per_km,
        first_stop.route_stop_id AS boarding_stop_id, first_station.station_name AS from_station, first_station.city AS from_city,
        last_stop.route_stop_id AS alighting_stop_id, last_station.station_name AS to_station, last_station.city AS to_city,
        COALESCE(availability.available_seats, 0) AS available_seats,
        COALESCE(availability.available_classes, '') AS available_classes,
        COALESCE(availability.available_coaches, '') AS available_coaches,
        CASE
          WHEN fr.fare_rule_id IS NOT NULL THEN fn_calculate_ticket_fare(fr.base_fare, fr.fare_per_km, r.total_distance_km)
          ELSE NULL
        END AS fare_amount
      FROM schedule s
      JOIN train t ON t.train_id = s.train_id
      JOIN route r ON r.route_id = s.route_id
      LEFT JOIN LATERAL (
        SELECT * FROM fare_rule
        WHERE route_id = r.route_id
          AND ($4::text IS NULL OR coach_class = $4)
          AND (effective_from IS NULL OR effective_from <= s.journey_date)
          AND (effective_to IS NULL OR effective_to >= s.journey_date)
        ORDER BY effective_from DESC NULLS LAST LIMIT 1
      ) fr ON true
      JOIN LATERAL (
        SELECT * FROM route_stop WHERE route_id = r.route_id ORDER BY stop_sequence ASC LIMIT 1
      ) first_stop ON true
      JOIN station first_station ON first_station.station_id = first_stop.station_id
      JOIN LATERAL (
        SELECT * FROM route_stop WHERE route_id = r.route_id ORDER BY stop_sequence DESC LIMIT 1
      ) last_stop ON true
      JOIN station last_station ON last_station.station_id = last_stop.station_id
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE UPPER(COALESCE(sa.seat_status,'AVAILABLE')) = 'AVAILABLE') AS available_seats,
          string_agg(DISTINCT c.coach_class, ', ' ORDER BY c.coach_class) FILTER (WHERE UPPER(COALESCE(sa.seat_status,'AVAILABLE')) = 'AVAILABLE') AS available_classes,
          string_agg(DISTINCT c.coach_no || ' · ' || c.coach_class, ', ') FILTER (WHERE UPPER(COALESCE(sa.seat_status,'AVAILABLE')) = 'AVAILABLE') AS available_coaches
        FROM coach c
        JOIN seat st ON st.coach_id = c.coach_id
        LEFT JOIN seat_availability sa ON sa.schedule_id = s.schedule_id AND sa.seat_id = st.seat_id
        WHERE c.train_id = s.train_id
      ) availability ON true
      WHERE ($1::date IS NULL OR (s.journey_date = $1::date AND s.journey_date BETWEEN (now() AT TIME ZONE 'Asia/Dhaka')::date AND (now() AT TIME ZONE 'Asia/Dhaka')::date + 10))
        AND ($2::text IS NULL OR lower(first_station.city) = lower($2) OR lower(first_station.station_name) = lower($2))
        AND ($3::text IS NULL OR lower(last_station.city) = lower($3) OR lower(last_station.station_name) = lower($3))
        AND ($4::text IS NULL OR EXISTS (SELECT 1 FROM coach requested_coach WHERE requested_coach.train_id = t.train_id AND requested_coach.coach_class = $4))
      ORDER BY s.journey_date, s.departure_time`, [date, from, to, seatClass]);

    return res.json(result.rows.map(row => ({
      ...row,
      fare_amount: row.fare_amount != null ? Number(row.fare_amount) : null
    })));
  } catch (err) {
    console.error('Error fetching schedules:', err);
    return res.status(500).json({ error: 'Could not load schedules.' });
  }
}

/**
 * Get seats for a schedule including availability and user-booked count
 */
async function getScheduleSeats(req, res) {
  try {
    const result = await pool.query(`
      SELECT c.coach_id, c.coach_no, c.coach_class, st.seat_id, st.seat_no, st.seat_type,
        UPPER(COALESCE(sa.seat_status, 'AVAILABLE')) AS seat_status, sa.seat_avail_id,
        (SELECT count(*)::int
         FROM ticket booked_ticket
         JOIN passenger booked_passenger ON booked_passenger.passenger_id = booked_ticket.passenger_id
         JOIN seat_availability booked_availability ON booked_availability.seat_avail_id = booked_ticket.seat_avail_id
         JOIN schedule booked_schedule ON booked_schedule.schedule_id = booked_availability.schedule_id
         WHERE lower(booked_passenger.email) = lower($2)
           AND booked_schedule.journey_date = sc.journey_date
           AND booked_ticket.ticket_status = 'Booked') AS booked_by_user
      FROM schedule sc
      JOIN coach c ON c.train_id = sc.train_id
      JOIN seat st ON st.coach_id = c.coach_id
      LEFT JOIN seat_availability sa ON sa.schedule_id = sc.schedule_id AND sa.seat_id = st.seat_id
      WHERE sc.schedule_id = $1
      ORDER BY c.coach_no, st.seat_no`, [req.params.scheduleId, req.user.email]);

    return res.json(result.rows);
  } catch {
    return res.status(500).json({ error: 'Could not load seats.' });
  }
}

/**
 * Get boarding stops for a schedule
 */
async function getScheduleStops(req, res) {
  try {
    const result = await pool.query(`
      SELECT rs.route_stop_id, rs.stop_sequence, rs.arrival_time, rs.dept_time,
        st.station_id, st.station_name, st.city
      FROM schedule sc
      JOIN route_stop rs ON rs.route_id = sc.route_id
      JOIN station st ON st.station_id = rs.station_id
      WHERE sc.schedule_id = $1
      ORDER BY rs.stop_sequence`, [req.params.scheduleId]);

    return res.json(result.rows);
  } catch {
    return res.status(500).json({ error: 'Could not load boarding stations.' });
  }
}

/**
 * Get fare breakdown using database function fn_calculate_ticket_fare (Requirement 5)
 */
async function getScheduleFares(req, res) {
  try {
    const result = await pool.query(`
      SELECT fr.fare_rule_id, fr.coach_class, fr.base_fare, fr.fare_per_km, r.total_distance_km,
        fn_calculate_ticket_fare(fr.base_fare, fr.fare_per_km, r.total_distance_km) AS fare_amount
      FROM schedule s
      JOIN route r ON r.route_id = s.route_id
      JOIN fare_rule fr ON fr.route_id = r.route_id
      WHERE s.schedule_id = $1
        AND fr.effective_from <= s.journey_date
        AND fr.effective_to >= s.journey_date
      ORDER BY fr.coach_class`, [req.params.scheduleId]);

    return res.json(result.rows.map(row => ({
      ...row,
      fare_amount: Number(row.fare_amount || 0)
    })));
  } catch {
    return res.status(500).json({ error: 'Could not load class fares.' });
  }
}

module.exports = {
  getStations,
  getSchedules,
  getScheduleSeats,
  getScheduleStops,
  getScheduleFares
};
