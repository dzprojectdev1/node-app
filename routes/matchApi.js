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

    if (!req.body.otherId) {
		return res.status(400).send({ error:true, message: 'Please provide other user id' });
    }  

    var newMatchSql = {
        main_user_id: req.userData.userId,
        other_user_id: req.body.otherId,
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

    if (!req.body.otherId) {
		return res.status(400).send({ error:true, message: 'Please provide other user id' });
    }  

    var blockData = {
        main_user_id: req.userData.userId,
        other_user_id: req.body.otherId,
        status: 9,
        status_description: "block_received",
        publish: 1,
        created_date: new Date(),
        updated_date: new Date()
    };

    dbConn.query("INSERT INTO tbl_match SET ? ", blockData, function(error, results, fields) {
        if (error) throw error;
        return res.send({error: false, data: results, message: 'block received.'})
    });
});


//#16 uc7.1 display incoming hearts
matchApi.get('/getReceivedHearts', checkAuth, function(req, res) {
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

    dbConn.beginTransaction(function(err){
        if (err) throw err;
        dbConn.query('INSERT INTO tbl_match set ? ', [sendRejectData], function(error, sendResult) {
            if (error) {
                dbConn.rollback(function(){
                    throw error;
                });
            }
            var receiveRejectData = {
                main_user_id: userId,
                other_user_id: otherUserId,
                status: 5,
                status_description: 'sent_heart_rejected',
                created_date: new Date(),
                updated_date: new Date()
            }
            dbConn.query('INSERT INTO tbl_match set ? ', [receiveRejectData], function(error, receiveResult) {
                if (error) {
                    dbConn.rollback(function() {
                        throw error;
                    });
                };

                dbConn.commit(function(error) {
                    if (error) {
                        dbConn.rollback(function() {
                            throw error;
                        });
                    };

                    return res.send({ error: false, data: {sendResult, receiveResult}, message: "Match Reject Created."});
                });
            });
        });
    });
});

//#22 uc 7.3 Incoming Hearts: main user accpets heart from other user
matchApi.post('/requestMatch', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    var otherUserId = req.body.otherId;

    if (!otherUserId) {
		return res.status(400).send({ error:true, message: 'Please provide other user id' });
    }  

    var heartSendData = {
        main_user_id: userId,
        other_user_id: otherUserId,
        status: 6,
        status_description: 'incoming_heart_accepted',
        created_date: new Date(),
        updated_date: new Date()
    };

    dbConn.beginTransaction(function(err){
        if (err) throw err;
        dbConn.query('INSERT INTO tbl_match set ? ', [heartSendData], function(error, sendResult) {
            if (error) {
                dbConn.rollback(function(){
                    throw error;
                });
            }
            var heartAccpetData = {
                main_user_id: otherUserId,
                other_user_id: userId,
                status: 7,
                mutual_match_id: sendResult.insertId,
                status_description: 'sent_heart_accepted',
                created_date: new Date(),
                updated_date: new Date()
            }
            dbConn.query('INSERT INTO tbl_match set ? ', [heartAccpetData], function(error, receiveResult) {
                if (error) {
                    dbConn.rollback(function() {
                        throw error;
                    });
                };

                dbConn.query("UPDATE tbl_match SET mutual_match_id = ? WHERE main_user_id = ?", [receiveResult.insertId, userId], function (error, results, fields) {
                    if (error) {
                        dbConn.rollback(function() {
                            throw error;
                        });
                    };
                    dbConn.commit(function(error) {
                        if (error) {
                            dbConn.rollback(function() {
                                throw error;
                            });
                        };

                        return res.send({ error: false, data: {sendResult, receiveResult}, message: "New Match is Created."});
                    });
                });                
            });
        });
    });
});

//#23 uc 8 Matched Page Display Matched list(matched_id)
matchApi.get('/matches', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    
    if (!userId) {
        return res.status(400).send({ error:true, message: 'Please login again!'}); 
    }

    var whereCondition = 'where a.main_user_id=? and a.status in (6,7) and a.publish=1 and b.account_status=1';

    dbConn.query('SELECT * FROM tbl_match as a inner join tbl_user as b on a.other_user_id=b.id ' + whereCondition, [userId], function(error, results, fields) {
        if(error) throw error;
        return res.send({ error: false, data: results, message: 'All match data'}); 
    });
});

module.exports = matchApi;

