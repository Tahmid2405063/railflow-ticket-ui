const pool = require('../connection');
const {
  hashPassword,
  verifyPassword,
  createSession,
  deleteSession,
  updateSessionUser
} = require('../middleware/auth');

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

/**
 * Register a new Customer account with explicit transaction control (BEGIN, COMMIT, ROLLBACK)
 */
async function register(req, res) {
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
    // Explicit transaction control: BEGIN
    await client.query('BEGIN');

    const duplicate = await client.query(
      'SELECT email, mobile_number, nid_number FROM users WHERE lower(email)=lower($1) OR mobile_number=$2 OR nid_number=$3',
      [normalizedEmail, String(mobileNumber), String(nidNumber)]
    );

    if (duplicate.rows.some(row => String(row.email).toLowerCase() === normalizedEmail)) {
      const err = new Error('That email is already registered. Please sign in instead.');
      err.status = 409;
      throw err;
    }
    if (duplicate.rows.some(row => row.mobile_number === String(mobileNumber))) {
      const err = new Error('That mobile number is already registered.');
      err.status = 409;
      throw err;
    }
    if (duplicate.rows.some(row => row.nid_number === String(nidNumber))) {
      const err = new Error('That NID number is already registered.');
      err.status = 409;
      throw err;
    }

    const result = await client.query(
      'INSERT INTO users (name, email, role, password, mobile_number, nid_number) VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id, name, email, role, mobile_number',
      [name.trim(), normalizedEmail, 'Customer', hashPassword(password), String(mobileNumber), String(nidNumber)]
    );

    // Explicit transaction control: COMMIT
    await client.query('COMMIT');

    const user = result.rows[0];
    const token = createSession(user);
    return res.status(201).json({ token, user });
  } catch (error) {
    // Explicit transaction control: ROLLBACK
    await client.query('ROLLBACK');
    const messages = {
      '23505': 'An account with that email already exists. Please sign in instead.',
      '23514': 'Your account details do not meet the registration requirements.',
      '22001': 'One of the account details is too long. Please shorten it and try again.'
    };
    return res.status(error.status || (error.code === '23505' ? 409 : 500)).json({
      error: error.message || messages[error.code] || 'Account creation could not be completed. Please try again.'
    });
  } finally {
    client.release();
  }
}

/**
 * Sign in user and issue session token.
 * Uses explicit transaction control if updating legacy password hash.
 */
async function login(req, res) {
  const { email, password, role } = req.body;
  if (!email || !password || !role) {
    return res.status(400).json({ error: 'Email, password, and account type are required.' });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT user_id, name, email, role, password FROM users WHERE lower(email) = lower($1)',
      [email.trim()]
    );
    const row = result.rows[0];

    if (!row) {
      return res.status(401).json({ error: `Invalid email for ${role} login. No ${role} account was found with that email address.` });
    }
    if (row.role !== role) {
      return res.status(403).json({ error: `This email is registered as ${row.role}, not ${role}. Select the correct account type.` });
    }
    if (!verifyPassword(password, row.password)) {
      return res.status(401).json({ error: 'The password is incorrect.' });
    }

    // If password was stored in legacy un-salted format, update it inside an explicit transaction (Requirement 3)
    if (!String(row.password).includes(':')) {
      try {
        await client.query('BEGIN');
        await client.query('UPDATE users SET password=$1 WHERE user_id=$2', [hashPassword(password), row.user_id]);
        await client.query('COMMIT');
      } catch (updErr) {
        await client.query('ROLLBACK');
        console.error('Password hash upgrade failed:', updErr);
      }
    }

    const user = { user_id: row.user_id, name: row.name, email: row.email, role: row.role };
    const token = createSession(user);
    return res.json({ token, user });
  } catch (err) {
    return res.status(500).json({ error: 'Could not sign in.' });
  } finally {
    client.release();
  }
}

/**
 * Log out user (invalidate session token)
 */
function logout(req, res) {
  if (req.sessionToken) {
    deleteSession(req.sessionToken);
  }
  return res.status(204).end();
}

/**
 * Get profile information for currently authenticated user
 */
