"use strict";

var assert = require("assert");
var wm = require("../world_model");

var TIPI = wm.TIPI_NODO;
var STATI = wm.STATI;

// ============================================================================
// HELPER
// ============================================================================

function contaNodi(model) { return Object.keys(model.nodi).length; }

// ============================================================================
// 1. COSTANTI E STRUTTURE BASE
// ============================================================================

console.log("--- Costanti e strutture ---");

assert.ok(TIPI.SORGENTE, "TIPI_NODO.SORGENTE esiste");
assert.ok(TIPI.PROTEZIONE_DIFF, "TIPI_NODO.PROTEZIONE_DIFF esiste");
assert.ok(TIPI.PROTEZIONE_MCB, "TIPI_NODO.PROTEZIONE_MCB esiste");
assert.ok(TIPI.CARICO, "TIPI_NODO.CARICO esiste");
assert.ok(TIPI.CONDUTTORE, "TIPI_NODO.CONDUTTORE esiste");
assert.ok(TIPI.CONTATTORE, "TIPI_NODO.CONTATTORE esiste");
assert.ok(TIPI.INVERTER, "TIPI_NODO.INVERTER esiste");
assert.ok(TIPI.ACCUMULO, "TIPI_NODO.ACCUMULO esiste");
console.log("  PASS: 8 tipi nodo");

assert.ok(STATI.ALIMENTATO, "STATI.ALIMENTATO");
assert.ok(STATI.NON_ALIMENTATO, "STATI.NON_ALIMENTATO");
assert.ok(STATI.SCATTATO, "STATI.SCATTATO");
assert.ok(STATI.GUASTO, "STATI.GUASTO");
assert.ok(STATI.DISPERSIONE, "STATI.DISPERSIONE");
assert.ok(STATI.CORTOCIRCUITO, "STATI.CORTOCIRCUITO");
assert.ok(STATI.SOVRACCARICO, "STATI.SOVRACCARICO");
assert.ok(STATI.SURRISCALDAMENTO, "STATI.SURRISCALDAMENTO");
assert.ok(STATI.SCONOSCIUTO, "STATI.SCONOSCIUTO");
console.log("  PASS: 9 stati");

assert.strictEqual(wm.TENSIONI.MONOFASE, 230, "tensione monofase 230V");
assert.strictEqual(wm.TENSIONI.TRIFASE_CONCAT, 400, "tensione trifase 400V");
console.log("  PASS: 2 tensioni standard");

// ============================================================================
// 2. WORLDMODEL BASE — costruzione manuale
// ============================================================================

console.log("\n--- WorldModel base ---");

var m1 = new wm.WorldModel();
assert.ok(m1, "WorldModel creato");
assert.strictEqual(m1.contaNodi(), 0, "0 nodi iniziali");
assert.strictEqual(m1.contaArchi(), 0, "0 archi iniziali");

m1.aggiungiNodo("s1", TIPI.SORGENTE, "Rete", { tensione: 230 });
assert.strictEqual(m1.contaNodi(), 1, "1 nodo dopo aggiunta");

var nodo = m1.trovaNodo("s1");
assert.ok(nodo, "trovaNodo per id");
assert.strictEqual(nodo.nome, "Rete", "nome corretto");
assert.strictEqual(nodo.elettrici.tensione_attesa, 230, "tensione attesa");
assert.strictEqual(nodo.stato, STATI.SCONOSCIUTO, "stato iniziale sconosciuto");

m1.aggiungiNodo("mcb1", TIPI.PROTEZIONE_MCB, "MCB 16A", { tensione: 230, In: 16, curva: "C" });
var mcb = m1.trovaNodo("mcb1");
assert.ok(mcb.protezione, "protezione presente su MCB");
assert.strictEqual(mcb.protezione.In, 16, "In corretta");
assert.strictEqual(mcb.protezione.curva, "C", "curva corretta");

m1.aggiungiNodo("cavo1", TIPI.CONDUTTORE, "Cavo 2.5mm²", { sezione: 2.5, materiale: "rame" });
var cavo = m1.trovaNodo("cavo1");
assert.ok(cavo.conduttore, "conduttore presente");
assert.strictEqual(cavo.conduttore.sezione, 2.5, "sezione corretta");
assert.strictEqual(cavo.conduttore.materiale, "rame", "materiale corretto");

