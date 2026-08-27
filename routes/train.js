const expr = require("express") 
const router = expr.Router()
const {handleInsertion,handlegettraininfo} = require("../controllers/train")


router.route("/").post(handleInsertion)
router.route("/").get(handlegettraininfo)

module.exports = router 