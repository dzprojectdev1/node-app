var express = require("express");
var chatApi = express.Router();
var dbConn = require("../config/dbConfig");
const checkAuth = require('../middleware/check_auth');
const blockFunction = require("./matchApi").blockFunction;
const autoBlockFunction = require("./matchApi").autoBlockFunction;
const commonFunc = require('../config/common').commonFunc;
var FCM = require('fcm-node');
const { bucket } = require('../config/storageConfig');

//#29 UC9 Chat Api == UC9.1 Display Chat - Main list
chatApi.get('/all', checkAuth, function (req, res) {
    var userId = req.userData.userId;

    var leftJoinQuery = 'inner join tbl_chat d on c.chat_id=d.id inner join tbl_user e on c.other_user_id=e.id left join tbl_video g on g.user_id=e.id WHERE (g.is_primary=1 or g.cdn_id IS NULL) order by d.created_date desc';
    // var matchWhereCondition = ' a.main_user_id=? and a.status in (6,7) and a.publish=1 group by a.id ';
    var matchWhereCondition = ' a.main_user_id=? and a.status in (6,7) and a.publish in (1, 2) group by a.id ';
    var leftMatchJoinQuery = ' inner join tbl_chat b on a.id=b.match_id';
    var matchQuery = 'SELECT a.id as match_id, max(b.id) as chat_id, a.publish as publish, a.other_user_id as other_user_id FROM `tbl_match` a ' + leftMatchJoinQuery + ' where ' + matchWhereCondition;
    var leftQueryString = '(select c.*, d.message_text, d.created_date as created_date, e.id, e.name, e.gender, e.description, e.birth_date, e.coin_count, e.fan_count, TIMESTAMPDIFF(YEAR, e.birth_date, CURDATE()) AS age, g.cdn_id, g.cdn_filtered_id, g.is_primary, e.ai_friend, e.ai_personality, e.img_message from (' + matchQuery + ') c ' + leftJoinQuery + ')';
    // return res.send({query: leftQueryString});

    console.log('[GET /api/chat/all] userId:', userId);
    console.log('[GET /api/chat/all] leftQueryString:', leftQueryString);

    dbConn.query(leftQueryString, [userId], function (error, results, fields) {
        if (error) {
            console.log('[GET /api/chat/all] SQL error:', error);
            return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
        }

        results.forEach(chat => {
            chat.time_ago = commonFunc.timeAgo(chat.created_date);
        });
        return res.send({ error: false, data: results, message: "Get All Chat List" });
    });
});

//#29.1 UC9 Chat Api == UC9.1 Display Chat - Main list - Pagination
// chatApi.post('/all', checkAuth, function (req, res) {
//     var userId = req.userData.userId;
//     var perPageCount = req.body.count;
//     var offSet = req.body.offset;
    
//     if (!perPageCount || !offSet) 
//         return res.status(403).send({error: true, message: 'invalid params'});

//     perPageCount = parseInt(perPageCount);
//     offSet = parseInt(offSet);

//     console.log('perPageCount is ' + perPageCount);
//     console.log('offSet is ' + offSet);

//     var leftJoinQuery = 'inner join tbl_chat d on c.chat_id=d.id inner join tbl_user e on c.other_user_id=e.id left join tbl_video g on g.user_id=e.id WHERE (g.is_primary=1 or g.cdn_id IS NULL) order by d.created_date desc LIMIT ? OFFSET ? ';
//     // var matchWhereCondition = ' a.main_user_id=? and a.status in (6,7) and a.publish=1 group by a.id ';
//     var matchWhereCondition = ' a.main_user_id=? and a.status in (6,7) and a.publish in (1, 2) group by a.id ';
//     var leftMatchJoinQuery = ' inner join tbl_chat b on a.id=b.match_id';
//     var matchQuery = 'SELECT a.id as match_id, max(b.id) as chat_id, a.publish as publish, a.other_user_id as other_user_id FROM `tbl_match` a ' + leftMatchJoinQuery + ' where ' + matchWhereCondition;
//     var leftQueryString = '(select c.*, d.message_text, d.created_date as created_date, e.id, e.name, e.gender, e.description, e.birth_date, TIMESTAMPDIFF(YEAR, e.birth_date, CURDATE()) AS age, g.cdn_id, g.cdn_filtered_id, g.is_primary from (' + matchQuery + ') c ' + leftJoinQuery + ')';
//     // return res.send({query: leftQueryString});

//     dbConn.query(leftQueryString, [userId, perPageCount, offSet], function (error, results, fields) {
//         if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });

//         results.forEach(chat => {
//             chat.time_ago = commonFunc.timeAgo(chat.created_date);
//         });
//         return res.send({ error: false, data: results, message: "Get All Chat List" });
//     });
// });

