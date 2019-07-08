var express = require("express");
var videoApi = express.Router();
var dbConn = require("../config/dbConfig");
const checkAuth = require('../middleware/check_auth');

// #8 === insert new video after upload to firebase storage
videoApi.post('/new', checkAuth, function(req,res) {
    let cdn_id = req.body.cdn_id;
    let cdn_id_filtered = req.body.cdn_id_filtered;
    let userId = req.userData.userId;
  
    if (!cdn_id || !cdn_id_filtered) {
        return res.status(400).send({ error:true, message: 'Please provide video url'});
	}

	dbConn.query('SELECT * FROM tbl_video where user_id=?', userId, function (error, results, fields) {
        if (error) throw error;
		if (results.length){
            return res.status(400).send({ error:true, message: 'user video is already taken.' });
        }
		else {
			var newVideoSql = {
                user_id: userId,
                cdn_id: cdn_id,
                created_date: new Date(),
                is_reply: 0,
                is_primary: 1,
                publish: 1,
                match_id: null             
			};

			dbConn.query("INSERT INTO tbl_video SET ? ", newVideoSql, function (error, results, fields) {
                if (error) throw error;
                //update this row with filtered cdn id
                dbConn.query("UPDATE tbl_video SET cdn_filtered_id = ? WHERE user_id = ?", [cdn_id_filtered, userId], function (error, results, fields) {
                    if (error) throw error;
                    return res.send({ error: false, data: results, message: "User's video has been created succssfully."});
                });
			});
		}
    });
});

//#9 === upload reply video
videoApi.post('/reply', checkAuth, function(req, res) {
    let userId = req.userData.userId;
    dbConn.query('SELECT id FROM tbl_match where other_user_id=? AND status=1 AND status_description="heart_sent"', userId, function (error, results, fields) {
        if (error) throw error;
        if (!results.length)
            return res.status(400).send({ error:true, message: 'Match data cannot be found.'});
            var newVideoSql = {
                user_id: userId,
                created_date: new Date(),
                is_reply: 1,
                is_primary: 0,
                match_id: results[0]
            };
        
            dbConn.query("INSERT INTO tbl_video SET ? ", newVideoSql, function (error, results, fields) {
                if (error) throw error;
                return res.send({ error: false, data: results, message: "User's reply video has been created succssfully."});
            });
    });
});

//#10 uc 6 other videos for the users
videoApi.get('/othervideo/:otherId', checkAuth, function(req, res) {
    var user_id = req.params.otherId;
    dbConn.query('SELECT cdn_filtered_id from tbl_video where user_id= ? and is_reply=0 and publish=1 order by created_date desc', [user_id], function (error, results, fields){
        if (error) throw error;
        return res.send({ error: false, data: results, message: "list other videos for the user"});
    });
});

//#25 uc 8.1 matched page return for video ids === UC A
videoApi.post('/getMatchedOtherId', checkAuth, function(req, res) {
    var userId = req.userData.uesrId;
    var otherId = req.body.otherId;

    if (!otherId) {
        return res.status(400).send({ error:true, message: 'Other User Id not found' }); 
    }

    var getMatchQuery = 'select id from tbl_match where main_user_id=? and other_user_id=? and status=1 and publish=1 limit 1';

    var whereCondition = 'a.user_id=? And a.is_reply=1 and a.is_primary=0 and a.publish=1 And a.match_id=('+getMatchQuery+')';
    dbConn.query('Select a.cdn_id from tbl_video a inner join tbl_match b On a.match_id=b.id where '  + whereCondition, [otherId, userId, otherId], function(error, results, fields) {
        if (error) throw error;
        return res.send({ error: false, data: results, message: "Matched others video Id"});
    });
});

//#26 uc 8.1 === UC B
videoApi.get('/getMatchedMyVideo', checkAuth, function(req, res) {
    var userId = req.userData.userId;

    var whereCondition = 'user_id=? and is_primary=1 and is_reply=0 and publish=1 limit 1';
    dbConn.query('Select cdn_id from tbl_video where ' + whereCondition, [userId], function(error, results, fields) {
        if (error) throw error;
        return res.send({ error: false, data: results, message: "Matched my video Id"});
    });
});

//#27 uc 8.1 === UC C
videoApi.post('/getVideoForOther', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    var otherId = req.body.otherId;
    
    var getMatchQuery = 'select id from tbl_match where main_user_id=? and other_user_id=? and status=1 and publish=1 limit 1';
    var whereCondition = ' a.user_id=? And a.is_reply=1 and a.is_primary=0 and a.publish=1 And a.match_id=('+getMatchQuery+')';
    dbConn.query('Select a.cdn_id from tbl_video a inner join tbl_match b On a.match_id=b.id Where ' + whereCondition, [userId, userId, otherId], function(error, results, fields) {
        if (error) throw error;
        return res.send({ error: false, data: results, message: "Get video for Other"});
    })
});

//#28 uc8.1 === UC D
videoApi.post('/getVideoForMe', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    var otherId = req.body.otherId;
    
    var whereCondition = 'user_id=? and is_primary=1 and is_reply=0 and publish=1 limit 1';
    dbConn.query('Select cdn_id from tbl_video where ' + whereCondition, [otherId], function(error, results, fields) {
        if (error) throw error;
        return res.send({ error: false, data: results, message: "Get video for Me"});
    })
});


//#34 UC12.1 - My Video Page - display my videos
videoApi.get('/getMyAllVideo', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    dbConn.query('SELECT * FROM tbl_video WHERE publish=? AND is_reply=? AND user_id=?', [1, 0, userId], function(error, results, fields) {
        if (error) throw error;
        return res.send({error: false, data: results, message: 'user non-reply video list'});
    });
});

module.exports = videoApi;