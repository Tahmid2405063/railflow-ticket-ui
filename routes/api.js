const crypto = require('crypto');
const express = require('express');
const pool = require('../connection');
const router = express.Router();
const sessions = new Map();
const MAX_TICKETS_PER_PURCHASE = 4;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) {
    const input = Buffer.from(String(password));
    const legacy = Buffer.from(String(stored || ''));
    return input.length === legacy.length && crypto.timingSafeEqual(input, legacy);
  }
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const user = token && sessions.get(token);
  if (!user) return res.status(401).json({ error: 'Please sign in to continue.' });
  req.user = user;
  next();
}
function ticketFare(row) {
  return Math.ceil(Number(row.base_fare) + Number(row.fare_per_km) * Number(row.total_distance_km));
}

router.get('/health', async (_req, res) => {
  try { await pool.query('select 1'); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false, error: 'Database is unavailable.' }); }
});

router.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || String(password).length < 8) return res.status(400).json({ error: 'Name, email, and an 8-character password are required.' });
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await client.query(
      'insert into users (name, email, role, "Password") values ($1, $2, $3, $4) returning user_id, name, email, role',
      [name.trim(), email.trim().toLowerCase(), 'Customer', hashPassword(password)]
    );
    await client.query('commit');
    const user = result.rows[0]; const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, user);
    res.status(201).json({ token, user });
  } catch (error) {
    await client.query('rollback');
    const messages = {
      '23505': 'An account with that email already exists. Please sign in instead.',
      '23514': 'Your account details do not meet the registration requirements.',
      '22001': 'One of the account details is too long. Please shorten it and try again.'
    };
    res.status(error.code === '23505' ? 409 : 500).json({ error: messages[error.code] || 'Account creation could not be completed. Please try again.' });
  } finally { client.release(); }
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  try {
    const result = await pool.query('select user_id, name, email, role, "Password" from users where lower(email) = lower($1)', [email.trim()]);
    const row = result.rows[0];
    if (!row || !verifyPassword(password, row.Password)) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!String(row.Password).includes(':')) await pool.query('update users set "Password"=$1 where user_id=$2', [hashPassword(password), row.user_id]);
    const user = { user_id: row.user_id, name: row.name, email: row.email, role: row.role };
    const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, user);
    res.json({ token, user });
  } catch { res.status(500).json({ error: 'Could not sign in.' }); }
});

