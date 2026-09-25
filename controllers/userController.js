const pool = require('../connection');
const { ROLES, hashPassword } = require('../middleware/auth');

/**
 * Admin-only: Create user with explicit transaction control (Requirement 3)
 */
async function createUser(req, res) {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || String(password).length < 8 || !ROLES.has(role)) {
    return res.status(400).json({ error: 'Name, email, an 8-character password, and a valid role are required.' });
  }

  const client = await pool.connect();
  try {
    // Explicit transaction control: BEGIN (Requirement 3)
    await client.query('BEGIN');

    const result = await client.query(
      'INSERT INTO users (name, email, role, password) VALUES ($1, $2, $3, $4) RETURNING user_id, name, email, role',
      [name.trim(), email.trim().toLowerCase(), role, hashPassword(password)]
    );

    // Explicit transaction control: COMMIT (Requirement 3)
    await client.query('COMMIT');

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    // Explicit transaction control: ROLLBACK (Requirement 3)
    await client.query('ROLLBACK');
    return res.status(error.code === '23505' ? 409 : 500).json({
      error: error.code === '23505' ? 'An account with that email already exists.' : 'Could not create the account.'
    });
  } finally {
    client.release();
  }
}

/**
 * Admin-only: List users
 */
async function getUsers(_req, res) {
  try {
    const result = await pool.query('SELECT user_id, name, email, role FROM users ORDER BY user_id');
    return res.json(result.rows);
  } catch {
    return res.status(500).json({ error: 'Could not load users.' });
  }
}

module.exports = {
  createUser,
  getUsers
};
