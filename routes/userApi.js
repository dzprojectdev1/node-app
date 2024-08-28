var express = require("express");
var userApi = express.Router();
var bcrypt = require("bcrypt");
var dbConn = require("../config/dbConfig");
var jwt = require('jsonwebtoken');
const checkAuth = require('../middleware/check_auth');
const sgMail = require('@sendgrid/mail');
const async = require('async');
const common = require('../config/common');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const request = require("request");
const sharp = require('sharp');
const multer = require('multer');
const { deleteFiles } = require('../utils/fileSystem');

const TEMP_UPLOAD_FOLDER = path.join(__dirname, 'tmp');
const DESIRED_FILE_EXTENSION = 'jpg';
const THUMBNAIL_SIZES = [64, 128, 512];
const upload = multer({
    dest: TEMP_UPLOAD_FOLDER,
});
const { bucket } = require('../config/storageConfig');

var illegalWords = [
    'sex',
    'pussy',
    'fuck',
    'fucking',
    'lick',
    'boob',
    'boobs',
    'tit',
    'tits',
    'nude',
    'blowjob',
    'cum',
    'porn',
    'naked',
    'cock',
    'dildo',
    'horny',
    'dick',
    'sexting',
    'sexchat',
    'penis',
    'pennis',
    'vagina',
    'call girl',
    'sex chat',
    'suck my',
    'suck your',
];

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const fromEmail = process.env.SERVER_EMAIL_ADDRESS;

const GENERIC_SERVER_ERROR_MSG = 'Server error has occurred. Please contact us for support.';

// #1 === Retrieve all users 
userApi.get('/all', checkAuth, function (req, res) {
    dbConn.query('SELECT * FROM tbl_user', function (error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({error: false, data: results, message: 'users list.'});
    });
});

// #2 === Retrieve user with id 
userApi.get('/one/:id', checkAuth, function (req, res) {

    let user_id = req.params.id;

    if (!user_id) {
        return res.status(400).send({error: true, message: 'Please provide user_id'});
    }

    dbConn.query('SELECT * FROM tbl_user where id=?', user_id, function (error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({error: false, data: results[0], message: 'users list.'});
    });
});

// get loggedin user detail information
userApi.get('/getMyDetailInfo', checkAuth, function (req, res) {
    var userId = req.userData.userId;
    dbConn.query('SELECT * FROM tbl_user WHERE id=? AND account_status=1', userId, function (userErr, userResults, fields) {
        if (userErr) return res.status(400).send({error: true, detail: userErr.code, message: userErr.sqlMessage});
        if (!userResults.length) return res.status(403).send({error: true, message: 'user not found'});
        return res.send({error: false, data: userResults[0], message: 'user data found.'})
    });
});


