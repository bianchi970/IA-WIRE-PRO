/**
 * IA Wire Pro — test.js
 * Test di integrazione minimali (nessuna dipendenza esterna).
 * Avvia il server internamente, esegue le chiamate HTTP, poi esce.
 *
 * Uso: node backend/test.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const http = require("http");

// Forza il server ad ascoltare su porta diversa per non confliggere
process.env.PORT = "3099";

let passed = 0;
let failed = 0;
const results = [];

function log(name, ok, detail) {
  var icon = ok ? "✅" : "❌";
  results.push({ name, ok, detail });
  console.log("  " + icon + " " + name + (detail ? " — " + detail : ""));
  if (ok) passed++; else failed++;
}

function req(opts, body) {
  return new Promise(function (resolve, reject) {
    var reqBody = body ? JSON.stringify(body) : null;
    var options = Object.assign({
      hostname: "localhost",
      port: 3099,
      headers: {}
    }, opts);
    if (reqBody) {
      options.headers["Content-Type"] = "application/json";
      options.headers["Content-Length"] = Buffer.byteLength(reqBody);
    }
    var r = http.request(options, function (res) {
      var data = "";
      res.on("data", function (c) { data += c; });
      res.on("end", function () {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on("error", reject);
    if (reqBody) r.write(reqBody);
    r.end();
  });
}

async function runTests() {
  console.log("\n🧪 IA Wire Pro — Test suite\n");

  // ── TEST 1: GET /health → 200, ok:true ─────────────────────────
  try {
    var r1 = await req({ method: "GET", path: "/health" });
    var ok1 = r1.status === 200 && r1.body && r1.body.ok === true;
    log("GET /health → 200 + ok:true", ok1, "status=" + r1.status);
  } catch (e) {
    log("GET /health", false, e.message);
  }

  // ── TEST 2: POST /api/chat con messaggio tecnico ───────────────
  try {
    var r2 = await req(
      { method: "POST", path: "/api/chat" },
      { message: "Il differenziale scatta continuamente sulla linea cucina.", history: [] }
    );
    var ok2 = r2.status === 200 && r2.body && typeof r2.body.answer === "string" && r2.body.answer.length > 20;
    log("POST /api/chat (messaggio tecnico) → 200 + answer", ok2, "status=" + r2.status + (r2.body ? ", provider=" + r2.body.provider : ""));
  } catch (e) {
    log("POST /api/chat (tecnico)", false, e.message);
  }

  // ── TEST 3: POST /api/chat senza body → 400 ───────────────────
  try {
    var r3 = await req({ method: "POST", path: "/api/chat" }, {});
    var ok3 = r3.status === 400;
    log("POST /api/chat (vuoto) → 400", ok3, "status=" + r3.status);
  } catch (e) {
    log("POST /api/chat (vuoto)", false, e.message);
  }

  // ── TEST 4: GET /api/admin/stats senza token → 401 ────────────
  try {
    var r4 = await req({ method: "GET", path: "/api/admin/stats" });
    var ok4 = r4.status === 401;
    log("GET /api/admin/stats (no token) → 401", ok4, "status=" + r4.status);
  } catch (e) {
    log("GET /api/admin/stats", false, e.message);
  }

  // ── TEST 5: GET /api/engine/test → 200 + diagnostic ──────────
  try {
    var r5 = await req({ method: "GET", path: "/api/engine/test" });
    var ok5 = r5.status === 200 && r5.body && r5.body.ok === true && r5.body.diagnostic;
    log("GET /api/engine/test → 200 + diagnostic", ok5, "status=" + r5.status);
  } catch (e) {
    log("GET /api/engine/test", false, e.message);
  }

  // ── SUMMARY ───────────────────────────────────────────────────
  console.log("\n─────────────────────────────────");
  console.log("  Risultato: " + passed + "/" + (passed + failed) + " PASS");
  if (failed > 0) {
    console.log("  ⚠️  " + failed + " test falliti");
    process.exitCode = 1;
  } else {
    console.log("  🎉 Tutti i test superati!");
  }
  console.log("─────────────────────────────────\n");
  process.exit(process.exitCode || 0);
}

// Avvia il server e aspetta che sia pronto
require("./server");
setTimeout(runTests, 2500);
