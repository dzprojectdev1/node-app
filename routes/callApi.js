var express = require('express');
var callApi = express.Router();
var dbConnect = require('../config/dbConfig');
const checkAuth = require('../middleware/check_auth');
var FCM = require('fcm-node');
const serverKey = process.env.FIREBASE_SERVER_KEY;
const fcm = new FCM(serverKey);

callApi.post('/initiate', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    var userName = req.body.userName;
    var otherId = req.body.otherId;
    var otherUserName = req.body.otherUserName;
    var callType = req.body.callType;

    var initiateCall = {
        from_user: userId,
        from_user_name: userName,
        to_user: otherId,
        to_user_name: otherUserName,
        duration: 0,
        call_type: callType,
        success_type: 0,
        consumed_diamonds: 0,
        created_at: new Date(),
        ended_at: new Date()
    };

    var query = 'select * from tbl_chat where user_sent = ? and user_received = ?';
    dbConnect.query(query, [otherId, userId], function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if (!results || !results.length) return res.send({error: false, data: { call_available: false, call_id: 0 }, message: 'You are not able to call ' + otherUserName + ' now'});

        dbConnect.query('INSERT INTO tbl_call set ? ', [initiateCall], function (error, insertResult) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

            var callId = insertResult.insertId;

            return res.send({error: false, data: { call_available: true, call_id: callId }, message: 'Transactions exist for this user.'});
        })
    })
})

module.exports = callApi;