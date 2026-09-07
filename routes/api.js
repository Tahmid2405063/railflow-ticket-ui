const crypto = require('crypto');
const express = require('express');
const pool = require('../connection');
const router = express.Router();
const sessions = new Map();
const SESSION_TTL_MS = 5 * 60 * 1000;
const MAX_TICKETS_PER_PURCHASE = 4;
const VALID_GENDERS = new Set(['Male', 'Female', 'Other']);
const ROLES = new Set(['Admin', 'Manager', 'Staff', 'Customer']);

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
function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  const session = token && sessions.get(token);
  if (!session) return res.status(401).json({ error: 'Please sign in to continue.' });
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Your session has expired after 5 minutes. Please sign in again.' });
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  req.user = session.user;
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    next();
  };
}
function ticketFare(row) {
  return Math.ceil(Number(row.base_fare) + Number(row.fare_per_km) * Number(row.total_distance_km));
}
function passengerDetailsError({ name, email, phone, age, gender }) {
  if (!name || !email || !phone || age === undefined || age === null || String(age).trim() === '' || !gender) return 'Complete passenger details are required.';
  if (!/^\d+$/.test(String(phone).trim())) return 'Phone number must contain digits only.';
  const numericAge = Number(age);
  if (!Number.isInteger(numericAge) || numericAge < 1 || numericAge > 120) return 'Age must be a whole number from 1 to 120.';
  if (!VALID_GENDERS.has(gender)) return 'Choose Male, Female, or Other for gender.';
  return null;
}
function clientError(error, fallback) {
  if (error?.code === '23514') return 'One or more values do not meet the booking requirements. Please review the form and try again.';
  if (error?.code === '23503') return 'Some journey details are no longer available. Please select the train and seats again.';
  if (error?.code === '23505') return 'This booking conflicts with an existing record. Please refresh and choose another seat.';
  return error?.message || fallback;
}

router.get('/health', async (_req, res) => {
  try { await pool.query('select 1'); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false, error: 'Database is unavailable.' }); }
});

router.post('/auth/register', async (req, res) => {
  const { name, email, password, mobileNumber, nidNumber } = req.body;
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Full name is required.' });
  if (!String(email || '').trim()) return res.status(400).json({ error: 'Email address is required.' });
  if (!String(password || '')) return res.status(400).json({ error: 'Password is required.' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });
  if (!String(mobileNumber || '').trim()) return res.status(400).json({ error: 'Mobile number is required.' });
  if (!String(nidNumber || '').trim()) return res.status(400).json({ error: 'NID number is required.' });
  if (!/^\d{11}$/.test(String(mobileNumber))) return res.status(400).json({ error: 'Mobile number must contain exactly 11 digits.' });
  if (!/^\d{10}$/.test(String(nidNumber))) return res.status(400).json({ error: 'NID number must contain exactly 10 digits.' });
  const normalizedEmail = email.trim().toLowerCase();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const duplicate = await client.query('select email, mobile_number, nid_number from users where lower(email)=lower($1) or mobile_number=$2 or nid_number=$3', [normalizedEmail, String(mobileNumber), String(nidNumber)]);
    if (duplicate.rows.some(row => String(row.email).toLowerCase() === normalizedEmail)) { const error = new Error('That email is already registered. Please sign in instead.'); error.status = 409; throw error; }
    if (duplicate.rows.some(row => row.mobile_number === String(mobileNumber))) { const error = new Error('That mobile number is already registered.'); error.status = 409; throw error; }
    if (duplicate.rows.some(row => row.nid_number === String(nidNumber))) { const error = new Error('That NID number is already registered.'); error.status = 409; throw error; }
    const result = await client.query(
      'insert into users (name, email, role, password, mobile_number, nid_number) values ($1, $2, $3, $4, $5, $6) returning user_id, name, email, role, mobile_number',
      [name.trim(), normalizedEmail, 'Customer', hashPassword(password), String(mobileNumber), String(nidNumber)]
    );
    await client.query('commit');
    const user = result.rows[0]; const token = createSession(user);
    res.status(201).json({ token, user });
  } catch (error) {
    await client.query('rollback');
    const messages = {
      '23505': 'An account with that email already exists. Please sign in instead.',
      '23514': 'Your account details do not meet the registration requirements.',
      '22001': 'One of the account details is too long. Please shorten it and try again.'
    };
    res.status(error.status || (error.code === '23505' ? 409 : 500)).json({ error: error.message || messages[error.code] || 'Account creation could not be completed. Please try again.' });
  } finally { client.release(); }
});

