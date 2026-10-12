"use strict";

/**
 * LE FORME IN CUI UN GUASTO SI DICE — controlli incrociati.
 *
 * Il sintomo è la chiave con cui ROCCO apre la propria esperienza: le 9
 * tabelle di `neural_simulator` (41 cause scritte a mano, ognuna con
 * probabilità, verifica ed esclusioni). Se la chiave non si riconosce,
 * `cs.anomaly_type` resta `undefined` e **tre lettori** — simulatore
 * causale, distillatore, `suggerisciVerifica` — ricevono il vuoto senza
 * protestare. Misurato prima di questa prova: 6 casi italiani su 21 senza
 * sintomo, e nessuno se ne era accorto.
 *
 * Qui si incrocia in tre direzioni, perché un difetto si vede solo da una:
 *
 *   1. **il contratto** — le frasi che devono funzionare, ereditate da
 *      `neural_simulator.test.js`: sono il patto di questo riconoscitore e
 *      una riscrittura non può romperle;
 *   2. **il corpus** — le 21 domande italiane col loro `sintomo_atteso`:
 *      è l'esame, e si misura, non si studia;
 *   3. **i falsi positivi** — frasi che NON descrivono un guasto, più le
 *      trappole lessicali note di questo codice. Scrivendo le classi mi sono
 *      sfuggite tre volte: `sare` (pensato per lo spagnolo) trovava
 *      "pen-sare", `trip` senza confine trovava "presa **trip**la", e una
 *      riga conteneva caratteri cirillici invisibili. Nessuna delle tre si
 *      vedeva dai numeri del corpus: le ha trovate una frase negativa.
 *
 * E in fondo la **frequenza** di ogni classe: una che scatta su tutto è
 * rumore, una che non scatta mai non è esercitata da nessun caso reale.
 * Non è un voto, è il numero che dice quanto vale il resto.
 */

var path = require("path");
var sim = require(path.join(__dirname, "..", "neural_simulator.js"));
var forme = require(path.join(__dirname, "..", "..", "forme_sintomo.js"));
var corpus = require(path.join(__dirname, "..", "casi_reali_forum.js"));

var pass = 0;
var fail = 0;

function check(label, condition) {
  if (condition) pass++;
  else { fail++; console.log("  ✗ " + label); }
}

function eq(label, actual, expected) {
  var ok = actual === expected;
  if (!ok) console.log("    atteso " + JSON.stringify(expected) + ", ottenuto " + JSON.stringify(actual));
  check(label, ok);
}

// ─── §1 Il contratto: le frasi che devono funzionare ──────────────────
console.log("\n§1 — il contratto del riconoscitore");

var CONTRATTO = [
  ["il differenziale scatta",                      "differenziale_scatta"],
  ["il salvavita salta ogni volta",                "differenziale_scatta"],
  ["l'RCD interviene",                             "differenziale_scatta"],
  ["il magnetotermico scatta subito",              "magnetotermico_scatta_subito"],
  ["l'interruttore scatta istantaneamente",        "magnetotermico_scatta_subito"],
  ["il magnetotermico scatta dopo 10 minuti",      "magnetotermico_scatta_dopo_tempo"],
  ["l'interruttore scatta dopo poco",              "magnetotermico_scatta_dopo_tempo"],
  ["non c'è tensione alla presa",                  "niente_tensione"],
  ["la presa non funziona, niente corrente",       "niente_tensione"],
  ["tutto spento, senza corrente",                 "niente_tensione"],
  ["il cavo è caldo, surriscaldamento",            "surriscaldamento"],
  ["la luce va e viene, funziona a intermittenza", "intermittente"],
  ["il problema è saltuario",                      "intermittente"],
  ["il motore non parte",                          "motore_non_parte"],
  ["la caldaia non si accende, va in blocco",      "caldaia_non_accende"],
  ["il fotovoltaico non produce",                  "fotovoltaico_non_produce"],
  ["i pannelli solari producono poco",             "fotovoltaico_non_produce"],
  ["",                                             null],
  [null,                                           null]
];

