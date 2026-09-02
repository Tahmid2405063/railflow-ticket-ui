const sql = require("../connection");

async function handleInsertion(req, res) {
    try {
        const { name, type, seats } = req.body;

        await sql`
            INSERT INTO TRAIN ( TRAIN_NAME, TRAIN_TYPE,TOTAL_SEATS)
            VALUES ( ${name}, ${type}, ${seats})
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
            SELECT * FROM TRAIN
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