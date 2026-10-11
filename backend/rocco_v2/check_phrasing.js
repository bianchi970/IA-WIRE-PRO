"use strict";
/**
 * check_phrasing.js — da previsione a istruzione operativa.
 *
 * Il modello causale PREVEDE: "se il nodo X fosse in cortocircuito,
 * osserverei R prossima a 0 su X". È un'affermazione su cosa si vedrebbe,
 * serve a confrontare l'ipotesi con i fatti.
 *
 * Le previsioni non verificate finivano però in `confirm_tests` e da lì
 * `selectBestAction()` le dava all'utente come prossimo passo. Un
 * elettricista leggeva "R prossima a 0 su Circuito luci": un frammento,
 * non un ordine di lavoro. Errore di categoria:
 *
 *   previsione  = cosa vedrei SE l'ipotesi fosse vera   (per ragionare)
 *   istruzione  = cosa fare, con quale strumento, cosa leggere  (per operare)
 *
 * Qui si traduce. Due famiglie:
 *  - MISURE: strumento + grandezza + condizione dell'impianto + soglia
 *  - OSSERVAZIONI: cosa guardare o provare, in forma di verifica
 *
 * Una previsione che non corrisponde a nessuno schema NON viene inventata:
 * si restituisce null e il chiamante la scarta. Meglio una verifica in meno
 * che un'istruzione sbagliata su un impianto in tensione.
 */

function s(v) { return String(v == null ? "" : v).trim(); }

/** Via gli articoli dal nome del nodo: "il Circuito prese" → "Circuito prese" */
function cleanTarget(value) {
  return s(value).replace(/^(?:il|lo|la|i|gli|le|un|uno|una)\s+/i, "").trim();
}

function on(target) {
  var t = cleanTarget(target);
  return t ? " su " + t : "";
}

/**
 * Schemi di traduzione. `test` cattura il bersaglio, `build` compone
 * l'istruzione. L'ordine conta: i più specifici prima.
 */
