const pool = require("../connection");



function validatePassenger({
    name,
    email,
    phone,
    age,
    gender
}){


    if(
        !name ||
        !email ||
        !phone ||
        age === undefined ||
        !gender
    )
    {
        return "All passenger fields are required.";
    }



    if(!/^[0-9]+$/.test(phone))
    {
        return "Phone number must contain digits only.";
    }



    const passengerAge = Number(age);


    if(
        !Number.isInteger(passengerAge) ||
        passengerAge < 0 ||
        passengerAge > 120
    )
    {
        return "Age must be between 0 and 120.";
    }



    if(
        !["Male","Female","Other"]
        .includes(gender)
    )
    {
        return "Invalid gender.";
    }


    return null;

}






// GET LOGGED USER PROFILE

exports.getProfile = async(req,res)=>{


try{


const result =
await pool.query(

`
SELECT

u.user_id,
u.name,
u.email,
u.role,

p.passenger_id,
p.phone,
p.age,
p.gender


FROM users u

LEFT JOIN passenger p

ON LOWER(u.email)=LOWER(p.email)


WHERE u.user_id=$1

`,

[
req.user.id
]

);



if(result.rows.length===0)
{

return res.status(404)
.json({

error:
"User profile not found."

});

}



res.status(200)
.json(result.rows[0]);



}
catch(error)
{

console.log(error);


res.status(500)
.json({

error:
"Unable to load profile."

});


}


};









// UPDATE PROFILE

exports.updateProfile = async(req,res)=>{


const {
name,
email,
phone,
age,
gender
}
=req.body;



const validation =
validatePassenger({
name,
email,
phone,
age,
gender
});



if(validation)
{

return res.status(400)
.json({

error:validation

});

}




const client =
await pool.connect();



try{


await client.query("BEGIN");



// Update user table

const userResult =
await client.query(

`
UPDATE users

SET
name=$1,
email=$2


WHERE user_id=$3


RETURNING
user_id,
name,
email,
role

`,

[
name.trim(),
email.toLowerCase(),
req.user.id
]

);





if(userResult.rows.length===0)
{

throw new Error(
"User account not found."
);

}






// check existing passenger

const passengerExist =
await client.query(

`

SELECT passenger_id

FROM passenger

WHERE LOWER(email)=LOWER($1)

LIMIT 1

FOR UPDATE

`,

[
email
]

);






let passengerResult;



if(passengerExist.rows.length)
{


passengerResult =
await client.query(

`

UPDATE passenger

SET

name=$1,
email=$2,
phone=$3,
age=$4,
gender=$5


WHERE passenger_id=$6


RETURNING *

`,

[
name.trim(),
email.toLowerCase(),
phone,
Number(age),
gender,
passengerExist.rows[0].passenger_id

]

);



}

else
{


passengerResult =
await client.query(

`

INSERT INTO passenger

(
name,
email,
phone,
age,
gender
)


VALUES
($1,$2,$3,$4,$5)


RETURNING *

`,

[
name.trim(),
email.toLowerCase(),
phone,
Number(age),
gender
]

);


}




await client.query("COMMIT");



res.status(200)
.json({

message:
"Profile updated successfully.",

user:userResult.rows[0],

passenger:
passengerResult.rows[0]

});




}
catch(error)
{


await client.query("ROLLBACK");


console.log(error);



if(error.code==="23505")
{

return res.status(409)
.json({

error:
"Email already exists."

});

}



res.status(500)
.json({

error:
"Profile update failed."

});



}

finally{

client.release();

}


};










// DELETE PASSENGER ACCOUNT

exports.deleteAccount = async(req,res)=>{


const client =
await pool.connect();


try{


await client.query("BEGIN");



// delete only own account


const result =
await client.query(

`

DELETE FROM users

WHERE user_id=$1

RETURNING user_id

`,

[
req.user.id
]

);



if(result.rows.length===0)
{

await client.query("ROLLBACK");

return res.status(404)
.json({

error:
"Account not found."

});

}



await client.query("COMMIT");



res.status(204)
send();



}
catch(error)
{


await client.query("ROLLBACK");


res.status(500)
.json({

error:
"Could not delete account."

});


}

finally{

client.release();

}


};