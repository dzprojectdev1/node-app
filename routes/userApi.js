var express = require("express");
var userApi = express.Router();
var bcrypt = require("bcrypt");
var dbConn = require("../config/dbConfig");
var jwt = require('jsonwebtoken');
const checkAuth = require('../middleware/check_auth');
const sgMail = require('@sendgrid/mail');
const async = require('async');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const fromEmail = process.env.SERVER_EMAIL_ADDRESS;

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
            return res.status(400).send({ error:true, message: 'Email is already taken.'});
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

	if (!useremail)
		return res.status(400).send({ error:true, message: 'Please provide user email' });
    if (!userpassword)
        return res.status(400).send({ error:true, message: 'Please provide user password' });
  
	dbConn.query('SELECT * FROM tbl_user where email_address=?', useremail, function (error, results, fields) {
		if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
		if (!results.length || !results[0])
            return res.status(400).send({error: true, message: "Email doesn't exist."});

        if (!bcrypt.compareSync(userpassword, results[0].password))
			return res.status(400).send({ error:true, message: 'Wrong Password' });
		else {
            const token = jwt.sign(
                {
                    email: results[0].email_address,
                    userId: results[0].id,
                    name: results[0].name
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
userApi.put('/updateSetting', checkAuth, function (req, res) {
    var userId = req.userData.userId;
    var updateData = {
        updated_date: new Date()
    };

    if (req.body.name) {
        updateData.name = req.body.name;
    }
    if (req.body.languageId) {
        updateData.language_id = req.body.languageId;
    }
    if (req.body.countryId) {
        updateData.country_id = req.body.countryId;
    }
    if (req.body.ethnicityId) {
        updateData.ethnicity_id = req.body.ethnicityId;
    }
  
    dbConn.query("UPDATE tbl_user SET ? WHERE id=?", [updateData, userId], function (error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

        var joingQuery = 'INNER JOIN tbl_ethnicity b ON a.ethnicity_id=b.id INNER JOIN tbl_language c ON a.language_id=c.id INNER JOIN tbl_country d ON a.country_id=d.id';

        dbConn.query("SELECT a.name, TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) AS age, a.birth_date, a.email_address, a.gender, a.lat_geo, a.long_geo, a.last_loggedin_date, a.updated_date, a.created_date, b.ethnicity_name, c.language_name, d.country_name FROM tbl_user a "+joingQuery+" WHERE a.id=?", userId, function(error1, updatedUser, fields) {
            if (error1) return res.status(400).send({error: true, detail: error1.code, message: error1.sqlMessage});
            return res.send({ error: false, data: updatedUser, message: 'User has been updated successfully.'});        
        });
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

    var joinQuery = 'INNER JOIN tbl_country b ON a.country_id = b.id INNER JOIN tbl_language c ON a.language_id = c.id INNER JOIN tbl_ethnicity d ON a.ethnicity_id=d.id';
    
    dbConn.query('SELECT a.name, a.gender, a.birth_date, b.country_name, c.language_name, d.ethnicity_name FROM tbl_user a '+joinQuery+' WHERE a.id=? ', userId, function(error, results) {
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

/*  sendgrid email sending */

function sendEmail(
    parentCallback,
    fromEmail,
    toEmails,
    subject,
    textContent,
    htmlContent
  ) {
    const errorEmails = [];
    const successfulEmails = [];
    
    async.parallel([
      function(callback) {
        // Add to emails
        const msg = {
            to: toEmails,
            from: fromEmail,
            subject: subject,
            text: textContent,
            html: htmlContent,
        };
        sgMail.send(msg);
        // return
        callback(null, true);
      }
    ], function(err, results) {
      console.log('Done');
    });
    parentCallback(null,
      {
        successfulEmails: successfulEmails,
        errorEmails: errorEmails,
      }
    );
}

var random, host, toEmail, link;

userApi.post('/sendConfirmEmail', checkAuth, function(req, res) {
    const userId = req.userData.userId;
    toEmail = req.userData.email;    

    random = Math.floor((Math.random() * 100) + 54);
    host=req.get('host');
    link="http://"+req.get('host')+"/api/user/emailVerify?id="+random;

    dbConn.query('SELECT email_address FROM tbl_user WHERE id=? AND email_status=0 AND account_status=0', userId, function(error, emailResults, fields) {
        if (error) 
            return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

        if (!emailResults.length)
            return res.status(403).send({error: true, data: emailResult, message: 'User not found.'});

        async.parallel(
            [
                function (callback) {
                    sendEmail(
                        callback,
                        fromEmail,
                        toEmail,
                        'Email Confirmation',
                        'Dear',
                        "Hello,<br> Please Click on the link to verify your email.<br><a href="+link+">Click here to verify</a>" 
                    );
                }
            ], function(err, results) {
            if (err) res.status(403).send({error: true, detail: err, message: 'Sending Email Faild'});
            var userUpdateData = {
                updated_date: new Date(),
                email_status: 2
            };
            dbConn.query('UPDATE tbl_user SET ? WHERE id=? AND email_status=0 AND account_status=0', [userUpdateData, userId], function(error1, updateResult, fields) {
                if (error1) return res.status(400).send({error: true, detail: error1.code, message: error1.sqlMessage});
                res.send({
                    error: false,
                    message: 'Emails sent'
                });
            });           
        });    
    });      
});

// user email verification api
userApi.get('/emailVerify', function(req, res) {
    if((req.protocol+"://"+req.get('host'))==("http://"+host)) {
        if(req.query.id == random) {
            //email is verified
            if (!toEmail) return res.status(403).send({error: true, message: 'Invalid User. Try to log in again.'});
                        
            dbConn.query('SELECT * from tbl_user WHERE email_address=? AND account_status=0 AND email_status=2', [toEmail], function(error, getResult, fields) {
                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                if (!getResult.length) return res.status(403).send({error: true, message: 'Invalid User'});
                var updateData = {
                    updated_date: new Date(),
                    email_status: 1,
                    account_status: 1
                };
                var userId = getResult[0].id;
                dbConn.query('UPDATE tbl_user SET ? WHERE id=?', [updateData, userId], function(error1, updateResult, updateFields) {
                    if (error1) return res.status(400).send({error: true, detail: error1.code, message: error1.sqlMessage});
                    res.send({error: false, email: toEmail, message: 'Email has been successfully verified.'});
                });
            });
        } else {
            res.send({error: true, email: toEmail, message: 'Email is not verified.'});
        }
    } else {
        res.send({error: true, message: 'Verify Link is invalid.'});
    }
});

var resettingRand, resettingLink, resetEmail, userEmail;

// user reset password
userApi.post('/requestResetPassword', function(req,res) {
    
    userEmail = req.body.userEmail;
    if (!userEmail) return res.send({error: true, message: 'Please provide user email.'});

    resetEmail = req.body.resetEmail;
    if (!resetEmail) return res.send({error: true, message: 'Please provide confirm email.'});    

    dbConn.query('SELECT * FROM tbl_user WHERE email_address=?', [userEmail], function(error, getResult, getFields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

        if (!getResult.length) return res.status(403).send({error: true, message: 'Invalid Email Address'});

        const loggedUserData = getResult[0];

        if (parseInt(loggedUserData.email_status) !== 1) return res.send({error: true, message: 'User`s email is not verified.'});

        if (parseInt(loggedUserData.account_status) !== 1) return res.send({error: true, message: 'User is not approved.'});

        userName = loggedUserData.name;

        resettingRand = Math.floor((Math.random() * 100) + 55);
        host=req.get('host');
        resettingLink="http://"+req.get('host')+"/api/user/receiveResetPassword?id="+resettingRand;

        async.parallel(
            [
                function (callback) {
                    sendEmail(
                        callback,
                        fromEmail,
                        resetEmail,
                        'Resetting Password',
                        'Do you want to change your passsword?',
                        "Hello,<br> Please Click on the link to reset your password.<br><a href="+resettingLink+">Click here to reset your password</a>" 
                    );
                }
            ], function(err, results) {
            if (err) res.status(403).send({error: true, detail: err, message: 'Sending Email Faild'});
            
            res.send({
                error: false,
                message: 'Emails sent'
            });
        });
    });
});

userApi.get('/receiveResetPassword', function(req, res) {
    if((req.protocol+"://"+req.get('host'))==("http://"+host)) {
        if(req.query.id == resettingRand) {
            if (!resetEmail) return res.status(403).send({error: true, message: ''});
            //email is verified = redirect to change password api
            res.send({error: false, email: resetEmail, message: 'User can change password, redirect to changeUserPassword'});
        } else {
            res.send({error: true, email: resetEmail, message: 'Invalid Email.'});
        }
    } else {
        res.send({error: true, message: 'Verify Link is invalid.'});
    }
});

// change password
userApi.post('/resetPassword', function(req, res) {
    const checkName = req.body.username;
    if (!checkName) return res.status(403).send({error: true, message: 'please provide user name.'});

    const newPassword = req.body.newPassword;
    if (!newPassword) return res.status(403).send({error: true, message: 'please provide new password'});

    if (!userEmail) return res.status(403).send({error: true, message: 'User request was expired, Try again.'});

    dbConn.query('SELECT id, name FROM tbl_user WHERE email_address=?', userEmail, function(error, getResults, getFields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        
        if (!getResults.length || !getResults[0]) return res.status(403).send({error: true, message: 'Invalid User. Try to log in again.'});

        const result = getResults[0];
        const oldName = result.name;
        const oldId = result.id;
        
        if (oldName === checkName) {
            // valid user == can change password
            var updateData = {
                password: bcrypt.hashSync(newPassword, 10, (err, hash) => {
					return hash;
                }),
                updated_date: new Date()
            };
            dbConn.query('UPDATE tbl_user SET ? WHERE id=?', [updateData, oldId], function(error1, updateResult, updateFeidls) {
                if (error1) return res.status(400).send({error: true, detail: error1.code, message: error1.sqlMessage});
                async.parallel(
                    [
                        function (callback) {
                            sendEmail(
                                callback,
                                fromEmail,
                                userEmail,
                                'Resetting Password',
                                'Do you want to change your passsword?',
                                "<p><b> Hello "+oldName+", Your Password was recently changed</b></p><p>This email confirms that you recently changed the password for user account "+oldName+". No further action is required.</p><br>" 
                            );
                        }
                    ], function(err, results) {
                    if (err) res.status(403).send({error: true, detail: err, message: 'Sending Email Faild'});
                    
                    res.send({error: false, message: 'User password has been successfully changed. Try to log in.'});
                });
            });
        } else {
            return res.status(403).send({error: true, message: 'Invalid User. Try to log in again.'});
        }
    }); 
}); 
module.exports = userApi;