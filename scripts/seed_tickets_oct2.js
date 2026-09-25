const pool = require('../connection');

async function seedSchedulesAndTickets() {
  const client = await pool.connect();

  try {
    console.log('--- SEEDING SCHEDULES & TICKETS UP TO 2 OCT 2026 ---');
    await client.query('BEGIN');

    // 1. Target Dates from Sep 25 to Oct 2, 2026
    const dates = [
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02'
    ];

    // Train configurations
    const trainConfigs = [
      { trainId: 5, routeId: 3, departureTime: '07:00:00', arrivalTime: '12:45:00', boardStop: 4, alightStop: 6 }, // Subarna Express: Dhaka -> Chittagong
      { trainId: 6, routeId: 4, departureTime: '06:30:00', arrivalTime: '13:00:00', boardStop: 7, alightStop: 8 }, // Parabat Express: Dhaka -> Sylhet
      { trainId: 11, routeId: 5, departureTime: '13:30:00', arrivalTime: '20:45:00', boardStop: 9, alightStop: 10 } // Bonolota Express: Dhaka -> Kurigram
    ];

    // Insert schedules if they do not already exist
    for (const date of dates) {
      for (const t of trainConfigs) {
        const existing = await client.query(
          'SELECT schedule_id FROM schedule WHERE train_id=$1 AND journey_date=$2::date',
          [t.trainId, date]
        );
        if (!existing.rows.length) {
          // Inserting schedule fires the schedule_create_seat_availability trigger automatically
          await client.query(
            'INSERT INTO schedule (train_id, route_id, journey_date, departure_time, arrival_time) VALUES ($1, $2, $3::date, $4, $5)',
            [t.trainId, t.routeId, date, t.departureTime, t.arrivalTime]
          );
          console.log(`✓ Inserted schedule for Train ${t.trainId} on ${date}`);
        }
      }
    }

    // 2. Fetch Passenger mappings
    const passengers = await client.query(`
      SELECT passenger_id, name, email FROM passenger 
      WHERE email IN ('siratularman1@gmail.com', 'arman@gmail.com', 'tahmid1@gmail.com', 'smahdialhasanhasan@gmail.com', 'tom@gmail.com')
    `);
    const pMap = {};
    for (const p of passengers.rows) {
      pMap[p.email.toLowerCase()] = p.passenger_id;
    }

    // Fallback if passenger doesn't exist for arman or siratularman
    if (!pMap['siratularman1@gmail.com']) {
      const p = (await client.query("INSERT INTO passenger (name, email, phone, age, gender) VALUES ('Siratul Arman', 'siratularman1@gmail.com', '01842135800', 22, 'Male') RETURNING passenger_id")).rows[0];
      pMap['siratularman1@gmail.com'] = p.passenger_id;
    }
    if (!pMap['arman@gmail.com']) {
      const p = (await client.query("INSERT INTO passenger (name, email, phone, age, gender) VALUES ('Siratul Arman', 'arman@gmail.com', '01988647224', 21, 'Male') RETURNING passenger_id")).rows[0];
      pMap['arman@gmail.com'] = p.passenger_id;
    }

    // 3. Planned Bookings across different trains up to 2 Oct
    const bookingsToSeed = [
      // September 26 - Subarna Express (Dhaka -> Chittagong)
      {
        email: 'siratularman1@gmail.com',
        trainId: 5,
        date: '2026-09-26',
        coachClass: 'AC First Class',
        coachNo: 'KHA',
        seatNo: 'A1',
        paymentMethod: 'Credit Card',
        ref: 'RF-2609-SUB-01'
      },
      // September 26 - Bonolota Express (Dhaka -> Kurigram)
      {
        email: 'tahmid1@gmail.com',
        trainId: 11,
        date: '2026-09-26',
        coachClass: 'AC First Class',
        coachNo: 'KHA',
        seatNo: 'A1',
        paymentMethod: 'Wallet',
        ref: 'RF-2609-BON-01'
      },
      // September 27 - Parabat Express (Dhaka -> Sylhet)
      {
        email: 'arman@gmail.com',
        trainId: 6,
        date: '2026-09-27',
        coachClass: 'AC 2-Tier',
        coachNo: 'KHA',
        seatNo: 'A1',
        paymentMethod: 'Credit Card',
        ref: 'RF-2709-PAR-01'
      },
      // September 27 - Subarna Express (Dhaka -> Chittagong)
      {
        email: 'smahdialhasanhasan@gmail.com',
        trainId: 5,
        date: '2026-09-27',
        coachClass: 'AC 2-Tier',
        coachNo: 'CHA',
        seatNo: 'A1',
        paymentMethod: 'Wallet',
        ref: 'RF-2709-SUB-01'
      },
      // September 28 - Subarna Express (Dhaka -> Chittagong)
      {
        email: 'tahmid1@gmail.com',
        trainId: 5,
        date: '2026-09-28',
        coachClass: 'Sleeper',
        coachNo: 'GA',
        seatNo: 'A1',
        paymentMethod: 'Wallet',
        ref: 'RF-2809-SUB-01'
      },
      // September 29 - Parabat Express (Dhaka -> Sylhet)
      {
        email: 'siratularman1@gmail.com',
        trainId: 6,
        date: '2026-09-29',
        coachClass: 'Chair Car',
        coachNo: 'KA',
        seatNo: 'A1',
        paymentMethod: 'Credit Card',
        ref: 'RF-2909-PAR-01'
      },
      // September 30 - Subarna Express (Dhaka -> Chittagong)
      {
        email: 'arman@gmail.com',
        trainId: 5,
        date: '2026-09-30',
        coachClass: 'Chair Car',
        coachNo: 'KA',
        seatNo: 'A1',
        paymentMethod: 'Wallet',
        ref: 'RF-3009-SUB-01'
      },
      // October 01 - Subarna Express (Dhaka -> Chittagong)
      {
        email: 'arman@gmail.com',
        trainId: 5,
        date: '2026-10-01',
        coachClass: 'AC First Class',
        coachNo: 'KHA',
        seatNo: 'A2',
        paymentMethod: 'Credit Card',
        ref: 'RF-0110-SUB-01'
      },
      // October 02 - Bonolota Express (Dhaka -> Kurigram)
      {
        email: 'siratularman1@gmail.com',
        trainId: 11,
        date: '2026-10-02',
        coachClass: 'Sleeper',
        coachNo: 'GA',
        seatNo: 'A1',
        paymentMethod: 'Credit Card',
        ref: 'RF-0210-BON-01'
      },
      // October 02 - Parabat Express (Dhaka -> Sylhet)
      {
        email: 'smahdialhasanhasan@gmail.com',
        trainId: 6,
        date: '2026-10-02',
        coachClass: 'Sleeper',
        coachNo: 'GA',
        seatNo: 'A1',
        paymentMethod: 'Wallet',
        ref: 'RF-0210-PAR-01'
      }
    ];

    let createdCount = 0;

    for (const b of bookingsToSeed) {
      // Check if ticket with this reference already exists
      const existingTicket = await client.query('SELECT ticket_id FROM ticket WHERE booking_reference=$1', [b.ref]);
      if (existingTicket.rows.length) {
        console.log(`- Booking ${b.ref} already exists, skipping.`);
        continue;
      }

      // Get schedule
      const sched = await client.query(
        'SELECT schedule_id, route_id FROM schedule WHERE train_id=$1 AND journey_date=$2::date LIMIT 1',
        [b.trainId, b.date]
      );
      if (!sched.rows.length) continue;
      const scheduleId = sched.rows[0].schedule_id;
      const routeId = sched.rows[0].route_id;

      // Get boarding and destination stops
      const tConf = trainConfigs.find(tc => tc.trainId === b.trainId);
      const boardingStopId = tConf.boardStop;
      const alightingStopId = tConf.alightStop;

      // Get Fare Rule and calculate fare using database function fn_calculate_ticket_fare (Requirement 5)
      const fareRes = await client.query(`
        SELECT fr.fare_rule_id,
          fn_calculate_ticket_fare(fr.base_fare, fr.fare_per_km, r.total_distance_km) as calculated_fare
        FROM fare_rule fr
        JOIN route r ON r.route_id = fr.route_id
        WHERE fr.route_id=$1 AND fr.coach_class=$2
        LIMIT 1
      `, [routeId, b.coachClass]);

      if (!fareRes.rows.length) {
        console.log(`! No fare rule for route ${routeId} and class ${b.coachClass}`);
        continue;
      }
      const fareRuleId = fareRes.rows[0].fare_rule_id;
      const fareAmount = Number(fareRes.rows[0].calculated_fare);

      // Find an available seat in that coach
      const seatAvailRes = await client.query(`
        SELECT sa.seat_avail_id, st.seat_id, st.seat_no, c.coach_no
        FROM seat_availability sa
        JOIN seat st ON st.seat_id = sa.seat_id
        JOIN coach c ON c.coach_id = st.coach_id
        WHERE sa.schedule_id=$1 AND c.train_id=$2 AND c.coach_class=$3 AND UPPER(sa.seat_status)='AVAILABLE'
        LIMIT 1
        FOR UPDATE
      `, [scheduleId, b.trainId, b.coachClass]);

      if (!seatAvailRes.rows.length) {
        console.log(`! No available seats on schedule ${scheduleId} for class ${b.coachClass}`);
        continue;
      }

      const seatAvailId = seatAvailRes.rows[0].seat_avail_id;
      const passengerId = pMap[b.email.toLowerCase()] || passengers.rows[0].passenger_id;

      // 1. Update seat availability to Booked
      await client.query("UPDATE seat_availability SET seat_status='Booked' WHERE seat_avail_id=$1", [seatAvailId]);

      // 2. Insert ticket (triggers shadow audit log!)
      const ticketRes = await client.query(`
        INSERT INTO ticket (booking_date, ticket_status, fare_amount, passenger_id, boarding_stop_id, alighting_stop_id, fare_rule_id, seat_avail_id, booking_reference)
        VALUES (CURRENT_TIMESTAMP, 'Booked', $1, $2, $3, $4, $5, $6, $7)
        RETURNING ticket_id
      `, [fareAmount, passengerId, boardingStopId, alightingStopId, fareRuleId, seatAvailId, b.ref]);

      const ticketId = ticketRes.rows[0].ticket_id;

      // 3. Insert payment
      const dbPaymentMethod = b.paymentMethod === 'Wallet' ? 'Wallet' : 'Credit Card';
      await client.query(`
        INSERT INTO payment (transaction_id, payment_date, payment_method, payment_status, amount, ticket_id)
        VALUES ($1, CURRENT_TIMESTAMP, $2, 'Success', $3, $4)
      `, [`TXN-${b.ref}-1`, dbPaymentMethod, fareAmount, ticketId]);

      console.log(`✓ Booked Ticket #${ticketId} (${b.ref}): Train ${b.trainId} on ${b.date} (${b.coachClass}, Seat ${seatAvailRes.rows[0].seat_no}) for ${b.email} - BDT ${fareAmount}`);
      createdCount++;
    }

    await client.query('COMMIT');
    console.log(`\n>>> Successfully seeded ${createdCount} new tickets across different trains up to 2 Oct 2026! <<<`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

seedSchedulesAndTickets();
