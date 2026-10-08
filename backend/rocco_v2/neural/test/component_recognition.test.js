"use strict";
/**
 * component_recognition.test.js — il riconoscimento componenti.
 *
 * Quattro difetti distinti producevano componenti inesistenti nelle
 * risposte. Qui stanno fissati, ognuno col suo caso.
 *
 * Il rischio da tenere d'occhio è simmetrico: togliendo rumore si possono
 * perdere i riconoscimenti veri. Per questo ogni sezione ha anche i casi
 * che DEVONO essere riconosciuti, sigle elettriche comprese.
 */

var de = require("../../../engine/diagnosticEngine");
var knowledge = require("../../../knowledge");

var passed = 0;
var failed = 0;

function ok(cond, label) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.log("  ✗ " + label);
}

function section(title) { console.log("\n--- " + title + " ---"); }

var K = knowledge.getLoadedKnowledge();

function componenti(frase) {
  return de.analyzeTechnicalRequest({ message: frase }, K).matchedComponents || [];
}
function riconosce(frase, id) {
  return componenti(frase).indexOf(id) >= 0;
}

// ============================================================

section("1. Sigle elettriche: parole intere, non sottostringhe");

// Il matching era `queryNorm.indexOf(keyword)`. Le sigle di due o tre
// lettere pescavano dentro le parole italiane comuni.
var SOTTOSTRINGHE = [
  ["lampadina", "DIN", "timer-relay"],
  ["la cucina funziona", "NA", "limit-switch"],
  ["lampadina nuova", "aM", "fusibile-cilindrico"],
  ["presa del soggiorno", "gG", "fusibile-cilindrico"],
  ["la lavatrice e le altre", "TR", "rele-termico"],
  ["il differenziale salta", "TA", "trasformatore-corrente"],
  ["non funziona", "NO", "pulsante-comando"]
];
SOTTOSTRINGHE.forEach(function (caso) {
  ok(!riconosce(caso[0], caso[2]),
    '"' + caso[1] + '" dentro "' + caso[0] + '" non riconosce ' + caso[2]);
});

// Le sigle vere restano riconoscibili: non si sono eliminate, si pretende
// che siano parole intere.
ok(riconosce("Ho un TA da 100/5 sul quadro.", "trasformatore-corrente"),
  "'TA' come parola intera riconosce il trasformatore di corrente");
ok(riconosce("Fusibile gG da 32A.", "fusibile-cilindrico"),
  "'gG' come parola intera riconosce il fusibile");
ok(riconosce("Timer su guida DIN.", "timer-relay"),
  "'guida DIN' riconosce il timer");

ok(de.containsKeyword("ho una lampadina nuova", "din") === false,
  "containsKeyword: 'din' non sta in 'lampadina'");
ok(de.containsKeyword("timer su guida din", "din") === true,
  "containsKeyword: 'din' come parola intera sì");
ok(de.containsKeyword("quadro", "o") === false,
  "containsKeyword: una lettera sola non identifica niente");

section("2. Keyword multi-parola: servono tutti i token");

// "interrutt" risultava prefisso di "interruttore automatico di potenza",
// quindi la parola "interruttore" — in casa il tasto a muro — riconosceva
// sette componenti di quadro.
var DOMESTICO = "La luce della cucina funziona quando le pare. Lampadina nuova, interruttore nuovo, continua uguale.";
["mccb-potenza", "salvamotore", "ats-commutatore", "interruttore-sezionatore"].forEach(function (id) {
  ok(!riconosce(DOMESTICO, id), "caso domestico non riconosce " + id);
});

// Quando i token ci sono davvero, il componente si riconosce
ok(riconosce("Interruttore scatolato da 250A sul quadro.", "mccb-potenza"),
  "'interruttore scatolato' riconosce lo scatolato di potenza");
ok(riconosce("Il salvamotore del compressore scatta.", "salvamotore"),
  "'salvamotore' riconosce il salvamotore");

