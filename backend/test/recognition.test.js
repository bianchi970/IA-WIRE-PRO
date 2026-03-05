"use strict";
/**
 * recognition.test.js — Acceptance tests per ROCCO recognition engine v2
 *
 * Esegui: node backend/test/recognition.test.js
 * (nessuna dipendenza esterna, solo assert nativo Node.js)
 *
 * Criteri di DONE:
 *   Suite 1: 10 frasi tipiche → almeno 7 HIGH corretti
 *   Suite 2: 10 descrizioni "quadro" → almeno 70% HIGH|MEDIUM corretti
 *   Suite 3: 5 casi ambigui → non devono essere HIGH
 *   Suite 4: componenti LOW non entrano in OSSERVAZIONI (contratto ROCCO)
 */

var assert = require("assert");
var path   = require("path");

// Carica il recognition engine
var recEng;
try {
  recEng = require(path.join(__dirname, "../rocco/recognitionEngine"));
} catch (e) {
  console.error("ERRORE: impossibile caricare recognitionEngine.js →", e.message);
  process.exit(1);
}

var recognizeComponents = recEng.recognizeComponents;
var buildRoccoContext   = recEng.buildRoccoContext;
var THRESHOLDS          = recEng.THRESHOLDS;

var HIGH   = THRESHOLDS.HIGH;
var MEDIUM = THRESHOLDS.MEDIUM;

// ── Utilities ─────────────────────────────────────────────────────────────

var passed = 0;
var failed = 0;

function test(desc, fn) {
  try {
    fn();
    console.log("  \u2713 " + desc);
    passed++;
  } catch (e) {
    console.log("  \u2717 " + desc + " \u2014 " + e.message);
    failed++;
  }
}

function getCandidate(results, id) {
  for (var i = 0; i < results.length; i++) {
    if (results[i].component_id === id) return results[i];
  }
  return null;
}

function confStr(results, id) {
  var c = getCandidate(results, id);
  return c ? c.confidence.toFixed(2) : "0.00";
}

// ═════════════════════════════════════════════════════════════════════════
console.log("\n\u2550\u2550\u2550 ROCCO Recognition Engine v2 \u2014 Acceptance Tests \u2550\u2550\u2550\n");

// ── SUITE 1: 10 frasi tipiche → almeno 7 HIGH ─────────────────────────
console.log("SUITE 1: Frasi tipiche (atteso HIGH \u2265 " + HIGH + ")\n");

var suite1 = [
  { text: "ho un magnetotermico C16 che scatta in continuazione",              expect: "magnetotermico" },
  { text: "differenziale 30mA tipo AC interviene continuamente",               expect: "differenziale" },
  { text: "il contattore KM1 non chiude la bobina quando do il comando",       expect: "contattore" },
  { text: "pressostato 4bar non chiude il contatto per avviare la pompa",      expect: "pressostato" },
  { text: "galleggiante nel serbatoio bloccato livello alto non scende",       expect: "galleggiante" },
  { text: "alimentatore 24VDC MEAN WELL non eroga tensione in uscita",         expect: "alimentatore" },
  { text: "scheda di controllo caldaia bruciata da sostituire urgente",        expect: "scheda_controllo" },
  { text: "timer programmatore orario non commuta nella fascia oraria mattina", expect: "timer" },
  { text: "rcbo C25/30mA interviene appena accendo il forno",                  expect: "magnetotermico_differenziale" },
  { text: "rele termico MTR scattato sul motore compressore resettar",         expect: "rele" }
];

var suite1High = 0;
suite1.forEach(function(tc) {
  var results = recognizeComponents(tc.text);
  var top     = getCandidate(results, tc.expect);
  var conf    = top ? top.confidence : 0;
  var ok      = conf >= HIGH;
  if (ok) suite1High++;
  test(
    "\"" + tc.text.slice(0, 45) + "...\" \u2192 " + tc.expect +
    " HIGH (conf=" + conf.toFixed(2) + ")",
    function() { assert.ok(ok, "atteso conf \u2265 " + HIGH + ", ottenuto " + conf.toFixed(2)); }
  );
});

console.log("\n  Totale Suite 1: " + suite1High + "/10 HIGH\n");
test("Suite 1: almeno 7/10 HIGH", function() {
  assert.ok(suite1High >= 7, "solo " + suite1High + "/10 HIGH — atteso \u2265 7");
});

// ── SUITE 2: 10 descrizioni "quadro" → 70% HIGH|MEDIUM ────────────────
console.log("\nSUITE 2: Descrizioni quadro (atteso HIGH|MEDIUM \u2265 70%)\n");

var suite2 = [
  { text: "nel quadro c'e un magnetotermico bipolare da 16A che scatta",       expect: "magnetotermico" },
  { text: "differenziale salvavita scatta spesso quando accendo la lavatrice", expect: "differenziale" },
  { text: "contattore bobina 24V non tira nel quadro di comando pompa",        expect: "contattore" },
  { text: "timer orologio programmatore nel pannello di automazione",           expect: "timer" },
  { text: "il pressostato del compressore non da consenso al contattore",      expect: "pressostato" },
  { text: "galleggiante nel pozzetto di raccolta comanda pompa svuotamento",   expect: "galleggiante" },
  { text: "alimentatore 24VDC per plc nel quadro automazione spento",          expect: "alimentatore" },
  { text: "scheda pompa bruciata nel quadro tecnico da sostituire",            expect: "scheda_controllo" },
  { text: "rele ausiliario K1 non commuta nel circuito di comando",            expect: "rele" },
  { text: "rcbo combinato C16/30mA protezione singolo circuito cucina",        expect: "magnetotermico_differenziale" }
];

