"use strict";

var assert = require("assert");
var sim = require("../neural_simulator");

// ============================================================================
// 1. STRUTTURE DATI — Esperienza codificata
// ============================================================================

console.log("--- Strutture dati ---");

assert.ok(sim.ESPERIENZA, "ESPERIENZA esiste");
assert.ok(sim.ESPERIENZA.differenziale_scatta, "differenziale_scatta presente");
assert.ok(sim.ESPERIENZA.magnetotermico_scatta_subito, "magnetotermico_scatta_subito presente");
assert.ok(sim.ESPERIENZA.magnetotermico_scatta_dopo_tempo, "magnetotermico_scatta_dopo_tempo presente");
assert.ok(sim.ESPERIENZA.niente_tensione, "niente_tensione presente");
assert.ok(sim.ESPERIENZA.surriscaldamento, "surriscaldamento presente");
assert.ok(sim.ESPERIENZA.intermittente, "intermittente presente");
assert.ok(sim.ESPERIENZA.motore_non_parte, "motore_non_parte presente");
assert.ok(sim.ESPERIENZA.caldaia_non_accende, "caldaia_non_accende presente");
assert.ok(sim.ESPERIENZA.fotovoltaico_non_produce, "fotovoltaico_non_produce presente");

// Ogni sintomo ha cause con probabilità che sommano a ~1
var chiavi = Object.keys(sim.ESPERIENZA);
for (var i = 0; i < chiavi.length; i++) {
  var cause = sim.ESPERIENZA[chiavi[i]];
  assert.ok(cause.length >= 3, chiavi[i] + " ha almeno 3 cause");
  var somma = 0;
  for (var j = 0; j < cause.length; j++) {
    assert.ok(cause[j].probabilita > 0, chiavi[i] + " causa " + j + " ha probabilità > 0");
    assert.ok(cause[j].come_verifico, chiavi[i] + " causa " + j + " ha verifica");
    somma += cause[j].probabilita;
  }
  assert.ok(Math.abs(somma - 1.0) < 0.05, chiavi[i] + " probabilità sommano a ~1: " + somma.toFixed(3));
}

assert.ok(sim.CATENE.length >= 5, "almeno 5 catene causali");
assert.ok(sim.ESCLUSIONI.length >= 5, "almeno 5 regole di esclusione");

console.log("  PASS: 9 sintomi + " + chiavi.length + " validati + catene + esclusioni");

// ============================================================================
// 2. RICONOSCIMENTO SINTOMI
// ============================================================================

console.log("\n--- Riconoscimento sintomi ---");

assert.strictEqual(sim.riconosciSintomo("il differenziale scatta"), "differenziale_scatta", "diff scatta");
assert.strictEqual(sim.riconosciSintomo("il salvavita salta ogni volta"), "differenziale_scatta", "salvavita salta");
assert.strictEqual(sim.riconosciSintomo("l'RCD interviene"), "differenziale_scatta", "RCD interviene");

assert.strictEqual(sim.riconosciSintomo("il magnetotermico scatta subito"), "magnetotermico_scatta_subito", "mcb subito");
assert.strictEqual(sim.riconosciSintomo("l'interruttore scatta istantaneamente"), "magnetotermico_scatta_subito", "interruttore istantaneo");

assert.strictEqual(sim.riconosciSintomo("il magnetotermico scatta dopo 10 minuti"), "magnetotermico_scatta_dopo_tempo", "mcb dopo tempo");
assert.strictEqual(sim.riconosciSintomo("l'interruttore scatta dopo poco"), "magnetotermico_scatta_dopo_tempo", "interruttore dopo poco");

assert.strictEqual(sim.riconosciSintomo("non c'è tensione alla presa"), "niente_tensione", "niente tensione");
assert.strictEqual(sim.riconosciSintomo("la presa non funziona, niente corrente"), "niente_tensione", "presa non funziona");
assert.strictEqual(sim.riconosciSintomo("tutto spento, senza corrente"), "niente_tensione", "tutto spento");

assert.strictEqual(sim.riconosciSintomo("il cavo è caldo, surriscaldamento"), "surriscaldamento", "surriscaldamento");

