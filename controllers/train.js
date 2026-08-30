const sql = require("../connection");

async function handleInsertion(req, res) {
    try {
        const { id, name, type } = req.body;

        await sql`
            INSERT INTO TRAINS (TRAIN_ID, TRAIN_NAME, TRAIN_TYPE)
            VALUES (${id}, ${name}, ${type})
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

async function handlegettraininfo(req, res) {
    try {
        const rows = await sql`
            SELECT * FROM TRAINS
        `;

        res.json(rows);

    } catch (err) {
        console.log("Fetch error:", err);

        res.status(500).json({
            msg: "Database error"
        });
    }
}

module.exports = {
    handleInsertion,
    handlegettraininfo
};