router.get('/profile', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      select u.user_id, u.name, u.email, u.role,
        p.passenger_id, p.phone, p.age, p.gender
      from users u
      left join lateral (
        select passenger_id, phone, age, gender
        from passenger where lower(email)=lower(u.email)
        order by passenger_id desc limit 1
      ) p on true
      where u.user_id=$1`, [req.user.user_id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Account not found.' });
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Could not load personal information.' }); }
});

router.put('/profile', requireAuth, async (req, res) => {
  const { name, email, phone, age, gender } = req.body;
  if (!name || !email || !phone || !age || !gender) return res.status(400).json({ error: 'Name, email, phone, age, and gender are required.' });
  const client = await pool.connect();
  try {
    await client.query('begin');
    const account = await client.query('select email from users where user_id=$1 for update', [req.user.user_id]);
    if (!account.rows[0]) throw new Error('Account not found.');
    const oldEmail = account.rows[0].email;
    const user = await client.query('update users set name=$1, email=$2 where user_id=$3 returning user_id,name,email,role', [name.trim(), email.trim().toLowerCase(), req.user.user_id]);
    const existingPassenger = await client.query('select passenger_id from passenger where lower(email)=lower($1) order by passenger_id desc limit 1 for update', [oldEmail]);
    let passenger;
    if (existingPassenger.rows[0]) passenger = await client.query('update passenger set name=$1,email=$2,phone=$3,age=$4,gender=$5 where passenger_id=$6 returning passenger_id,phone,age,gender', [name.trim(), email.trim().toLowerCase(), phone.trim(), Number(age), gender, existingPassenger.rows[0].passenger_id]);
    else passenger = await client.query('insert into passenger (name,email,phone,age,gender) values ($1,$2,$3,$4,$5) returning passenger_id,phone,age,gender', [name.trim(), email.trim().toLowerCase(), phone.trim(), Number(age), gender]);
    await client.query('commit');
    req.user = user.rows[0];
    for (const [token, value] of sessions) if (value.user_id === req.user.user_id) sessions.set(token, req.user);
    res.json({ ...user.rows[0], ...passenger.rows[0] });
  } catch (error) {
    await client.query('rollback');
    res.status(error.code === '23505' ? 409 : 400).json({ error: error.code === '23505' ? 'That email is already used by another account.' : error.message || 'Could not save personal information.' });
  } finally { client.release(); }
});

router.get('/schedules', async (req, res) => {
  try {
    const result = await pool.query(`
      select s.schedule_id, s.journey_date, s.departure_time, s.arrival_time, t.train_id, t.train_name, t.train_type,
        r.route_id, r.route_name, r.total_distance_km, fr.fare_rule_id, fr.coach_class, fr.base_fare, fr.fare_per_km,
        first_stop.route_stop_id as boarding_stop_id, first_station.station_name as from_station, first_station.city as from_city,
        last_stop.route_stop_id as alighting_stop_id, last_station.station_name as to_station, last_station.city as to_city,
        coalesce(availability.available_seats, 0) as available_seats
      from schedule s join train t on t.train_id=s.train_id join route r on r.route_id=s.route_id
      left join lateral (select * from fare_rule where route_id=r.route_id and (effective_from is null or effective_from<=s.journey_date) and (effective_to is null or effective_to>=s.journey_date) order by effective_from desc nulls last limit 1) fr on true
      join lateral (select * from route_stop where route_id=r.route_id order by stop_sequence asc limit 1) first_stop on true
      join station first_station on first_station.station_id=first_stop.station_id
      join lateral (select * from route_stop where route_id=r.route_id order by stop_sequence desc limit 1) last_stop on true
      join station last_station on last_station.station_id=last_stop.station_id
      left join lateral (
        select count(*) filter (where upper(coalesce(sa.seat_status,'AVAILABLE'))='AVAILABLE') as available_seats
        from coach c join seat st on st.coach_id=c.coach_id
        left join seat_availability sa on sa.schedule_id=s.schedule_id and sa.seat_id=st.seat_id
        where c.train_id=s.train_id
      ) availability on true
      where ($1::date is null or s.journey_date=$1::date) order by s.journey_date, s.departure_time`, [req.query.date || null]);
    res.json(result.rows.map(row => ({ ...row, fare_amount: row.fare_rule_id ? ticketFare(row) : null })));
  } catch { res.status(500).json({ error: 'Could not load schedules.' }); }
});

router.get('/schedules/:scheduleId/seats', async (req, res) => {
  try {
    const result = await pool.query(`
      select c.coach_id, c.coach_no, c.coach_class, st.seat_id, st.seat_no, st.seat_type,
        upper(coalesce(sa.seat_status, 'AVAILABLE')) as seat_status, sa.seat_avail_id
      from schedule sc join coach c on c.train_id=sc.train_id join seat st on st.coach_id=c.coach_id
      left join seat_availability sa on sa.schedule_id=sc.schedule_id and sa.seat_id=st.seat_id
      where sc.schedule_id=$1 order by c.coach_no, st.seat_no`, [req.params.scheduleId]);
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Could not load seats.' }); }
});

router.get('/schedules/:scheduleId/stops', async (req, res) => {
  try {
    const result = await pool.query(`
      select rs.route_stop_id, rs.stop_sequence, rs.arrival_time, rs.dept_time,
        st.station_id, st.station_name, st.city
      from schedule sc
      join route_stop rs on rs.route_id=sc.route_id
      join station st on st.station_id=rs.station_id
      where sc.schedule_id=$1
      order by rs.stop_sequence`, [req.params.scheduleId]);
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Could not load boarding stations.' }); }
});

router.post('/bookings', requireAuth, async (req, res) => {
  const { scheduleId, fareRuleId, boardingStopId, alightingStopId, paymentMethod, passengers } = req.body;
  if (!Array.isArray(passengers) || passengers.length < 1 || passengers.length > MAX_TICKETS_PER_PURCHASE) return res.status(400).json({ error: `A purchase must contain between 1 and ${MAX_TICKETS_PER_PURCHASE} tickets.` });
  if (new Set(passengers.map(p => p.seatId)).size !== passengers.length) return res.status(400).json({ error: 'Each ticket must use a different seat.' });
  const client = await pool.connect();
  try {
    await client.query('begin');
    const context = await client.query(`select s.schedule_id, r.total_distance_km, fr.fare_rule_id, fr.base_fare, fr.fare_per_km from schedule s join route r on r.route_id=s.route_id join fare_rule fr on fr.fare_rule_id=$2 and fr.route_id=r.route_id where s.schedule_id=$1`, [scheduleId, fareRuleId]);
    if (!context.rows[0]) throw new Error('Selected schedule or fare rule is no longer available.');
    const fare = ticketFare(context.rows[0]); const created = []; const transactionId = `RF-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    for (const passenger of passengers) {
      if (!passenger.name || !passenger.email || !passenger.phone || !passenger.age || !passenger.gender || !passenger.seatId) throw new Error('Complete passenger details are required for every ticket.');
      const seat = await client.query(`select st.seat_id from seat st join coach c on c.coach_id=st.coach_id join schedule sc on sc.train_id=c.train_id where sc.schedule_id=$1 and st.seat_id=$2`, [scheduleId, passenger.seatId]);
      if (!seat.rows[0]) throw new Error('A selected seat does not belong to this schedule.');
      let availability = await client.query('select seat_avail_id, seat_status from seat_availability where schedule_id=$1 and seat_id=$2 for update', [scheduleId, passenger.seatId]);
      let seatAvailId;
      if (!availability.rows[0]) seatAvailId = (await client.query("insert into seat_availability (seat_status, schedule_id, seat_id) values ('BOOKED',$1,$2) returning seat_avail_id", [scheduleId, passenger.seatId])).rows[0].seat_avail_id;
      else { if (String(availability.rows[0].seat_status).toUpperCase() !== 'AVAILABLE') throw new Error('One or more seats were just booked. Please choose another seat.'); seatAvailId = (await client.query("update seat_availability set seat_status='BOOKED' where seat_avail_id=$1 returning seat_avail_id", [availability.rows[0].seat_avail_id])).rows[0].seat_avail_id; }
      const passengerRow = await client.query('insert into passenger (name,email,phone,age,gender) values ($1,$2,$3,$4,$5) returning passenger_id', [passenger.name, passenger.email, passenger.phone, Number(passenger.age), passenger.gender]);
      const ticket = await client.query("insert into ticket (booking_date,ticket_status,fare_amount,passenger_id,boarding_stop_id,alighting_stop_id,fare_rule_id,seat_avail_id) values (now(),'CONFIRMED',$1,$2,$3,$4,$5,$6) returning ticket_id, ticket_status, fare_amount", [fare, passengerRow.rows[0].passenger_id, boardingStopId, alightingStopId, fareRuleId, seatAvailId]);
      await client.query("insert into payment (transaction_id,payment_date,payment_method,payment_status,amount,ticket_id) values ($1,now(),$2,'PAID',$3,$4)", [transactionId, paymentMethod || 'CARD', fare, ticket.rows[0].ticket_id]);
      created.push({ ...ticket.rows[0], passenger_id: passengerRow.rows[0].passenger_id, seat_id: passenger.seatId });
    }
    await client.query('commit');
    res.status(201).json({ transaction_id: transactionId, ticket_count: created.length, tickets: created, total_amount: fare * created.length });
  } catch (error) { await client.query('rollback'); res.status(400).json({ error: error.message || 'Could not complete booking.' }); }
  finally { client.release(); }
});

