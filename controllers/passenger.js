const sql = require("../connection");

async function handleInsertion(req, res) {
    try {
        const { name, email, phone, age, gender } = req.body;

        await sql`
            INSERT INTO PASSENGER (NAME, EMAIL, PHONE, AGE, GENDER)
            VALUES (${name}, ${email}, ${phone}, ${age}, ${gender})
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

async function handlegetpassengerinfo(req, res) {
    try {
        const rows = await sql`
            SELECT * FROM PASSENGER
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
    handlegetpassengerinfo
};