"use strict";

var assert = require("assert");
var nk = require("../neural_knowledge");
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

nk.reset();

console.log("\n=== NEURAL KNOWLEDGE TESTS ===\n");

// --- CRUD nodi ---
test("aggiungiNodo crea nodo", function() {
  nk.reset();
  var id = nk.aggiungiNodo("concetto", "tensione");
  assert(id);
  var n = nk.trovaNodo(id);
  assert(n);
  assert(n.nome === "tensione");
  assert(n.tipo === "concetto");
});

test("trovaNodoPerNome trova nodo", function() {
  var n = nk.trovaNodoPerNome("tensione");
  assert(n);
  assert(n.nome === "tensione");
});

test("aggiungiArco collega nodi", function() {
  var id1 = nk.aggiungiNodo("concetto", "corrente");
  var id2 = nk.trovaNodoPerNome("tensione").id;
  var arco = nk.aggiungiArco(id1, id2, "simile_a", 0.8);
  assert(arco);
  assert(arco.peso === 0.8);
});

test("trovaArchi trova archi", function() {
  var n = nk.trovaNodoPerNome("corrente");
  var archi = nk.trovaArchi(n.id, "uscenti");
  assert(archi.length >= 1);
});

// --- Bootstrap ---
test("bootstrapDaFenomeni crea nodi e archi", function() {
  nk.reset();
  var count = nk.bootstrapDaFenomeni([
    { id: "FEN-01", ipotesi: [
      { label: "dispersione", conferma: ["isolamento"] }
    ]}
  ]);
  assert(count >= 3); // fenomeno + causa + verifica
  var stats = nk.getStats();
  assert(stats.totalNodi >= 3);
  assert(stats.totalArchi >= 2);
});

test("bootstrapDaConcetti crea nodi concetto", function() {
  nk.reset();
  var count = nk.bootstrapDaConcetti({
    tensione: { descr: "V=RI" },
    corrente: { descr: "I=V/R" }
  });
  assert(count === 2);
});

test("bootstrapDaKnowledge crea nodi da componenti", function() {
  nk.reset();
  var count = nk.bootstrapDaKnowledge(
    [{ name: "MCB", typical_faults: ["termico"], field_checks: ["curva"] }],
    [{ name: "dispersione", symptoms: ["scatta il differenziale"] }]
  );
  assert(count >= 4);
});

// --- Ricerca ---
test("cercaPerSimilarita ritorna risultati", function() {
  nk.reset();
  nk.bootstrapDaFenomeni([{ id: "TEST", ipotesi: [{ label: "test causa" }] }]);
  var query = nc.randomVector(nk.DIM_NODO);
  var results = nk.cercaPerSimilarita(query, 3);
  assert(results.length > 0);
  assert(typeof results[0].similarity === "number");
});

test("recuperaAssociati naviga il grafo", function() {
  nk.reset();
  nk.bootstrapDaFenomeni([{ id: "FEN-X", ipotesi: [
    { label: "causa X", conferma: ["check X1", "check X2"] }
  ]}]);
  var fenNodo = nk.trovaNodoPerNome("FEN-X");
  assert(fenNodo);
  var assoc = nk.recuperaAssociati(fenNodo.id, 2);
  assert(assoc.length >= 1);
});

// --- Rinforzo ---
test("rinforzaArco aumenta peso", function() {
  nk.reset();
  var id1 = nk.aggiungiNodo("causa", "A");
  var id2 = nk.aggiungiNodo("verifica", "B");
  nk.aggiungiArco(id1, id2, "verifica", 0.5);
  var arco = nk.rinforzaArco(id1, id2, 0.2);
  assert(arco.peso > 0.5);
});

test("indebolisciArco diminuisce peso", function() {
  var n1 = nk.trovaNodoPerNome("A");
  var n2 = nk.trovaNodoPerNome("B");
  var pesoPrima = nk.trovaArchi(n1.id, "uscenti")[0].peso;
  nk.indebolisciArco(n1.id, n2.id, 0.3);
  var pesoDopo = nk.trovaArchi(n1.id, "uscenti")[0].peso;
  assert(pesoDopo < pesoPrima);
});

// --- Consolidamento ---
test("consolidaConoscenza non crasha", function() {
  nk.reset();
  nk.bootstrapDaFenomeni([{ id: "F1" }, { id: "F2" }]);
  var result = nk.consolidaConoscenza();
  assert(typeof result.merged === "number");
  assert(typeof result.removedArcs === "number");
});

// --- Learning ---
test("imparaDaCasoChiuso crea nodo per causa nuova", function() {
  nk.reset();
  nk.bootstrapDaFenomeni([{ id: "FEN-01" }]);
  var result = nk.imparaDaCasoChiuso(
    { components_detected: [], problem_summary: "test" },
    { confirmedCause: "nuova causa mai vista", rejectedCauses: [], decisiveChecks: [] }
  );
  assert(result.learned === true);
  var nodo = nk.trovaNodoPerNome("nuova causa mai vista");
  assert(nodo);
});

// --- Save/Load ---
test("salva e carica preservano grafo", function() {
  nk.reset();
  nk.bootstrapDaFenomeni([{ id: "SAVE-TEST", ipotesi: [{ label: "causa save" }] }]);
  var stats1 = nk.getStats();
  var saved = nk.salva();
  nk.reset();
  assert(nk.getStats().totalNodi === 0);
  nk.carica(saved);
  assert(nk.getStats().totalNodi === stats1.totalNodi);
  assert(nk.getStats().totalArchi === stats1.totalArchi);
});

console.log("\n--- Results: " + passed + " passed, " + failed + " failed ---\n");
process.exit(failed > 0 ? 1 : 0);
