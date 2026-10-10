"use strict";

/**
 * Test: il senso in cui il cliente ha usato la parola.
 *
 * Riconoscere la parola non bastava. Misurato sulle 21 domande italiane di
 * casi_reali_forum.js: su 35 componenti rilevati, **14 erano inesistenti**.
 * Da "Ho forato il muro per appendere un quadro […] Cosa ho combinato?"
 * nascevano la custodia di un quadro elettrico e un magnetotermico
 * differenziale combinato; da "inverter senza trasformatore" un
 * trasformatore 24V; da "odore di bruciato" il bruciatore di una caldaia.
 *
 * Cinque meccanismi, tutti misurati e attribuiti alla keyword colpevole:
 *  1. **negazione** — "senza trasformatore" non è un trasformatore;
 *  2. **omonimia** — "quadro" il dipinto, "inverter" il VFD contro quello
 *     fotovoltaico, "interruttore" il tasto a muro contro il magnetotermico;
 *  3. **nomi d'agente** — lo stemmer collassa "bruciatore" su "bruciato";
 *  4. **un token per due posizioni** — "aria-aria" soddisfatta da una sola
 *     occorrenza di "aria";
 *  5. **keyword che non sono nomi del componente** — "combinato", "NO",
 *     "kW", "portata", "ciclico", "variatore".
 *
 * Il filtro a valle accetta `score >= 2`, cioè **una sola keyword**: un
 * senso sbagliato basta a inventare un componente, e da un componente
 * inventato nascono ipotesi inventate.
 */

var de = require("../../../engine/diagnosticEngine");
var componenti = require("../../../knowledge/components.json").items;
var corpus = require("../casi_reali_forum.js");

var pass = 0;
var fail = 0;

function check(label, condition) {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.log("  ✗ " + label);
  }
}

function eq(label, actual, expected) {
  var ok = actual === expected;
  if (!ok) console.log("    atteso " + JSON.stringify(expected) + ", ottenuto " + JSON.stringify(actual));
  check(label, ok);
}

function comp(id) {
  var c = componenti.filter(function (x) { return x.id === id; })[0];
  if (!c) throw new Error("componente non trovato: " + id);
  return c;
}

function punteggio(id, testo) {
  return de.scoreComponentMatch(comp(id), de.normalize(testo), de.tokenize(testo));
}

function rilevato(id, testo) {
  // Il filtro reale a valle: una sola keyword (score 2) basta.
  return punteggio(id, testo) >= 2;
}

// ─── §1 Negazione ──────────────────────────────────────────────────────
console.log("\n§1 — la parola c'è, il componente no");

var neg = de.isKeywordNegated;
check("senza trasformatore", neg(de.normalize("inverter Aurora senza trasformatore"), "trasformatore"));
check("privo di differenziale", neg(de.normalize("il quadro è privo di differenziale"), "differenziale"));
check("non ha il differenziale", neg(de.normalize("l impianto non ha il differenziale"), "differenziale"));
check("manca il contatore", neg(de.normalize("manca il contatore"), "contatore"));
check("nessun differenziale installato", neg(de.normalize("nessun differenziale installato"), "differenziale"));
check("assenza di terra", neg(de.normalize("assenza di terra nell impianto"), "terra"));

check("il differenziale nominato normalmente NON è negato",
  !neg(de.normalize("il differenziale scatta sempre"), "differenziale"));
check("se compare due volte e una è libera, vale",
  !neg(de.normalize("prima era senza differenziale, ora il differenziale scatta"), "differenziale"));
check("parola assente: non è negata né presente",
  !neg(de.normalize("il magnetotermico scatta"), "trasformatore"));

// Il caso reale FORUM-IT-016.
check("su 'inverter senza trasformatore' non si rileva il trasformatore 24V",
  !rilevato("trasformatore-24v",
    "Impianto FV 4.05 kW con inverter Aurora Power One senza trasformatore. Il differenziale scatta."));

// ─── §2 Omonimi ────────────────────────────────────────────────────────
console.log("\n§2 — la parola giusta nel senso sbagliato");

// "quadro": il dipinto.
var quadroDipinto = "Ho forato il muro per appendere un quadro e adesso non funziona più la presa del soggiorno.";
check("appendere un quadro non è un quadro elettrico", !rilevato("enclosure-ip", quadroDipinto));
check("e nemmeno un quadro di distribuzione", !rilevato("quadro-distribuzione", quadroDipinto));

// Ma il quadro elettrico vero resta riconosciuto.
var quadroVero = "Nel quadro elettrico c'è un odore di bruciato e un morsetto è diventato nero.";
check("il quadro elettrico vero è riconosciuto", rilevato("quadro-distribuzione", quadroVero));
check("la custodia del quadro vero è riconosciuta", rilevato("enclosure-ip", quadroVero));
// Anche con un quadro appeso, se il testo lo qualifica come elettrico.
check("un quadro elettrico appeso resta un quadro elettrico",
  rilevato("enclosure-ip", "ho aperto il quadro elettrico appeso in garage e sento odore"));

