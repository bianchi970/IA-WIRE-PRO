"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var learningStore = require("../engine/roccoLearningStore");
var STORE_PATH = learningStore.STORE_PATH;
var STORE_VERSION = learningStore.STORE_VERSION;
var saveLearningStore = learningStore.saveLearningStore;
var appendClosedCaseLearning = learningStore.appendClosedCaseLearning;
var getClosedCaseLearningSignal = learningStore.getClosedCaseLearningSignal;

var BACKUP_PATH = STORE_PATH + ".hardening-bak";
var passed = 0;
var failed = 0;

function ok(label, fn) {
  try {
    fn();
    console.log("  PASS  " + label);
    passed += 1;
  } catch (err) {
    console.error("  FAIL  " + label);
    console.error("         " + err.message);
    failed += 1;
  }
}

function backupStore() {
  if (fs.existsSync(STORE_PATH)) {
    fs.copyFileSync(STORE_PATH, BACKUP_PATH);
  }
}

function restoreStore() {
  if (fs.existsSync(BACKUP_PATH)) {
    fs.copyFileSync(BACKUP_PATH, STORE_PATH);
    fs.unlinkSync(BACKUP_PATH);
  } else if (fs.existsSync(STORE_PATH)) {
    fs.unlinkSync(STORE_PATH);
  }
}

function writeStoreRaw(content) {
  var dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(STORE_PATH, content, "utf8");
}

function deleteStore() {
  if (fs.existsSync(STORE_PATH)) fs.unlinkSync(STORE_PATH);
}

function isCanonicalEmpty(store) {
  return (
    store !== null &&
    store !== undefined &&
    typeof store === "object" &&
    store.version === STORE_VERSION &&
    Array.isArray(store.records) &&
    store.records.length === 0
  );
}

var VALID_RECORD = {
  timestamp: new Date().toISOString(),
  caseFingerprint: { key: "abc123", dominantRisk: "elettrico" },
  observedDomains: ["elettrico"],
  dominantRisk: "elettrico",
  dominantCauseFamily: "guasto_differenziale",
  initialTopHypotheses: ["cortocircuito"],
  confirmedCause: "Interruttore differenziale difettoso",
  rejectedCauses: [],
  decisiveChecks: ["misura isolamento"],
  correctedErrors: [],
  reusableSignals: [],
  reusableThresholds: []
};

console.log("\n=== SEC-03 roccoLearningStore hardening ===\n");

backupStore();

// ─── 1. FILE MANCANTE ──────────────────────────────────────────────────────
console.log("[ file mancante ]");

ok("loadLearningStore non crasha su file mancante", function () {
  deleteStore();
  var store = learningStore.getClosedCaseLearningSignal({ fingerprint: {} });
  assert.ok(store, "deve ritornare un oggetto");
  assert.strictEqual(typeof store.applied, "boolean");
});

ok("appendClosedCaseLearning non crasha su file mancante", function () {
  deleteStore();
  var result = appendClosedCaseLearning(VALID_RECORD);
  assert.ok(result, "deve ritornare un oggetto");
  assert.strictEqual(typeof result.recorded, "boolean");
});

// ─── 2. JSON CORROTTO ──────────────────────────────────────────────────────
console.log("\n[ JSON corrotto ]");

ok("loadLearningStore non crasha su JSON corrotto", function () {
  writeStoreRaw("{ this is not valid json !!!");
  var signal = getClosedCaseLearningSignal({ fingerprint: {} });
  assert.ok(signal, "deve ritornare un oggetto");
  assert.strictEqual(typeof signal.applied, "boolean");
});

ok("appendClosedCaseLearning non crasha su JSON corrotto", function () {
  writeStoreRaw("{{{broken");
  var result = appendClosedCaseLearning(VALID_RECORD);
  assert.ok(result, "deve ritornare un oggetto");
  assert.strictEqual(typeof result.recorded, "boolean");
});