m1.aggiungiNodo("carico1", TIPI.CARICO, "Presa cucina", { tensione: 230 });

m1.aggiungiArco("s1", "mcb1", "alimenta");
m1.aggiungiArco("mcb1", "cavo1", "alimenta");
m1.aggiungiArco("cavo1", "carico1", "alimenta");
assert.strictEqual(m1.contaArchi(), 3, "3 archi");

console.log("  PASS: 15 asserzioni costruzione base");

// ============================================================================
// 3. NAVIGAZIONE GRAFO
// ============================================================================

console.log("\n--- Navigazione grafo ---");

var aValle = m1.aValle("s1");
assert.strictEqual(aValle.length, 1, "1 nodo a valle di sorgente");
assert.strictEqual(aValle[0].id, "mcb1", "a valle è mcb1");

var aMonte = m1.aMonte("carico1");
assert.strictEqual(aMonte.length, 1, "1 nodo a monte di carico");
assert.strictEqual(aMonte[0].id, "cavo1", "a monte è cavo1");

var disc = m1.discendenti("s1");
assert.strictEqual(disc.length, 3, "3 discendenti da sorgente");

var ant = m1.antenati("carico1");
assert.strictEqual(ant.length, 3, "3 antenati di carico");

var trovato = m1.trovaNodoPerNome("Presa cucina");
assert.ok(trovato, "trovaNodoPerNome funziona");
assert.strictEqual(trovato.id, "carico1", "id corretto");

var trovato2 = m1.trovaNodoPerNome("cucina");
assert.ok(trovato2, "match parziale funziona");

var nonTrovato = m1.trovaNodoPerNome("inesistente");
assert.strictEqual(nonTrovato, null, "null per nome inesistente");

var perTipo = m1.nodiPerTipo(TIPI.CARICO);
assert.strictEqual(perTipo.length, 1, "1 carico trovato per tipo");

console.log("  PASS: 11 asserzioni navigazione");

// ============================================================================
// 4. TEMPLATE CIVILE MONOFASE
// ============================================================================

console.log("\n--- Template civile monofase ---");

var civile = wm.templateCivileMonofase();
assert.ok(civile, "template creato");
assert.strictEqual(civile.tipo_impianto, "civile", "tipo civile");
assert.strictEqual(civile.sistema, "monofase", "sistema monofase");
assert.strictEqual(civile.tensione_rete, 230, "tensione 230V");

// Deve avere almeno: rete, terra, qg, gen, rcd + 6 linee (mcb+cavo+carico ciascuna) = 23+ nodi
assert.ok(civile.contaNodi() >= 20, "almeno 20 nodi nel civile: " + civile.contaNodi());
assert.ok(civile.contaArchi() >= 10, "almeno 10 archi nel civile: " + civile.contaArchi());

// Verifica nodi chiave
assert.ok(civile.trovaNodo("rete"), "nodo rete");
assert.ok(civile.trovaNodo("rcd"), "nodo rcd");
assert.ok(civile.trovaNodo("qg"), "nodo qg");
assert.ok(civile.trovaNodo("gen"), "nodo gen");
assert.ok(civile.trovaNodo("lavatrice"), "nodo lavatrice");
assert.ok(civile.trovaNodo("luci"), "nodo luci");
assert.ok(civile.trovaNodo("prese"), "nodo prese");
assert.ok(civile.trovaNodo("clima"), "nodo clima");
assert.ok(civile.trovaNodo("cucina"), "nodo cucina");
assert.ok(civile.trovaNodo("bagno"), "nodo bagno");

// Verifica topologia: lavatrice è a valle del rcd
var antLav = civile.antenati("lavatrice");
var rcdTrovato = false;
for (var i = 0; i < antLav.length; i++) {
  if (antLav[i].id === "rcd") rcdTrovato = true;
}
assert.ok(rcdTrovato, "rcd è antenato della lavatrice");