router.post('/auth/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization.replace(/^Bearer\s+/i, '');
  sessions.delete(token);
  res.status(204).end();
});

router.post('/auth/login', async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password || !role) return res.status(400).json({ error: 'Email, password, and account type are required.' });
  try {
    const result = await pool.query('select user_id, name, email, role, password from users where lower(email) = lower($1)', [email.trim()]);
    const row = result.rows[0];
    if (!row) return res.status(401).json({ error: `Invalid email for ${role} login. No ${role} account was found with that email address.` });
    if (row.role !== role) return res.status(403).json({ error: `This email is registered as ${row.role}, not ${role}. Select the correct account type.` });
    if (!verifyPassword(password, row.password)) return res.status(401).json({ error: 'The password is incorrect.' });
    if (!String(row.password).includes(':')) await pool.query('update users set password=$1 where user_id=$2', [hashPassword(password), row.user_id]);
    const user = { user_id: row.user_id, name: row.name, email: row.email, role: row.role };
    const token = createSession(user);
    res.json({ token, user });
  } catch { res.status(500).json({ error: 'Could not sign in.' }); }
});

// Admin-only user administration. The requested role is validated server-side;
// public registration above always creates a Customer account.
router.post('/users', requireAuth, requireRole('Admin'), async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || String(password).length < 8 || !ROLES.has(role)) return res.status(400).json({ error: 'Name, email, an 8-character password, and a valid role are required.' });
  try {
    const result = await pool.query('insert into users (name,email,role,password) values ($1,$2,$3,$4) returning user_id,name,email,role', [name.trim(), email.trim().toLowerCase(), role, hashPassword(password)]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'An account with that email already exists.' : 'Could not create the account.' });
  }
});

router.get('/users', requireAuth, requireRole('Admin'), async (_req, res) => {
  try { const result = await pool.query('select user_id,name,email,role from users order by user_id'); res.json(result.rows); }
  catch { res.status(500).json({ error: 'Could not load users.' }); }
});

router.get('/profile', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      select u.user_id, u.name, u.email, u.role, u.mobile_number, u.nid_number,
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
  const { name, email, phone, age, gender, nidNumber } = req.body;
  const detailError = passengerDetailsError({ name, email, phone, age, gender });
  if (detailError) return res.status(400).json({ error: detailError });
  if (!/^\d{11}$/.test(String(phone || ''))) return res.status(400).json({ error: 'Mobile number must contain exactly 11 digits.' });
  if (!/^\d{10}$/.test(String(nidNumber || ''))) return res.status(400).json({ error: 'NID number must contain exactly 10 digits.' });
  const client = await pool.connect();
  try {
    await client.query('begin');
    const account = await client.query('select email from users where user_id=$1 for update', [req.user.user_id]);
    if (!account.rows[0]) throw new Error('Account not found.');
    const oldEmail = account.rows[0].email;
    const duplicate = await client.query('select email, mobile_number, nid_number from users where user_id<>$1 and (lower(email)=lower($2) or mobile_number=$3 or nid_number=$4)', [req.user.user_id, email.trim().toLowerCase(), phone.trim(), String(nidNumber)]);
    if (duplicate.rows.some(row => String(row.email).toLowerCase() === email.trim().toLowerCase())) throw Object.assign(new Error('That email is already used by another account.'), { status: 409 });
    if (duplicate.rows.some(row => row.mobile_number === phone.trim())) throw Object.assign(new Error('That mobile number is already used by another account.'), { status: 409 });
    if (duplicate.rows.some(row => row.nid_number === String(nidNumber))) throw Object.assign(new Error('That NID number is already used by another account.'), { status: 409 });
    const user = await client.query('update users set name=$1, email=$2, mobile_number=$3, nid_number=$4 where user_id=$5 returning user_id,name,email,role,mobile_number,nid_number', [name.trim(), email.trim().toLowerCase(), phone.trim(), String(nidNumber), req.user.user_id]);
    const existingPassenger = await client.query('select passenger_id from passenger where lower(email)=lower($1) order by passenger_id desc limit 1 for update', [oldEmail]);
    let passenger;
    if (existingPassenger.rows[0]) passenger = await client.query('update passenger set name=$1,email=$2,phone=$3,age=$4,gender=$5 where passenger_id=$6 returning passenger_id,phone,age,gender', [name.trim(), email.trim().toLowerCase(), phone.trim(), Number(age), gender, existingPassenger.rows[0].passenger_id]);
    else passenger = await client.query('insert into passenger (name,email,phone,age,gender) values ($1,$2,$3,$4,$5) returning passenger_id,phone,age,gender', [name.trim(), email.trim().toLowerCase(), phone.trim(), Number(age), gender]);
    await client.query('commit');
    req.user = user.rows[0];
    for (const [token, value] of sessions) if (value.user.user_id === req.user.user_id) sessions.set(token, { user: req.user, expiresAt: value.expiresAt });
    res.json({ ...user.rows[0], ...passenger.rows[0] });
  } catch (error) {
    await client.query('rollback');
    res.status(error.status || (error.code === '23505' ? 409 : 400)).json({ error: error.message || 'Could not save personal information.' });
  } finally { client.release(); }
});

