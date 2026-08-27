const connectTodatabase = require("../connection")



async function handleInsertion(req,res){
      try {
        const body = req.body;
        const connection = await connectTodatabase()
        await connection.execute(
            `INSERT INTO ROUTES
            VALUES(
           
              :ROUTE_ID, 
              :SOURCE_STATION_NAME , 
              :DESTINATION_STATION_NAME , 
              :DISTANCE 
            )`,
            {  
              
               route_id:body.id2, 
               source_station_name:body.source, 
               destination_station_name:body.destination, 
               distance:body.distance 
            },
            {
                autoCommit: true
            }
        );

        res.json({
            msg: "success"
        });

    }
    catch (err) {

        console.log("Insert error:", err);

        res.status(500).json({
            msg: "Database error"
        });
    }
}


async function handlegetrouteinfo(req,res) {
    try {   
          const connection = await connectTodatabase()
        const result = await connection.execute(
            `SELECT * FROM ROUTES`
        );

        res.json(result.rows);
    }
    catch (err) {
        console.log("Fetch error:", err);

        res.status(500).json({
            msg: "Database error"
        });
    }
}

module.exports = { 
       handleInsertion, handlegetrouteinfo
}