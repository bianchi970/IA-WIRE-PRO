"use strict";

/**
 * QUANDO DUE IPOTESI SONO LA STESSA — controlli incrociati.
 *
 * Misurato leggendo le 84 ipotesi che i 21 casi italiani stampano: **21 su
 * 84 ridicono una causa già scritta sopra**, su 11 casi. Quattro fonti
 * dicono la stessa cosa con parole diverse e la deduplica confrontava
 * stringhe.
 *
 * Qui si incrocia in quattro direzioni, perché una fusione sbagliata è
 * peggio di una ripetizione: una ripetizione fa perdere tempo, una fusione
 * sbagliata **fa sparire una causa**.
 *
 *   1. **devono fondersi** — le coppie vere prese dal corpus;
 *   2. **non devono fondersi** — le coppie che il fenomeno accomuna ma
 *      l'apparecchio separa. È qui che la prima versione sbagliava;
 *   3. **il frammento** — fondere non è buttare: quel che l'assorbita dice
 *      in più deve restare leggibile e in italiano;
 *   4. **il corpus** — sulle etichette vere dei 21 casi, quante fusioni e
 *      soprattutto: la causa vera resta fra le prime quattro.
 */

var path = require("path");
var fc = require(path.join(__dirname, "..", "..", "forme_causa.js"));

var pass = 0;
var fail = 0;

function check(label, condition) {
  if (condition) pass++;
  else { fail++; console.log("  ✗ " + label); }
}

function stessa(a, b) {
  var ka = fc.chiaveCausa(a), kb = fc.chiaveCausa(b);
  return !!ka && ka === kb;
}

// ─── §1 Le coppie che devono fondersi ─────────────────────────────────
console.log("\n§1 — la stessa causa detta due volte");

var UGUALI = [
  // FORUM-IT-013: quattro righe, una causa. È il caso che ha aperto questo blocco.
  ["Dispersione verso terra su carico o cavo sempre presente",
   "dispersione a terra sul cavo (isolamento danneggiato)"],
  ["Dispersione verso terra su carico o cavo sempre presente",
   "Dispersione in uno specifico apparecchio o cavo"],
  ["Dispersione verso terra su carico o cavo sempre presente",
   "dispersione su carico"],
  ["dispersione su carico", "cavo danneggiato con dispersione verso terra"],
  // FORUM-IT-006: sovraccarico detto tre volte da tre fonti.
  ["sovraccarico — troppi apparecchi sullo stesso circuito",
   "Sovraccarico — somma correnti carichi supera la targa del MT"],
  ["sovraccarico — troppi apparecchi sullo stesso circuito",
   "sovraccarico: corrente assorbita superiore a In"],
  // FORUM-IT-004: il morsetto allentato, due volte.
  ["morsetto allentato — connessione ad alta resistenza",
   "serraggio morsetti insufficiente o cavo sottodimensionato"],
  // La protezione a fine vita, tre modi di dirlo (stesso apparecchio).
  ["RCD difettoso o a fine vita", "Dispositivo RCD difettoso"],
  ["RCD difettoso o a fine vita",
   "Differenziale degradato con soglia effettiva scesa sotto il valore nominale"],
  // L'infiltrazione, due nomi per la stessa scatola.
  ["Infiltrazione acqua nell isolamento o in scatole derivazione",
   "umidità in cassetta di derivazione o morsettiera"],
  // Dal GUASTO VERO (teleruttore su pompa sommersa, 12/10): la banca dice
  // tre volte la stessa cosa sulla bobina, e l'elettricista leggeva tre
  // righe. È il caso che ha portato qui il fenomeno `tensione_insufficiente`.
  ["Tensione bobina bassa oppure nucleo magnetico sporco o usurato",
   "tensione bobina insufficiente o contatti usurati"],
  ["Tensione bobina bassa oppure nucleo magnetico sporco o usurato",
   "tensione di alimentazione bobina bassa (<85% Ub)"]
];

UGUALI.forEach(function (c) {
  check("stessa causa: «" + c[0].slice(0, 40) + "» ≡ «" + c[1].slice(0, 40) + "»",
    stessa(c[0], c[1]));
});

// ─── §2 Le coppie che NON devono fondersi ─────────────────────────────
console.log("\n§2 — stesso fenomeno, posti diversi");

