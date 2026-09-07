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

    getAllBookings

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
        "Admin",
        "Manager"
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