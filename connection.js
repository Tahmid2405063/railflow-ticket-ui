require("dotenv").config();

const postgres = require("postgres");

const sql = postgres({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DATABASE,
    username: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
});

module.exports = sql;
//