"use strict";
/**
 * check_phrasing.test.js — da previsione a istruzione operativa.
 *
 * La proprietà più importante non è che traduca bene: è che NON INVENTI.
 * Una previsione fuori schema deve essere scartata, non trasformata in un
 * ordine di lavoro su un impianto in tensione.
 */

var cp = require("../../check_phrasing");
var causalModel = require("../../causal_model");

var passed = 0;
var failed = 0;

function ok(cond, label) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.log("  ✗ " + label);
}

function section(title) { console.log("\n--- " + title + " ---"); }

// ============================================================

section("1. Misure — strumento, condizione dell'impianto, soglia");

var iso = cp.toInstruction("isolamento basso su Circuito prese");
ok(/megaohmetro|megger/i.test(iso), "isolamento: indica lo strumento");
ok(/500\s*V/i.test(iso), "isolamento: indica la tensione di prova");
ok(/fuori tensione/i.test(iso), "isolamento: indica di togliere tensione");
ok(/1\s*MOhm/i.test(iso), "isolamento: indica la soglia");
ok(/Circuito prese/.test(iso), "isolamento: riporta il bersaglio");

var corto = cp.toInstruction("R prossima a 0 su Circuito prese");
ok(/fase-neutro/i.test(corto), "cortocircuito: dice quale resistenza misurare");
ok(/fuori tensione/i.test(corto), "cortocircuito: a impianto fuori tensione");
ok(/0\s*Ohm/i.test(corto), "cortocircuito: indica cosa leggere");

var cont = cp.toInstruction("continuita assente su Cavo motore");
ok(/continuit/i.test(cont) && /fuori tensione/i.test(cont), "continuità: prova corretta e sicura");

var sovra = cp.toInstruction("corrente superiore al nominale su Motore trifase");
ok(/pinza amperometrica/i.test(sovra), "sovraccarico: pinza amperometrica");
ok(/in servizio/i.test(sovra), "sovraccarico: misura a carico in servizio, non fuori tensione");

var cal = cp.toInstruction("calore anomalo su Morsettiera — possibile connessione lenta o sovraccarico");
ok(/termometro|infrarossi/i.test(cal), "calore: strumento indicato");
ok(!/—/.test(cal), "calore: la coda interna della previsione non finisce nel testo");

section("2. Osservazioni — diventano verifiche, non constatazioni");

var sez = cp.toInstruction("sezionando questo carico il differenziale non scatta piu");
ok(/^Seziona/.test(sez), "sezionamento: forma imperativa");
ok(/uno alla volta/i.test(sez), "sezionamento: dice come procedere");

ok(/^Verifica/i.test(cp.toInstruction("Motore trifase non funziona anche se alimentato")),
  "componente alimentato che non funziona: diventa una verifica");
ok(/istantane/i.test(cp.toInstruction("il magnetotermico scatta istantaneamente")),
  "scatto istantaneo: spiega la discriminazione magnetico/termico");

section("3. Non inventa");

ok(cp.toInstruction("una previsione che non rientra in nessuno schema") === null,
  "previsione sconosciuta: scartata");
ok(cp.toInstruction("") === null, "stringa vuota: scartata");
ok(cp.toInstruction(null) === null, "null: scartato");
ok(cp.patternIdOf("frase senza schema") === null, "nessuno schema riconosciuto");

var mixed = cp.toInstructions([
  "R prossima a 0 su Circuito prese",
  "frase senza schema",
  "isolamento basso su Circuito prese",
  null
]);
ok(mixed.length === 2, "lista: tiene solo le traducibili (" + mixed.length + ")");
ok(mixed.every(function (i) { return typeof i === "string" && i.length > 40; }),
  "lista: ogni istruzione è completa");

var dupes = cp.toInstructions([
  "R prossima a 0 su Circuito prese",
  "R prossima a 0 su Circuito prese"
]);
ok(dupes.length === 1, "lista: niente duplicati");

section("4. Nessuna istruzione pericolosa");

// Una misura di resistenza o continuità su impianto in tensione è un
// errore grave: ogni istruzione di quel tipo deve dirlo esplicitamente.
["isolamento basso su X", "R prossima a 0 su X", "continuita assente su X"].forEach(function (p) {
  var istr = cp.toInstruction(p);
  ok(/fuori tensione/i.test(istr), "'" + p + "' prescrive di togliere tensione");
});
// Nessuna istruzione deve contenere slug interni
cp.PATTERNS.forEach(function (pat) {
  var esempio = cp.toInstruction(
    pat.id === "calore" ? "calore anomalo su Nodo" :
    pat.id === "isolamento" ? "isolamento basso su Nodo" :
    pat.id === "cortocircuito" ? "R prossima a 0 su Nodo" : null
  );
  if (esempio) ok(!/[a-z]+_[a-z]+/.test(esempio), pat.id + ": nessuno slug nel testo");
});

section("5. Scelta del nodo — parole distintive, non ordine di dichiarazione");

// Il difetto storico: "circuito" compare in Circuito luci/prese/cucina/bagno,
// faceva pari merito su tutti e vinceva il primo dichiarato. Risultato:
// "Circuito luci" anche parlando delle prese di cucina.
var grafo = causalModel.templateCivileMonofase();
var distintive = causalModel.distinctiveWords(grafo);
ok(distintive["circuito"] !== true, "'circuito' è generica: non distingue");
ok(distintive["prese"] === true, "'prese' è distintiva: indica la linea prese");
ok(distintive["cucina"] === true, "'cucina' è distintiva");

var g1 = causalModel.costruisciGrafo({
  problem_summary: "Il magnetotermico delle prese di cucina scatta subito.",
  components_detected: [], facts_confirmed: []
});
ok(g1.nodo_problema === "prese" || g1.nodo_problema === "cucina",
  "nodo problema coerente col testo (" + g1.nodo_problema + "), non 'luci'");

var g2 = causalModel.costruisciGrafo({
  problem_summary: "Le luci del bagno non si accendono.",
  components_detected: [], facts_confirmed: []
});
ok(g2.nodo_problema === "luci" || g2.nodo_problema === "bagno",
  "altro testo, altro nodo (" + g2.nodo_problema + ")");

console.log("\n" + new Array(61).join("="));
console.log("CHECK PHRASING: " + passed + " passed, " + failed + " failed");
console.log(new Array(61).join("="));
process.exit(failed > 0 ? 1 : 0);
