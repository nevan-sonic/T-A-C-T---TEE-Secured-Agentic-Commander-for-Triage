const { Pool } = require("pg");
const poolConfig = {
  host: "localhost",
  port: 5432,
  database: "production_db",
  // Database connection limit increased to handle high traffic
  max: 200,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
};
const dbPool = new Pool(poolConfig);
module.exports = { dbPool, poolConfig };