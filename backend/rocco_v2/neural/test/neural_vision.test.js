"use strict";

var assert = require("assert");
var nv = require("../neural_vision");
var wm = require("../world_model");

// ============================================================================
// 1. STRUTTURE — VISUAL_SCHEMA e SEGNI_VISIVI
// ============================================================================

console.log("--- Strutture ---");

assert.ok(nv.VISUAL_SCHEMA, "VISUAL_SCHEMA esiste");
assert.ok(nv.VISUAL_SCHEMA.tipi.length >= 5, "almeno 5 tipi osservazione");
assert.ok(nv.VISUAL_SCHEMA.campi_obbligatori.length >= 2, "campi obbligatori");

assert.ok(nv.SEGNI_VISIVI, "SEGNI_VISIVI esiste");
assert.ok(Object.keys(nv.SEGNI_VISIVI.colori).length >= 5, "almeno 5 colori");
assert.ok(Object.keys(nv.SEGNI_VISIVI.condizioni).length >= 5, "almeno 5 condizioni");
assert.ok(Object.keys(nv.SEGNI_VISIVI.installazione).length >= 5, "almeno 5 problemi installazione");

console.log("  PASS: 7 asserzioni strutture");

// ============================================================================
// 2. INTERPRETAZIONE SINGOLA OSSERVAZIONE
// ============================================================================

console.log("\n--- Interpretazione singola ---");

// Anomalia: morsetto annerito
var r1 = nv.interpretaOsservazione({
  tipo: "anomalia",
  descrizione: "morsetto annerito e deformato dal calore",
  componente: "MCB luci"
});
assert.ok(r1.valida, "osservazione valida");
assert.ok(r1.interpretazioni.length > 0, "interpretazioni trovate");
assert.strictEqual(r1.gravita, "alta", "gravità alta per annerimento");
assert.ok(r1.collegamento_diagnostico, "collegamento diagnostico presente");
assert.ok(r1.collegamento_diagnostico.length > 0, "ipotesi diagnostiche generate");

// Anomalia: rame verde ossidato
var r2 = nv.interpretaOsservazione({
  tipo: "anomalia",
  descrizione: "rame verde ossidato nella cassetta di derivazione, c'è condensa",
  componente: "cassetta bagno"
});
assert.ok(r2.interpretazioni.length >= 2, "almeno 2 interpretazioni (verde + condensa)");
assert.ok(r2.gravita === "alta" || r2.gravita === "media", "gravità media o alta");

// Componente normale
var r3 = nv.interpretaOsservazione({
  tipo: "componente",
  descrizione: "MCB Bticino 16A curva C, in buone condizioni",
  componente: "MCB prese"
});
assert.ok(r3.valida, "componente valido");

// Osservazione incompleta
var r4 = nv.interpretaOsservazione({});
assert.ok(!r4.valida, "osservazione incompleta non valida");

var r5 = nv.interpretaOsservazione(null);
assert.ok(!r5.valida, "null non valido");

// Installazione non a norma: PE non collegato
var r6 = nv.interpretaOsservazione({
  tipo: "anomalia",
  descrizione: "pe non collegato, il giallo verde è tagliato",
  componente: "quadro"
});
assert.ok(r6.interpretazioni.length > 0, "PE non collegato riconosciuto");
assert.strictEqual(r6.gravita, "critica", "PE non collegato è critico");
assert.ok(r6.collegamento_diagnostico, "collegamento diagnostico per PE");

// Isolante screpolato
var r7 = nv.interpretaOsservazione({
  tipo: "anomalia",
  descrizione: "cavo con isolante screpolato vicino alla caldaia",
  componente: "cavo alimentazione"
});
assert.ok(r7.interpretazioni.length > 0, "screpolato riconosciuto");
assert.strictEqual(r7.gravita, "alta", "screpolato è grave");

// Materiale fuso
var r8 = nv.interpretaOsservazione({
  tipo: "anomalia",
  descrizione: "plastica del morsetto fuso, odore di bruciato",
  componente: "morsettiera"
});
assert.strictEqual(r8.gravita, "critica", "fuso è critico");

console.log("  PASS: 16 asserzioni interpretazione singola");

// ============================================================================
// 3. INTERPRETAZIONE IMMAGINE COMPLETA
// ============================================================================

console.log("\n--- Interpretazione immagine ---");