CONTRATTO.forEach(function (c) {
  eq("«" + String(c[0]).slice(0, 44) + "» → " + String(c[1]),
    sim.riconosciSintomo(c[0]), c[1]);
});

// ─── §2 Il corpus: 21 domande italiane col sintomo dichiarato ─────────
//
// Una sola lacuna è ammessa, ed è dichiarata: FORUM-SPEC-005, la caldaia che
// fa 3-4 cicli al minuto. Il corpus la etichetta `caldaia_non_accende`, ma
// le cinque cause che ROCCO ha sotto quella chiave parlano di **mancata
// accensione** (elettrodo, valvola gas, pressione, scheda, ventilatore): il
// corto-ciclo è un altro fenomeno e non è in nessuna fonte. Riconoscerlo lì
// darebbe cinque cause sbagliate con probabilità alte — **peggio del
// silenzio**. Si colma nella fonte, non allargando il riconoscitore.
console.log("\n§2 — il corpus italiano");

var LACUNE = { "FORUM-SPEC-005": "caldaia in corto-ciclo: la conoscenza non c'è" };
var italiani = corpus.CASI_FORUM.filter(function (c) { return c.lingua === "it"; });
var sbagliati = [], senzaSintomo = [], giusti = 0;

italiani.forEach(function (c) {
  var r = sim.riconosciSintomo(c.domanda);
  if (!r) senzaSintomo.push(c);
  else if (r === c.sintomo_atteso) giusti++;
  else sbagliati.push(c.id + ": atteso " + c.sintomo_atteso + ", letto " + r);
});

check("nessun sintomo letto SBAGLIATO sui casi italiani" +
  (sbagliati.length ? " — " + sbagliati.join(" | ") : ""), sbagliati.length === 0);

var senzaNonDichiarati = senzaSintomo.filter(function (c) { return !LACUNE[c.id]; });
check("ogni sintomo mancante è una lacuna dichiarata" +
  (senzaNonDichiarati.length ? " — " + senzaNonDichiarati.map(function (c) { return c.id; }).join(" ") : ""),
  senzaNonDichiarati.length === 0);

check("almeno 20 dei 21 casi italiani hanno il sintomo giusto (ora " + giusti + ")", giusti >= 20);

// Un sintomo riconosciuto vale solo se apre davvero l'esperienza.
var senzaEsperienza = italiani.filter(function (c) {
  var r = sim.riconosciSintomo(c.domanda);
  return r && !(sim.ESPERIENZA && sim.ESPERIENZA[r]);
});
check("ogni sintomo riconosciuto ha una tabella di esperienza dietro",
  senzaEsperienza.length === 0);

// ─── §3 I falsi positivi ──────────────────────────────────────────────
//
// Scritte dal mestiere: cose che un cliente dice e che non sono un guasto,
// più le trappole lessicali — una parola corta dentro una parola italiana,
// il difetto già corretto nel riconoscitore di componenti (`DIN` in
// "lampadina"). Queste frasi hanno trovato tre errori che il corpus non
// vedeva.
console.log("\n§3 — quello che NON deve scattare");

var NEGATIVI = [
  ["devo pensare a cosa fare",                   "scatta"],
  ["ho una presa tripla in cucina",              "scatta"],
  ["vorrei usare un cavo da 2,5",                "scatta"],
  ["devo passare i cavi nella canalina",         "scatta"],
  ["vorrei un preventivo per rifare l'impianto", "scatta"],
  ["ho fissato la scatola al muro",              "scatta"],
  ["mi serve una pinza amperometrica",           "scatta"],
  // "poco" è un tempo quando segue "dopo": su un impianto fotovoltaico
  // confonderlo con una resa scarsa farebbe scegliere la chiave sbagliata.
  ["l'interruttore scatta dopo poco",            "riduce"],
  ["scatta dopo poco tempo",                     "riduce"],
  ["ho messo un inverter nuovo e funziona bene", "riduce"],
  ["la caldaia funziona bene",                   "non_parte"],
  ["il quadro è a norma, nessun problema",       "in_blocco"],
  // Nomi di apparecchi che contengono un comportamento: `scalda` nudo
  // matchava dentro "scaldabagno", e su FORUM-IT-013 il racconto risultava
  // di surriscaldamento senza che nessuno avesse parlato di calore. Stesso
  // difetto di `DIN` dentro "lampadina".
  ["lo scaldabagno da 10 anni fa saltare il differenziale", "surriscalda"],
  ["ho uno scaldacqua elettrico",                "surriscalda"]
];

