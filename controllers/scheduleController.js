const pool = require("../connection");



function calculateFare(
    baseFare,
    farePerKm,
    distance
) {

    return Math.ceil(
        Number(baseFare)
        +
        Number(farePerKm)
        *
        Number(distance)
    );

}






// SEARCH SCHEDULES

exports.getSchedules = async (req, res) => {


    try {


        const { date } = req.query;



        const result =
            await pool.query(

                `

SELECT


s.schedule_id,

s.journey_date,

s.departure_time,

s.arrival_time,


t.train_id,

t.train_name,

t.train_type,


r.route_id,

r.route_name,

r.total_distance_km,



fr.fare_rule_id,

fr.coach_class,

fr.base_fare,

fr.fare_per_km,





first_stop.route_stop_id
AS boarding_stop_id,


first_station.station_name
AS from_station,


first_station.city
AS from_city,



last_stop.route_stop_id
AS alighting_stop_id,


last_station.station_name
AS to_station,


last_station.city
AS to_city,





COUNT(
CASE 
WHEN 
UPPER(
COALESCE(sa.seat_status,'AVAILABLE')
)
='AVAILABLE'
THEN 1
END
)
AS available_seats




FROM schedule s



JOIN train t

ON s.train_id=t.train_id



JOIN route r

ON s.route_id=r.route_id



LEFT JOIN fare_rule fr

ON fr.route_id=r.route_id





JOIN route_stop first_stop

ON first_stop.route_id=r.route_id

AND first_stop.stop_sequence=
(
SELECT MIN(stop_sequence)
FROM route_stop
WHERE route_id=r.route_id
)



JOIN station first_station

ON first_station.station_id=
first_stop.station_id





JOIN route_stop last_stop

ON last_stop.route_id=r.route_id

AND last_stop.stop_sequence=
(
SELECT MAX(stop_sequence)
FROM route_stop
WHERE route_id=r.route_id
)



JOIN station last_station

ON last_station.station_id=
last_stop.station_id





JOIN coach c

ON c.train_id=t.train_id



JOIN seat st

ON st.coach_id=c.coach_id



LEFT JOIN seat_availability sa

ON sa.seat_id=st.seat_id

AND sa.schedule_id=s.schedule_id





WHERE
($1::date IS NULL
OR
s.journey_date=$1)



GROUP BY

s.schedule_id,

t.train_id,

r.route_id,

fr.fare_rule_id,

first_stop.route_stop_id,

first_station.station_name,

first_station.city,

last_stop.route_stop_id,

last_station.station_name,

last_station.city



ORDER BY

s.journey_date,

s.departure_time



`,

                [
                    date || null
                ]

            );





        const schedules =
            result.rows.map(row => ({

                ...row,


                fare_amount:

                    row.fare_rule_id

                        ?

                        calculateFare(
                            row.base_fare,
                            row.fare_per_km,
                            row.total_distance_km
                        )

                        :

                        null


            }));





        res.status(200)
            .json(schedules);



    }
    catch (error) {

        console.log(error);


        res.status(500)
            .json({

                error:
                    "Unable to load schedules."

            });


    }



};











// GET SEATS OF A SCHEDULE

exports.getSeats = async (req, res) => {


    try {


        const result =
            await pool.query(

                `

SELECT



c.coach_id,

c.coach_no,

c.coach_class,



st.seat_id,

st.seat_no,

st.seat_type,



COALESCE(
sa.seat_status,
'AVAILABLE'
)
AS seat_status,



sa.seat_avail_id




FROM schedule s



JOIN coach c

ON c.train_id=s.train_id



JOIN seat st

ON st.coach_id=c.coach_id



LEFT JOIN seat_availability sa

ON sa.schedule_id=s.schedule_id

AND sa.seat_id=st.seat_id




WHERE

s.schedule_id=$1



ORDER BY

c.coach_no,

st.seat_no



`,

                [
                    req.params.scheduleId
                ]

            );



        res.json(result.rows);



    }
    catch (error) {

        console.log(error);


        res.status(500)
            .json({

                error:
                    "Unable to load seats."

            });


    }


};









// GET ROUTE STOPS

exports.getStops = async (req, res) => {


    try {


        const result =
            await pool.query(

                `

SELECT


rs.route_stop_id,


rs.stop_sequence,


rs.arrival_time,


rs.dept_time,



st.station_id,


st.station_name,


st.city




FROM schedule s



JOIN route_stop rs

ON rs.route_id=s.route_id



JOIN station st

ON st.station_id=rs.station_id




WHERE

s.schedule_id=$1



ORDER BY

rs.stop_sequence



`,

                [
                    req.params.scheduleId
                ]

            );



        res.json(result.rows);



    }
    catch (error) {

        console.log(error);


        res.status(500)
            .json({

                error:
                    "Unable to load route stops."

            });


    }



};