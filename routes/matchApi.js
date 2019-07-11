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
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({ error: false, data: results.insertId, message: 'New match has been created.' });
    });
});

// #12 === main user “hearts” other user’s video ===
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
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
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
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
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
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if (!req.body.otherId) {
            return res.status(400).send({ error:true, message: 'Please provide other user id' });
        }  
    
        var blockData = {
            main_user_id: req.userData.otherId,
            other_user_id: req.body.userId,
            status: 9,
            status_description: "block_received",
            publish: 1,
            created_date: new Date(),
            updated_date: new Date()
        };
    
        dbConn.query("INSERT INTO tbl_match SET ? ", blockData, function(error, results, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
            return res.send({error: false, data: results, message: 'Block Created.'})
        });
    });
});

// //#15 uc4.3 === user block receive event
// matchApi.post('/blockreply', checkAuth, function(req, res) {

//     if (!req.body.otherId) {
// 		return res.status(400).send({ error:true, message: 'Please provide other user id' });
//     }  

//     var blockData = {
//         main_user_id: req.userData.userId,
//         other_user_id: req.body.otherId,
//         status: 9,
//         status_description: "block_received",
//         publish: 1,
//         created_date: new Date(),
//         updated_date: new Date()
//     };

//     dbConn.query("INSERT INTO tbl_match SET ? ", blockData, function(error, results, fields) {
//         if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
//         return res.send({error: false, data: results, message: 'block received.'})
//     });
// });