console.log("  PASS: 17 asserzioni template civile");

// ============================================================================
// 5. TEMPLATE TRIFASE INDUSTRIALE
// ============================================================================

console.log("\n--- Template trifase industriale ---");

var ind = wm.templateTrifaseIndustriale();
assert.strictEqual(ind.tipo_impianto, "industriale", "tipo industriale");
assert.strictEqual(ind.sistema, "trifase", "sistema trifase");
assert.strictEqual(ind.tensione_rete, 400, "tensione 400V");
assert.ok(ind.trovaNodo("motore"), "nodo motore");
assert.ok(ind.trovaNodo("cont_mot"), "nodo contattore");
assert.ok(ind.trovaNodo("sez"), "nodo sezionatore");
assert.ok(ind.trovaNodo("rt_mot"), "nodo relè termico");

// Motore a valle del contattore
var discCont = ind.discendenti("cont_mot");
var motoreInDisc = false;
for (var j = 0; j < discCont.length; j++) {
  if (discCont[j].id === "motore") motoreInDisc = true;
}
assert.ok(motoreInDisc, "motore è discendente del contattore");

console.log("  PASS: 8 asserzioni template industriale");

// ============================================================================
// 6. TEMPLATE FOTOVOLTAICO
// ============================================================================

console.log("\n--- Template fotovoltaico ---");

var fv = wm.templateFotovoltaico();
assert.strictEqual(fv.tipo_impianto, "fotovoltaico", "tipo FV");
assert.ok(fv.trovaNodo("pannelli"), "nodo pannelli");
assert.ok(fv.trovaNodo("inverter_fv"), "nodo inverter");
assert.ok(fv.trovaNodo("batteria"), "nodo batteria");
assert.ok(fv.trovaNodo("bms"), "nodo BMS");
assert.ok(fv.trovaNodo("sez_dc"), "nodo sezionatore DC");

console.log("  PASS: 6 asserzioni template FV");

// ============================================================================
// 7. TEMPLATE CALDAIA
// ============================================================================

console.log("\n--- Template caldaia ---");

var cald = wm.templateCaldaia();
assert.strictEqual(cald.tipo_impianto, "caldaia", "tipo caldaia");
assert.ok(cald.trovaNodo("scheda"), "nodo scheda");
assert.ok(cald.trovaNodo("valvola_gas"), "nodo valvola gas");
assert.ok(cald.trovaNodo("sonda_ntc"), "nodo sonda NTC");
assert.ok(cald.trovaNodo("pompa"), "nodo pompa");
assert.ok(cald.trovaNodo("pressostato"), "nodo pressostato");
assert.ok(cald.trovaNodo("ventilatore"), "nodo ventilatore");

console.log("  PASS: 7 asserzioni template caldaia");

// ============================================================================
// 8. PROPAGAZIONE STATI
// ============================================================================

console.log("\n--- Propagazione stati ---");

var prop = wm.templateCivileMonofase();

// Senza stati settati: propaga alimenta tutto
wm.propagaStati(prop);
assert.strictEqual(prop.trovaNodo("rete").stato, STATI.ALIMENTATO, "rete alimentata");
assert.strictEqual(prop.trovaNodo("qg").stato, STATI.ALIMENTATO, "qg alimentato");
assert.strictEqual(prop.trovaNodo("luci").stato, STATI.ALIMENTATO, "luci alimentate");
assert.strictEqual(prop.trovaNodo("lavatrice").stato, STATI.ALIMENTATO, "lavatrice alimentata");

// Ora scatta il RCD
prop.trovaNodo("rcd").stato = STATI.SCATTATO;
// Reset stati a valle per ri-propagare
var valleRcd = prop.discendenti("rcd");
for (var v = 0; v < valleRcd.length; v++) {
  valleRcd[v].stato = STATI.SCONOSCIUTO;
}
wm.propagaStati(prop);
assert.strictEqual(prop.trovaNodo("luci").stato, STATI.NON_ALIMENTATO, "luci non alimentate dopo RCD scattato");
assert.strictEqual(prop.trovaNodo("lavatrice").stato, STATI.NON_ALIMENTATO, "lavatrice non alimentata dopo RCD scattato");

