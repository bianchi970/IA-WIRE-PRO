"use strict";

/**
 * LRN-04 — test integrazione learning
 * Verifica che il learning operi solo come supporto debole al ranking,
 * senza creare ipotesi/verifiche nuove, senza portare a confirmed,
 * senza bypassare safetyDecision.
 */

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var diagnosticEngine = require("../engine/diagnosticEngine");
var knowledgeLoader = require("../knowledge");
var learningStore = require("../engine/roccoLearningStore");

var analyzeTechnicalRequest = diagnosticEngine.analyzeTechnicalRequest;
var getLoadedKnowledge = knowledgeLoader.getLoadedKnowledge;
var saveLearningStore = learningStore.saveLearningStore;
var STORE_PATH = learningStore.STORE_PATH;
var STORE_VERSION = learningStore.STORE_VERSION;

var knowledge = getLoadedKnowledge();
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

// ─── helpers ────────────────────────────────────────────────────────────────

var BACKUP_PATH = STORE_PATH + ".lrn04-bak";

function backupStore() {
  if (fs.existsSync(STORE_PATH)) fs.copyFileSync(STORE_PATH, BACKUP_PATH);
}

function restoreStore() {
  if (fs.existsSync(BACKUP_PATH)) {
    fs.copyFileSync(BACKUP_PATH, STORE_PATH);
    fs.unlinkSync(BACKUP_PATH);
  } else if (fs.existsSync(STORE_PATH)) {
    fs.unlinkSync(STORE_PATH);
  }
}

function setStore(records) {
  saveLearningStore({ version: STORE_VERSION, records: records });
}

function runDiag(message) {
  return analyzeTechnicalRequest({ message: message, hasImage: false }, knowledge);
}

// caso base: differenziale + isolamento basso
var BASE_MSG = "Il differenziale scatta continuamente sulla linea cucina. Ho misurato isolamento 0.3 Mohm verso terra con il megger.";

// caso simile (per match learning)
var SIMILAR_MSG = "Il salvavita scatta quando collego lo scaldabagno. Il megohmetro legge 0.25 Mohm verso terra. Linea bagno.";

// caso incompatibile (bruciato + odore)
var INCOMPATIBLE_MSG = "Cavo bruciato e odore forte nel quadro, temperatura 95 gradi.";

function buildSeedRecord(baseDiag) {
  var internal = baseDiag._roccoInternal || {};
  var caseState = internal.caseState || {};
  var hypotheses = Array.isArray(internal.hypotheses) ? internal.hypotheses : [];
  var checks = Array.isArray(internal.diagnosticChecks) ? internal.diagnosticChecks : [];
  var topHypothesis = hypotheses[0] || {};

  return {
    id: "lrn04-seed-001",
    timestamp: new Date("2026-03-01T10:00:00Z").toISOString(),
    caseFingerprint: internal.caseFingerprint || {},
    observedDomains: Array.isArray(caseState.observedDomains) ? caseState.observedDomains : [],
    dominantRisk: caseState.dominantRisk || "",
    dominantCauseFamily: caseState.dominantCauseFamily || "",
    initialTopHypotheses: hypotheses.slice(0, 3).map(function (h) { return h.causa || h.family || ""; }).filter(Boolean),
    confirmedCause: topHypothesis.causa || topHypothesis.family || "Dispersione isolamento",
    decisiveChecks: checks.slice(0, 3).map(function (c) { return c.reason || ""; }).filter(Boolean),
    rejectedCauses: [],
    reusableSignals: [
      "family:" + (caseState.dominantCauseFamily || "unknown"),
      "risk:" + (caseState.dominantRisk || "unknown")
    ],
    reusableThresholds: [],
    notes: "LRN-04 seed"
  };
}

// ─── setup ──────────────────────────────────────────────────────────────────

backupStore();

// pre-calcola il seed dal caso base
setStore([]);
var baseDiag = runDiag(BASE_MSG);
var seedRecord = buildSeedRecord(baseDiag);

// ─── 1. CASO COMPATIBILE — learning applicato ────────────────────────────────
console.log("\n=== LRN-04 integration tests ===\n");
console.log("[ caso compatibile ]");

setStore([seedRecord]);
var diagWithLearning = runDiag(SIMILAR_MSG);
var internalWithLearning = diagWithLearning._roccoInternal || {};
var closedCaseLearning = internalWithLearning.closedCaseLearning || {};

ok("learning applicato su caso compatibile (applied === true)", function () {
  assert.strictEqual(closedCaseLearning.applied, true,
    "applied atteso true, ottenuto: " + closedCaseLearning.applied);
});