var DIVERSE = [
  // Il difetto che la prima versione aveva: "umidità assorbita" dentro una
  // tesi che parla dell'avvolgimento. Su FORUM-IT-015 quella è la causa vera.
  ["umidità in cassetta di derivazione o morsettiera",
   "avvolgimento motore degradato: invecchiamento dello smalto isolante sulle spire o umidità assorbita"],
  // Il condensatore in corto non è "il cortocircuito": è un altro posto.
  ["Cortocircuito — resistenza quasi zero tra i conduttori",
   "condensatore di un motore in cortocircuito (avvolgimento monofase)"],
  // La dispersione DC del fotovoltaico non è la dispersione su un carico.
  ["dispersione su carico",
   "Dispersione DC verso terra: pannello con celle rotte, bypass diode guasto, cavo MC4 con isolamento degradato"],
  // Fenomeni diversi: l'acqua che entra non è la dispersione che provoca.
  // (Sono in catena — causa ed effetto — ed è un'altra cosa ancora.)
  ["Infiltrazione acqua nell isolamento o in scatole derivazione",
   "Dispersione verso terra su carico o cavo sempre presente"],
  // Sovraccarico e cortocircuito sono due fenomeni, non due parole.
  ["sovraccarico — troppi apparecchi sullo stesso circuito",
   "Cortocircuito — resistenza quasi zero tra i conduttori"],
  // L'interruzione del conduttore non è la protezione scattata.
  ["Conduttore interrotto nel percorso", "Protezione a monte scattata o aperta"],
  // Dal guasto vero: il fusibile di potenza e quello di comando sono due
  // fusibili, in due posti. Nessuno dei due nomina un fenomeno dichiarato,
  // quindi restano per sé — ed è la scelta giusta.
  ["Fusibile bruciato su una fase del circuito di potenza",
   "Fusibile del circuito di controllo bruciato"]
];

DIVERSE.forEach(function (c) {
  check("cause diverse: «" + c[0].slice(0, 36) + "» ≠ «" + c[1].slice(0, 36) + "»",
    !stessa(c[0], c[1]));
});

// Un'ipotesi che non nomina un fenomeno dichiarato non si fonde mai:
// meglio una riga in più che una causa persa.
check("senza fenomeno dichiarato non c'è chiave",
  fc.chiaveCausa("passo o dimensione non adatti agli interruttori") === null);
check("senza fenomeno dichiarato non c'è chiave (2)",
  fc.chiaveCausa("corrente di spunto troppo alta per RCD sensibile") === null);

// ─── §3 La tesi, non tutta l'etichetta ────────────────────────────────
console.log("\n§3 — il fenomeno si riconosce sulla tesi");

check("la tesi si ferma al trattino lungo",
  fc.tesi("morsetto allentato — connessione ad alta resistenza") === "morsetto allentato");
check("la tesi si ferma ai due punti",
  fc.tesi("avvolgimento motore degradato: smalto isolante") === "avvolgimento motore degradato");
check("senza separatore la tesi è tutta l'etichetta",
  fc.tesi("dispersione su carico") === "dispersione su carico");
check("una parola nella specificazione non decide il fenomeno",
  fc.fenomenoCausa("avvolgimento motore degradato: invecchiamento dello smalto isolante sulle spire o umidità assorbita") === null);
check("la stessa parola nella tesi lo decide",
  fc.fenomenoCausa("umidità in cassetta di derivazione") === "infiltrazione");

// ─── §4 Il frammento: fondere non è buttare ───────────────────────────
console.log("\n§4 — quel che l'assorbita dice in più");

var fr = fc.frammento("dispersione a terra sul cavo (isolamento danneggiato)",
                      "Dispersione verso terra su carico o cavo sempre presente");
check("il frammento esiste quando l'assorbita aggiunge qualcosa", !!fr);
check("il frammento non ripete la parola del fenomeno",
  !!fr && fr.indexOf("dispersione") < 0);
check("il frammento non comincia con una punteggiatura",
  !!fr && !/^[\s:;,—–-]/.test(fr));
check("il frammento tiene quel che diceva in più",
  !!fr && fr.indexOf("isolamento danneggiato") >= 0);

// Con una sola parola nuova il frammento ridice la riga di sopra con un
// sinonimo: è il difetto che stiamo togliendo, non si accoda.
check("una parola nuova sola non è un frammento",
  fc.frammento("dispersione su carico o cavo", "Dispersione verso terra su carico") === null);
check("niente di nuovo, niente frammento",
  fc.frammento("dispersione su carico", "dispersione su carico") === null);

// ─── §5 Sul corpus: le etichette vere dei 21 casi ─────────────────────
console.log("\n§5 — le etichette vere");

