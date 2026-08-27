const expr = require("express");
const userRouter = require("./routes/user")
const trainRouter = require("./routes/train")
const connectTodatabase= require("./connection"); 
const trainroute = require("./entities/trainRoutes")
const train = require("./entities/train")
const routesRouter = require("./routes/trainRoutes")
const port = 8000;
const app = expr();


// Middleware
app.use(expr.urlencoded({ extended: false }));

// Start server
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});


app.use("/api/user",userRouter);
app.use("/api/train",trainRouter);
app.use("/api/route",routesRouter);



// Main
async function main() {

   //  await connectTodatabase();  
      console.log("Database connected")
 //   await trainroute() ;
   // await train();  
    
  // flow : INDEX => ROUTES.USER => CONTROLLER.USER => ENTITIES.USER
}

main();