// Il quadro generale deve essere ancora alimentato
assert.strictEqual(prop.trovaNodo("qg").stato, STATI.ALIMENTATO, "qg ancora alimentato");
assert.strictEqual(prop.trovaNodo("gen").stato, STATI.ALIMENTATO, "gen ancora alimentato");

console.log("  PASS: 8 asserzioni propagazione");

// ============================================================================
// 9. COSTRUZIONE DA CASE STATE
// ============================================================================

console.log("\n--- Costruzione da caseState ---");

// Caso civile di default
var wm1 = wm.costruisciDaCaseState(null);
assert.strictEqual(wm1.tipo_impianto, "civile", "default civile");

// Caso industriale
var wm2 = wm.costruisciDaCaseState({ problem_summary: "il motore trifase non parte nel capannone" });
assert.strictEqual(wm2.tipo_impianto, "industriale", "riconosciuto industriale");

// Caso fotovoltaico
var wm3 = wm.costruisciDaCaseState({ problem_summary: "l'inverter solare non produce, pannelli fotovoltaico" });
assert.strictEqual(wm3.tipo_impianto, "fotovoltaico", "riconosciuto fotovoltaico");

// Caso caldaia
var wm4 = wm.costruisciDaCaseState({ problem_summary: "la caldaia non si accende, errore fiamma" });
assert.strictEqual(wm4.tipo_impianto, "caldaia", "riconosciuto caldaia");

// Con componenti rilevati
var wm5 = wm.costruisciDaCaseState({
  problem_summary: "il differenziale scatta",
  components_detected: ["differenziale", "lavatrice"]
});
assert.ok(wm5.trovaNodo("rcd").menzionato, "rcd menzionato");
assert.ok(wm5.trovaNodo("lavatrice").menzionato, "lavatrice menzionata");

// Con fatti confermati
var wm6 = wm.costruisciDaCaseState({
  problem_summary: "problemi in casa",
  facts_confirmed: ["differenziale scattato"]
});
assert.strictEqual(wm6.trovaNodo("rcd").stato, STATI.SCATTATO, "rcd scattato da fatto");
assert.ok(wm6.trovaNodo("rcd").verificato, "rcd verificato");

console.log("  PASS: 9 asserzioni costruzione da caseState");

// ============================================================================
// 10. SIMULAZIONE
// ============================================================================

console.log("\n--- Simulazione ---");

var simBase = wm.templateCivileMonofase();
wm.propagaStati(simBase);

// Simulazione: scatta RCD
var sim1 = wm.simula(simBase, "rcd", STATI.SCATTATO);
assert.ok(sim1.previsioni.length > 0, "previsioni generate per RCD scattato");
// Tutti i carichi devono perdere tensione
var luciPrevisto = false;
for (var p1 = 0; p1 < sim1.previsioni.length; p1++) {
  if (sim1.previsioni[p1].nodo_id === "luci") luciPrevisto = true;
}
assert.ok(luciPrevisto, "luci previste senza tensione");

// Lo stato del nodo NON deve essere modificato (rollback)
assert.strictEqual(simBase.trovaNodo("rcd").stato, STATI.ALIMENTATO, "stato RCD non modificato dopo simulazione");

// Simulazione: dispersione sulla lavatrice
var sim2 = wm.simula(simBase, "lavatrice", STATI.DISPERSIONE);
assert.ok(sim2.previsioni.length > 0, "previsioni generate per dispersione");
var rcdScatta = false;
for (var p2 = 0; p2 < sim2.previsioni.length; p2++) {
  if (sim2.previsioni[p2].nodo_id === "rcd" && sim2.previsioni[p2].stato_previsto === STATI.SCATTATO) {
    rcdScatta = true;
  }
}
assert.ok(rcdScatta, "dispersione prevede RCD scatta");

// Simulazione: cortocircuito
var sim3 = wm.simula(simBase, "luci", STATI.CORTOCIRCUITO);
assert.ok(sim3.previsioni.length > 0, "previsioni per cortocircuito");
var mcbScatta = false;
for (var p3 = 0; p3 < sim3.previsioni.length; p3++) {
  if (sim3.previsioni[p3].stato_previsto === STATI.SCATTATO) mcbScatta = true;
}
assert.ok(mcbScatta, "MCB scatta per cortocircuito");

