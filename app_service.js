const { Pool } = require("pg");
const poolConfig = {
  host: "localhost",
  port: 5432,
  database: "production_db",
  // Increased database connection limit to alleviate connection timeouts and deadlocks
  max: 100,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};
const dbPool = new Pool(poolConfig);
module.exports = { dbPool, poolConfig };