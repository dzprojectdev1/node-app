var express = require('express');
var fanApi = express.Router();
var dbConnect = require('../config/dbConfig');
const checkAuth = require('../middleware/check_auth');
var FCM = require('fcm-node');
const serverKey = process.env.FIREBASE_SERVER_KEY;
const fcm = new FCM(serverKey);


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

module.exports = transactionApi;