// Simulazione: sovraccarico
var sim4 = wm.simula(simBase, "luci", STATI.SOVRACCARICO);
assert.ok(sim4.previsioni.length > 0, "previsioni per sovraccarico");

// Simulazione: surriscaldamento
var sim5 = wm.simula(simBase, "cavo_luci", STATI.SURRISCALDAMENTO);
assert.ok(sim5.previsioni.length > 0, "previsioni per surriscaldamento");
assert.ok(sim5.previsioni[0].osservabile.indexOf("calore") >= 0, "osservabile parla di calore");

// Simulazione: nodo inesistente
var sim6 = wm.simula(simBase, "inesistente", STATI.GUASTO);
assert.ok(sim6.errore, "errore per nodo inesistente");

console.log("  PASS: 11 asserzioni simulazione");

// ============================================================================
// 11. CONFRONTO ATTESO VS REALE
// ============================================================================

console.log("\n--- Confronto atteso vs reale ---");

var confr = wm.templateCivileMonofase();
wm.propagaStati(confr);

// Nessuna misura: nessuna discrepanza
var disc0 = wm.confrontaAttesoReale(confr);
assert.strictEqual(disc0.length, 0, "0 discrepanze senza misure");

// Sottotensione
confr.trovaNodo("luci").elettrici.tensione_misurata = 180;
var disc1 = wm.confrontaAttesoReale(confr);
assert.ok(disc1.length > 0, "discrepanza rilevata per sottotensione");
assert.strictEqual(disc1[0].tipo, "sottotensione", "tipo sottotensione");
assert.ok(disc1[0].possibili_cause.length > 0, "cause possibili presenti");

// Sovratensione
confr.trovaNodo("prese").elettrici.tensione_misurata = 280;
var disc2 = wm.confrontaAttesoReale(confr);
var sovrat = disc2.filter(function(d) { return d.tipo === "sovratensione"; });
assert.ok(sovrat.length > 0, "discrepanza sovratensione");

// Tensione inattesa su nodo non alimentato
confr.trovaNodo("luci").stato = STATI.NON_ALIMENTATO;
confr.trovaNodo("luci").elettrici.tensione_misurata = 120;
var disc3 = wm.confrontaAttesoReale(confr);
var inattesa = disc3.filter(function(d) { return d.tipo === "tensione_inattesa"; });
assert.ok(inattesa.length > 0, "tensione inattesa rilevata");

// Sovracorrente
confr.trovaNodo("mcb_prese").elettrici.corrente_nominale = 16;
confr.trovaNodo("mcb_prese").elettrici.corrente_attuale = 25;
var disc4 = wm.confrontaAttesoReale(confr);
var sovraI = disc4.filter(function(d) { return d.tipo === "sovracorrente"; });
assert.ok(sovraI.length > 0, "sovracorrente rilevata");

// Discontinuità: monte alimentato+verificato, valle non alimentato+verificato
var confrD = wm.templateCivileMonofase();
wm.propagaStati(confrD);
confrD.trovaNodo("mcb_luci").verificato = true;
confrD.trovaNodo("cavo_luci").stato = STATI.NON_ALIMENTATO;
confrD.trovaNodo("cavo_luci").verificato = true;
var disc5 = wm.confrontaAttesoReale(confrD);
var discont = disc5.filter(function(d) { return d.tipo === "discontinuita"; });
assert.ok(discont.length > 0, "discontinuità rilevata");

console.log("  PASS: 9 asserzioni confronto");

// ============================================================================
// 12. LOCALIZZAZIONE GUASTO
// ============================================================================

console.log("\n--- Localizzazione guasto ---");

