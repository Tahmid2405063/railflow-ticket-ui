const pool = require("../connection");




exports.getUsers = async (req, res) => {


    try {


        const result =
            await pool.query(

                `
SELECT

user_id,
name,
email,
role

FROM users

ORDER BY user_id

`

            );



        res.json(result.rows);



    }
    catch (error) {


        console.log(error);


        res.status(500)
            .json({

                error:
                    "Unable to load users."

            });


    }


};




exports.changeRole = async (req, res) => {


    const {
        userId
    }
        = req.params;



    const {
        role
    }
        = req.body;



    const allowedRoles = [
        "Admin",
        "Manager",
        "Customer"
    ];



    if (!allowedRoles.includes(role)) {

        return res.status(400)
            .json({

                error:
                    "Invalid role."

            });

    }



    try {


        const result =
            await pool.query(

                `

UPDATE users

SET role=$1

WHERE user_id=$2


RETURNING
user_id,
name,
email,
role

`,

                [
                    role,
                    userId
                ]

            );



        if (result.rows.length === 0) {

            return res.status(404)
                .json({

                    error:
                        "User not found."

                });

        }



        res.json({

            message:
                "Role updated successfully.",

            user:
                result.rows[0]

        });



    }
    catch (error) {


        res.status(500)
            .json({

                error:
                    "Could not update role."

            });


    }


};



exports.createTrain = async (req, res) => {


    const {

        train_name,

        train_type,

        total_seats

    }
        = req.body;



    if (
        !train_name ||
        !train_type ||
        !total_seats
    ) {

        return res.status(400)
            .json({

                error:
                    "All train information required."

            });

    }



    try {


        const result =
            await pool.query(

                `

INSERT INTO train

(
train_name,
train_type,
total_seats
)


VALUES

($1,$2,$3)


RETURNING *

`,

                [
                    train_name,
                    train_type,
                    total_seats
                ]

            );



        res.status(201)
            .json(result.rows[0]);



    }
    catch (error) {


        res.status(500)
            .json({

                error:
                    "Train creation failed."

            });

    }


};



exports.deleteTrain = async (req, res) => {


    try {


        const result =
            await pool.query(

                `

DELETE FROM train

WHERE train_id=$1


RETURNING train_id

`,

                [
                    req.params.trainId
                ]

            );



        if (result.rows.length === 0) {

            return res.status(404)
                .json({

                    error:
                        "Train not found."

                });

        }



        res.status(204).send();



    }
    catch (error) {


        res.status(500)
            .json({

                error:
                    "Train deletion failed."

            });


    }



};



exports.getAllBookings =
    async (req, res) => {


        try {


            const result =
                await pool.query(

                    `

SELECT


t.ticket_id,

t.ticket_status,

t.fare_amount,


p.name AS passenger,


tr.train_name,


s.journey_date



FROM ticket t



JOIN passenger p

ON p.passenger_id=t.passenger_id



JOIN seat_availability sa

ON sa.seat_avail_id=t.seat_avail_id



JOIN schedule s

ON s.schedule_id=sa.schedule_id



JOIN train tr

ON tr.train_id=s.train_id



ORDER BY

t.booking_date DESC



`

                );



            res.json(result.rows);



        }
        catch (error) {


            res.status(500)
                .json({

                    error:
                        "Unable to load bookings."

                });


        }


    };

    exports.createSchedule = async(req,res)=>{


const {
    journey_date,
    departure_time,
    arrival_time,
    train_id,
    route_id
}=req.body;



if(
!journey_date ||
!departure_time ||
!arrival_time ||
!train_id ||
!route_id
){

return res.status(400).json({

error:"All schedule information required."

});

}



try{


const result =
await pool.query(

`
INSERT INTO schedule

(
journey_date,
departure_time,
arrival_time,
train_id,
route_id
)

VALUES

($1,$2,$3,$4,$5)

RETURNING *

`,

[
journey_date,
departure_time,
arrival_time,
train_id,
route_id
]

);



res.status(201)
.json(result.rows[0]);



}

catch(error){

console.log(error);

res.status(500)
.json({

error:"Schedule creation failed."

});


}


};


exports.getRunningTrains = async(req,res)=>{


try{


const result =
await pool.query(

`
SELECT

tr.train_name,

s.journey_date,

s.departure_time,

s.arrival_time


FROM train tr


JOIN schedule s

ON tr.train_id=s.train_id



WHERE

CURRENT_TIMESTAMP BETWEEN

(s.journey_date + s.departure_time)

AND

(s.journey_date + s.arrival_time)

`

);



res.json(result.rows);



}

catch(error){


res.status(500)
.json({

error:"Unable to fetch running trains."

});


}


};

exports.getUpcomingTrains = async(req,res)=>{


try{


const result =
await pool.query(

`
SELECT

tr.train_name,

s.journey_date,

s.departure_time


FROM train tr


JOIN schedule s

ON tr.train_id=s.train_id


WHERE

(s.journey_date+s.departure_time)
>
CURRENT_TIMESTAMP



ORDER BY

s.journey_date,

s.departure_time



LIMIT 10

`

);



res.json(result.rows);


}

catch(error){


res.status(500)
.json({

error:"Unable to fetch upcoming trains."

});


}


};


exports.updateFare = async(req,res)=>{


const {
base_fare,
fare_per_km
}=req.body;



try{


const result =
await pool.query(

`
UPDATE fare_rule

SET

base_fare=$1,

fare_per_km=$2


WHERE fare_rule_id=$3


RETURNING *

`,

[
base_fare,
fare_per_km,
req.params.fareRuleId
]

);



if(result.rows.length===0){

return res.status(404)
.json({

error:"Fare rule not found."

});

}



res.json({

message:"Fare updated.",

fare:
result.rows[0]

});



}

catch(error){


res.status(500)
.json({

error:"Fare update failed."

});


}


};


exports.cancelTrip = async(req,res)=>{


const client =
await pool.connect();



try{


await client.query("BEGIN");



await client.query(

`
UPDATE ticket

SET ticket_status='Cancelled'


WHERE seat_avail_id IN

(

SELECT seat_avail_id

FROM seat_availability

WHERE schedule_id=$1

)

`,

[
req.params.scheduleId
]

);



await client.query(

`
UPDATE seat_availability

SET seat_status='AVAILABLE'


WHERE schedule_id=$1

`,

[
req.params.scheduleId
]

);



await client.query("COMMIT");



res.json({

message:"Trip cancelled successfully."

});


}

catch(error){


await client.query("ROLLBACK");


res.status(500)
.json({

error:"Trip cancellation failed."

});


}

finally{

client.release();

}


};