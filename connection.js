require('dotenv').config();
const { Pool, types } = require('pg');

// Parse PostgreSQL DATE (OID 1082) as exact plain string 'YYYY-MM-DD'
types.setTypeParser(1082, val => val);

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DATABASE,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  ssl: process.env.POSTGRES_SSL === 'false' ? false : { rejectUnauthorized: false }
});

module.exports = pool;
//
