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
}
// connection configurations
var dbConn = mysql.createPool(mysqlConfig);

module.exports = dbConn;