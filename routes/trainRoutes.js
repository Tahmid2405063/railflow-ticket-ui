const expr = require("express") 
const router = expr.Router()
const {handleInsertion,handlegetrouteinfo} = require("../controllers/trainRoutes")


router.route("/").post(handleInsertion)
router.route("/").get(handlegetrouteinfo)

module.exports = router 