router.get('/stations', requireAuth, async (_req, res) => {
  try {
    const result = await pool.query('select min(station_id) as station_id, min(station_name) as station_name, city from station group by city order by city');
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Could not load station suggestions.' }); }
});

router.get('/schedules', requireAuth, async (req, res) => {
  const date = String(req.query.date || '').trim() || null;
  const from = String(req.query.from || '').trim() || null;
  const to = String(req.query.to || '').trim() || null;
  const seatClass = String(req.query.seatClass || '').trim() || null;
  try {
    const result = await pool.query(`
      select s.schedule_id, s.journey_date, s.departure_time, s.arrival_time, t.train_id, t.train_name, t.train_type,
        r.route_id, r.route_name, r.total_distance_km, fr.fare_rule_id, fr.coach_class, fr.base_fare, fr.fare_per_km,
        first_stop.route_stop_id as boarding_stop_id, first_station.station_name as from_station, first_station.city as from_city,
        last_stop.route_stop_id as alighting_stop_id, last_station.station_name as to_station, last_station.city as to_city,
        coalesce(availability.available_seats, 0) as available_seats,
        coalesce(availability.available_classes, '') as available_classes,
        coalesce(availability.available_coaches, '') as available_coaches
      from schedule s join train t on t.train_id=s.train_id join route r on r.route_id=s.route_id
      left join lateral (select * from fare_rule where route_id=r.route_id and ($4::text is null or coach_class=$4) and (effective_from is null or effective_from<=s.journey_date) and (effective_to is null or effective_to>=s.journey_date) order by effective_from desc nulls last limit 1) fr on true
      join lateral (select * from route_stop where route_id=r.route_id order by stop_sequence asc limit 1) first_stop on true
      join station first_station on first_station.station_id=first_stop.station_id
      join lateral (select * from route_stop where route_id=r.route_id order by stop_sequence desc limit 1) last_stop on true
      join station last_station on last_station.station_id=last_stop.station_id
      left join lateral (
        select count(*) filter (where upper(coalesce(sa.seat_status,'AVAILABLE'))='AVAILABLE') as available_seats,
          string_agg(distinct c.coach_class, ', ' order by c.coach_class) filter (where upper(coalesce(sa.seat_status,'AVAILABLE'))='AVAILABLE') as available_classes,
          string_agg(distinct c.coach_no || ' · ' || c.coach_class, ', ') filter (where upper(coalesce(sa.seat_status,'AVAILABLE'))='AVAILABLE') as available_coaches
        from coach c join seat st on st.coach_id=c.coach_id
        left join seat_availability sa on sa.schedule_id=s.schedule_id and sa.seat_id=st.seat_id
        where c.train_id=s.train_id
      ) availability on true
      where ($1::date is null or (s.journey_date=$1::date and s.journey_date between (now() at time zone 'Asia/Dhaka')::date and (now() at time zone 'Asia/Dhaka')::date + 10))
        and ($2::text is null or lower(first_station.city)=lower($2) or lower(first_station.station_name)=lower($2))
        and ($3::text is null or lower(last_station.city)=lower($3) or lower(last_station.station_name)=lower($3))
        and ($4::text is null or exists (select 1 from coach requested_coach where requested_coach.train_id=t.train_id and requested_coach.coach_class=$4))
      order by s.journey_date, s.departure_time`, [date, from, to, seatClass]);
    res.json(result.rows.map(row => ({ ...row, fare_amount: row.fare_rule_id ? ticketFare(row) : null })));
  } catch { res.status(500).json({ error: 'Could not load schedules.' }); }
});

router.get('/schedules/:scheduleId/seats', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      select c.coach_id, c.coach_no, c.coach_class, st.seat_id, st.seat_no, st.seat_type,
        upper(coalesce(sa.seat_status, 'AVAILABLE')) as seat_status, sa.seat_avail_id,
        (select count(*)::int
         from ticket booked_ticket
         join passenger booked_passenger on booked_passenger.passenger_id=booked_ticket.passenger_id
         join seat_availability booked_availability on booked_availability.seat_avail_id=booked_ticket.seat_avail_id
         join schedule booked_schedule on booked_schedule.schedule_id=booked_availability.schedule_id
         where lower(booked_passenger.email)=lower($2)
           and booked_schedule.journey_date=sc.journey_date
           and booked_ticket.ticket_status='Booked') as booked_by_user
      from schedule sc join coach c on c.train_id=sc.train_id join seat st on st.coach_id=c.coach_id
      left join seat_availability sa on sa.schedule_id=sc.schedule_id and sa.seat_id=st.seat_id
      where sc.schedule_id=$1 order by c.coach_no, st.seat_no`, [req.params.scheduleId, req.user.email]);
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Could not load seats.' }); }
});

router.get('/schedules/:scheduleId/stops', requireAuth, async (req, res) => {
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

router.get('/schedules/:scheduleId/fares', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`select fr.fare_rule_id,fr.coach_class,fr.base_fare,fr.fare_per_km,r.total_distance_km
      from schedule s join route r on r.route_id=s.route_id join fare_rule fr on fr.route_id=r.route_id
      where s.schedule_id=$1 and fr.effective_from<=s.journey_date and fr.effective_to>=s.journey_date
      order by fr.coach_class`, [req.params.scheduleId]);
    res.json(result.rows.map(row => ({ ...row, fare_amount: ticketFare(row) })));
  } catch { res.status(500).json({ error: 'Could not load class fares.' }); }
});

router.post('/bookings', requireAuth, requireRole('Customer'), async (req, res) => {
  const { scheduleId, boardingStopId, alightingStopId, paymentMethod, passenger, seatIds, coPassengerNames = [] } = req.body;
  if (!Array.isArray(seatIds) || seatIds.length < 1 || seatIds.length > MAX_TICKETS_PER_PURCHASE) return res.status(400).json({ error: `A purchase must contain between 1 and ${MAX_TICKETS_PER_PURCHASE} seats.` });
  if (new Set(seatIds.map(String)).size !== seatIds.length) return res.status(400).json({ error: 'Each selected seat must be different.' });
  if (!Array.isArray(coPassengerNames) || coPassengerNames.length !== Math.max(0, seatIds.length - 1) || coPassengerNames.some(name => !String(name || '').trim())) return res.status(400).json({ error: 'Enter a full name for every co-passenger.' });
  const detailError = passengerDetailsError(passenger || {});
  if (detailError) return res.status(400).json({ error: detailError });
  if (String(passenger.email).trim().toLowerCase() !== String(req.user.email).toLowerCase()) return res.status(403).json({ error: 'The purchaser email must match the signed-in customer account.' });
  const client = await pool.connect();
  try {
    await client.query('begin');
    const schedule = await client.query('select schedule_id,route_id,journey_date from schedule where schedule_id=$1', [scheduleId]);
    if (!schedule.rows[0]) throw new Error('Selected schedule is no longer available.');
    const dailyTickets = await client.query(`
      select count(*)::int as ticket_count
      from ticket t
      join passenger p on p.passenger_id=t.passenger_id
      join seat_availability sa on sa.seat_avail_id=t.seat_avail_id
      join schedule booked_schedule on booked_schedule.schedule_id=sa.schedule_id
      where lower(p.email)=lower($1)
        and booked_schedule.journey_date=$2
        and t.ticket_status='Booked'`, [req.user.email, schedule.rows[0].journey_date]);
    const bookedToday = Number(dailyTickets.rows[0]?.ticket_count || 0);
    if (bookedToday + seatIds.length > MAX_TICKETS_PER_PURCHASE) throw new Error(`You already have ${bookedToday} booked ticket${bookedToday === 1 ? '' : 's'} for ${schedule.rows[0].journey_date}. You can book only ${Math.max(0, MAX_TICKETS_PER_PURCHASE - bookedToday)} more.`);
    const stops = await client.query('select route_stop_id from route_stop where route_id=$1 and route_stop_id in ($2,$3)', [schedule.rows[0].route_id, boardingStopId, alightingStopId]);
    if (stops.rows.length !== 2 || String(boardingStopId) === String(alightingStopId)) throw new Error('Choose different valid boarding and destination stations.');
    if (!['CARD', 'MOBILE_BANKING'].includes(paymentMethod)) throw new Error('Choose a valid payment method.');
    const purchaser = await client.query('insert into passenger (name,email,phone,age,gender) values ($1,$2,$3,$4,$5) returning passenger_id,name,email,phone,age,gender', [passenger.name.trim(), passenger.email.trim().toLowerCase(), passenger.phone.trim(), Number(passenger.age), passenger.gender]);
    const created = []; const purchaseId = `RF-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    for (const [index, seatId] of seatIds.entries()) {
      const seat = await client.query(`select st.seat_id,st.seat_no,c.coach_no,c.coach_class,fr.fare_rule_id,fr.base_fare,fr.fare_per_km,r.total_distance_km
        from seat st join coach c on c.coach_id=st.coach_id join schedule sc on sc.train_id=c.train_id
        join route r on r.route_id=sc.route_id join fare_rule fr on fr.route_id=r.route_id and fr.coach_class=c.coach_class
        where sc.schedule_id=$1 and st.seat_id=$2 and fr.effective_from<=sc.journey_date and fr.effective_to>=sc.journey_date
        order by fr.effective_from desc limit 1`, [scheduleId, seatId]);
      if (!seat.rows[0]) throw new Error('A selected seat has no active fare rule for this journey.');
      const fare = ticketFare(seat.rows[0]);
      let availability = await client.query('select seat_avail_id, seat_status from seat_availability where schedule_id=$1 and seat_id=$2 for update', [scheduleId, seatId]);
      let seatAvailId;
      if (!availability.rows[0]) seatAvailId = (await client.query("insert into seat_availability (seat_status, schedule_id, seat_id) values ('Booked',$1,$2) returning seat_avail_id", [scheduleId, seatId])).rows[0].seat_avail_id;
      else { if (String(availability.rows[0].seat_status).toUpperCase() !== 'AVAILABLE') throw new Error('One or more seats were just booked. Please choose another seat.'); seatAvailId = (await client.query("update seat_availability set seat_status='Booked' where seat_avail_id=$1 returning seat_avail_id", [availability.rows[0].seat_avail_id])).rows[0].seat_avail_id; }
      const traveller = index === 0 ? purchaser.rows[0] : (await client.query('insert into passenger (name,email,phone,age,gender) values ($1,$2,$3,$4,$5) returning passenger_id,name', [String(coPassengerNames[index - 1]).trim(), purchaser.rows[0].email, purchaser.rows[0].phone, purchaser.rows[0].age, purchaser.rows[0].gender])).rows[0];
      const ticket = await client.query("insert into ticket (booking_date,ticket_status,fare_amount,passenger_id,boarding_stop_id,alighting_stop_id,fare_rule_id,seat_avail_id,booking_reference) values (now(),'Booked',$1,$2,$3,$4,$5,$6,$7) returning ticket_id,ticket_status,fare_amount", [fare, traveller.passenger_id, boardingStopId, alightingStopId, seat.rows[0].fare_rule_id, seatAvailId, purchaseId]);
      const dbPaymentMethod = paymentMethod === 'MOBILE_BANKING' ? 'Wallet' : 'Credit Card';
      await client.query("insert into payment (transaction_id,payment_date,payment_method,payment_status,amount,ticket_id) values ($1,now(),$2,'Success',$3,$4)", [`${purchaseId}-${index + 1}`, dbPaymentMethod, fare, ticket.rows[0].ticket_id]);
      created.push({ ...ticket.rows[0], passenger_name: traveller.name, seat_id: seatId, seat_no: seat.rows[0].seat_no, coach_no: seat.rows[0].coach_no, coach_class: seat.rows[0].coach_class });
    }
    await client.query('commit');
    res.status(201).json({ purchase_id: purchaseId, ticket_count: created.length, passenger: purchaser.rows[0], tickets: created, total_amount: created.reduce((total, ticket) => total + Number(ticket.fare_amount), 0) });
  } catch (error) { await client.query('rollback'); res.status(400).json({ error: clientError(error, 'Could not complete booking.') }); }
  finally { client.release(); }
});

