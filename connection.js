require("dotenv").config();

const { Pool } = require("pg");


const pool = new Pool({

    host: process.env.POSTGRES_HOST,

    port: Number(process.env.POSTGRES_PORT),

    database: process.env.POSTGRES_DATABASE,

    user: process.env.POSTGRES_USER,

    password: process.env.POSTGRES_PASSWORD,


    ssl:
    process.env.NODE_ENV === "production"
    ?
    {
        rejectUnauthorized:false
    }
    :
    false

});


// test database connection

pool.on("connect",()=>{
    console.log("PostgreSQL connected");
});


pool.on("error",(error)=>{
    console.error(
        "Unexpected database error:",
        error.message
    );
});


module.exports = pool;