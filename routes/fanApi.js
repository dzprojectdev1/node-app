var express = require('express');
var fanApi = express.Router();
var dbConnect = require('../config/dbConfig');
const checkAuth = require('../middleware/check_auth');
var FCM = require('fcm-node');
const serverKey = process.env.FIREBASE_SERVER_KEY;
const fcm = new FCM(serverKey);

var counter = 0;
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

var findFanSubarray = (arr, subarr) => {
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

var autoBlockFanFunction = (req, res, next) => {
    try {
        var userId = req.userData.userId;
        var userName = req.body.userName;
        var otherId = req.body.otherId;
        var otherUserName = req.body.otherUserName;
        var amount = req.body.amount;
        var fanMessage = req.body.fanMessage;

        query = "select * from tbl_user where id = ?";
        dbConnect.query(query, otherId, function(error, otherResultRows, fields) {
            if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
            if (!otherResultRows || !otherResultRows.length) return res.status(400).send({ error: true, message: 'No Match Found' });

            var auto_block = otherResultRows[0].auto_block;

            if (auto_block == 1) {

                var messaegTextArr = fanMessage.toUpperCase().split(" ");
                
                var booleanValue = illegalWords.every(function(words, index) {
                    var wordsArr = words.toUpperCase().split(" ");

                    return findFanSubarray(messaegTextArr, wordsArr) === -1;
                })

                if (booleanValue) {
                    req.userData.userId = userId;
                    req.body.userName = userName;
                    req.body.otherId = otherId;
                    req.body.otherUserName = otherUserName;
                    req.body.amount = amount;
                    req.body.fanMessage = fanMessage;
                    next();
                } else {

                    query = "select count(id) as count from tbl_match where main_user_id = ? and status_description = 'block_received_auto'";
                    dbConnect.query(query, userId, function(error, results, fields) {
                        if (error) return error;
                        if (!results || !results.length) return error;

                        var auto_blocked_count = results[0].count;
                        if (auto_blocked_count >= 15) {

                            console.log('AutoBlockFunctio runs: this user has over 15 auto bocked times');
                            query = "update tbl_user set account_status = 9 where id = ?";
                            dbConnect.query(query, userId, function(error, uptResults, fields) {
                                if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });

                                return res.send({ error: false, data: { account_status: 9, sending_available: false }, message: "Your Account Is Not Active." });
                            })
                        } else {
                            dbConnect.query("SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND status=9", [userId, otherId], function (error, results, fields) {
                                if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                if (results.length) {
                                    return res.send({ error: true, message: 'Block Data Already exist' });
                                } else {
                                    //get status 2,6,7 match data,
                                    dbConnect.query("SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND publish=1 AND status in (2,6,7)", [otherId, userId], function (error, results, fields) {
                                        if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                    
                                        if (results.length) {
                                            var resultIdArr = results.map(one => {
                                                return one.id;
                                            });
                                            dbConnect.query("UPDATE tbl_match SET publish=0 WHERE id IN (?)", resultIdArr.join(), function (error, updateResults, updateFields) {
                                                if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                            });
                                        }
                    
                                        dbConnect.query("SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND publish=1 AND status in (2,6,7)", [userId, otherId], function (error, otherResults, fields) {
                                            if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                        
                                            if (otherResults.length) {
                                                var otherResultIdArr = otherResults.map(one => {
                                                    return one.id;
                                                });
                                                dbConnect.query("UPDATE tbl_match SET publish=2 WHERE id IN (?)", otherResultIdArr.join(), function (error, updateResults, updateFields) {
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
                    
                                            dbConnect.beginTransaction(function (err) {
                                                if (err) return res.status(400).send({ error: true, message: err });
                                                dbConnect.query("INSERT INTO tbl_match SET ? ", blockCreateData, function (error, results, fields) {
                                                    if (error) {
                                                        dbConnect.rollback(function () {
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
                    
                                                    dbConnect.query('INSERT INTO tbl_match SET ? ', blockRecieveData, function (error1, receiveResult, fields) {
                                                        if (error1) {
                                                            dbConnect.rollback(function () {
                                                                return res.status(400).send({ error: true, detail: error1.code, message: error1.sqlMessage });
                                                            });
                                                        }
                    
                                                        dbConnect.commit(function (error) {
                                                            if (error) {
                                                                dbConnect.rollback(function () {
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
                req.body.userName = userName;
                req.body.otherId = otherId;
                req.body.otherUserName = otherUserName;
                req.body.amount = amount;
                req.body.fanMessage = fanMessage;
                next();
            }
        });
    } catch (error) {
        return res.status(401).json({
            message: error
        });
    }
}

/**
 * Sending diamonds
 */
fanApi.post('/sendDiamonds', checkAuth, autoBlockFanFunction, function(req, res) {
    var userId = req.userData.userId;
    var userName = req.body.userName;
    var otherId = req.body.otherId;
    var otherUserName = req.body.otherUserName;
    var amount = req.body.amount;
    var fanMessage = req.body.fanMessage;

    // Get current diamonds count, fcm id of user and other user
    var query = 'select * from tbl_user where id = ?';
    dbConnect.query(query, [userId], function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if(!results || !results.length) return res.send({error: false, message: 'There is no matched user.'});

        var user_coin_count = results[0].coin_count;
        var user_fcm_id = results[0].fcm_id;
        var user_fan_count = results[0].fan_count;

        if (user_coin_count < amount) {
            return res.send({error: false, data: { account_status: 1, sending_available: true, coin_count: user_coin_count }, message: 'There is no enough diamond.'});
        }

        var user_new_coin_count = parseInt(user_coin_count) - parseInt(amount); // updated diamonds count of user

        dbConnect.query(query, [otherId], function(error, otherResults, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
            if(!results || !results.length) return res.send({error: false, message: 'There is no matched user.'});

            var other_coin_count = otherResults[0].coin_count;
            var other_fcm_id = otherResults[0].fcm_id;
            var other_fan_count = otherResults[0].fan_count;

            var other_new_coin_count = parseInt(other_coin_count) + parseInt(amount); // updated diamonds count of other user

            // Get old fan user id
            var old_fan_user_id = 0;
            var new_fan_user_id = 0;
            query = 'select * from tbl_send where (from_user = ? and to_user = ?) or (from_user = ? and to_user = ?) order by date desc';
            dbConnect.query(query, [userId, otherId, otherId, userId], function(error, fanResults, fields) {
                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                if(fanResults && fanResults.length > 0) {
                    old_fan_user_id = fanResults[0].fan_user_id;
                    new_fan_user_id = old_fan_user_id;
                }

                // Insert new record to tbl_send
                var sendDiamondsData = {
                    from_user: userId,
                    from_user_name: userName,
                    from_user_orig_count: user_coin_count,
                    from_user_new_count: user_new_coin_count,
                    to_user: otherId,
                    to_user_name: otherUserName,
                    to_user_orig_count: other_coin_count,
                    to_user_new_count: other_new_coin_count,
                    amount: amount,
                    fan_message: fanMessage,
                    fan_user_id: 0,
                    date: new Date()
                };

                dbConnect.beginTransaction(function (error) {
                    if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });

                    dbConnect.query('INSERT INTO tbl_send set ? ', [sendDiamondsData], function (error, insertResult) {
                        if (error) {
                            dbConnect.rollback(function () {
                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                            });
                        }

                        var insertId = insertResult.insertId;

                        // Update fan_user_id after inserting.
                        var userIdDiamonds = 0;
                        var otherIdDiamonds = 0;

                        var query = 'select sum(amount) as amount from tbl_send where from_user = ? and to_user = ?';
                        dbConnect.query(query, [userId, otherId], function(error, sumUserResults, fields) {
                            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                            if(sumUserResults && (sumUserResults.length > 0) && (sumUserResults[0].amount != null)) {
                                userIdDiamonds = sumUserResults[0].amount; // sum of sent diamonds from user to other user
                            }
                            
                            dbConnect.query(query, [otherId, userId], function(error, sumOtherResults, fields) {
                                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                                if(sumOtherResults && (sumOtherResults.length > 0) && (sumOtherResults[0].amount != null)) {
                                    otherIdDiamonds = sumOtherResults[0].amount; // sum of sent diamonds from other user to user
                                }

                                var differencDiamonds = userIdDiamonds - otherIdDiamonds;

                                var sentPushTitle = 'You sent diamonds to '+otherUserName+'!';
                                var sentPushBody = 'You sent '+amount+' diamonds to '+otherUserName;
                                var receivePushTitle = userName+' sent you new diamonds!!';
                                var receivePushBody = userName+' sent you '+amount+' diamonds';

                                // Update fan_user_id, fan_count
                                if (differencDiamonds > 0) {
                                    new_fan_user_id = userId;

                                    if (old_fan_user_id == 0) {
                                        other_fan_count = other_fan_count + 1;

                                        sentPushTitle = 'You are now a fan of '+otherUserName+'!';
                                        receivePushTitle = userName+' became your fan!';
                                    } else if (old_fan_user_id == otherId) {
                                        user_fan_count = user_fan_count - 1;
                                        other_fan_count = other_fan_count + 1;

                                        sentPushTitle = 'You are now a fan of '+otherUserName+'!';
                                        receivePushTitle = userName+' became your fan!';
                                    }
                                } else if (differencDiamonds == 0) {
                                    new_fan_user_id = 0;

                                    if (old_fan_user_id == 0) {
                                        other_fan_count = other_fan_count + 1;
                                    } else if (old_fan_user_id == otherId) {
                                        user_fan_count = user_fan_count - 1;
                                    }
                                }

                                // Update fan_user_id at tbl_send, users's coin_count and fan_count at tbl_user
                                query = 'update tbl_send set fan_user_id = ? where id = ?';
                                dbConnect.query(query, [new_fan_user_id, insertId], function(error, updateResult, fields) {
                                    if (error) {
                                        dbConnect.rollback(function () {
                                            return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                        });
                                    }

                                    dbConnect.query('update tbl_user set coin_count = ?, fan_count = ? where id = ? ', [user_new_coin_count, user_fan_count, userId], function (error, sendResult) {
                                        if (error) {
                                            dbConnect.rollback(function () {
                                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                            });
                                        }
            
                                        dbConnect.query('update tbl_user set coin_count = ?, fan_count = ? where id = ? ', [other_new_coin_count, other_fan_count, otherId], function (error, receiveResult) {
                                            if (error) {
                                                dbConnect.rollback(function () {
                                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                });
                                            }
            
                                            dbConnect.commit(function (error) {
                                                if (error) {
                                                    dbConnect.rollback(function () {
                                                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                    });
                                                }
            
                                                diamondImageUrl = 'https://storage.googleapis.com/' + process.env.BUCKET_NAME + '/red_diamond_1.png';
            
                                                var message1 = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
                                                    to: user_fcm_id,
                                                    notification: {
                                                        title: sentPushTitle,
                                                        body: sentPushBody,
                                                    },
                                                    data: {  //you can send only notification or only data(or include both)
                                                        type: 'SendDiamonds',
                                                        senderImg: diamondImageUrl,
                                                    }
                                                };
                                                fcm.send(message1, function (notiErr, notiRes) {
                                                    if (notiErr) {
                                                        console.log("Notification Sending is failed: ", notiErr);
                                                    } else {
                                                        console.log("Successfully sent with response: ", notiRes);
                                                    }
                                                });
            
                                                var message2 = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
                                                    to: other_fcm_id,
                                                    notification: {
                                                        title: receivePushTitle,
                                                        body: receivePushBody,
                                                    },
                                                    data: {  //you can send only notification or only data(or include both)
                                                        type: 'SendDiamonds',
                                                        senderImg: diamondImageUrl,
                                                    }
                                                };
                                                fcm.send(message2, function (notiErr, notiRes) {
                                                    if (notiErr) {
                                                        console.log("Notification Sending is failed: ", notiErr);
                                                    } else {
                                                        console.log("Successfully sent with response: ", notiRes);
                                                    }
                                                });
                                                return res.send({ error: false, data: { account_status: 1, sending_available: true, coin_count: user_new_coin_count, other_fan_count: other_fan_count}, message: "Diamonds sent." });
                                            });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            })
        })
    })
})

/**
 * Check the other user if he is my fan or not.
 */
fanApi.post('/checkFanOtherUser', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    var otherId = req.body.otherId;

    var userIdDiamonds = 0;
    var otherIdDiamonds = 0;

    var isFan = false;

    var query = 'select sum(amount) as amount from tbl_send where from_user = ? and to_user = ?';
    dbConnect.query(query, [userId, otherId], function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if(!results || !results.length) return res.send({error: false, is_fan: isFan, message: "You are not fan of this user." });

        if (results[0].amount != null) {
            userIdDiamonds = results[0].amount;
        }
        
        dbConnect.query(query, [otherId, userId], function(error, otherResults, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
            if(otherResults && otherResults.length > 0 && otherResults[0].amount != null) {
                otherIdDiamonds = otherResults[0].amount;
            }

            var differencDiamonds = userIdDiamonds - otherIdDiamonds;

            if (differencDiamonds > 0) {
                isFan = true;
            }

            return res.send({ error: false, is_fan: isFan, message: "Got diamonds count." });
        });
    });
})

var getFunUsers1 = (req, res, next) => {
    try {
        var userId = req.userData.userId;
        var otherId = req.body.otherId;

        counter = 0;

        var fanUsers = [];
        var mutualUsers = [];
        var starUsers = [];

        req.userData.userId = userId;
        req.body.otherId = otherId;
        req.body.fanUsers = [];
        req.body.mutualUsers = [];
        req.body.starUsers = [];

        if (!otherId) {
            return res.status(400).send({ error: true, message: 'Please provide other user id' });
        }

        var query = 'select distinct from_user from tbl_send where to_user = ?';

        console.log('distinct_query ' + query);

        dbConnect.query(query, [otherId], function(error, results, fields) {
            if (error) {
                console.log(error);
            } else {
                if(!results || !results.length) {
                    console.log('results_error' + results);
                    counter = 0;
                    next();
                }
    
                var result_count = results.length;
    
                console.log('Candidate users ' + JSON.stringify(results));
    
                for ( var i = 0; i < results.length ; i ++ ) {
                    var tVal = results[i].from_user;
    
                    (function(val){
                        dbConnect.query('select count(*) as primary_count from tbl_video where user_id = ? and is_primary = 1', val, function(error, primaryResutls, fields) {
                            if (error) {
                                console.log(error);
                            } else {
                                var primary_count = 0;
                                if (primaryResutls && primaryResutls.length > 0) {
                                    primary_count = primaryResutls[0].primary_count;
                                }

                                if (primary_count > 0) {
                                    dbConnect.query('select cdn_id from tbl_video where user_id = ? and is_primary = 1', val, function(error, cdnResults, fields) {
                                        if (error) {
                                            console.log(error);
                                        } else {

                                            var imgUrl = '';
                                            if (cdnResults && cdnResults.length > 0) {
                                                imgUrl = cdnResults[0].cdn_id;
                                            }

                                            dbConnect.query('select name from tbl_user where id = ?', val, function(error, nameResults, fields) {
                                                if (error) {
                                                    console.log(error);
                                                } else {

                                                    var name = '';
                                                    if (nameResults && nameResults.length > 0) {
                                                        name = nameResults[0].name;

                                                        dbConnect.query( "select sum(amount) as amount from tbl_send where from_user = ? and to_user = ?", [val, otherId], function(error, reRows, fields) {
                                                            if ( error ) {
                                                                console.log( error );
                                                            } else {
                            
                                                                var receivedDiamonds = 0;
                                                                if (reRows && reRows.length > 0) {
                                                                    receivedDiamonds = reRows[0].amount;
                            
                                                                    if (receivedDiamonds == null) {
                                                                        receivedDiamonds = 0;
                                                                    }
                                                                }
                            
                                                                console.log('receivedDiamonds ' + receivedDiamonds);
                                        
                                                                dbConnect.query("select sum(amount) as amount from tbl_send where from_user = ? and to_user = ?", [otherId, val], function(error, seRows, fields) {
                                                                    if (error) {
                                                                        console.log(error);
                                                                    } else {
                            
                                                                        var sentDiamonds = 0;
                                                                        if (seRows && seRows.length > 0) {
                                                                            sentDiamonds = seRows[0].amount;
                            
                                                                            if (sentDiamonds == null) {
                                                                                sentDiamonds = 0;
                                                                            }
                                                                        }
                            
                                                                        console.log('sentDiamonds ' + sentDiamonds);
                                                                        var differenceDiamonds = 0;
                                                                    
                                                                        differenceDiamonds = receivedDiamonds - sentDiamonds;
                        
                                                                        dbConnect.query('select * from tbl_send where from_user = ? and to_user = ? order by date desc', [val, otherId], function(error, getMessageResults, fields) {
                                                                            if (error) {
                                                                                console.log(error);
                                                                            } else {
                        
                                                                                var recentMessage = '';
                                                                                if (getMessageResults && getMessageResults.length > 0) {
                                                                                    recentMessage = getMessageResults[0].fan_message;
                                    
                                                                                    if (recentMessage == null) {
                                                                                        recentMessage = '';
                                                                                    }
                                                                                }
                        
                                                                                console.log('recentMessage ' + recentMessage);
                                            
                                                                                let rowData = {
                                                                                    userId: val,
                                                                                    name: name,
                                                                                    diamonds: differenceDiamonds,
                                                                                    imgUrl: imgUrl,
                                                                                    fanMessage: recentMessage,
                                                                                }
                                    
                                                                                console.log('rowData ' + JSON.stringify(rowData));
                        
                                                                                dbConnect.query('SELECT * FROM tbl_match WHERE main_user_id = ? and other_user_id = ? and status in (8, 9)', [val, otherId], function(error, checkBlockedResults, fields) {
                                                                                    if (error) {
                                                                                        console.log(error);
                                                                                    } else {
                                                                                        if (!checkBlockedResults.length) {
                        
                                                                                            console.log('checkBlockedResults 1-1 ' + checkBlockedResults);
                                                    
                                                                                            if (differenceDiamonds > 0) {
                                                                                                fanUsers.push(rowData);
                                                                                            } else {
                                                                                                starUsers.push(rowData);
                                                                                                mutualUsers.push(rowData);
                                                                                            }
                                                                                        }
                        
                                                                                        console.log('checkBlockedResults 1-2-1 ' + checkBlockedResults);
                                                
                                                                                        counter ++;
                                            
                                    
                                                                                        console.log('result_count ' + result_count);
                                                                                        console.log('counter_fan_user ' + counter);
                                            
                                                                                        if ( result_count == counter) {
                                                                                            req.userData.userId = userId;
                                                                                            req.body.otherId = otherId;
                                                                                            req.body.fanUsers = fanUsers;
                                                                                            req.body.starUsers = starUsers;
                                                                                            req.body.mutualUsers = mutualUsers;
                                                                                            counter = 0;
                                                                                            next();
                                                                                        }
                                                                                    }
                                                                                });
                                                                            }
                                                                        });
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    } else {
                                                        result_count --;
                                                    }
                                                }
                                            });
                                        }
                                    });
                                } else {
                                    var imgUrl = '';
                                    dbConnect.query('select name from tbl_user where id = ?', val, function(error, nameResults, fields) {
                                        if (error) {
                                            console.log(error);
                                        } else {

                                            var name = '';
                                            if (nameResults && nameResults.length > 0) {
                                                name = nameResults[0].name;

                                                dbConnect.query( "select sum(amount) as amount from tbl_send where from_user = ? and to_user = ?", [val, otherId], function(error, reRows, fields) {
                                                    if ( error ) {
                                                        console.log( error );
                                                    } else {
                    
                                                        var receivedDiamonds = 0;
                                                        if (reRows && reRows.length > 0) {
                                                            receivedDiamonds = reRows[0].amount;
                    
                                                            if (receivedDiamonds == null) {
                                                                receivedDiamonds = 0;
                                                            }
                                                        }
                    
                                                        console.log('receivedDiamonds ' + receivedDiamonds);
                                
                                                        dbConnect.query("select sum(amount) as amount from tbl_send where from_user = ? and to_user = ?", [otherId, val], function(error, seRows, fields) {
                                                            if (error) {
                                                                console.log(error);
                                                            } else {
                    
                                                                var sentDiamonds = 0;
                                                                if (seRows && seRows.length > 0) {
                                                                    sentDiamonds = seRows[0].amount;
                    
                                                                    if (sentDiamonds == null) {
                                                                        sentDiamonds = 0;
                                                                    }
                                                                }
                    
                                                                console.log('sentDiamonds ' + sentDiamonds);
                                                                var differenceDiamonds = 0;
                                                            
                                                                differenceDiamonds = receivedDiamonds - sentDiamonds;
                
                                                                dbConnect.query('select * from tbl_send where from_user = ? and to_user = ? order by date desc', [val, otherId], function(error, getMessageResults, fields) {
                                                                    if (error) {
                                                                        console.log(error);
                                                                    } else {
                
                                                                        var recentMessage = '';
                                                                        if (getMessageResults && getMessageResults.length > 0) {
                                                                            recentMessage = getMessageResults[0].fan_message;
                            
                                                                            if (recentMessage == null) {
                                                                                recentMessage = '';
                                                                            }
                                                                        }
                
                                                                        console.log('recentMessage ' + recentMessage);
                                    
                                                                        let rowData = {
                                                                            userId: val,
                                                                            name: name,
                                                                            diamonds: differenceDiamonds,
                                                                            imgUrl: imgUrl,
                                                                            fanMessage: recentMessage,
                                                                        }
                            
                                                                        console.log('rowData ' + JSON.stringify(rowData));
                
                                                                        dbConnect.query('SELECT * FROM tbl_match WHERE main_user_id = ? and other_user_id = ? and status in (8, 9)', [val, otherId], function(error, checkBlockedResults, fields) {
                                                                            if (error) {
                                                                                console.log(error);
                                                                            } else {
                                                                                if (!checkBlockedResults.length) {
                
                                                                                    console.log('checkBlockedResults 1-1 ' + checkBlockedResults);
                                            
                                                                                    if (differenceDiamonds > 0) {
                                                                                        fanUsers.push(rowData);
                                                                                    } else {
                                                                                        starUsers.push(rowData);
                                                                                        mutualUsers.push(rowData);
                                                                                    }
                                                                                }
                
                                                                                console.log('checkBlockedResults 1-2-2 ' + checkBlockedResults);
                                        
                                                                                counter ++;
                                    
                                    
                                                                                console.log('result_count ' + result_count);
                                                                                console.log('counter_fan_user' + counter);
                                    
                                                                                if ( result_count == counter) {
                                                                                    req.userData.userId = userId;
                                                                                    req.body.otherId = otherId;
                                                                                    req.body.fanUsers = fanUsers;
                                                                                    req.body.starUsers = starUsers;
                                                                                    req.body.mutualUsers = mutualUsers;
                                                                                    counter = 0;
                                                                                    next();
                                                                                }
                                                                            }
                                                                        });
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    }
                                                });
                                            } else {
                                                result_count --;
                                            }
                                        }
                                    });
                                }
                            }
                        });
                    })(tVal);
                }
            }
        });
    } catch (error) {
        console.log(JSON.stringify(error));
        // return res.status(401).json({
        //     message: error
        // });
        // next();
    }
}

var getFunUsers2 = (req, res, next) => {
    try {
        var userId = req.userData.userId;
        var otherId = req.body.otherId;

        counter = 0;

        var fanUsers = req.body.fanUsers;
        var mutualUsers = req.body.mutualUsers;
        var starUsers = req.body.starUsers;

        req.userData.userId = userId;
        req.body.otherId = otherId;
        req.body.fanUsers = fanUsers;
        req.body.mutualUsers = mutualUsers;
        req.body.starUsers = starUsers;

        if (!otherId) {
            return res.status(400).send({ error: true, message: 'Please provide other user id' });
        }

        var query = 'select distinct to_user from tbl_send where from_user = ?';

        console.log('distinct_query ' + query);

        dbConnect.query(query, [otherId], function(error, results, fields) {
            if (error) {
                console.log(error);
            } else {
                if(!results || !results.length) {
                    console.log('results_error' + results);
                    counter = 0;
                    next();
                }
    
                var result_count = results.length;
    
                console.log('Candidate users ' + JSON.stringify(results));
    
                for ( var i = 0; i < results.length ; i ++ ) {
                    var tVal = results[i].to_user;
    
                    (function(val){

                        dbConnect.query('select count(*) as primary_count from tbl_video where user_id = ? and is_primary = 1', val, function(error, primaryResutls, fields) {
                            if (error) {
                                console.log(error);
                            } else {
                                var primary_count = 0;
                                if (primaryResutls && primaryResutls.length > 0) {
                                    primary_count = primaryResutls[0].primary_count;
                                }

                                if (primary_count > 0) {
                                    dbConnect.query('select cdn_id from tbl_video where user_id = ? and is_primary = 1', val, function(error, cdnResults, fields) {
                                        if (error) {
                                            console.log(error);
                                        } else {

                                            var imgUrl = '';
                                            if (cdnResults && cdnResults.length > 0) {
                                                imgUrl = cdnResults[0].cdn_id;
                                            }

                                            dbConnect.query('select name from tbl_user where id = ?', val, function(error, nameResults, fields) {
                                                if (error) {
                                                    console.log(error);
                                                } else {

                                                    var name = '';
                                                    if (nameResults && nameResults.length > 0) {
                                                        name = nameResults[0].name;

                                                        dbConnect.query( "select sum(amount) as amount from tbl_send where from_user = ? and to_user = ?", [val, otherId], function(error, reRows, fields) {
                                                            if ( error ) {
                                                                console.log( error );
                                                            } else {
                            
                                                                var receivedDiamonds = 0;
                                                                if (reRows && reRows.length > 0) {
                                                                    receivedDiamonds = reRows[0].amount;
                            
                                                                    if (receivedDiamonds == null) {
                                                                        receivedDiamonds = 0;
                                                                    }
                                                                }
                            
                                                                console.log('receivedDiamonds ' + receivedDiamonds);
                                        
                                                                dbConnect.query("select sum(amount) as amount from tbl_send where from_user = ? and to_user = ?", [otherId, val], function(error, seRows, fields) {
                                                                    if (error) {
                                                                        console.log(error);
                                                                    } else {
                            
                                                                        var sentDiamonds = 0;
                                                                        if (seRows && seRows.length > 0) {
                                                                            sentDiamonds = seRows[0].amount;
                            
                                                                            if (sentDiamonds == null) {
                                                                                sentDiamonds = 0;
                                                                            }
                                                                        }
                            
                                                                        console.log('sentDiamonds ' + sentDiamonds);
                                                                        var differenceDiamonds = 0;
                                                                    
                                                                        differenceDiamonds = receivedDiamonds - sentDiamonds;
                                                                        
                
                                                                        dbConnect.query('select * from tbl_send where from_user = ? and to_user = ? order by date desc', [otherId, val], function(error, getMessageResults, fields) {
                                                                            if (error) {
                                                                                console.log(error);
                                                                            } else {
                                                                                var recentMessage = '';
                                                                                if (getMessageResults && getMessageResults.length > 0) {
                                                                                    recentMessage = getMessageResults[0].fan_message;
                                    
                                                                                    if (recentMessage == null) {
                                                                                        recentMessage = '';
                                                                                    }
                                                                                }
                
                                                                                console.log('recentMessage ' + recentMessage);
    
                                                                                let rowData = {
                                                                                    userId: val,
                                                                                    name: name,
                                                                                    diamonds: differenceDiamonds,
                                                                                    imgUrl: imgUrl,
                                                                                    fanMessage: recentMessage,
                                                                                }
                                    
                                                                                console.log('rowData ' + JSON.stringify(rowData));
                                
                                                                                dbConnect.query('SELECT * FROM tbl_match WHERE main_user_id = ? and other_user_id = ? and status in (8, 9)', [val, otherId], function(error, checkBlockedResults, fields) {
                                                                                    if (error) {
                                                                                        console.log(error);
                                                                                    } else {
                                                                                        if (!checkBlockedResults.length) {
                                
                                                                                            console.log('checkBlockedResults 2-1 ' + checkBlockedResults);
                                                    
                                                                                            if (differenceDiamonds > 0) {
                                
                                                                                                var existingCheck = fanUsers.every(function(fanUser, index) {
                                                                            
                                                                                                    return rowData.userId !== fanUser.userId;
                                                                                                })
                                                                                                if (existingCheck) {
                                                                                                    fanUsers.push(rowData);
                                                                                                }
                                                                                            } else if (differenceDiamonds < 0) {
                                                                                                var existingCheck1 = starUsers.every(function(starUser, index) {
                                                                                        
                                                                                                    return rowData.userId !== starUser.userId;
                                                                                                })
                                                                                                if (existingCheck1) {
                                                                                                    starUsers.push(rowData);
                                                                                                }
                                                                                                dbConnect.query('select * from tbl_send where from_user = ? and to_user = ?', [val, otherId], function(error, sentHistoryResults, fields) {
                                                                                                    if (error) {
                                                                                                        console.log(error);
                                                                                                    } else {
                                                                                                        if (sentHistoryResults && sentHistoryResults > 0) {
                                                                                                            var existingCheck2 = mutualUsers.every(function(mutualUser, index) {
                                                                                        
                                                                                                                return rowData.userId !== mutualUser.userId;
                                                                                                            })
                                                                                                            if (existingCheck2) {
                                                                                                                mutualUsers.push(rowData);
                                                                                                            }
                                                                                                        }
                                                                                                    }
                                                                                                })
                                                                                            } else {
                                
                                                                                                var existingCheck = mutualUsers.every(function(mutualUser, index) {
                                                                            
                                                                                                    return rowData.userId !== mutualUser.userId;
                                                                                                })
                                                                                                if (existingCheck) {
                                                                                                    mutualUsers.push(rowData);
                                                                                                }
            
                                                                                                var existingCheck1 = starUsers.every(function(starUser, index) {
                                                                                        
                                                                                                    return rowData.userId !== starUser.userId;
                                                                                                })
                                                                                                if (existingCheck1) {
                                                                                                    starUsers.push(rowData);
                                                                                                }
                                                                                            }
                                                                                        }
                                
                                                                                        console.log('checkBlockedResults 2-2 ' + checkBlockedResults);
                                    
                                                                                        counter ++;
                                            
                                    
                                                                                        console.log('result_count ' + result_count);
                                                                                        console.log('counter_fan_user ' + counter);
                                            
                                                                                        if ( result_count == counter) {
                                                                                            req.userData.userId = userId;
                                                                                            req.body.otherId = otherId;
                                                                                            req.body.fanUsers = fanUsers;
                                                                                            req.body.starUsers = starUsers;
                                                                                            req.body.mutualUsers = mutualUsers;
                                                                                            counter = 0;
                                                                                            next();
                                                                                        }
                                                                                    }
                                                                                });
                                                                            }
                                                                        });
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    } else {
                                                        result_count --;
                                                    }
                                                }
                                            });
                                        }
                                    });
                                } else {

                                    var imgUrl = '';
                                    dbConnect.query('select name from tbl_user where id = ?', val, function(error, nameResults, fields) {
                                        if (error) {
                                            console.log(error);
                                        } else {
                                            
                                            var name = '';
                                            if (nameResults && nameResults.length > 0) {
                                                name = nameResults[0].name;

                                                dbConnect.query( "select sum(amount) as amount from tbl_send where from_user = ? and to_user = ?", [val, otherId], function(error, reRows, fields) {
                                                    if ( error ) {
                                                        console.log( error );
                                                    } else {
                    
                                                        var receivedDiamonds = 0;
                                                        if (reRows && reRows.length > 0) {
                                                            receivedDiamonds = reRows[0].amount;
                    
                                                            if (receivedDiamonds == null) {
                                                                receivedDiamonds = 0;
                                                            }
                                                        }
                    
                                                        console.log('receivedDiamonds ' + receivedDiamonds);
                                
                                                        dbConnect.query("select sum(amount) as amount from tbl_send where from_user = ? and to_user = ?", [otherId, val], function(error, seRows, fields) {
                                                            if (error) {
                                                                console.log(error);
                                                            } else {
                    
                                                                var sentDiamonds = 0;
                                                                if (seRows && seRows.length > 0) {
                                                                    sentDiamonds = seRows[0].amount;
                    
                                                                    if (sentDiamonds == null) {
                                                                        sentDiamonds = 0;
                                                                    }
                                                                }
                    
                                                                console.log('sentDiamonds ' + sentDiamonds);
                                                                var differenceDiamonds = 0;
                                                            
                                                                differenceDiamonds = receivedDiamonds - sentDiamonds;
    
                                                                dbConnect.query('select * from tbl_send where from_user = ? and to_user = ? order by date desc', [otherId, val], function(error, getMessageResults, fields) {
                                                                    if (error) {
                                                                        console.log(error);
                                                                    } else {
                                                                        var recentMessage = '';
                                                                        if (getMessageResults && getMessageResults.length > 0) {
                                                                            recentMessage = getMessageResults[0].fan_message;
                            
                                                                            if (recentMessage == null) {
                                                                                recentMessage = '';
                                                                            }
                                                                        }
        
                                                                        console.log('recentMessage ' + recentMessage);
    
                                                                        let rowData = {
                                                                            userId: val,
                                                                            name: name,
                                                                            diamonds: differenceDiamonds,
                                                                            imgUrl: imgUrl,
                                                                            fanMessage: recentMessage,
                                                                        }
                            
                                                                        console.log('rowData ' + JSON.stringify(rowData));
                        
                                                                        dbConnect.query('SELECT * FROM tbl_match WHERE main_user_id = ? and other_user_id = ? and status in (8, 9)', [val, otherId], function(error, checkBlockedResults, fields) {
                                                                            if (error) {
                                                                                console.log(error);
                                                                            } else {
                                                                                if (!checkBlockedResults.length) {
                        
                                                                                    console.log('checkBlockedResults 2-1 ' + checkBlockedResults);
                                            
                                                                                    if (differenceDiamonds > 0) {
                                
                                                                                        var existingCheck = fanUsers.every(function(fanUser, index) {
                                                                    
                                                                                            return rowData.userId !== fanUser.userId;
                                                                                        })
                                                                                        if (existingCheck) {
                                                                                            fanUsers.push(rowData);
                                                                                        }
                                                                                    } else if (differenceDiamonds < 0) {                                                                                    
                                                                                        var existingCheck1 = starUsers.every(function(starUser, index) {
                                                                                
                                                                                            return rowData.userId !== starUser.userId;
                                                                                        })
                                                                                        if (existingCheck1) {
                                                                                            starUsers.push(rowData);
                                                                                        }
                                                                                        dbConnect.query('select * from tbl_send where from_user = ? and to_user = ?', [val, otherId], function(error, sentHistoryResults, fields) {
                                                                                            if (error) {
                                                                                                console.log(error);
                                                                                            } else {
                                                                                                if (sentHistoryResults && sentHistoryResults > 0) {
                                                                                                    var existingCheck = mutualUsers.every(function(mutualUser, index) {
                                                                                
                                                                                                        return rowData.userId !== mutualUser.userId;
                                                                                                    })
                                                                                                    if (existingCheck) {
                                                                                                        mutualUsers.push(rowData);
                                                                                                    }
                                                                                                }
                                                                                            }
                                                                                        })
                                                                                    } else {
                        
                                                                                        var existingCheck = mutualUsers.every(function(mutualUser, index) {
                                                                    
                                                                                            return rowData.userId !== mutualUser.userId;
                                                                                        })
                                                                                        if (existingCheck) {
                                                                                            mutualUsers.push(rowData);
                                                                                        }                                                                            
                                                                                                
                                                                                        var existingCheck1 = starUsers.every(function(starUser, index) {
                                                                                        
                                                                                            return rowData.userId !== starUser.userId;
                                                                                        })
                                                                                        if (existingCheck1) {
                                                                                            starUsers.push(rowData);
                                                                                        }
                                                                                    }
                                                                                }
                        
                                                                                console.log('checkBlockedResults 2-2 ' + checkBlockedResults);
                            
                                                                                counter ++;
                                    
                                                                                console.log('result_count ' + result_count);
                                    
                                                                                console.log('counter_fan_user ' + counter);
                                    
                                                                                if ( result_count == counter) {
                                                                                    req.userData.userId = userId;
                                                                                    req.body.otherId = otherId;
                                                                                    req.body.fanUsers = fanUsers;
                                                                                    req.body.starUsers = starUsers;
                                                                                    req.body.mutualUsers = mutualUsers;
                                                                                    counter = 0;
                                                                                    next();
                                                                                }
                                                                            }
                                                                        });
                                                                    }
                                                                });                                                            
                                                            }
                                                        });
                                                    }
                                                });
                                            } else {
                                                result_count --;
                                            }
                                        }
                                    });
                                }
                            }
                        });
                    })(tVal);
                }
            }
        });
    } catch (error) {
        console.log(JSON.stringify(error));
        // return res.status(401).json({
        //     message: error
        // });
        // next();
    }
}

/**
 * Get All Biggest Fans for the user (other user) and Mutual Users
 */
fanApi.post('/getBiggestFanUsers', checkAuth, getFunUsers1, getFunUsers2, function(req, res) {
    var userId = req.userData.userId;
    var otherId = req.body.otherId;
    var fanUsers = req.body.fanUsers;
    var mutualUsers = req.body.mutualUsers;
    var starUsers = req.body.starUsers;

    console.log('fan_users ' + JSON.stringify(fanUsers));
    console.log('mutual_users ' + JSON.stringify(mutualUsers));
    console.log('star_users ' + JSON.stringify(starUsers));

    for (var i = 0; i < fanUsers.length; i ++) {
        for (var j = 0; j < i; j ++ ) {
            if (fanUsers[i].diamonds > fanUsers[j].diamonds) {
                let swap_value = fanUsers[i];
                fanUsers[i] = fanUsers[j];
                fanUsers[j] = swap_value;
            }
        }
    }

    var responseData = {
        fanUsers: fanUsers,
        mutualUsers: mutualUsers,
        starUsers: starUsers,
    }

    counter = 0;

    console.log(JSON.stringify(responseData));

    return res.send({ error: false, data: responseData, message: "Got Biggest Fan Users and Mutual Users." });
})

var getStarUsers = (req, res, next) => {
    try {
        var userId = req.userData.userId;
        
        var starUsers = [];

        req.userData.userId = userId;
        req.body.starUsers = [];

        var query = 'select distinct to_user from tbl_send where from_user = ?';

        console.log('distinct_query ' + query);

        dbConnect.query(query, [userId], function(error, results, fields) {
            if (error) {
                console.log(error);
            } else {
                if(!results || !results.length) {
                    console.log('results_error' + results);
                    counter = 0;
                    next();
                }
    
                var result_count = results.length;
    
                console.log('Candidate users ' + JSON.stringify(results));
    
                for ( var i = 0; i < results.length ; i ++ ) {
                    var tVal = results[i].to_user;
    
                    (function(val){
                        dbConnect.query('select count(*) as primary_count from tbl_video where user_id = ? and is_primary = 1', val, function(error, primaryResutls, fields) {
                            if (error) {
                                console.log(error);
                            } else {
                                var primary_count = 0;
                                if (primaryResutls && primaryResutls.length > 0) {
                                    primary_count = primaryResutls[0].primary_count;
                                }

                                if (primary_count > 0) {
                                    dbConnect.query('select cdn_id from tbl_video where user_id = ? and is_primary = 1', val, function(error, cdnResults, fields) {
                                        if (error) {
                                            console.log(error);
                                        } else {

                                            var imgUrl = '';
                                            if (cdnResults && cdnResults.length > 0) {
                                                imgUrl = cdnResults[0].cdn_id;
                                            }

                                            dbConnect.query('select name from tbl_user where id = ?', val, function(error, nameResults, fields) {
                                                if (error) {
                                                    console.log(error);
                                                } else {

                                                    var name = '';
                                                    if (nameResults && nameResults.length > 0) {
                                                        name = nameResults[0].name;

                                                        dbConnect.query("select sum(amount) as amount from tbl_send where from_user = ? and to_user = ?", [userId, val], function(error, seRows, fields) {
                                                            if (error) {
                                                                console.log(error);
                                                            } else {
                    
                                                                var sentDiamonds = 0;
                                                                if (seRows && seRows.length > 0) {
                                                                    sentDiamonds = seRows[0].amount;
                    
                                                                    if (sentDiamonds == null) {
                                                                        sentDiamonds = 0;
                                                                    }
                                                                }
                
                                                                dbConnect.query('select * from tbl_send where from_user = ? and to_user = ? order by date desc', [userId, val], function(error, getMessageResults, fields) {
                                                                    if (error) {
                                                                        console.log(error);
                                                                    } else {
                
                                                                        var recentMessage = '';
                                                                        if (getMessageResults && getMessageResults.length > 0) {
                                                                            recentMessage = getMessageResults[0].fan_message;
                            
                                                                            if (recentMessage == null) {
                                                                                recentMessage = '';
                                                                            }
                                                                        }
                
                                                                        console.log('recentMessage ' + recentMessage);
                                    
                                                                        let rowData = {
                                                                            userId: val,
                                                                            name: name,
                                                                            diamonds: sentDiamonds,
                                                                            imgUrl: imgUrl,
                                                                            fanMessage: recentMessage,
                                                                        }
                            
                                                                        console.log('rowData ' + JSON.stringify(rowData));
                
                                                                        dbConnect.query('SELECT * FROM tbl_match WHERE main_user_id = ? and other_user_id = ? and status in (8, 9)', [val, userId], function(error, checkBlockedResults, fields) {
                                                                            if (error) {
                                                                                console.log(error);
                                                                            } else {
                                                                                if (!checkBlockedResults.length) {
                
                                                                                    console.log('checkBlockedResults 1-1 ' + checkBlockedResults);
    
                                                                                    starUsers.push(rowData);
                                                                                }
                
                                                                                console.log('checkBlockedResults 1-2 ' + checkBlockedResults);
                                        
                                                                                counter ++;
                                    
                                                                                console.log('counter_fan_user' + counter);
                                    
                                                                                if ( result_count == counter) {
                                                                                    req.userData.userId = userId;
                                                                                    req.body.starUsers = starUsers;
                                                                                    counter = 0;
                                                                                    next();
                                                                                }
                                                                            }
                                                                        });
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    } else {
                                                        result_count --;
                                                    }
                                                }
                                            });
                                        }
                                    });
                                } else {
                                    var imgUrl = '';
                                    dbConnect.query('select name from tbl_user where id = ?', val, function(error, nameResults, fields) {
                                        if (error) {
                                            console.log(error);
                                        } else {

                                            var name = '';
                                            if (nameResults && nameResults.length > 0) {
                                                name = nameResults[0].name;                            
                                                dbConnect.query("select sum(amount) as amount from tbl_send where from_user = ? and to_user = ?", [userId, val], function(error, seRows, fields) {
                                                    if (error) {
                                                        console.log(error);
                                                    } else {
            
                                                        var sentDiamonds = 0;
                                                        if (seRows && seRows.length > 0) {
                                                            sentDiamonds = seRows[0].amount;
            
                                                            if (sentDiamonds == null) {
                                                                sentDiamonds = 0;
                                                            }
                                                        }
            
                                                        console.log('sentDiamonds ' + sentDiamonds);
        
                                                        dbConnect.query('select * from tbl_send where from_user = ? and to_user = ? order by date desc', [userId, val], function(error, getMessageResults, fields) {
                                                            if (error) {
                                                                console.log(error);
                                                            } else {
        
                                                                var recentMessage = '';
                                                                if (getMessageResults && getMessageResults.length > 0) {
                                                                    recentMessage = getMessageResults[0].fan_message;
                    
                                                                    if (recentMessage == null) {
                                                                        recentMessage = '';
                                                                    }
                                                                }
        
                                                                console.log('recentMessage ' + recentMessage);
                            
                                                                let rowData = {
                                                                    userId: val,
                                                                    name: name,
                                                                    diamonds: sentDiamonds,
                                                                    imgUrl: imgUrl,
                                                                    fanMessage: recentMessage,
                                                                }
                    
                                                                console.log('rowData ' + JSON.stringify(rowData));
        
                                                                dbConnect.query('SELECT * FROM tbl_match WHERE main_user_id = ? and other_user_id = ? and status in (8, 9)', [val, userId], function(error, checkBlockedResults, fields) {
                                                                    if (error) {
                                                                        console.log(error);
                                                                    } else {
                                                                        if (!checkBlockedResults.length) {
        
                                                                            console.log('checkBlockedResults 1-1 ' + checkBlockedResults);
                                                                            starUsers.push(rowData);
                                                                        }
        
                                                                        console.log('checkBlockedResults 1-2 ' + checkBlockedResults);
                                
                                                                        counter ++;
                            
                                                                        console.log('counter_fan_user' + counter);
                            
                                                                        if ( result_count == counter) {
                                                                            req.userData.userId = userId;
                                                                            req.body.starUsers = starUsers;
                                                                            counter = 0;
                                                                            next();
                                                                        }
                                                                    }
                                                                });
                                                            }
                                                        });
                                                    }
                                                });
                                            } else {
                                                result_count --;
                                            }
                                        }
                                    });
                                }
                            }
                        });
                    })(tVal);
                }
            }
        });
    } catch (error) {
        console.log(JSON.stringify(error));
        // return res.status(401).json({
        //     message: error
        // });
        // next();
    }
}

/**
 * Get All Star Users for the user
 */
fanApi.post('/getStarUsers', checkAuth, getStarUsers, function(req, res) {
    var userId = req.userData.userId;
    var starUsers = req.body.starUsers;

    console.log('star_users ' + JSON.stringify(starUsers));

    for (var i = 0; i < starUsers.length; i ++) {
        for (var j = 0; j < i; j ++ ) {
            if (starUsers[i].diamonds > starUsers[j].diamonds) {
                let swap_value = starUsers[i];
                starUsers[i] = starUsers[j];
                starUsers[j] = swap_value;
            }
        }
    }

    var responseData = {
        starUsers: starUsers,
    }

    counter = 0;

    console.log(JSON.stringify(responseData));

    return res.send({ error: false, data: responseData, message: "Got Star Users and Mutual Users." });
})

module.exports = fanApi;