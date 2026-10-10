"use strict";

/**
 * Test del vocabolario: SYNONYM_MAP e sinonimi di frase.
 *
 * Il blocco è nato da un sospetto — "la mappa mescola sinonimi veri e
 * iperonimi" — e la misura l'ha ridimensionato e riorientato:
 *
 *  - 298 righe, 288 chiavi uniche, **10 duplicate** (9 identiche, 1 in
 *    CONFLITTO: `armoniche` valeva prima "analizzatore rete" e poi
 *    "squilibrio fasi"; la struttura piatta non può tenere due significati,
 *    quindi uno sparisce in silenzio);
 *  - **33 chiavi contenevano uno spazio e non potevano essere consultate**:
 *    `SYNONYM_MAP` viene letta solo su una parola singola (`canonicalWord`
 *    riceve un token, `tokenize` spezza sugli spazi). Dati scritti e mai
 *    letti, con l'aspetto di funzionare;
 *  - **237 chiavi su 288 (82%) non sono esercitate da nessun caso reale**
 *    del corpus. Questo è il motivo per cui la mappa NON è stata riscritta:
 *    riscriverla vorrebbe dire prendere 237 decisioni di dominio senza una
 *    sola prova.
 *
 * Quello che è stato corretto è ciò che è un difetto a prescindere dal
 * dominio: le voci morte, le riscritture fisicamente sbagliate, le
 * negazioni portate al positivo, e gli errori di categoria — un componente
 * o uno strumento riscritto in un **guasto**.
 *
 * La letteratura dice la stessa cosa: SKOS distingue `altLabel` (stesso
 * concetto, altro nome) da `broader`/`related`, e avverte che la gerarchia
 * serve a ritrovare, non ad affermare identità.
 */

var de = require("../../../engine/diagnosticEngine");
var fs = require("fs");
var path = require("path");
var corpus = require("../casi_reali_forum.js");

var pass = 0;
var fail = 0;

function check(label, condition) {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.log("  ✗ " + label);
  }
}

function eq(label, actual, expected) {
  var ok = actual === expected;
  if (!ok) console.log("    atteso " + JSON.stringify(expected) + ", ottenuto " + JSON.stringify(actual));
  check(label, ok);
}

// Si rileggono le righe del sorgente, non solo l'oggetto: i duplicati
// esistono nel FILE e l'oggetto ne conserva una sola.
function righeDellaMappa() {
  var src = fs.readFileSync(path.join(__dirname, "..", "..", "..", "engine", "diagnosticEngine.js"), "utf8");
  var da = src.indexOf("var SYNONYM_MAP = {");
  var a = src.indexOf("\n};", da);
  var voci = [];
  src.slice(da, a).split(/\r?\n/).forEach(function (l) {
    var m = l.match(/^\s*"([^"]+)":\s*"([^"]+)"/);
    if (m) voci.push({ k: m[1], v: m[2] });
  });
  return voci;
}

var voci = righeDellaMappa();

// ─── §1 Nessuna voce morta, nessun duplicato ───────────────────────────
console.log("\n§1 — la mappa dice il vero su sé stessa");

var multiParola = voci.filter(function (x) { return /\s/.test(x.k); });
eq("nessuna chiave con uno spazio: sarebbe irraggiungibile", multiParola.length, 0);
multiParola.slice(0, 5).forEach(function (x) { console.log("      morta →", x.k); });

var viste = {};
var duplicate = [];
voci.forEach(function (x) {
  if (viste[x.k] !== undefined) duplicate.push(x.k + " (" + viste[x.k] + " / " + x.v + ")");
  else viste[x.k] = x.v;
});
eq("nessuna chiave duplicata", duplicate.length, 0);
duplicate.slice(0, 5).forEach(function (d) { console.log("      duplicata →", d); });

check("la mappa ha ancora il suo vocabolario", voci.length > 240);

// ─── §2 Niente negazioni portate al positivo ───────────────────────────
console.log("\n§2 — una negazione non diventa il suo contrario");

var negative = voci.filter(function (x) {
  return /^(non|senza|manca|nessun|privo)\b/.test(x.k);
});
eq("nessuna chiave che inizia con una negazione", negative.length, 0);
negative.forEach(function (x) { console.log("      →", x.k, "→", x.v); });

check("'non scatta' non riscrive più in 'eccita'", de.SYNONYM_MAP["non scatta"] === undefined);
check("'non chiude' non riscrive più in 'eccita'", de.SYNONYM_MAP["non chiude"] === undefined);

// ─── §3 Niente errori di fisica ────────────────────────────────────────
console.log("\n§3 — corrente e tensione non sono la stessa grandezza");

check("'corrente alta' non riscrive in sovratensione", de.SYNONYM_MAP["corrente alta"] === undefined);
check("'corrente bassa' non riscrive in sottotensione", de.SYNONYM_MAP["corrente bassa"] === undefined);

// ─── §4 Un componente o uno strumento non è un guasto ──────────────────
console.log("\n§4 — errori di categoria");

// Valori che sono diagnosi o guasti.
var DIAGNOSI = /degradat|surriscaldat|squilibri|mancanza fase|cavo surriscaldato|terra degradata/;

