const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 8000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/api', require('./routes/api'));
app.use(express.static(__dirname));
app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(port, () => console.log(`RailFlow is running at http://localhost:${port}`));