router.get('/tickets', requireAuth, async (req, res) => {
  try {
    const privileged = ['Admin', 'Manager', 'Staff'].includes(req.user.role);
    const result = await pool.query(`
      select coalesce(t.booking_reference,'LEGACY-' || t.ticket_id::text) as booking_reference,
        min(t.booking_date) as booking_date, string_agg(distinct t.ticket_status, ', ') as ticket_status,
        sum(t.fare_amount) as fare_amount, min(p.email) as passenger_email, min(s.schedule_id) as schedule_id,
        min(s.journey_date) as journey_date, min(tr.train_name) as train_name, string_agg(c.coach_no || '-' || st.seat_no, ', ' order by c.coach_no || '-' || st.seat_no) as seats,
        count(*)::int as seat_count, string_agg(p.name, ', ' order by t.ticket_id) as passenger_names
      from ticket t join passenger p on p.passenger_id=t.passenger_id
      join seat_availability sa on sa.seat_avail_id=t.seat_avail_id
      join seat st on st.seat_id=sa.seat_id join coach c on c.coach_id=st.coach_id
      join schedule s on s.schedule_id=sa.schedule_id join train tr on tr.train_id=s.train_id
      where ($1::boolean or (lower(p.email)=lower($2) and t.ticket_status='Booked' and s.journey_date >= (now() at time zone 'Asia/Dhaka')::date))
      group by coalesce(t.booking_reference,'LEGACY-' || t.ticket_id::text) order by min(t.booking_date) desc`, [privileged, req.user.email]);
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Could not load tickets.' }); }
});

router.get('/bookings/:reference', requireAuth, async (req, res) => {
  try {
    const privileged = ['Admin', 'Manager', 'Staff'].includes(req.user.role);
    const result = await pool.query(`
      select t.ticket_id,coalesce(t.booking_reference,'LEGACY-' || t.ticket_id::text) as booking_reference,t.booking_date,t.ticket_status,t.fare_amount,p.name as passenger_name,p.email as passenger_email,p.phone,
        tr.train_name,s.journey_date,s.departure_time,s.arrival_time,fr.coach_class,c.coach_no,st.seat_no,
        board.station_name as boarding_station,alight.station_name as alighting_station,pay.payment_method,pay.payment_status
      from ticket t join passenger p on p.passenger_id=t.passenger_id join seat_availability sa on sa.seat_avail_id=t.seat_avail_id
      join seat st on st.seat_id=sa.seat_id join coach c on c.coach_id=st.coach_id join schedule s on s.schedule_id=sa.schedule_id
      join train tr on tr.train_id=s.train_id left join fare_rule fr on fr.fare_rule_id=t.fare_rule_id
      join route_stop br on br.route_stop_id=t.boarding_stop_id join station board on board.station_id=br.station_id
      join route_stop ar on ar.route_stop_id=t.alighting_stop_id join station alight on alight.station_id=ar.station_id
      left join payment pay on pay.ticket_id=t.ticket_id
      where coalesce(t.booking_reference,'LEGACY-' || t.ticket_id::text)=$1 and ($2::boolean or (lower(p.email)=lower($3) and t.ticket_status='Booked')) order by t.ticket_id`, [req.params.reference, privileged, req.user.email]);
    if (!result.rows.length) return res.status(404).json({ error: 'Booking not found.' });
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Could not load booking details.' }); }
});

router.post('/tickets/:ticketId/cancel', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const ticket = await client.query(`select t.ticket_id,t.fare_amount,t.seat_avail_id,p.email as passenger_email
      from ticket t join passenger p on p.passenger_id=t.passenger_id
      where t.ticket_id=$1 and t.ticket_status=$2 for update`, [req.params.ticketId, 'Booked']);
    if (!ticket.rows[0]) throw new Error('This ticket cannot be cancelled.');
    const privileged = ['Admin', 'Manager', 'Staff'].includes(req.user.role);
    if (!privileged && String(ticket.rows[0].passenger_email).toLowerCase() !== String(req.user.email).toLowerCase()) {
      await client.query('rollback');
      return res.status(403).json({ error: 'You can only cancel your own tickets.' });
    }
    const refund = Math.max(0, Number(ticket.rows[0].fare_amount) - 150);
    await client.query("insert into cancellation (cancellation_date,reason,refund_amount,ticket_id) values (now(),$1,$2,$3)", [req.body.reason || 'Change of travel plan', refund, ticket.rows[0].ticket_id]);
    await client.query("update ticket set ticket_status='Cancelled' where ticket_id=$1", [ticket.rows[0].ticket_id]);
    await client.query("update seat_availability set seat_status='Available' where seat_avail_id=$1", [ticket.rows[0].seat_avail_id]);
    await client.query("update payment set payment_status='Refunded' where ticket_id=$1", [ticket.rows[0].ticket_id]);
    await client.query('commit'); res.json({ ticket_id: ticket.rows[0].ticket_id, refund_amount: refund });
  } catch (error) { await client.query('rollback'); res.status(400).json({ error: clientError(error, 'Could not cancel ticket.') }); }
  finally { client.release(); }
});

