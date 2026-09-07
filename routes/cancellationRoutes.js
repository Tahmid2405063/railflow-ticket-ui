const express = require("express");

const router =
    express.Router();



const authenticate =
    require("../middleware/auth");



const {

    cancelTicket,

    getCancellationHistory

}

    =
    require("../controllers/cancellationController");





router.use(authenticate);





router.post(

    "/:ticketId",

    cancelTicket

);





router.get(

    "/history",

    getCancellationHistory

);





module.exports = router;