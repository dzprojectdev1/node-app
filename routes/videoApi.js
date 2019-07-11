var express = require("express");
var videoApi = express.Router();
var dbConn = require("../config/dbConfig");
const checkAuth = require('../middleware/check_auth');

// #8 === insert new video after upload to firebase storage
videoApi.post('/new', checkAuth, function(req,res,next) {
    let cdn_id = req.body.cdn_id;
    let userId = req.userData.userId;
  
    if (!cdn_id) {
        return res.status(400).send({ error:true, message: 'Please provide video id'});
    }

	dbConn.query('SELECT * FROM tbl_video where user_id=?', userId, function (error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
		if (results.length)
            return res.status(400).send({ error:true, message: 'user video is already taken.' });
        		
        var newVideoSql = {
            user_id: userId,
            cdn_id: cdn_id,
            created_date: new Date(),
            updated_date: new Date(),
            is_reply: 0,
            is_primary: 1,
            publish: 1,
            match_id: null             
        };
        dbConn.query("INSERT INTO tbl_video SET ? ", newVideoSql, function (error, results, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
            //update this row with filtered cdn id
            return res.send({ error: false, data: results, message: "User's video has been created succssfully."});               
        });
    });
});

//video update after uploaded
videoApi.put('/update/:cdn_id', checkAuth, function(req, res) {
    var userId = req.userData.userId;

    var cdnId = req.params.cdn_id;
    if (!cdnId)
        return res.status(400).send({error: true, message: 'Please provide video id'});

    var cdnFilteredId = req.body.cdn_filtered_id;
    if (!cdnFilteredId) 
        return res.status(400).send({error: true, message: 'Please provide video filtered Id'});
    
    dbConn.query('SELECT * FROM tbl_video WHERE user_id=? AND cdn_id=?', [userId, cdnId], function(error1, cdnResult, fields) {
        if (error1) return res.status(400).send({error: true, detail: error1.code, message: error1.sqlMessage});
        if (!cdnResult.length) return res.send({error: false, message: 'Video Not Found.'});
        var videoId = cdnResult[0].id;
        var updateData = {
            cdn_filtered_id: cdnFilteredId,
            updated_date: new Date()
        };
        dbConn.beginTransaction(function(err){
            if (err) return res.status(400).send({error: true, message: err});
            dbConn.query('UPDATE tbl_video SET ? WHERE id=?', [updateData, videoId], function(error2, updateResult, fields) {
                if (error2) {
                    dbConn.rollback(function(){
                        return res.status(400).send({error: true, detail: error2.code, message: error2.sqlMessage});
                    });
                }
                dbConn.query("SELECT * FROM tbl_video WHERE id=?", videoId, function (error3, filteredResult, fields) {
                    if (error3) {
                        dbConn.rollback(function() {
                            return res.status(400).send({error: true, detail: error3.code, message: error3.sqlMessage});
                        });
                    };
                    dbConn.commit(function(error4) {
                        if (error4) {
                            dbConn.rollback(function() {
                                return res.status(400).send({error: true, detail: error4.code, message: error4.sqlMessage});
                            });
                        };
                        return res.send({ error: false, data: filteredResult, message: "User's Video was updated."});
                    });
                });  
            });             
        });
    });
});

//#9 === upload reply video
videoApi.post('/reply', checkAuth, function(req, res) {
    let userId = req.userData.userId;
    dbConn.query('SELECT id FROM tbl_match where other_user_id=? AND status=1 AND status_description="heart_sent"', userId, function (error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        
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
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
            return res.send({ error: false, data: results, message: "User's reply video has been created succssfully."});
        });
    });
});

//#10 uc 6 other videos for the users
videoApi.get('/othervideo/:otherId', checkAuth, function(req, res) {
    var user_id = req.params.otherId;
    dbConn.query('SELECT cdn_filtered_id from tbl_video where user_id= ? and is_reply=0 and publish=1 order by created_date desc', [user_id], function (error, results, fields){
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({ error: false, data: results, message: "list other videos for the user"});
    });
});

