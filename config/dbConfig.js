var mysql = require('mysql');

// connection configurations
var dbConn = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'dzproject'
});
  
// connect to database
dbConn.connect(); 

module.exports = dbConn;