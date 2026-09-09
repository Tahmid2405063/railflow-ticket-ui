
const express = require("express");

const app = express();

const PORT = process.env.PORT || 8000;


// =================================
// MIDDLEWARE
// =================================

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);



// =================================
// API ROUTES
// =================================

app.use(
    "/api/auth",
    require("./routes/authRoutes")
);


app.use(
    "/api/passengers",
    require("./routes/passengerRoutes")
);


app.use(
    "/api/bookings",
    require("./routes/bookingRoutes")
);


app.use(
    "/api/schedules",
    require("./routes/scheduleRoutes")
);


app.use(
    "/api/cancellation",
    require("./routes/cancellationRoutes")
);


app.use(
    "/api/admin",
    require("./routes/adminRoutes")
);



// =================================
// HEALTH CHECK ROUTE
// =================================

app.get(
    "/api",
    (req,res)=>{

        res.json({
            message:"RailFlow API is running"
        });

    }
);



// =================================
// GLOBAL ERROR HANDLER
// =================================

app.use(
    (error, req, res, next)=>{

        console.error(error);


        res.status(500)
        .json({

            error:"Internal server error"

        });

    }
);



// =================================
// SERVER START
// =================================

app.listen(
    PORT,
    ()=>{

        console.log(
            `RailFlow backend running on http://localhost:${PORT}`
        );

    }
);