//30 UC9.2  Display Chat - display chat content for the selected match_id
chatApi.get('/getChatWithMatchId/:matchId', checkAuth, function (req, res) {
    var userId = req.userData.userId;
    var matchId = req.params.matchId;

    if (!matchId)
        return res.send({ error: true, message: 'Invalid Match Param.' });

    var whereCondition = 'a.match_id=? and (b.main_user_id=? or b.other_user_id=?)';

    dbConn.query('Select a.*, b.mutual_match_id from tbl_chat as a inner join tbl_match as b on a.match_id=b.id where ' + whereCondition + ' order by created_date asc', [matchId, userId, userId], function (error, results, fields) {
        if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });

        //get other user detail information from match id
        dbConn.query('SELECT a.name, a.gender, a.birth_date, a.ai_friend, a.ai_personality, a.img_message, TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) AS age from tbl_user as a inner join tbl_match as b on a.id=b.other_user_id where b.id=? and (b.main_user_id=? or b.other_user_id=?) and a.account_status=1', [matchId, userId, userId], function (error1, userResults, fields) {
            if (error1) return res.status(400).send({ error: true, detail: error1.code, message: error1.sqlMessage });
            if (!userResults.length) return res.status(403).send({ error: false, message: 'Match Data not found' });
            var matchedOtherUser = userResults[0];

            return res.send({ error: false, data: { user: matchedOtherUser, content: results }, message: "Get All Chat List With Match Id: " + matchId });
        });
    });
});