async function getProfile(req, res) {
  try {
    const result = await pool.query(`
      SELECT u.user_id, u.name, u.email, u.role, u.mobile_number, u.nid_number,
        p.passenger_id, p.phone, p.age, p.gender
      FROM users u
      LEFT JOIN LATERAL (
        SELECT passenger_id, phone, age, gender
        FROM passenger WHERE lower(email)=lower(u.email)
        ORDER BY passenger_id DESC LIMIT 1
      ) p ON true
      WHERE u.user_id=$1`, [req.user.user_id]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Account not found.' });
    return res.json(result.rows[0]);
  } catch {
    return res.status(500).json({ error: 'Could not load personal information.' });
  }
}

/**
 * Update personal profile with explicit transaction control (BEGIN, COMMIT, ROLLBACK)
 */
async function updateProfile(req, res) {
  const { name, email, phone, age, gender, nidNumber } = req.body;
  const detailError = passengerDetailsError({ name, email, phone, age, gender });
  if (detailError) return res.status(400).json({ error: detailError });
  if (!/^\d{11}$/.test(String(phone || ''))) return res.status(400).json({ error: 'Mobile number must contain exactly 11 digits.' });
  if (!/^\d{10}$/.test(String(nidNumber || ''))) return res.status(400).json({ error: 'NID number must contain exactly 10 digits.' });

  const client = await pool.connect();
  try {
    // Explicit transaction control: BEGIN
    await client.query('BEGIN');

    const account = await client.query('SELECT email FROM users WHERE user_id=$1 FOR UPDATE', [req.user.user_id]);
    if (!account.rows[0]) throw new Error('Account not found.');
    const oldEmail = account.rows[0].email;

    const duplicate = await client.query(
      'SELECT email, mobile_number, nid_number FROM users WHERE user_id<>$1 AND (lower(email)=lower($2) OR mobile_number=$3 OR nid_number=$4)',
      [req.user.user_id, email.trim().toLowerCase(), phone.trim(), String(nidNumber)]
    );

    if (duplicate.rows.some(row => String(row.email).toLowerCase() === email.trim().toLowerCase())) {
      throw Object.assign(new Error('That email is already used by another account.'), { status: 409 });
    }
    if (duplicate.rows.some(row => row.mobile_number === phone.trim())) {
      throw Object.assign(new Error('That mobile number is already used by another account.'), { status: 409 });
    }
    if (duplicate.rows.some(row => row.nid_number === String(nidNumber))) {
      throw Object.assign(new Error('That NID number is already used by another account.'), { status: 409 });
    }

    const user = await client.query(
      'UPDATE users SET name=$1, email=$2, mobile_number=$3, nid_number=$4 WHERE user_id=$5 RETURNING user_id, name, email, role, mobile_number, nid_number',
      [name.trim(), email.trim().toLowerCase(), phone.trim(), String(nidNumber), req.user.user_id]
    );

    const existingPassenger = await client.query(
      'SELECT passenger_id FROM passenger WHERE lower(email)=lower($1) ORDER BY passenger_id DESC LIMIT 1 FOR UPDATE',
      [oldEmail]
    );

    let passenger;
    if (existingPassenger.rows[0]) {
      passenger = await client.query(
        'UPDATE passenger SET name=$1, email=$2, phone=$3, age=$4, gender=$5 WHERE passenger_id=$6 RETURNING passenger_id, phone, age, gender',
        [name.trim(), email.trim().toLowerCase(), phone.trim(), Number(age), gender, existingPassenger.rows[0].passenger_id]
      );
    } else {
      passenger = await client.query(
        'INSERT INTO passenger (name, email, phone, age, gender) VALUES ($1, $2, $3, $4, $5) RETURNING passenger_id, phone, age, gender',
        [name.trim(), email.trim().toLowerCase(), phone.trim(), Number(age), gender]
      );
    }

    // Explicit transaction control: COMMIT
    await client.query('COMMIT');

    updateSessionUser(req.user.user_id, user.rows[0]);
    return res.json({ ...user.rows[0], ...passenger.rows[0] });
  } catch (error) {
    // Explicit transaction control: ROLLBACK
    await client.query('ROLLBACK');
    return res.status(error.status || (error.code === '23505' ? 409 : 400)).json({
      error: error.message || 'Could not save personal information.'
    });
  } finally {
    client.release();
  }
}

/**
 * Change password for authenticated user with explicit transaction control (BEGIN, COMMIT, ROLLBACK)
 */
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!String(currentPassword || '')) {
    return res.status(400).json({ error: 'Current password is required.' });
  }
  if (!String(newPassword || '')) {
    return res.status(400).json({ error: 'New password is required.' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'New password must contain at least 8 characters.' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must be different from current password.' });
  }

  const client = await pool.connect();
  try {
    // Explicit transaction control: BEGIN
    await client.query('BEGIN');

    const result = await client.query('SELECT user_id, password FROM users WHERE user_id = $1 FOR UPDATE', [req.user.user_id]);
    const user = result.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Account not found.' });
    }

    if (!verifyPassword(currentPassword, user.password)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    const newHash = hashPassword(newPassword);
    await client.query('UPDATE users SET password = $1 WHERE user_id = $2', [newHash, req.user.user_id]);

    // Explicit transaction control: COMMIT
    await client.query('COMMIT');

    return res.json({ message: 'Password has been changed successfully.' });
  } catch (error) {
    // Explicit transaction control: ROLLBACK
    await client.query('ROLLBACK');
    return res.status(500).json({ error: error.message || 'Could not update password. Please try again.' });
  } finally {
    client.release();
  }
}

// Active password reset verification codes map
// Key: normalized email -> { code, userId, email, mobileNumber, expiresAt, attempts }
const resetCodes = new Map();
const RESET_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const { sendVerificationEmail, sendVerificationSMS } = require('../services/notificationService');

function maskMobile(mobile) {
  if (!mobile || String(mobile).length < 4) return 'your registered mobile';
  const str = String(mobile);
  return str.slice(0, 3) + '****' + str.slice(-4);
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return 'your email';
  const [user, domain] = email.split('@');
  return (user.length > 2 ? user.slice(0, 2) + '***' : user + '***') + '@' + domain;
}

/**
 * Generate and dispatch a 6-digit verification code in real life to the registered mobile / email
 */
async function sendResetCode(req, res) {
  const { identifier } = req.body;
  if (!String(identifier || '').trim()) {
    return res.status(400).json({ error: 'Please enter your registered email address or mobile number.' });
  }

  const clean = String(identifier).trim().toLowerCase();
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT user_id, name, email, mobile_number FROM users WHERE lower(email) = $1 OR mobile_number = $2 LIMIT 1',
      [clean, String(identifier).trim()]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'No account found matching that email or mobile number.' });
    }

    // Generate 6-digit numeric verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + RESET_CODE_TTL_MS;

    resetCodes.set(user.email.toLowerCase(), {
      code,
      userId: user.user_id,
      email: user.email,
      mobileNumber: user.mobile_number,
      expiresAt,
      attempts: 0
    });

    const maskedPhone = maskMobile(user.mobile_number);
    const maskedMail = maskEmail(user.email);

    console.log(`[RailFlow Auth] Dispatching verification code ${code} to ${user.email} (${user.mobile_number})`);

    // Dispatch real email and real SMS
    const [emailResult, smsResult] = await Promise.allSettled([
      sendVerificationEmail(user.email, user.name, code),
      sendVerificationSMS(user.mobile_number, code)
    ]);

    const emailSent = emailResult.status === 'fulfilled' && emailResult.value?.sent;
    const smsSent = smsResult.status === 'fulfilled' && smsResult.value?.sent;

    return res.json({
      success: true,
      email: user.email,
      maskedPhone,
      maskedEmail: maskedMail,
      emailSent,
      smsSent,
      message: `A 6-digit verification code has been dispatched to ${maskedMail}. Please check your Gmail inbox.`
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate verification code. Please try again.' });
  } finally {
    client.release();
  }
}

