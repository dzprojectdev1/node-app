var express = require('express');
var app = express();
const expressip = require('express-ip');
var bodyParser = require('body-parser');
require('dotenv').config();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(expressip().getIpInfoMiddleware);

// default route
app.get('/', function (req, res) {
    return res.send({ error: true, message: 'hello' })
});

var userApi = require('./routes/userApi');
var videoApi = require('./routes/videoApi');
var matchApi = require('./routes/matchApi');
var languageApi = require('./routes/languageApi');
var countryApi = require('./routes/countryApi');
var ethnicityApi = require('./routes/ethnicityApi');
var chatApi = require('./routes/chatApi');

const storageApi = require('./routes/storageApi');

app.use('/api/user', userApi);
app.use('/api/video', videoApi);
app.use('/api/match', matchApi);
app.use('/api/language', languageApi);
app.use('/api/country', countryApi);
app.use('/api/ethnicity', ethnicityApi);
app.use('/api/chat', chatApi);
app.use('/api/storage', storageApi)

module.exports = app;