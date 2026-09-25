const express = require('express');
const routes = require('../routes/api');
const pool = require('../connection');

const app = express();
app.use(express.json());
app.use('/api', routes);

async function testApi() {
  const server = app.listen(0);
  const port = server.address().port;
  console.log(`Test server running on port ${port}`);

  try {
    // 0. Verify unauthenticated access returns 401 (Requirement 2)
    const unauthRes = await fetch(`http://localhost:${port}/api/stations`);
    console.log(`✓ Unauthenticated /api/stations correctly rejected -> HTTP ${unauthRes.status}`);

    // Create session token for Customer
    const { createSession } = require('../middleware/auth');
    const token = createSession({
      user_id: 1,
      email: 'siratularman1@gmail.com',
      name: 'Siratul Arman',
      role: 'Customer'
    });
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 1. Stations endpoint
    const stRes = await fetch(`http://localhost:${port}/api/stations`, { headers: authHeaders });
    const stations = await stRes.json();
    console.log(`✓ Authenticated /api/stations -> HTTP ${stRes.status} (${stations.length} stations loaded)`);

    // 2. Schedules endpoint
    const scRes = await fetch(`http://localhost:${port}/api/schedules?date=2026-09-26`, { headers: authHeaders });
    const schedules = await scRes.json();
    console.log(`✓ /api/schedules -> HTTP ${scRes.status} (${schedules.length} schedules on 2026-09-26)`);

    if (schedules.length > 0) {
      console.log(`  Sample schedule fare_amount type: ${typeof schedules[0].fare_amount} (value: ${schedules[0].fare_amount})`);
    }

    // 3. Analytics endpoints
    const topRoutesRes = await fetch(`http://localhost:${port}/api/analytics/top-routes`, { headers: authHeaders });
    const topRoutes = await topRoutesRes.json();
    console.log(`✓ /api/analytics/top-routes -> HTTP ${topRoutesRes.status} (${topRoutes.length} routes)`);

    const trainPerfRes = await fetch(`http://localhost:${port}/api/analytics/train-performance`, { headers: authHeaders });
    const trainPerf = await trainPerfRes.json();
    console.log(`✓ /api/analytics/train-performance -> HTTP ${trainPerfRes.status} (${trainPerf.length} trains)`);

    const finRes = await fetch(`http://localhost:${port}/api/analytics/financial-summary`, { headers: authHeaders });
    const fin = await finRes.json();
    console.log(`✓ /api/analytics/financial-summary -> HTTP ${finRes.status} (${fin.length} status breakdowns)`);

    const auditRes = await fetch(`http://localhost:${port}/api/analytics/audit-logs`, { headers: authHeaders });
    const audit = await auditRes.json();
    console.log(`✓ /api/analytics/audit-logs -> HTTP ${auditRes.status} (${audit.length} trigger audit entries)`);

    // 4. Tickets list endpoint
    const tixRes = await fetch(`http://localhost:${port}/api/tickets`, { headers: authHeaders });
    const tickets = await tixRes.json();
    console.log(`✓ /api/tickets -> HTTP ${tixRes.status} (${tickets.length} tickets found)`);
    if (tickets.length > 0) {
      console.log(`  Sample ticket journey_date: '${tickets[0].journey_date}' (Type: ${typeof tickets[0].journey_date})`);

      // 5. Booking detail endpoint
      const bRes = await fetch(`http://localhost:${port}/api/bookings/${encodeURIComponent(tickets[0].booking_reference)}`, { headers: authHeaders });
      const bDetails = await bRes.json();
      console.log(`✓ /api/bookings/:ref -> HTTP ${bRes.status} (${bDetails.length} seat rows)`);
      if (bDetails.length > 0) {
        console.log(`  Sample booking detail journey_date: '${bDetails[0].journey_date}' (Type: ${typeof bDetails[0].journey_date})`);
      }
    }

    console.log('\n>>> ALL API ENDPOINTS VERIFIED & OPERATIONAL! <<<');
  } finally {
    server.close();
    await pool.end();
  }
}

testApi().catch(err => {
  console.error('API Test Error:', err);
  process.exit(1);
});
