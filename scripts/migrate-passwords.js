const crypto = require('crypto');
const pool = require('../connection');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const users = await client.query('select user_id, password from users for update');
    for (const user of users.rows) {
      if (!String(user.password).includes(':')) {
        await client.query('update users set password=$1 where user_id=$2', [hashPassword(user.password), user.user_id]);
      }
    }
    await client.query('commit');
    console.log(`Migrated ${users.rows.length} user password record(s) to secure hashes.`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(error => { console.error('Migration failed:', error.message); process.exitCode = 1; });