var PATTERNS = [
  // ── MISURE STRUMENTALI ────────────────────────────────────────────────
  {
    id: "isolamento",
    test: /^isolamento basso su (.+)$/i,
    build: function (m) {
      return "Misura la resistenza di isolamento verso terra" + on(m[1]) +
        " con il megaohmetro a 500 V, a impianto fuori tensione e carichi scollegati: " +
        "sotto 1 MOhm la dispersione è confermata";
    }
  },
  {
    id: "cortocircuito",
    test: /^R prossima a 0 su (.+)$/i,
    build: function (m) {
      return "Misura la resistenza fase-neutro" + on(m[1]) +
        " con il tester, a impianto fuori tensione: un valore prossimo a 0 Ohm conferma il cortocircuito";
    }
  },
  {
    id: "continuita",
    test: /^continuita(?:'|\s+)?assente su (.+)$/i,
    build: function (m) {
      return "Prova di continuità" + on(m[1]) +
        " con il tester in buzzer, a impianto fuori tensione: assenza di continuità conferma il conduttore interrotto";
    }
  },
  {
    id: "sovraccarico",
    test: /^corrente superiore al nominale su (.+)$/i,
    build: function (m) {
      return "Misura la corrente" + on(m[1]) +
        " con la pinza amperometrica a carico in servizio: oltre la corrente nominale della protezione il sovraccarico è confermato";
    }
  },
  {
    id: "calore",
    test: /^calore anomalo su (.+?)(?:\s+—.*)?$/i,
    build: function (m) {
      return "Controlla la temperatura" + on(m[1]) +
        " con termometro a infrarossi a impianto in servizio, e verifica il serraggio dei morsetti a impianto fuori tensione";
    }
  },
  {
    id: "senza_tensione",
    test: /^(.+?) senza tensione$/i,
    build: function (m) {
      return "Misura la tensione ai morsetti di " + cleanTarget(m[1]) +
        " con il tester: assenza di tensione conferma l'interruzione a monte";
    }
  },

  // ── OSSERVAZIONI E PROVE ──────────────────────────────────────────────
  {
    id: "sezionamento",
    test: /^sezionando questo carico il differenziale non scatta piu/i,
    build: function () {
      return "Seziona i carichi uno alla volta e richiudi il differenziale dopo ogni distacco: " +
        "se smette di scattare, il carico appena staccato è quello guasto";
    }
  },
  {
    id: "alimentato_non_funziona",
    test: /^(.+?) non funziona anche se alimentato$/i,
    build: function (m) {
      return "Verifica che " + cleanTarget(m[1]) +
        " abbia tensione ai morsetti e non funzioni comunque: conferma il guasto interno al componente";
    }
  },
  {
    id: "non_risponde_comando",
    test: /non risponde al comando$/i,
    build: function (m) {
      return "Aziona il comando e verifica se il carico risponde, controllando la tensione a valle del comando";
    }
  },
  {
    id: "protezioni_chiuse",
    test: /non funziona ma le protezioni sono chiuse$/i,
    build: function () {
      return "Verifica che le protezioni siano chiuse e che ci sia tensione a valle, con il carico che non funziona";
    }
  },
  {
    id: "altre_linee",
    test: /^i circuiti sulle altre linee funzionano$/i,
    build: function () {
      return "Verifica se gli altri circuiti dell'impianto funzionano regolarmente: " +
        "se sì, il guasto è circoscritto a questa linea";
    }
  },
  {
    id: "nessun_circuito",
    test: /^nessun circuito dell'impianto funziona$/i,
    build: function () {
      return "Verifica se l'impianto è completamente fuori servizio o se solo alcune linee sono interessate";
    }
  },
  {
    id: "odore",
    test: /odore di bruciato o calore localizzato/i,
    build: function () {
      return "Ispeziona il quadro cercando odore di bruciato, annerimenti e punti caldi, a impianto fuori tensione";
    }
  },
  {
    id: "scatto_istantaneo",
    test: /scatta istantaneamente/i,
    build: function () {
      return "Verifica se lo scatto è istantaneo all'inserzione della leva o se avviene dopo qualche tempo: " +
        "istantaneo indica lo sgancio magnetico, ritardato quello termico";
    }
  },
  {
    id: "scatto_ritardato",
    test: /scatta dopo alcuni minuti/i,
    build: function () {
      return "Cronometra quanto passa dall'inserzione allo scatto: " +
        "alcuni minuti indicano lo sgancio termico da sovraccarico";
    }
  },
  {
    id: "rcd_non_scatta",
    test: /^il magnetotermico non scatta$/i,
    build: function () {
      return "Verifica quale protezione interviene: se scatta solo il differenziale e non il magnetotermico, " +
        "si tratta di dispersione e non di sovracorrente";
    }
  },
  {
    id: "anche_rcd_scatta",
    test: /^anche il differenziale scatta$/i,
    build: function () {
      return "Verifica se scattano entrambe le protezioni o solo una: " +
        "lo scatto di entrambe indica un guasto che coinvolge fase e terra";
    }
  },
  {
    id: "rcd_scatta",
    test: /^il differenziale scatta$/i,
    build: function () {
      return "Verifica se il differenziale interviene e se si richiude senza scattare subito";
    }
  },
  {
    id: "scatta_per_dispersione",
    test: /^(.+?) scatta per corrente di dispersione$/i,
    build: function (m) {
      return "Verifica se " + cleanTarget(m[1]) + " interviene per dispersione, " +
        "misurando la corrente differenziale con la pinza in configurazione a vuoto";
    }
  },
  {
    id: "interviene_per",
    test: /^(.+?) interviene per (cortocircuito|sovraccarico)(?:\s*\(.*\))?$/i,
    build: function (m) {
      return "Verifica se " + cleanTarget(m[1]) + " interviene per " + m[2].toLowerCase() +
        ", osservando se lo scatto è istantaneo o ritardato";
    }
  },
  {
    id: "non_si_avvia",
    test: /^(.+?) non si avvia$/i,
    build: function (m) {
      return "Verifica se " + cleanTarget(m[1]) + " riceve il comando di avvio e se arriva tensione ai suoi morsetti";
    }
  },
  {
    id: "non_funziona",
    test: /^(.+?) non funziona$/i,
    build: function (m) {
      return "Verifica se " + cleanTarget(m[1]) + " è fuori servizio e se ha tensione ai morsetti";
    }
  },
  {
    id: "dati_errati",
    test: /riceve dati errati dal sensore/i,
    build: function () {
      return "Confronta il valore letto dal sensore con una misura diretta sul campo";
    }
  }
];

/**
 * Traduce una previsione in istruzione operativa.
 * @returns {string|null} null se la previsione non è traducibile.
 */
/**
 * Il gruppo 1 di questi schemi è il BERSAGLIO: un componente, non una frase.
 *
 * `/^(.+?) non funziona$/` prende qualunque cosa precede quelle parole, e su
 * un testo come *"Verifica che le protezioni siano chiuse e che ci sia
 * tensione a valle, con il carico collegato il circuito non funziona"*
 * catturava **tutta la frase** come nome di componente. Usciva: *"**Verifica
 * se Verifica che** le protezioni siano chiuse…"* — il verbo raddoppiato,
 * misurato su FORUM-IT-002 e visibile all'utente nella riga del prossimo
 * passo.
 *
 * Un bersaglio valido è corto, non contiene proposizioni e **non è a sua
 * volta un'istruzione**. Quando non lo è, lo schema non si applica: vale la
 * regola di questo modulo — quel che non rientra in uno schema **viene
 * scartato, non inventato**.
 */
var BERSAGLIO_MAX = 44;

function bersaglioValido(valore) {
  var t = cleanTarget(valore);
  if (!t) return false;
  if (t.length > BERSAGLIO_MAX) return false;
  // Proposizioni ed elencazioni: un componente non le ha.
  if (/[,:;]|\bche\b|\bse\b|\bcon il\b|\bquando\b/i.test(t)) return false;
  // E un bersaglio non è un ordine.
  if (isInstruction(t)) return false;
  return true;
}

function toInstruction(prediction) {
  var text = s(prediction);
  if (!text) return null;

  for (var i = 0; i < PATTERNS.length; i += 1) {
    var m = text.match(PATTERNS[i].test);
    if (m) {
      // Lo schema più specifico è il primo che combacia: se il suo bersaglio
      // non è un componente, la previsione non è traducibile — non si passa
      // allo schema dopo a cercare una traduzione qualsiasi.
      if (m[1] !== undefined && !bersaglioValido(m[1])) return null;
      try {
        var out = s(PATTERNS[i].build(m));
        return out || null;
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

/** Riconosce lo schema applicato — utile a diagnosticare le previsioni scoperte. */
function patternIdOf(prediction) {
  var text = s(prediction);
  for (var i = 0; i < PATTERNS.length; i += 1) {
    if (PATTERNS[i].test.test(text)) return PATTERNS[i].id;
  }
  return null;
}

/**
 * Traduce una lista di previsioni, scartando le intraducibili e i duplicati.
 * Non inventa: ciò che non rientra in uno schema non diventa un'istruzione.
 */
function toInstructions(predictions) {
  var out = [];
  var seen = {};
  (Array.isArray(predictions) ? predictions : []).forEach(function (p) {
    var instruction = toInstruction(p);
    if (!instruction) return;
    var key = instruction.toLowerCase().slice(0, 60);
    if (seen[key]) return;
    seen[key] = true;
    out.push(instruction);
  });
  return out;
}

/**
 * Questo testo È un'istruzione, o è l'enunciato di uno stato?
 *
 * `toInstruction` traduce una PREVISIONE in un passo operativo, e torna
 * `null` su tutto il resto — comprese le istruzioni già scritte bene. Serve
 * quindi la domanda simmetrica, perché scartare i `null` butterebbe via
 * anche le verifiche giuste.
 *
 * La differenza non è il tipo di azione: `inferActionType` manda in
 * `ask_user` sia *"termografia dei pannelli"* (un'istruzione vera) sia
 * *"ventola inverter ferma o ostruita"* (un enunciato). La differenza è il
 * **verbo d'azione** — o il nome che nomina un'operazione.
 *
 * Le parole vengono dalle 144 verifiche del corpus, contate: `misura` 18,
 * `ispezione` 8, `sostituzione` 8, `verificare`/`verifica` 12,
 * `controllare` 5, `sezionamento` 3, `aprire` 3, `scollegamento` 2, più
 * `termografia`, `pulizia`, `staccare`, `togliere`, `pulire`, `separare`,
 * `chiamare`, `sentire`, `tracciamento`, `prova`. Sono le due famiglie che
 * questo modulo dichiara in testa: **misure** e **osservazioni**.
 *
 * Un enunciato di stato non ha nessuna di queste: *"tensione presente ai
 * morsetti"*, *"inverter funzionante senza allarmi"*, *"continuità presente
 * su tutti i conduttori"*. Sono previsioni del modello causale, utili a
 * confrontare l'ipotesi coi fatti, **inutili come prossimo passo**: un
 * elettricista non sa cosa fargli.
 */
var AZIONI = new RegExp([
  // verbi, all'imperativo o all'infinito
  "misur\\w*", "verific\\w*", "controll\\w*", "apri", "aprire", "apre",
  "scolleg\\w*", "stacc\\w*", "toglier?e?", "sostitui\\w*", "pulir?e?",
  "separ\\w*", "chiam\\w*", "sentire", "prov\\w*", "ispezion\\w*",
  "sezion\\w*", "traccia\\w*", "riarm\\w*", "cerca\\w*", "legger?e?",
  // nomi che nominano un'operazione
  "termografia", "pulizia", "sostituzione", "ispezione", "sezionamento",
  "scollegamento", "tracciamento", "misura", "verifica", "controllo",
  "prova", "test"
].join("|"), "i");

function isInstruction(testo) {
  var t = s(testo);
  if (!t) return false;
  return AZIONI.test(t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}

module.exports = {
  isInstruction: isInstruction,
  bersaglioValido: bersaglioValido,
  toInstruction: toInstruction,
  toInstructions: toInstructions,
  patternIdOf: patternIdOf,
  PATTERNS: PATTERNS
};