// "inverter": due dispositivi diversi.
var fv = "Ho un impianto fotovoltaico da 6kW, da ieri l'inverter segna errore ISO e non produce più niente.";
check("su impianto fotovoltaico non si rileva il variatore di frequenza", !rilevato("inverter-vfd", fv));
check("si rileva l'inverter fotovoltaico", rilevato("inverter-fotovoltaico", fv));
check("su un motore l'inverter è il variatore di frequenza",
  rilevato("inverter-vfd", "il motore con inverter va in allarme quando accelera, rampa troppo rapida"));

// "interruttore": il tasto a muro o il magnetotermico.
// NOTA: questa regola non tocca la voce SYNONYM_MAP interruttore→magnetotermico,
// che resta una decisione di dominio. Pretende solo il contesto da quadro.
check("gli interruttori che non restano su sono magnetotermici",
  rilevato("mcb-curva-c", "ho provato a tirare su tutti gli interruttori ma uno non resta su, fa TRAC e ricade"));
check("l'interruttore della luce non è un magnetotermico",
  !rilevato("mcb-curva-c", "La luce della cucina funziona quando le pare. Lampadina nuova, interruttore nuovo."));
check("gli interruttori delle luci controllati a mano non sono magnetotermici",
  !rilevato("mcb-curva-c", "le luci del bagno si accendono da sole, ho controllato gli interruttori, sono spenti"));
check("se il cliente scrive magnetotermico, è quello",
  rilevato("mcb-curva-c", "il condizionatore parte ma dopo 10 minuti scatta il magnetotermico"));

// ─── §3 Nomi d'agente ──────────────────────────────────────────────────
console.log("\n§3 — i nomi d'agente non si deducono dal participio");

check("odore di bruciato non è un bruciatore",
  !rilevato("caldaia-riscaldamento", "Nel quadro elettrico c'è un odore di bruciato e un morsetto nero."));
check("ma il bruciatore nominato è riconosciuto",
  rilevato("caldaia-riscaldamento", "il bruciatore della caldaia non parte"));
check("al plurale pure",
  rilevato("caldaia-riscaldamento", "ho due bruciatori in centrale termica"));
check("il contattore nominato è riconosciuto",
  rilevato("contactor-ac", "il contattore non tira e ronza"));
check("al plurale anche",
  rilevato("contactor-ac", "i contattori in quadro ronzano"));

// ─── §4 Un token non vale per due posizioni ────────────────────────────
console.log("\n§4 — token distinti");

check("'aria compressa' non si deduce da 'aria' + 'compressore'... ma la pompa aria-aria no",
  !rilevato("pompa-calore", "Ho un motore 2cv di un compressore ad aria cinese che fa scattare il differenziale"));
check("la pompa di calore aria-aria nominata è riconosciuta",
  rilevato("pompa-calore", "ho una pompa di calore aria-aria che non scalda"));

// Direttamente sulla funzione: due token uguali pretendono due occorrenze.
check("keywordTokensPresent: 'aria aria' non basta una sola aria",
  !de.keywordTokensPresent("aria-aria", de.tokenize("compressore ad aria")));
check("con due occorrenze invece sì",
  de.keywordTokensPresent("aria-aria", de.tokenize("pompa aria aria")));

// ─── §5 Keyword che non sono nomi del componente ───────────────────────
console.log("\n§5 — igiene delle keyword (ognuna un falso positivo misurato)");

function haKeyword(id, k) {
  return (comp(id).keywords || []).some(function (x) {
    return String(x).toLowerCase() === k.toLowerCase();
  });
}

check("rcbo-combinato non ha più 'combinato'", !haKeyword("rcbo-combinato", "combinato"));
check("pulsante-comando non ha più 'NO'", !haKeyword("pulsante-comando", "NO"));
check("motor-3phase non ha più 'kW'", !haKeyword("motor-3phase", "kW"));
check("pompa-circolatore non ha più 'portata'", !haKeyword("pompa-circolatore", "portata"));
check("timer-relay non ha più 'ciclico'", !haKeyword("timer-relay", "ciclico"));
check("timer-relay non ha più le tensioni", !haKeyword("timer-relay", "230V") && !haKeyword("timer-relay", "24V"));
check("dimmer non ha più 'variatore' nudo", !haKeyword("dimmer", "variatore"));

