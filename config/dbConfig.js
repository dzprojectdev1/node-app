const fs = require('fs');
const path = require('path');
var mysql = require('mysql2');

var mysqlConfig = {
  connectionLimit: 10,
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: process.env.CHARSET || 'utf8mb4',
};

if (process.env.CLOUD_SQL_CONNECTION_NAME) {
  console.log(`App Engine detected. Using Cloud SQL socket.`);
  mysqlConfig.socketPath = `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`;
} else if (process.env.USE_SSL === 'true') {
  console.log('Using SSL connection.');
  mysqlConfig.ssl = {
    ca: fs.readFileSync(path.join(__dirname, 'server-ca.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'client-cert.pem')),
    key: fs.readFileSync(path.join(__dirname, 'client-key.pem'))
  };
} else {
  console.log('Using direct connection (no SSL).');
}

// Pool for all regular (non-transaction) queries.
const pool = mysql.createPool(mysqlConfig);

/**
 * Helper for transactions.
 * mysql2's pool does not implement `beginTransaction` directly; you must
 * acquire a dedicated connection first.
 */
async function getConnection() {
  // `pool.promise()` returns a promise-enabled wrapper for mysql2.
  return pool.promise().getConnection();
}

// Export a wrapper so `dbConn.getConnection()` does not overwrite mysql2's
// native `pool.getConnection`, which `pool.promise()` depends on internally.
const dbConn = Object.create(pool);
dbConn.query = pool.query.bind(pool);
dbConn.execute = pool.execute.bind(pool);
dbConn.end = pool.end.bind(pool);
dbConn.pool = pool;
dbConn.getConnection = getConnection;

module.exports = dbConn;