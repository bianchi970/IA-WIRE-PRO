"use strict";

var assert = require("assert");
var nl = require("../neural_language");

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

// Reset prima di ogni suite
nl.reset();

console.log("\n=== NEURAL LANGUAGE TESTS ===\n");

// --- Tokenizzazione ---
test("tokenizza rimuove stopwords", function() {
  var tokens = nl.tokenizza("il differenziale scatta nella cucina");
  assert(tokens.indexOf("il") < 0);
  assert(tokens.indexOf("nella") < 0);
  assert(tokens.indexOf("differenziale") >= 0);
  assert(tokens.indexOf("scatta") >= 0);
  assert(tokens.indexOf("cucina") >= 0);
});

test("tokenizza gestisce accenti", function() {
  var tokens = nl.tokenizza("continuità elettricità");
  assert(tokens.length === 2);
  assert(tokens[0] === "continuita");
});

test("tokenizza rimuove token corti", function() {
  var tokens = nl.tokenizza("a e i o u il differenziale");
  assert(tokens.indexOf("a") < 0);
  assert(tokens.indexOf("differenziale") >= 0);
});

// --- Vocabolario ---
test("aggiungiAlVocabolario aggiunge nuova parola", function() {
  var idx = nl.aggiungiAlVocabolario("magnetotermico");
  assert(typeof idx === "number");
  assert(idx >= 0);
});

test("ottieniEmbedding ritorna vettore corretto", function() {
  var emb = nl.ottieniEmbedding("magnetotermico");
  assert(emb.length === nl.DIM_EMBEDDING);
  assert(!isNaN(emb[0]));
});

test("embeddingFrase ritorna vettore di dimensione corretta", function() {
  var emb = nl.embeddingFrase("il differenziale scatta");
  assert(emb.length === nl.DIM_EMBEDDING);
});

test("embeddingFrase di stringa vuota ritorna zero vector", function() {
  var emb = nl.embeddingFrase("");
  var sum = emb.reduce(function(a, b) { return a + Math.abs(b); }, 0);
  assert(sum === 0);
});

// --- Entity Extraction ---
test("estraiEntita trova componenti", function() {
  var ent = nl.estraiEntita("il differenziale scatta");
  assert(ent.componenti.length > 0);
  assert(ent.componenti[0].type === "protezione_diff");
});

test("estraiEntita trova misure", function() {
  var ent = nl.estraiEntita("tensione 230V corrente 16A");
  assert(ent.misure.length >= 2);
  var volts = ent.misure.find(function(m) { return m.unit === "V"; });
  assert(volts && volts.value === 230);
});

test("estraiEntita trova mA", function() {
  var ent = nl.estraiEntita("corrente di dispersione 30mA");
  var ma = ent.misure.find(function(m) { return m.unit === "mA"; });
  assert(ma && ma.value === 30);
});

test("estraiEntita trova sintomi", function() {
  var ent = nl.estraiEntita("il magnetotermico scatta e c'è odore di bruciato");
  assert(ent.sintomi.length >= 1);
  assert(ent.sintomi.some(function(s) { return s.type === "intervento_protezione"; }));
});

test("estraiEntita trova luoghi", function() {
  var ent = nl.estraiEntita("problema nella cucina e nel bagno");
  assert(ent.luoghi.length >= 2);
});

test("estraiEntita trova temporali", function() {
  var ent = nl.estraiEntita("il problema c'è da ieri");
  assert(ent.temporali.length >= 1);
  assert(ent.temporali[0].type === "recente");
});

// --- Bootstrap & Intent ---
test("bootstrap popola vocabolario", function() {
  nl.reset();
  nl.bootstrap(null, null, [{ name: "Interruttore differenziale", keywords: ["differenziale", "RCD"] }]);
  var stats = nl.getStats();
  assert(stats.vocabolarioSize > 50); // seed intenti + componenti
});

test("classificaIntento ritorna intent valido", function() {
  nl.reset();
  nl.bootstrap(null, null, null);
  var r = nl.classificaIntento("il differenziale scatta");
  assert(r.intent);
  assert(typeof r.confidence === "number");
  assert(r.all.length === nl.INTENTS.length);
});

// --- Context ---
test("creaContesto e aggiornaContesto funzionano", function() {
  nl.reset();
  nl.bootstrap(null, null, null);
  var ctx = nl.creaContesto(3);
  nl.aggiornaContesto(ctx, "il differenziale scatta", "user");
  nl.aggiornaContesto(ctx, "quando succede?", "assistant");
  assert(ctx.turni.length === 2);
});

test("contesto rispetta maxTurni", function() {
  nl.reset();
  nl.bootstrap(null, null, null);
  var ctx = nl.creaContesto(2);
  nl.aggiornaContesto(ctx, "primo", "user");
  nl.aggiornaContesto(ctx, "secondo", "user");
  nl.aggiornaContesto(ctx, "terzo", "user");
  assert(ctx.turni.length === 2);
});

test("focusAttuale ritorna vettore corretto", function() {
  nl.reset();
  nl.bootstrap(null, null, null);
  var ctx = nl.creaContesto(5);
  nl.aggiornaContesto(ctx, "differenziale scatta", "user");
  var focus = nl.focusAttuale(ctx);
  assert(focus.length === nl.DIM_EMBEDDING);
});

// --- Save/Load ---
test("salva e carica preservano stato", function() {
  nl.reset();
  nl.bootstrap(null, null, null);
  var statsBefore = nl.getStats();
  var saved = nl.salva();
  nl.reset();
  assert(nl.getStats().vocabolarioSize === 0);
  nl.carica(saved);
  assert(nl.getStats().vocabolarioSize === statsBefore.vocabolarioSize);
});

// --- Learning ---
test("imparaDaInterazione non crasha", function() {
  nl.reset();
  nl.bootstrap(null, null, null);
  var ent = nl.estraiEntita("il differenziale scatta in cucina");
  nl.imparaDaInterazione("il differenziale scatta in cucina", "diagnosi_guasto", ent);
  assert(nl.getStats().docCount === 1);
});

console.log("\n--- Results: " + passed + " passed, " + failed + " failed ---\n");
process.exit(failed > 0 ? 1 : 0);
