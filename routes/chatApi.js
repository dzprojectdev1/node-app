var express = require("express");
var chatApi = express.Router();
var dbConn = require("../config/dbConfig");
const checkAuth = require('../middleware/check_auth');


//#29 UC9 Chat Api == UC9.1 Display Chat - Main list
chatApi.get('/all', checkAuth, function(req, res) {
    var userId = req.userData.userId;

    var joinQuery = 'inner join tbl_chat d on c.chat_id=d.id inner join tbl_user e on c.other_user_id=e.id';
    var matchWhereCondition = 'a.main_user_id=? and a.status in (6,7) and a.publish=1 group by a.id';
    var matchJoinQuery = 'inner join tbl_chat b on a.id=b.match_id ';
    var matchQuery = 'SELECT a.id as match_id, max(b.id) as chat_id, a.other_user_id as other_user_id FROM `tbl_match` a '+matchJoinQuery+' where ' +matchWhereCondition;
    dbConn.query('select c.*, d.message_text, e.name, e.gender, e.birth_date from ('+matchQuery+') c ' + joinQuery, [userId], function(error, results, fields){
        if (error) throw error;
        return res.send({ error: false, data: results, message: "Get All Chat List"});
    });
});

//30 UC9.2  Display Chat - display chat content for the selected match_id
chatApi.get('/getChatWithMatchId/:matchId', checkAuth, function(req,res) {
    var matchId = req.params.matchId;

    dbConn.query('Select * from tbl_chat where match_id=? order by created_date desc', [matchId], function(error, results, fields){
        if (error) throw error;
        return res.send({ error: false, data: results, message: "Get All Chat List With Match Id: " + matchId});
    });
});

//31 UC9.3 Create a new Chat Text 
chatApi.post('/create', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    var matchId = req.body.matchId;
    var messageText = req.body.messageText;

    if (!matchId || !messageText) {
        return res.status(400).send({ error:true, message: 'Invalid Params.'}); 
    }

    dbConn.query('Select mutual_match_id from tbl_match where id=?', [matchId], function(err, matchResults, fields) {
        if (err) throw err;
        if (!matchResults.length)
            return res.status(400).send({ error:true, message: 'No Match Found'});

        var mutualMatchId = matchResults[0].mutual_match_id;
        var sendMsg = {
            match_id: matchId,
            message_type: 1,
            message_text: messageText,
            created_date: new Date()
        };
        dbConn.beginTransaction(function(err){
            if (err) throw err;            
            dbConn.query('INSERT INTO tbl_chat set ? ', [sendMsg], function(error, sendResult) {
                if (error) {
                    dbConn.rollback(function(){
                        throw error;
                    });
                }
                var receiveMsg = {
                    match_id: mutualMatchId,
                    message_type: 2,
                    message_text: messageText,
                    created_date: new Date()
                };
                dbConn.query('INSERT INTO tbl_chat set ? ', [receiveMsg], function(error, receiveResult) {
                    if (error) {
                        dbConn.rollback(function() {
                            throw error;
                        });
                    }
                    dbConn.commit(function(error) {
                        if (error) {
                            dbConn.rollback(function() {
                                throw error;
                            });
                        }
                        return res.send({ error: false, data: {sendResult, receiveResult}, message: "New Message is Created."});
                    });
                });
            });
        });
    });    
});

//#32 UC 10.1 Report - hide from display once blocked
chatApi.post('/reportUser', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    var otherId = req.body.otherId;
    var matchId = req.body.matchId;
    var reportDescription = req.body.reportDescription;
    
    if (!userId || !otherId || !reportDescription || !matchId) {
        return res.status(400).send({ error:true, message: 'Invalid Params.'});  
    };

    var sendReportData = {
        user_id_submitted: userId,
        user_id_violated: otherId,
        tbl_match_id: matchId,
        report_description: reportDescription,
        report_status: 8,
        created_date: new Date()
    };

    dbConn.beginTransaction(function(err){
        if (err) throw err;
        dbConn.query('INSERT INTO tbl_report set ? ', [sendReportData], function(error, sendResult) {
            if (error) {
                dbConn.rollback(function(){
                    throw error;
                });
            }
            var receiveReportData = {
                user_id_submitted: otherId,
                user_id_violated: userId,
                tbl_match_id: matchId,
                report_description: reportDescription,
                report_status: 9,
                created_date: new Date()
            };
            dbConn.query('INSERT INTO tbl_report set ? ', [receiveReportData], function(error, receiveResult) {
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

                    return res.send({ error: false, data: {sendResult, receiveResult}, message: "New Report is Created."});
                });
            });
        });
    });
});


module.exports = chatApi;

