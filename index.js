const expr = require("express");

const userRouter = require("./routes/user");
const trainRouter = require("./routes/train");
const routesRouter = require("./routes/trainRoutes");

const port = 8000;
const app = expr();


// Middleware
app.use(expr.urlencoded({ extended: false }));



// Routes
app.use("/api/user", userRouter);
app.use("/api/train", trainRouter);
app.use("/api/route", routesRouter);


// Start server
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});