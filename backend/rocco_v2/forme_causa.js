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
 * Modulo puro, nessuna dipendenza: come `negazione.js` e `forme_sintomo.js`.
 */

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
  { id: "infiltrazione",
    re: /umidit|infiltrazion|acqua|bagnat|pioggi/ },
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

module.exports = {
  FENOMENI_CAUSA: FENOMENI_CAUSA,
  APPARECCHI: APPARECCHI,
  tesi: tesi,
  fenomenoCausa: fenomenoCausa,
  apparecchiNominati: apparecchiNominati,
  chiaveCausa: chiaveCausa,
  frammento: frammento
};