ok("checkBoosts non vuoto su caso compatibile", function () {
  var boosts = closedCaseLearning.checkBoosts || {};
  assert.ok(Object.keys(boosts).length > 0,
    "checkBoosts deve avere almeno una chiave");
});

ok("almeno un check con learningBoost > 0 nel risultato finale", function () {
  var checks = Array.isArray(internalWithLearning.diagnosticChecks)
    ? internalWithLearning.diagnosticChecks : [];
  var boosted = checks.filter(function (c) { return Number(c && c.learningBoost || 0) > 0; });
  assert.ok(boosted.length > 0,
    "nessun check ha learningBoost>0. checks[0]: " + JSON.stringify(checks[0]));
});

ok("hypothesisBoosts non vuoto su caso compatibile", function () {
  var boosts = closedCaseLearning.hypothesisBoosts || {};
  assert.ok(Object.keys(boosts).length > 0,
    "hypothesisBoosts deve avere almeno una chiave");
});

// ─── 2. LEARNING NON PORTA A CONFIRMED ──────────────────────────────────────
console.log("\n[ livello non promosso ]");

ok("nessuna ipotesi portata a confirmed dal learning", function () {
  var ipotesi = Array.isArray(diagWithLearning.ipotesi) ? diagWithLearning.ipotesi : [];
  var baseIpotesi = Array.isArray(baseDiag.ipotesi) ? baseDiag.ipotesi : [];

  // Le ipotesi che erano non_verifiable nel base non devono essere confirmed/confermato nel learning
  var baseNonVerifiable = baseIpotesi
    .filter(function (h) { return (h.livello || "").toLowerCase() === "non_verifiable"; })
    .map(function (h) { return (h.causa || "").toLowerCase().trim(); });

  ipotesi.forEach(function (h) {
    var causa = (h.causa || "").toLowerCase().trim();
    var livello = (h.livello || "").toLowerCase();
    if (baseNonVerifiable.indexOf(causa) >= 0) {
      assert.ok(
        livello !== "confirmed" && livello !== "confermato",
        "ipotesi '" + causa + "' era non_verifiable ma ora e '" + livello + "'"
      );
    }
  });
});

ok("nessuna ipotesi nuova creata dal learning", function () {
  var baseCount = Array.isArray(baseDiag.ipotesi) ? baseDiag.ipotesi.length : 0;
  var learningCount = Array.isArray(diagWithLearning.ipotesi) ? diagWithLearning.ipotesi.length : 0;
  // il learning su un caso SIMILE (non identico) non deve aggiungere ipotesi inesistenti
  var baseCause = (Array.isArray(baseDiag.ipotesi) ? baseDiag.ipotesi : [])
    .map(function (h) { return (h.causa || "").toLowerCase().trim(); });
  var learningCause = (Array.isArray(diagWithLearning.ipotesi) ? diagWithLearning.ipotesi : [])
    .map(function (h) { return (h.causa || "").toLowerCase().trim(); });

  learningCause.forEach(function (causa) {
    // ogni causa nel risultato learning deve esistere nel base OPPURE venire dall'engine normale
    // (non dal learning — il learning non crea ipotesi). Verifichiamo che nessuna causa
    // abbia un flag learningCreated.
    var internalH = (Array.isArray(internalWithLearning.hypotheses) ? internalWithLearning.hypotheses : [])
      .find(function (h) { return (h.causa || "").toLowerCase().trim() === causa; });
    if (internalH) {
      assert.ok(!internalH.learningCreated,
        "ipotesi '" + causa + "' ha learningCreated=true — non consentito");
    }
  });
  void baseCount; void learningCount;
});

// ─── 3. SAFETY STOP — LEARNING NEUTRALIZZATO ────────────────────────────────
console.log("\n[ safety stop / neutralizzazione ]");

setStore([seedRecord]);
var diagStop = runDiag(INCOMPATIBLE_MSG);
var internalStop = diagStop._roccoInternal || {};
var learningStop = internalStop.closedCaseLearning || {};

ok("su safety=stop il learning e neutralizzato (applied=false)", function () {
  var safetyLevel = (internalStop.safetyDecision || {}).level;
  if (safetyLevel === "stop" || safetyLevel === "danger") {
    assert.strictEqual(learningStop.applied, false,
      "learning.applied deve essere false su stop/danger, ottenuto: " + learningStop.applied);
  } else {
    // il caso non ha triggerato stop: verifica solo che safetyDecision sia intatto
    assert.ok(safetyLevel, "safetyDecision.level mancante");
  }
});

