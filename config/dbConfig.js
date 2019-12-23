const fs = require('fs');
const path = require('path');
var mysql = require('mysql');

var mysqlConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: process.env.CHARSET,
};

if (process.env.CLOUD_SQL_CONNECTION_NAME) {
  console.log(`This is App Engine. Proceeding to configure mysql with socketPath "/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}".`)
  mysqlConfig.socketPath = `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`;
} else {
  console.log('hello')
  mysqlConfig.ssl = {
    ca: fs.readFileSync(__dirname + '/server-ca.pem'),
    cert: fs.readFileSync(__dirname + '/client-cert.pem'),
    key: fs.readFileSync(__dirname + '/client-key.pem')
  };
}
console.log(mysqlConfig)
var dbConn = mysql.createConnection(mysqlConfig);

dbConn.connect(); 

module.exports = dbConn;