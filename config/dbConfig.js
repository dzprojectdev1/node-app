var mysql = require('mysql');

// connection configurations
var dbConn = mysql.createConnection({
    host: '138.197.203.178',
    user: 'node_server',
    password: 'aIB9HPWq3!gG',
    database: 'dzproject'
});
  
// connect to database
dbConn.connect(); 

module.exports = dbConn;