// RCD scattato
var loc1 = wm.costruisciDaCaseState({
  problem_summary: "il differenziale scatta in casa",
  facts_confirmed: ["differenziale scattato"]
});
var cand1 = wm.localizzaGuasto(loc1);
assert.ok(cand1.length > 0, "candidati guasto trovati con RCD scattato");
var rcdCand = cand1.filter(function(c) { return c.nodo_id === "rcd"; });
assert.ok(rcdCand.length > 0, "RCD tra i candidati");
assert.ok(rcdCand[0].zona_guasto, "zona guasto indicata");
assert.ok(rcdCand[0].zona_guasto.length > 0, "zona guasto non vuota");
assert.ok(rcdCand[0].verifiche.length > 0, "verifiche suggerite");

// Anomalia diretta
var loc2 = wm.templateCivileMonofase();
loc2.trovaNodo("cavo_prese").stato = STATI.SURRISCALDAMENTO;
var cand2 = wm.localizzaGuasto(loc2);
var surrCand = cand2.filter(function(c) { return c.nodo_id === "cavo_prese"; });
assert.ok(surrCand.length > 0, "surriscaldamento localizzato");

console.log("  PASS: 6 asserzioni localizzazione");

// ============================================================================
// 13. MISURA PIÙ DISCRIMINANTE
// ============================================================================

console.log("\n--- Misura più discriminante ---");

// RCD scattato → suggerisce isolamento
var mis1 = wm.templateCivileMonofase();
mis1.trovaNodo("rcd").stato = STATI.SCATTATO;
var sugg1 = wm.misuraPiuDiscriminante(mis1);
assert.ok(sugg1.length > 0, "suggerimenti presenti");
var isoSugg = sugg1.filter(function(s) { return s.misura === "isolamento"; });
assert.ok(isoSugg.length > 0, "misura isolamento suggerita per RCD scattato");

// MCB scattato → suggerisce resistenza
var mis2 = wm.templateCivileMonofase();
mis2.trovaNodo("mcb_luci").stato = STATI.SCATTATO;
var sugg2 = wm.misuraPiuDiscriminante(mis2);
var resSugg = sugg2.filter(function(s) { return s.misura === "resistenza"; });
assert.ok(resSugg.length > 0, "misura resistenza suggerita per MCB scattato");

// Nodo sconosciuto tra monte alimentato e valle non alimentato
var mis3 = wm.templateCivileMonofase();
wm.propagaStati(mis3);
mis3.trovaNodo("cavo_luci").stato = STATI.SCONOSCIUTO;
mis3.trovaNodo("cavo_luci").verificato = false;
mis3.trovaNodo("luci").stato = STATI.NON_ALIMENTATO;
var sugg3 = wm.misuraPiuDiscriminante(mis3);
var discriSugg = sugg3.filter(function(s) { return s.nodo_id === "cavo_luci"; });
assert.ok(discriSugg.length > 0, "suggerisce misura sul cavo tra alimentato e non alimentato");
assert.ok(discriSugg[0].discriminazione > 0.8, "alta discriminazione");

console.log("  PASS: 5 asserzioni misura discriminante");

// ============================================================================
// 14. SNAPSHOT
// ============================================================================

console.log("\n--- Snapshot ---");

var snap1 = wm.templateCivileMonofase();
wm.propagaStati(snap1);
var s1 = wm.snapshot(snap1);
assert.ok(s1, "snapshot creato");
assert.strictEqual(s1.tipo_impianto, "civile", "tipo impianto nello snapshot");
assert.strictEqual(s1.sistema, "monofase", "sistema nello snapshot");
assert.ok(s1.totale_nodi > 0, "nodi presenti");
assert.ok(s1.totale_archi > 0, "archi presenti");
assert.ok(s1.alimentati > 0, "nodi alimentati presenti");
assert.ok(s1.sconosciuti <= 1, "al max 1 sconosciuto dopo propagazione (terra)");
assert.ok(Array.isArray(s1.problemi), "problemi è array");
assert.ok(Array.isArray(s1.discrepanze), "discrepanze è array");
assert.ok(Array.isArray(s1.candidati_guasto), "candidati_guasto è array");

// Snapshot con problema
snap1.trovaNodo("rcd").stato = STATI.SCATTATO;
var s2 = wm.snapshot(snap1);
assert.ok(s2.problemi.length > 0, "problemi rilevati con RCD scattato");
assert.ok(s2.candidati_guasto.length > 0, "candidati guasto presenti");