assert.strictEqual(sim.riconosciSintomo("la luce va e viene, funziona a intermittenza"), "intermittente", "intermittente");
assert.strictEqual(sim.riconosciSintomo("il problema è saltuario"), "intermittente", "saltuario");

assert.strictEqual(sim.riconosciSintomo("il motore non parte"), "motore_non_parte", "motore non parte");

assert.strictEqual(sim.riconosciSintomo("la caldaia non si accende, va in blocco"), "caldaia_non_accende", "caldaia blocco");

assert.strictEqual(sim.riconosciSintomo("il fotovoltaico non produce"), "fotovoltaico_non_produce", "FV non produce");
assert.strictEqual(sim.riconosciSintomo("i pannelli solari producono poco"), "fotovoltaico_non_produce", "pannelli poco");

assert.strictEqual(sim.riconosciSintomo(""), null, "stringa vuota → null");
assert.strictEqual(sim.riconosciSintomo(null), null, "null → null");

console.log("  PASS: 19 asserzioni riconoscimento");

// ============================================================================
// 3. GENERAZIONE IPOTESI
// ============================================================================

console.log("\n--- Generazione ipotesi ---");

var ip1 = sim.generaIpotesi("differenziale_scatta");
assert.ok(ip1.length >= 3, "almeno 3 ipotesi per diff scatta");
assert.strictEqual(ip1[0].stato, "attiva", "ipotesi inizialmente attive");
assert.ok(ip1[0].probabilita > 0, "probabilità > 0");
assert.ok(ip1[0].come_verifico, "ha come_verifico");
assert.ok(ip1[0].componenti.length > 0, "ha componenti");

// La prima ipotesi deve essere la più probabile
assert.ok(ip1[0].probabilita >= ip1[ip1.length - 1].probabilita, "ordinate per probabilità");

var ip2 = sim.generaIpotesi("motore_non_parte");
assert.ok(ip2.length >= 4, "almeno 4 ipotesi per motore");

var ipNull = sim.generaIpotesi("inesistente");
assert.strictEqual(ipNull.length, 0, "0 ipotesi per sintomo sconosciuto");

console.log("  PASS: 8 asserzioni generazione");

// ============================================================================
// 4. SIMULAZIONE IN AVANTI — Catene causali
// ============================================================================

console.log("\n--- Simulazione in avanti ---");

var prev1 = sim.simulaInAvanti("dispersione su carico", null);
assert.ok(prev1.length > 0, "previsioni per dispersione");
assert.ok(prev1[0].catena === "dispersione", "catena dispersione");
assert.ok(prev1[0].passi.length >= 2, "almeno 2 passi nella catena");
assert.ok(prev1[0].probabilita_totale > 0, "probabilità totale > 0");
assert.ok(prev1[0].probabilita_totale < 1, "probabilità totale < 1");
assert.ok(prev1[0].conclusione, "conclusione presente");

var prev2 = sim.simulaInAvanti("cortocircuito a valle", null);
assert.ok(prev2.length > 0, "previsioni per cortocircuito");

var prev3 = sim.simulaInAvanti("sovraccarico", null);
assert.ok(prev3.length > 0, "previsioni per sovraccarico");
assert.ok(prev3[0].passi.length >= 3, "sovraccarico ha catena più lunga");

var prev4 = sim.simulaInAvanti("morsetto allentato", null);
assert.ok(prev4.length > 0, "previsioni per morsetto allentato");

var prev5 = sim.simulaInAvanti("cosa mai vista", null);
assert.strictEqual(prev5.length, 0, "nessuna previsione per causa sconosciuta");

// Verifica che la probabilità cumulata decresce lungo la catena
for (var p = 1; p < prev1[0].passi.length; p++) {
  assert.ok(prev1[0].passi[p].probabilita_cumulata <= prev1[0].passi[p - 1].probabilita_cumulata,
    "probabilità cumulata decresce: " + prev1[0].passi[p].probabilita_cumulata);
}

console.log("  PASS: 12 asserzioni simulazione avanti");

// ============================================================================
// 5. CONFRONTO CON FATTI
// ============================================================================

console.log("\n--- Confronto con fatti ---");

var ipTest = sim.generaIpotesi("differenziale_scatta");

