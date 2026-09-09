const bcrypt = require("bcrypt");


async function generate(){

    console.log(
        await bcrypt.hash(
            "Admin@12345",
            12
        )
    );


    console.log(
        await bcrypt.hash(
            "Manager@12345",
            12
        )
    );

}


generate();