var express = require("express");
var matchApi = express.Router();
var dbConn = require("../config/dbConfig");
const checkAuth = require('../middleware/check_auth');

// #9 === set new match data
matchApi.post('/view', checkAuth, function(req,res) {    
    var newMatchSql = {
        main_user_id: req.userData.userId,
        other_user_id: req.body.other_user_id,
        status: req.body.status ? req.body.status : 0,
        status_description: req.body.status_description ? req.body.status_description : 'viewed',
        publish: 1,
        created_date: new Date(),
        updated_date: new Date()
    };

    dbConn.query("INSERT INTO tbl_match SET ? ", newMatchSql, function (error, results, fields) {
        if (error) throw error;
        return res.send({ error: false, data: results.insertId, message: 'New match has been created.' });
    });
});

// #10 === main user “hearts” other user’s video
matchApi.post('/like', checkAuth, function(req,res) {    
    var newMatchSql = {
        main_user_id: req.userData.userId,
        other_user_id: req.body.other_user_id,
        status: req.body.status ? req.body.status : 1,
        status_description: req.body.status_description ? req.body.status_description : 'heart_sent',
        publish: 1,
        created_date: null,
        updated_date: null
    };

    dbConn.query("INSERT INTO tbl_match SET ? ", newMatchSql, function (error, results, fields) {
        if (error) throw error;
        return res.send({ error: false, data: results.insertId, message: 'New match has been created.' });
    });
});


module.exports = matchApi;