console.log("  PASS: 12 asserzioni snapshot");

// ============================================================================
// 15. AGGIORNA MODELLO
// ============================================================================

console.log("\n--- Aggiorna modello ---");

var agg = wm.templateCivileMonofase();
wm.propagaStati(agg);

// Aggiorna con fatto
wm.aggiorna(agg, { fatto: "differenziale scattato" });
assert.strictEqual(agg.trovaNodo("rcd").stato, STATI.SCATTATO, "RCD scattato dopo aggiornamento");

// Aggiorna con componente
wm.aggiorna(agg, { componente: "lavatrice" });
assert.ok(agg.trovaNodo("lavatrice").menzionato, "lavatrice menzionata dopo aggiornamento");

// Aggiorna con misura (object)
wm.aggiorna(agg, { misura: { punto: "prese", grandezza: "tensione", valore: 228, unita: "V" } });
assert.strictEqual(agg.trovaNodo("prese").elettrici.tensione_misurata, 228, "tensione misurata aggiornata");
assert.ok(agg.misure_registrate.length > 0, "misura registrata");

// Aggiorna con null → nessun errore
wm.aggiorna(agg, null);
assert.ok(true, "aggiorna con null non crasha");

console.log("  PASS: 5 asserzioni aggiorna");

// ============================================================================
// 16. PARSE MISURA
// ============================================================================

console.log("\n--- Parse misura ---");

var pm1 = wm.parseMisura("230V");
assert.ok(pm1, "parse 230V");
assert.strictEqual(pm1.grandezza, "tensione", "grandezza tensione");
assert.strictEqual(pm1.valore, 230, "valore 230");

var pm2 = wm.parseMisura("15.5A");
assert.ok(pm2, "parse 15.5A");
assert.strictEqual(pm2.grandezza, "corrente", "grandezza corrente");
assert.strictEqual(pm2.valore, 15.5, "valore 15.5");

var pm3 = wm.parseMisura("isolamento: 2MΩ");
assert.ok(pm3, "parse 2MΩ");
assert.strictEqual(pm3.grandezza, "resistenza", "grandezza resistenza");

var pm4 = wm.parseMisura("500mA");
assert.ok(pm4, "parse 500mA");
assert.strictEqual(pm4.valore, 0.5, "500mA = 0.5A");

var pm5 = wm.parseMisura("");
assert.strictEqual(pm5, null, "stringa vuota → null");

var pm6 = wm.parseMisura(null);
assert.strictEqual(pm6, null, "null → null");

console.log("  PASS: 10 asserzioni parse misura");

// ============================================================================
// 17. GENERA VERIFICHE
// ============================================================================

console.log("\n--- Genera verifiche ---");

var vRCD = wm.generaVerifiche({ tipo: TIPI.PROTEZIONE_DIFF });
assert.ok(vRCD.length >= 2, "verifiche RCD >= 2");
assert.ok(vRCD.some(function(v) { return v.indexOf("isolamento") >= 0; }), "verifiche RCD include isolamento");

var vMCB = wm.generaVerifiche({ tipo: TIPI.PROTEZIONE_MCB });
assert.ok(vMCB.length >= 2, "verifiche MCB >= 2");

var vCavo = wm.generaVerifiche({ tipo: TIPI.CONDUTTORE });
assert.ok(vCavo.some(function(v) { return v.indexOf("continuità") >= 0 || v.indexOf("continuita") >= 0; }), "verifiche cavo include continuità");

var vCarico = wm.generaVerifiche({ tipo: TIPI.CARICO });
assert.ok(vCarico.length >= 2, "verifiche carico >= 2");

var vInverter = wm.generaVerifiche({ tipo: TIPI.INVERTER });
assert.ok(vInverter.some(function(v) { return v.indexOf("errore") >= 0 || v.indexOf("display") >= 0; }), "verifiche inverter include codice errore");

var vCont = wm.generaVerifiche({ tipo: TIPI.CONTATTORE });
assert.ok(vCont.some(function(v) { return v.indexOf("bobina") >= 0; }), "verifiche contattore include bobina");

