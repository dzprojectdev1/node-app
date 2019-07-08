var mysql = require('mysql');

// connection configurations
var dbConn = mysql.createConnection({
    host: 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'dzproject'
});
  
// connect to database
dbConn.connect(); 

module.exports = dbConn;