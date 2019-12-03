var express = require('express');
var transactionApi = express.Router();
var dbConnect = require('../config/dbConfig');
const checkAuth = require('../middleware/check_auth');
var FCM = require('fcm-node');
const serverKey = process.env.FIREBASE_SERVER_KEY;
const fcm = new FCM(serverKey);

var counter = 0;

/**
 * return transaction lists for selected user
 * table_name: tbl_transaction
 */
transactionApi.get('/user/:user_id', function(req, res) {

    var user_id = req.params.user_id;

    dbConnect.query('select * from tbl_transaction where user_id = ?', user_id, function(error, results, fields) {

        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if (!results || !results.length) return res.send({error: false, message: 'There is no transaction for this user yet.'});

        return res.send({error: false, data: results, message: 'Transactions exist for this user.'});
    })
})

/**
 * add coin / amount on tbl_transaction
 * update coin_count on tbl_user
 */
transactionApi.post('/putCoin', function(req, res) {

    let user_id     = req.body.user_id;
    let coin_number = req.body.coin_number;
    let coin_price  = req.body.coin_price;
    let currency    = req.body.currency;

    let package_name      = req.body.package_name;
    let acknowledge       = req.body.acknowledge;
    let order_id          = req.body.order_id;
    let product_id        = req.body.product_id;
    let developer_payload = req.body.developer_payload;
    let purchase_time     = req.body.purchase_time;
    let purchase_state    = req.body.purchase_state;
    let purchase_token    = req.body.purchase_token;
    let dist              = req.body.dist;
    let days              = req.body.days;

    let current_date = new Date();
    let cd_timestamp = current_date.getTime();
    cd_timestamp     = Math.round(cd_timestamp / 1000);

    dbConnect.query('select * from tbl_user where id = ?', user_id, function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error, message: error.sqlMessage});
        if (!results || !results.length) return res.send({error: false, message: 'There is no registered user with the user_id.'});

        var coin_count = results[0].coin_count;
        coin_count = coin_count + parseInt(coin_number);

        let query = 'insert into tbl_transaction';
        query += ' (user_id, coin, amount, currency, package_name, acknowledge, order_id, product_id, developer_payload, purchase_time, purchase_state, purchase_token, dist, days, created_at)';
        query += ' values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
            
        dbConnect.query(query, [user_id, coin_number, coin_price, currency, package_name, acknowledge, order_id, product_id, developer_payload, purchase_time, purchase_state, purchase_token, dist, days, new Date()], function(error, insertResult, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

            dbConnect.query('update tbl_user set coin_count = ? where id = ?', [coin_count, user_id], function(error, row, fields) {
                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

                if (dist == 'pass') {
                    
                    dbConnect.query('select * from tbl_pass_transaction where user_id = ? order by created_at desc', user_id, function(error, transactionResults, fields) {
                        if (error) return res.status(400).send({error: true, detail: error, message: error.sqlMessage});
                        if (!transactionResults || !transactionResults.length || transactionResults.length == 0) {
                            
                            dbConnect.query('insert into tbl_pass_transaction (user_id, days, created_at) values (?, ?, ?)', [user_id, days, new Date()], function(error, insertResult, fields) {
                                if (error) return res.status(400).send({error: true, detail: error, message: error.sqlMessage});

                                let days_timestamp      = days * 24 * 60 * 60;
            
                                let result_data = {
                                    validation: true,
                                    remain_timestamp: days_timestamp,
                                    coin_count: coin_count,
                                }
                                
                                return res.send({error: false, data: result_data, message: ' You have ' + days + ' days for unlimited instant chat.'})
                            })
                        } else {

                            let pass_transaction_id = transactionResults[0].id;
                            let saved_date          = transactionResults[0].created_at;
                            let saved_days          = transactionResults[0].days;

                            let sd_timestamp = new Date(saved_date).getTime();
                            sd_timestamp     = Math.round(sd_timestamp / 1000);

                            let days_timestamp = saved_days * 24 * 60 * 60;
                            let _timestamp     = cd_timestamp - sd_timestamp;

                            if (_timestamp < days_timestamp) {

                                let save_days = parseInt(days) + parseInt(saved_days);

                                dbConnect.query('update tbl_pass_transaction set days = ? where id = ?', [save_days, pass_transaction_id], function(error, updateResults, fields) {
                                    if (error) return res.status(400).send({error: true, detail: error, message: error.sqlMessage});

                                    days_timestamp = save_days * 24 * 60 * 60;

                                    let send_date_timestamp = days_timestamp - _timestamp;
                                    let result_data = {
                                        validation: true,
                                        remain_timestamp: send_date_timestamp,
                                        coin_count: coin_count,
                                    }
                                    return res.send({error: false, data: result_data, message: ' You added ' + days + ' days for unlimited instant chat.'})
                                })
                            } else {

                                dbConnect.query('insert into tbl_pass_transaction (user_id, days, created_at) values (?, ?, ?)', [user_id, days, new Date()], function(error, insertResult, fields) {
                                    if (error) return res.status(400).send({error: true, detail: error, message: error.sqlMessage});
    
                                    let days_timestamp      = days * 24 * 60 * 60;
                
                                    let result_data = {
                                        validation: true,
                                        remain_timestamp: days_timestamp,
                                        coin_count: coin_count,
                                    }
                                    
                                    return res.send({error: false, data: result_data, message: ' You have ' + days + ' days for unlimited instant chat.'})
                                })
                            }
                        }
                    })
                } else {
                    return res.send({error: false, data: {validation: false, coin_count: coin_count}, message: 'Successfully added coins.'});
                }
            })
        })
    })
})

