const expr = require("express");


const trainRouter = require("./routes/train");
const routesRouter = require("./routes/trainRoutes");
const passengerRouter = require("./routes/passenger")
const port = 8000;
const app = expr();


// Middleware
app.use(expr.urlencoded({ extended: false }));
// for json app.use(expr.json())

// frontend -> index -> route -> controller ->database server->controller response

// Routes
app.use("/api/train", trainRouter);
app.use("/api/route", routesRouter);
app.use("/api/passenger",passengerRouter);

// Start server
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});