const express = require("express");

const router = express.Router();



const authenticate =
    require("../middleware/auth");



const {

    createBooking,

    getMyTickets

}
    =
    require("../controllers/bookingController");





router.use(authenticate);



router.post(
    "/",
    createBooking
);



router.get(
    "/my",
    getMyTickets
);



module.exports = router;