/**
 * upate coin / amount on tbl_transaction
 * update coin_count on tbl_user
 */
transactionApi.put('/:id', function(req, res) {
    let id = req.params.id;
    let coin_number = req.body.coin_number;
    let coin_price = req.body.coin_price;

    dbConnect.query('select t.coin coin, u.coin_count coin_count, t.user_id user_id from tbl_transaction t inner join tbl_user u on t.user_id = u.id where t.id = ?', id, function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if(!results || !results.length) return res.send({error: false, message: 'There is no matched transaction with the id.'});

        let user_id = results[0].user_id;
        let coin = results[0].coin;
        let coin_count = results[0].coin_count;

        let diff_coin = coin - coin_number;
        coin_count = coin_count - diff_coin;

        dbConnect.query('update tbl_transaction set coin = ?, amount = ? where id = ?', [coin_number, coin_price, id], function(error, row, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

            dbConnect.query('update tbl_user set coin_count = ? where id = ?', [coin_count, user_id], function(error, row, fields) {
                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

                var result_data = {
                    id: id,
                    coin_number: coin_number,
                    coin_price: coin_price
                }
                return res.send({error: false, data: result_data, message: 'Updated successfully.'});
            })
        })

    })
})

/**
 * delete a transaction from tbl_transaction
 * update coin_count on tbl_user
 */
transactionApi.delete('/:id', function(req, res) {
    let id = req.params.id;

    dbConnect.query('select t.coin coin, u.coin_count coin_count, t.user_id user_id from tbl_transaction t inner join tbl_user u on t.user_id = u.id where t.id = ?', id, function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if(!results || !results.length) return res.send({error: false, message: 'There is no matched transaction with the id.'});

        let user_id = results[0].user_id;
        let coin = results[0].coin;
        let coin_count = results[0].coin_count;
        
        coin_count = coin_count - coin;

        dbConnect.query('delete from tbl_transaction where id = ?', id, function(error, row, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

            dbConnect.query('update tbl_user set coin_count = ? where id = ?', [coin_count, user_id], function(error, row, fields) {
                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

                return res.send({error: false, message: 'Deleted successfully.'});
            })
        })

    })
})

/**
 * get status with txn_id
 */
transactionApi.get('/txn_id/:txn_id', function(req, res) {
    let txn_id = req.params.txn_id;

    dbConnect.query('select * from tbl_transaction where txn_id = ?', txn_id, function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if(!results || !results.length) return res.send({error: false, message: 'There is no matched transaction with the txn_id.'});

        let status = results[0].status;

        return res.send({error: false, status: status, message: 'Found successfully.'});
    })
})

/**
 * update status with txn_id
 */
transactionApi.put('/txn_id/:txn_id', function(req, res) {
    let txn_id = req.params.txn_id;
    let status = req.body.status;

    dbConnect.query('select * from tbl_transaction where txn_id = ?', txn_id, function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if(!results || !results.length) return res.send({error: false, message: 'There is no matched transaction with the txn_id.'});

        dbConnect.query('update tbl_transaction set status = ? where txn_id =?', [status, txn_id], function(error, row, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

            return res.send({error: false, txn_id: txn_id, message: 'Updated successfully.'});
        })
    })
})

/**
 * remove gem count with user_id
 */