router.post('/tickets/:ticketId/cancel', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const ticket = await client.query('select ticket_id, fare_amount, seat_avail_id from ticket where ticket_id=$1 and ticket_status=$2 for update', [req.params.ticketId, 'CONFIRMED']);
    if (!ticket.rows[0]) throw new Error('This ticket cannot be cancelled.');
    const refund = Math.max(0, Number(ticket.rows[0].fare_amount) - 150);
    await client.query("insert into cancellation (cancellation_date,reason,refund_amount,ticket_id) values (now(),$1,$2,$3)", [req.body.reason || 'Change of travel plan', refund, ticket.rows[0].ticket_id]);
    await client.query("update ticket set ticket_status='CANCELLED' where ticket_id=$1", [ticket.rows[0].ticket_id]);
    await client.query("update seat_availability set seat_status='AVAILABLE' where seat_avail_id=$1", [ticket.rows[0].seat_avail_id]);
    await client.query("update payment set payment_status='REFUND_PENDING' where ticket_id=$1", [ticket.rows[0].ticket_id]);
    await client.query('commit'); res.json({ ticket_id: ticket.rows[0].ticket_id, refund_amount: refund });
  } catch (error) { await client.query('rollback'); res.status(400).json({ error: error.message || 'Could not cancel ticket.' }); }
  finally { client.release(); }
});

module.exports = router;
