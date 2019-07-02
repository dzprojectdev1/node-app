var express = require("express");
var ethnictiyApi = express.Router();
var dbConn = require("../config/dbConfig");
const checkAuth = require('../middleware/check_auth');

//#20 uc 5.1 get languages
ethnictiyApi.get('/all', checkAuth, function(req, res) {
    var publish = 1;
    dbConn.query('SELECT * FROM tbl_ethnictiy where publish=?', publish, function (error, results, fields) {
        if (error) throw error;
        
        return res.send({ error: false, data: results, message: "Country list"});
    });
});


module.exports = ethnictiyApi;