// Le quattro righe di FORUM-IT-013, nell'ordine in cui ROCCO le stampava.
var IT013 = [
  "Dispersione verso terra su carico o cavo sempre presente",
  "dispersione a terra sul cavo (isolamento danneggiato)",
  "Dispersione in uno specifico apparecchio o cavo",
  "dispersione su carico"
];
var chiavi = {};
IT013.forEach(function (l) { chiavi[fc.chiaveCausa(l)] = true; });
check("le quattro righe di FORUM-IT-013 hanno una chiave sola",
  Object.keys(chiavi).length === 1);

// E la riga che resta deve portarsi dietro la parola che dice qualcosa:
// senza, su FORUM-IT-015 la causa vera usciva dalle prime quattro.
var resta = IT013[0];
var fusi = 0;
IT013.slice(1).forEach(function (l) {
  var f = fc.frammento(l, resta);
  if (f && fusi < 2) { resta += (fusi ? ", " : " — anche: ") + f; fusi++; }
});
check("la riga fusa conserva «isolamento danneggiato»",
  resta.indexOf("isolamento danneggiato") >= 0);
check("la riga fusa resta leggibile (sotto i 200 caratteri)", resta.length < 200);
console.log("    " + resta);

// ─── §6 Frequenza: una chiave che prende tutto è rumore ───────────────
console.log("\n§6 — quanto pesca ogni fenomeno");

var TUTTE = UGUALI.concat(DIVERSE).reduce(function (acc, c) {
  return acc.concat(c);
}, []);
var conteggio = {};
fc.FENOMENI_CAUSA.forEach(function (f) { conteggio[f.id] = 0; });
TUTTE.forEach(function (l) {
  var f = fc.fenomenoCausa(l);
  if (f) conteggio[f]++;
});
Object.keys(conteggio).sort(function (a, b) { return conteggio[b] - conteggio[a]; })
  .forEach(function (k) {
    console.log("    " + String(conteggio[k]).padStart(3) + "  " + k);
  });
check("nessun fenomeno riconosce più di metà delle etichette di prova",
  Object.keys(conteggio).every(function (k) { return conteggio[k] <= TUTTE.length / 2; }));

// ─── §7 Una causa e le sue conseguenze ────────────────────────────────
console.log("\n§7 — la catena: chi spiega chi");

// Quelle vere, prese dalle righe che ROCCO stampa davvero.
[["umidità in cassetta di derivazione o morsettiera",
  "Dispersione verso terra su carico o cavo sempre presente"],
 ["Infiltrazione acqua nell isolamento o in scatole derivazione",
  "Dispersione in uno specifico apparecchio o cavo"],
 // FORUM-IT-010, ed è la forma del primo guasto vero: un fusibile aperto
 // spiega la fase che manca.
 ["fusibile bruciato, contatto aperto, cavo interrotto",
  "mancanza di una fase (trifase)"],
 ["morsetto allentato — connessione ad alta resistenza",
  "surriscaldamento del morsetto superiore"]
].forEach(function (c) {
  check("spiega: «" + c[0].slice(0, 32) + "» → «" + c[1].slice(0, 32) + "»",
    fc.spiegaAltra(c[0], c[1]));
});

// La relazione ha un verso. L'acqua spiega la dispersione, non viceversa.
check("la relazione non vale all'indietro",
  !fc.spiegaAltra("Dispersione verso terra su carico",
                  "umidità in cassetta di derivazione"));
check("un fenomeno non spiega sé stesso",
  !fc.spiegaAltra("dispersione su carico", "dispersione a terra sul cavo"));

// LE TRE TOLTE perché sbagliate, e si vedevano solo leggendo le righe: un
// conduttore che si apre non fa scattare niente e non causa un blackout.
// Sono **cause alternative** dello stesso sintomo, non conseguenze.
check("un conduttore interrotto NON spiega una protezione scattata",
  !fc.spiegaAltra("conduttore interrotto", "protezione a monte scattata"));
check("un conduttore interrotto NON spiega l'assenza di rete",
  !fc.spiegaAltra("conduttore interrotto", "assenza di rete (blackout o distacco)"));
check("una dispersione NON spiega un differenziale difettoso",
  !fc.spiegaAltra("dispersione su carico", "RCD difettoso o a fine vita"));

console.log("\n============================================================");
console.log("FORME CAUSA: " + pass + " passed, " + fail + " failed");
console.log("============================================================");
process.exit(fail === 0 ? 0 : 1);