function valore(k) { return de.SYNONYM_MAP[k]; }

eq("il dispersore è una parte dell'impianto di terra", valore("dispersore"), "terra");
eq("il picchetto pure", valore("picchetto"), "terra");
eq("la guaina è una parte del cavo", valore("guaina"), "cavo");
eq("la canalina pure", valore("canalina"), "cavo");
eq("la carcassa non è un guasto di terra", valore("carcassa"), "carcassa");
eq("la scossa è un sintomo, non una diagnosi", valore("scossa"), "scossa");
eq("il formicolio pure", valore("formicolio"), "scossa");
eq("l'asimmetria non è una fase mancante", valore("asimmetria"), "asimmetria");
eq("il fasimetro è uno strumento", valore("fasimetro"), "fasimetro");
eq("il blackout è un evento, non un UPS", valore("blackout"), "blackout");
eq("le armoniche non sono uno squilibrio di fase", valore("armoniche"), "armoniche");

// Nessuna parola neutra deve più finire su una diagnosi.
var residui = voci.filter(function (x) {
  return DIAGNOSI.test(x.v) && !DIAGNOSI.test(x.k) && !/squilibrat|sbilanciat/.test(x.k);
});
eq("nessuna parola neutra riscritta in un guasto", residui.length, 0);
residui.forEach(function (x) { console.log("      →", x.k, "→", x.v); });

// I sinonimi veri di sintomo restano: non è una caccia alle streghe.
eq("'ronza' resta un ronzio", valore("ronza"), "ronzio");
eq("'scintille' resta un arco elettrico", valore("scintille"), "arco elettrico");
eq("'salvavita' resta un differenziale", valore("salvavita"), "differenziale");
eq("'curtocircuito' resta un cortocircuito", valore("curtocircuito"), "cortocircuito");

// ─── §5 I sinonimi di frase ora funzionano ─────────────────────────────
console.log("\n§5 — il vocabolario di più parole è vivo");

function riscrive(testo, atteso) {
  return de.normalizeQuery(testo).indexOf(atteso) >= 0;
}

check("messa a terra → terra", riscrive("ho controllato la messa a terra dell impianto", "terra"));
check("corto circuito → cortocircuito", riscrive("c e stato un corto circuito nel quadro", "cortocircuito"));
check("gruppo continuità → ups", riscrive("ho un gruppo continuita da 1 kVA", "ups"));
check("resistenza isolamento → isolamento", riscrive("la resistenza isolamento e bassa", "isolamento"));
check("avviatore progressivo → soft starter", riscrive("ho montato un avviatore progressivo", "soft starter"));
check("sbalzo tensione → sovratensione", riscrive("c e stato uno sbalzo tensione stanotte", "sovratensione"));
check("driver led → lampada led", riscrive("il driver led e bruciato", "lampada led"));

// La riscrittura pretende i confini di parola.
check("non riscrive dentro un'altra parola",
  de.normalizeQuery("il timerone non e una fascia").indexOf("timer ") < 0 ||
  de.normalizeQuery("il timerone non e una fascia").indexOf("timerone") >= 0);

// E non tocca il testo che non la contiene.
eq("un testo senza frasi note resta identico",
  de.normalizeQuery("il differenziale scatta quando accendo la lavatrice"),
  de.normalize("il differenziale scatta quando accendo la lavatrice"));

// ─── §6 La copertura reale della mappa ─────────────────────────────────
// Non è un'asserzione di qualità: è il numero da tenere sotto gli occhi.
// Finché l'82% delle voci non è esercitato da nessun caso reale, ogni
// riscrittura della mappa sarebbe una decisione senza prove.
console.log("\n§6 — quanta mappa è esercitata da frasi vere");

var chiavi = Object.keys(viste);
var tuttoIlCorpus = de.normalize(corpus.CASI_FORUM.map(function (c) {
  return [c.domanda, c.causa_reale, (c.verifiche || []).join(" "), c.lezione || ""].join(" ");
}).join(" \n "));
var soloDomandeIt = de.normalize(corpus.CASI_FORUM.filter(function (c) {
  return c.lingua === "it";
}).map(function (c) { return c.domanda; }).join(" \n "));

var esercitateIt = chiavi.filter(function (k) { return de.containsKeyword(soloDomandeIt, de.normalize(k)); });
var esercitateTutto = chiavi.filter(function (k) { return de.containsKeyword(tuttoIlCorpus, de.normalize(k)); });

console.log("    chiavi: " + chiavi.length);
console.log("    esercitate dalle 21 domande italiane: " + esercitateIt.length);
console.log("    esercitate da tutti i 48 casi:        " + esercitateTutto.length);
console.log("    mai esercitate: " + (chiavi.length - esercitateTutto.length) +
  " (" + Math.round((chiavi.length - esercitateTutto.length) / chiavi.length * 100) + "%)");

check("le chiavi esercitate dai casi reali non sono diminuite", esercitateTutto.length >= 45);
check("il vocabolario di base resta coperto", esercitateIt.length >= 12);

console.log("\n============================================================");
console.log("VOCABOLARIO: " + pass + " passed, " + fail + " failed");
console.log("============================================================");
process.exit(fail === 0 ? 0 : 1);
