const USER = require("../entities/user.JS");
const connectTodatabase= require("../connection"); 

async function handleInsertion(req,res){
      try {

        const body = req.body;
        const connection = await connectTodatabase()
        await connection.execute(
            `INSERT INTO USERS
             VALUES (
                 :id,
                 :LAST_NAME,
                 :EMAIL,
                 :GENDER,
                 :JOB_TITLE
             )`,
            {
                id:body.id,
                last_name:body.Last_name,
                email:body.Email,
                gender:body.Gender,
                job_title:body.Job_title
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

async function handleGetAlluser(req,res) {
    try {   
          const connection = await connectTodatabase()
        const result = await connection.execute(
            `SELECT * FROM USERS`
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

async function handleDeleteByid(req,res) {
      const id = req.params.id ; 
      const connection = await connectTodatabase()
       await connection.execute(
            `DELETE FROM USERS
            WHERE ID = :id`,
            {
                id:id 
            }
       )
       res.json({
         msg :`delete id :${id}`
       })
}

async function handlePatchByid(req,res) {
     const id = req.params.id
     const connection = await connectTodatabase()
      await connection.execute(
        `UPDATE USERS
        SET EMAIL = :email
        WHERE ID =:id`,
        {
            email: "siratularman1@gmail.com", 
            id : id 
        }
      )
      res.json(
        {
            msg : "update successfully"
        }
      )
}

module.exports = { 
        handleInsertion, handleGetAlluser,handleDeleteByid,handlePatchByid
}
