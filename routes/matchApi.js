var express = require("express");
var matchApi = express.Router();
var dbConn = require("../config/dbConfig");
const checkAuth = require('../middleware/check_auth');
const commonFunc = require('../config/common').commonFunc;
var FCM = require('fcm-node');
const serverKey = process.env.FIREBASE_SERVER_KEY;
const fcm = new FCM(serverKey);
var illegalWords = [
    'sex',
    'pussy',
    'fuck',
    'fucking',
    'lick',
    'boob',
    'boobs',
    'tit',
    'tits',
    'nude',
    'blowjob',
    'cum',
    'porn',
    'naked',
    'cock',
    'dildo',
    'horny',
    'dick',
    'sexting',
    'sexchat',
    'penis',
    'pennis',
    'vagina',
    'call girl',
    'sex chat',
    'suck my',
    'suck your',
];

// #11 === set new match data
matchApi.post('/view', checkAuth, function (req, res) {

    if (!req.body.other_user_id) {
        return res.status(400).send({ error: true, message: 'Please provide other user id' });
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
        if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
        return res.send({ error: false, data: results.insertId, message: 'New match has been created.' });
    });
});

// #12 === main user “hearts” other user’s video ===
matchApi.post('/like', checkAuth, function (req, res) {
    var userId = req.userData.userId;
    var otherId = req.body.otherId;

    if (!otherId) {
        return res.status(400).send({ error: true, message: 'Please provide other user id' });
    }

    let query = 'select * from tbl_user where id = ?';
    dbConn.query(query, userId, function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if(!results || !results.length) return res.send({error: false, message: 'There is no matched user.'});

        let coin_count = results[0].coin_count;
        let account_status = results[0].account_status;

        if (account_status == 1) {

            if (coin_count > 0) {
                coin_count = coin_count - 1;

                // get coin_per_message for the other user
                dbConn.query('select * from tbl_user where id = ?', otherId, function(error, otherUserResults, fields) {
                    if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                    if (!otherUserResults || !otherUserResults.length)
                        return res.send({error: false, message: 'There is no matched user.'});
                    
                    var coin_per_message = 1;
                    if (otherUserResults[0]) {
                        coin_per_message = otherUserResults[0].coin_per_message;
                    }

                    dbConn.query('SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND status in (1, 2, 6, 7)', [userId, otherId], function (getError, getResults, getFields) {
                        if (getError) return res.status(400).send({ error: true, detail: getError.code, message: getError.sqlMessage });
                        if (getResults.length)
                            return res.status(400).send({ error: true, data: getResults, message: 'You already sent heart to this user.' });

                        var newMatchSql = {
                            main_user_id: userId,
                            other_user_id: otherId,
                            status: 1,
                            status_description: 'heart_sent',
                            coin_per_message: coin_per_message,
                            publish: 1,
                            created_date: new Date(),
                            updated_date: new Date()
                        };

                        dbConn.beginTransaction(function (err) {
                            if (err) return res.status(400).send({ error: true, detail: err.code, message: err.sqlMessage });
                            dbConn.query("INSERT INTO tbl_match SET ? ", newMatchSql, function (error, results, fields) {
                                if (error) {
                                    dbConn.rollback(function () {
                                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                    });
                                }

                                var heartReceiveData = {
                                    main_user_id: otherId,
                                    other_user_id: userId,
                                    status: 2,
                                    status_description: 'heart_received',
                                    mutual_match_id: results.insertId,
                                    publish: 1,
                                    created_date: new Date(),
                                    updated_date: new Date()
                                }

                                dbConn.query('INSERT INTO tbl_match SET ? ', heartReceiveData, function (error1, receiveResult, fields) {
                                    if (error1) {
                                        dbConn.rollback(function () {
                                            return res.status(400).send({ error: true, detail: error1.code, message: error1.sqlMessage });
                                        });
                                    }
                                    dbConn.query("UPDATE tbl_match SET mutual_match_id=? WHERE id=?", [receiveResult.insertId, results.insertId], function (error, results, fields) {
                                        if (error) {
                                            dbConn.rollback(function () {
                                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                            });
                                        }

                                        dbConn.commit(function (error) {
                                            if (error) {
                                                dbConn.rollback(function () {
                                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                });
                                            };
                                            dbConn.query("SELECT * FROM tbl_user WHERE id=?", otherId, function(error1, receiverData, receiverFields) {
                                                if (error1) return res.status(403).send({error: true, detail: error1.code, message: error1.sqlMessage});
                                                if (!receiverData.length) return res.status(400).send({error: true, message: 'user not found'});
                                                const receiver = receiverData[0];
                                                const deviceId = receiver.fcm_id;
                                                dbConn.query('SELECT * FROM tbl_user WHERE id=?', userId, function(error2, senderData, senderFeidls) {
                                                    if (error2) return res.status(403).send({error: true, detail: error2.code, message: error2.sqlMessage});
                                                    if (!senderData.length) return res.status(403).send({error: true, message: 'Sender User not found'});
                                                    const sender = senderData[0];
                                                    const senderName = sender.name;
                                                    dbConn.query('UPDATE tbl_user SET last_loggedin_date=? WHERE id=?', [new Date(), userId], function(actErr, actRows, actFields) {
                                                        if (actErr) return res.status(400).send({error: true, detail: actErr.code, message: actErr.sqlMessage});

                                                        query = 'update tbl_user set coin_count = ? where id = ?';
                                                        dbConn.query(query, [coin_count, userId], function(error, row, fields) {
                                                            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

                                                            var message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
                                                                to: deviceId,
                                                                notification: {
                                                                    title: 'Incoming Heart',
                                                                    body: senderName.toString() + ' sent you a heart.',
                                                                },
                                                                data: {  //you can send only notification or only data(or include both)
                                                                    type: 'Income'
                                                                }
                                                            };
                                                            fcm.send(message, function(notiErr, notiRes){
                                                                if (notiErr) {
                                                                    console.log("Something has gone wrong!");
                                                                    // return res.send({ error: false, data: { sentDataId: results.insertId, receiveDataId: receiveResult.insertId, coin_count: coin_count, account_status: account_status }, message: 'New match has been created.' });
                                                                } else {
                                                                    console.log("Successfully sent with response: ", notiRes);
                                                                }
                                                            });
                                                            return res.send({ error: false, data: { sentDataId: results.insertId, receiveDataId: receiveResult.insertId, coin_count: coin_count, account_status: account_status }, message: 'New match has been created.' });
                                                        });
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            } else {
                return res.send({error: false, data: { sentDataId: -1, receiveDataId: -1, coin_count: coin_count, account_status: account_status }, message: 'You need 1 diamond to send a heart.'});
            }
        } else {
            return res.send({error: false, data: { sentDataId: -1, receiveDataId: -1, coin_count: coin_count, account_status: account_status  }, message: 'Your Account Is Not Active.'});
        }
    });
});

//#13 === user not interest action request
matchApi.post('/dislike', checkAuth, function (req, res) {
    var otherId = req.body.otherId;
    var userId = req.userData.userId;

    if (!otherId) {
        return res.status(400).send({ error: true, message: 'Please provide other user id' });
    }

    dbConn.query("SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND status=3", [userId, otherId], function (error, oldResults, fields) {
        if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });

        if (oldResults.length)
            return res.status(403).send({ error: true, data: oldResults, message: 'Match data is already Taken.' });

        var notInterestData = {
            main_user_id: userId,
            other_user_id: otherId,
            status: 3,
            status_description: "not_interest",
            publish: 1,
            created_date: new Date(),
            updated_date: new Date()
        };

        dbConn.query("INSERT INTO tbl_match SET ? ", notInterestData, function (error, results, fields) {
            if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });

            dbConn.query('UPDATE tbl_user SET last_loggedin_date=? WHERE id=?', [new Date(), userId], function(actErr, actRows, actFields) {
                if (actErr) return res.status(400).send({error: true, detail: actErr.code, message: actErr.sqlMessage});

                return res.send({ error: false, data: results, message: 'Dislike data is created.' });
            });
        });
    });
});

var blockFunction = (req, res, next) => {
    try {
        var userId = req.userData.userId;
        var otherId = req.body.otherId;

        if (!otherId) {
            return res.status(400).send({ error: true, message: 'Please provide other user id' });
        }

        dbConn.query("SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND status=8", [userId, otherId], function (error, results, fields) {
            if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
            if (results.length) {
                req.oldData = results[0];
                next();
            } else {
                //get status 2,6,7 match data,
                dbConn.query("SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND publish=1 AND status in (2,6,7)", [userId, otherId], function (error, results, fields) {
                    if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });

                    if (results.length) {
                        var resultIdArr = results.map(one => {
                            return one.id;
                        });
                        dbConn.query("UPDATE tbl_match SET publish=0 WHERE id IN (?)", resultIdArr.join(), function (error, updateResults, updateFields) {
                            if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                        });
                    }

                    dbConn.query("SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND publish=1 AND status in (2,6,7)", [otherId, userId], function (error, otherResults, fields) {
                        if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
    
                        if (otherResults.length) {
                            var otherResultIdArr = otherResults.map(one => {
                                return one.id;
                            });
                            dbConn.query("UPDATE tbl_match SET publish=2 WHERE id IN (?)", otherResultIdArr.join(), function (error, updateResults, updateFields) {
                                if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                            });
                        }

                        var blockCreateData = {
                            main_user_id: userId,
                            other_user_id: otherId,
                            status: 8,
                            status_description: "block_created",
                            publish: 1,
                            created_date: new Date(),
                            updated_date: new Date()
                        };

                        dbConn.beginTransaction(function (err) {
                            if (err) return res.status(400).send({ error: true, message: err });
                            dbConn.query("INSERT INTO tbl_match SET ? ", blockCreateData, function (error, results, fields) {
                                if (error) {
                                    dbConn.rollback(function () {
                                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                    });
                                }

                                req.matchId = results.insertId;

                                var blockRecieveData = {
                                    main_user_id: otherId,
                                    other_user_id: userId,
                                    status: 9,
                                    status_description: "block_received",
                                    publish: 1,
                                    created_date: new Date(),
                                    updated_date: new Date()
                                };

                                dbConn.query('INSERT INTO tbl_match SET ? ', blockRecieveData, function (error1, receiveResult, fields) {
                                    if (error1) {
                                        dbConn.rollback(function () {
                                            return res.status(400).send({ error: true, detail: error1.code, message: error1.sqlMessage });
                                        });
                                    }

                                    dbConn.commit(function (error) {
                                        if (error) {
                                            dbConn.rollback(function () {
                                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                            });
                                        };
                                        next();
                                    });
                                });
                            });
                        });
                    });
                });
            }
        });
    } catch (error) {
        return res.status(401).json({
            message: error
        });
    }
}

var findSubarray = (arr, subarr) => {
    for (var i = 0; i < 1 + (arr.length - subarr.length); i++) {
        var j = 0;
        for (; j < subarr.length; j++)
            if (arr[i + j] !== subarr[j])
                break;
        if (j == subarr.length)
            return i;
    }
    return -1;
}

var autoBlockFunction = (req, res, next) => {
    try {
        var userId = req.userData.userId;
        var matchId = req.body.matchId;
        var messageText = req.body.messageText;
        console.log('Match id is ' + matchId);

        if (!matchId) {
            return res.status(400).send({ error: true, message: 'Please provide match id' });
        }

        var otherId = 0;
        let query = 'select * from tbl_match where id=?';
        dbConn.query(query, matchId, function(error, otherResults, fields) {
            if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
            if (!otherResults || !otherResults.length) return res.status(403).send({ error: true, message: 'No match other id.' })

            otherId = otherResults[0].other_user_id;
            console.log('Other user id is ' + otherId);

            query = "select * from tbl_user where id = ?";
            dbConn.query(query, otherId, function(error, otherResultRows, fields) {
                if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                if (!otherResultRows || !otherResultRows.length) return res.status(400).send({ error: true, message: 'No Match Found' });

                var auto_block = otherResultRows[0].auto_block;

                if (auto_block == 1) {

                    var messaegTextArr = messageText.toUpperCase().split(" ");
                    
                    var booleanValue = illegalWords.every(function(words, index) {
                        var wordsArr = words.toUpperCase().split(" ");

                        return findSubarray(messaegTextArr, wordsArr) === -1;
                    })

                    if (booleanValue) {
                        req.userData.userId = userId;
                        req.body.matchId = matchId;
                        req.body.messageText = messageText;
                        next();
                    } else {

                        query = "select count(id) as count from tbl_match where main_user_id = ? and status_description = 'block_received_auto'";
                        dbConn.query(query, userId, function(error, results, fields) {
                            if (error) return error;
                            if (!results || !results.length) return error;

                            var auto_blocked_count = results[0].count;
                            if (auto_blocked_count >= 15) {

                                console.log('AutoBlockFunctio runs: this user has over 15 auto bocked times');
                                query = "update tbl_user set account_status = 9 where id = ?";
                                dbConn.query(query, userId, function(error, uptResults, fields) {
                                    if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });

                                    return res.send({ error: false, data: { account_status: 9, sending_available: false }, message: "Your Account Is Not Active." });
                                })
                            } else {
                                dbConn.query("SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND status=9", [userId, otherId], function (error, results, fields) {
                                    if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                    if (results.length) {
                                        return res.send({ error: true, message: 'Block Data Already exist' });
                                    } else {
                                        //get status 2,6,7 match data,
                                        dbConn.query("SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND publish=1 AND status in (2,6,7)", [otherId, userId], function (error, results, fields) {
                                            if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                        
                                            if (results.length) {
                                                var resultIdArr = results.map(one => {
                                                    return one.id;
                                                });
                                                dbConn.query("UPDATE tbl_match SET publish=0 WHERE id IN (?)", resultIdArr.join(), function (error, updateResults, updateFields) {
                                                    if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                });
                                            }
                        
                                            dbConn.query("SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND publish=1 AND status in (2,6,7)", [userId, otherId], function (error, otherResults, fields) {
                                                if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                            
                                                if (otherResults.length) {
                                                    var otherResultIdArr = otherResults.map(one => {
                                                        return one.id;
                                                    });
                                                    dbConn.query("UPDATE tbl_match SET publish=2 WHERE id IN (?)", otherResultIdArr.join(), function (error, updateResults, updateFields) {
                                                        if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                    });
                                                }
                        
                                                var blockCreateData = {
                                                    main_user_id: userId,
                                                    other_user_id: otherId,
                                                    status: 9,
                                                    status_description: "block_received_auto",
                                                    publish: 1,
                                                    created_date: new Date(),
                                                    updated_date: new Date()
                                                };
                        
                                                dbConn.beginTransaction(function (err) {
                                                    if (err) return res.status(400).send({ error: true, message: err });
                                                    dbConn.query("INSERT INTO tbl_match SET ? ", blockCreateData, function (error, results, fields) {
                                                        if (error) {
                                                            dbConn.rollback(function () {
                                                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                            });
                                                        }
                        
                                                        req.matchId = results.insertId;
                        
                                                        var blockRecieveData = {
                                                            main_user_id: otherId,
                                                            other_user_id: userId,
                                                            status: 8,
                                                            status_description: "block_created_auto",
                                                            publish: 1,
                                                            created_date: new Date(),
                                                            updated_date: new Date()
                                                        };
                        
                                                        dbConn.query('INSERT INTO tbl_match SET ? ', blockRecieveData, function (error1, receiveResult, fields) {
                                                            if (error1) {
                                                                dbConn.rollback(function () {
                                                                    return res.status(400).send({ error: true, detail: error1.code, message: error1.sqlMessage });
                                                                });
                                                            }
                        
                                                            dbConn.commit(function (error) {
                                                                if (error) {
                                                                    dbConn.rollback(function () {
                                                                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                                    });
                                                                };
                                                                return res.send({ error: false, data: { account_status: 1, sending_available: false }, message: "Your Account Is Not Active." });
                                                            });
                                                        });
                                                    });
                                                });
                                            });
                                        });
                                    }
                                });
                            }
                        });
                    }

                } else {
                    req.userData.userId = userId;
                    req.body.matchId = matchId;
                    req.body.messageText = messageText;
                    next();
                }
            });
        })
    } catch (error) {
        return res.status(401).json({
            message: error
        });
    }
}

//#14 uc4.3 === user set other user with block
matchApi.post('/block', checkAuth, blockFunction, function (req, res) {
    if (req.oldData) return res.send({ error: true, data: req.oldData, message: 'Block Data Already exist' });
    return res.send({ error: false, message: 'New block has been created.' });
});

//#16 uc7.1 display incoming hearts
matchApi.get('/getReceivedHearts', checkAuth, function (req, res) {
    var userId = req.userData.userId;

    var distanceQuery = ' (3959 * acos(cos(radians(d.lat_geo)) * cos(radians(c.lat_geo)) * cos(radians(c.long_geo) - radians(d.long_geo)) + sin(radians(d.lat_geo)) * sin(radians(c.lat_geo)))) as distance, ';
    var ageQuery = ' TIMESTAMPDIFF(YEAR, c.birth_date, CURDATE()) AS age ';

    var leftJoinQuery = ' Inner join tbl_user c on a.other_user_id=c.id inner join tbl_user d on a.main_user_id=d.id left join tbl_video b on a.other_user_id=b.user_id ';
    var whereCondition = ' (b.cdn_id IS NULL or b.is_primary=1) and a.publish=1 and a.status=2 and a.main_user_id=? and c.account_status=1 order by a.id desc ';
    var leftSqlQuery = '(SELECT a.id, a.other_user_id, b.cdn_id, b.cdn_filtered_id, b.is_primary, b.content_type, c.name, c.gender, c.description, c.coin_count, c.fan_count, c.ai_friend, c.ai_personality, c.img_message, ' + distanceQuery + ageQuery + 'FROM tbl_match a ' + leftJoinQuery + 'WHERE' + whereCondition + ')';
    
    // var rightJoinQuery = ' right join tbl_video b on a.other_user_id=b.user_id Inner join tbl_user c on a.other_user_id=c.id inner join tbl_user d on a.main_user_id=d.id '
    // var rightSqlQuery = '(SELECT a.id, a.other_user_id, b.cdn_filtered_id, c.name, c.gender, ' + distanceQuery + ageQuery + 'FROM `tbl_match` a ' + rightJoinQuery + 'WHERE' + whereCondition + ')';
    // return res.send({query: leftSqlQuery});
    dbConn.query(leftSqlQuery, [userId], function (error, results, fields) {
        if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
        if (!results.length) return res.status(403).send({ error: true, message: 'Received Heart data not found.' })
        return res.send({ error: false, data: results, message: 'All hearts list' });
    });
});

//#16.1 uc7.1 display incoming hearts - Pagination
// matchApi.post('/getReceivedHearts', checkAuth, function (req, res) {
//     var userId = req.userData.userId;
//     var perPageCount = req.body.count;
//     var offSet = req.body.offset;
    
//     if (!perPageCount || !offSet) 
//         return res.status(403).send({error: true, message: 'invalid params'});

//     perPageCount = parseInt(perPageCount);
//     offSet = parseInt(offSet);

//     console.log('perPageCount is ' + perPageCount);
//     console.log('offSet is ' + offSet);

//     var distanceQuery = ' (3959 * acos(cos(radians(d.lat_geo)) * cos(radians(c.lat_geo)) * cos(radians(c.long_geo) - radians(d.long_geo)) + sin(radians(d.lat_geo)) * sin(radians(c.lat_geo)))) as distance, ';
//     var ageQuery = ' TIMESTAMPDIFF(YEAR, c.birth_date, CURDATE()) AS age ';

//     var leftJoinQuery = ' Inner join tbl_user c on a.other_user_id=c.id inner join tbl_user d on a.main_user_id=d.id left join tbl_video b on a.other_user_id=b.user_id ';
//     var whereCondition = ' (b.cdn_id IS NULL or b.is_primary=1) and a.publish=1 and a.status=2 and a.main_user_id=? and c.account_status=1 order by a.id desc LIMIT ? OFFSET ? ';
//     var leftSqlQuery = '(SELECT a.id, a.other_user_id, b.cdn_id, b.cdn_filtered_id, b.is_primary, c.name, c.gender, c.description, ' + distanceQuery + ageQuery + 'FROM tbl_match a ' + leftJoinQuery + 'WHERE' + whereCondition + ')';
    
//     // var rightJoinQuery = ' right join tbl_video b on a.other_user_id=b.user_id Inner join tbl_user c on a.other_user_id=c.id inner join tbl_user d on a.main_user_id=d.id '
//     // var rightSqlQuery = '(SELECT a.id, a.other_user_id, b.cdn_filtered_id, c.name, c.gender, ' + distanceQuery + ageQuery + 'FROM `tbl_match` a ' + rightJoinQuery + 'WHERE' + whereCondition + ')';
//     // return res.send({query: leftSqlQuery});
//     dbConn.query(leftSqlQuery, [userId, perPageCount, offSet], function (error, results, fields) {
//         if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
//         if (!results.length) return res.status(403).send({ error: true, message: 'Received Heart data not found.' })
//         return res.send({ error: false, data: results, message: 'All hearts list' });
//     });
// });

//#17 uc7.2 ===  incoming hearts : main user rejects heart from other user
matchApi.post('/sendHeartReject', checkAuth, function (req, res) {
    var userId = req.userData.userId;
    var otherUserId = req.body.otherId;

    if (!otherUserId) {
        return res.status(400).send({ error: true, message: 'Please provide other user id' });
    }

    dbConn.query('SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND status=4', [userId, otherUserId], function (getError, oldResults, fields) {
        if (getError) return res.status(400).send({ error: true, detail: getError.code, message: getError.sqlMessage });

        if (oldResults.length)
            return res.status(400).send({ error: true, detail: oldResults, message: 'Already Taken.' });

        var sendRejectData = {
            main_user_id: userId,
            other_user_id: otherUserId,
            status: 4,
            status_description: 'incoming_heart_rejected',
            publish: 1,
            created_date: new Date(),
            updated_date: new Date()
        };

        dbConn.beginTransaction(function (err) {
            if (err) return res.status(400).send({ error: true, detail: err.code, message: err.sqlMessage });
            dbConn.query('INSERT INTO tbl_match set ? ', [sendRejectData], function (error, sendResult, fields) {
                if (error) {
                    dbConn.rollback(function () {
                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                    });
                }
                var receiveRejectData = {
                    main_user_id: otherUserId,
                    other_user_id: userId,
                    status: 5,
                    status_description: 'sent_heart_rejected',
                    mutual_match_id: sendResult.insertId,
                    publish: 1,
                    created_date: new Date(),
                    updated_date: new Date()
                }
                dbConn.query('INSERT INTO tbl_match set ? ', [receiveRejectData], function (error, receiveResult) {
                    if (error) {
                        dbConn.rollback(function () {
                            return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                        });
                    };
                    dbConn.query("UPDATE tbl_match SET mutual_match_id = ? WHERE main_user_id = ?", [receiveResult.insertId, userId], function (error, results, fields) {
                        if (error) {
                            dbConn.rollback(function () {
                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                            });
                        };
                        dbConn.query('UPDATE tbl_match SET publish=0 WHERE status=2 AND main_user_id=? AND other_user_id=?', [userId, otherUserId], function (error2, updateResult, fields) {
                            if (error2) {
                                dbConn.rollback(function () {
                                    return res.status(400).send({ error: true, detail: error2.code, message: error2.sqlMessage });
                                });
                            }
                            dbConn.commit(function (error) {
                                if (error) {
                                    dbConn.rollback(function () {
                                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                    });
                                };
                                return res.send({ error: false, message: 'Rejected.' });
                            });
                        });
                    });
                });
            });
        });
    });
});

//#22 uc 7.3 Incoming Hearts: main user accpets heart from other user
matchApi.post('/requestMatch', checkAuth, function (req, res) {
    var userId = req.userData.userId;
    var otherUserId = req.body.otherId;

    if (!otherUserId) {
        return res.status(400).send({ error: true, message: 'Please provide other user id' });
    }

    console.log('User id is ' + userId);

    let query = 'select * from tbl_user where id = ?';
    dbConn.query(query, userId, function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if(!results || !results.length) return res.send({error: false, message: 'There is no matched user.'});
        
        var account_status = results[0].account_status;
        
        if (account_status == 1) {

            dbConn.query('SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND publish=1 AND status=6', [userId, otherUserId], function (error, oldMatchResult, fields) {
                if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
        
                if (oldMatchResult.length)
                    return res.status(400).send({ error: true, message: 'Match data already exist.' });
        
                var heartSendData = {
                    main_user_id: userId,
                    other_user_id: otherUserId,
                    status: 6,
                    publish: 1,
                    status_description: 'incoming_heart_accepted',
                    created_date: new Date(),
                    updated_date: new Date()
                };
                dbConn.query('select * from tbl_match where main_user_id = ? and other_user_id = ? and status = 1', [otherUserId, userId], function(error, getCoinPerMessageResults, fields) {
                    if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                    if (!getCoinPerMessageResults || !getCoinPerMessageResults.length) return res.send({error: false, message: 'There is no matched recode.'});

                    var coin_per_message = 1;
                    if (getCoinPerMessageResults[0]) {
                        coin_per_message = getCoinPerMessageResults[0].coin_per_message;
                    }

                    dbConn.beginTransaction(function (err) {
                        if (err) return res.status(400).send({ error: true, message: err });
                        dbConn.query('INSERT INTO tbl_match set ? ', [heartSendData], function (error, sendResult) {
                            if (error) {
                                dbConn.rollback(function () {
                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                });
                            };
                            var heartAccpetData = {
                                main_user_id: otherUserId,
                                other_user_id: userId,
                                status: 7,
                                publish: 1,
                                mutual_match_id: sendResult.insertId,
                                status_description: 'sent_heart_accepted',
                                coin_per_message: coin_per_message,
                                created_date: new Date(),
                                updated_date: new Date()
                            }
                            dbConn.query('INSERT INTO tbl_match set ? ', [heartAccpetData], function (error, receiveResult) {
                                if (error) {
                                    dbConn.rollback(function () {
                                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                    });
                                };
            
                                dbConn.query("UPDATE tbl_match SET mutual_match_id=? WHERE id=?", [receiveResult.insertId, sendResult.insertId], function (error, results, fields) {
                                    if (error) {
                                        dbConn.rollback(function () {
                                            return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                        });
                                    };
                                    dbConn.query('UPDATE tbl_match SET publish=0 WHERE status=2 AND main_user_id=? AND other_user_id=?', [userId, otherUserId], function (error, results, fields) {
                                        if (error) {
                                            dbConn.rollback(function () {
                                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                            });
                                        }
            
                                        dbConn.query('SELECT cdn_id FROM tbl_video WHERE user_id=? AND is_primary=1 AND is_reply=0', otherUserId, function (error, cdnResults, fields) {
                                            if (error) {
                                                dbConn.rollback(function () {
                                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                });
                                            }
                                            // if (!cdnResults.length) return res.send({ error: true, message: "user's private video does not exist." });
                                            dbConn.commit(function (error) {
                                                if (error) {
                                                    dbConn.rollback(function () {
                                                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                    });
                                                };
                                                dbConn.query("SELECT * FROM tbl_user WHERE id=?", otherUserId, function(error1, receiverData, receiverFields) {
                                                    if (error1) return res.status(403).send({error: true, detail: error1.code, message: error1.sqlMessage});
                                                    if (!receiverData.length) return res.status(400).send({error: true, message: 'user not found'});
                                                    const receiver = receiverData[0];
                                                    const deviceId = receiver.fcm_id;
                                                    dbConn.query('SELECT * FROM tbl_user WHERE id=?', userId, function(error2, senderData, senderFeidls) {
                                                        if (error2) return res.status(403).send({error: true, detail: error2.code, message: error2.sqlMessage});
                                                        if (!senderData.length) return res.status(403).send({error: true, message: 'Sender User not found'});
                                                        const sender = senderData[0];
                                                        const senderName = sender.name;
                                                        dbConn.query('UPDATE tbl_user SET last_loggedin_date=? WHERE id=?', [new Date(), userId], function(actErr, actRows, actFields) {
                                                            if (actErr) return res.status(400).send({error: true, detail: actErr.code, message: actErr.sqlMessage});
                                                            var message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
                                                                to: deviceId,
                                                                notification: {
                                                                    title: 'You have a new match!',
                                                                    body: senderName.toString() + ' is matched with you.',
                                                                },
                                                                data: {  //you can send only notification or only data(or include both)
                                                                    type: 'Match'
                                                                }
                                                            };
                                                            fcm.send(message, function(notiErr, notiRes){
                                                                if (notiErr) {
                                                                    console.log("Something has gone wrong!");
                                                                    return res.send({ error: false, data: { cdn_id: cdnResults, match_id: sendResult.insertId, account_status: account_status }, message: "New match is created." });
                                                                } else {
                                                                    console.log("Successfully sent with response: ", notiRes);
                                                                    return res.send({ error: false, data: { cdn_id: cdnResults, match_id: sendResult.insertId, account_status: account_status }, message: "New match is created." });
                                                                }
                                                            });
                                                        });                                                                                     
                                                    });                                        
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        } else {
            console.log('Deactivated. ');
            return res.send({error: false, data: { cdn_id: -1, match_id: -1, account_status: account_status  }, message: 'Your Account Is Not Active.'});
        }
    });
});



//#22 uc 7.4 Instant Chat: main user send the message to the other user instantly
matchApi.post('/requestInstantMatch', checkAuth, function (req, res) {
    var userId = req.userData.userId;
    var otherUserId = req.body.otherId;

    if (!otherUserId) {
        return res.status(400).send({ error: true, message: 'Please provide other user id' });
    }

    // check diamonds count ? < 50
    let query = 'select * from tbl_user where id = ?';
    dbConn.query(query, userId, function(error, checkUsers, fields) {
        if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
        if (!checkUsers || !checkUsers.length) return res.send({error: false, message: 'There is no matched user.'})

        let coin_count = checkUsers[0].coin_count;
        let account_status = checkUsers[0].account_status;

        if (account_status == 1) {

            // verify has unlimited instant chat permission
            query = "select * from tbl_transaction where user_id = ? and dist = 'pass' order by created_at desc";
            dbConn.query(query, userId, function(error, transactionResults, fields) {
                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                if(!transactionResults || !transactionResults.length) {                    

                    //if (coin_count < 50) {
                    //    res.send({error: false, data: { ability: false, match_id: -1, coin_count: coin_count, account_status: account_status}, message: 'You have no enough diamonds to start instant chatting.'});
                    //} else {
            
                        // reduce the coin_count for instant chatting
                        //coin_count = coin_count - 50;
            
                        // check out existance
                        dbConn.query('SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND publish=1 AND status in (6, 7)', [userId, otherUserId], function (error, oldMatchResult, fields) {
                            if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                    
                            if (oldMatchResult.length)
                                return res.status(400).send({ error: true, message: 'You are already connected to this user.' });      

                            dbConn.query('select * from tbl_user where id = ?', otherUserId, function(error, getCoinPerMessageResults, fields) {
                                if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                if (!getCoinPerMessageResults || !getCoinPerMessageResults.length) return res.send({error: false, message: 'There is no matched user.'})

                                var coin_per_message = 1;
                                if (getCoinPerMessageResults[0]) {
                                    coin_per_message = getCoinPerMessageResults[0].coin_per_message;
                                }

                                // creat a new match for instant chatting                            
                                var heartSendData = {
                                    main_user_id: userId,
                                    other_user_id: otherUserId,
                                    status: 7,
                                    publish: 1,
                                    coin_per_message: coin_per_message,
                                    status_description: 'instant_match_sent_heart_accepted',
                                    created_date: new Date(),
                                    updated_date: new Date()
                                }
                
                                dbConn.beginTransaction(function (err) {
                                    if (err) return res.status(400).send({ error: true, message: err });
                                    dbConn.query('INSERT INTO tbl_match set ? ', [heartSendData], function (error, sendResult) {
                                        if (error) {
                                            dbConn.rollback(function () {
                                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                            });
                                        };

                                        var heartAccpetData = {
                                            main_user_id: otherUserId,
                                            other_user_id: userId,
                                            status: 6,
                                            publish: 1,
                                            mutual_match_id: sendResult.insertId,
                                            status_description: 'instant_match_incoming_heart_accepted',
                                            created_date: new Date(),
                                            updated_date: new Date()
                                        };

                                        dbConn.query('INSERT INTO tbl_match set ? ', [heartAccpetData], function (error, receiveResult) {
                                            if (error) {
                                                dbConn.rollback(function () {
                                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                });
                                            };
                        
                                            dbConn.query("UPDATE tbl_match SET mutual_match_id=? WHERE id=?", [receiveResult.insertId, sendResult.insertId], function (error, results, fields) {
                                                if (error) {
                                                    dbConn.rollback(function () {
                                                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                    });
                                                };
                
                                                dbConn.query('update tbl_user set coin_count = ? where id = ?', [coin_count, userId], function(error, updateCoinResult, fields) {
                                                    if (error) {
                                                        dbConn.rollback(function () {
                                                            return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                        });
                                                    };
                
                                                    // if (!cdnResults.length) return res.send({ error: true, message: "user's private video does not exist." });
                                                    dbConn.commit(function (error) {
                                                        if (error) {
                                                            dbConn.rollback(function () {
                                                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                            });
                                                        };
                                                        dbConn.query("SELECT * FROM tbl_user WHERE id=?", otherUserId, function(error1, receiverData, receiverFields) {
                                                            if (error1) return res.status(403).send({error: true, detail: error1.code, message: error1.sqlMessage});
                                                            if (!receiverData.length) return res.status(400).send({error: true, message: 'user not found'});
                                                            const receiver = receiverData[0];
                                                            const deviceId = receiver.fcm_id;
                                                            dbConn.query('SELECT * FROM tbl_user WHERE id=?', userId, function(error2, senderData, senderFeidls) {
                                                                if (error2) return res.status(403).send({error: true, detail: error2.code, message: error2.sqlMessage});
                                                                if (!senderData.length) return res.status(403).send({error: true, message: 'Sender User not found'});
                                                                const sender = senderData[0];
                                                                const senderName = sender.name;
                                                                dbConn.query('UPDATE tbl_user SET last_loggedin_date=? WHERE id=?', [new Date(), userId], function(actErr, actRows, actFields) {
                                                                    if (actErr) return res.status(400).send({error: true, detail: actErr.code, message: actErr.sqlMessage});
                                                                    var message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
                                                                        to: deviceId,
                                                                        notification: {
                                                                            title: 'You have a new match!',
                                                                            body: senderName.toString() + ' is matched with you.',
                                                                        },
                                                                        data: {  //you can send only notification or only data(or include both)
                                                                            type: 'Match'
                                                                        }
                                                                    };
                                                                    fcm.send(message, function(notiErr, notiRes){
                                                                        if (notiErr) {
                                                                            console.log("Something has gone wrong!");
                                                                        } else {
                                                                            console.log("Successfully sent with response: ");
                                                                            // return res.send({ error: false, data: { ability: true, match_id: receiveResult.insertId, coin_count: coin_count, account_status: account_status }, message: "New match is created." });
                                                                        }
                                                                    });
                                                                    return res.send({ error: false, data: { ability: true, match_id: sendResult.insertId, coin_count: coin_count, account_status: account_status }, message: "New match is created." });
                                                                });                                                                                     
                                                            });                                        
                                                        });
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            }) 
                        });                        
                   // }
                } else {
                    let current_date = new Date();
                    let cd_timestamp = current_date.getTime();
                    cd_timestamp     = Math.round(cd_timestamp / 1000);

                    let saved_date = transactionResults[0].created_at;
                    let days       = transactionResults[0].days;

                    let sd_timestamp = new Date(saved_date).getTime();
                    sd_timestamp     = Math.round(sd_timestamp / 1000);

                    let days_timestamp = days * 24 * 60 * 60;

                    let _timestamp = cd_timestamp - sd_timestamp;

                    if ((days_timestamp - _timestamp) >=0 ) {
                        // check out existance
                        dbConn.query('SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND publish=1 AND status in (6, 7)', [userId, otherUserId], function (error, oldMatchResult, fields) {
                            if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                    
                            if (oldMatchResult.length)
                                return res.status(400).send({ error: true, message: 'Match data already exist.' });

                            dbConn.query('select * from tbl_user where id = ?', otherUserId, function(error, getCoinPerMessageResults, fields) {
                                if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                if (!getCoinPerMessageResults || !getCoinPerMessageResults.length) return res.send({error: false, message: 'There is no matched user.'})

                                var coin_per_message = 1;
                                if (getCoinPerMessageResults[0]) {
                                    coin_per_message = getCoinPerMessageResults[0].coin_per_message;
                                }

                                // creat a new match for instant chatting                            
                                var heartSendData = {
                                    main_user_id: userId,
                                    other_user_id: otherUserId,
                                    status: 7,
                                    publish: 1,
                                    coin_per_message: coin_per_message,
                                    status_description: 'instant_match_sent_heart_accepted',
                                    created_date: new Date(),
                                    updated_date: new Date()
                                }
            
                                dbConn.beginTransaction(function (err) {
                                    if (err) return res.status(400).send({ error: true, message: err });
                                    dbConn.query('INSERT INTO tbl_match set ? ', [heartSendData], function (error, sendResult) {
                                        if (error) {
                                            dbConn.rollback(function () {
                                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                            });
                                        };
                                        var heartAccpetData = {
                                            main_user_id: otherUserId,
                                            other_user_id: userId,
                                            status: 6,
                                            publish: 1,
                                            mutual_match_id: sendResult.insertId,
                                            status_description: 'instant_match_incoming_heart_accepted',
                                            created_date: new Date(),
                                            updated_date: new Date()
                                        }
                                        dbConn.query('INSERT INTO tbl_match set ? ', [heartAccpetData], function (error, receiveResult) {
                                            if (error) {
                                                dbConn.rollback(function () {
                                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                });
                                            };
                        
                                            dbConn.query("UPDATE tbl_match SET mutual_match_id=? WHERE id=?", [receiveResult.insertId, sendResult.insertId], function (error, results, fields) {
                                                if (error) {
                                                    dbConn.rollback(function () {
                                                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                    });
                                                };
                
                                                // if (!cdnResults.length) return res.send({ error: true, message: "user's private video does not exist." });
                                                dbConn.commit(function (error) {
                                                    if (error) {
                                                        dbConn.rollback(function () {
                                                            return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                        });
                                                    };
                                                    dbConn.query("SELECT * FROM tbl_user WHERE id=?", otherUserId, function(error1, receiverData, receiverFields) {
                                                        if (error1) return res.status(403).send({error: true, detail: error1.code, message: error1.sqlMessage});
                                                        if (!receiverData.length) return res.status(400).send({error: true, message: 'user not found'});
                                                        const receiver = receiverData[0];
                                                        const deviceId = receiver.fcm_id;
                                                        dbConn.query('SELECT * FROM tbl_user WHERE id=?', userId, function(error2, senderData, senderFeidls) {
                                                            if (error2) return res.status(403).send({error: true, detail: error2.code, message: error2.sqlMessage});
                                                            if (!senderData.length) return res.status(403).send({error: true, message: 'Sender User not found'});
                                                            const sender = senderData[0];
                                                            const senderName = sender.name;
                                                            dbConn.query('UPDATE tbl_user SET last_loggedin_date=? WHERE id=?', [new Date(), userId], function(actErr, actRows, actFields) {
                                                                if (actErr) return res.status(400).send({error: true, detail: actErr.code, message: actErr.sqlMessage});
                                                                var message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
                                                                    to: deviceId,
                                                                    notification: {
                                                                        title: 'You have a new match!',
                                                                        body: senderName.toString() + ' is matched with you.',
                                                                    },
                                                                    data: {  //you can send only notification or only data(or include both)
                                                                        type: 'Match'
                                                                    }
                                                                };
                                                                fcm.send(message, function(notiErr, notiRes){
                                                                    if (notiErr) {
                                                                        console.log("Something has gone wrong!");
                                                                    } else {
                                                                        console.log("Successfully sent with response: ");
                                                                        // return res.send({ error: false, data: { ability: true, match_id: receiveResult.insertId, coin_count: coin_count, account_status: account_status }, message: "New match is created." });
                                                                    }
                                                                });
                                                                return res.send({ error: false, data: { ability: true, match_id: sendResult.insertId, coin_count: coin_count, account_status: account_status }, message: "New match is created." });
                                                            });                                                                                     
                                                        });                                        
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    } else {
                        //if (coin_count < 50) {
                        //    res.send({error: false, data: { ability: false, match_id: -1, coin_count: coin_count, account_status: account_status}, message: 'You have no enough diamonds to start instant chatting.'});
                        //} else {
                
                            // reduce the coin_count for instant chatting
                           // coin_count = coin_count - 50;
                
                            // check out existance
                            dbConn.query('SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND publish=1 AND status in (6, 7)', [userId, otherUserId], function (error, oldMatchResult, fields) {
                                if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                        
                                if (oldMatchResult.length)
                                    return res.status(400).send({ error: true, message: 'Match data already exist.' });
                
                                dbConn.query('select * from tbl_user where id = ?', otherUserId, function(error, getCoinPerMessageResults, fields) {
                                    if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                    if (!getCoinPerMessageResults || !getCoinPerMessageResults.length) return res.send({error: false, message: 'There is no matched user.'})
    
                                    var coin_per_message = 1;
                                    if (getCoinPerMessageResults[0]) {
                                        coin_per_message = getCoinPerMessageResults[0].coin_per_message;
                                    }
    
                                    // creat a new match for instant chatting                            
                                    var heartSendData = {
                                        main_user_id: userId,
                                        other_user_id: otherUserId,
                                        status: 7,
                                        publish: 1,
                                        coin_per_message: coin_per_message,
                                        status_description: 'instant_match_sent_heart_accepted',
                                        created_date: new Date(),
                                        updated_date: new Date()
                                    }
                
                                    dbConn.beginTransaction(function (err) {
                                        if (err) return res.status(400).send({ error: true, message: err });
                                        dbConn.query('INSERT INTO tbl_match set ? ', [heartSendData], function (error, sendResult) {
                                            if (error) {
                                                dbConn.rollback(function () {
                                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                });
                                            };
                                            var heartAccpetData = {
                                                main_user_id: otherUserId,
                                                other_user_id: userId,
                                                status: 6,
                                                publish: 1,
                                                mutual_match_id: sendResult.insertId,
                                                status_description: 'instant_match_incoming_heart_accepted',
                                                created_date: new Date(),
                                                updated_date: new Date()
                                            }
                                            dbConn.query('INSERT INTO tbl_match set ? ', [heartAccpetData], function (error, receiveResult) {
                                                if (error) {
                                                    dbConn.rollback(function () {
                                                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                    });
                                                };
                            
                                                dbConn.query("UPDATE tbl_match SET mutual_match_id=? WHERE id=?", [receiveResult.insertId, sendResult.insertId], function (error, results, fields) {
                                                    if (error) {
                                                        dbConn.rollback(function () {
                                                            return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                        });
                                                    };
                    
                                                    dbConn.query('update tbl_user set coin_count = ? where id = ?', [coin_count, userId], function(error, updateCoinResult, fields) {
                                                        if (error) {
                                                            dbConn.rollback(function () {
                                                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                            });
                                                        };
                    
                                                        // if (!cdnResults.length) return res.send({ error: true, message: "user's private video does not exist." });
                                                        dbConn.commit(function (error) {
                                                            if (error) {
                                                                dbConn.rollback(function () {
                                                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                                });
                                                            };
                                                            dbConn.query("SELECT * FROM tbl_user WHERE id=?", otherUserId, function(error1, receiverData, receiverFields) {
                                                                if (error1) return res.status(403).send({error: true, detail: error1.code, message: error1.sqlMessage});
                                                                if (!receiverData.length) return res.status(400).send({error: true, message: 'user not found'});
                                                                const receiver = receiverData[0];
                                                                const deviceId = receiver.fcm_id;
                                                                dbConn.query('SELECT * FROM tbl_user WHERE id=?', userId, function(error2, senderData, senderFeidls) {
                                                                    if (error2) return res.status(403).send({error: true, detail: error2.code, message: error2.sqlMessage});
                                                                    if (!senderData.length) return res.status(403).send({error: true, message: 'Sender User not found'});
                                                                    const sender = senderData[0];
                                                                    const senderName = sender.name;
                                                                    dbConn.query('UPDATE tbl_user SET last_loggedin_date=? WHERE id=?', [new Date(), userId], function(actErr, actRows, actFields) {
                                                                        if (actErr) return res.status(400).send({error: true, detail: actErr.code, message: actErr.sqlMessage});
                                                                        var message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
                                                                            to: deviceId,
                                                                            notification: {
                                                                                title: 'You have a new match!',
                                                                                body: senderName.toString() + ' is matched with you.',
                                                                            },
                                                                            data: {  //you can send only notification or only data(or include both)
                                                                                type: 'Match'
                                                                            }
                                                                        };
                                                                        fcm.send(message, function(notiErr, notiRes){
                                                                            if (notiErr) {
                                                                                console.log("Something has gone wrong!");
                                                                            } else {
                                                                                console.log("Successfully sent with response: ");
                                                                                // return res.send({ error: false, data: { ability: true, match_id: receiveResult.insertId, coin_count: coin_count, account_status: account_status }, message: "New match is created." });
                                                                            }
                                                                        });
                                                                        return res.send({ error: false, data: { ability: true, match_id: sendResult.insertId, coin_count: coin_count, account_status: account_status }, message: "New match is created." });
                                                                    });                                                                                     
                                                                });                                        
                                                            });
                                                        });
                                                    });
                                                });
                                            });
                                        });
                                    });
                                });
                            });
                        }
                    }
                // }
            })
        } else {
            return res.send({ error: false, data: { ability: false, match_id: -1, coin_count: coin_count, account_status: account_status }, message: "Your Account Is Not Active." });
        }
    });
});

//#23 uc 8 Matched Page Display Matched list(matched_id)
matchApi.get('/matches', checkAuth, function (req, res) {
    var userId = req.userData.userId;

    if (!userId) {
        return res.status(400).send({ error: true, message: 'Please login again!' });
    }

    var distanceQuery = '(3959 * acos (cos (radians(d.lat_geo)) * cos(radians( b.lat_geo )) * cos(radians( b.long_geo ) - radians(d.long_geo)) + sin ( radians( d.lat_geo) )  * sin( radians( b.lat_geo ) ))) as distance, ';
    var ageQuery = 'TIMESTAMPDIFF(YEAR, b.birth_date, CURDATE()) AS age ';
    var leftjoinQuery = ' inner join tbl_user b on a.other_user_id=b.id inner join tbl_user d on a.main_user_id=d.id left join tbl_video c on a.other_user_id=c.user_id';
    
    var whereCondition = ' where (c.cdn_id IS NULL or c.is_primary=1) and a.main_user_id=? and a.status in (6,7) and a.publish=1 and b.account_status=1';
    
    var leftQuery = '(SELECT a.id, a.main_user_id, a.other_user_id, b.name, b.gender, b.language_id, b.country_id, b.ethnicity_id, b.description, b.coin_count, b.fan_count, c.cdn_id, c.is_primary, c.content_type, b.ai_friend, b.ai_personality, b.img_message, ' + distanceQuery + ageQuery + ' FROM tbl_match a ' + leftjoinQuery + whereCondition + ' order by a.id desc)'
    // var rightjoinQuery = ' inner join tbl_user b on a.other_user_id=b.id inner join tbl_user d on a.main_user_id=d.id right join tbl_video c on a.other_user_id=c.user_id'
    // var rightQuery = '(SELECT a.id, a.main_user_id, a.other_user_id, b.name, b.gender, b.language_id, b.country_id, b.ethnicity_id, c.cdn_id, c.is_primary, ' + distanceQuery + ageQuery + ' FROM tbl_match a ' + rightjoinQuery + whereCondition + ' order by a.id desc)'
    dbConn.query(leftQuery, [userId], function (error, results, fields) {
        if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
        return res.send({ error: false, data: results, message: 'All match data' });
    });
});

//#23 uc 8 Matched Page Display Matched list(matched_id) - Pagination
// matchApi.post('/matches', checkAuth, function (req, res) {
//     var userId = req.userData.userId;
//     var perPageCount = req.body.count;
//     var offSet = req.body.offset;

//     if (!userId) {
//         return res.status(400).send({ error: true, message: 'Please login again!' });
//     }
    
//     if (!perPageCount || !offSet) 
//         return res.status(403).send({error: true, message: 'invalid params'});

//     perPageCount = parseInt(perPageCount);
//     offSet = parseInt(offSet);

//     console.log('perPageCount is ' + perPageCount);
//     console.log('offSet is ' + offSet);

//     var distanceQuery = '(3959 * acos (cos (radians(d.lat_geo)) * cos(radians( b.lat_geo )) * cos(radians( b.long_geo ) - radians(d.long_geo)) + sin ( radians( d.lat_geo) )  * sin( radians( b.lat_geo ) ))) as distance, ';
//     var ageQuery = 'TIMESTAMPDIFF(YEAR, b.birth_date, CURDATE()) AS age ';
//     var leftjoinQuery = ' inner join tbl_user b on a.other_user_id=b.id inner join tbl_user d on a.main_user_id=d.id left join tbl_video c on a.other_user_id=c.user_id';
    
//     var whereCondition = ' where (c.cdn_id IS NULL or c.is_primary=1) and a.main_user_id=? and a.status in (6,7) and a.publish=1 and b.account_status=1';
    
//     var leftQuery = '(SELECT a.id, a.main_user_id, a.other_user_id, b.name, b.gender, b.language_id, b.country_id, b.ethnicity_id, b.description, c.cdn_id, c.is_primary, ' + distanceQuery + ageQuery + ' FROM tbl_match a ' + leftjoinQuery + whereCondition + ' order by a.id desc LIMIT ? OFFSET ? )'
//     // var rightjoinQuery = ' inner join tbl_user b on a.other_user_id=b.id inner join tbl_user d on a.main_user_id=d.id right join tbl_video c on a.other_user_id=c.user_id'
//     // var rightQuery = '(SELECT a.id, a.main_user_id, a.other_user_id, b.name, b.gender, b.language_id, b.country_id, b.ethnicity_id, c.cdn_id, c.is_primary, ' + distanceQuery + ageQuery + ' FROM tbl_match a ' + rightjoinQuery + whereCondition + ' order by a.id desc)'
//     console.log('leftQueryForMatch ' + leftQuery);
//     dbConn.query(leftQuery, [userId, perPageCount, offSet], function (error, results, fields) {
//         if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
//         return res.send({ error: false, data: results, message: 'All match data' });
//     });
// });

matchApi.post('/getAllDiscovers', checkAuth, function (req, res) {
    var userId = req.userData.userId;
    var perPageCount = req.body.count;
    var offSet = req.body.offset;
    
    if (!perPageCount || !offSet) 
        return res.status(403).send({error: true, message: 'invalid params'});

    perPageCount = parseInt(perPageCount);
    offSet = parseInt(offSet);
    
    dbConn.query('SELECT lat_geo, long_geo FROM tbl_user WHERE id=? AND account_status=1', userId, function(userErr, userData, userFields) {
        if (userErr) return res.status(400).send({error: true, detail: userErr.code, message: userErr.sqlMessage});
        if (!userData.length) return res.status(403).send({error: true, message: 'user not found.'});
        var loggedUser = userData[0];

        var myLat = loggedUser.lat_geo;
        var myLong = loggedUser.long_geo;
        if (myLat != 0 && myLong != 0 && (!myLat || !myLong)) return res.status(403).send({error: true, message: 'user location information is invalid'});

        var selectQuery = 'a.id, a.birth_date, a.name, a.description, a.gender, a.coin_count, a.fan_count, a.coin_per_message, TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) AS age, a.last_loggedin_date, e.cdn_filtered_id, e.cdn_id, e.is_primary, e.is_reply, e.publish, e.content_type, b.ethnicity_name, c.country_name, d.language_name, a.ai_friend, a.ai_personality, a.img_message, ';
        var getOtherMatchInfo = 'select other_user_id from tbl_match where main_user_id=? and status != 0';

        var joinQuery = ' INNER JOIN tbl_ethnicity AS b ON a.ethnicity_id=b.id INNER JOIN tbl_country AS c ON a.country_id=c.id INNER JOIN tbl_language AS d ON a.language_id=d.id';

        if (myLat == 0 && myLong == 0) {
            var distanceQuery = 0;
        } else {
            var distanceQuery = '(3959 * acos (cos(radians(' + myLat + ') ) * cos(radians( a.lat_geo)) * cos(radians(a.long_geo) - radians(' + myLong + ')) + sin (radians(' + myLat + ') ) * sin( radians(a.lat_geo))))';
        }
        var whereCondition = ' (e.cdn_id IS NULL OR e.is_primary=1) AND a.account_status=1 AND a.id NOT IN (' + getOtherMatchInfo + ') AND a.id!=?';

        var pi = Math.PI;
        var defaultDistance = 3959 * Math.acos(Math.cos(myLat * (pi / 180)) * Math.cos(myLong * (pi / 180)));

        console.log('DefaultDistance is ' + defaultDistance);

        if (req.body.distance && myLat !=0 && myLong != 0) {
            distance = parseInt(req.body.distance);
            whereCondition += ' AND ((' + distanceQuery + ') < ' + distance + ')';
        }
        if (req.body.gender) {
            var gender = req.body.gender;
            whereCondition += ' AND a.gender=' + gender;
        }
        if (req.body.ethnicityId) {
            whereCondition += ' AND a.ethnicity_id=' + parseInt(req.body.ethnicityId);
        }
        if (req.body.countryId) {
            whereCondition += ' AND a.country_id=' + parseInt(req.body.countryId);
        }
        if (req.body.languageId) {
            whereCondition += ' AND a.language_id=' + parseInt(req.body.languageId);
        }
        if (req.body.lessAge) {
            whereCondition += ' AND TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) < ' + parseInt(req.body.lessAge);
        }
        if (req.body.greaterAge) {
            whereCondition += ' AND TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) > ' + parseInt(req.body.greaterAge);
        }

        joinQuery += ' LEFT JOIN tbl_video as e ON a.id=e.user_id ';

        var leftQuery = 'SELECT ' + selectQuery + distanceQuery + ' as distance FROM tbl_user as a ' + joinQuery + ' WHERE ' + whereCondition + ' ORDER BY a.last_loggedin_date DESC LIMIT ? OFFSET ? ';
        // var rightJoinQuery = ' INNER JOIN tbl_ethnicity AS b ON a.ethnicity_id=b.id INNER JOIN tbl_country AS c ON a.country_id=c.id INNER JOIN tbl_language AS d ON a.language_id=d.id RIGHT JOIN tbl_video as e ON a.id=e.user_id ';
        // var rightQuery = '(SELECT ' + selectQuery + distanceQuery + ' as distance FROM tbl_user as a ' + rightJoinQuery + ' WHERE ' + whereCondition + ' ORDER BY a.last_loggedin_date DESC)';
        // var totalQuery = leftQuery + ' UNION ' + rightQuery + ' ORDER BY last_loggedin_date DESC LIMIT ? OFFSET ? ';
        // console.log(totalQuery);

        console.log('leftQuery ' + leftQuery);
        dbConn.query(leftQuery, [userId, userId, perPageCount, offSet], function (error, results, fields) {
            if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
            if (!results.length)
                return res.send({ error: false, message: 'Not found.' });
            
            results.map(item => {
                item.last_loggedin_date = commonFunc.timeAgo(item.last_loggedin_date);
                if ((defaultDistance == 0) || (defaultDistance == item.distance)) {
                    item.distance = 0;
                }
            });
            
            return res.send({error: false, data: results, message: 'discover list updated'});
        });
    });
});

matchApi.post('/getOtherUserData/:other_user_id', checkAuth, function (req, res) {
    var userId = req.userData.userId;
    var other_user_id = req.params.other_user_id;
    
    dbConn.query('SELECT lat_geo, long_geo FROM tbl_user WHERE id=? AND account_status=1', userId, function(userErr, userData, userFields) {
        if (userErr) return res.status(400).send({error: true, detail: userErr.code, message: userErr.sqlMessage});
        if (!userData.length) return res.status(403).send({error: true, message: 'user not found.'});
        var loggedUser = userData[0];

        var myLat = loggedUser.lat_geo;
        var myLong = loggedUser.long_geo;
        if (myLong != 0 && myLat != 0 && (!myLat || !myLong)) return res.status(403).send({error: true, message: 'user location information is invalid'});

        var joinQuery = ' INNER JOIN tbl_ethnicity AS b ON a.ethnicity_id=b.id INNER JOIN tbl_country AS c ON a.country_id=c.id INNER JOIN tbl_language AS d ON a.language_id=d.id';

        if (myLat == 0 && myLong ==0) {
            var distanceQuery = 0;
        } else {
            var distanceQuery = '(3959 * acos (cos(radians(' + myLat + ') ) * cos(radians( a.lat_geo)) * cos(radians(a.long_geo) - radians(' + myLong + ')) + sin (radians(' + myLat + ') ) * sin( radians(a.lat_geo))))';
        }

        dbConn.query('select count(*) as primary_count from tbl_video where user_id = ? and is_primary = 1', other_user_id, function(error, primaryResutls, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

            var primary_count = 0;
            if (primaryResutls) {
                primary_count = primaryResutls[0].primary_count;
            }

            if (primary_count > 0) {

                var selectQuery = 'a.id, a.birth_date, a.name, a.description, a.gender, a.coin_count, a.fan_count, a.coin_per_message, TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) AS age, a.last_loggedin_date, e.cdn_filtered_id, e.cdn_id, e.is_primary, e.is_reply, e.publish, e.content_type, b.ethnicity_name, c.country_name, d.language_name, a.ai_friend, a.ai_personality, a.img_message, ';

                var whereCondition = ' e.is_primary=1 AND a.account_status=1 AND a.id=?';

                var pi = Math.PI;
                var defaultDistance = 3959 * Math.acos(Math.cos(myLat * (pi / 180)) * Math.cos(myLong * (pi / 180)));
        
                console.log('DefaultDistance Other user is ' + defaultDistance);
                
                joinQuery += ' LEFT JOIN tbl_video as e ON a.id=e.user_id ';
        
                var leftQuery = 'SELECT ' + selectQuery + distanceQuery + ' as distance FROM tbl_user as a ' + joinQuery + ' WHERE ' + whereCondition;
        
                console.log('getOtherUserData_leftQuery ' + leftQuery);
                
                dbConn.query(leftQuery, [other_user_id], function (error, results, fields) {
                    if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                    if (!results.length)
                        return res.send({ error: false, message: 'Not found.' });
                    
                    results.map(item => {
                        item.last_loggedin_date = commonFunc.timeAgo(item.last_loggedin_date);
                        if ((defaultDistance == 0) || (defaultDistance == item.distance)) {
                            item.distance = 0;
                        }
                    });
        
                    console.log('Result[0].distance is ' + results[0].distance);
                    return res.send({error: false, data: results[0], message: 'discover list updated'});
                });                
            } else {

                var selectQuery = 'a.id, a.birth_date, a.name, a.description, a.gender, a.coin_count, a.fan_count, a.coin_per_message, TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) AS age, a.last_loggedin_date, Null as cdn_filtered_id, Null as cdn_id, e.is_primary, e.is_reply, e.publish, e.content_type, b.ethnicity_name, c.country_name, d.language_name, a.ai_friend, a.ai_personality, a.img_message, ';

                var whereCondition = ' a.account_status=1 AND a.id=?';
        
                var pi = Math.PI;
                var defaultDistance = 3959 * Math.acos(Math.cos(myLat * (pi / 180)) * Math.cos(myLong * (pi / 180)));
        
                console.log('DefaultDistance Other user is ' + defaultDistance);
                
                joinQuery += ' LEFT JOIN tbl_video as e ON a.id=e.user_id ';
        
                var leftQuery = 'SELECT ' + selectQuery + distanceQuery + ' as distance FROM tbl_user as a ' + joinQuery + ' WHERE ' + whereCondition;
        
                console.log('getOtherUserData_leftQuery ' + leftQuery);
                
                dbConn.query(leftQuery, [other_user_id], function (error, results, fields) {
                    if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                    if (!results.length)
                        return res.send({ error: false, message: 'Not found.' });
                    
                    results.map(item => {
                        item.last_loggedin_date = commonFunc.timeAgo(item.last_loggedin_date);
                        if ((defaultDistance == 0) || (defaultDistance == item.distance)) {
                            item.distance = 0;
                        }
                    });
        
                    console.log('Result[0].distance is ' + results[0].distance);
                    return res.send({error: false, data: results[0], message: 'discover list updated'});
                });
            }
        })
    });
});

// UC4.1 - Browse : display one user
matchApi.post('/discover', checkAuth, function (req, res) {
    var userId = req.userData.userId;

    dbConn.query("SELECT lat_geo, long_geo FROM tbl_user WHERE id=? AND account_status=1", [userId], function (error, loggedUserResults, loggedUserFields) {
        if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
        if (!loggedUserResults.length) return res.status(403).send({ error: true, message: 'User does not exist' });
        var myData = loggedUserResults[0];

        var myLat = myData.lat_geo;
        if (myLat == null) return res.send({ error: false, message: 'User location information is invalid.' });
        var myLong = myData.long_geo;
        if (myLong == null) return res.send({ error: false, message: 'User location information is invalid.' });

        //age, gender, ethnicity, country, distance, language
        var distance = 0;
        var selectQuery = 'a.id, a.birth_date, a.name, a.gender, a.coin_count, a.fan_count, a.coin_per_message, TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) AS age, a.last_loggedin_date, a.description, e.cdn_filtered_id, e.cdn_id, e.content_type, b.ethnicity_name, c.country_name, d.language_name, a.ai_friend, a.ai_personality, a.img_message ';

        var getOtherMatchInfo = 'select other_user_id from tbl_match where main_user_id=? and status != 0';

        var joinQuery = ' INNER JOIN tbl_ethnicity AS b ON a.ethnicity_id=b.id INNER JOIN tbl_country AS c ON a.country_id=c.id INNER JOIN tbl_language AS d ON a.language_id=d.id';

        if (myLat == 0 && myLong == 0) {
            var distanceQuery = 0;
        } else {
            var distanceQuery = '(3959 * acos (cos(radians(' + myLat + ') ) * cos(radians( a.lat_geo)) * cos(radians(a.long_geo) - radians(' + myLong + ')) + sin (radians(' + myLat + ') ) * sin( radians(a.lat_geo))))';
        }
        var whereCondition = ' (e.cdn_id IS NULL OR e.is_primary=1) AND a.account_status=1 AND a.id NOT IN (' + getOtherMatchInfo + ') AND a.id!=?';
        
        var pi = Math.PI;
        var defaultDistance = 3959 * Math.acos(Math.cos(myLat * (pi / 180)) * Math.cos(myLong * (pi / 180)));

        if (req.body.distance) {
            distance = req.body.distance;
            whereCondition += ' AND (' + distanceQuery + ') <' + distance;
        }
        if (req.body.gender) {
            var gender = req.body.gender;
            whereCondition += ' AND a.gender=' + gender;
        }
        if (req.body.ethnicityId) {
            whereCondition += ' AND a.ethnicity_id=' + req.body.ethnicityId;
        }
        if (req.body.countryId) {
            whereCondition += ' AND a.country_id=' + req.body.countryId;
        }
        if (req.body.languageId) {
            whereCondition += ' AND a.language_id=' + req.body.languageId;
        }
        if (req.body.lessAge) {
            whereCondition += ' AND TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) < ' + req.body.lessAge;
        }
        if (req.body.greaterAge) {
            whereCondition += ' AND TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) > ' + req.body.greaterAge;
        }

        joinQuery += ' LEFT JOIN tbl_video as e ON a.id=e.user_id ';

        var leftQuery = '(SELECT ' + selectQuery + distanceQuery + ' as distance FROM tbl_user as a ' + joinQuery + ' WHERE ' + whereCondition + ' ORDER BY a.last_loggedin_date desc limit 1)';
        // var rightJoinQuery = ' INNER JOIN tbl_ethnicity AS b ON a.ethnicity_id=b.id INNER JOIN tbl_country AS c ON a.country_id=c.id INNER JOIN tbl_language AS d ON a.language_id=d.id RIGHT JOIN tbl_video as e ON a.id=e.user_id ';
        // var rightQuery = '(SELECT ' + selectQuery + distanceQuery + ' as distance FROM tbl_user as a ' + rightJoinQuery + ' WHERE ' + whereCondition + ' ORDER BY a.last_loggedin_date desc limit 1)';
        // var totalQuery = leftQuery + ' UNION ' + rightQuery + 'ORDER BY last_loggedin_date DESC LIMIT 1';
        
        dbConn.query(leftQuery, [userId, userId], function (error, results, fields) {
            if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
            if (!results.length)
                return res.send({ error: false, message: 'Not found.' });
            var otherUser = results[0];
            var otherUserId = otherUser.id;
            dbConn.query('SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND status=0', [userId, otherUserId], function (error, results, fields) {
                if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });

                var newMatchData = {
                    main_user_id: userId,
                    other_user_id: otherUser.id,
                    status: 0,
                    status_description: 'viewed',
                    publish: 1,
                    created_date: new Date(),
                    updated_date: new Date()
                };
                if (otherUser.last_loggedin_date) {
                    otherUser.last_loggedin_date = commonFunc.timeAgo(otherUser.last_loggedin_date);
                }
                if ((defaultDistance == 0) || (defaultDistance == otherUser.distance)) {
                    otherUser.distance = 0;
                }
                if (results.length) return res.status(403).send({ error: false, data: otherUser, message: 'A New Lovely User found.' });
                dbConn.query('INSERT INTO tbl_match SET ? ', [newMatchData], function (error, newMatch, fields) {
                    if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                    otherUser.match_id = newMatch.insertId;
                    return res.send({ error: false, data: otherUser, message: "A New Lovely User found." });                   
                });
            });
        });
    });
});

var updateLastLoggedInDate = (req, res, next) => {
    try {
        var userId = req.userData.userId;

        dbConn.query('UPDATE tbl_user SET last_loggedin_date=? WHERE id=?', [new Date(), userId], function(actErr, actRows, actFields) {
            if (actErr) return res.status(400).send({error: true, detail: actErr.code, message: actErr.sqlMessage});
            
            console.log('Last logged-in date was updated successfully.');
            next();
        });
    } catch (error) {
        return res.status(401).json({
            message: error
        });
    }
}

matchApi.post('/updateLastLoggedInDate', checkAuth, updateLastLoggedInDate, function (req, res) {
    console.log('Last logged-in date was updated successfully.');
    return res.send({ error: false, message: 'Last logged-in date was updated successfully.' });
});

matchApi.post('/getStatusByMatchId', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    var matchId = req.body.matchId;

    dbConn.query('select * from tbl_match where id = ? and main_user_id = ?', [matchId, userId], function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if (!results || !results.length) return res.status(403).send({error: true, message: 'Match data not found.'});

        var status = results[0].status;

        if (status == 6) {
            var mutual_match_id = results[0].mutual_match_id;
            var other_user_id = results[0].other_user_id;

            dbConn.query('select * from tbl_match where id = ? and main_user_id = ?', [mutual_match_id, other_user_id], function(error, mutualResults, fields) {
                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                if (!mutualResults || !mutualResults.length) return res.status(403).send({error: true, message: 'Mutual Match data not found.'});

                var coin_per_message = mutualResults[0].coin_per_message;
                var sendData = {
                    status: status,
                    coin_per_message: coin_per_message,
                }
                return res.send({ error: false, data: sendData, message: "A New Lovely User found." });
            })
        } else if (status == 7) {
            var coin_per_message = results[0].coin_per_message;
            var sendData = {
                status: status,
                coin_per_message: coin_per_message,
            }
            return res.send({ error: false, data: sendData, message: "A New Lovely User found." });
        }
    })
})

module.exports.matchApi = matchApi;
module.exports.blockFunction = blockFunction;
module.exports.autoBlockFunction = autoBlockFunction;
module.exports.updateLastLoggedInDate = updateLastLoggedInDate;

