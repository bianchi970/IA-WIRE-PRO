"use strict";

/**
 * LE FORME IN CUI UNA CAUSA SI DICE — e quando due ipotesi sono la stessa.
 *
 * Misurato sui 21 casi italiani leggendo le 84 ipotesi che l'elettricista
 * legge davvero: **21 su 84 (il 25%) ridicono una causa già scritta sopra**,
 * su 11 casi su 21. Su FORUM-IT-013 tutte e quattro:
 *
 *     - Dispersione verso terra su carico o cavo sempre presente
 *     - dispersione a terra sul cavo (isolamento danneggiato)
 *     - Dispersione in uno specifico apparecchio o cavo
 *     - dispersione su carico
 *
 * Una causa, detta quattro volte. Non è un difetto di conoscenza: le quattro
 * righe vengono da **quattro fonti diverse** (motore, banca dispositivi,
 * simulatore, curriculum) che dicono la stessa cosa con parole diverse, e la
 * deduplica dell'orchestratore confrontava `normalize(label).substring(0,60)`
 * — **identità di stringa**. In italiano una frase non combacia quasi mai
 * con sé stessa: è lo stesso difetto già corretto nella ricerca della banca
 * ("pannelli" contro "pannello") e nel riconoscitore di componenti.
 *
 * Qui si dichiara quando due etichette parlano della stessa causa. Due
 * chiavi, e servono entrambe:
 *
 *   **FENOMENO** — che cosa succede fisicamente. Si riconosce sulla
 *   **tesi**, cioè la parte prima di " — " o di ":", la stessa convenzione
 *   che `hypothesisClaim()` usa per le confirm rules e il narratore per la
 *   validazione. Guardare tutta l'etichetta sbagliava, misurato: *"avvolgimento
 *   motore degradato: invecchiamento dello smalto isolante sulle spire o
 *   **umidità** assorbita"* finiva fra le infiltrazioni e veniva assorbito da
 *   *"umidità in cassetta di derivazione"* — e su FORUM-IT-015 quello è
 *   l'avvolgimento, cioè la causa vera.
 *
 *   **APPARECCHIO** — di che cosa parla. Due ipotesi che nominano apparecchi
 *   diversi non sono la stessa ipotesi anche quando il fenomeno coincide:
 *   *"cortocircuito"* e *"condensatore di un motore in cortocircuito"*
 *   mandano l'elettricista in due posti diversi. Senza questa seconda chiave
 *   le fusioni passavano da 70 a 121 e **la causa vera si perdeva** su
 *   FORUM-IT-015.
 *
 * Le parole dei due elenchi sono **contate nelle 173 etichette distinte** che
 * i 21 casi producono, non scritte a memoria: `dispers` 11, `cortocircuit`
 * 17, `morsett` 14, `interrott` 12, `degradat` 13, `sovraccaric` 10,
 * `difettos` 10, `isolament` 9, `allentat` 9, `ossidat` 5, `umidit` 4.
 * Chi aggiunge una forma la aggiunge qui e la rimisura sul corpus.
 *
 * **Fondere non vuol dire buttare.** L'ipotesi che resta si porta dietro
 * quello che le altre dicevano in più (`frammento`), e la prima versione —
 * che teneva solo la meglio piazzata — perdeva la causa vera su FORUM-IT-015
 * proprio così: il superstite era la riga più generica e portava via
 * *"isolamento danneggiato"*, l'unica parola che diceva qualcosa.
 *
 * Modulo puro: l'unica dipendenza è `forme_sintomo.js`, l'altro vocabolario
 * senza dipendenze — le forme in cui si dice un sintomo e quelle in cui si
 * dice una causa stanno meglio vicine che in due posti che si ignorano.
 */

var formeSintomo = require("./forme_sintomo");