var suite2HM = 0;
suite2.forEach(function(tc) {
  var results = recognizeComponents(tc.text);
  var top     = getCandidate(results, tc.expect);
  var conf    = top ? top.confidence : 0;
  var ok      = conf >= MEDIUM;
  if (ok) suite2HM++;
  test(
    "\"" + tc.text.slice(0, 45) + "...\" \u2192 " + tc.expect +
    " H|M (conf=" + conf.toFixed(2) + ")",
    function() { assert.ok(ok, "atteso conf \u2265 " + MEDIUM + ", ottenuto " + conf.toFixed(2)); }
  );
});

var suite2Pct = Math.round(suite2HM / suite2.length * 100);
console.log("\n  Totale Suite 2: " + suite2HM + "/10 HIGH|MEDIUM (" + suite2Pct + "%)\n");
test("Suite 2: almeno 70% HIGH|MEDIUM", function() {
  assert.ok(suite2HM >= 7, "solo " + suite2HM + "/10 — atteso \u2265 7 (70%)");
});

// ── SUITE 3: 5 casi ambigui → NON HIGH ────────────────────────────────
console.log("\nSUITE 3: Casi ambigui (NON devono essere HIGH)\n");

var suite3 = [
  { text: "il componente nel quadro non funziona piu" },
  { text: "mcb" },
  { text: "c'e qualcosa che scatta nel quadro" },
  { text: "il modulo e guasto" },
  { text: "30mA" }
];

var suite3OK = 0;
suite3.forEach(function(tc) {
  var results  = recognizeComponents(tc.text);
  var topConf  = results.length > 0 ? results[0].confidence : 0;
  var topId    = results.length > 0 ? results[0].component_id : "-";
  var ok       = topConf < HIGH;
  if (ok) suite3OK++;
  test(
    "\"" + tc.text + "\" \u2192 NON HIGH (top=" + topId + " conf=" + topConf.toFixed(2) + ")",
    function() { assert.ok(ok, "ottenuto HIGH " + topConf.toFixed(2) + " per " + topId + " — non atteso"); }
  );
});

console.log("\n  Suite 3: " + suite3OK + "/5 casi ambigui corretti\n");

// ── SUITE 4: contratto ROCCO — LOW non in OSSERVAZIONI ────────────────
console.log("SUITE 4: Contratto ROCCO — componenti LOW non devono essere in OSSERVAZIONI\n");

// Caso LOW/nessun match → context deve contenere "non riconosciuto con certezza"
var lowText = "il componente nel pannello fa rumore strano";
var lowCtx  = buildRoccoContext(lowText);
test("Testo ambiguo: context include avviso certezza insufficiente", function() {
  var hasWarning = lowCtx.indexOf("non riconosciuto con certezza") >= 0 ||
                   lowCtx.indexOf("certezza insufficiente") >= 0 ||
                   lowCtx.indexOf("NON listare") >= 0;
  assert.ok(hasWarning, "Avviso assente nel context per testo ambiguo. Context:\n" + lowCtx.slice(0, 300));
});

// Caso HIGH → context deve riportare il componente come "RILEVATO"
var highText = "magnetotermico C16 scatta in sovraccarico nel circuito";
var highCtx  = buildRoccoContext(highText);
test("Testo HIGH: context riporta componente come RILEVATO", function() {
  var hasComp = highCtx.indexOf("Magnetotermico") >= 0 ||
                highCtx.indexOf("magnetotermico") >= 0;
  assert.ok(hasComp, "Componente HIGH assente nel context:\n" + highCtx.slice(0, 300));
  var hasOsserv = highCtx.indexOf("RILEVAT") >= 0 || highCtx.indexOf("rilevat") >= 0;
  assert.ok(hasOsserv, "Parola RILEVATI assente nel context:\n" + highCtx.slice(0, 300));
});

// Verifica che evidence non sia mai vuota per componenti HIGH
test("Componenti HIGH hanno sempre evidence non vuota", function() {
  var texts = suite1.map(function(t) { return t.text; });
  var violations = 0;
  texts.forEach(function(txt) {
    var res = recognizeComponents(txt);
    res.forEach(function(r) {
      if (r.band === "HIGH" && (!r.evidence || r.evidence.length === 0)) {
        violations++;
      }
    });
  });
  assert.strictEqual(violations, 0, violations + " componente/i HIGH con evidence vuota");
});

// ── RISULTATO FINALE ───────────────────────────────────────────────────
console.log("\n" + "\u2550".repeat(55));
console.log("RISULTATO: " + passed + "/" + (passed + failed) + " test superati");
if (failed > 0) {
  console.log("FALLITI: " + failed + " test");
  process.exit(1);
} else {
  console.log("TUTTI I TEST SUPERATI \u2713");
  process.exit(0);
}
