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

// Gli stessi confini valgono per gli OGGETTI. `rele` senza confine di
// chiusura prende "ir**rele**vante", ed è la quarta volta che questo file
// incontra una parola corta dentro una parola italiana.
var OGGETTI_NEGATIVI = [
  ["il dettaglio è irrilevante",            "commutazione"],
  ["ho correlato i due eventi",             "commutazione"],
  ["l'impianto è stato rilevato a norma",   "commutazione"]
];
OGGETTI_NEGATIVI.forEach(function (n) {
  check("«" + n[0] + "» non nomina " + n[1], !forme.haOggetto(n[0], n[1]));
});
check("«il teleruttore della pompa» nomina la commutazione",
  forme.haOggetto("il teleruttore della pompa fa rumore", "commutazione"));
check("«il contattore non tira» nomina la commutazione",
  forme.haOggetto("il contattore non tira", "commutazione"));

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

// ─── §6 La firma del sintomo: riconoscere un precedente ───────────────
//
// `stessoSintomo` decide se un caso chiuso dall'elettricista parla della
// stessa cosa di quello di oggi. Non ordina soltanto: un precedente
// riconosciuto diventa un'**ipotesi** intestata "già accertata una volta",
// quindi uno sbagliato è un'invenzione. Si prova in tre direzioni come il
// resto del file: le coppie che devono somigliare, quelle che non devono, e
// la misura sul corpus contro il metro esterno (`sintomo_atteso`).
console.log("\n§6 — la firma del sintomo (riconoscere un precedente)");

check("stesso apparecchio e stesso comportamento, parole diverse",
  forme.stessoSintomo(
    "il salvavita scatta sempre quando accendo la lavatrice",
    "da due giorni il differenziale interviene appena parte la lavastoviglie"));

check("il teleruttore che ronza e manca una fase — il caso vero, ridetto",
  forme.stessoSintomo(
    "c'e un teleruttore che comanda una pompa sommersa di un pozzo la bobina fa rumore, la centralina segna che manca una fase",
    "su un altro pozzo il contattore ronza e il display dice che manca una fase"));

check("stesso comportamento ma apparecchio diverso: NON somiglia",
  !forme.stessoSintomo(
    "il differenziale scatta appena accendo la lavatrice",
    "il motore trifase del compressore non parte piu"));

check("stesso apparecchio ma comportamento diverso: NON somiglia",
  !forme.stessoSintomo(
    "il differenziale scatta appena accendo la lavatrice",
    "il differenziale non si riarma perche la leva e rotta meccanicamente"));

check("chi tace non somiglia: un racconto senza sintomo non pesca nulla",
  !forme.stessoSintomo(
    "buongiorno avrei bisogno di un preventivo per rifare l'impianto",
    "il differenziale scatta appena accendo la lavatrice"));

check("la firma dichiara le due nature separate",
  (function () {
    var f = forme.firma("il differenziale scatta quando accendo la lavatrice");
    return Array.isArray(f.oggetti) && Array.isArray(f.comportamenti);
  })());

// La misura che ha scelto questa chiave, rifatta qui perché non resti solo
// nel commento: sulle 1128 coppie dei 48 casi, con verità `sintomo_atteso`.
// La chiave precedente (`caseState.domain` = `observedDomains[0]`) scattava
// su 82 coppie di cui **42 sbagliate** — precisione 49%, una monetina.
(function () {
  var casi = corpus.CASI_FORUM;
  var vp = 0, fp = 0, fn = 0;
  for (var i = 0; i < casi.length; i++) {
    for (var j = i + 1; j < casi.length; j++) {
      var stesso = !!casi[i].sintomo_atteso && casi[i].sintomo_atteso === casi[j].sintomo_atteso;
      var scatta = forme.stessoSintomo(casi[i].domanda, casi[j].domanda);
      if (scatta && stesso) vp++;
      else if (scatta) fp++;
      else if (stesso) fn++;
    }
  }
  var precisione = vp + fp ? vp / (vp + fp) : 0;
  var richiamo = vp + fn ? vp / (vp + fn) : 0;
  console.log("    sulle " + (casi.length * (casi.length - 1) / 2) + " coppie del corpus: scatta su " +
    (vp + fp) + ", giuste " + vp + ", sbagliate " + fp +
    " — precisione " + Math.round(precisione * 100) + "%, richiamo " + Math.round(richiamo * 100) + "%");

  // Le due soglie sono le misure della chiave scartata, non numeri scelti:
  // sotto queste si tornerebbe a star peggio di `observedDomains[0]`.
  check("precisione migliore della chiave scartata (49%)", precisione > 0.49);
  check("richiamo migliore della chiave scartata (13%)", richiamo > 0.13);
})();

// ─── §7 Le circostanze: l'evento che precede il guasto ────────────────
//
// La terza natura del racconto. Due direzioni, come per le altre: le frasi
// vere dei clienti che devono scattare, e quelle che non devono — perché
// qui il falso positivo non costa una riga in più, costa una **prima riga**:
// la chiave `circostanzaNominata` del comparatore porta in testa la causa
// che dichiara quell'evento.
console.log("\n§7 — le circostanze (l'evento che precede)");