//getting random number
function getRndInteger(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

var findSubarray = (arr, subarr) => {
    for (var i = 0; i < 1 + (arr.length - subarr.length); i++) {
        var j = 0;
        for (; j < subarr.length; j++)
            if (arr[i + j] !== subarr[j])
                break;
        if (j == subarr.length)
            return i;
    }
    return -1;
}

// #3 === login user
userApi.post('/signup', function (req, res) {
    // let useremail = req.body.useremail;
    // let userpassword = req.body.userpassword;
    let username = req.body.username;
    let usergender = req.body.usergender;
    let userlanguage = req.body.language;
    let country = req.body.country;
    let ethnicity = req.body.ethnicity;
    let userBirthData = req.body.birth_date;
    let userlat = req.body.lat_geo;
    let userlong = req.body.long_geo;
    let deviceId = req.body.device_id;
    let fcmId = req.body.fcm_id;
    let description = req.body.description;

    if (!fcmId || !deviceId || !username || !usergender || !userlanguage || !country || !ethnicity || !userBirthData || !userlat || !userlong || !description) {
        // console.log(
        //     'User sent signup form with missing fields:',
        //     JSON.stringify({
        //         'username': username,
        //         'usergender': usergender,
        //         'language': userlanguage,
        //         'country': country,
        //         'ethnicity': ethnicity,
        //         'birth_date': userBirthData,
        //         'lat_geo': userlat,
        //         'long_geo': userlong,
        //         'device_id': deviceId,
        //         'fcm_id': fcmId,
        //         'description': description
        //     }),
        // );

        return res.status(400).send({error: true, message: 'Please fill out all required fields.'});
    }

    var usernameArr = username.toUpperCase().split(" ");
    var descriptionArr = description.toUpperCase().split(" ");

    var booleanValue1 = illegalWords.every(function (words, index) {
        var wordsArr = words.toUpperCase().split(" ");

        return findSubarray(usernameArr, wordsArr) === -1;
    })

    var booleanValue2 = illegalWords.every(function (words, index) {
        var wordsArr = words.toUpperCase().split(" ");

        return findSubarray(descriptionArr, wordsArr) === -1;
    })

    let account_status = 1;

    if (!booleanValue1 || !booleanValue2) {
        account_status = 10;
    }

    dbConn.query('SELECT * FROM tbl_user where device_id=?', deviceId, function (error, results, fields) {
        if (error) {
            return res.status(400)
                .send({
                    error: true,
                    detail: error.code,
                    message: GENERIC_SERVER_ERROR_MSG,
                });
        }

        if (results.length) {
            return res.status(400).send({error: true, message: 'User already exists.'});
        } else {
            var newUserData = {
                // email_address: useremail,
                // password: bcrypt.hashSync(userpassword, 10, (err, hash) => {
                //     return hash;
                // }),
                name: username,
                gender: usergender,
                language_id: userlanguage,
                country_id: country,
                ethnicity_id: ethnicity,
                birth_date: userBirthData,
                lat_geo: parseFloat(userlat),
                long_geo: parseFloat(userlong),
                coin_count: 500,
                confirmation_code: getRndInteger(100000, 999999),
                created_date: new Date(),
                fcm_id: fcmId,
                device_id: deviceId,
                description: description,
                account_status: account_status,
                last_loggedin_date: new Date(),
                auto_block: 0,
                fan_count: 0,
                is_admin: 0,
                coin_per_message: 1,
            };

            dbConn.query("INSERT INTO tbl_user SET ? ", newUserData, function (error, results, fields) {
                if (error) {
                    return res.status(400).send({
                        error: true,
                        detail: error.code,
                        message: GENERIC_SERVER_ERROR_MSG,
                    });
                }

                var joinQuery = 'INNER JOIN tbl_language b on a.language_id=b.id INNER JOIN tbl_ethnicity c ON c.id=a.ethnicity_id INNER JOIN tbl_country d ON a.country_id=d.id';
                var fullQuery = `SELECT a.*, TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) AS age, b.language_name, c.ethnicity_name, d.country_name FROM tbl_user a ${joinQuery} WHERE a.id=?`;

                dbConn.query(fullQuery, results.insertId, (error, results, fields) => {
                    if (error) {
                        return res.status(400).send({
                            error: true,
                            detail: error.code,
                            message: GENERIC_SERVER_ERROR_MSG,
                        });
                    }

                    if (!results || !results.length) {
                        return res.send({error: false, message: 'User does not exist.'});
                    }

                    const token = jwt.sign(
                        {
                            userId: results[0].id,
                            name: results[0].name,
                            device_id: results[0].device_id
                        }, process.env.JWT_KEY,
                        {
                            expiresIn: '24h'
                        }
                    );
                    var outputResult = {
                        token: token,
                        id: results[0].id,
                        name: results[0].name,
                        email: results[0].email_address,
                        age: results[0].age,
                        gender: results[0].gender,
                        coin_count: results[0].coin_count,
                        language: results[0].language_name,
                        ethnicity: results[0].ethnicity_name,
                        country: results[0].country_name,
                        description: results[0].description,
                        account_status: results[0].account_status,
                        last_loggedin_date: results[0].last_loggedin_date,
                        fan_count: results[0].fan_count,
                        auto_block: results[0].auto_block,
                        is_admin: results[0].is_admin,
                        coin_per_message: results[0].coin_per_message,
                    };
                    return res.send({error: false, user: outputResult, message: 'User exist!'});
                });
                // return res.send({ error: false, data: results.insertId, message: 'New user has been created successfully.' });
            });
        }
    });
});

userApi.put('/checkDeviceUniqueId/:deviceId', function (req, res) {
    var deviceId = req.params.deviceId;
    var fcmId = req.body.fcmId;

    if (!fcmId) return res.status(403).send({error: true, message: 'please provide fcm token'});

    var joinQuery = 'INNER JOIN tbl_language b on a.language_id=b.id INNER JOIN tbl_ethnicity c ON c.id=a.ethnicity_id INNER JOIN tbl_country d ON a.country_id=d.id';
    dbConn.query('SELECT a.*, TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) AS age, b.language_name, c.ethnicity_name, d.country_name FROM tbl_user a ' + joinQuery + ' WHERE a.device_id=? AND account_status in (0, 1, 2, 3, 9, 10)', deviceId, function (error, results, fields) {
        if (error) {
            return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        }
        if (!results || !results.length) return res.send({error: false, message: 'User does not exist.'});
        dbConn.query('UPDATE tbl_user SET last_loggedin_date=?, fcm_id=? WHERE id=?', [new Date(), fcmId, results[0].id], function (updateErr, updateRow, updateFields) {
            if (updateErr) {
                return res.status(400).send({error: true, detail: updateErr.code, message: updateErr.message});
            }
            const token = jwt.sign(
                {
                    userId: results[0].id,
                    name: results[0].name,
                    device_id: results[0].device_id
                }, process.env.JWT_KEY,
                {
                    expiresIn: '24h'
                }
            );
            var outputResult = {
                id: results[0].id,
                token: token,
                name: results[0].name,
                email: results[0].email_address,
                age: results[0].age,
                gender: results[0].gender,
                language: results[0].language_name,
                ethnicity: results[0].ethnicity_name,
                country: results[0].country_name,
                description: results[0].description,
                last_loggedin_date: results[0].last_loggedin_date,
                coin_count: results[0].coin_count,
                account_status: results[0].account_status,
                confirmation_code: results[0].confirmation_code,
                fan_count: results[0].fan_count,
                auto_block: results[0].auto_block,
                is_admin: results[0].is_admin,
                coin_per_message: results[0].coin_per_message,
            };
            return res.send({error: false, user: outputResult, message: 'User already exist!'});
        });
    });
});

userApi.get('/checkLoginStatus', checkAuth, function (req, res) {
    var userId = req.userData.userId;
    var joinQuery = 'INNER JOIN tbl_language b on a.language_id=b.id INNER JOIN tbl_ethnicity c ON c.id=a.ethnicity_id INNER JOIN tbl_country d ON a.country_id=d.id';
    dbConn.query('SELECT a.*, TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) AS age, b.language_name, c.ethnicity_name, d.country_name FROM tbl_user a ' + joinQuery + ' WHERE a.id=?', userId, function (error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if (!results.length || !results[0])
            return res.status(400).send({error: true, message: "User doesn't exist."});

        var userData = results[0];
        var accountStatus = userData.account_status;
        if (accountStatus === 8)
            return res.send({error: true, message: 'You have been banned'});
        if (accountStatus === 9)
            return res.send({error: true, message: 'Your account is closed'});

        var outputResult = {
            id: results[0].id,
            name: results[0].name,
            email: results[0].email_address,
            age: results[0].age,
            gender: results[0].gender,
            language: results[0].language_name,
            ethnicity: results[0].ethnicity_name,
            country: results[0].country_name,
            email_status: results[0].email_status
        };
        return res.send({error: false, data: outputResult, message: 'User have been logged in successfully.'});
    });
});

// #4 ===  Add a new user  
userApi.post('/login', function (req, res) {
    let useremail = req.body.useremail;
    let userpassword = req.body.userpassword;
    let deviceId = req.body.deviceId;

    if (!useremail)
        return res.status(400).send({error: true, message: 'Please provide user email'});
    if (!userpassword)
        return res.status(400).send({error: true, message: 'Please provide user password'});
    if (!deviceId)
        return res.status(400).send({error: true, message: 'Device Token Error'});

    var joinQuery = 'INNER JOIN tbl_language b on a.language_id=b.id INNER JOIN tbl_ethnicity c ON c.id=a.ethnicity_id INNER JOIN tbl_country d ON a.country_id=d.id';
    dbConn.query('SELECT a.*, TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) AS age, b.language_name, c.ethnicity_name, d.country_name FROM tbl_user a ' + joinQuery + ' WHERE a.email_address=?', useremail, function (error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if (!results.length || !results[0])
            return res.status(400).send({error: true, message: "Email doesn't exist."});

        var userData = results[0];
        var accountStatus = userData.account_status;
        if (accountStatus === 8)
            return res.send({error: true, message: 'You have been banned'});
        if (accountStatus === 9)
            return res.send({error: true, message: 'Your account is closed'})

        if (!bcrypt.compareSync(userpassword, results[0].password))
            return res.status(400).send({error: true, message: 'The email or password is invalid,\n please try again'});
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
            var outputResult = {
                id: results[0].id,
                token: token,
                name: results[0].name,
                email: results[0].email_address,
                age: results[0].age,
                gender: results[0].gender,
                language: results[0].language_name,
                ethnicity: results[0].ethnicity_name,
                country: results[0].country_name,
                email_status: results[0].email_status,
                last_activity: common.commonFunc.timeAgo(results[0].last_loggedin_date)
            };

            dbConn.query('INSERT INTO tbl_user_login SET ? ', lastLoggedData, function (error, newResults, fields) {
                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

                dbConn.query('UPDATE tbl_user SET last_loggedin_date=?, fcm_id=? WHERE id=? ', [new Date(), deviceId, results[0].id], function (error1, updateResult, fields) {
                    if (error1) return res.status(400).send({
                        error: true,
                        detail: error1.code,
                        message: error1.sqlMessage
                    });
                    return res.send({
                        error: false,
                        data: outputResult,
                        message: 'User have been logged in successfully.'
                    });
                });
            });
        }
    });
});