function norm(t) {
  return String(t == null ? "" : t).toLowerCase()
    .replace(/[àáâä]/g, "a").replace(/[èéê]/g, "e").replace(/[ìíî]/g, "i")
    .replace(/[òóô]/g, "o").replace(/[ùúû]/g, "u");
}

// I fenomeni: che cosa succede fisicamente. L'ordine conta — vince il primo
// che riconosce la tesi — e va dal più specifico al più generico.
var FENOMENI_CAUSA = [
  { id: "dispersione",
    re: /dispers|fuga di corrente|perdita di isolament|guasto (di )?isolament/ },
  { id: "cortocircuito",
    re: /cortocircuit|corto circuit|contatto (diretto )?(fase.neutro|fase.fase)|resistenza quasi zero/ },
  { id: "sovraccarico",
    re: /sovraccaric|assorbiment\w* (eccessiv|superior)|oltre (la |il )?(portata|calibro)|supera la (portata|targa)/ },
  { id: "contatto_resistivo",
    re: /morsett\w* (allentat|non serrat)|serraggi|contatto allentat|connession\w* (lenta|allentat|scadent)|alta resistenza|resistenza di contatt|ossidat/ },
  { id: "interruzione",
    re: /interrott|interruzion|conduttore apert|circuito apert|tranciat|filo staccat/ },
  // Aggiunta il 12/10 dal **guasto vero**: sul teleruttore della pompa
  // sommersa uscivano tre righe — "tensione bobina bassa", "tensione bobina
  // insufficiente", "tensione di alimentazione bobina bassa (<85% Ub)" — che
  // sono la stessa causa detta tre volte dalla banca. Contata prima di
  // scriverla: 15 occorrenze nei 370 guasti della banca, 2 nelle 173
  // etichette del corpus. Sta DOPO `interruzione` perché "neutro interrotto
  // …: tensione instabile" è un'interruzione, non una tensione bassa.
  { id: "tensione_insufficiente",
    re: /tension[^.]{0,40}(bassa|insufficient|inadeguat)|sottotension|caduta di tension/ },
  { id: "infiltrazione",
    re: /umidit|infiltrazion|acqua|bagnat|pioggi/ },
  // I due che seguono sono **effetti**: un'altra causa li produce. Servono
  // alle RELAZIONI qui sotto, e come tutti gli altri valgono anche per
  // l'identità. Contati: "manca una fase" 3 nelle 173 etichette del corpus
  // e 8 nei 370 guasti della banca; il surriscaldamento 4 e 26.
  { id: "mancanza_fase",
    re: /manc[a-z]* di (una )?fase|perdita di (una )?fase|manca una fase|squilibrio (fra|tra) le fasi/ },
  { id: "surriscaldamento",
    re: /surriscald|temperatura elevat|si scalda|arco elettric/ },
  { id: "protezione_difettosa",
    re: /(rcd|differenzial\w*|mcb|magnetotermic\w*|diff|mt) (difettos|degradat|troppo sensibil|a fine vita)|a fine vita/ }
];

// Gli apparecchi che un'etichetta può nominare. Non è un elenco di
// componenti: è l'elenco delle cose che, nominate, rendono due ipotesi
// **diverse**. Per questo i generici che compaiono ovunque — carico, cavo,
// linea, terra, circuito — non ci sono: separerebbero tutto da tutto.
var APPARECCHI = [
  { id: "motore",        re: /motor\w*|avvolgiment\w*|rotor\w*|stator\w*/ },
  { id: "condensatore",  re: /condensator\w*/ },
  { id: "fotovoltaico",  re: /pannell\w*|string\w*|modul\w* fv|mc4|fotovoltaic\w*|inverter/ },
  { id: "termico",       re: /caldai\w*|bruciator\w*|circolator\w*|pomp\w*|termostat\w*/ },
  { id: "comando",       re: /bobin\w*|rel[èe]\w*|contattor\w*|teleruttor\w*/ },
  { id: "presa",         re: /\bpres[ae]\b|\bspin[ae]\b/ },
  { id: "derivazione",   re: /cassett\w*|scatol\w*|giunzion\w*|morsettier\w*/ },
  { id: "quadro",        re: /quadro|pettine|barra din/ },
  { id: "protezione",    re: /\brcd\b|differenzial\w*|\bmcb\b|magnetotermic\w*/ },
  { id: "illuminazione", re: /lampad\w*|\bled\b|faretto|plafonier\w*/ }
];

