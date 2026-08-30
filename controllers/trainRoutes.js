
const sql = require("../connection");


async function handleInsertion(req, res) {
    try {
        const body = req.body;

        await sql`
            INSERT INTO ROUTES
            VALUES (
                ${body.id},
                ${body.source},
                ${body.destination},
                ${body.distance}
            )
        `;

        res.json({
            msg: "success"
        });

    } catch (err) {
        console.log("Insert error:", err);

        res.status(500).json({
            msg: "Database error"
        });
    }
}


async function handlegetrouteinfo(req, res) {
    try {
        const result = await sql`
            SELECT * FROM ROUTES
        `;

        res.json(result);

    } catch (err) {
        console.log("Fetch error:", err);

        res.status(500).json({
            msg: "Database error"
        });
    }
}


module.exports = {
    handleInsertion,
    handlegetrouteinfo
};