/**
 * Reset password with verification code & explicit transaction control (BEGIN, COMMIT, ROLLBACK)
 */
async function forgotPassword(req, res) {
  const { email, verificationCode, mobileNumber, newPassword } = req.body;
  if (!String(email || '').trim()) {
    return res.status(400).json({ error: 'Registered email address is required.' });
  }
  if (!String(newPassword || '')) {
    return res.status(400).json({ error: 'New password is required.' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'New password must contain at least 8 characters.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Validate verification code if code was requested
  const storedEntry = resetCodes.get(normalizedEmail);
  if (verificationCode !== undefined) {
    if (!storedEntry) {
      return res.status(400).json({ error: 'Verification code not requested or has expired. Please request a new code.' });
    }
    if (Date.now() > storedEntry.expiresAt) {
      resetCodes.delete(normalizedEmail);
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }
    if (String(storedEntry.code).trim() !== String(verificationCode).trim()) {
      storedEntry.attempts = (storedEntry.attempts || 0) + 1;
      if (storedEntry.attempts >= 5) {
        resetCodes.delete(normalizedEmail);
        return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new verification code.' });
      }
      return res.status(400).json({ error: 'Invalid verification code. Please check your SMS/email.' });
    }
  }

  const client = await pool.connect();
  try {
    // Explicit transaction control: BEGIN
    await client.query('BEGIN');

    const result = await client.query(
      'SELECT user_id, email, mobile_number FROM users WHERE lower(email) = lower($1) FOR UPDATE',
      [normalizedEmail]
    );
    const user = result.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No account found with that email address.' });
    }

    if (!verificationCode && mobileNumber && String(mobileNumber).trim()) {
      if (user.mobile_number && user.mobile_number !== String(mobileNumber).trim()) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Mobile number does not match our records for this account.' });
      }
    }

    const newHash = hashPassword(newPassword);
    await client.query('UPDATE users SET password = $1 WHERE user_id = $2', [newHash, user.user_id]);

    // Explicit transaction control: COMMIT
    await client.query('COMMIT');

    // Remove consumed reset code
    resetCodes.delete(normalizedEmail);

    return res.json({ message: 'Password reset successfully. Please sign in with your new password.' });
  } catch (error) {
    // Explicit transaction control: ROLLBACK
    await client.query('ROLLBACK');
    return res.status(500).json({ error: error.message || 'Could not reset password. Please try again.' });
  } finally {
    client.release();
  }
}

module.exports = {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  sendResetCode
};