// ── UNA CAUSA E LE SUE CONSEGUENZE ───────────────────────────────────
//
// Il difetto che il **primo guasto vero** ha fatto vedere: sul teleruttore
// della pompa sommersa ROCCO metteva in parallelo *fusibile aperto*,
// *bobina che ronza*, *manca una fase* — una causa e i suoi effetti,
// elencati come piste concorrenti. L'elettricista legge quattro strade
// dove ce n'è una.
//
// Misurato sui 21 casi italiani leggendo le 84 righe stampate: **8 coppie
// su 7 casi** stanno in relazione causa → effetto.
//
// Qui si dichiara **solo** quello che è vero in fisica e che il corpus
// esercita. Tre relazioni della prima stesura sono state tolte perché
// sbagliate, e si vedevano solo leggendo le righe: *"conduttore interrotto
// → protezione a monte scattata"* e *"→ assenza di rete"*. Quelle non sono
// conseguenze di un conduttore tranciato: sono **cause alternative** dello
// stesso sintomo. Un conduttore che si apre non fa scattare niente.
//
// La relazione **non esclude e non fonde**: aggiunge una riga alla catena
// della causa ("spiegherebbe anche…"). Sopprimere l'effetto toglierebbe
// un'ipotesi vera — la dispersione esiste anche senz'acqua.
var RELAZIONI_CAUSALI = [
  ["infiltrazione", "dispersione"],        // l'acqua è conduttrice: 6 coppie sul corpus
  ["interruzione", "mancanza_fase"],       // FORUM-IT-010, la forma del guasto vero
  ["contatto_resistivo", "surriscaldamento"], // effetto Joule su una giunzione cattiva
  ["sovraccarico", "surriscaldamento"]
];

/** Il fenomeno di `a` è causa del fenomeno di `b`? */
function spiegaAltra(a, b) {
  var fa = fenomenoCausa(a), fb = fenomenoCausa(b);
  if (!fa || !fb || fa === fb) return false;
  return RELAZIONI_CAUSALI.some(function (r) { return r[0] === fa && r[1] === fb; });
}

/** La tesi dell'ipotesi: quel che afferma, prima della specificazione. */
function tesi(label) {
  return String(label == null ? "" : label).split(/\s+[—–-]\s+|:/)[0];
}

/** Il fenomeno che la tesi nomina, o null se non ne nomina nessuno. */
function fenomenoCausa(label) {
  var t = norm(tesi(label));
  for (var i = 0; i < FENOMENI_CAUSA.length; i++) {
    if (FENOMENI_CAUSA[i].re.test(t)) return FENOMENI_CAUSA[i].id;
  }
  return null;
}

/** Gli apparecchi nominati in tutta l'etichetta, in ordine stabile. */
function apparecchiNominati(label) {
  var n = norm(label), out = [];
  APPARECCHI.forEach(function (a) { if (a.re.test(n)) out.push(a.id); });
  return out.sort();
}

/**
 * La chiave di una causa: fenomeno + apparecchi. Due etichette con la stessa
 * chiave parlano della stessa causa. `null` quando la tesi non nomina un
 * fenomeno dichiarato: un'ipotesi che non si sa classificare **non si
 * fonde**, resta per sé. Meglio una riga in più che una causa persa.
 */
function chiaveCausa(label) {
  var f = fenomenoCausa(label);
  if (!f) return null;
  return f + "|" + apparecchiNominati(label).join("+");
}

function parole(t) {
  return norm(t).match(/[a-z]{4,}/g) || [];
}