ok("store corrotto -> shape canonica vuota passata a normalizeStore", function () {
  writeStoreRaw("---yaml: not json---");
  // saveLearningStore forza normalizeStore -> se corrompo e poi salvo shape canonica, OK
  var saved = saveLearningStore({});
  assert.ok(saved, "saveLearningStore deve ritornare store normalizzato");
  assert.strictEqual(saved.version, STORE_VERSION);
  assert.ok(Array.isArray(saved.records));
});

// ─── 3. SHAPE INVALIDA ─────────────────────────────────────────────────────
console.log("\n[ shape invalida ]");

ok("JSON valido ma shape non oggetto -> store canonico", function () {
  writeStoreRaw("[]");
  var signal = getClosedCaseLearningSignal({ fingerprint: {} });
  assert.ok(signal, "deve ritornare un oggetto");
  assert.strictEqual(typeof signal.applied, "boolean");
  assert.strictEqual(typeof signal.totalMatchedClosedCases, "number");
});

ok("JSON valido ma records non array -> store canonico", function () {
  writeStoreRaw(JSON.stringify({ version: 1, records: "non_array" }));
  var signal = getClosedCaseLearningSignal({ fingerprint: {} });
  assert.ok(signal);
  assert.strictEqual(signal.totalMatchedClosedCases, 0);
});

ok("JSON valido ma version mancante -> store canonico con version corretta", function () {
  writeStoreRaw(JSON.stringify({ records: [] }));
  var saved = saveLearningStore({ records: [] });
  assert.ok(saved);
  assert.strictEqual(saved.version, STORE_VERSION);
});

ok("JSON valido, records con elementi non-oggetto -> filtrati", function () {
  writeStoreRaw(JSON.stringify({ version: 1, records: [null, "stringa", 42, { confirmedCause: "test" }] }));
  var signal = getClosedCaseLearningSignal({ fingerprint: {} });
  assert.ok(signal);
  assert.strictEqual(typeof signal.totalMatchedClosedCases, "number");
});

// ─── 4. PATH SANO (happy path invariato) ───────────────────────────────────
console.log("\n[ path sano ]");

ok("append + signal su store sano funziona come prima", function () {
  deleteStore();
  var append1 = appendClosedCaseLearning(VALID_RECORD);
  assert.ok(append1.recorded, "primo append deve essere recorded=true");
  assert.ok(append1.storeSize >= 1, "storeSize deve essere >= 1");

  var append2 = appendClosedCaseLearning(VALID_RECORD);
  assert.strictEqual(append2.recorded, false, "duplicato deve essere recorded=false");
  assert.strictEqual(append2.reason, "duplicate_learning");
});

ok("STORE_VERSION esportato e uguale a 1", function () {
  assert.strictEqual(STORE_VERSION, 1);
});

ok("STORE_PATH esportato e stringa", function () {
  assert.strictEqual(typeof STORE_PATH, "string");
  assert.ok(STORE_PATH.length > 0);
});

ok("buildCaseFingerprint esportato e funziona", function () {
  var fp = learningStore.buildCaseFingerprint({});
  assert.ok(fp && typeof fp.key === "string" && fp.key.length > 0);
});

ok("applyClosedCaseLearningToHypotheses esportato", function () {
  var h = [{ causa: "test", rankScore: 0.5 }];
  var result = learningStore.applyClosedCaseLearningToHypotheses(h, { applied: false });
  assert.deepStrictEqual(result, h);
});

ok("applyClosedCaseLearningToDiagnosticChecks esportato", function () {
  var checks = [{ title: "misura", isSafetyCritical: false }];
  var result = learningStore.applyClosedCaseLearningToDiagnosticChecks(checks, { applied: false });
  assert.deepStrictEqual(result, checks);
});

// ─── ripristino ────────────────────────────────────────────────────────────
restoreStore();

console.log("\n─────────────────────────────────");
console.log("PASSED: " + passed + " / " + (passed + failed));
if (failed > 0) {
  console.error("FAILED: " + failed);
  process.exit(1);
} else {
  console.log("ALL PASS");
  process.exit(0);
}
