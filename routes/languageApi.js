var express = require("express");
var languageApi = express.Router();
var dbConn = require("../config/dbConfig");
const checkAuth = require('../middleware/check_auth');

//#21 uc 5.1 get languages
languageApi.get('/all', checkAuth, function(req, res) {
    var publish = 1;
    dbConn.query('SELECT * FROM tbl_language where publish=?', publish, function (error, results, fields) {
        if (error) throw error;
        
        return res.send({ error: false, data: results, message: "Language list"});
    });
});

module.exports = languageApi;

