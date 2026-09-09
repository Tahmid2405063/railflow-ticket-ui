const express=require("express");

const router=express.Router();



const {

getSchedules,

getSeats,

getStops

}

=
require("../controllers/scheduleController");





router.get(
"/",
getSchedules
);



router.get(
"/:scheduleId/seats",
getSeats
);



router.get(
"/:scheduleId/stops",
getStops
);



module.exports=router;