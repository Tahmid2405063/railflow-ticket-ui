const pool = require("../connection");



function calculateRefund(fare) {

    const cancellationFee = 150;

    return Math.max(
        0,
        Number(fare) - cancellationFee
    );

}







// CANCEL TICKET

exports.cancelTicket = async (req, res) => {


    const ticketId =
        req.params.ticketId;



    const client =
        await pool.connect();



    try {


        await client.query("BEGIN");





        /*
        Object level ownership check
        
        A user can only cancel
        his own ticket.
        
        */

        const ticketResult =
            await client.query(

                `

SELECT


t.ticket_id,

t.fare_amount,

t.seat_avail_id,


t.ticket_status



FROM ticket t



JOIN passenger p

ON p.passenger_id=t.passenger_id



JOIN users u

ON LOWER(u.email)=LOWER(p.email)



WHERE

t.ticket_id=$1

AND

u.user_id=$2



FOR UPDATE



`,

                [
                    ticketId,
                    req.user.id
                ]

            );







        if (ticketResult.rows.length === 0) {


            await client.query("ROLLBACK");


            return res.status(403)
                .json({

                    error:
                        "You cannot cancel this ticket."

                });



        }






        const ticket =
            ticketResult.rows[0];





        if (
            ticket.ticket_status === "Cancelled"
        ) {

            await client.query("ROLLBACK");


            return res.status(409)
                .json({

                    error:
                        "Ticket already cancelled."

                });


        }







        const refund =
            calculateRefund(
                ticket.fare_amount
            );







        // create cancellation record


        await client.query(

            `

INSERT INTO cancellation

(

reason,

refund_amount,

ticket_id

)


VALUES

($1,$2,$3)



`,

            [

                req.body.reason ||
                "Change of travel plan",

                refund,

                ticket.ticket_id

            ]

        );









        // update ticket


        await client.query(

            `

UPDATE ticket

SET

ticket_status='Cancelled'


WHERE

ticket_id=$1



`,

            [
                ticket.ticket_id
            ]

        );







        // release seat


        await client.query(

            `

UPDATE seat_availability


SET

seat_status='AVAILABLE'



WHERE

seat_avail_id=$1



`,

            [
                ticket.seat_avail_id
            ]

        );







        // refund payment


        await client.query(

            `

UPDATE payment

SET

payment_status='REFUNDED'


WHERE

ticket_id=$1



`,

            [
                ticket.ticket_id
            ]

        );






        await client.query("COMMIT");





        res.status(200)
            .json({

                message:
                    "Ticket cancelled successfully.",


                ticket_id:
                    ticket.ticket_id,


                refund_amount:
                    refund


            });



    }

    catch (error) {


        await client.query("ROLLBACK");


        console.log(error);


        res.status(500)
            .json({

                error:
                    "Cancellation failed."

            });



    }

    finally {


        client.release();


    }



};










// GET CANCELLATION HISTORY

exports.getCancellationHistory =
    async (req, res) => {


        try {


            const result =
                await pool.query(

                    `

SELECT


c.cancellation_id,


c.cancellation_date,


c.reason,


c.refund_amount,


t.ticket_id



FROM cancellation c



JOIN ticket t

ON t.ticket_id=c.ticket_id



JOIN passenger p

ON p.passenger_id=t.passenger_id



JOIN users u

ON LOWER(u.email)=LOWER(p.email)



WHERE

u.user_id=$1



ORDER BY

c.cancellation_date DESC



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
                        "Unable to load cancellation history."

                });


        }


    };