console.log("  PASS: 7 asserzioni genera verifiche");

// ============================================================================
// 18. SCENARI COMPLESSI — CASI REALI
// ============================================================================

console.log("\n--- Scenari complessi ---");

// Scenario 1: Differenziale scatta quando accendo la lavatrice
var caso1 = wm.costruisciDaCaseState({
  problem_summary: "il differenziale scatta quando accendo la lavatrice in casa",
  components_detected: ["differenziale", "lavatrice"],
  facts_confirmed: ["differenziale scattato"]
});
var snap1r = wm.snapshot(caso1);
assert.ok(snap1r.problemi.length > 0, "S1: problemi rilevati");
assert.ok(snap1r.candidati_guasto.length > 0, "S1: candidati guasto");

// Simula dispersione sulla lavatrice
var simLav = wm.simula(caso1, "lavatrice", STATI.DISPERSIONE);
assert.ok(simLav.previsioni.length > 0, "S1: previsioni per dispersione lavatrice");

// Scenario 2: Motore trifase non parte
var caso2 = wm.costruisciDaCaseState({
  problem_summary: "il motore trifase non parte nel capannone industriale",
  components_detected: ["motore", "contattore"],
  facts_confirmed: []
});
assert.strictEqual(caso2.tipo_impianto, "industriale", "S2: tipo industriale");
assert.ok(caso2.trovaNodo("motore").menzionato, "S2: motore menzionato");

// Scenario 3: Inverter fotovoltaico non produce
var caso3 = wm.costruisciDaCaseState({
  problem_summary: "l'inverter del fotovoltaico non produce, pannelli ok",
  components_detected: ["inverter", "pannelli"]
});
assert.strictEqual(caso3.tipo_impianto, "fotovoltaico", "S3: tipo FV");
assert.ok(caso3.trovaNodo("inverter_fv").menzionato, "S3: inverter menzionato");

// Scenario 4: Caldaia in blocco
var caso4 = wm.costruisciDaCaseState({
  problem_summary: "la caldaia va in blocco, errore fiamma",
  components_detected: ["caldaia"]
});
assert.strictEqual(caso4.tipo_impianto, "caldaia", "S4: tipo caldaia");

console.log("  PASS: 8 asserzioni scenari complessi");

// ============================================================================
// 19. SIMULAZIONE INDUSTRIALE
// ============================================================================

console.log("\n--- Simulazione industriale ---");

var indSim = wm.templateTrifaseIndustriale();
wm.propagaStati(indSim);

// Simula cortocircuito sul motore
var simMot = wm.simula(indSim, "motore", STATI.CORTOCIRCUITO);
assert.ok(simMot.previsioni.length > 0, "previsioni cortocircuito motore");

// Simula sovraccarico sul motore
var simMotSC = wm.simula(indSim, "motore", STATI.SOVRACCARICO);
assert.ok(simMotSC.previsioni.length > 0, "previsioni sovraccarico motore");

console.log("  PASS: 2 asserzioni simulazione industriale");

// ============================================================================
// RIEPILOGO
// ============================================================================

console.log("\n============================================");
console.log("WORLD MODEL TEST: TUTTI PASS");
console.log("  Costanti e strutture:     19");
console.log("  WorldModel base:          15");
console.log("  Navigazione:              11");
console.log("  Template civile:          17");
console.log("  Template industriale:      8");
console.log("  Template FV:               6");
console.log("  Template caldaia:          7");
console.log("  Propagazione:              8");
console.log("  Costruzione caseState:     9");
console.log("  Simulazione:              11");
console.log("  Confronto atteso/reale:    9");
console.log("  Localizzazione guasto:     6");
console.log("  Misura discriminante:      5");
console.log("  Snapshot:                 12");
console.log("  Aggiorna:                  5");
console.log("  Parse misura:             10");
console.log("  Genera verifiche:          7");
console.log("  Scenari complessi:         8");
console.log("  Simulazione industriale:   2");
console.log("  ─────────────────────────────");
console.log("  TOTALE:                  175");
console.log("============================================");
