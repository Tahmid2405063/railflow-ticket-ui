const connectTodatabase = require("../connection") ; 

async function Routes(){
      const  connection = await connectTodatabase();
     await connection.execute(
        `CREATE TABLE ROUTES (
    ROUTE_ID NUMBER(10) PRIMARY KEY,
    SOURCE_STATION_NAME VARCHAR2(200),
    DESTINATION_STATION_NAME VARCHAR2(200),
    DISTANCE VARCHAR2(10)
)`
     )
     console.log(`Routes table created successfully`); 
}

module.exports = Routes ; 