var img1 = nv.interpretaImmagine([
  { tipo: "componente", descrizione: "quadro elettrico con 6 MCB", componente: "quadro" },
  { tipo: "anomalia", descrizione: "morsetto annerito e allentato sul terzo MCB", componente: "MCB cucina" },
  { tipo: "componente", descrizione: "differenziale ABB 40A 30mA", componente: "RCD" },
  { tipo: "anomalia", descrizione: "cavo con isolante screpolato, nastro isolante su giunta" }
]);
assert.ok(img1.valida, "immagine valida");
assert.strictEqual(img1.totale_osservazioni, 4, "4 osservazioni");
assert.ok(img1.anomalie_rilevate >= 2, "almeno 2 anomalie");
assert.ok(img1.componenti_visti.length >= 2, "almeno 2 componenti visti");
assert.ok(img1.gravita_massima === "alta" || img1.gravita_massima === "critica", "gravità alta");
assert.ok(img1.problemi.length > 0, "problemi trovati");
assert.ok(img1.azioni_suggerite.length > 0, "azioni suggerite");

// Immagine vuota
var img2 = nv.interpretaImmagine([]);
assert.ok(!img2.valida, "immagine vuota non valida");

var img3 = nv.interpretaImmagine(null);
assert.ok(!img3.valida, "null non valido");

// Immagine senza anomalie
var img4 = nv.interpretaImmagine([
  { tipo: "componente", descrizione: "quadro elettrico in ordine", componente: "quadro" },
  { tipo: "componente", descrizione: "cavi ordinati con fascette", componente: "cavi" }
]);
assert.ok(img4.valida, "immagine senza anomalie valida");
assert.strictEqual(img4.anomalie_rilevate, 0, "0 anomalie");

console.log("  PASS: 10 asserzioni interpretazione immagine");

// ============================================================================
// 4. PROSSIMA FOTO SUGGERITA
// ============================================================================

console.log("\n--- Prossima foto ---");

// Se ho visto anomalia grave → chiedi dettaglio
assert.ok(img1.prossima_foto, "prossima foto suggerita");
assert.ok(img1.prossima_foto.cosa, "ha cosa fotografare");
assert.ok(img1.prossima_foto.perche, "ha perché");

// Se non ho visto il quadro → chiedilo
var img5 = nv.interpretaImmagine([
  { tipo: "componente", descrizione: "presa a muro", componente: "presa" }
]);
assert.ok(img5.prossima_foto, "suggerisce foto quadro");

console.log("  PASS: 4 asserzioni prossima foto");

// ============================================================================
// 5. CONFRONTO IMMAGINI
// ============================================================================

console.log("\n--- Confronto immagini ---");

var prima = [
  { tipo: "componente", descrizione: "morsetto in buone condizioni", componente: "morsetto_1", stato: "OK" },
  { tipo: "componente", descrizione: "cavo integro", componente: "cavo_1", stato: "OK" }
];
var dopo = [
  { tipo: "anomalia", descrizione: "morsetto annerito", componente: "morsetto_1", stato: "danneggiato" },
  { tipo: "componente", descrizione: "cavo integro", componente: "cavo_1", stato: "OK" },
  { tipo: "anomalia", descrizione: "nuova crepa nell'isolamento", componente: "cavo_2" }
];

var conf = nv.confrontaImmagini(prima, dopo);
assert.ok(conf.valida, "confronto valido");
assert.ok(conf.cambiamenti.length >= 2, "almeno 2 cambiamenti (stato morsetto + cavo nuovo)");

var cambioStato = conf.cambiamenti.find(function(c) { return c.tipo === "cambio_stato"; });
assert.ok(cambioStato, "cambio stato trovato");
assert.strictEqual(cambioStato.componente, "morsetto_1", "morsetto cambiato");

var nuovo = conf.cambiamenti.find(function(c) { return c.tipo === "nuovo"; });
assert.ok(nuovo, "componente nuovo trovato");

// Confronto con null
var confNull = nv.confrontaImmagini(null, dopo);
assert.ok(!confNull.valida, "confronto con null non valido");

// Peggioramento
var dopoP = [
  { tipo: "anomalia", descrizione: "morsetto annerito peggio di prima", componente: "morsetto_1", stato: "bruciato" }
];
var confP = nv.confrontaImmagini(prima, dopoP);
assert.ok(confP.peggiorato, "peggioramento rilevato");

// Miglioramento
var dopoM = [
  { tipo: "componente", descrizione: "morsetto pulito e serrato, nuovo", componente: "morsetto_1", stato: "OK" }
];
var confM = nv.confrontaImmagini(prima, dopoM);
assert.ok(confM.migliorato, "miglioramento rilevato");