//31 UC9.3 Create a new Chat Text 
chatApi.post('/create', checkAuth, autoBlockFunction, function (req, res) {
    var userId = req.userData.userId;
    var matchId = req.body.matchId;
    var messageText = req.body.messageText;
    var user_image_url = req.body?.user_image_url;
    var user_current_action = req.body?.user_current_action;
    const serverKey = process.env.FIREBASE_SERVER_KEY;
    const fcm = new FCM(serverKey);

    if (!matchId || !messageText) {
        return res.status(400).send({ error: true, message: 'Invalid Params.' });
    }

    // let query = 'select * from tbl_user as a left join tbl_video as b on a.id = b.user_id where (b.cdn_id IS NULL OR b.is_primary = 1) and a.id = ?';
    let query = 'select * from tbl_user where id = ?';
    dbConn.query(query, userId, function (error, results, fields) {
        if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });;
        if (!results.length)
            return res.status(400).send({ error: true, message: 'No Match Found' });

        const username      = results[0].name;
        const userphotoId   = results[0].cdn_id;
        var account_status  = results[0].account_status;
        var user_coin_count = results[0].coin_count;
        var user_fan_count  = results[0].fan_count;
        var user_fcm_id     = results[0].fcm_id;

        if (account_status !== 1)
            return res.send({ error: false, data: { account_status: account_status, sending_available: false }, message: "Your Account Is Not Active." });

        dbConn.query('Select a.mutual_match_id, a.publish, b.name, b.id, b.coin_count, b.fan_count, b.fcm_id from tbl_match a join tbl_user b where a.id=? and a.other_user_id = b.id', [matchId], function (err, matchResults, fields) {
            if (err) return res.status(400).send({ error: true, detail: err.code, message: err.sqlMessage });
            if (!matchResults.length)
                return res.status(400).send({ error: true, message: 'No Match Found' });

            var mutualMatchId    = matchResults[0].mutual_match_id;
            var publish          = matchResults[0].publish;
            var otherusername    = matchResults[0].name;
            var otheruserId      = matchResults[0].id;
            var other_coin_count = matchResults[0].coin_count;
            var other_fan_count  = matchResults[0].fan_count;
            var other_fcm_id     = matchResults[0].fcm_id;

            if (publish !== 1)
                return res.send({ error: false, data: { account_status: account_status, sending_available: false }, message: "Your Account Is Not Active." });

            query = 'select * from tbl_match where main_user_id = ? and other_user_id = ? and status = 7';
            //console.log('chat_query', query);
            dbConn.query(query, [userId, otheruserId], function(error, getCoinPerMessageResults, fields) {
                if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });

                var coin_per_message = 0;
                if (!getCoinPerMessageResults || !getCoinPerMessageResults.length) {
                    dbConn.query('select publish from tbl_match where id=?', mutualMatchId, function (err, otherMatchResults, fields) {
                        if (err) return res.status(400).send({ error: true, detail: err.code, message: err.sqlMessage });
                        if (!otherMatchResults.length)
                            return res.status(400).send({ error: true, message: 'No Match Found' });
        
                        var otherPublish = otherMatchResults[0].publish;
        
                        if (otherPublish !== 1)
                            return res.send({ error: false, data: { account_status: account_status, sending_available: false }, message: "Your Account Is Not Active." });
        
                        var sendMsg = {
                            match_id: matchId,
                            message_type: 1,
                            message_text: messageText,
                            user_sent: userId,
                            name_sent: username,
                            user_received: otheruserId,
                            name_received: otherusername,
                            created_date: new Date()
                        };

                        if(user_current_action){
                            sendMsg.user_current_action = user_current_action;
                        }

                        if(user_image_url){
                            sendMsg.user_image_url = user_image_url;
                        }

                        dbConn.getConnection().then(connection => {
                            connection.beginTransaction(function (error) {
                                if (error) {
                                    connection.release();
                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                }
                                connection.query('INSERT INTO tbl_chat set ? ', [sendMsg], function (error, sendResult) {
                                    if (error) {
                                        return connection.rollback(function () {
                                            connection.release();
                                            return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                        });
                                    }
                                    var receiveMsg = {
                                        match_id: mutualMatchId,
                                        message_type: 2,
                                        message_text: messageText,
                                        user_sent: otheruserId,
                                        name_sent: otherusername,
                                        user_received: userId,
                                        name_received: username,
                                        created_date: new Date()
                                    };

                                    if(user_current_action){
                                        receiveMsg.user_current_action = user_current_action;
                                    }

                                    if(user_image_url){
                                        receiveMsg.user_image_url = user_image_url;
                                    }

                                    connection.query('INSERT INTO tbl_chat set ? ', [receiveMsg], function (error, receiveResult) {
                                        if (error) {
                                            return connection.rollback(function () {
                                                connection.release();
                                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                            });
                                        }
                                        connection.commit(function (error) {
                                            if (error) {
                                                return connection.rollback(function () {
                                                    connection.release();
                                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                });
                                            }
                                            // Transaction done; release before doing non-transaction work.
                                            connection.release();

                                            dbConn.query('SELECT * FROM tbl_user a INNER JOIN tbl_match b ON a.id=b.main_user_id WHERE b.id=?', mutualMatchId, function (error1, receiver, receiverFields) {
                                                if (error1) return res.status(400).send({ error: true, detail: error1.code, message: error1.sqlMessage });
                                                if (!receiver.length) res.status(400).send({ error: true, message: 'Receiver data not found.' });
                                                const receiverData = receiver[0];
                                                if (!receiverData.fcm_id) return res.status(400).send({ error: true, message: 'firebase token not found' });
                                                const deviceId = receiverData.fcm_id;
                                                let userPhotoUrl;
                                                if (userphotoId) {
                                                // userPhotoUrl = bucket.getFiles(function (err, files) {
                                                //     if (err)
                                                //         return null;
        
                                                //     const match = files.find(file => file.id === userphotoId);
        
                                                //     if (!match)
                                                //         return null;
                                                //     match.getSignedUrl({
                                                //         action: 'read',
                                                //         expires: '03-17-2025'
                                                //     }, (err, url) => {
                                                //         if (err) {
                                                //         } else {
                                                //             return url;
                                                //         }
                                                //     });
        
                                                // });
                                                userPhotoUrl = 'https://storage.googleapis.com/' + process.env.BUCKET_NAME + '/' + userphotoId + '-screenshot';
                                            } else {
                                                    userPhotoUrl = '';
                                                }
        
                                            var message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
                                                to: deviceId,
                                                notification: {
                                                    title: 'New Message',
                                                    body: messageText,
                                                },
                                                data: {  //you can send only notification or only data(or include both)
                                                    type: 'ChatDetail',
                                                    senderId: userId,
                                                    senderImg: userPhotoUrl,
                                                    senderName: username
                                                }
                                            };
                                            fcm.send(message, function (notiErr, notiRes) {
                                                if (notiErr) {
                                                    console.log("Notification Sending is failed: ", notiErr);
                                                } else {
                                                    console.log("Successfully sent with response: ", notiRes);
                                                }
                                            });
                                                return res.send({ error: false, data: { sendResult, receiveResult, account_status: account_status, sending_available: true }, message: "New Message is Created." });
                                            });
                                        });
                                    });
                                });
                            })
                        }).catch(err => {
                            return res.status(400).send({ error: true, detail: err.code, message: err.sqlMessage || err.message });
                        })
                    })
                } else {
                    coin_per_message = getCoinPerMessageResults[0].coin_per_message;

                    if (coin_per_message > 0) {
                        if (user_coin_count < coin_per_message)
                            return res.send({ error: false, data: { account_status: account_status, sending_available: false, diamonds_enough: false, }, message: "You don’t have diamonds." });
    
                        dbConn.query('select publish from tbl_match where id=?', mutualMatchId, function (err, otherMatchResults, fields) {
                            if (err) return res.status(400).send({ error: true, detail: err.code, message: err.sqlMessage });
                            if (!otherMatchResults.length)
                                return res.status(400).send({ error: true, message: 'No Match Found' });
            
                            var otherPublish = otherMatchResults[0].publish;
            
                            if (otherPublish !== 1)
                                return res.send({ error: false, data: { account_status: account_status, sending_available: false }, message: "Your Account Is Not Active." });
                                    
                            /**
                             * transaction for sending diamonds
                             */
                            var user_new_coin_count = parseInt(user_coin_count) - parseInt(coin_per_message); // updated diamonds count of user
                            var other_new_coin_count = parseInt(other_coin_count) + parseInt(coin_per_message); // updated diamonds count of other user
    
                            // Get old fan user id
                            var old_fan_user_id = 0;
                            var new_fan_user_id = 0;
                            query = 'select * from tbl_send where (from_user = ? and to_user = ?) or (from_user = ? and to_user = ?) order by date desc';
                            dbConn.query(query, [userId, otheruserId, otheruserId, userId], function(error, fanResults, fields) {
                                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                                if (fanResults && fanResults.length > 0) {
                                    old_fan_user_id = fanResults[0].fan_user_id;
                                    new_fan_user_id = old_fan_user_id;
                                }
    
                                // Insert new record to tbl_send
                                var sendDiamondsData = {
                                    from_user: userId,
                                    from_user_name: username,
                                    from_user_orig_count: user_coin_count,
                                    from_user_new_count: user_new_coin_count,
                                    to_user: otheruserId,
                                    to_user_name: otherusername,
                                    to_user_orig_count: other_coin_count,
                                    to_user_new_count: other_new_coin_count,
                                    amount: coin_per_message,
                                    fan_message: '',
                                    fan_user_id: 0,
                                    date: new Date()
                                };
    
                                dbConn.getConnection(function (connErr, connection) {
                                    if (connErr) return res.status(400).send({ error: true, detail: connErr.code, message: connErr.sqlMessage || connErr.message });
                                    connection.beginTransaction(function (error) {
                                        if (error) {
                                            connection.release();
                                            return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                        }
                                        // Shadow dbConn so existing transactional code uses the dedicated connection.
                                        var dbConn = connection;
    
                                    dbConn.query('INSERT INTO tbl_send set ? ', [sendDiamondsData], function (error, insertResult) {
                                        if (error) {
                                            dbConn.rollback(function () {
                                                dbConn.release();
                                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                            });
                                        }
    
                                        var insertId = insertResult.insertId;
    
                                        // Update fan_user_id after inserting.
                                        var userIdDiamonds = 0;
                                        var otherIdDiamonds = 0;
    
                                        var query = 'select sum(amount) as amount from tbl_send where from_user = ? and to_user = ?';
                                        dbConn.query(query, [userId, otheruserId], function(error, sumUserResults, fields) {
                                            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                                            if(sumUserResults && (sumUserResults.length > 0) && (sumUserResults[0].amount != null)) {
                                                userIdDiamonds = sumUserResults[0].amount; // sum of sent diamonds from user to other user
                                            }
                                            
                                            dbConn.query(query, [otheruserId, userId], function(error, sumOtherResults, fields) {
                                                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                                                if(sumOtherResults && (sumOtherResults.length > 0) && (sumOtherResults[0].amount != null)) {
                                                    otherIdDiamonds = sumOtherResults[0].amount; // sum of sent diamonds from other user to user
                                                }
    
                                                var differencDiamonds = userIdDiamonds - otherIdDiamonds;
    
                                                var sentPushTitle = 'You sent diamonds to '+otherusername+'!';
                                                var sentPushBody = 'You sent '+coin_per_message+' diamonds to '+otherusername;
                                                var receivePushTitle = username+' sent you new diamonds!!';
                                                var receivePushBody = username+' sent you '+coin_per_message+' diamonds';
    
                                                // Update fan_user_id, fan_count
                                                if (differencDiamonds > 0) {
                                                    new_fan_user_id = userId;
    
                                                    if (old_fan_user_id == 0) {
                                                        other_fan_count = other_fan_count + 1;
    
                                                        sentPushTitle = 'You are now a fan of '+otherusername+'!';
                                                        receivePushTitle = username+' became your fan!';
                                                    } else if (old_fan_user_id == otheruserId) {
                                                        user_fan_count = user_fan_count - 1;
                                                        other_fan_count = other_fan_count + 1;
    
                                                        sentPushTitle = 'You are now a fan of '+otherusername+'!';
                                                        receivePushTitle = username+' became your fan!';
                                                    }
                                                } else if (differencDiamonds == 0) {
                                                    new_fan_user_id = 0;
    
                                                    if (old_fan_user_id == 0) {
                                                        other_fan_count = other_fan_count + 1;
                                                    } else if (old_fan_user_id == otheruserId) {
                                                        user_fan_count = user_fan_count - 1;
                                                    }
                                                }
    
                                                // Update fan_user_id at tbl_send, users's coin_count and fan_count at tbl_user
                                                query = 'update tbl_send set fan_user_id = ? where id = ?';
                                                dbConn.query(query, [new_fan_user_id, insertId], function(error, updateResult, fields) {
                                                    if (error) {
                                                        dbConn.rollback(function () {
                                                            dbConn.release();
                                                            return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                        });
                                                    }
    
                                                    dbConn.query('update tbl_user set coin_count = ?, fan_count = ? where id = ? ', [user_new_coin_count, user_fan_count, userId], function (error, sendResult) {
                                                        if (error) {
                                                            dbConn.rollback(function () {
                                                                dbConn.release();
                                                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                            });
                                                        }
                            
                                                        dbConn.query('update tbl_user set coin_count = ?, fan_count = ? where id = ? ', [other_new_coin_count, other_fan_count, otheruserId], function (error, receiveResult) {
                                                            if (error) {
                                                                dbConn.rollback(function () {
                                                                    dbConn.release();
                                                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                                });
                                                            }
                            
                                                            /**
                                                             * Sending message
                                                             */
                                                            var sendMsg = {
                                                                match_id: matchId,
                                                                message_type: 1,
                                                                message_text: messageText,
                                                                user_sent: userId,
                                                                name_sent: username,
                                                                user_received: otheruserId,
                                                                name_received: otherusername,
                                                                created_date: new Date()
                                                            };

                                                            if(user_image_url){
                                                                sendMsg.user_image_url = user_image_url;
                                                            }
                                                            if(user_current_action){
                                                                sendMsg.user_current_action = user_current_action;
                                                            }
    
                                                            dbConn.query('INSERT INTO tbl_chat set ? ', [sendMsg], function (error, sendResult) {
                                                                if (error) {
                                                                    dbConn.rollback(function () {
                                                                        dbConn.release();
                                                                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                                    });
                                                                }
                                                                var receiveMsg = {
                                                                    match_id: mutualMatchId,
                                                                    message_type: 2,
                                                                    message_text: messageText,
                                                                    user_sent: otheruserId,
                                                                    name_sent: otherusername,
                                                                    user_received: userId,
                                                                    name_received: username,
                                                                    created_date: new Date()
                                                                };

                                                                if(user_image_url){
                                                                    receiveMsg.user_image_url = user_image_url;
                                                                }
                                                                if(user_current_action){
                                                                    receiveMsg.user_current_action = user_current_action;
                                                                }

                                                                dbConn.query('INSERT INTO tbl_chat set ? ', [receiveMsg], function (error, receiveResult) {
                                                                    if (error) {
                                                                        dbConn.rollback(function () {
                                                                            dbConn.release();
                                                                            return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                                        });
                                                                    }
                                                                    dbConn.commit(function (error) {
                                                                        if (error) {
                                                                                dbConn.rollback(function () {
                                                                                    dbConn.release();
                                                                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                                                });
                                                                        }
                                        
                                                                        dbConn.query('SELECT * FROM tbl_user a INNER JOIN tbl_match b ON a.id=b.main_user_id WHERE b.id=?', mutualMatchId, function (error1, receiver, receiverFields) {
                                                                            if (error1) {
                                                                                dbConn.release();
                                                                                return res.status(400).send({ error: true, detail: error1.code, message: error1.sqlMessage });
                                                                            }
                                                                            if (!receiver.length) res.status(400).send({ error: true, message: 'Receiver data not found.' });
                                                                            const receiverData = receiver[0];
                                                                            if (!receiverData.fcm_id) return res.status(400).send({ error: true, message: 'firebase token not found' });
                                                                            const deviceId = receiverData.fcm_id;
                                                                            let userPhotoUrl;
                                                                            if (userphotoId) {
                                                                                userPhotoUrl = 'https://storage.googleapis.com/' + process.env.BUCKET_NAME + '/' + userphotoId + '-screenshot';
                                                                            } else {
                                                                                userPhotoUrl = '';
                                                                            }
                                        
                                                                            // var message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
                                                                            //     to: deviceId,
                                                                            //     notification: {
                                                                            //         title: 'New Message',
                                                                            //         body: messageText,
                                                                            //     },
                                                                            //     data: {  //you can send only notification or only data(or include both)
                                                                            //         type: 'ChatDetail',
                                                                            //         senderId: userId,
                                                                            //         senderImg: userPhotoUrl,
                                                                            //         senderName: username
                                                                            //     }
                                                                            // };
                                                                            // fcm.send(message, function (notiErr, notiRes) {
                                                                            //     if (notiErr) {
                                                                            //         console.log("Notification Sending is failed: ", notiErr);
                                                                            //     } else {
                                                                            //         console.log("Successfully sent with response: ", notiRes);
                                                                            //     }
                                                                            // });
                                                                            var message1 = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
                                                                                to: user_fcm_id,
                                                                                notification: {
                                                                                    title: sentPushTitle,
                                                                                    body: sentPushBody,
                                                                                },
                                                                                data: {  //you can send only notification or only data(or include both)
                                                                                    type: 'SendDiamonds',
                                                                                    senderImg: '',
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
                                                                                    senderImg: userPhotoUrl,
                                                                                }
                                                                            };
                                                                            fcm.send(message2, function (notiErr, notiRes) {
                                                                                if (notiErr) {
                                                                                    console.log("Notification Sending is failed: ", notiErr);
                                                                                } else {
                                                                                    console.log("Successfully sent with response: ", notiRes);
                                                                                }
                                                                            });
                                                                            dbConn.release();
                                                                            return res.send({ error: false, data: { sendResult, receiveResult, account_status: account_status, sending_available: true }, message: "New Message is Created." });
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
                            // end
                        });
                    });
                    } else { 
                        dbConn.query('select publish from tbl_match where id=?', mutualMatchId, function (err, otherMatchResults, fields) {
                            if (err) return res.status(400).send({ error: true, detail: err.code, message: err.sqlMessage });
                            if (!otherMatchResults.length)
                                return res.status(400).send({ error: true, message: 'No Match Found' });
            
                            var otherPublish = otherMatchResults[0].publish;
            
                            if (otherPublish !== 1)
                                return res.send({ error: false, data: { account_status: account_status, sending_available: false }, message: "Your Account Is Not Active." });
            
                            var sendMsg = {
                                match_id: matchId,
                                message_type: 1,
                                message_text: messageText,
                                user_sent: userId,
                                name_sent: username,
                                user_received: otheruserId,
                                name_received: otherusername,
                                created_date: new Date()
                            }

                            if(user_image_url){
                                sendMsg.user_image_url = user_image_url;
                            }
                            if(user_current_action){
                                sendMsg.user_current_action = user_current_action;
                            }

                            dbConn.getConnection().then(connection => {
                                connection.beginTransaction(function (error) {
                                    if (error) {
                                        connection.release();
                                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                    }
                                    connection.query('INSERT INTO tbl_chat set ? ', [sendMsg], function (error, sendResult) {
                                        if (error) {
                                            return connection.rollback(function () {
                                                connection.release();
                                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                            });
                                        }
                                        var receiveMsg = {
                                            match_id: mutualMatchId,
                                            message_type: 2,
                                            message_text: messageText,
                                            user_sent: otheruserId,
                                            name_sent: otherusername,
                                            user_received: userId,
                                            name_received: username,
                                            created_date: new Date()
                                        };
                    
                                        if(user_image_url){
                                            receiveMsg.user_image_url = user_image_url;
                                        }
                                        if(user_current_action){
                                            receiveMsg.user_current_action = user_current_action;
                                        }
                    
                                        connection.query('INSERT INTO tbl_chat set ? ', [receiveMsg], function (error, receiveResult) {
                                            if (error) {
                                                return connection.rollback(function () {
                                                    connection.release();
                                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                });
                                            }
                                            connection.commit(function (error) {
                                                if (error) {
                                                    return connection.rollback(function () {
                                                        connection.release();
                                                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                    });
                                                }
                    
                                                // Transaction done; release before doing non-transaction work.
                                                connection.release();
                                                dbConn.query('SELECT * FROM tbl_user a INNER JOIN tbl_match b ON a.id=b.main_user_id WHERE b.id=?', mutualMatchId, function (error1, receiver, receiverFields) {
                                                    if (error1) return res.status(400).send({ error: true, detail: error1.code, message: error1.sqlMessage });
                                                    if (!receiver.length) res.status(400).send({ error: true, message: 'Receiver data not found.' });
                                                    const receiverData = receiver[0];
                                                    if (!receiverData.fcm_id) return res.status(400).send({ error: true, message: 'firebase token not found' });
                                                    const deviceId = receiverData.fcm_id;
                                                    let userPhotoUrl;
                                                    if (userphotoId) {
                                                        // userPhotoUrl = bucket.getFiles(function (err, files) {
                                                        //     if (err)
                                                        //         return null;
                        
                                                        //     const match = files.find(file => file.id === userphotoId);
                        
                                                        //     if (!match)
                                                        //         return null;
                                                        //     match.getSignedUrl({
                                                        //         action: 'read',
                                                        //         expires: '03-17-2025'
                                                        //     }, (err, url) => {
                                                        //         if (err) {
                                                        //         } else {
                                                        //             return url;
                                                        //         }
                                                        //     });
                        
                                                        // });
                                                        userPhotoUrl = 'https://storage.googleapis.com/' + process.env.BUCKET_NAME + '/' + userphotoId + '-screenshot';
                                                    } else {
                                                        userPhotoUrl = '';
                                                    }
                    
                                                    var message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
                                                        to: deviceId,
                                                        notification: {
                                                            title: 'New Message',
                                                            body: messageText,
                                                        },
                                                        data: {  //you can send only notification or only data(or include both)
                                                            type: 'ChatDetail',
                                                            senderId: userId,
                                                            senderImg: userPhotoUrl,
                                                            senderName: username
                                                        }
                                                    };
                                                    fcm.send(message, function (notiErr, notiRes) {
                                                        if (notiErr) {
                                                            console.log("Notification Sending is failed: ", notiErr);
                                                        } else {
                                                            console.log("Successfully sent with response: ", notiRes);
                                                        }
                                                    });
                                                    return res.send({ error: false, data: { sendResult, receiveResult, account_status: account_status, sending_available: true }, message: "New Message is Created." });
                                                });
                                            });
                                        });
                                    });
                                });
                            }).catch(err => {
                                return res.status(400).send({ error: true, detail: err.code, message: err.sqlMessage || err.message });
                            });
                        });
                    }
                }
            });
        });
    });
});

//#32 UC 10.1 Report - hide from display once blocked
chatApi.post('/reportUser', checkAuth, blockFunction, function (req, res) {
    var userId = req.userData.userId;
    var otherId = req.body.otherId;
    var matchId = req.oldData ? req.oldData.id : req.matchId;

    var reportDescription = req.body.reportDescription;

    if (!otherId) {
        return res.status(400).send({ error: true, message: 'Invalid Other Id.' });
    };
    if (!reportDescription) {
        return res.status(400).send({ error: true, message: 'Invalid Report Description.' });
    }
    dbConn.query("SELECT * FROM tbl_report WHERE user_id_submitted=? AND user_id_violated=? AND tbl_match_id=? ", [userId, otherId, matchId], function (error, results, feilds) {
        if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
        if (results.length) return res.status(403).send({ error: true, data: results[0], message: 'Report data already exist.' });

        var sendReportData = {
            user_id_submitted: userId,
            user_id_violated: otherId,
            tbl_match_id: matchId,
            report_description: reportDescription,
            report_status: 8,
            created_date: new Date(),
            admin_comment: ''
        };

        dbConn.getConnection().then(connection => {
            connection.beginTransaction(function (error) {
                if (error) {
                    connection.release();
                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                }

                connection.query('INSERT INTO tbl_report set ? ', [sendReportData], function (error, sendResult) {
                    if (error) {
                        return connection.rollback(function () {
                            connection.release();
                            return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                        });
                    }
                    var receiveReportData = {
                        user_id_submitted: otherId,
                        user_id_violated: userId,
                        tbl_match_id: matchId,
                        report_description: reportDescription,
                        report_status: 9,
                        created_date: new Date(),
                        admin_comment: ''
                    };
                    connection.query('INSERT INTO tbl_report set ? ', [receiveReportData], function (error, receiveResult) {
                        if (error) {
                            return connection.rollback(function () {
                                connection.release();
                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                            });
                        }

                        connection.commit(function (error) {
                            if (error) {
                                return connection.rollback(function () {
                                    connection.release();
                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                });
                            }

                            connection.release();
                            return res.send({ error: false, data: { sender_report_id: sendResult.insertId, receiver_report_id: receiveResult.insertId }, message: "New Report is Created." });
                        });
                    });
                });
            });
        }).catch(err => {
            return res.status(400).send({ error: true, detail: err.code, message: err.sqlMessage || err.message });
        });
    });
});

//#33 UC 11 = block user from chat
chatApi.post('/blockChat', checkAuth, function (req, res) {
    var userId = req.userData.userId;
    var otherId = req.body.otherId;

    if (!otherId) {
        return res.status(400).send({ error: true, message: 'Please provide other user id' });
    }

    var userBlockData = {
        main_user_id: userId,
        other_user_id: otherId,
        status: 8,
        status_description: 'block_chat',
        created_date: new Date(),
        updated_date: new Date()
    };

    dbConn.getConnection().then(connection => {
        connection.beginTransaction(function (error) {
            if (error) {
                connection.release();
                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
            }
            connection.query('INSERT INTO tbl_match set ? ', [userBlockData], function (error, sendResult) {
                if (error) {
                    return connection.rollback(function () {
                        connection.release();
                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                    });
                }
                var blockReplyData = {
                    main_user_id: otherId,
                    other_user_id: userId,
                    status: 9,
                    mutual_match_id: sendResult.insertId,
                    status_description: 'block_chat_receive',
                    created_date: new Date(),
                    updated_date: new Date()
                }
                connection.query('INSERT INTO tbl_match set ? ', [blockReplyData], function (error, receiveResult) {
                    if (error) {
                        return connection.rollback(function () {
                            connection.release();
                            return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                        });
                    };
                    connection.query("UPDATE tbl_match SET mutual_match_id = ? WHERE main_user_id = ? and other_user_id=? and status=8", [receiveResult.insertId, userId, otherId], function (error, results, fields) {
                        if (error) {
                            return connection.rollback(function () {
                                connection.release();
                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                            });
                        };
                        connection.query("SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND publish=?", [userId, otherId, 1], function (error, results, fields) {
                            if (error) {
                                return connection.rollback(function () {
                                    connection.release();
                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                });
                            };
                            if (!results.length) {
                                connection.release();
                                return res.status(400).send({ error: true, message: 'Match data cannot be found.' });
                            }
                            var matchId = results[0].id;
                            connection.query("UPDATE tbl_match SET publish=0 WHERE id=?", [matchId], function (error, results, fields) {
                                if (error) {
                                    return connection.rollback(function () {
                                        connection.release();
                                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                    });
                                }
                                connection.query("SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND publish=?", [otherId, userId, 1], function (error, results, fields) {
                                    if (error) {
                                        return connection.rollback(function () {
                                            connection.release();
                                            return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                        });
                                    }
                                    if (!results.length) {
                                        connection.release();
                                        return res.status(400).send({ error: true, message: 'Match data cannot be found.' });
                                    }
                                    var otherMatchId = results[0].id
                                    connection.query("UPDATE tbl_match SET publish=0 WHERE id=?", [otherMatchId], function (error, results, fields) {
                                        if (error) {
                                            return connection.rollback(function () {
                                                connection.release();
                                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                            });
                                        }
                                        connection.commit(function (error) {
                                            if (error) {
                                                return connection.rollback(function () {
                                                    connection.release();
                                                    return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                                                });
                                            };
                                            connection.release();
                                            return res.send({ error: false, data: { sendResult, receiveResult }, message: "New Block Created" });
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    }).catch(err => {
        return res.status(400).send({ error: true, detail: err.code, message: err.sqlMessage || err.message });
    });
});

//Milestone 2 APIs
chatApi.get('/getChatAIImageUrl/:userId', checkAuth, function (req, res) {
    var userId = req.params.userId;

    if (!userId)
        return res.send({ error: true, message: 'Invalid User Param.' });

    var whereCondition = 'user_id=?';

    dbConn.query('Select * from tbl_image_url where ' + whereCondition + ' order by id asc', [userId], function (error, results, fields) {
        if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
        if (!results.length) return res.status(403).send({ error: false, message: 'Image Data not found' });
        return res.send({ error: false, data: results, message: "Get All Image Data" });
    });
});

chatApi.post('/getChatAIImageUrlId/:userId', checkAuth, function (req, res) {
    var userId = req.userData.userId;
    var ai_user_id = req.body.user_sent;
    var real_user_id = req.body.user_received;

    if (!ai_user_id || !real_user_id)
        return res.send({ error: true, message: 'Invalid User Param.' });

    var whereCondition = 'ai_user_id=? and real_user_id=?';

    dbConn.query('Select image_id, chat_id from tbl_image_history where ' + whereCondition + ' order by id DESC LIMIT 1', [ai_user_id, real_user_id], function (error, results, fields) {
        if (error) return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
        if (!results.length) return res.status(403).send({ error: false, message: 'Image Data not found', content: '' });
        return res.send({ error: false, data: results, message: "Get All Image Data" });
    });
});

chatApi.post('/chatHistoryUpdates', checkAuth, function (req, res) {
    var ai_user_id = req.body.ai_user_id;
    var ai_user_name = req.body.ai_user_name;
    var real_user_id = req.body.real_user_id;
    var real_user_name = req.body.real_user_name;
    var chat_id = req.body.chat_id;
    var image_id = req.body.image_id;

    if (!ai_user_id || !ai_user_name || !real_user_id || !real_user_name || !chat_id || !image_id) {
        return res.status(400).send({ error: true, message: 'Required params missing' });
    }

    var chatHistoryData = {
        ai_user_id: ai_user_id,
        ai_user_name: ai_user_name,
        real_user_id: real_user_id,
        real_user_name: real_user_name,
        chat_id: chat_id,
        image_id: image_id,
    };

    dbConn.getConnection().then(connection => {
        connection.beginTransaction(function (error) {
            if (error) {
                connection.release();
                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
            }

            connection.query('INSERT INTO tbl_image_history set ? ', [chatHistoryData], function (error, sendResult) {
                if (error) {
                    return connection.rollback(function () {
                        connection.release();
                        return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                    });
                }

                connection.commit(function (err) {
                    if (err) {
                        return connection.rollback(function () {
                            connection.release();
                            return res.status(400).send({ error: true, detail: err.code, message: err.sqlMessage });
                        });
                    }
                    connection.release();
                    return res.send({ error: false, data: sendResult[0], message: "Chat history recorded" });
                });
            });
        });
    }).catch(err => {
        return res.status(400).send({ error: true, detail: err.code, message: err.sqlMessage || err.message });
    });
});

chatApi.post('/chatHistoryUpdate', checkAuth, (req, res) => {
    const { ai_user_id, ai_user_name, real_user_id, real_user_name, chat_id, image_id, user_current_action } = req.body;

    if (!ai_user_id || !ai_user_name || !real_user_id || !real_user_name || !chat_id || !image_id) {
        return res.status(400).send({ error: true, message: 'Required params missing' });
    }

    const chatHistoryData = {
        ai_user_id,
        ai_user_name,
        real_user_id,
        real_user_name,
        chat_id,
        image_id,
        user_current_action,
    };

    dbConn.getConnection().then(connection => {
        connection.beginTransaction(function (error) {
            if (error) {
                connection.release();
                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
            }

            connection.query('INSERT INTO tbl_image_history SET ?', chatHistoryData, (error, sendResult) => {
                if (error) {
                    return connection.rollback(() => {
                        connection.release();
                        res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                    });
                }

                connection.commit(err => {
                    if (err) {
                        return connection.rollback(() => {
                            connection.release();
                            res.status(400).send({ error: true, detail: err.code, message: err.sqlMessage });
                        });
                    }
                    connection.release();
                    res.send({ error: false, data: sendResult[0], message: "Chat history recorded" });
                });
            });
        });
    }).catch(err => {
        return res.status(400).send({ error: true, detail: err.code, message: err.sqlMessage || err.message });
    });
});

module.exports = chatApi;

