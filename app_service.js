const { Pool } = require("pg");
const poolConfig = {
  host: "localhost",
  port: 5432,
  database: "production_db",
  // Database connection limit
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};
const dbPool = new Pool(poolConfig);
module.exports = { dbPool, poolConfig };