console.log("  PASS: 8 asserzioni confronto immagini");

// ============================================================================
// 6. AGGIORNAMENTO WORLD MODEL
// ============================================================================

console.log("\n--- Aggiorna world model ---");

var worldM = wm.templateCivileMonofase();
wm.propagaStati(worldM);

// Aggiorna con osservazione anomalia
nv.aggiornaWorldModel(worldM, [
  { tipo: "anomalia", descrizione: "differenziale scattato", componente: "differenziale", stato: "scattato" },
  { tipo: "misura_visiva", descrizione: "tensione 0V sulla presa", componente: "prese", valore: 0, grandezza: "tensione", unita: "V" }
]);

// Il nodo RCD dovrebbe essere aggiornato
var rcd = worldM.trovaNodo("rcd");
assert.ok(rcd, "RCD trovato");
// Il fatto "differenziale scattato" è stato applicato
assert.ok(rcd.menzionato || rcd.stato === wm.STATI.SCATTATO, "RCD aggiornato");

// La misura sulla presa
var prese = worldM.trovaNodo("prese");
assert.ok(prese, "prese trovato");

console.log("  PASS: 3 asserzioni world model");

// ============================================================================
// 7. MEMORIA VISIVA
// ============================================================================

console.log("\n--- Memoria visiva ---");

nv.resetMemoriaVisiva();
assert.strictEqual(nv.getMemoriaVisiva().length, 0, "memoria vuota dopo reset");

// Registra immagine
nv.registraImmagine(
  [{ tipo: "anomalia", descrizione: "morsetto nero" }],
  { anomalie_rilevate: 1, gravita_massima: "alta" }
);
assert.strictEqual(nv.getMemoriaVisiva().length, 1, "1 immagine in memoria");

// Registra seconda
nv.registraImmagine(
  [{ tipo: "componente", descrizione: "quadro OK" }],
  { anomalie_rilevate: 0, gravita_massima: "nessuna" }
);
assert.strictEqual(nv.getMemoriaVisiva().length, 2, "2 immagini in memoria");

// Storia visiva
var storia = nv.getStoriaVisiva();
assert.strictEqual(storia.length, 2, "2 elementi nella storia");
assert.strictEqual(storia[0].anomalie, 1, "prima immagine ha 1 anomalia");
assert.strictEqual(storia[0].gravita, "alta", "prima immagine gravità alta");

// Reset
nv.resetMemoriaVisiva();
assert.strictEqual(nv.getMemoriaVisiva().length, 0, "memoria vuota dopo reset");

console.log("  PASS: 7 asserzioni memoria visiva");

// ============================================================================
// 8. MISURA VISIVA
// ============================================================================

console.log("\n--- Misura visiva ---");

var mv1 = nv.interpretaOsservazione({
  tipo: "misura_visiva",
  descrizione: "multimetro segna 228 volt sulla presa",
  valore: 228,
  componente: "presa soggiorno"
});
assert.ok(mv1.valida, "misura visiva valida");
assert.ok(mv1.collegamento_diagnostico, "ha interpretazione");
assert.ok(mv1.collegamento_diagnostico.interpretazione.indexOf("normale") >= 0, "228V è normale");

var mv2 = nv.interpretaOsservazione({
  tipo: "misura_visiva",
  descrizione: "multimetro segna 180 volt",
  valore: 180,
  componente: "presa cucina"
});
assert.ok(mv2.collegamento_diagnostico, "180V interpretato");
assert.ok(mv2.collegamento_diagnostico.interpretazione.indexOf("sottotensione") >= 0, "180V è sottotensione");

var mv3 = nv.interpretaOsservazione({
  tipo: "misura_visiva",
  descrizione: "multimetro segna 0 volt",
  valore: 0,
  componente: "presa"
});
assert.ok(mv3.collegamento_diagnostico.interpretazione.indexOf("assente") >= 0, "0V è assente");

var mv4 = nv.interpretaOsservazione({
  tipo: "misura_visiva",
  descrizione: "pinza amperometrica 25 ampere",
  valore: 25,
  componente: "cavo"
});
assert.ok(mv4.collegamento_diagnostico, "corrente interpretata");

console.log("  PASS: 6 asserzioni misura visiva");

// ============================================================================
// 9. TARGHETTA
// ============================================================================

console.log("\n--- Targhetta ---");

