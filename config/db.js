const mysql = require('mysql2/promise');
require('dotenv').config();

const createPool = (host, user, password, database) => {
  return mysql.createPool({
    host,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8_general_ci',
    dateStrings: true,
    timezone: '+08:00',
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    authPlugins: {
      mysql_clear_password: () => () => Buffer.from(password + '\0'),
    },
    authSwitchHandler: (data, cb) => {
      if (data.pluginName === 'mysql_clear_password') {
        cb(null, Buffer.from(password + '\0'));
      }
    },
  });
};

// ✅ Wraps pool.query so transient network errors retry once automatically
const RETRYABLE_CODES = ['ETIMEDOUT', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST'];

const withRetry = (pool, label) => {
  const originalQuery = pool.query.bind(pool);

  pool.query = async (sql, params) => {
    try {
      return await originalQuery(sql, params);
    } catch (err) {
      if (RETRYABLE_CODES.includes(err.code)) {
        console.warn(`[${label}] Query failed with ${err.code}, retrying once...`);
        return await originalQuery(sql, params);
      }
      throw err;
    }
  };

  return pool;
};

// Create connection pools for each database
const pools = {
  default: createPool(
    process.env.DB_HOST,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    process.env.DB_NAME,
  ),
  luzon: createPool(
    process.env.LUZON_DB_HOST,
    process.env.LUZON_DB_USER,
    process.env.LUZON_DB_PASSWORD,
    process.env.LUZON_DB_NAME,
  ),
  vismin: createPool(
    process.env.VISMIN_DB_HOST,
    process.env.VISMIN_DB_USER,
    process.env.VISMIN_DB_PASSWORD,
    process.env.VISMIN_DB_NAME,
  ),
  mlgroup: createPool(
    process.env.MLGROUP_DB_HOST,
    process.env.MLGROUP_DB_USER,
    process.env.MLGROUP_DB_PASSWORD,
    process.env.MLGROUP_DB_NAME,
  ),
  visminRec: createPool(
    process.env.VISMIN_REC_DB_HOST,
    process.env.VISMIN_REC_DB_USER,
    process.env.VISMIN_REC_DB_PASSWORD,
    process.env.VISMIN_REC_DB_NAME,
  ),
  visminReq: createPool(
    process.env.VISMIN_REQ_DB_HOST,
    process.env.VISMIN_REQ_DB_USER,
    process.env.VISMIN_REQ_DB_PASSWORD,
    process.env.VISMIN_REQ_DB_NAME,
  ),
  hrmddbReq: createPool(
    process.env.HRMDDB_REQ_DB_HOST,
    process.env.HRMDDB_REQ_DB_USER,
    process.env.HRMDDB_REQ_DB_PASSWORD,
    process.env.HRMDDB_REQ_DB_NAME,
  ),
};

// ✅ Apply retry wrapper to every pool
Object.entries(pools).forEach(([key, pool]) => withRetry(pool, key));

module.exports = pools;