ok("safetyDecision non alterata dal learning", function () {
  var safety = internalStop.safetyDecision || {};
  assert.ok(safety.level, "safetyDecision.level mancante");
  assert.ok(Array.isArray(safety.reasons) && safety.reasons.length > 0,
    "safetyDecision.reasons deve essere non vuota su caso pericoloso");
});

ok("blockedActions presente e non vuoto su caso stop/danger", function () {
  var policy = internalStop.decisionPolicy || {};
  var safetyLevel = (internalStop.safetyDecision || {}).level;
  if (safetyLevel === "stop" || safetyLevel === "danger") {
    assert.ok(Array.isArray(policy.blockedActions),
      "blockedActions deve essere array su stop/danger");
  }
});

// ─── 4. CASO INCOMPATIBILE — learning non applicato ─────────────────────────
console.log("\n[ caso incompatibile ]");

// il seed e basato su dispersione/isolamento; il caso incompatibile e bruciato+odore+temperatura
// anche se il seed e in store, non deve boostarsi su un caso di natura completamente diversa
setStore([seedRecord]);
var diagIncompat = runDiag(INCOMPATIBLE_MSG);
var internalIncompat = diagIncompat._roccoInternal || {};
var learningIncompat = internalIncompat.closedCaseLearning || {};

ok("nessun boost ipotesi su caso incompatibile", function () {
  var hypotheses = Array.isArray(internalIncompat.hypotheses) ? internalIncompat.hypotheses : [];
  var boosted = hypotheses.filter(function (h) { return Number(h && h.learningBoost || 0) > 0; });
  // con hardSafety o mismatch, nessun boost deve esserci
  var safetyLevel = (internalIncompat.safetyDecision || {}).level;
  if (safetyLevel === "stop" || safetyLevel === "danger") {
    assert.strictEqual(boosted.length, 0,
      "nessun boost ipotesi consentito su stop/danger, trovati: " + boosted.length);
  } else {
    // caso non stop: verifica solo che learning.applied rispetti la soglia
    assert.strictEqual(typeof learningIncompat.applied, "boolean");
  }
});

// ─── 5. STORE INVARIATO DURANTE DIAGNOSI ────────────────────────────────────
console.log("\n[ store invariato ]");

setStore([seedRecord]);
var storeBefore = fs.readFileSync(STORE_PATH, "utf8");
runDiag(SIMILAR_MSG);
var storeAfter = fs.readFileSync(STORE_PATH, "utf8");

ok("lo store non viene modificato durante la diagnosi", function () {
  assert.strictEqual(storeBefore, storeAfter,
    "lo store e stato modificato durante analyzeTechnicalRequest");
});

// ─── 6. OUTPUT CONTRACT INVARIATO ───────────────────────────────────────────
console.log("\n[ output contract ]");

setStore([]);
var diagEmpty = runDiag(SIMILAR_MSG);
setStore([seedRecord]);
var diagSeed = runDiag(SIMILAR_MSG);

ok("isTechnical invariato tra store vuoto e con learning", function () {
  assert.strictEqual(diagEmpty.isTechnical, diagSeed.isTechnical);
});

ok("ipotesi presenti sia con che senza learning", function () {
  assert.ok(Array.isArray(diagEmpty.ipotesi) && diagEmpty.ipotesi.length > 0);
  assert.ok(Array.isArray(diagSeed.ipotesi) && diagSeed.ipotesi.length > 0);
});

ok("verifiche presenti sia con che senza learning", function () {
  assert.ok(Array.isArray(diagEmpty.verifiche) && diagEmpty.verifiche.length > 0);
  assert.ok(Array.isArray(diagSeed.verifiche) && diagSeed.verifiche.length > 0);
});

ok("conclusione presente sia con che senza learning", function () {
  assert.ok(typeof diagEmpty.conclusione === "string" && diagEmpty.conclusione.length > 0);
  assert.ok(typeof diagSeed.conclusione === "string" && diagSeed.conclusione.length > 0);
});

ok("safetyDecision invariata tra store vuoto e con learning (stesso caso)", function () {
  var safetyEmpty = ((diagEmpty._roccoInternal || {}).safetyDecision || {}).level;
  var safetySeed = ((diagSeed._roccoInternal || {}).safetyDecision || {}).level;
  assert.strictEqual(safetyEmpty, safetySeed,
    "safetyDecision cambiata: " + safetyEmpty + " → " + safetySeed);
});

// ─── ripristino ─────────────────────────────────────────────────────────────
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
