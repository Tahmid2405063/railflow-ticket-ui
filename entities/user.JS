 const connectTodatabase= require("../connection")
async function createUsers() {
    try {   let connection = await connectTodatabase(); 
            await connection.execute(
                `CREATE TABLE USERS (
                    id NUMBER(5),
                    last_name VARCHAR2(40),
                    email VARCHAR2(100),
                    gender VARCHAR2(10),
                    job_title VARCHAR2(15)
                )`,
            );

            console.log("Table  created");
    }
    catch (err) {
        console.log("Table creation error:", err);
    }
}