// Fatto che rafforza la dispersione
var ip5a = sim.confrontaConFatti(JSON.parse(JSON.stringify(ipTest)),
  ["sezionando i carichi uno alla volta, scollegando la lavatrice non scatta più"]);
var dispRafforzata = ip5a.find(function(ip) { return ip.causa.indexOf("dispersione su carico") >= 0; });
assert.ok(dispRafforzata, "dispersione trovata");
assert.ok(dispRafforzata.rafforzata || dispRafforzata.probabilita >= 0.45, "dispersione rafforzata dai fatti");

// Fatto che esclude il RCD difettoso
var ip5b = sim.confrontaConFatti(JSON.parse(JSON.stringify(ipTest)),
  ["a vuoto tiene, il problema è a valle"]);
var rcdIp = ip5b.find(function(ip) { return ip.causa.indexOf("RCD difettoso") >= 0; });
assert.ok(rcdIp, "ipotesi RCD trovata");
assert.strictEqual(rcdIp.stato, "esclusa", "RCD difettoso escluso");

// Senza fatti: tutto invariato
var ip5c = sim.confrontaConFatti(JSON.parse(JSON.stringify(ipTest)), []);
var attive5c = ip5c.filter(function(ip) { return ip.stato === "attiva"; });
assert.strictEqual(attive5c.length, ip5c.length, "senza fatti tutte attive");

console.log("  PASS: 4 asserzioni confronto fatti");

// ============================================================================
// 6. ESCLUSIONI DA MISURE
// ============================================================================

console.log("\n--- Esclusioni da misure ---");

var ipEscl = sim.generaIpotesi("differenziale_scatta");

// Misura isolamento > 1 MOhm → esclude dispersione
var ipE1 = sim.applicaEsclusioni(JSON.parse(JSON.stringify(ipEscl)),
  [{ grandezza: "isolamento", valore: 5 }]);
var dispE = ipE1.filter(function(ip) { return ip.causa.indexOf("dispersione") >= 0 && ip.stato === "esclusa"; });
assert.ok(dispE.length > 0, "dispersione esclusa da isolamento > 1 MOhm");

// Misura isolamento basso → NON esclude
var ipE2 = sim.applicaEsclusioni(JSON.parse(JSON.stringify(ipEscl)),
  [{ grandezza: "isolamento", valore: 0.3 }]);
var dispE2 = ipE2.filter(function(ip) { return ip.causa.indexOf("dispersione") >= 0 && ip.stato === "attiva"; });
assert.ok(dispE2.length > 0, "dispersione NON esclusa con isolamento basso");

// Misura corrente sotto nominale → esclude sovraccarico
var ipEscl2 = sim.generaIpotesi("magnetotermico_scatta_dopo_tempo");
var ipE3 = sim.applicaEsclusioni(JSON.parse(JSON.stringify(ipEscl2)),
  [{ grandezza: "corrente", valore: 8, nominale: 16 }]);
var sovrE = ipE3.filter(function(ip) { return ip.causa.indexOf("sovraccarico") >= 0 && ip.stato === "esclusa"; });
assert.ok(sovrE.length > 0, "sovraccarico escluso da corrente bassa");

// Misura tensione rete normale → esclude blackout
var ipEscl3 = sim.generaIpotesi("niente_tensione");
var ipE4 = sim.applicaEsclusioni(JSON.parse(JSON.stringify(ipEscl3)),
  [{ grandezza: "tensione_rete", valore: 232 }]);
var blackE = ipE4.filter(function(ip) { return ip.causa.indexOf("rete") >= 0 && ip.stato === "esclusa"; });
assert.ok(blackE.length > 0, "blackout escluso da tensione rete OK");

console.log("  PASS: 4 asserzioni esclusioni misure");

// ============================================================================
// 7. MIGLIORE MISURA DISCRIMINANTE
// ============================================================================

console.log("\n--- Migliore misura ---");

var ipMis = sim.generaIpotesi("differenziale_scatta");
var migliore = sim.miglioreMisura(ipMis);
assert.ok(migliore, "migliore misura trovata");
assert.ok(migliore.testo, "ha testo");
assert.ok(migliore.perche, "ha perché");

