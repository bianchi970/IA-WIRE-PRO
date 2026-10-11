"use strict";

/**
 * PULISCE I RESIDUI DEL CORPUS DALLO STATO APPRESO.
 *
 *   cd backend && node tools/pulisci_residui_corpus.js            (dice cosa farebbe)
 *   cd backend && node tools/pulisci_residui_corpus.js --applica  (lo fa)
 *   cd backend && node tools/pulisci_residui_corpus.js --azzera   (ricomincia da zero)
 *
 * Perché serve. Fino all'11/10/2026 l'avvio del neurale ingeriva tutti i 48
 * casi di `casi_reali_forum.js` **con la loro `causa_reale`** — e quel file è
 * il metro dell'esame. Il codice è stato corretto, ma lo stato già scritto su
 * disco se le porta ancora dentro: `memory_state.json` contiene episodi la cui
 * `confirmed_cause` è, parola per parola, la risposta di un caso d'esame. Da
 * lì `findSimilarCases()` può rimetterla fra le ipotesi, e la pagella
 * tornerebbe a misurare memoria invece di conoscenza.
 *
 * Cosa fa, e cosa NON può fare:
 *
 *  · **episodi**: rimuove quelli la cui `confirmed_cause` coincide con una
 *    `causa_reale` del corpus. È chirurgico e verificabile: si vede quale
 *    caso d'esame era.
 *  · **vocabolario, embedding, grafo, pattern**: i testi del corpus vi sono
 *    entrati *diluiti* — una parola fra le altre, un peso fra gli altri. Non
 *    si estraggono voce per voce. Lì l'unica pulizia vera è `--azzera`, e
 *    costa poco: la scuola si rifà a ogni avvio, e l'esperienza vera sta nei
 *    casi chiusi (`data/rocco-v2-memory.json`), che questo strumento **non
 *    tocca mai**.
 *
 * Fa sempre una copia prima di scrivere: `<file>.prima-della-pulizia`.
 */

var fs = require("fs");
var path = require("path");

var DIR_NEURAL = path.join(__dirname, "..", "data", "neural");
var FILE_MEMORIA = path.join(DIR_NEURAL, "memory_state.json");
var FILE_CASI_CHIUSI = path.join(__dirname, "..", "data", "rocco-v2-memory.json");

var APPLICA = process.argv.indexOf("--applica") >= 0;
var AZZERA = process.argv.indexOf("--azzera") >= 0;

function leggi(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return null; }
}

function copiaDiSicurezza(file) {
  try { fs.writeFileSync(file + ".prima-della-pulizia", fs.readFileSync(file, "utf8"), "utf8"); } catch (e) {}
}

// Le risposte dell'esame, normalizzate.
var corpus = require("../rocco_v2/neural/casi_reali_forum.js").CASI_FORUM;
var rispostaDiEsame = {};
corpus.forEach(function (c) {
  var k = String(c.causa_reale || "").toLowerCase().trim();
  if (k) rispostaDiEsame[k] = c.id;
});

console.log("\nRESIDUI DEL CORPUS NELLO STATO APPRESO");
console.log("  risposte d'esame da cercare: " + Object.keys(rispostaDiEsame).length +
  " (su " + corpus.length + " casi)\n");

// ── Casi chiusi veri: si contano e non si toccano ────────────────────
var chiusi = leggi(FILE_CASI_CHIUSI);
var nChiusi = chiusi && Array.isArray(chiusi.closed_cases) ? chiusi.closed_cases.length : 0;
console.log("  casi chiusi dall'elettricista: " + nChiusi + "  (non vengono toccati)");

// ── Episodi ──────────────────────────────────────────────────────────
var mem = leggi(FILE_MEMORIA);
if (!mem || !Array.isArray(mem.episodi)) {
  console.log("  memoria episodica: assente o illeggibile, niente da fare\n");
} else {
  var tenuti = [];
  var rimossi = [];
  mem.episodi.forEach(function (e) {
    var s = e && e.snapshot ? e.snapshot : {};
    var causa = String(s.confirmed_cause || "").toLowerCase().trim();
    var caso = causa ? rispostaDiEsame[causa] : null;
    if (caso) rimossi.push({ id: e.id, caso: caso, causa: causa });
    else tenuti.push(e);
  });

  console.log("  episodi in memoria: " + mem.episodi.length);
  console.log("  di cui con una risposta d'esame: " + rimossi.length);
  rimossi.slice(0, 12).forEach(function (r) {
    console.log("     " + r.caso + "  →  " + r.causa.substring(0, 62));
  });
  if (rimossi.length > 12) console.log("     … e altri " + (rimossi.length - 12));

  if (rimossi.length && (APPLICA || AZZERA)) {
    copiaDiSicurezza(FILE_MEMORIA);
    mem.episodi = tenuti;
    fs.writeFileSync(FILE_MEMORIA, JSON.stringify(mem, null, 2), "utf8");
    console.log("  → rimossi. Restano " + tenuti.length + " episodi.");
  } else if (rimossi.length) {
    console.log("  → niente scritto. Per rimuoverli: --applica");
  }
}

// ── Azzeramento completo ─────────────────────────────────────────────
if (AZZERA) {
  var accumulati = ["distiller_rules.json", "evolution_state.json", "knowledge_graph.json",
    "language_state.json", "memory_state.json", "patterns_state.json"];
  console.log("\n  AZZERAMENTO dello stato appreso (il seed di conoscenza resta):");
  accumulati.forEach(function (n) {
    var p = path.join(DIR_NEURAL, n);
    if (!fs.existsSync(p)) return;
    copiaDiSicurezza(p);
    try { fs.unlinkSync(p); console.log("     via  " + n); } catch (e) {}
  });
  console.log("     resta simulator_state.json (conoscenza scritta a mano)");
  console.log("     restano i " + nChiusi + " casi chiusi: l'esperienza vera non si azzera");
  console.log("  Al prossimo avvio ROCCO rifà la scuola e riparte da lì.");
}

console.log("");