transactionApi.post('/gemRemove/:user_id', function(req, res) {
    let user_id = req.params.user_id;

    let query = 'select * from tbl_user where id = ?';
    dbConnect.query(query, user_id, function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if(!results || !results.length) return res.send({error: false, message: 'There is no matched user.'});

        let coin_count = results[0].coin_count;

        if (coin_count > 0) {
            coin_count = coin_count - 1;

            query = 'update tbl_user set coin_count = ? where id = ?';
            dbConnect.query(query, [coin_count, user_id], function(error, row, fields) {
                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

                return res.send({error: false, coin_count: coin_count, message: 'Successfully removed coin.'});
            })
        } else {
            return res.send({error: false, coin_count: -1, message: 'You need 1 diamond to send a heart.'});
        }
    })
})

/**
 * get free diamonds daily with user_id
 */
transactionApi.post('/freeDiamonds/:user_id', checkAuth, function(req, res) {
    let user_id = req.params.user_id;
    let current_date = new Date();
    let cd_timestamp = current_date.getTime();

    cd_timestamp = Math.round(cd_timestamp / 1000);

    let query = 'select * from tbl_user where id = ?';
    dbConnect.query(query, user_id, function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if(!results || !results.length) return res.send({error: false, message: 'There is no matched user.'});

        let coin_count = results[0].coin_count;

        query = 'select * from tbl_free_diamonds where user_id = ? order by date desc';
        dbConnect.query(query, user_id, function(error, results, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
            if(!results || !results.length) {

                query = 'insert into tbl_free_diamonds (user_id, date) values (?, ?)';
                dbConnect.query(query, [user_id, current_date], function(error, results, fields) {
                    if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

                    coin_count = coin_count + 30;

                    let result_data = {
                        success: true,
                        hours: 0,
                        minutes: 0,
                        seconds: 0,
                        coin_count: coin_count
                    }

                    query = 'update tbl_user set coin_count = ? where id = ?';
                    dbConnect.query(query, [coin_count, user_id], function(error, results, fields) {
                        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

                        return res.send({error: false, data: result_data, message: 'Free diamonds are added successfully.'});
                    })
                })
            } else {

                let saved_date = results[0].date;
                let sd_timestamp = new Date(saved_date).getTime();

                sd_timestamp = Math.round(sd_timestamp / 1000);

                let one_day_timestamp = 24 * 60 * 60;

                let _timestamp = cd_timestamp - sd_timestamp;

                if (_timestamp < one_day_timestamp) {

                    let send_date_timestamp = one_day_timestamp - _timestamp;

                    let hours = Math.floor(send_date_timestamp / 3600);
                    let minutes = Math.floor((send_date_timestamp - (hours * 3600)) / 60);
                    let seconds = send_date_timestamp - (hours * 3600) - (minutes * 60);

                    let result_data = {
                        success: false,
                        hours: hours,
                        minutes: minutes,
                        seconds: seconds,
                        coin_count: coin_count
                    }
                    return res.send({error: false, data: result_data, message: 'You have already claimed your diamonds for the day. Next 50 diamonds will unlock in: '})
                } else {                    

                    query = 'insert into tbl_free_diamonds (user_id, date) values (?, ?)';
                    dbConnect.query(query, [user_id, current_date], function(error, results, fields) {
                        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

                        coin_count = coin_count + 90;

                        let result_data = {
                            success: true,
                            hours: 0,
                            minutes: 0,
                            seconds: 0,
                            coin_count: coin_count
                        }

                        query = 'update tbl_user set coin_count = ? where id = ?';
                        dbConnect.query(query, [coin_count, user_id], function(error, results, fields) {
                            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
    
                            return res.send({error: false, data: result_data, message: 'Free diamonds are added successfully.'});
                        })
                    })
                }
            }
        })
    })

})

transactionApi.post('/pushNotification', function(req, res) {

    var senderId = req.body.senderId;
    var messageText = req.body.messageText;
    var senderName = req.body.userName;
    var firstUserId = req.body.firstUserId;
    var lastUserId = req.body.lastUserId;

    if (!firstUserId || !lastUserId) {
        return res.status(400).send({ error: true, message: 'Invalid Params. firstUserId, lastUserId params are required.' });
    }

    var num_user = 0;
    var message_sent = 0;

    var total_user = 0;
    var i = 0;

    var query = 'select fcm_id from tbl_user where account_status = 1 and id >= ? and id <= ?';
    dbConnect.query(query, [firstUserId, lastUserId], function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

        if(!results || !results.length) return res.send({error: false, message: 'There is no user.'});

        total_user = results.length;

        console.log(total_user);

        results.map(item => {
            i ++;
            var message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
                to: item.fcm_id,
                notification: {
                    title: 'New Notification',
                    body: messageText,
                },
                data: {  //you can send only notification or only data(or include both)
                    type: 'PushNotification',
                    senderId: senderId,
                    senderImg: '',
                    senderName: senderName
                }
            };
            fcm.send(message, function (notiErr, notiRes) {
                if (notiErr) {
                } else {
                    num_user = parseInt(num_user) + 1;
                }
            });

            counter ++;

            console.log('counter_push_notification' + counter);
        });

        if (total_user > 0) {
            message_sent = 1;
        }

        query = "insert into tbl_message (message, message_sent, num_user, created_date) values (?, ?, ?, ?)";
        dbConnect.query(query, [messageText, message_sent, total_user, new Date()], function(error, results, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
            
            counter = 0;
            return res.send({ error: false, message: "New push notification sent " + total_user + " users." });
        })
    })
})

