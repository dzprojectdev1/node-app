var express = require('express');
var fanApi = express.Router();
var dbConnect = require('../config/dbConfig');
const checkAuth = require('../middleware/check_auth');
var FCM = require('fcm-node');
const serverKey = process.env.FIREBASE_SERVER_KEY;
const fcm = new FCM(serverKey);

var counter = 0;

/**
 * Sending diamonds
 */
fanApi.post('/sendDiamonds', checkAuth, function(req, res) {
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
            return res.send({error: false, coin_count: user_coin_count, message: 'There is no enough diamond.'});
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

                                // Update fan_user_id, fan_count
                                if (differencDiamonds > 0) {
                                    new_fan_user_id = userId;

                                    if (old_fan_user_id == 0) {
                                        other_fan_count = other_fan_count + 1;
                                    } else if (old_fan_user_id == otherId) {
                                        user_fan_count = user_fan_count - 1;
                                        other_fan_count = other_fan_count + 1;
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
                                                        title: 'You sent diamonds to '+otherUserName+'!',
                                                        body: 'You sent '+amount+' diamonds to '+otherUserName,
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
                                                        title: userName+' sent you new diamonds!!',
                                                        body: userName+' sent you '+amount+' diamonds',
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
                                                return res.send({ error: false, data: {coin_count: user_new_coin_count, other_fan_count: other_fan_count}, message: "Diamonds sent." });
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

var getFunUsers = (req, res, next) => {
    try {
        var userId = req.userData.userId;
        var otherId = req.body.otherId;

        var fanUsers = [];
        var mutualUsers = [];

        if (!otherId) {
            return res.status(400).send({ error: true, message: 'Please provide other user id' });
        }

        var query = 'select distinct from_user from tbl_send where to_user = ?';

        console.log('distinct_query ' + query);

        dbConnect.query(query, [otherId], function(error, results, fields) {
            if (error) {
                console.log(error);
            } else {
                if(!results || !results.length) return res.send({error: false, message: "This is no matched user." });
    
                var result_count = results.length;
    
                console.log('Candidate users ' + JSON.stringify(results));
    
                for ( var i = 0; i < results.length ; i ++ ) {
                    var val = results[i].from_user;
    
                    counter ++;
    
                    // (function(val){
                        dbConnect.query('select * from tbl_match where main_user_id = ? and other_user_id = ? and status in (6, 7) and publish in (0, 2)', [val, otherId], function(error, blockedResults, fields) {
                            if (error) {
                                console.log(error);
                            } else {
                                if (blockedResults && blockedResults.length > 0) {
                                    if (blockedResults.publish == 0 || blockedResults.publish == 2) {
                                        return
                                    }
                                }
                                dbConnect.query('select a.cdn_id, b.name from tbl_user as b left join tbl_video as a on a.user_id = b.id where b.id = ? and (a.cdn_id IS NULL or a.is_primary=1)', val, function(error, userRows, fields) {
                                    if (error) {
                                        console.log(error);
                                    } else {
                                        var name = '';
                                        var imgUrl = '';
                                        if (userRows && userRows.length > 0) {
                                            name = userRows[0].name;
                                            imgUrl = userRows[0].cdn_id;
                                        }
                                        console.log('imgUrl ' + imgUrl);
            
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
                            
                                                        let rowData = {
                                                            userId: val,
                                                            name: name,
                                                            diamonds: differenceDiamonds,
                                                            imgUrl: imgUrl,
                                                        }
            
                                                        console.log('rowData ' + JSON.stringify(rowData));
                            
                                                        if (differenceDiamonds > 0) {
                                                            fanUsers.push(rowData);
                                                        } else {
                                                            mutualUsers.push(rowData);
                                                        }
            
                                                        console.log('counter_fan_user' + counter);
            
                                                        if ( result_count == counter) {
                                                            req.userData.userId = userId;
                                                            req.body.otherId = otherId;
                                                            req.body.fanUsers = fanUsers;
                                                            req.body.mutualUsers = mutualUsers;
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
                    // })(tVal);
                }
            }
        });
    } catch (error) {
        return res.status(401).json({
            message: error
        });
    }
}

/**
 * Get All Biggest Fans for the user (other user) and Mutual Users
 */
fanApi.post('/getBiggestFanUsers', checkAuth, getFunUsers, function(req, res) {
    var userId = req.userData.userId;
    var otherId = req.body.otherId;
    var fanUsers = req.body.fanUsers;
    var mutualUsers = req.body.mutualUsers;

    console.log('fan_users ' + JSON.stringify(fanUsers));
    console.log('mutual_users ' + JSON.stringify(mutualUsers));

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
    }

    counter = 0;

    console.log(JSON.stringify(responseData));

    return res.send({ error: false, data: responseData, message: "Got Biggest Fan Users and Mutual Users." });
})

module.exports = fanApi;