// I nomi veri restano, e con essi il riconoscimento.
check("l'RCBO resta riconoscibile dal suo nome", rilevato("rcbo-combinato", "ho un RCBO sul circuito prese"));
check("e da 'magnetotermico differenziale'", rilevato("rcbo-combinato", "ho montato un magnetotermico differenziale"));
check("il pulsante resta riconoscibile", rilevato("pulsante-comando", "il pulsante di marcia non funziona"));
check("il motore trifase resta riconoscibile", rilevato("motor-3phase", "ho un motore trifase asincrono"));
check("la pompa resta riconoscibile", rilevato("pompa-circolatore", "il circolatore della caldaia è bloccato"));
check("il temporizzatore resta riconoscibile", rilevato("timer-relay", "ho un temporizzatore con ritardo all eccitazione"));
check("il dimmer resta riconoscibile", rilevato("dimmer", "il dimmer dei faretti ronza"));

// I falsi positivi misurati non tornano.
check("'Cosa ho combinato?' non è un RCBO", !rilevato("rcbo-combinato", "Cosa ho combinato?"));
check("'a volte no' non è un pulsante", !rilevato("pulsante-comando", "a volte si accende, a volte no, a volte tremola"));
check("'4.05 kW' non è un motore trifase", !rilevato("motor-3phase", "impianto FV 4.05 kW con inverter"));
check("'portato per sostituzione' non è una pompa",
  !rilevato("pompa-circolatore", "Interruttore magnetotermico Bticino portato per sostituzione"));
check("'3-4 cicli al minuto' non è un temporizzatore",
  !rilevato("timer-relay", "la caldaia parte e si ferma, fa 3-4 cicli al minuto"));

// ─── §6 Corpus reale: zero componenti inesistenti ──────────────────────
console.log("\n§6 — corpus reale: 21 casi");

// Etichettatura a mano, derivata dall'attribuzione keyword per keyword di
// ogni rilevamento: per ciascun caso i componenti che il testo NON
// giustifica. FORUM-IT-002 è l'eccezione interessante: lì "interruttori"
// significa davvero i magnetotermici, e mcb-curva-c va mantenuto.
var FANTASMA = {
  "FORUM-IT-003": ["enclosure-ip", "rcbo-combinato"],
  "FORUM-IT-004": ["caldaia-riscaldamento"],
  "FORUM-IT-005": ["mcb-curva-c", "pulsante-comando"],
  "FORUM-IT-007": ["inverter-vfd", "dimmer"],
  "FORUM-SPEC-001": ["mcb-curva-c"],
  "FORUM-SPEC-003": ["inverter-vfd", "dimmer"],
  "FORUM-SPEC-005": ["timer-relay"],
  "FORUM-IT-014": ["pompa-circolatore"],
  "FORUM-IT-016": ["inverter-vfd", "trasformatore-24v"]
};

// Rilevamenti corretti che devono restare: la rete di sicurezza contro un
// filtro troppo zelante.
var DA_TENERE = {
  "FORUM-IT-001": ["rcd-ac-2p"],
  "FORUM-IT-002": ["mcb-curva-c"],
  "FORUM-IT-004": ["terminal-block"],
  "FORUM-IT-006": ["mcb-curva-c"],
  "FORUM-IT-007": ["inverter-fotovoltaico"],
  "FORUM-IT-008": ["caldaia-riscaldamento"],
  "FORUM-IT-010": ["motor-3phase"],
  "FORUM-IT-011": ["enclosure-ip"],
  "FORUM-IT-015": ["motor-3phase", "rcd-ac-2p"],
  "FORUM-IT-016": ["inverter-fotovoltaico", "rcd-ac-2p"]
};

var casiIt = corpus.CASI_FORUM.filter(function (c) { return c.lingua === "it"; });
eq("21 casi italiani", casiIt.length, 21);

var fantasmaResidui = 0;
var persi = [];
var rilevatiTot = 0;

casiIt.forEach(function (caso) {
  var queryNorm = de.normalize(caso.domanda);
  var queryTokens = de.tokenize(caso.domanda);

  var rilevati = componenti.filter(function (c) {
    return de.scoreComponentMatch(c, queryNorm, queryTokens) >= 2;
  }).map(function (c) { return c.id; });

  rilevatiTot += rilevati.length;

  (FANTASMA[caso.id] || []).forEach(function (id) {
    if (rilevati.indexOf(id) >= 0) {
      fantasmaResidui++;
      console.log("  ✗ " + caso.id + ": rilevato ancora il fantasma " + id);
    }
  });

  (DA_TENERE[caso.id] || []).forEach(function (id) {
    if (rilevati.indexOf(id) < 0) persi.push(caso.id + "/" + id);
  });
});

console.log("    componenti rilevati sul corpus: " + rilevatiTot + " (erano 35, di cui 14 inesistenti)");
eq("nessun componente inesistente", fantasmaResidui, 0);
eq("nessun rilevamento corretto perso", persi.length, 0);
persi.forEach(function (p) { console.log("      perso →", p); });

console.log("\n============================================================");
console.log("SENSO DELLE PAROLE: " + pass + " passed, " + fail + " failed");
console.log("============================================================");
process.exit(fail === 0 ? 0 : 1);