/**
 * Quel che l'etichetta assorbita dice **in più** di quella che resta.
 *
 * Si toglie soltanto la parola del fenomeno in testa, che altrimenti si
 * ripeterebbe ("Dispersione… — anche: dispersione…"). Non si taglia in
 * mezzo: comporre italiano per sottrazione di parole lo inventa, ed è la
 * regola già scritta in `check_phrasing` — *quel che non rientra in uno
 * schema viene scartato, non inventato*.
 *
 * Servono **almeno due** parole nuove: con una sola il frammento ridice la
 * riga di sopra con un sinonimo, che è il difetto che stiamo togliendo.
 */
function frammento(label, base) {
  var viste = {};
  parole(base).forEach(function (w) { viste[w.slice(0, 6)] = true; });
  var nuove = parole(label).filter(function (w) { return !viste[w.slice(0, 6)]; });
  if (nuove.length < 2) return null;

  var f = String(label == null ? "" : label)
    .replace(/^\s*(dispersione|cortocircuito|sovraccarico|interruzione|infiltrazione)\b/i, "")
    .replace(/^[\s:;,—–-]+/, "")
    .trim();
  if (!f) return null;
  return f.charAt(0).toLowerCase() + f.slice(1);
}

// ── RIPETERE IL SINTOMO NON È DIAGNOSTICARE ──────────────────────────
//
// Su FORUM-IT-007 il cliente scrive *"l'inverter segna errore ISO e non
// produce più niente"* e la prima riga della risposta era **"inverter in
// errore o spento"**: gli si ridiceva quello che aveva appena scritto. Non
// è falso — è **vuoto**. La causa vera (umidità in un connettore MC4)
// stava sotto.
//
// Si riconosce col vocabolario che ROCCO ha già: un'etichetta ridice il
// sintomo se la sua tesi nomina un OGGETTO e un COMPORTAMENTO che il
// racconto ha **già detto entrambi**. *"Umidità in connettore MC4"* no,
// perché `umido` il cliente non l'ha detto: quella aggiunge un perché.
//
// E la tesi dev'essere **nuda**: al più quattro parole. Misurato, è la
// riga che separa *"inverter in errore o spento"* (3) da *"Asse
// meccanicamente bloccato (giunto, riduttore, pompa bloccata)"* (7), che
// è una causa meccanica vera e nomina pezzi che il cliente non ha
// nominato. Chi ripete non aggiunge: chi aggiunge, spiega.
//
// **Retrocessione, non esclusione**, come la pertinenza: l'ipotesi resta
// viva perché non è falsa, e torna su se una misura la conferma.
var MAX_PAROLE_TESI_NUDA = 4;

function sottoinsieme(piccolo, grande) {
  return piccolo.every(function (x) { return grande.indexOf(x) >= 0; });
}

function ridiceIlSintomo(label, racconto) {
  var t = tesi(label);
  if ((t.match(/[A-Za-zàèéìòù]{3,}/g) || []).length > MAX_PAROLE_TESI_NUDA) return false;
  var oggetti = formeSintomo.oggetti(t);
  var comportamenti = formeSintomo.comportamenti(t);
  if (!oggetti.length || !comportamenti.length) return false;
  return sottoinsieme(oggetti, formeSintomo.oggetti(racconto)) &&
         sottoinsieme(comportamenti, formeSintomo.comportamenti(racconto));
}

module.exports = {
  FENOMENI_CAUSA: FENOMENI_CAUSA,
  RELAZIONI_CAUSALI: RELAZIONI_CAUSALI,
  spiegaAltra: spiegaAltra,
  APPARECCHI: APPARECCHI,
  tesi: tesi,
  fenomenoCausa: fenomenoCausa,
  apparecchiNominati: apparecchiNominati,
  chiaveCausa: chiaveCausa,
  frammento: frammento,
  ridiceIlSintomo: ridiceIlSintomo
};
