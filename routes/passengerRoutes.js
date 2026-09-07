const express = require("express");

const router = express.Router();


const authenticate =
require("../middleware/auth");


const {getProfile,updateProfile,deleteAccount}=require("../controllers/PassengerController");




// all passenger routes require login

router.use(authenticate);





router.get(
"/profile",
getProfile
);





router.put(
"/profile",
updateProfile
);





router.delete(
"/account",
deleteAccount
);



module.exports=router;