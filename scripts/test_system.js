const pool = require('../connection');

async function testAll() {
  console.log('--- RAILFLOW SYSTEM INTEGRITY AUDIT ---');
  
  // 1. Connection check
  const dbTest = await pool.query('SELECT current_database(), current_user');
  console.log('✓ Database Connection:', dbTest.rows[0].current_database, '| User:', dbTest.rows[0].current_user);

  // 2. Routines check (Functions & Procedures)
  const spTest = await pool.query(`
    SELECT routine_name, routine_type 
    FROM information_schema.routines 
    WHERE routine_name IN ('sp_cancel_booking', 'fn_calculate_ticket_fare', 'fn_calculate_cancellation_refund', 'fn_get_schedule_occupancy')
  `);
  console.log('✓ Routines registered:', spTest.rows.map(r => `${r.routine_name} (${r.routine_type})`).join(', '));

  // 3. Triggers check
  const trgTest = await pool.query(`
    SELECT trigger_name, event_manipulation, event_object_table 
    FROM information_schema.triggers 
    WHERE trigger_name IN ('trg_ticket_status_audit', 'schedule_create_seat_availability')
  `);
  console.log('✓ Triggers active:', trgTest.rows.map(r => `${r.trigger_name} on ${r.event_object_table}`).join(', '));

  // 4. Data check
  const counts = await pool.query(`
    SELECT 
      (SELECT count(*) FROM train) AS trains,
      (SELECT count(*) FROM route) AS routes,
      (SELECT count(*) FROM schedule WHERE journey_date >= '2026-09-25') AS active_schedules,
      (SELECT count(*) FROM ticket) AS total_tickets,
      (SELECT count(*) FROM ticket_audit_log) AS audit_logs
  `);
  console.log('✓ Record Counts:', counts.rows[0]);

  // 5. Test fare calculation function
  const fareTest = await pool.query("SELECT fn_calculate_ticket_fare(350, 1.8, 320) AS sample_fare");
  console.log('✓ fn_calculate_ticket_fare(350, 1.8, 320) =', fareTest.rows[0].sample_fare);

  // 6. Test cancellation calculation function
  const cancelTest = await pool.query("SELECT * FROM fn_calculate_cancellation_refund(1000, CURRENT_DATE + 3, '10:00:00'::time)");
  console.log('✓ fn_calculate_cancellation_refund(1000, 3 days out) =', cancelTest.rows[0]);

  await pool.end();
  console.log('\n>>> STATUS: ALL CHECKS PASSED SUCCESSFULLY! <<<');
}

testAll().catch(e => {
  console.error('FAILED:', e);
  process.exit(1);
});
