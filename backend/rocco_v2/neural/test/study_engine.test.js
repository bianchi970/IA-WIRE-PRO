"use strict";

var assert = require("assert");
var se = require("../study_engine");
var nk = require("../neural_knowledge");
var nl = require("../neural_language");
var nm = require("../neural_memory");
var np = require("../neural_patterns");
var curriculum = require("../curriculum");

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  \u2713 " + name);
  } catch(e) {
    failed++;
    console.log("  \u2717 " + name + ": " + e.message);
  }
}

console.log("\n=== STUDY ENGINE TESTS ===\n");

// --- Curriculum ---
test("curriculum ha almeno 20 livelli", function() {
  assert(curriculum.TOTALE_LIVELLI >= 20, "livelli: " + curriculum.TOTALE_LIVELLI);
});

test("ogni livello ha id e nome", function() {
  for (var i = 0; i < curriculum.LIVELLI.length; i++) {
    var l = curriculum.LIVELLI[i];
    assert(l.id, "livello " + i + " senza id");
    assert(l.nome, "livello " + i + " senza nome");
  }
});

test("ogni livello ha struttura corretta", function() {
  for (var i = 0; i < curriculum.LIVELLI.length; i++) {
    var l = curriculum.LIVELLI[i];
    assert(Array.isArray(l.concetti), l.id + " concetti non array");
    assert(Array.isArray(l.formule), l.id + " formule non array");
    assert(Array.isArray(l.componenti), l.id + " componenti non array");
    assert(Array.isArray(l.guasti), l.id + " guasti non array");
    assert(Array.isArray(l.norme), l.id + " norme non array");
    assert(Array.isArray(l.casi), l.id + " casi non array");
    assert(Array.isArray(l.relazioni), l.id + " relazioni non array");
  }
});

test("L00 ha concetti fondamentali", function() {
  var l0 = curriculum.LIVELLI[0];
  var nomi = l0.concetti.map(function(c) { return c.nome; });
  assert(nomi.indexOf("corrente") >= 0, "manca corrente");
  assert(nomi.indexOf("tensione") >= 0, "manca tensione");
  assert(nomi.indexOf("resistenza") >= 0, "manca resistenza");
  assert(nomi.indexOf("legge_di_ohm") >= 0, "manca legge_di_ohm");
});

// --- Studio completo ---
test("reset moduli prima dello studio", function() {
  nk.reset();
  nl.reset();
  nm.reset();
  np.reset();
  // Bootstrap minimo language
  nl.bootstrap(null, null, null);
  np.bootstrapSintetico();
  var stats = nk.getStats();
  assert(stats.totalNodi === 0, "KG non resettato: " + stats.totalNodi + " nodi");
});

var risultato;
test("studiaCompleto esegue senza errori", function() {
  risultato = se.studiaCompleto();
  assert(risultato.success === true);
});

test("tutti i livelli studiati", function() {
  assert(risultato.stats.livelli_studiati === curriculum.TOTALE_LIVELLI,
    "studiati " + risultato.stats.livelli_studiati + "/" + curriculum.TOTALE_LIVELLI);
});

test("concetti appresi > 100", function() {
  assert(risultato.stats.concetti_appresi > 100,
    "solo " + risultato.stats.concetti_appresi + " concetti");
});

test("componenti appresi > 20", function() {
  assert(risultato.stats.componenti_appresi > 20,
    "solo " + risultato.stats.componenti_appresi + " componenti");
});

test("formule apprese > 20", function() {
  assert(risultato.stats.formule_apprese > 20,
    "solo " + risultato.stats.formule_apprese + " formule");
});

test("guasti appresi > 30", function() {
  assert(risultato.stats.guasti_appresi > 30,
    "solo " + risultato.stats.guasti_appresi + " guasti");
});

test("norme apprese > 10", function() {
  assert(risultato.stats.norme_apprese > 10,
    "solo " + risultato.stats.norme_apprese + " norme");
});

test("casi studiati > 15", function() {
  assert(risultato.stats.casi_studiati > 15,
    "solo " + risultato.stats.casi_studiati + " casi");
});

test("relazioni create > 50", function() {
  assert(risultato.stats.relazioni_create > 50,
    "solo " + risultato.stats.relazioni_create + " relazioni");
});

test("parole vocabolario > 200", function() {
  assert(risultato.stats.parole_vocabolario > 200,
    "solo " + risultato.stats.parole_vocabolario + " parole");
});