userApi.post('/logout', checkAuth, function (req, res) {
    return res.send({error: false, message: 'User has been logged out successfully.'});
});


// #5 ===  Update user with id
userApi.put('/updateSetting', checkAuth, function (req, res) {
    var userId = req.userData.userId;

    dbConn.query('SELECT * FROM tbl_user WHERE id=? AND account_status=1', userId, function (userErr, userResult, userField) {
        if (userErr) return res.status(400).send({error: true, detail: userErr.code, message: userErr.sqlMessage});
        if (!userResult.length) return res.status(403).send({error: true, message: 'user not found.'});
        var updateData = {};

        var usernameArr = [];
        var descriptionArr = [];

        if (req.body.name) {
            updateData.name = req.body.name;
            usernameArr = req.body.name.toUpperCase().split(" ")
        }
        if (req.body.description) {
            updateData.description = req.body.description;
            descriptionArr = req.body.description.toUpperCase().split(" ");
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
        if (req.body.latGeo) {
            updateData.lat_geo = req.body.latGeo;
        }
        if (req.body.longGeo) {
            updateData.long_geo = req.body.longGeo;
        }
        if (req.body.auto_blockId) {
            updateData.auto_block = req.body.auto_blockId;
        }
        if (req.body.coin_per_message) {
            updateData.coin_per_message = req.body.coin_per_message;
        }

        var booleanValue1 = illegalWords.every(function (words, index) {
            var wordsArr = words.toUpperCase().split(" ");

            return findSubarray(usernameArr, wordsArr) === -1;
        })

        var booleanValue2 = illegalWords.every(function (words, index) {
            var wordsArr = words.toUpperCase().split(" ");

            return findSubarray(descriptionArr, wordsArr) === -1;
        })

        if (!booleanValue1 || !booleanValue2) {
            updateData.account_status = 10;
        }

        updateData.updated_date = new Date();

        dbConn.query("UPDATE tbl_user SET ? WHERE id=?", [updateData, userId], function (error, results, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

            var joingQuery = 'INNER JOIN tbl_ethnicity b ON a.ethnicity_id=b.id INNER JOIN tbl_language c ON a.language_id=c.id INNER JOIN tbl_country d ON a.country_id=d.id';

            dbConn.query("SELECT a.name, a.description, TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) AS age, a.birth_date, a.email_address, a.gender, a.lat_geo, a.long_geo, a.last_loggedin_date, a.updated_date, a.created_date, b.ethnicity_name, c.language_name, d.country_name FROM tbl_user a " + joingQuery + " WHERE a.id=?", userId, function (error1, updatedUser, fields) {
                if (error1) return res.status(400).send({error: true, detail: error1.code, message: error1.sqlMessage});
                if (!updatedUser.length) return res.status(403).send({error: true, message: 'user not found'});
                return res.send({
                    error: false,
                    data: updatedUser[0],
                    message: 'Your profile setting was updated successfully.'
                });
            });
        });
    })

});


// #2.1 === Deactivate User
userApi.post('/deactivateAccount', checkAuth, function (req, res) {
    let user_id = req.userData.userId;

    dbConn.query('SELECT * FROM tbl_user WHERE id=?', [user_id], function (error1, oldResults, fields) {
        if (error1) return res.status(400).send({error: true, detail: error1.code, message: error1.sqlMessage});

        if (!oldResults.length) return res.send({error: false, message: 'User not found.'});

        dbConn.query('UPDATE tbl_user SET account_status=2 WHERE id=?', user_id, function (error2, results, fields) {
            if (error2) return res.status(400).send({error: true, detail: error2.code, message: error2.sqlMessage});
            return res.send({error: false, data: results, message: 'Your account is deactivated.'});
        });
    });
});

// #2.2 ===  Activate user
userApi.post('/activateAccount', checkAuth, function (req, res) {
    let user_id = req.userData.userId;

    dbConn.query('SELECT * FROM tbl_user WHERE id=?', [user_id], function (error1, oldResults, fields) {
        if (error1) return res.status(400).send({error: true, detail: error1.code, message: error1.sqlMessage});

        if (!oldResults.length) return res.send({error: false, message: 'User not found.'});

        dbConn.query('UPDATE tbl_user SET account_status=1 WHERE id=?', user_id, function (error2, results, fields) {
            if (error2) return res.status(400).send({error: true, detail: error2.code, message: error2.sqlMessage});
            return res.send({error: false, data: results, message: 'Your account is activated.'});
        });
    });
});

// #3 ===  Closed Permanently User
userApi.post('/closeAccount', checkAuth, function (req, res) {
    let user_id = req.userData.userId;

    dbConn.query('SELECT * FROM tbl_user WHERE id=?', [user_id], function (error1, oldResults, fields) {
        if (error1) return res.status(400).send({error: true, detail: error1.code, message: error1.sqlMessage});

        if (!oldResults.length) return res.send({error: false, message: 'User not found.'});

        dbConn.query('UPDATE tbl_user SET account_status=3 WHERE id=?', user_id, function (error2, results, fields) {
            if (error2) return res.status(400).send({error: true, detail: error2.code, message: error2.sqlMessage});

            let resultData = {
                user_id: oldResults[0].id,
                confirmation_code: oldResults[0].confirmation_code
            }
            return res.send({error: false, data: resultData, message: 'Your account is closed.'});
        });
    });
});

//#7 === uc5.2 display filter gender/ location/ age
userApi.post('/filter', checkAuth, function (req, res) {
    let gender = req.body.gender;
    let latGeo = req.body.lat_geo;
    let longGeo = req.body.long_geo;
    let age = req.body.age;

    let now = new Date();
    let nowYear = now.getFullYear();
    let birthYear = nowYear - age;
    let birthDate = new Date(birthYear.toString());

    dbConn.query('SELECT * FROM tbl_user where gender = ? AND lat_geo = ? AND long_geo = ? AND birth_date <= ?', [gender, latGeo, longGeo, birthDate], function (error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        return res.send({error: false, data: results, message: 'Filtered user list'});
    });
});

// #8 === My Settings Page - display my settings
userApi.get('/displayMySetting', checkAuth, function (req, res) {
    var userId = req.userData.userId;

    var joinQuery = 'INNER JOIN tbl_country b ON a.country_id = b.id INNER JOIN tbl_language c ON a.language_id = c.id INNER JOIN tbl_ethnicity d ON a.ethnicity_id=d.id';

    dbConn.query('SELECT a.name, a.gender, a.birth_date, b.country_name, c.language_name, d.ethnicity_name FROM tbl_user a ' + joinQuery + ' WHERE a.id=? ', userId, function (error, results) {
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

function sendEmail(parentCallback, fromEmail, toEmails, subject, textContent, htmlContent) {
    const errorEmails = [];
    const successfulEmails = [];

    async.parallel([
        function (callback) {
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
    ], function (err, results) {
        return err;
    });
    parentCallback(null,
        {
            successfulEmails: successfulEmails,
            errorEmails: errorEmails,
        }
    );
}

userApi.post('/sendConfirmEmail', checkAuth, function (req, res) {

    var userId = req.userData.userId;
    var toEmail = req.userData.email;
    var name = req.userData.name;

    dbConn.query('SELECT * FROM tbl_user WHERE id=? AND (email_status=0 or email_status=2) AND account_status=0', userId, function (error, emailResults, fields) {
        if (error)
            return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

        if (!emailResults.length)
            return res.status(403).send({error: true, data: emailResults, message: 'User not found.'});

        var confirmationCode = emailResults[0].confirmation_code;

        if (!confirmationCode) return res.status(403).send({error: false, message: 'Confirmation Code not found.'});

        async.parallel(
            [
                function (callback) {
                    sendEmail(
                        callback,
                        fromEmail,
                        toEmail,
                        'confirmation code : ' + confirmationCode + ' DazzledDate.com',
                        'Please verify your email address',
                        "<p><b>Hi, " + name + " </b></p> <p> This is your confirmation code : <strong style='font-size: 25px;'>" + confirmationCode + "</strong></p>"
                    );
                }
            ], function (err, results) {
                if (err) {
                    res.status(403).send({error: true, detail: err, message: 'Sending Email Faild'});
                }
                if (results) {
                    var userUpdateData = {
                        updated_date: new Date(),
                        email_status: 2
                    };
                    dbConn.query('UPDATE tbl_user SET ? WHERE id=? AND email_status=0 AND account_status=0', [userUpdateData, userId], function (error1, updateResult, fields) {
                        if (error1) return res.status(400).send({
                            error: true,
                            detail: error1.code,
                            message: error1.sqlMessage
                        });

                        res.send({
                            error: false,
                            message: 'Emails sent'
                        });
                    });
                }
            });
    });
});

// user email verification api
userApi.post('/emailVerify', checkAuth, function (req, res) {
    var userId = req.userData.userId;
    var userEmail = req.userData.email;
    var confirmCode = req.body.confirmCode;

    if (!confirmCode) return res.status(403).send({error: true, message: 'Confirmation Code Not Found.'});

    dbConn.query('SELECT * from tbl_user WHERE email_address=? AND account_status=0 AND (email_status=2 OR email_status=0)', userEmail, function (error, getResult, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

        if (!getResult.length) return res.status(403).send({error: true, message: 'User is not registered!'});
        var dbConfirmationCode = getResult[0].confirmation_code;

        if (parseInt(confirmCode) === parseInt(dbConfirmationCode)) {
            var updateData = {
                updated_date: new Date(),
                email_status: 1,
                account_status: 1,
                confirmation_code: getRndInteger(100000, 999999)
            };

            dbConn.query('UPDATE tbl_user SET ? WHERE id=?', [updateData, userId], function (error1, updateResult, updateFields) {
                if (error1) return res.status(400).send({error: true, detail: error1.code, message: error1.sqlMessage});
                res.send({error: false, email: userEmail, message: 'Email has been successfully verified.'});
            });
        } else {
            return res.send({error: true, message: 'Confirmation code is not correct.'});
        }
    });
});

userApi.get('/getAllAssetData', function (req, res) {
    dbConn.query('SELECT * FROM tbl_country where publish=1 order by order_by desc', function (countryError, countryResult, countryFields) {
        if (countryError) return res.status(400).send({
            error: true,
            detail: countryError.code,
            message: countryError.sqlMessage
        });
        dbConn.query('SELECT * FROM tbl_ethnicity where publish=1 order by order_by desc', function (ethnicityError, ethnicityResult, ethnicityFields) {
            if (ethnicityError) return res.status(400).send({
                error: true,
                detail: ethnicityError.code,
                message: ethnicityError.sqlMessage
            });
            dbConn.query('SELECT * FROM tbl_language where publish=1 order by order_by desc', function (languageError, languageResult, languageFields) {
                if (languageError) return res.status(400).send({
                    error: true,
                    detail: languageError.code,
                    message: languageError.sqlMessage
                });
                res.send({
                    error: false,
                    data: {country: countryResult, ethnicity: ethnicityResult, language: languageResult},
                    message: 'get all user asset data'
                });
            });
        });
    });
});

userApi.post('/banUser', checkAuth, function (req, res) {
    var userId = req.userData.userId;
    var otherId = req.body.otherId;

    if (!otherId) {
        return res.status(400).send({error: true, message: 'Please provide other user id'});
    }

    let query = 'select * from tbl_user where id = ?';
    dbConn.query(query, userId, function (error, results, fields) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
        if (!results || !results.length) return res.status(403).send({error: true, message: 'No match user!'});

        var is_admin = results[0].is_admin;
        if (is_admin !== 1)
            return res.send({error: true, message: "You have no permission for this control."});

        query = 'update tbl_user set account_status = 0 where id = ?';
        dbConn.query(query, otherId, function (error, uptResults, fields) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

            return res.send({error: false, message: 'Banned user successfully.'});
        })
    })
});

// #5 ===  New AI agent generate
userApi.post('/addEditAIUser', checkAuth, function (req, res) {
    const username = req.body.username;
    // const gender = req.body.gender;
    // const language = req.body.language;
    // const country = req.body.country;
    // const ethnicity = req.body.ethnicity;
    const id = req.body.id;
    const gender = 1;
    const language = req.body.language;
    const country = 1;
    const ethnicity = 1;
    const userBirthData = req.body.birth_date;
    const lat = req.body.lat_geo;
    const long = req.body.long_geo;
    const deviceId = req.body.device_id;
    const fcmId = req.body.fcm_id;
    const is_public = req.body.is_public;
    const description = req.body.description;
    const ai_personality = req.body.ai_personality;
    const creator_user_id = req.body.creator_user_id;
    const coin_for_ai_user_create = 200;

    if (id != 0) {
        return editAIUser(username, description, ai_personality, is_public, id, language, res)
    } else {

        if (id === 0 && (!fcmId || !deviceId || !username || !gender || !language || !country || !ai_personality || !userBirthData || !lat || !long || !description)) {
            return res.status(400).send({error: true, message: 'Please fill out all required fields.'});
        }

        const usernameArr = username.toUpperCase().split(" ");
        const descriptionArr = description.toUpperCase().split(" ");

        const booleanValue1 = illegalWords.every(function (words, index) {
            const wordsArr = words.toUpperCase().split(" ");

            return findSubarray(usernameArr, wordsArr) === -1;
        });

        const booleanValue2 = illegalWords.every(function (words, index) {
            const wordsArr = words.toUpperCase().split(" ");

            return findSubarray(descriptionArr, wordsArr) === -1;
        });

        let account_status = 1;

        if (!booleanValue1 || !booleanValue2) {
            account_status = 10;
        }

        dbConn.query('SELECT * FROM tbl_user where device_id=?', deviceId, function (error, results, fields) {
            if (error) {
                return res.status(400)
                    .send({
                        error: true,
                        detail: error.code,
                        message: GENERIC_SERVER_ERROR_MSG,
                    });
            }

            if (results[0].coin_count < 200) {
                return res.status(400).send({
                    error: true,
                    message: `You don't have required diamonds to create AI user. Please purchase diamonds and try again.`
                });
            }

            const user_new_coin_count = parseInt(results[0].coin_count) - parseInt(coin_for_ai_user_create);
            // const user_fan_count = results[0].fan_count + 1;
            const user_fan_count = results[0].fan_count;

            const newUserData = {
                name: username,
                gender: gender,
                language_id: language,
                country_id: country,
                ethnicity_id: ethnicity,
                birth_date: userBirthData,
                lat_geo: parseFloat(lat),
                long_geo: parseFloat(long),
                coin_count: 0,
                confirmation_code: getRndInteger(100000, 999999),
                created_date: new Date(),
                fcm_id: fcmId,
                description: description,
                account_status: account_status,
                last_loggedin_date: new Date(),
                auto_block: 0,
                fan_count: 0,
                is_admin: 0,
                img_message: 3,
                chat_type: 2,
                ai_friend: 1,
                coin_per_message: 1,
                is_public: is_public,
                ai_personality: ai_personality,
                creator_user_id: creator_user_id,
            };

            dbConn.beginTransaction(function (error) {
                if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
                dbConn.query("INSERT INTO tbl_user SET ? ", newUserData, function (error, newUserResults, fields) {
                    if (error) {
                        return res.status(400).send({
                            error: true,
                            detail: error.code,
                            message: GENERIC_SERVER_ERROR_MSG,
                        });
                    }

                    const sendDiamondsData = {
                        from_user: creator_user_id,
                        from_user_name: results[0].name,
                        from_user_orig_count: results[0].coin_count,
                        from_user_new_count: user_new_coin_count,
                        to_user: newUserResults.insertId,
                        to_user_name: username,
                        to_user_orig_count: 0,
                        to_user_new_count: 200,
                        amount: 1,
                        fan_message: '',
                        fan_user_id: 0,
                        date: new Date()
                    };

                    dbConn.query('INSERT INTO tbl_send set ? ', [sendDiamondsData], function (error, insertResult) {
                        if (error) {
                            dbConn.rollback(function () {
                                return res.status(400).send({
                                    error: true,
                                    detail: error.code,
                                    message: error.sqlMessage
                                });
                            });
                        }

                        dbConn.query('update tbl_user set coin_count = ?, fan_count = ? where id = ? ', [user_new_coin_count, user_fan_count, results[0].id], function (error, sendResult) {
                            if (error) {
                                dbConn.rollback(function () {
                                    return res.status(400).send({
                                        error: true,
                                        detail: error.code,
                                        message: error.sqlMessage
                                    });
                                });
                            }

                            dbConn.query('update tbl_user set coin_count = ?, fan_count = ? where id = ? ', [200, 1, newUserResults.insertId], function (error, receiveResult) {
                                if (error) {
                                    dbConn.rollback(function () {
                                        return res.status(400).send({
                                            error: true,
                                            detail: error.code,
                                            message: error.sqlMessage
                                        });
                                    });
                                }
                                dbConn.commit(function (error) {
                                    if (error) {
                                        dbConn.rollback(function () {
                                            return res.status(400).send({
                                                error: true,
                                                detail: error.code,
                                                message: error.sqlMessage
                                            });
                                        });
                                    }

                                    const joinQuery = 'INNER JOIN tbl_language b on a.language_id=b.id INNER JOIN tbl_ethnicity c ON c.id=a.ethnicity_id INNER JOIN tbl_country d ON a.country_id=d.id';
                                    const fullQuery = `SELECT a.*, TIMESTAMPDIFF(YEAR, a.birth_date, CURDATE()) AS age, b.language_name, c.ethnicity_name, d.country_name FROM tbl_user a ${joinQuery} WHERE a.id=?`;

                                    dbConn.query(fullQuery, newUserResults.insertId, (error, results, fields) => {
                                        if (error) {
                                            return res.status(400).send({
                                                error: true,
                                                detail: error.code,
                                                message: GENERIC_SERVER_ERROR_MSG,
                                            });
                                        }

                                        if (!results || !results.length) {
                                            return res.send({error: false, message: 'User does not exist.'});
                                        }

                                        const token = jwt.sign(
                                            {
                                                userId: results[0].id,
                                                name: results[0].name,
                                                device_id: results[0].device_id
                                            }, process.env.JWT_KEY,
                                            {
                                                expiresIn: '24h'
                                            }
                                        );
                                        const outputResult = {
                                            token: token,
                                            id: results[0].id,
                                            name: results[0].name,
                                            email: results[0].email_address,
                                            age: results[0].age,
                                            imageUrl: '',
                                            gender: results[0].gender,
                                            coin_count: results[0].coin_count,
                                            language: results[0].language_name,
                                            ethnicity: results[0].ethnicity_name,
                                            country: results[0].country_name,
                                            description: results[0].description,
                                            account_status: results[0].account_status,
                                            last_loggedin_date: results[0].last_loggedin_date,
                                            fan_count: results[0].fan_count,
                                            auto_block: results[0].auto_block,
                                            is_admin: results[0].is_admin,
                                            coin_per_message: results[0].coin_per_message,
                                            ai_friend: results[0].ai_friend,
                                            chat_type: results[0].chat_type,
                                            ai_personality: results[0].ai_personality,
                                            img_message: results[0].img_message,
                                            creator_user_id: creator_user_id,
                                            is_public: results[0].is_public,
                                        };
                                        return res.send({
                                            error: false,
                                            user: outputResult,
                                            message: 'AI user created successfully...'
                                        });
                                    });
                                });
                            })
                        })
                    })
                    // return res.send({ error: false, data: results.insertId, message: 'New user has been created successfully.' });
                });
            })
        });
    }
});

function editAIUser(username, description, ai_personality, is_public, id, language_id, res) {
    if (id !== 0 && (!username || !description || !ai_personality)) {
        return res.status(400).send({error: true, message: 'Please fill out all required fields.'});
    }

    dbConn.beginTransaction(function (error) {
        if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});

        dbConn.query("UPDATE tbl_user SET name=?, description=?, ai_personality=?, is_public=?, language_id=? WHERE id=?", [username, description, ai_personality, is_public, language_id, id], function (error, results, fields) {
            if (error) {
                dbConn.rollback(function () {
                    return res.status(400).send({
                        error: true,
                        detail: error.code,
                        message: error.sqlMessage
                    });
                });
            }
            dbConn.commit(function (error) {
                if (error) {
                    dbConn.rollback(function () {
                        return res.status(400).send({
                            error: true,
                            detail: error.code,
                            message: error.sqlMessage
                        });
                    });
                }

                dbConn.query('SELECT * FROM tbl_user WHERE id = ?', [id], function (error, results) {
                    if (error) {
                        return res.status(400).send({ error: true, detail: error.code, message: GENERIC_SERVER_ERROR_MSG });
                    }

                    if (!results.length) {
                        return res.send({ error: false, message: 'User does not exist.' });
                    }

                    return res.send({ error: false, user: results[0], message: 'AI user updated successfully...' });
                });

                //return res.send({error: false, user: results[0], message: 'AI user updated successfully...'});
            });
            //return res.send({error: false, user: results[0], message: 'AI user updated successfully...'});
        });
    })
}

// #5 ===  New AI agent generate
userApi.post('/generateAIUserImage', checkAuth, function (req, res) {
    const user_name = req.body.user_name;
    const user_id = req.body.user_id;
    const user_generation_id = req.body.user_generation_id;
    const user_prompt_text = req.body.user_prompt_text;
    const user_preset_style = req.body.user_preset_style;
    const creator_user_id = req.body.creator_user_id;
    const coin_for_ai_user_create = 100;

    if (!user_name || !user_id || !user_generation_id || !user_prompt_text || !user_preset_style || !creator_user_id) {
        return res.status(400).send({error: true, message: 'Please fill out all required fields.'});
    }

    dbConn.query('SELECT * FROM tbl_user where id=?', creator_user_id, function (error, results, fields) {
        if (error) {
            return res.status(400)
                .send({
                    error: true,
                    detail: error.code,
                    message: GENERIC_SERVER_ERROR_MSG,
                });
        }

        if (results[0].coin_count < 100) {
            return res.status(400).send({
                error: true,
                message: `You don't have required diamonds to generate AI user image. Please purchase diamonds and try again.`
            });
        }

        const user_new_coin_count = parseInt(results[0].coin_count) - parseInt(coin_for_ai_user_create);

        const newUserData = {
            user_id: parseInt(user_id, 10),
            user_name: user_name,
            user_generation_id: user_generation_id,
            user_prompt_text: user_prompt_text,
            user_preset_style: user_preset_style,
        };

        dbConn.beginTransaction(function (error) {
            if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
            dbConn.query("INSERT INTO tbl_temp_image SET ? ", newUserData, function (error, newUserResults, fields) {
                if (error) {
                    return res.status(400).send({
                        error: true,
                        detail: error.code,
                        message: GENERIC_SERVER_ERROR_MSG,
                    });
                }

                const sendDiamondsData = {
                    from_user: creator_user_id,
                    from_user_name: results[0].name,
                    from_user_orig_count: results[0].coin_count,
                    from_user_new_count: user_new_coin_count,
                    to_user: user_id,
                    to_user_name: user_name,
                    to_user_orig_count: 0,
                    to_user_new_count: 100,
                    amount: 1,
                    fan_message: '',
                    fan_user_id: 0,
                    date: new Date()
                };

                dbConn.query('INSERT INTO tbl_send set ? ', [sendDiamondsData], function (error, insertResult) {
                    if (error) {
                        dbConn.rollback(function () {
                            return res.status(400).send({
                                error: true,
                                detail: error.code,
                                message: error.sqlMessage
                            });
                        });
                    }

                    dbConn.query('update tbl_user set coin_count = ? where id = ? ', [user_new_coin_count, results[0].id], function (error, sendResult) {
                        if (error) {
                            dbConn.rollback(function () {
                                return res.status(400).send({
                                    error: true,
                                    detail: error.code,
                                    message: error.sqlMessage
                                });
                            });
                        }

                        dbConn.commit(function (error) {
                            if (error) {
                                dbConn.rollback(function () {
                                    return res.status(400).send({
                                        error: true,
                                        detail: error.code,
                                        message: error.sqlMessage
                                    });
                                });
                            }
                            return res.send({
                                error: false,
                                user: [],
                                message: 'AI user Image Generation successfully...'
                            });
                        });
                    })
                })
            });
        })
    });
});

function getImageNameFromUrl(imageUrl) {
    const parsedUrl = new URL(imageUrl);
    return path.basename(parsedUrl.pathname);
}

const performTask = async () => {
    try {
        dbConn.query('SELECT * FROM tbl_temp_image where is_pending=? ORDER BY id ASC LIMIT 1', 0, function (error, results, fields) {
            if (error) {
                return res.status(400)
                    .send({
                        error: true,
                        detail: error.code,
                        message: GENERIC_SERVER_ERROR_MSG,
                    });
            }
            if (results.length > 0){
                const generationId = results[0].user_generation_id;

                let config = {
                    'method': 'GET',
                    'url': `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
                    'headers': {
                        'Authorization': 'Bearer e60d0535-d13a-4bec-8ab2-131c90478648'
                    }
                };

                request(config, async function (error, response) {
                    if (error) throw new Error(error);
                    let responseBody = JSON.parse(response.body);
                    if(responseBody.generations_by_pk.generated_images.length > 0){
                        const imgUrl = responseBody.generations_by_pk.generated_images[0].url;
                        const seed = responseBody.generations_by_pk.seed;
                        const tempFilePath = path.join(TEMP_UPLOAD_FOLDER, getImageNameFromUrl(imgUrl));
                        await downloadImage(imgUrl, tempFilePath, results[0].user_id, results[0].id);

                        dbConn.beginTransaction(function (error) {
                            if (error) return res.status(400).send({
                                error: true,
                                detail: error.code,
                                message: error.sqlMessage
                            });
                            dbConn.query('update tbl_temp_image set user_image_url = ?, seed_id = ?, is_pending = ? where id = ? ', [imgUrl, seed, 1, results[0].id], function (error, sendResult) {
                                if (error) {
                                    dbConn.rollback(function () {
                                        return res.status(400).send({
                                            error: true,
                                            detail: error.code,
                                            message: error.sqlMessage
                                        });
                                    });
                                }
                                dbConn.commit(function (error) {
                                    if (error) {
                                        dbConn.rollback(function () {
                                            return res.status(400).send({
                                                error: true,
                                                detail: error.code,
                                                message: error.sqlMessage
                                            });
                                        });
                                    }
                                });
                            })
                        })
                    }
                });
            }
        });
    } catch (error) {
        console.error('Error during task:', error);
    }
};

async function downloadImage(url, outputPath, user_id, tmp_id) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        request(url)
            .pipe(fs.createWriteStream(outputPath))
            .on('finish', async () => {
                console.log('Image downloaded successfully.');
                const parsedUrl = new URL(url);
                const imagePath = parsedUrl.pathname;
                const imageName = path.basename(imagePath);
                await processAndUploadImages(outputPath, imageName, user_id, tmp_id)
                resolve();
            })
            .on('error', (err) => {
                console.error('Error downloading image:', err.message);
                reject(err);
            });
    });
}

function resizeFile(fromPath, toPath, size) {
    return sharp(fromPath)
        .metadata()
        .then(metadata => {
            if (!['jpeg', 'png', 'webp', 'tiff', 'gif'].includes(metadata.format)) {
                throw new Error('Unsupported image format: ' + metadata.format);
            }

            const sharpInstance = sharp(fromPath);
            if (size === 512) {
                return sharpInstance
                    .jpeg()
                    .toFile(toPath);
            } else {
                return sharpInstance
                    .jpeg()
                    .resize(size, size)
                    .toFile(toPath);
            }
        })
        .catch(err => {
            console.error('Error processing image:', err.message);
            throw err;
        });
}

// function resizeFile(fromPath, toPath, size) {
//     if (size === 512) {
//         return sharp(fromPath)
//             .jpeg()
//             .toFile(toPath);
//     } else {
//         return sharp(fromPath)
//             .jpeg()
//             .resize(size, size)
//             .toFile(toPath);
//     }
// }

function createNewVideoInDatabase({
                                      userId,
                                      cdnId,
                                      cdnFilteredId,
                                      cdnId_128,
                                      cdnId_64,
                                        temp_id,
                                      // isPrimary = 1,
                                  }) {
    return new Promise((resolve, reject) => {
        dbConn.query('SELECT * FROM tbl_video WHERE user_id=? AND is_primary=1', userId, function(error, results, fields) {
            // if (error) return res.status(400).send({error: true, detail: error.code, message: error.sqlMessage});
            if (error) reject(error);
            let isPrimary = 1;
            if (results && results.length) {
                isPrimary = 0;
            }
            const videoData = {
                user_id: userId,
                cdn_id: cdnId,
                cdn_filtered_id: cdnFilteredId,
                cdn_id_128: cdnId_128,
                cdn_id_64: cdnId_64,
                created_date: new Date(),
                updated_date: new Date(),
                is_reply: 0,
                is_primary: isPrimary,
                publish: 1,
                match_id: null
            };
            dbConn.beginTransaction(function (error) {
                if (error) return res.status(400).send({
                    error: true,
                    detail: error.code,
                    message: error.sqlMessage
                });

                dbConn.query('INSERT INTO tbl_video SET ? ', videoData, (err, results) => {
                    if (err) reject(err);

                    dbConn.query('update tbl_temp_image set video_id = ? where id = ? ', [results.insertId, temp_id], function (error, sendResult) {
                        if (error) {
                            dbConn.rollback(function () {
                                return res.status(400).send({
                                    error: true,
                                    detail: error.code,
                                    message: error.sqlMessage
                                });
                            });
                        }
                        dbConn.commit(function (error) {
                            if (error) {
                                dbConn.rollback(function () {
                                    return res.status(400).send({
                                        error: true,
                                        detail: error.code,
                                        message: error.sqlMessage
                                    });
                                });
                            }
                            resolve(results);
                        });
                    })
                });
            })
        });
    })
}

async function processAndUploadImages(filePath, originalFileName, userId, tmp_id) {
    const promises = THUMBNAIL_SIZES.map(async (size) => {
        const thumbnailName = size === 512 ? `${originalFileName}.${DESIRED_FILE_EXTENSION}` : `thumb_${userId}_${tmp_id}_${size}_${originalFileName}.${DESIRED_FILE_EXTENSION}`;
        const processedFilePath = path.join(TEMP_UPLOAD_FOLDER, thumbnailName);
        const photoIdInBucket = size === 512 ? `${originalFileName}-screenshot` : `thumb_${userId}_${tmp_id}_${size}_${originalFileName}-screenshot`;

        const uploadOptions = {
            destination: photoIdInBucket,
            metadata: {
                cacheControl: 'public, max-age=4133869200',
            },
        };

        try {
            return resizeFile(filePath, processedFilePath, size)
                .then(() => bucket.upload(processedFilePath, uploadOptions))
                .then(() => bucket.file(photoIdInBucket).makePublic())
                .then(() => deleteFiles([processedFilePath]))
                .catch(err => {
                    console.error('something failed in resizeFile promise chain:', err.message);
                    deleteFiles([processedFilePath]);
                    throw err;
                });
        } catch (err) {
            console.error('Error processing thumbnail:', err.message);
            throw err;
        }
    });

    Promise.all(promises)
        .then(storageResponse => {
            createNewVideoInDatabase({
                userId: userId,
                cdnId: originalFileName,
                cdnFilteredId: originalFileName,
                cdnId_128: `thumb_${userId}_${tmp_id}_128_${originalFileName}`,
                cdnId_64: `thumb_${userId}_${tmp_id}_64_${originalFileName}`,
                temp_id: tmp_id,
            })
                .then(videoRecord => {

                })
                .catch(err => {
                    console.error(err);
                });

            deleteFiles([filePath])
                .then(() => {
                    fs.readdir(TEMP_UPLOAD_FOLDER, (err, res) => {
                        console.log(`${TEMP_UPLOAD_FOLDER} contents: ${res}`);
                    });
                });
        })
        .catch(e => {
            deleteFiles([filePath])
                .then(() => {
                    fs.readdir(TEMP_UPLOAD_FOLDER, (err, res) => {
                        console.log(`${TEMP_UPLOAD_FOLDER} contents: ${res}`);
                    });
                });
            console.error(e);
        });
}

// Schedule the cron job
cron.schedule('*/8 * * * * *', () => {
    console.log('Cron job running every 8 seconds');
    performTask();
});

module.exports = userApi;