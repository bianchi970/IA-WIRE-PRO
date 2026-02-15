require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { pool } = require("./db");

(async () => {
  try {
    const sqlPath = path.join(__dirname, "schema.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    await pool.query(sql);
    console.log("✅ Migrazione completata (schema.sql applicato)");
  } catch (err) {
    console.error("❌ Migrazione fallita:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
