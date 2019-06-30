var express = require('express');
var app = express();
var bodyParser = require('body-parser');
require('dotenv').config();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));

// default route
app.get('/', function (req, res) {
    return res.send({ error: true, message: 'hello' })
});

var userApi = require('./routes/userApi');
var videoApi = require('./routes/videoApi');
var matchApi = require('./routes/matchApi');

app.use('/api/user', userApi);
app.use('/api/video', videoApi);
app.use('/api/match', matchApi);
 
// set port
app.listen(3000, function () {
    console.log('Node app is running on port 3000');
});
 
module.exports = app;