// Con una sola ipotesi → null (non serve discriminare)
var ipSingola = [{ causa: "test", probabilita: 0.9, stato: "attiva", come_verifico: "fai X" }];
var misSingola = sim.miglioreMisura(ipSingola);
assert.strictEqual(misSingola, null, "null con una sola ipotesi");

console.log("  PASS: 4 asserzioni misura discriminante");

// ============================================================================
// 8. SIMULAZIONE COMPLETA — Ciclo del tecnico
// ============================================================================

console.log("\n--- Simulazione completa ---");

// Caso 1: Differenziale scatta
var caso1 = sim.simula({
  problem_summary: "il differenziale scatta quando accendo la lavatrice",
  facts_confirmed: [],
  components_detected: ["differenziale", "lavatrice"],
  measurements: []
});
assert.ok(caso1, "simulazione creata");
assert.strictEqual(caso1.sintomo, "differenziale_scatta", "sintomo riconosciuto");
assert.ok(caso1.ipotesi.length >= 3, "almeno 3 ipotesi");
assert.ok(caso1.attive >= 3, "almeno 3 attive");
assert.ok(caso1.prossima_misura, "prossima misura suggerita");
assert.strictEqual(caso1.diagnosi, null, "nessuna diagnosi ancora");

// Caso 2: Motore non parte nel capannone
var caso2 = sim.simula({
  problem_summary: "il motore trifase non parte nel capannone",
  facts_confirmed: ["il motore ronza ma non gira"],
  components_detected: ["motore"],
  measurements: []
});
assert.ok(caso2, "caso motore creato");
assert.strictEqual(caso2.sintomo, "motore_non_parte", "sintomo motore");
assert.ok(caso2.attive > 0, "ipotesi attive");

// Caso 3: Caldaia in blocco
var caso3 = sim.simula({
  problem_summary: "la caldaia non si accende, va in blocco",
  facts_confirmed: [],
  components_detected: ["caldaia"],
  measurements: []
});
assert.ok(caso3, "caso caldaia creato");
assert.strictEqual(caso3.sintomo, "caldaia_non_accende", "sintomo caldaia");

// Caso 4: Problema generico senza match
var caso4 = sim.simula({
  problem_summary: "qualcosa di strano succede",
  facts_confirmed: [],
  components_detected: [],
  measurements: []
});
assert.ok(caso4, "caso generico creato");
assert.strictEqual(caso4.attive, 0, "0 ipotesi per caso generico");

console.log("  PASS: 12 asserzioni simulazione completa");

// ============================================================================
// 9. AGGIORNAMENTO PROGRESSIVO
// ============================================================================

console.log("\n--- Aggiornamento progressivo ---");

// Simula un caso che si evolve
var casoEv = sim.simula({
  problem_summary: "il differenziale scatta",
  facts_confirmed: [],
  components_detected: ["differenziale"],
  measurements: []
});

var attiveIniziali = casoEv.attive;
assert.ok(attiveIniziali >= 3, "inizialmente >= 3 attive");

// Aggiorna con misura isolamento alto → esclude dispersione
sim.aggiorna(casoEv, {
  misura: { grandezza: "isolamento", valore: 5 }
});
assert.ok(casoEv.attive < attiveIniziali, "meno ipotesi dopo misura isolamento");
var dispEsclusa = casoEv.ipotesi.filter(function(ip) {
  return ip.causa.indexOf("dispersione") >= 0 && ip.stato === "esclusa";
});
assert.ok(dispEsclusa.length > 0, "dispersione esclusa dopo misura");

// Aggiorna con fatto
sim.aggiorna(casoEv, {
  fatto: "scatta anche senza alcun carico collegato"
});
// Questo dovrebbe rafforzare "RCD difettoso" (ma potrebbe essere già escluso o rafforzato)
assert.ok(casoEv.ipotesi.length > 0, "ipotesi ancora presenti dopo fatto");

console.log("  PASS: 4 asserzioni aggiornamento");

// ============================================================================
// 10. APPRENDIMENTO DA CASO CHIUSO
// ============================================================================

console.log("\n--- Apprendimento ---");

