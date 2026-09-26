"use strict";

var assert = require("assert");
var ni = require("../neural_integration");

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ✓ " + name);
  } catch(e) {
    failed++;
    console.log("  ✗ " + name + ": " + e.message);
  }
}

console.log("\n=== NEURAL INTEGRATION TESTS ===\n");

// --- Init ---
test("init completa senza errori", function() {
  var result = ni.init({ autoWarmup: true });
  assert(result.initialized === true);
});

test("getStats ritorna struttura corretta", function() {
  var stats = ni.getStats();
  assert(stats.initialized === true);
  assert(typeof stats.language === "object");
  assert(typeof stats.patterns === "object");
  assert(typeof stats.knowledge === "object");
  assert(typeof stats.memory === "object");
});

test("warmup popola tutti i moduli", function() {
  var stats = ni.getStats();
  assert(stats.language.vocabolarioSize > 0, "vocabolario vuoto");
  assert(stats.knowledge.totalNodi > 0, "knowledge vuoto");
  assert(stats.patterns.faultNetEpochs > 0, "patterns non addestrato");
});

// --- Hook 1: scoreHypotheses ---
var mockCS = {
  problem_summary: "il differenziale scatta",
  components_detected: ["RCD"],
  facts_confirmed: ["scatta quando accendo la lavatrice"],
  measurements: [],
  domain: "elettrico"
};

test("scoreHypotheses arricchisce ipotesi con neural_score", function() {
  var hyps = [
    { label: "dispersione su carico", status: "active", catena: [] },
    { label: "cortocircuito", status: "active", catena: [] },
    { label: "ipotesi rejected", status: "rejected", catena: [] }
  ];
  var result = ni.scoreHypotheses(hyps, mockCS);
  assert(result[0].neural_score !== undefined, "manca neural_score su h[0]");
  assert(result[1].neural_score !== undefined, "manca neural_score su h[1]");
  assert(result[2].neural_score === undefined, "rejected non dovrebbe avere score");
});

test("scoreHypotheses non crasha con array vuoto", function() {
  var result = ni.scoreHypotheses([], mockCS);
  assert(result.length === 0);
});

test("scoreHypotheses neural_detail presente", function() {
  var hyps = [{ label: "test", status: "active", catena: [] }];
  var result = ni.scoreHypotheses(hyps, mockCS);
  assert(result[0].neural_detail, "manca neural_detail");
  assert(typeof result[0].neural_detail.knowledge === "number");
  assert(typeof result[0].neural_detail.pattern === "number");
  assert(typeof result[0].neural_detail.memory === "number");
});

// --- Hook 2: enhanceCounterfactual ---
test("enhanceCounterfactual arricchisce risultato", function() {
  var cfResult = { valutazione: { plausibilita: 0.5, matching: 1, contradicting: 0 } };
  var result = ni.enhanceCounterfactual(
    { label: "dispersione" },
    cfResult,
    mockCS
  );
  assert(result.neural_predictions !== undefined || result === cfResult);
});

// --- Hook 3: findSimilarCases ---
test("findSimilarCases ritorna array", function() {
  var result = ni.findSimilarCases(mockCS, 3);
  assert(Array.isArray(result));
});

// --- Hook 4: scoreActionInformativeness ---
test("scoreActionInformativeness arricchisce azione", function() {
  var action = { action: "misurare isolamento", type: "test" };
  var hyps = [{ label: "dispersione", status: "active" }];
  var result = ni.scoreActionInformativeness(action, hyps, mockCS);
  assert(result.neural_discrimination_score !== undefined || result === action);
});

test("scoreActionInformativeness non crasha con null", function() {
  var result = ni.scoreActionInformativeness(null, [], mockCS);
  assert(result === null);
});

// --- Hook 5: detectNovelty ---
test("detectNovelty ritorna struttura corretta", function() {
  var result = ni.detectNovelty({}, mockCS);
  assert(typeof result.novel === "boolean");
  assert(typeof result.novelty_score === "number");
});

// --- Hook 6: shouldCallAI ---
test("shouldCallAI con ipotesi attive", function() {
  var hyps = [
    { label: "dispersione", status: "active", neural_score: 0.8 },
    { label: "cortocircuito", status: "active", neural_score: 0.3 }
  ];
  var result = ni.shouldCallAI(mockCS, hyps);
  assert(result.needed !== undefined);
  assert(result.reason);
});

test("shouldCallAI senza ipotesi → serve AI", function() {
  var result = ni.shouldCallAI(mockCS, []);
  assert(result.needed === true);
});

// --- Training ---
test("trainFromClosedCase addestra tutti i moduli", function() {
  var result = ni.trainFromClosedCase(
    mockCS,
    { confirmedCause: "dispersione su carico", decisiveChecks: ["misura isolamento"], rejectedCauses: ["cortocircuito"] }
  );
  assert(result.trained === true);
  assert(result.language);
  assert(result.patterns);
  assert(result.knowledge);
  assert(result.memory);
});

test("trainFromClosedCase senza causa → non addestra", function() {
  var result = ni.trainFromClosedCase(mockCS, {});
  assert(result.trained === false);
});

// --- Analyze ---
test("analyze ritorna analisi completa", function() {
  var result = ni.analyze("il magnetotermico scatta con la lavatrice in cucina");
  assert(result);
  assert(result.intent);
  assert(result.entities);
  assert(result.embedding);
  assert(result.knowledgeQuery);
  assert(result.similarCases);
});

// --- Save/Load ---
test("saveAll completa senza errori", function() {
  var result = ni.saveAll();
  assert(result === true);
});

console.log("\n--- Results: " + passed + " passed, " + failed + " failed ---\n");
process.exit(failed > 0 ? 1 : 0);