var t1 = nv.interpretaOsservazione({
  tipo: "targhetta",
  descrizione: "targhetta motore: 2200W 400V 5.5A IP55",
  componente: "motore"
});
assert.ok(t1.collegamento_diagnostico, "targhetta interpretata");
assert.strictEqual(t1.collegamento_diagnostico.potenza, 2200, "potenza 2200W");
assert.strictEqual(t1.collegamento_diagnostico.tensione, 400, "tensione 400V");
assert.strictEqual(t1.collegamento_diagnostico.corrente, 5.5, "corrente 5.5A");
assert.strictEqual(t1.collegamento_diagnostico.grado_protezione, "IP55", "IP55");

var t2 = nv.interpretaOsservazione({
  tipo: "targhetta",
  descrizione: "lavatrice 2.2kW 230V 10A",
  componente: "lavatrice"
});
assert.ok(t2.collegamento_diagnostico, "targhetta lavatrice");
assert.strictEqual(t2.collegamento_diagnostico.potenza, 2200, "2.2kW = 2200W");

console.log("  PASS: 6 asserzioni targhetta");

// ============================================================================
// 10. SCENARI REALI
// ============================================================================

console.log("\n--- Scenari reali ---");

// Scenario A: Foto quadro con problemi
var scenA = nv.interpretaImmagine([
  { tipo: "componente", descrizione: "quadro elettrico vecchio con 4 MCB", componente: "quadro" },
  { tipo: "anomalia", descrizione: "morsetto annerito e allentato sul secondo MCB", componente: "MCB prese" },
  { tipo: "anomalia", descrizione: "cavo con isolante screpolato, senza guaina visibile", componente: "cavo" },
  { tipo: "anomalia", descrizione: "giunta bagnata con nastro isolante in cassetta", componente: "giunta" },
  { tipo: "componente", descrizione: "RCD vecchio senza marchio CE", componente: "RCD" }
]);
assert.ok(scenA.valida, "A: valida");
assert.ok(scenA.anomalie_rilevate >= 3, "A: almeno 3 anomalie");
assert.ok(scenA.gravita_massima === "alta" || scenA.gravita_massima === "critica", "A: gravità alta");
assert.ok(scenA.azioni_suggerite.length >= 2, "A: almeno 2 azioni");

// Scenario B: Foto di cavo surriscaldato
var scenB = nv.interpretaImmagine([
  { tipo: "anomalia", descrizione: "cavo con isolante screpolato e gonfio", componente: "cavo cucina" },
  { tipo: "anomalia", descrizione: "morsetto con segni di ossidazione verde", componente: "morsetto" }
]);
assert.ok(scenB.gravita_massima === "alta", "B: gravità alta");

// Scenario C: Quadro in ordine
var scenC = nv.interpretaImmagine([
  { tipo: "componente", descrizione: "quadro elettrico nuovo Bticino", componente: "quadro" },
  { tipo: "componente", descrizione: "MCB tutti in posizione ON", componente: "MCB" },
  { tipo: "componente", descrizione: "cavi ordinati con fascette", componente: "cavi" }
]);
assert.strictEqual(scenC.anomalie_rilevate, 0, "C: 0 anomalie in quadro nuovo");
assert.strictEqual(scenC.gravita_massima, "nessuna", "C: gravità nessuna");

console.log("  PASS: 7 asserzioni scenari reali");

// ============================================================================
// 11. STATS
// ============================================================================

console.log("\n--- Stats ---");

var stats = nv.getStats();
assert.ok(stats.segni_colore >= 5, "almeno 5 segni colore");
assert.ok(stats.segni_condizione >= 5, "almeno 5 segni condizione");
assert.ok(stats.segni_installazione >= 5, "almeno 5 segni installazione");
assert.ok(stats.tipi_osservazione >= 5, "almeno 5 tipi");

console.log("  PASS: 4 asserzioni stats");

// ============================================================================
// RIEPILOGO
// ============================================================================

var totale = 7 + 16 + 10 + 4 + 8 + 3 + 7 + 6 + 6 + 7 + 4;

console.log("\n============================================");
console.log("NEURAL VISION TEST: TUTTI PASS");
console.log("  Strutture:                 7");
console.log("  Interpretazione singola:  16");
console.log("  Interpretazione immagine: 10");
console.log("  Prossima foto:             4");
console.log("  Confronto immagini:        8");
console.log("  World model:               3");
console.log("  Memoria visiva:            7");
console.log("  Misura visiva:             6");
console.log("  Targhetta:                 6");
console.log("  Scenari reali:             7");
console.log("  Stats:                     4");
console.log("  ─────────────────────────────");
console.log("  TOTALE:                   " + totale);
console.log("============================================");
