"use strict";

/**
 * LA NEGAZIONE — un posto solo, e tre usi.
 *
 * In italiano una parola nominata non è una parola affermata: *"i pannelli
 * sembrano ok, **nessun errore** sull'inverter"* parla di errori per
 * **escluderli**. Chi conta le parole senza guardare la negazione legge il
 * contrario di quello che il cliente ha detto.
 *
 * Questo apparato nasce in `engine/diagnosticEngine.js`, dove ha corretto un
 * difetto misurato: *"inverter **senza** trasformatore"* faceva rilevare un
 * trasformatore 24V. Le parole sono tarate sulle frasi vere e **tollerano
 * l'articolo**, perché il cliente scrive "non ha **il** differenziale",
 * "manca **il** contatore".
 *
 * Vive qui, da solo e senza dipendenze, perché gli usi sono diventati tre e
 * stavano per diventare tre elenchi di parole:
 *
 *   1. **il riconoscitore di componenti** (motore) — la keyword è negata?
 *   2. **la ricerca nella banca dispositivi** — una parola negata non fa
 *      punteggio, e una parola che *nega* non è una parola di sintomo;
 *   3. **la classificazione del sintomo** (`forme_sintomo`) — una classe di
 *      comportamento non vale se la sua unica occorrenza è negata.
 *
 * Il terzo uso è quello che ha portato qui: su FORUM-SPEC-003 la parola
 * "errore" dentro "nessun errore" faceva classificare il fenomeno come
 * *apparecchio in blocco*, e da lì la banca pescava tre guasti d'inverter —
 * cioè esattamente quello che il cliente aveva escluso.
 *
 * `lookbehind` di 24 caratteri: abbastanza per "non ha più il", non tanto da
 * raccogliere la negazione di una frase precedente.
 */

var ARTICOLI = "(?:\\s+(?:il|lo|la|i|gli|le|un|uno|una|dei|degli|delle|del|dello|della|l))*";

var PAROLE_NEGANTI =
  "(senza|privo di|priva di|privi di|sprovvist\\w+ di|non ha|non hanno|non c e|non ce|" +
  "manca|mancano|mancante|assente|assenza di|nessun\\w*|niente)";

// La negazione sta PRIMA della parola: si prova sul testo che la precede, e
// per questo è ancorata in coda.
var NEGATORS = new RegExp(PAROLE_NEGANTI + ARTICOLI + "\\s*$");

// La parola È essa stessa una negazione: "nessun" non descrive niente.
var SOLO_NEGAZIONE = new RegExp("^" + PAROLE_NEGANTI + "$");

var NEGATION_LOOKBEHIND = 24;

/** Il testo che precede questa posizione è una negazione? */
function isNegatedBefore(testoNorm, indice) {
  var inizio = Math.max(0, indice - NEGATION_LOOKBEHIND);
  return NEGATORS.test(String(testoNorm).slice(inizio, indice));
}

/**
 * Tutte le occorrenze della keyword sono negate?
 *
 * Se il cliente nomina il componente una volta negandolo e un'altra volta
 * no, vale la volta buona: basta un'occorrenza non negata.
 */
function isKeywordNegated(queryNorm, kn) {
  var escaped = String(kn).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var re = new RegExp("(^|[^a-z0-9])" + escaped + "([^a-z0-9]|$)", "gi");
  var trovataUnaLibera = false;
  var trovataQualcuna = false;
  var m;
  while ((m = re.exec(queryNorm)) !== null) {
    trovataQualcuna = true;
    var inizio = m.index + m[1].length;
    if (!isNegatedBefore(queryNorm, inizio)) trovataUnaLibera = true;
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return trovataQualcuna && !trovataUnaLibera;
}

/** La parola è un marcatore di negazione, non un sintomo. */
function isNegationWord(parola) {
  return SOLO_NEGAZIONE.test(String(parola == null ? "" : parola).toLowerCase());
}

/**
 * Il regex trova almeno un'occorrenza NON negata?
 *
 * Serve alle classi di comportamento, che sono regex e non parole singole.
 * Stessa regola di `isKeywordNegated`: basta un'occorrenza libera.
 */
function hasUnnegatedMatch(testoNorm, regex) {
  var re = new RegExp(regex.source, regex.flags.indexOf("g") >= 0 ? regex.flags : regex.flags + "g");
  var m, trovata = false;
  while ((m = re.exec(testoNorm)) !== null) {
    trovata = true;
    if (!isNegatedBefore(testoNorm, m.index)) return true;
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  // Nessuna occorrenza → non c'è niente da affermare; tutte negate → falso.
  return trovata ? false : false;
}

module.exports = {
  ARTICOLI: ARTICOLI,
  PAROLE_NEGANTI: PAROLE_NEGANTI,
  NEGATORS: NEGATORS,
  NEGATION_LOOKBEHIND: NEGATION_LOOKBEHIND,
  isNegatedBefore: isNegatedBefore,
  isKeywordNegated: isKeywordNegated,
  isNegationWord: isNegationWord,
  hasUnnegatedMatch: hasUnnegatedMatch
};