// Le due frasi vere del corpus, e sono le sole due su 48 domande.
check("il muro forato è un intervento (FORUM-IT-003)",
  forme.circostanze("Ho forato il muro per appendere un quadro e adesso non funziona piu la presa").indexOf("lavori") >= 0);
check("i lavori sul palo sono un intervento (FORUM-SPEC-004)",
  forme.circostanze("Dopo che l ENEL ha fatto i lavori sul palo, la lavatrice ha smesso di funzionare").indexOf("lavori") >= 0);
check("il tassello e il trapano pure",
  forme.circostanze("ho messo un tassello col trapano").indexOf("lavori") >= 0);
check("il temporale è una circostanza a sé",
  forme.circostanze("dopo il temporale di ieri non produce piu").indexOf("temporale") >= 0);
check("e il fulmine con lui",
  forme.circostanze("un fulmine è caduto vicino a casa").indexOf("temporale") >= 0);

// I falsi positivi, e sono i tre che il conteggio nelle fonti ha tenuto
// fuori: `sostitui` (94 volte in dispositivi.json) e `installa` sono le
// parole dei rimedi, `intervent` è l'intervento della protezione.
check("sostituire un componente non è una circostanza",
  forme.circostanze("ho sostituito la lampadina e continua uguale").length === 0);
check("l'intervento della protezione non è un intervento sull'impianto",
  forme.circostanze("il differenziale interviene ogni mattina").length === 0);
check("installare non basta",
  forme.circostanze("l impianto è installato a norma").length === 0);
check("la macchina che lavora non sono i lavori",
  forme.circostanze("la lavatrice mentre lavora fa saltare il salvavita").length === 0);
check("il mio lavoro nemmeno",
  forme.circostanze("torno dal lavoro e trovo tutto spento").length === 0);

// Il confronto vuole l'evento nelle DUE parti: conoscenza e racconto.
check("il racconto nomina l'evento che la conoscenza dichiara",
  forme.stessaCircostanza("Ho forato il muro per appendere un quadro", "dopo lavori, chiodi, tasselli"));
check("conoscenza senza evento: non scatta",
  !forme.stessaCircostanza("Ho forato il muro", "improvviso"));
check("racconto senza evento: non scatta",
  !forme.stessaCircostanza("il differenziale scatta la mattina", "dopo lavori, chiodi, tasselli"));
check("una nota vuota non scatta",
  !forme.stessaCircostanza("Ho forato il muro", null));
check("eventi diversi non si incontrano",
  !forme.stessaCircostanza("dopo il temporale", "dopo lavori, chiodi, tasselli"));

// Quel che si SCRIVE all'elettricista è la classe, non il campo grezzo:
// su FORUM-SPEC-004 citare "dopo lavori, chiodi, tasselli" nominerebbe
// chiodi e tasselli che nessuno ha visto.
check("si cita la classe in comune, non la nota intera",
  (function () {
    var c = forme.circostanzeInComune("i lavori sul palo", "dopo lavori, chiodi, tasselli");
    if (c.length !== 1) return false;
    var t = forme.etichettaCircostanza(c[0]);
    return t.indexOf("chiod") < 0 && t.indexOf("tassell") < 0 && t.length > 10;
  })());

// Quante volte il corpus la esercita: è poco, ed è dichiarato. Una forma
// che scattasse su mezzo corpus sarebbe rumore, non una circostanza.
(function () {
  var quanti = 0;
  corpus.CASI_FORUM.forEach(function (c) {
    if (forme.circostanze(c.domanda).length) quanti++;
  });
  console.log("    casi del corpus che nominano un evento: " + quanti + " su " + corpus.CASI_FORUM.length);
  check("la circostanza non scatta su mezzo corpus", quanti <= 6);
  check("e il corpus la esercita almeno due volte", quanti >= 2);
})();

// Le cause del simulatore che dichiarano un evento: tre su 41. Se qualcuno
// ne aggiunge una, questo numero lo dice; se il vocabolario smette di
// riconoscerle, va a zero e il test diventa rosso.
(function () {
  var sim = require("../neural_simulator.js");
  var tot = 0, conEvento = 0;
  Object.keys(sim.ESPERIENZA).forEach(function (k) {
    sim.ESPERIENZA[k].forEach(function (c) {
      tot++;
      if (forme.circostanze(c.tempo_tipico).length) conEvento++;
    });
  });
  console.log("    cause del simulatore che dichiarano un evento: " + conEvento + " su " + tot);
  check("qualche causa dichiara un evento", conEvento >= 3);
  check("ma non tutte — sarebbe un campo svuotato di senso", conEvento < tot / 3);
})();

console.log("\n============================================================");
console.log("FORME SINTOMO: " + pass + " passed, " + fail + " failed");
console.log("============================================================");
process.exit(fail === 0 ? 0 : 1);
