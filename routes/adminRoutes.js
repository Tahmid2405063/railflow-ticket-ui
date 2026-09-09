const express = require("express");

const router =
    express.Router();



const authenticate =
    require("../middleware/auth");


const authorizeRoles =
    require("../middleware/role");


const {

    getUsers,

    changeRole,

    createTrain,

    deleteTrain,

    getAllBookings,

    createSchedule,

    getRunningTrains,

    getUpcomingTrains,

    updateFare,

    cancelTrip

}
=
require("../controllers/adminController");




// every admin route requires login

router.use(authenticate);





// ADMIN ONLY

router.get(

    "/users",

    authorizeRoles("Admin"),

    getUsers

);



router.put(

    "/users/:userId/role",

    authorizeRoles("Admin"),

    changeRole

);

router.post(

    "/schedules",

    authorizeRoles(
        "Admin",
        "Manager"
    ),

    createSchedule

);

router.get(

    "/running-trains",

    authorizeRoles(
        "Admin",
        "Manager"
    ),

    getRunningTrains

);

router.get(

    "/upcoming-trains",

    authorizeRoles(
        "Admin",
        "Manager"
    ),

    getUpcomingTrains

);

router.put(

    "/fare/:fareRuleId",

    authorizeRoles(
        "Admin",
        "Manager"
    ),

    updateFare

);

router.put(

    "/cancel-trip/:scheduleId",

    authorizeRoles(
        "Admin"
    ),

    cancelTrip

);







// ADMIN + MANAGER


router.post(

    "/trains",

    authorizeRoles(
        "Admin",
        "Manager"
    ),

    createTrain

);





router.delete(

    "/trains/:trainId",

    authorizeRoles(
        "Admin"
    ),

    deleteTrain

);






router.get(

    "/bookings",

    authorizeRoles(
        "Admin",
        "Manager"
    ),

    getAllBookings

);





module.exports = router;