const pool=require("../connection");

const jwt=require("jsonwebtoken");

const {
hashPassword,
comparePassword
}
=
require("../utils/password");





function createToken(user){


    return jwt.sign(

        {

            id:user.user_id,

            role:user.role,

            email:user.email

        },

        process.env.JWT_SECRET,

        {

            expiresIn:
            process.env.JWT_EXPIRE || "1d"

        }

    );

}





// REGISTER

exports.register=async(req,res)=>{


try{


const {
name,
email,
password,
role
}
=req.body;



if(
!name ||
!email ||
!password
)
{

return res.status(400)
.json({
error:
"Name, email and password are required."
});

}



if(password.length<8)
{

return res.status(400)
.json({
error:
"Password must contain at least 8 characters."
});

}




/*
Role is NOT trusted from frontend.

Customer is default role.

Admin/Manager will be inserted manually
from database.
*/


const userRole="Customer";



const hashedPassword=
await hashPassword(password);



const result=
await pool.query(

`
INSERT INTO users
(name,email,role,password)

VALUES($1,$2,$3,$4)

RETURNING 
user_id,
name,
email,
role

`,

[
name.trim(),
email.toLowerCase(),
userRole,
hashedPassword
]

);



res.status(201)
.json({

message:
"Account created successfully.",

user:
result.rows[0]

});



}
catch(error){


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
"Registration failed."

});


}



};







// LOGIN

exports.login=async(req,res)=>{


try{


const {
email,
password
}
=req.body;

console.log("LOGIN BODY:", req.body);


if(!email || !password)
{

return res.status(400)
.json({

error:
"Email and password required."

});

}




const result=
await pool.query(

`
SELECT
user_id,
name,
email,
role,
password

FROM users

WHERE LOWER(email)=LOWER($1)

`,

[email]

);




if(result.rows.length===0)
{

return res.status(401)
.json({

error:
"Invalid credentials."

});

}



const user=result.rows[0];



const valid=
await comparePassword(
password,
user.password
);



if(!valid)
{

return res.status(401)
.json({

error:
"Invalid credentials."

});

}




const token=
createToken(user);





res.json({

token,

user:
{

user_id:user.user_id,

name:user.name,

email:user.email,

role:user.role

}

});



}
catch(error){


console.log(error);


res.status(500)
.json({

error:
"Login failed."

});


}



};








// LOGOUT

exports.logout=(req,res)=>{


/*
JWT is stateless.

Client removes token.

For stronger security later we can add
token blacklist table.
*/


res.json({

message:
"Logged out successfully."

});


};