//#25 uc 8.1 matched page return for video ids === UC A
videoApi.post('/getMatchedVideo', checkAuth, function(req, res) {
    var userId = req.userData.uesrId;
    var otherId = req.body.otherId;

    if (!otherId) {
        return res.status(400).send({ error:true, message: 'Other User Id not found' }); 
    }

    var getMatchQuery = 'select id from tbl_match where main_user_id=? and other_user_id=? and status=1 and publish=1 limit 1';

    var whereCondition = 'a.user_id=? And a.is_reply=1 and a.is_primary=0 and a.publish=1 And a.match_id=('+getMatchQuery+')';
    dbConn.query('Select a.cdn_id from tbl_video a inner join tbl_match b On a.match_id=b.id where '  + whereCondition, [otherId, userId, otherId], function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({ error: false, data: results, message: "Matched others video Id"});
    });
});

//#26 uc 8.1 === UC B
videoApi.get('/getMatchedMyVideo', checkAuth, function(req, res) {
    var userId = req.userData.userId;

    var whereCondition = 'user_id=? and is_primary=1 and is_reply=0 and publish=1 limit 1';
    dbConn.query('Select cdn_id from tbl_video where ' + whereCondition, [userId], function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
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
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({ error: false, data: results, message: "Get video for Other"});
    })
});

//#28 uc8.1 === UC D
videoApi.post('/getVideoForMe', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    var otherId = req.body.otherId;
    
    var whereCondition = 'user_id=? and is_primary=1 and is_reply=0 and publish=1 limit 1';
    dbConn.query('Select cdn_id from tbl_video where ' + whereCondition, [otherId], function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({ error: false, data: results, message: "Get video for Me"});
    })
});


//#34 UC12.1 - My Video Page - display my videos
videoApi.get('/getMyAllVideo', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    dbConn.query('SELECT * FROM tbl_video WHERE publish=? AND is_reply=? AND user_id=?', [1, 0, userId], function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({error: false, data: results, message: 'user non-reply video list'});
    });
});

//#35 UC 12.2 - My Video Page - set as primary video
videoApi.post('/setAsPrimary', checkAuth, function(req, res) {
    var videoId = req.body.videoId;
    
    if (!videoId) 
        return res.status(400).send({error: true, message: 'Wrong video id parameter'});

    dbConn.query('SELECT * FROM tbl_video WHERE id=?', [videoId], function(err, oldResults, fields) {
        if (err) return res.status(400).send({error: true, detail: err.code, message: err.sqlMessage});
        if (!oldResults.length)
            return res.status(400).send({error: true, message: 'Video Not Found'});

        var whereCondition = 'id=?';
        dbConn.query('UPDATE tbl_video SET is_primary=1 WHERE ' + whereCondition, [videoId], function(error, results, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
            return res.send({error: false, data: results.insertId, message: 'User`s video has been as primary video'}); 
        });
    });
});

// #36 UC12.2 - My Video Page - upload my videos
videoApi.post('/uploadMyVideo', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    var cdnId = req.body.cdn_id;
    var cdnFilteredId = req.body.cdn_filtered_id;
    var durationSecond = req.body.duration;

    if (!cdnId || !cdnFilteredId || !durationSecond)
        return res.status(400).send({error: true, message: 'Invalid Params.'});

    var newVideoData = {
        user_id: userId,
        cdn_id: cdnId,
        cdn_filtered_id: cdnFilteredId,
        duration_seconds: durationSecond,
        is_primary: 0,
        is_reply: 0,
        publish: 1,
        created_date: new Date(),
        updated_date: new Date()
    };
    dbConn.query('INSERT INTO tbl_video SET ? ', newVideoData, function(error, newResults) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({error: false, data: newResults.insertId, message: 'Video was uploaded successfully.'});  
    });
});

// #37 UC12.3 - My Page - delete my videos
videoApi.post('/removeMyVideo', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    
    dbConn.query('SELECT * FROM tbl_video WHERE user_id=? AND publish=1', userId, function(error1, oldResults) {
        if (error1) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if (!oldResults.length) return res.send({error: false, message: 'Video Not Found.'});
        var videoId = oldResults[0].id;
        dbConn.query('UPDATE tbl_video SET publish=0 WHERE id=? ', videoId, function(error2, newResult) {
            if (error2) return res.status(400).send({error: true, detail: error2.code, message: error2.sqlMessage});
            return res.send({error: false, message: 'Video was removed successfully.'});   
        });
    });
});

module.exports = videoApi;