test("episodi memorizzati > 15", function() {
  assert(risultato.stats.episodi_memorizzati > 15,
    "solo " + risultato.stats.episodi_memorizzati + " episodi");
});

// --- Verifica KG dopo studio ---
test("KG ha nodi dopo studio", function() {
  var stats = nk.getStats();
  assert(stats.totalNodi > 200, "solo " + stats.totalNodi + " nodi nel KG");
});

test("KG ha archi dopo studio", function() {
  var stats = nk.getStats();
  assert(stats.totalArchi > 100, "solo " + stats.totalArchi + " archi nel KG");
});

test("KG conosce la legge di Ohm", function() {
  var nodo = nk.trovaNodoPerNome("legge_di_ohm");
  assert(nodo, "legge_di_ohm non trovata nel KG");
  assert(nodo.metadata.formula, "formula mancante");
});

test("KG conosce il differenziale", function() {
  var nodo = nk.trovaNodoPerNome("differenziale");
  assert(nodo, "differenziale non trovato nel KG");
});

test("KG ha nodo norma CEI 64-8", function() {
  var nodo = nk.trovaNodoPerNome("CEI 64-8 (tutte le parti)");
  assert(nodo, "CEI 64-8 non trovata nel KG");
  assert(nodo.metadata.tipo === "norma", "tipo non norma");
});

test("KG conosce il contattore", function() {
  var nodo = nk.trovaNodoPerNome("contattore");
  assert(nodo, "contattore non trovato");
  assert(nodo.metadata.guasti_tipici, "guasti_tipici mancanti");
});

test("KG conosce il fotovoltaico", function() {
  var nodo = nk.trovaNodoPerNome("cella_fotovoltaica");
  assert(nodo, "cella_fotovoltaica non trovata");
});

// --- Verifica linguaggio ---
test("vocabolario cresciuto", function() {
  var stats = nl.getStats();
  assert(stats.vocabolarioSize > 300, "vocabolario solo " + stats.vocabolarioSize);
});

// --- Verifica memoria ---
test("memoria ha episodi", function() {
  var stats = nm.stats();
  assert(stats.episodi_totali > 15, "solo " + stats.episodi_totali + " episodi");
});

// --- Performance ---
test("studio completato in meno di 5 secondi", function() {
  assert(risultato.stats.tempo_ms < 5000, "troppo lento: " + risultato.stats.tempo_ms + "ms");
});

// --- Dettaglio livelli ---
test("ogni livello ha dettaglio nel risultato", function() {
  assert(risultato.dettaglio_livelli.length === curriculum.TOTALE_LIVELLI);
  for (var i = 0; i < risultato.dettaglio_livelli.length; i++) {
    assert(risultato.dettaglio_livelli[i].id, "livello " + i + " senza id nel dettaglio");
  }
});

// --- Studio ripetuto non duplica ---
test("studio ripetuto non crasha", function() {
  var r2 = se.studiaCompleto();
  assert(r2.success === true);
});

// --- Stats API ---
test("getStats ritorna dati corretti", function() {
  var s = se.getStats();
  assert(s.livelli_studiati > 0);
  assert(s.concetti_appresi > 0);
});

// Print summary
console.log("\n  --- Studio completato in " + risultato.stats.tempo_ms + "ms ---");
console.log("  Livelli: " + risultato.stats.livelli_studiati);
console.log("  Concetti: " + risultato.stats.concetti_appresi);
console.log("  Componenti: " + risultato.stats.componenti_appresi);
console.log("  Formule: " + risultato.stats.formule_apprese);
console.log("  Guasti: " + risultato.stats.guasti_appresi);
console.log("  Norme: " + risultato.stats.norme_apprese);
console.log("  Casi: " + risultato.stats.casi_studiati);
console.log("  Relazioni: " + risultato.stats.relazioni_create);
console.log("  Parole vocabolario: " + risultato.stats.parole_vocabolario);
console.log("  Episodi in memoria: " + risultato.stats.episodi_memorizzati);
console.log("  KG nodi: " + risultato.kg_stats.totalNodi);
console.log("  KG archi: " + risultato.kg_stats.totalArchi);

console.log("\n--- Results: " + passed + " passed, " + failed + " failed ---\n");
process.exit(failed > 0 ? 1 : 0);