/**
 * get validation time with user id for unlimited instant chat (1_day_pass, 3_day_pass, 7_day_pass)
 */
transactionApi.post('/validatePass/:user_id', checkAuth, function(req, res) {
    var user_id = req.params.user_id;

    let current_date = new Date();
    let cd_timestamp = current_date.getTime();
    cd_timestamp     = Math.round(cd_timestamp / 1000);

    let query = 'select * from tbl_user where id = ?';
    dbConnect.query(query, user_id, function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if(!results || !results.length) return res.send({error: false, message: 'There is no matched user.'});

        var coin_count = results[0].coin_count;

        query = "select * from tbl_pass_transaction where user_id = ? order by created_at desc";
        dbConnect.query(query, user_id, function(error, transactionResults, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
            if(!transactionResults || !transactionResults.length) return res.send({error: false, data: {validation: false}, message: 'There is no unlimited pass day.'});

            let saved_date = transactionResults[0].created_at;
            let days       = transactionResults[0].days;

            let sd_timestamp = new Date(saved_date).getTime();
            sd_timestamp     = Math.round(sd_timestamp / 1000);

            let days_timestamp = days * 24 * 60 * 60;
            let _timestamp     = cd_timestamp - sd_timestamp;

            if (_timestamp < days_timestamp) {

                let send_date_timestamp = days_timestamp - _timestamp;
                let result_data = {
                    validation: true,
                    remain_timestamp: send_date_timestamp,
                    coin_count: coin_count,
                }
                return res.send({error: false, data: result_data, message: 'You have pass days.'})
            } else {
                return res.send({error: false, data: { validation: false, coin_count: coin_count, }, message: 'Your unlimited feature was expired.'})
            }

        })
    })
})

transactionApi.post('/sendDiamonds', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    var userName = req.body.userName;
    var otherId = req.body.otherId;
    var otherUserName = req.body.otherUserName;
    var amount = req.body.amount;
    var fanMessage = req.body.fanMessage;

    var query = 'select * from tbl_user where id = ?';
    dbConnect.query(query, [userId], function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if(!results || !results.length) return res.send({error: false, message: 'There is no matched user.'});

        var user_coin_count = results[0].coin_count;
        var user_fcm_id = results[0].fcm_id;
        if (user_coin_count < amount) {
            return res.send({error: false, coin_count: user_coin_count, message: 'There is no enough diamond.'});
        }

        var user_new_coin_count = parseInt(user_coin_count) - parseInt(amount);

        dbConnect.query(query, [otherId], function(error, otherResults, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
            if(!results || !results.length) return res.send({error: false, message: 'There is no matched user.'});

            var other_coin_count = otherResults[0].coin_count;
            var other_fcm_id = otherResults[0].fcm_id;

            var other_new_coin_count = parseInt(other_coin_count) + parseInt(amount);

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

                    dbConnect.query('update tbl_user set coin_count = ? where id = ? ', [user_new_coin_count, userId], function (error, sendResult) {
                        if (error) {
                            dbConnect.rollback(function () {
                                return res.status(400).send({ error: true, detail: error.code, message: error.sqlMessage });
                            });
                        }

                        dbConnect.query('update tbl_user set coin_count = ? where id = ? ', [other_new_coin_count, otherId], function (error, receiveResult) {
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
                                return res.send({ error: false, coin_count: user_new_coin_count, message: "Diamonds sent." });
                            });
                        });
                    });
                });
            });
        })
    })
})

transactionApi.post('/getDiamondCount', checkAuth, function(req, res) {
    var userId = req.userData.userId;

    var query = 'select * from tbl_user where id = ?';
    dbConnect.query(query, [userId], function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if(!results || !results.length) return res.send({error: false, message: 'There is no matched user.'});

        var coin_count = results[0].coin_count;
        var fan_count = results[0].fan_count;

        var responseData = {
            coin_count: coin_count,
            fan_count: fan_count,
        }
        return res.send({ error: false, data: responseData, message: "Got diamonds count." });
    })
})

module.exports = transactionApi;