const expr = require("express");

const router = expr.Router();

const {handleInsertion,handlegetpassengerinfo} = require("../controllers/passenger");

router.route("/").post(handleInsertion);

router.route("/").get(handlegetpassengerinfo);

module.exports = router;