"use strict";

var assert = require("assert");
var np = require("../neural_patterns");

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

np.reset();

console.log("\n=== NEURAL PATTERNS TESTS ===\n");

// --- Feature extraction ---
test("estraiFeaturesRaw ritorna vettore corretto", function() {
  var f = np.estraiFeaturesRaw({
    problem_summary: "tensione 230V corrente 10A",
    facts_confirmed: [],
    measurements: []
  });
  assert(f.length === np.INPUT_DIM);
});

test("estraiFeaturesSafe non ha valori -1", function() {
  var f = np.estraiFeaturesSafe({});
  for (var i = 0; i < f.length; i++) {
    assert(f[i] !== -1, "Feature " + i + " is -1");
  }
});

test("features estraggono tensione dal testo", function() {
  var f = np.estraiFeaturesRaw({
    problem_summary: "tensione 230V",
    facts_confirmed: [],
    measurements: []
  });
  assert(f[0] > 0, "tensione_fn dovrebbe essere > 0"); // 230/400
});

test("features estraggono corrente dal testo", function() {
  var f = np.estraiFeaturesRaw({
    problem_summary: "corrente 16A",
    facts_confirmed: [],
    measurements: []
  });
  assert(f[2] > 0, "corrente dovrebbe essere > 0"); // 16/100
});

// --- Bootstrap ---
test("bootstrapSintetico crea reti addestrate", function() {
  np.reset();
  var result = np.bootstrapSintetico();
  assert(result.normalSamples === 100);
  assert(result.faultSamples === 160);
  assert(result.anomalyThreshold > 0);
  var stats = np.getStats();
  assert(stats.anomalyNetEpochs > 0);
  assert(stats.faultNetEpochs > 0);
});

// --- Anomaly detection ---
test("detectAnomaly ritorna struttura corretta", function() {
  var f = np.estraiFeaturesSafe({});
  var result = np.detectAnomaly(f);
  assert(typeof result.anomaly === "boolean");
  assert(typeof result.score === "number");
  assert(typeof result.reconstructionError === "number");
  assert(result.threshold > 0);
});

// --- Fault classification ---
test("classificaGuasto ritorna struttura corretta", function() {
  var f = np.estraiFeaturesSafe({});
  var result = np.classificaGuasto(f);
  assert(result.faultClass);
  assert(typeof result.confidence === "number");
  assert(result.all.length === np.FAULT_CLASSES.length);
});

test("classificaGuasto probabilità sommano a ~1", function() {
  var f = np.estraiFeaturesSafe({});
  var result = np.classificaGuasto(f);
  var sum = result.all.reduce(function(s, x) { return s + x.probability; }, 0);
  assert(Math.abs(sum - 1) < 0.01, "Sum = " + sum);
});

// --- Incertezza ---
test("stimaIncertezza ritorna certainty valida", function() {
  var f = np.estraiFeaturesSafe({});
  var fault = np.classificaGuasto(f);
  var unc = np.stimaIncertezza(f, fault);
  assert(["alta", "media", "bassa"].indexOf(unc.certainty) >= 0);
  assert(unc.reason);
});

// --- Training ---
test("trainDaCasoChiuso con causa confermata", function() {
  var result = np.trainDaCasoChiuso(
    { problem_summary: "dispersione", facts_confirmed: [], measurements: [] },
    { confirmedCause: "dispersione su carico" }
  );
  assert(result.trained === true);
  assert(result.faultClass === "dispersione");
});

test("trainDaCasoChiuso senza causa ritorna false", function() {
  var result = np.trainDaCasoChiuso({}, {});
  assert(result.trained === false);
});

// --- Save/Load ---
test("salva e carica preservano stato", function() {
  var saved = np.salva();
  var stats1 = np.getStats();
  np.reset();
  assert(np.getStats().anomalyNetEpochs === 0);
  np.carica(saved);
  assert(np.getStats().anomalyNetEpochs === stats1.anomalyNetEpochs);
});

console.log("\n--- Results: " + passed + " passed, " + failed + " failed ---\n");
process.exit(failed > 0 ? 1 : 0);
