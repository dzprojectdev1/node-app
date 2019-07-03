var express = require("express");
var matchApi = express.Router();
var dbConn = require("../config/dbConfig");
const checkAuth = require('../middleware/check_auth');

// #11 === set new match data
matchApi.post('/view', checkAuth, function(req,res) {   

    if (!req.body.other_user_id) {
		return res.status(400).send({ error:true, message: 'Please provide other user id' });
    }  
    
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

// #12 === main user “hearts” other user’s video
matchApi.post('/like', checkAuth, function(req,res) {

    if (!req.body.other_user_id) {
		return res.status(400).send({ error:true, message: 'Please provide other user id' });
    }  

    var newMatchSql = {
        main_user_id: req.userData.userId,
        other_user_id: req.body.other_user_id,
        status: req.body.status ? req.body.status : 1,
        status_description: req.body.status_description ? req.body.status_description : 'heart_sent',
        publish: 1,
        created_date: new Date(),
        updated_date: new Date()
    };

    dbConn.query("INSERT INTO tbl_match SET ? ", newMatchSql, function (error, results, fields) {
        if (error) throw error;
        return res.send({ error: false, data: results.insertId, message: 'New match has been created.' });
    });
});

//#13 === user not interest action request
matchApi.post('/dislike', checkAuth, function(req, res) {

    if (!req.body.other_user_id) {
		return res.status(400).send({ error:true, message: 'Please provide other user id' });
    }

    var notInterestData = {
        main_user_id: req.userData.userId,
        other_user_id: req.body.other_user_id,
        status: 3,
        status_description: "not_interest",
        publish: 1,
        created_date: new Date(),
        updated_date: new Date()
    };

    dbConn.query("INSERT INTO tbl_match SET ? ", notInterestData, function(error, results, fields) {
        if (error) throw error;
        return res.send({error: false, data: results, message: ''})
    });
});

//#14 uc4.3 === user set other user with block
matchApi.post('/block', checkAuth, function(req, res) {

    if (!req.body.otherId) {
		return res.status(400).send({ error:true, message: 'Please provide other user id' });
    }

    var blockData = {
        main_user_id: req.userData.userId,
        other_user_id: req.body.otherId,
        status: 8,
        status_description: "block_created",
        publish: 1,
        created_date: new Date(),
        updated_date: new Date()
    };

    dbConn.query("INSERT INTO tbl_match SET ? ", blockData, function(error, results, fields) {
        if (error) throw error;
        return res.send({error: false, data: results, message: 'User block other.'})
    });
});

//#15 uc4.3 === user block receive event
matchApi.post('/blockreply', checkAuth, function(req, res) {

    if (!req.body.other_user_id) {
		return res.status(400).send({ error:true, message: 'Please provide other user id' });
    }  

    var blockData = {
        main_user_id: req.userData.userId,
        other_user_id: req.body.other_user_id,
        status: 9,
        status_description: "block_received",
        publish: 1,
        created_date: new Date(),
        updated_date: new Date()
    };

    dbConn.query("INSERT INTO tbl_match SET ? ", blockData, function(error, results, fields) {
        if (error) throw error;
        return res.send({error: false, data: results, message: 'block received successfully.'})
    });
});


//#16 uc7.1 display incoming hearts
matchApi.get('/myHearts', checkAuth, function(req, res) {
    var userId = req.userData.userId;

    let whereCondition= 'A.status = 2 AND A.main_user_id=? AND B.is_reply=1 AND B.publish=1 AND B.is_primary=0';
    
    dbConn.query('SELECT * FROM tbl_match AS A INNER JOIN tbl_video AS B on A.id = B.match_id WHERE ' + whereCondition, [userId], function(error, results, fields) {
        if (error) throw error;
        return res.send({error: false, data: results, message: 'All hearts list'});
    });
});

//#17 uc7.2 ===  incoming hearts : main user rejects heart from other user
matchApi.post('/sendHeartReject', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    var otherUserId = req.body.otherId;

    if (!otherUserId) {
		return res.status(400).send({ error:true, message: 'Please provide other user id' });
    } 

    var sendRejectData = {
        main_user_id: userId,
        other_user_id: otherUserId,
        status: 4,
        status_description: 'incoming_heart_rejected',
        created_date: new Date(),
        updated_date: new Date()
    };
    
    dbConn.query('INSERT INTO tbl_match SET ?', sendRejectData, function(error, results, fields) {
        if (error) throw error;
        return res.send({ error: false, data: results, message: 'User reject another someone.' });
    });
});

//#18 uc7.2 ===  incoming hearts : main user receive heart from other user
matchApi.post('/receiveHeartReject', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    var otherUserId = req.body.otherId;

    if (!otherUserId) {
		return res.status(400).send({ error:true, message: 'Please provide other user id' });
    }  

    var receiveRejectData = {
        main_user_id: userId,
        other_user_id: otherUserId,
        status: 5,
        status_description: 'sent_heart_rejected',
        created_date: new Date(),
        updated_date: new Date()
    }
    dbConn.query('INSERT INTO tbl_match SET ?', receiveRejectData, function(error, results, fields) {
        if (error) throw error;
        return res.send({ error: false, data: results, message: 'User receive Other`s Heart Reject.' });
    });
});

module.exports = matchApi;

