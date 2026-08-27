const connectTodatabase = require("../connection")



async function handleInsertion(req,res){
      try {
        const body = req.body;
        const connection = await connectTodatabase()
        await connection.execute(
            `INSERT INTO TRAINS
            VALUES(
             :TRAIN_ID, 
             :TRAIN_NAME,
             :TRAIN_TYPE 
            )`,
            {
                train_id:body.id , 
                train_name:body.name, 
                train_type:body.type 
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


async function handlegettraininfo(req,res) {
    try {   
          const connection = await connectTodatabase()
        const result = await connection.execute(
            `SELECT * FROM TRAINS`
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
       handleInsertion, handlegettraininfo
}