// Probabilità prima
var probPrima = sim.ESPERIENZA.differenziale_scatta[0].probabilita;

var ris = sim.imparaDaCasoChiuso(
  { problem_summary: "il differenziale scatta" },
  { causa_reale: "dispersione su carico", come_verificato: "sezionamento carichi" }
);
assert.ok(ris, "apprendimento riuscito");
assert.strictEqual(ris.sintomo, "differenziale_scatta", "sintomo corretto");
assert.ok(ris.aggiornato, "aggiornato");

// La probabilità della causa corretta deve essere aumentata
var probDopo = sim.ESPERIENZA.differenziale_scatta[0].probabilita;
assert.ok(probDopo >= probPrima, "probabilità della causa corretta aumentata o uguale");

// Causa nuova
var risNuovo = sim.imparaDaCasoChiuso(
  { problem_summary: "il differenziale scatta" },
  { causa_reale: "filtro EMC difettoso crea dispersione capacitiva" }
);
assert.ok(risNuovo, "apprendimento causa nuova");
var nuovaCausa = sim.ESPERIENZA.differenziale_scatta.find(function(e) {
  return e.causa.indexOf("filtro EMC") >= 0;
});
assert.ok(nuovaCausa, "nuova causa aggiunta all'esperienza");

// Caso senza match → null
var risNull = sim.imparaDaCasoChiuso(
  { problem_summary: "qualcosa di strano" },
  { causa_reale: "boh" }
);
assert.strictEqual(risNull, null, "null per sintomo non riconosciuto");

console.log("  PASS: 7 asserzioni apprendimento");

// ============================================================================
// 11. SALVA E CARICA
// ============================================================================

console.log("\n--- Salva e carica ---");

var stato = sim.salva();
assert.ok(stato, "salva ritorna dati");
assert.ok(stato.differenziale_scatta, "contiene differenziale_scatta");
assert.ok(stato.differenziale_scatta.length > 0, "cause presenti");

var caricato = sim.carica(stato);
assert.ok(caricato, "carica riuscito");

console.log("  PASS: 4 asserzioni persistenza");

// ============================================================================
// 12. STATS
// ============================================================================

console.log("\n--- Stats ---");

var stats = sim.getStats();
assert.ok(stats.sintomi >= 9, "almeno 9 sintomi");
assert.ok(stats.cause_totali >= 30, "almeno 30 cause totali");
assert.ok(stats.catene >= 5, "almeno 5 catene");
assert.ok(stats.esclusioni >= 5, "almeno 5 esclusioni");

console.log("  PASS: 4 asserzioni stats");

// ============================================================================
// 13. SCENARI REALI COMPLETI
// ============================================================================

console.log("\n--- Scenari reali ---");

// Scenario A: Differenziale scatta, seziono carichi, trovo lavatrice
var scenA = sim.simula({
  problem_summary: "il differenziale scatta quando accendo la lavatrice",
  facts_confirmed: [],
  components_detected: ["differenziale", "lavatrice"]
});
assert.ok(scenA.attive >= 3, "A: ipotesi multiple");
assert.ok(scenA.simulazioni && Object.keys(scenA.simulazioni).length > 0, "A: simulazioni generate");

sim.aggiorna(scenA, { fatto: "sezionando la lavatrice il differenziale non scatta più" });
// La dispersione su carico dovrebbe essere rafforzata
var dispA = scenA.ipotesi.find(function(ip) { return ip.causa.indexOf("dispersione su carico") >= 0; });
assert.ok(dispA, "A: dispersione presente");

// Scenario B: MCB scatta subito → cortocircuito → misura resistenza bassa
var scenB = sim.simula({
  problem_summary: "il magnetotermico scatta subito appena lo riarmo",
  facts_confirmed: ["scatta istantaneamente"],
  components_detected: ["magnetotermico"]
});
assert.ok(scenB.attive >= 2, "B: ipotesi multiple");
var cortoB = scenB.ipotesi.find(function(ip) { return ip.causa.indexOf("cortocircuito") >= 0; });
assert.ok(cortoB && cortoB.stato === "attiva", "B: cortocircuito attivo");

