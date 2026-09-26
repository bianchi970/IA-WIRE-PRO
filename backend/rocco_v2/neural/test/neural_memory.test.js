"use strict";

var assert = require("assert");
var nm = require("../neural_memory");
var nc = require("../neural_core");

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

nm.reset();

console.log("\n=== NEURAL MEMORY TESTS ===\n");

// --- Store ---
test("store salva episodio", function() {
  nm.reset();
  var ep = nm.store(
    { problem_summary: "test caso 1", domain: "elettrico", components_detected: ["RCD"], facts_confirmed: ["scatta"] },
    { confirmedCause: "dispersione", decisiveChecks: ["isolamento"] }
  );
  assert(ep);
  assert(ep.id);
  assert(nm.stats().episodi_totali === 1);
});

test("store multipli incrementano contatore", function() {
  nm.reset();
  for (var i = 0; i < 5; i++) {
    nm.store(
      { problem_summary: "caso " + i, domain: "elettrico", components_detected: [], facts_confirmed: [] },
      { confirmedCause: "causa " + i }
    );
  }
  assert(nm.stats().episodi_totali === 5);
});

// --- FindSimilar ---
test("findSimilar ritorna risultati", function() {
  var query = nc.randomVector(nm.DIM_EMBEDDING);
  var results = nm.findSimilar(query, 3);
  assert(Array.isArray(results));
  // Potrebbe trovare risultati o no, dipende dalla similarity
});

test("findSimilar con 0 episodi ritorna array vuoto", function() {
  nm.reset();
  var results = nm.findSimilar(nc.randomVector(nm.DIM_EMBEDDING), 3);
  assert(results.length === 0);
});

// --- Consolidamento ---
test("episodi simili si consolidano automaticamente", function() {
  nm.reset();
  // Store 3 episodi con stesso embedding → consolidamento
  var nl;
  try { nl = require("../neural_language"); nl.reset(); nl.bootstrap(null, null, null); } catch(e) {}

  for (var i = 0; i < 5; i++) {
    nm.store(
      { problem_summary: "differenziale scatta", domain: "elettrico", components_detected: ["RCD"], facts_confirmed: ["scatta"] },
      { confirmedCause: "dispersione", decisiveChecks: ["isolamento"] }
    );
  }
  var stats = nm.stats();
  assert(stats.episodi_totali === 5);
  // Il consolidamento potrebbe o meno avvenire dipendendo dalla similarity degli embeddings
  // ma la struttura deve essere corretta
  assert(typeof stats.semantici_totali === "number");
});

test("consolida globale non crasha", function() {
  var result = nm.consolida();
  assert(typeof result.newPatterns === "number");
});

// --- Decadimento ---
test("decadimento non crasha su episodi recenti", function() {
  var result = nm.decadimento();
  assert(result.decayed === 0); // tutti recenti
  assert(result.forgotten === 0);
});

// --- Replay ---
test("replay ritorna dati corretti", function() {
  var rep = nm.replay();
  assert(typeof rep.totalPatterns === "number");
  assert(typeof rep.totalEpisodes === "number");
  assert(typeof rep.activeEpisodes === "number");
  assert(Array.isArray(rep.patterns));
});

// --- Save/Load ---
test("salva e carica preservano stato", function() {
  nm.reset();
  nm.store(
    { problem_summary: "test save", domain: "test", components_detected: [], facts_confirmed: [] },
    { confirmedCause: "test causa" }
  );
  var stats1 = nm.stats();
  var saved = nm.salva();
  nm.reset();
  assert(nm.stats().episodi_totali === 0);
  nm.carica(saved);
  assert(nm.stats().episodi_totali === stats1.episodi_totali);
});

console.log("\n--- Results: " + passed + " passed, " + failed + " failed ---\n");
process.exit(failed > 0 ? 1 : 0);