NEGATIVI.forEach(function (n) {
  check("«" + n[0] + "» non è " + n[1], !forme.haComportamento(n[0], n[1]));
});

// Una frase che non descrive un guasto non deve produrre un sintomo: dire
// "non lo so" è la risposta giusta.
var NON_GUASTI = [
  "vorrei un preventivo per rifare l'impianto",
  "mi serve una pinza amperometrica",
  "ho fissato la scatola al muro",
  "il quadro è a norma, nessun problema"
];
NON_GUASTI.forEach(function (t) {
  eq("«" + t + "» non produce un sintomo", sim.riconosciSintomo(t), null);
});

// ─── §4 Un posto solo ─────────────────────────────────────────────────
//
// Il difetto di metodo era avere due elenchi di parole per la stessa
// domanda: `device_kb` conosceva "non resta su" e "ricade", il simulatore
// conosceva "intervi" e "fermo", e ogni buco stava in una lista e non
// nell'altra. Questa sezione pretende che la forma sia dichiarata una volta
// e letta da entrambi.
console.log("\n§4 — un posto solo per le forme");

var deviceKb = require(path.join(__dirname, "..", "..", "..", "modules", "rocco_university", "device_kb.js"));

[["il differenziale non resta su, ricade", "scatta"],
 ["la protezione interviene sempre",       "scatta"]].forEach(function (c) {
  check("device_kb vede «" + c[0] + "» come " + c[1],
    deviceKb.rilevaSintomoDalTesto(c[0]).indexOf("scatta") >= 0);
  check("il simulatore vede la stessa forma",
    forme.haComportamento(c[0], c[1]));
});

check("device_kb non ha più un elenco di parole suo",
  !/if \(\/scatt/.test(require("fs").readFileSync(
    path.join(__dirname, "..", "..", "..", "modules", "rocco_university", "device_kb.js"), "utf8")));

// ─── §5 Frequenza: rumore e codice morto ──────────────────────────────
console.log("\n§5 — frequenza delle classi sul corpus (informativo)");

var conteggio = {};
Object.keys(forme.COMPORTAMENTI).forEach(function (k) { conteggio[k] = 0; });
corpus.CASI_FORUM.forEach(function (c) {
  forme.comportamenti(c.domanda).forEach(function (k) { conteggio[k]++; });
});

var maiEsercitate = Object.keys(conteggio).filter(function (k) { return conteggio[k] === 0; });
console.log("    non esercitate da nessuna domanda: " +
  (maiEsercitate.length ? maiEsercitate.join(", ") : "nessuna"));
console.log("    (servono alla banca dispositivi, che il corpus non prova:");
console.log("     è lo stesso limite del 18% di vocabolario esercitato)");

Object.keys(conteggio).sort(function (a, b) { return conteggio[b] - conteggio[a]; })
  .slice(0, 5).forEach(function (k) {
    console.log("    " + String(conteggio[k]).padStart(3) + "  " + k);
  });

// `scatta` copre più di metà del corpus, e non è rumore: 31 dei 48 casi
// hanno per `sintomo_atteso` l'intervento di una protezione. È la
// composizione del corpus, non un pattern troppo largo — e si verifica così.
var casiDiScatto = corpus.CASI_FORUM.filter(function (c) {
  return /scatta|scatta_subito|scatta_dopo_tempo/.test(String(c.sintomo_atteso));
}).length;
check("la classe `scatta` non è più frequente dei casi di scatto del corpus",
  conteggio.scatta <= casiDiScatto + 2);

console.log("\n============================================================");
console.log("FORME SINTOMO: " + pass + " passed, " + fail + " failed");
console.log("============================================================");
process.exit(fail === 0 ? 0 : 1);