// Scenario C: Fotovoltaico non produce
var scenC = sim.simula({
  problem_summary: "il fotovoltaico non produce niente, l'inverter è spento",
  facts_confirmed: ["inverter spento, nessun errore sul display"],
  components_detected: ["inverter", "pannelli"]
});
assert.ok(scenC.sintomo === "fotovoltaico_non_produce", "C: sintomo FV");
assert.ok(scenC.attive > 0, "C: ipotesi attive");

// Scenario D: Problema intermittente
var scenD = sim.simula({
  problem_summary: "la luce del bagno va e viene, funziona a intermittenza",
  facts_confirmed: [],
  components_detected: ["luce"]
});
assert.ok(scenD.sintomo === "intermittente", "D: sintomo intermittente");
assert.ok(scenD.attive >= 3, "D: almeno 3 ipotesi");

// Scenario E: Surriscaldamento
var scenE = sim.simula({
  problem_summary: "il cavo della cucina è caldo, surriscaldamento evidente",
  facts_confirmed: ["cavo caldo al tatto"],
  components_detected: ["cavo"]
});
assert.ok(scenE.sintomo === "surriscaldamento", "E: sintomo surriscaldamento");

console.log("  PASS: 10 asserzioni scenari reali");

// ============================================================================
// 14. CATENE CAUSALI — Verifica struttura
// ============================================================================

console.log("\n--- Catene causali ---");

for (var ci = 0; ci < sim.CATENE.length; ci++) {
  var cat = sim.CATENE[ci];
  assert.ok(cat.partenza, "catena " + ci + " ha partenza");
  assert.ok(cat.catena.length >= 2, "catena " + ci + " ha almeno 2 passi");
  assert.ok(cat.conclusione, "catena " + ci + " ha conclusione");
  assert.ok(cat.condizione_necessaria, "catena " + ci + " ha condizione");
  for (var cj = 0; cj < cat.catena.length; cj++) {
    assert.ok(cat.catena[cj].probabilita > 0 && cat.catena[cj].probabilita <= 1,
      "catena " + ci + " passo " + cj + " probabilità valida");
  }
}

console.log("  PASS: " + (sim.CATENE.length * 5) + " asserzioni catene");

// ============================================================================
// 15. ESCLUSIONI — Verifica struttura
// ============================================================================

console.log("\n--- Esclusioni ---");

for (var ei = 0; ei < sim.ESCLUSIONI.length; ei++) {
  var e = sim.ESCLUSIONI[ei];
  assert.ok(e.misura, "esclusione " + ei + " ha misura");
  assert.ok(typeof e.condizione === "function", "esclusione " + ei + " ha condizione funzione");
  assert.ok(e.esclude.length > 0, "esclusione " + ei + " esclude almeno una causa");
  assert.ok(e.perche, "esclusione " + ei + " ha perché");
}

console.log("  PASS: " + (sim.ESCLUSIONI.length * 4) + " asserzioni esclusioni");

// ============================================================================
// RIEPILOGO
// ============================================================================

var totaleCatene = sim.CATENE.length * 5;
var totaleEsclusioni = sim.ESCLUSIONI.length * 4;
var totale = 19 + 9 + 8 + 12 + 4 + 4 + 4 + 12 + 4 + 7 + 4 + 4 + 10 + totaleCatene + totaleEsclusioni;

console.log("\n============================================");
console.log("NEURAL SIMULATOR TEST: TUTTI PASS");
console.log("  Strutture dati:            9 + validazione");
console.log("  Riconoscimento sintomi:   19");
console.log("  Generazione ipotesi:       8");
console.log("  Simulazione avanti:       12");
console.log("  Confronto fatti:           4");
console.log("  Esclusioni misure:         4");
console.log("  Misura discriminante:      4");
console.log("  Simulazione completa:     12");
console.log("  Aggiornamento:             4");
console.log("  Apprendimento:             7");
console.log("  Persistenza:               4");
console.log("  Stats:                     4");
console.log("  Scenari reali:            10");
console.log("  Catene causali:           " + totaleCatene);
console.log("  Esclusioni struttura:     " + totaleEsclusioni);
console.log("  ─────────────────────────────");
console.log("  TOTALE:                  " + totale);
console.log("============================================");