//#16 uc7.1 display incoming hearts
matchApi.get('/getReceivedHearts', checkAuth, function(req, res) {
    var userId = req.userData.userId;

    let whereCondition= 'A.status = 2 AND A.main_user_id=? AND B.is_reply=1 AND B.publish=1 AND B.is_primary=0';
    
    dbConn.query('SELECT * FROM tbl_match AS A INNER JOIN tbl_video AS B on A.id = B.match_id WHERE ' + whereCondition, [userId], function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
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
        if (err) return res.status(400).send({error: true, detail: err.code, message: err.sqlMessage});;
        dbConn.query('INSERT INTO tbl_match set ? ', [sendRejectData], function(error, sendResult) {
            if (error) {
                dbConn.rollback(function(){
                    return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                });
            }
            var receiveRejectData = {
                main_user_id: otherUserId,
                other_user_id: userId,
                status: 5,
                status_description: 'sent_heart_rejected',
                created_date: new Date(),
                updated_date: new Date()
            }
            dbConn.query('INSERT INTO tbl_match set ? ', [receiveRejectData], function(error, receiveResult) {
                if (error) {
                    dbConn.rollback(function() {
                        return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                    });
                };
                var oldMatchWhereCondition = 'a.status=2 and a.main_user_id=? and b.is_primary=0 and b.is_reply=1 and b.publish=1';
                dbConn.query('SELECT * FROM `tbl_match` a inner join tbl_video b on a.id=b.match_id where ' + oldMatchWhereCondition, userId, function(error1, matchResult, fields){
                    if (error1) {
                        dbConn.rollback(function() {
                            return res.status(400).send({error: true, detail: error1.code, message: error1.sqlMessage});
                        });
                    };
                    if (!matchResult.length) return res.send({error: true, message: 'User Video Not Found.'});
                    var matchId = matchResult[0].id;
                    dbConn.query('UPDATE tbl_match SET publish=0 WHERE id=?', matchId, function(error2, updateResult, fields){
                        if (error2) {
                            dbConn.rollback(function() {
                                return res.status(400).send({error: true, detail: error2.code, message: error2.sqlMessage});
                            });
                        }
                        dbConn.commit(function(error) {
                            if (error) {
                                dbConn.rollback(function() {
                                    return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                                });
                            };
                            return res.send({error: false, message: 'Rejected.'});        
                        });
                    });                    
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

    dbConn.query('SELECT * FROM tbl_match WHERE main_user_id=? AND other_user_id=? AND publish=1', [userId, otherUser], function(error, oldMatchResult, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if (oldMatchResult.length)
            return res.status(400).send({error: true, message: 'Match data already exist.'});
        var heartSendData = {
            main_user_id: userId,
            other_user_id: otherUserId,
            status: 6,
            status_description: 'incoming_heart_accepted',
            created_date: new Date(),
            updated_date: new Date()
        };
    
        dbConn.beginTransaction(function(err){
            if (err) return res.status(400).send({error: true, message: err});
            dbConn.query('INSERT INTO tbl_match set ? ', [heartSendData], function(error, sendResult) {
                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
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
                    if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
    
                    dbConn.query("UPDATE tbl_match SET mutual_match_id = ? WHERE main_user_id = ?", [receiveResult.insertId, userId], function (error, results, fields) {
                        if (error) {
                            dbConn.rollback(function() {
                                return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                            });
                        };
                        dbConn.commit(function(error) {
                            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                            return res.send({ error: false, data: {sendResult, receiveResult}, message: "New Match is Created."});
                        });
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
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({ error: false, data: results, message: 'All match data'}); 
    });
});

// UC4.1 - Browse : display one user
matchApi.post('/discover', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    //age, gender, ethnicity, country, distance, language
    var distance = 0;
    var selectQuery = 'a.id, a.birth_date, a.name, e.cdn_filtered_id, ';
    
    var getOtherMatchInfo = 'select other_user_id from tbl_match where main_user_id=?';

    var joinQuery = '';
    if (req.body.ethnicityId) {
        joinQuery += ' INNER JOIN tbl_ethnicity AS b ON a.ethnicity_id=b.id';
        selectQuery += 'b.ethnicity_name, ';
    }
    if (req.body.countryId) {
        joinQuery += ' INNER JOIN tbl_country AS c ON a.country_id=c.id';
        selectQuery += 'c.country_name, ';
    }
    if (req.body.langageId) {
        joinQuery += ' INNER JOIN tbl_language AS d ON a.language_id=d.id';
        selectQuery += 'd.language_name, ';
    }

    joinQuery += ' INNER JOIN tbl_video as e ON a.id=e.user_id';

    var distanceQuery = '(3959 * acos (cos(radians(34.1) ) * cos(radians( a.lat_geo)) * cos(radians(a.long_geo) - radians(-118.06)) + sin (radians(34.1) ) * sin( radians( a.lat_geo ) )))';
    var whereCondition = ' a.account_status=1 AND a.id NOT IN ('+getOtherMatchInfo+') AND e.match_id is null AND e.is_primary=1 AND e.is_reply=0';
    if (req.body.distance) {
        distance = req.body.distance;
        whereCondition += ' AND ('+ distanceQuery+') <' + distance;
    }
    if (req.body.gender) {
        var gender = req.body.gender;
        whereCondition += ' AND a.gender=' + gender;
    }

    var query = 'SELECT ' + selectQuery + distanceQuery + ' as distance FROM tbl_user as a' + joinQuery + ' WHERE ' + whereCondition + ' ORDER BY a.last_loggedin_date asc limit 1';
    
    dbConn.query(query, [userId], function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if (!results.length)
            return res.send({ error:false, data: {}, message: 'Not found.'});
        var otherUser = results[0];
        var otherBirth = otherUser.birth_date;
        var age = 0;
        if (req.body.age) {
            var reqAge = req.body.age;
            if (otherBirth){
                var nowDate = new Date();
                var nowYear = nowDate.getFullYear();
                var otherDate = new Date(otherBirth);
                var otherYear = otherDate.getFullYear();
                var delta = nowYear - otherYear;
                age = delta;
            };
            if (reqAge < age) {
                otherUser.age = age;
            } else {
                return res.send({ error:false, data: {}, message: 'Not found.'});
            }
        }        
        var newMatchData = {
            main_user_id: userId,
            other_user_id: otherUser.id,
            status: 0,
            status_description: 'viewed',
            publish: 1,
            created_date: new Date(),
            updated_date: new Date()
        };
        dbConn.query('INSERT INTO tbl_match SET ? ', [newMatchData], function(error, newMatch, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
            otherUser.match_id = newMatch.insertId;
            return res.send({ error: false, data: otherUser, message: "A New Lovely User found."});
        });
    });
});


module.exports = matchApi;

