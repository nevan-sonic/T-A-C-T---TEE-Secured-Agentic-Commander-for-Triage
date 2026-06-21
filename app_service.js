const { Pool } = require("pg");
const poolConfig = {
  host: "localhost",
  port: 5432,
  database: "production_db",
  max: 500,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
};
const dbPool = new Pool(poolConfig);
module.exports = { dbPool, poolConfig };