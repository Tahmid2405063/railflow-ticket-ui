const connectTodatabase = require("../connection") ; 

async function train(){
      const  connection = await connectTodatabase();
     await connection.execute(
        `CREATE TABLE TRAINS(
           TRAIN_ID NUMBER(10) PRIMARY KEY , 
           TRAIN_NAME VARCHAR2(100), 
           TRAIN_TYPE VARCHAR2(100)
        )`
     )
     console.log(`train table created successfully`); 
}

module.exports = train ; 