router.post('/bookings/:reference/cancel', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const privileged = ['Admin', 'Manager', 'Staff'].includes(req.user.role);
    const booking = await client.query(`select t.ticket_id,t.fare_amount,t.seat_avail_id,p.email as passenger_email,
      extract(epoch from ((s.journey_date + s.departure_time) - timezone('Asia/Dhaka', now()))) / 3600 as hours_to_departure
      from ticket t join passenger p on p.passenger_id=t.passenger_id join seat_availability sa on sa.seat_avail_id=t.seat_avail_id
      join schedule s on s.schedule_id=sa.schedule_id
      where coalesce(t.booking_reference,'LEGACY-' || t.ticket_id::text)=$1 and t.ticket_status='Booked' and s.journey_date >= (now() at time zone 'Asia/Dhaka')::date for update`, [req.params.reference]);
    if (!booking.rows.length) throw new Error('This booking cannot be cancelled. It may already be cancelled.');
    if (!privileged && booking.rows.some(ticket => String(ticket.passenger_email).toLowerCase() !== String(req.user.email).toLowerCase())) {
      const error = new Error('You can only cancel your own booking.');
      error.status = 403;
      throw error;
    }
    const hours = Number(booking.rows[0].hours_to_departure);
    const feeRate = hours < 6 ? 1 : hours < 12 ? .30 : hours < 24 ? .20 : hours < 48 ? .10 : 0;
    let refundTotal = 0;
    for (const ticket of booking.rows) {
      const refund = Math.max(0, Number(ticket.fare_amount) * (1 - feeRate)); refundTotal += refund;
      await client.query('insert into cancellation (cancellation_date,reason,refund_amount,ticket_id) values (now(),$1,$2,$3)', [req.body.reason || 'Change of travel plan', refund, ticket.ticket_id]);
      await client.query("update ticket set ticket_status='Cancelled' where ticket_id=$1", [ticket.ticket_id]);
      await client.query("update seat_availability set seat_status='Available' where seat_avail_id=$1", [ticket.seat_avail_id]);
      await client.query("update payment set payment_status='Refunded' where ticket_id=$1", [ticket.ticket_id]);
    }
    await client.query('commit'); res.json({ booking_reference: req.params.reference, fee_percent: feeRate * 100, refund_amount: refundTotal });
  } catch (error) { await client.query('rollback'); res.status(error.status || 400).json({ error: clientError(error, 'Could not cancel booking.') }); }
  finally { client.release(); }
});

router.get('/admin/booking-summary', requireAuth, requireRole('Admin', 'Manager', 'Staff'), async (_req, res) => {
  try {
    const result = await pool.query('select ticket_status,count(*)::int as ticket_count,coalesce(sum(fare_amount),0) as fare_total from ticket group by ticket_status order by ticket_status');
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Could not load booking summary.' }); }
});

module.exports = router;
