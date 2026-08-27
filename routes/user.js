const expr = require("express");
const router = expr.Router(); 
const {handleInsertion, handleGetAlluser,handleDeleteByid,handlePatchByid} = require("../controllers/user");


router.route("/")
.post(handleInsertion)
.get(handleGetAlluser)

router.route("/:id")
.delete(handleDeleteByid)
.patch(handlePatchByid)




module.exports = router ;  
