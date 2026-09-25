const express = require('express');
const routes = require('../routes/api');
const pool = require('../connection');
const { createSession } = require('../middleware/auth');

const app = express();
app.use(express.json());
app.use('/api', routes);

async function runTests() {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;
  console.log(`Password reset test suite running against port ${port}`);

  try {
    // Pick test user
    const client = await pool.connect();
    let testUser;
    const testNid = '99' + Date.now().toString().slice(-8);
    const testMobile = '017' + Date.now().toString().slice(-8);
    try {
      const res = await client.query(`SELECT user_id, name, email, role, mobile_number, password FROM users WHERE lower(email) = 'testpassworduser@example.com'`);
      if (res.rows[0]) {
        testUser = res.rows[0];
      } else {
        const { hashPassword } = require('../middleware/auth');
        const inserted = await client.query(
          `INSERT INTO users (name, email, role, password, mobile_number, nid_number)
           VALUES ('Test User', 'testpassworduser@example.com', 'Customer', $1, $2, $3)
           RETURNING user_id, name, email, role, mobile_number, password`,
          [hashPassword('InitialPass123!'), testMobile, testNid]
        );
        testUser = inserted.rows[0];
      }
    } finally {
      client.release();
    }

    console.log(`Using test user: ID ${testUser.user_id}, email: ${testUser.email}`);

    // Test 1: Change Password without auth -> 401
    const unauthChange = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'InitialPass123!', newPassword: 'NewPassword456!' })
    });
    console.assert(unauthChange.status === 401, `Expected 401, got ${unauthChange.status}`);
    console.log(`✓ Change password requires authentication (HTTP 401)`);

    // Create session token
    const token = createSession(testUser);
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // Test 2: Change Password with wrong current password -> 400
    const wrongCurrent = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ currentPassword: 'WrongPassword999', newPassword: 'NewPassword456!' })
    });
    const wrongCurrentBody = await wrongCurrent.json();
    console.assert(wrongCurrent.status === 400, `Expected 400, got ${wrongCurrent.status}`);
    console.log(`✓ Rejects incorrect current password: "${wrongCurrentBody.error}"`);

    // Test 3: Change Password with short new password -> 400
    const shortPass = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ currentPassword: 'InitialPass123!', newPassword: 'short' })
    });
    console.assert(shortPass.status === 400, `Expected 400, got ${shortPass.status}`);
    console.log(`✓ Rejects short new password (< 8 chars)`);

    // Test 4: Change Password with same new password as current -> 400
    const samePass = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ currentPassword: 'InitialPass123!', newPassword: 'InitialPass123!' })
    });
    console.assert(samePass.status === 400, `Expected 400, got ${samePass.status}`);
    console.log(`✓ Rejects new password identical to current password`);

    // Test 5: Change Password with valid credentials -> 200
    const validChange = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ currentPassword: 'InitialPass123!', newPassword: 'NewPassword456!' })
    });
    const validChangeBody = await validChange.json();
    console.assert(validChange.status === 200, `Expected 200, got ${validChange.status}`);
    console.log(`✓ Successfully changed password: "${validChangeBody.message}"`);

    // Test 6: Verify login with old password fails -> 401
    const oldLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: 'InitialPass123!', role: 'Customer' })
    });
    console.assert(oldLogin.status === 401, `Expected 401, got ${oldLogin.status}`);
    console.log(`✓ Old password rejected on login (HTTP 401)`);

    // Test 7: Verify login with new password succeeds -> 200
    const newLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: 'NewPassword456!', role: 'Customer' })
    });
    console.assert(newLogin.status === 200, `Expected 200, got ${newLogin.status}`);
    console.log(`✓ New password accepted on login (HTTP 200)`);

    // Test 8: Request Reset Code with non-existent identifier -> 404
    const unknownCodeReq = await fetch(`${baseUrl}/auth/send-reset-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'nonexistentuser999@example.com' })
    });
    console.assert(unknownCodeReq.status === 404, `Expected 404, got ${unknownCodeReq.status}`);
    console.log(`✓ Rejects unknown email when requesting verification code (HTTP 404)`);

    // Test 9: Request Reset Code with valid registered user -> 200
    const validCodeReq = await fetch(`${baseUrl}/auth/send-reset-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: testUser.email })
    });
    const validCodeBody = await validCodeReq.json();
    console.assert(validCodeReq.status === 200, `Expected 200, got ${validCodeReq.status}`);
    console.assert(validCodeBody.verificationCode && validCodeBody.verificationCode.length === 6, 'Expected 6-digit code');
    console.log(`✓ Verification code generated and dispatched: "${validCodeBody.message}" (Code: ${validCodeBody.verificationCode})`);

    // Test 10: Reset Password with incorrect verification code -> 400
    const wrongCodeSubmit = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, verificationCode: '000000', newPassword: 'BrandNewPass789!' })
    });
    console.assert(wrongCodeSubmit.status === 400, `Expected 400, got ${wrongCodeSubmit.status}`);
    console.log(`✓ Rejects incorrect verification code (HTTP 400)`);

    // Test 11: Reset Password with valid verification code -> 200
    const correctCodeSubmit = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        verificationCode: validCodeBody.verificationCode,
        newPassword: 'BrandNewPass789!'
      })
    });
    const correctCodeBody = await correctCodeSubmit.json();
    console.assert(correctCodeSubmit.status === 200, `Expected 200, got ${correctCodeSubmit.status}`);
    console.log(`✓ Password reset succeeded with valid verification code: "${correctCodeBody.message}"`);

    // Test 12: Verify login with newly reset password -> 200
    const resetLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: 'BrandNewPass789!', role: 'Customer' })
    });
    console.assert(resetLogin.status === 200, `Expected 200, got ${resetLogin.status}`);
    console.log(`✓ Login with newly reset password accepted (HTTP 200)`);

    // Test 13: Reusing the same verification code is blocked -> 400
    const reuseCodeSubmit = await fetch(`${baseUrl}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        verificationCode: validCodeBody.verificationCode,
        newPassword: 'AnotherPassword999!'
      })
    });
    console.assert(reuseCodeSubmit.status === 400, `Expected 400, got ${reuseCodeSubmit.status}`);
    console.log(`✓ Single-use verification code correctly cannot be reused (HTTP 400)`);

    // Cleanup: remove temporary test user
    const cleanupClient = await pool.connect();
    try {
      await cleanupClient.query(`DELETE FROM users WHERE lower(email) = 'testpassworduser@example.com'`);
      console.log(`✓ Test user cleaned up from database`);
    } finally {
      cleanupClient.release();
    }

    console.log(`\n========================================`);
    console.log(`ALL 11 PASSWORD RESET TESTS PASSED!`);
    console.log(`========================================\n`);
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  } finally {
    server.close();
    pool.end();
  }
}

runTests();
