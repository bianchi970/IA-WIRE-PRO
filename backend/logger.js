/**
 * IA Wire Pro — logger.js
 * Winston logger centralizzato.
 *
 * In sviluppo (NODE_ENV != production):  output colorato su console.
 * In produzione (NODE_ENV=production):   JSON su console + file backend/logs/app.log.
 */

const path    = require("path");
const fs      = require("fs");
const winston = require("winston");

const isProd = (process.env.NODE_ENV || "development") === "production";

const transports = [];

// ── Console ──────────────────────────────────────────────────────
if (isProd) {
  transports.push(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }));
} else {
  transports.push(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: "HH:mm:ss" }),
      winston.format.printf(function (info) {
        return info.timestamp + " [" + info.level + "] " + info.message;
      })
    )
  }));
}

// ── File (solo in produzione) ─────────────────────────────────────
if (isProd) {
  var logsDir = path.join(__dirname, "logs");
  if (!fs.existsSync(logsDir)) {
    try { fs.mkdirSync(logsDir, { recursive: true }); } catch (e) { /* ignora */ }
  }
  transports.push(new winston.transports.File({
    filename: path.join(logsDir, "app.log"),
    maxsize:  5 * 1024 * 1024, // 5MB
    maxFiles: 5,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }));
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports: transports,
  exitOnError: false
});

module.exports = logger;