section("3. Sinonimi prima dello stem, non dopo");

// stem("presenza") toglie "nza" e dà "prese", che la tabella normalizza a
// "presa": la keyword del sensore di movimento diventava identica alla
// parola "presa", e "non funziona la presa" riconosceva un sensore PIR.
ok(JSON.stringify(de.tokenize("presenza")) !== JSON.stringify(de.tokenize("presa")),
  "'presenza' e 'presa' non sono più la stessa parola");
ok(!riconosce("Non funziona piu la presa del soggiorno. Le altre prese vanno.", "sensore-pir"),
  "la presa del soggiorno non è un sensore di movimento");
ok(riconosce("Sensore di presenza in corridoio non rileva piu.", "sensore-pir"),
  "il sensore di presenza vero viene riconosciuto");

section("4. Prefix matching solo sulle flessioni");

// stem("magnetico") dà "magnet", prefisso di "magnetoterm": il finecorsa
// (keyword "magnetico") compariva in ogni frase sui magnetotermici.
ok(de.tokensMatch("magnet", "magnetoterm") === false,
  "'magnet' e 'magnetoterm' sono parole diverse");
ok(de.tokensMatch("interrutt", "interruttor") === true,
  "flessione: scarto di 2 lettere ammesso");
ok(de.tokensMatch("differenz", "differenz") === true, "parola identica");
ok(!riconosce("Magnetotermico 16A curva C scatta subito.", "limit-switch"),
  "il magnetotermico non riconosce il finecorsa");
ok(riconosce("Magnetotermico 16A curva C scatta subito.", "mcb-curva-c"),
  "il magnetotermico viene riconosciuto");
ok(riconosce("Il finecorsa magnetico del nastro non commuta.", "limit-switch"),
  "il finecorsa magnetico vero viene riconosciuto");

section("5. Plurale femminile italiano");

// Lo stemmer non tocca la vocale finale e il prefix matching non aiuta
// (stessa lunghezza): "cassette" non trovava "cassetta".
ok(de.tokensMatch("cassette", "cassetta") === true, "cassette ~ cassetta");
ok(de.tokensMatch("scatole", "scatola") === true, "scatole ~ scatola");
ok(de.tokensMatch("quadro", "quadri") === true, "quadro ~ quadri");
ok(riconosce("Ho aperto tutte le cassette di derivazione della casa.", "enclosure-ip"),
  "'cassette di derivazione' riconosce la cassetta");

section("6. Selettività — il limite di 3 non deve essere sempre saturo");

// Prima ogni caso restituiva esattamente 3 componenti: lo slice(0,3) era
// sempre riempito dal rumore delle sigle. Il riconoscitore non
// selezionava, restituiva sempre il massimo.
var corpus = require("../casi_reali_forum");
var casiIt = corpus.CASI_FORUM.filter(function (c) { return c.lingua === "it"; });
var totale = 0;
var sempreTre = 0;
casiIt.forEach(function (c) {
  var n = componenti(c.domanda).length;
  totale += n;
  if (n === 3) sempreTre += 1;
});
ok(sempreTre < casiIt.length,
  "non tutti i casi saturano il limite (" + sempreTre + "/" + casiIt.length + ")");
// Soglia come rete di sicurezza: prima erano 63 (3 per ogni caso).
ok(totale <= 45,
  "componenti riconosciuti sui 21 casi reali entro soglia (ora " + totale + ", prima 63)");

section("7. Frase non tecnica — nessun componente inventato");

ok(componenti("Ciao, volevo sapere quanto costa un preventivo.").length === 0,
  "una frase non tecnica non riconosce componenti");
ok(componenti("").length === 0, "stringa vuota: nessun componente");

console.log("\n" + new Array(61).join("="));
console.log("COMPONENT RECOGNITION: " + passed + " passed, " + failed + " failed");
console.log(new Array(61).join("="));
process.exit(failed > 0 ? 1 : 0);
