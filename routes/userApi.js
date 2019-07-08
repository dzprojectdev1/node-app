var express = require("express");
var userApi = express.Router();
var bcrypt = require("bcrypt");
var dbConn = require("../config/dbConfig");
var jwt = require('jsonwebtoken');
const checkAuth = require('../middleware/check_auth');

// #1 === Retrieve all users 
userApi.get('/all', checkAuth, function (req, res) {
    dbConn.query('SELECT * FROM tbl_user', function (error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({ error: false, data: results, message: 'users list.' });
    });
}); 
 
// #2 === Retrieve user with id 
userApi.get('/one/:id', checkAuth, function (req, res) {
  
    let user_id = req.params.id;
  
    if (!user_id) {
        return res.status(400).send({ error: true, message: 'Please provide user_id' });
    }
  
    dbConn.query('SELECT * FROM tbl_user where id=?', user_id, function (error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({ error: false, data: results[0], message: 'users list.' });
    });
  
});

// #3 === login user
userApi.post('/signup', function (req, res) {
  
	let useremail = req.body.useremail;
	let userpassword = req.body.userpassword;
	let username = req.body.username;
	let usergender = req.body.usergender;
	let userlanguage = req.body.userlanguage;
	let country = req.body.country;
	let ethnicity = req.body.ethnicity;
	let userBirthData = req.body.birth_date;
  
    if (!useremail || !userpassword || !username || !usergender || !userlanguage || !country || !ethnicity || !userBirthData) {
        return res.status(400).send({ error:true, message: 'Please provide user email and pasword' });
	}

	dbConn.query('SELECT * FROM tbl_user where email_address=?', useremail, function (error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
		if (results.length)
            return res.status(400).send({ error:true, message: 'User is already taken.'});
		else {
			var newUserSql = {
				email_address: useremail,
				password: bcrypt.hashSync(userpassword, 10, (err, hash) => {
					return hash;
				}),
				name: username,
				gender: usergender,
				language_id: userlanguage,
				country_id: country,
				ethnicity_id: ethnicity,
				birth_date: userBirthData,
				created_date: new Date()
			};

			dbConn.query("INSERT INTO tbl_user SET ? ", newUserSql, function (error, results, fields) {
				if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
				return res.send({ error: false, data: results.insertId, message: 'New user has been created successfully.' });
			});
		}
    });
});
 
 
// #4 ===  Add a new user  
userApi.post('/login', function (req, res) {
	let useremail = req.body.useremail;
	let userpassword = req.body.userpassword;

	if (!useremail || !userpassword) {
		return res.status(400).send({ error:true, message: 'Please provide user email and password' });
	}
  
	dbConn.query('SELECT * FROM tbl_user where email_address=?', useremail, function (error, results, fields) {
		if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
		if (!results.length)
			res.json({'error': "user not found"});
		if (!bcrypt.compareSync(userpassword, results[0].password))
			return res.status(400).send({ error:true, message: 'Wrong Password' });
		else {
            const token = jwt.sign(
                {
                    email: results[0].email_address,
                    userId: results[0].id
                }, process.env.JWT_KEY,
                {
                    expiresIn: '1h'
                }
            );
            var lastLoggedData = {
                user_id: results[0].id,
                ip_address: req.ip,
                created_date: new Date()
            };
            dbConn.query('INSERT INTO tbl_user_login SET ? ', lastLoggedData, function(error, newResults, fields) {
                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

                dbConn.query('UPDATE tbl_user SET last_loggedin_date=? WHERE id=? ', [new Date(), results[0].id], function(error1, updateResult, fields) {
                    if (error1) return res.status(400).send({error: true, detail: error1.code, message: error1.sqlMessage});

                    return res.send({ error: false, token: token, message: 'User have been logged in successfully.' });
                });
            });
        }
    });
});

userApi.post('/logout', checkAuth, function(req, res) {
    return res.send({ error: false, message: 'User have been logged out successfully.' });
});
 
 
// #5 ===  Update user with id
userApi.put('/update', checkAuth, function (req, res) {
  
    let user_id = req.userData.userId;
    let username = req.body.name;
  
    if (!user_id || !user) {
        return res.status(400).send({ error: username, message: 'Please provide user name'});
    }
  
    dbConn.query("UPDATE tbl_user SET name=? WHERE id=?", [user, user_id], function (error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({ error: false, data: results, message: 'user has been updated successfully.'});
    });
});
 
 
// #6 ===  Delete user
userApi.post('/removeAccount', checkAuth, function (req, res) {  
    let user_id = req.userData.userId;

    dbConn.query('SELECT * FROM tbl_user WHERE id=?', [user_id], function(error1, oldResults, fields) {
        if (error1) return res.status(400).send({error: true, detail: error1.code, message: error1.sqlMessage});

        if (!oldResults.length) return res.send({ error: false, message: 'User not found.'});

        dbConn.query('UPDATE tbl_user SET account_status=? WHERE id=?', [0, user_id], function (error2, results, fields) {
            if (error2) return res.status(400).send({error: true, detail: error2.code, message: error2.sqlMessage});
            return res.send({ error: false, data: results, message: 'User has been removed successfully.'});
        });
    });    
});

//#7 === uc5.2 display filter gender/ location/ age
userApi.post('/filter', checkAuth, function(req, res) {
    let gender = req.body.gender;
    let latGeo = req.body.lat_geo;
    let longGeo = req.body.long_geo;
    let age = req.body.age;

    let now  = new Date();
    let nowYear = now.getFullYear();
    let birthYear = nowYear - age;
    let birthDate = new Date(birthYear.toString());
    
    dbConn.query('SELECT * FROM tbl_user where gender = ? AND lat_geo = ? AND long_geo = ? AND birth_date <= ?', [gender, latGeo, longGeo, birthDate], function(error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({ error: false, data: results, message: 'Filtered user list'});
    });
});

// #8 === My Settings Page - display my settings
userApi.get('/displayMySetting', checkAuth, function(req, res) {
    var userId = req.userData.userId;
    
    dbConn.query('SELECT a.name, a.gender, a.birth_date, b.country_name, c.language_name FROM tbl_user a INNER JOIN tbl_country b ON a.country_id = b.id INNER JOIN tbl_language c ON a.language_id = c.id WHERE a.id=? ', userId, function(error, results) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if (!results.length)
            return res.status(403).send({error: true, message: 'user not found'});

        var userBirth = results[0].birth_date;
        var birthYear = new Date(userBirth).getFullYear();
        var nowDate = new Date();
        var nowYear = nowDate.getFullYear();
        var age = nowYear - birthYear;
        var userData = results[0];
        userData.age = age;
        return res.send({error: false, data: userData, message: 'User Setting Information'});
    });
});

module.exports = userApi;