const pool = require("../connection");

const crypto = require("crypto");


const MAX_TICKETS = 4;




function calculateFare(row) {

    return Math.ceil(
        Number(row.base_fare)
        +
        Number(row.fare_per_km)
        *
        Number(row.total_distance_km)
    );

}







function validatePassenger(passenger) {


    const {
        name,
        email,
        phone,
        age,
        gender,
        seatId
    } = passenger;



    if (
        !name ||
        !email ||
        !phone ||
        !age ||
        !gender ||
        !seatId
    ) {
        return "Complete passenger information is required.";
    }



    if (!/^[0-9]+$/.test(phone)) {
        return "Invalid phone number.";
    }



    const passengerAge =
        Number(age);



    if (
        !Number.isInteger(passengerAge)
        ||
        passengerAge < 0
        ||
        passengerAge > 120
    ) {
        return "Invalid age.";
    }



    if (
        !["Male", "Female", "Other"]
            .includes(gender)
    ) {
        return "Invalid gender.";
    }



    return null;

}









// CREATE BOOKING


exports.createBooking = async (req, res) => {


    const {

        scheduleId,

        fareRuleId,

        boardingStopId,

        alightingStopId,

        paymentMethod,

        passengers

    }

        = req.body;





    if (
        !Array.isArray(passengers)
        ||
        passengers.length < 1
        ||
        passengers.length > MAX_TICKETS

    ) {

        return res.status(400)
            .json({

                error:
                    `Booking must contain 1-${MAX_TICKETS} tickets.`

            });

    }





    // duplicate seats check

    const seatIds =
        passengers.map(
            p => String(p.seatId)
        );



    if (
        new Set(seatIds).size
        !==
        seatIds.length
    ) {

        return res.status(400)
            .json({

                error:
                    "Same seat cannot be selected twice."

            });

    }





    const client =
        await pool.connect();




    try {


        await client.query("BEGIN");





        // check schedule and fare


        const context =
            await client.query(

                `

SELECT


s.schedule_id,


r.total_distance_km,


fr.base_fare,


fr.fare_per_km



FROM schedule s



JOIN route r

ON r.route_id=s.route_id



JOIN fare_rule fr

ON fr.fare_rule_id=$2



WHERE

s.schedule_id=$1



FOR UPDATE



`,

                [
                    scheduleId,
                    fareRuleId
                ]

            );





        if (context.rows.length === 0) {

            throw new Error(
                "Schedule or fare rule not available."
            );

        }




        const fare =
            calculateFare(
                context.rows[0]
            );




        const transactionId =
            "RF-"
            +
            Date.now()
            +
            "-"
            +
            crypto
                .randomBytes(3)
                .toString("hex");





        const createdTickets = [];






        for (const passenger of passengers) {



            const validation =
                validatePassenger(passenger);



            if (validation) {
                throw new Error(validation);
            }






            // lock seat row


            const seat =
                await client.query(

                    `

SELECT


st.seat_id


FROM seat st



JOIN coach c

ON c.coach_id=st.coach_id



JOIN schedule s

ON s.train_id=c.train_id



WHERE

s.schedule_id=$1

AND

st.seat_id=$2



FOR UPDATE



`,

                    [
                        scheduleId,
                        passenger.seatId
                    ]

                );






            if (seat.rows.length === 0) {

                throw new Error(
                    "Invalid seat selected."
                );

            }







            // check availability


            let availability =
                await client.query(

                    `

SELECT

seat_avail_id,
seat_status


FROM seat_availability



WHERE

schedule_id=$1

AND

seat_id=$2



FOR UPDATE



`,

                    [
                        scheduleId,
                        passenger.seatId
                    ]

                );




            let seatAvailabilityId;






            if (
                availability.rows.length
                === 0
            ) {


                const inserted =
                    await client.query(

                        `

INSERT INTO seat_availability

(
seat_status,
schedule_id,
seat_id
)

VALUES

(
'BOOKED',
$1,
$2
)


RETURNING seat_avail_id



`,

                        [
                            scheduleId,
                            passenger.seatId
                        ]

                    );



                seatAvailabilityId =
                    inserted.rows[0]
                        .seat_avail_id;



            }

            else {


                if (
                    availability.rows[0]
                        .seat_status
                        .toUpperCase()
                    !== "AVAILABLE"

                ) {

                    throw new Error(
                        "Seat already booked."
                    );

                }



                seatAvailabilityId =
                    availability.rows[0]
                        .seat_avail_id;



                await client.query(

                    `

UPDATE seat_availability

SET seat_status='BOOKED'

WHERE seat_avail_id=$1



`,

                    [
                        seatAvailabilityId
                    ]

                );


            }








            // create passenger


            const passengerResult =
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



RETURNING passenger_id



`,

                    [
                        passenger.name,
                        passenger.email,
                        passenger.phone,
                        Number(passenger.age),
                        passenger.gender
                    ]

                );







            // create ticket


            const ticketResult =
                await client.query(

                    `

INSERT INTO ticket

(

ticket_status,

fare_amount,

passenger_id,

boarding_stop_id,

alighting_stop_id,

fare_rule_id,

seat_avail_id

)


VALUES

(
'BOOKED',
$1,
$2,
$3,
$4,
$5,
$6
)



RETURNING

ticket_id,
ticket_status,
fare_amount



`,

                    [

                        fare,

                        passengerResult.rows[0].passenger_id,

                        boardingStopId,

                        alightingStopId,

                        fareRuleId,

                        seatAvailabilityId

                    ]

                );








            // payment


            await client.query(

                `

INSERT INTO payment

(

transaction_id,

payment_method,

payment_status,

amount,

ticket_id

)


VALUES

($1,$2,'SUCCESS',$3,$4)



`,

                [

                    transactionId,

                    paymentMethod,

                    fare,

                    ticketResult.rows[0].ticket_id

                ]

            );







            createdTickets.push({

                ...ticketResult.rows[0],

                passenger_id:
                    passengerResult.rows[0]
                        .passenger_id,


                seat_id:
                    passenger.seatId


            });





        }







        await client.query("COMMIT");





        res.status(201)
            .json({

                message:
                    "Booking successful.",


                transaction_id:
                    transactionId,


                total_amount:
                    fare * createdTickets.length,


                tickets:
                    createdTickets


            });



    }

    catch (error) {


        await client.query("ROLLBACK");



        console.log(error);



        res.status(400)
            .json({

                error:
                    error.message ||
                    "Booking failed."

            });



    }

    finally {

        client.release();

    }



};











// GET MY TICKETS


exports.getMyTickets =
    async (req, res) => {


        try {


            const result =
                await pool.query(

                    `

SELECT


t.ticket_id,


t.ticket_status,


t.fare_amount,


t.booking_date,


p.name,


p.email,


p.phone



FROM ticket t



JOIN passenger p

ON p.passenger_id=t.passenger_id



JOIN users u

ON LOWER(u.email)=LOWER(p.email)



WHERE

u.user_id=$1



ORDER BY

t.booking_date DESC



`,

                    [
                        req.user.id
                    ]

                );



            res.json(result.rows);



        }
        catch (error) {


            res.status(500)
                .json({

                    error:
                        "Could not load tickets."

                });


        }



    };