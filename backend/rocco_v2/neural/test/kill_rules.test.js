"use strict";
/**
 * kill_rules.test.js — l'esclusione per impossibilità fisica.
 *
 * Due rischi opposti, entrambi coperti qui:
 *  - regola che NON scatta  → ROCCO propone cause già escluse dall'utente
 *  - regola che scatta TROPPO → ROCCO scarta la causa vera (più grave)
 *
 * Per ogni regola: un caso che deve scattare e uno che non deve.
 * Nessuna chiamata di rete: si lavora su case_state costruiti a mano.
 */

var orch = require("../../orchestrator");

var passed = 0;
var failed = 0;

function ok(cond, label) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.log("  ✗ " + label);
}

function section(title) { console.log("\n--- " + title + " ---"); }

var RULES = {};
orch.KILL_RULES.forEach(function (r) { RULES[r.id] = r; });

function ctxOf(message, measurements, facts) {
  return orch.buildEvidenceContext({
    problem_summary: message,
    facts_confirmed: facts || [],
    facts_uncertain: [],
    visual_findings: [],
    measurements: measurements || []
  });
}

function fires(id, message, measurements, facts) {
  return orch.ruleTriggered(RULES[id], ctxOf(message, measurements, facts));
}

/** Il case_state minimo che killImpossible sa digerire. */
function caseWith(message, hypothesisLabels, measurements) {
  return {
    problem_summary: message,
    facts_confirmed: [],
    facts_uncertain: [],
    visual_findings: [],
    measurements: measurements || [],
    hypotheses: hypothesisLabels.map(function (label) {
      return {
        label: label, reason: "", status: "active", confidence: "probable",
        source: "test", catena: [], confirm_tests: [], deny_tests: [], supporting_evidence: []
      };
    }),
    runtime: { trace: [], tools_used: [] }
  };
}

function statusOf(cs, label) {
  var h = cs.hypotheses.filter(function (x) { return x.label === label; })[0];
  return h ? h.status : "assente";
}

// ============================================================

section("1. Tutte le regole sono ben formate");

ok(orch.KILL_RULES.length === 14, "14 regole caricate (ne risultano " + orch.KILL_RULES.length + ")");
orch.KILL_RULES.forEach(function (r) {
  ok(!!r.id && !!r.reason && !!r.kills, r.id + ": ha id, motivo e bersaglio");
  ok(!!(r.when || r.fact || r.signal || (r.signals && r.signals.length)),
    r.id + ": ha almeno un innesco basato su prove");
});

section("2. KR-01 isolamento — si legge la MISURA, non la forma della frase");

// Il difetto storico: il regex pretendeva il simbolo ">" nel testo, quindi
// "isolamento 50 MOhm" veniva ignorato e la dispersione restava in testa.
ok(fires("KR-01", "il differenziale scatta", [{ type: "isolamento", value: 50, unit: "MΩ" }]) === true,
  "50 MOhm esclude la dispersione");
ok(fires("KR-01", "il differenziale scatta", [{ type: "isolamento", value: 0.3, unit: "MΩ" }]) === false,
  "0,3 MOhm NON esclude: isolamento degradato");
ok(fires("KR-01", "il differenziale scatta", [{ type: "isolamento", value: 2000, unit: "kOhm" }]) === true,
  "2000 kOhm = 2 MOhm: conversione corretta");
ok(fires("KR-01", "il differenziale scatta", [{ type: "isolamento", value: 500, unit: "kOhm" }]) === false,
  "500 kOhm = 0,5 MOhm: sotto soglia");
ok(fires("KR-01", "il differenziale scatta", []) === false,
  "senza misura non si esclude niente");
ok(fires("KR-01", "il differenziale scatta", [], ["isolation_high"]) === true,
  "il fatto derivato isolation_high basta da solo");

section("3. KR-02 tensione — la negazione annulla la prova");

ok(fires("KR-02", "Ho misurato 230V in uscita, la tensione c'e' regolare.") === true,
  "tensione verificata presente");
ok(fires("KR-02", "Impianto civile 230V, non arriva tensione alla presa.") === false,
  "230V nominale + 'non arriva tensione' non è una verifica");

section("4. KR-10 scatto a vuoto — ordine delle parole libero");

// Il difetto storico: il regex pretendeva "carico scollegato ... scatta".
// In italiano la frase arriva nei due ordini e così non scattava mai.
ok(fires("KR-10", "Scatta anche con tutte le prese staccate.") === true,
  "'anche con tutte le prese staccate'");
ok(fires("KR-10", "Il differenziale scatta anche a vuoto, con tutto staccato.") === true,
  "'a vuoto, con tutto staccato'");
ok(fires("KR-10", "Scatta anche se scollego tutti i carichi.") === true,
  "'scollego tutti i carichi'");
ok(fires("KR-10", "Scatta il magnetotermico anche senza niente attaccato.") === true,
  "'senza niente attaccato'");
ok(fires("KR-10", "Magnetotermico 16A: scatta subito, con tutte le prese staccate.") === true,
  "esclusione senza la parola 'anche'");
ok(fires("KR-10", "Scatta solo quando accendo la lavatrice.") === false,
  "scatta SOTTO carico: il carico resta sospettabile");

section("5. KR-11 impianto civile — fuori contesto, non 'non verificato'");

ok(fires("KR-11", "Impianto civile 230V in appartamento, il magnetotermico delle prese scatta.") === true,
  "civile monofase: le ipotesi da quadro industriale non si applicano");
ok(fires("KR-11", "Impianto 230V ma c'e' un motore trifase 400V sulla pompa.") === false,
  "se c'è un motore trifase la regola si disattiva");
ok(fires("KR-11", "Quadro 230V con contattore e salvamotore.") === false,
  "se c'è un salvamotore la regola si disattiva");

section("6. KR-12 solo magnetotermico / KR-13 componente sostituito");

ok(fires("KR-12", "Scatta il magnetotermico ma il differenziale non scatta mai.") === true,
  "solo sovracorrente: esclude la dispersione");
ok(fires("KR-12", "Scattano insieme magnetotermico e differenziale.") === false,
  "scattano entrambi: non si esclude nulla");
ok(fires("KR-13", "Ho sostituito il differenziale ma il problema continua identico.") === true,
  "componente sostituito e sintomo invariato");
ok(fires("KR-13", "Il differenziale scatta e il problema continua.") === false,
  "senza sostituzione la regola non si applica");

// KR-14 — l'apparecchio non segnala nulla, e ROCCO gli attribuiva un errore.
// La frase di innesco è quella vera di FORUM-SPEC-003, non una di comodo.
ok(fires("KR-14", "I pannelli sembrano ok, nessun errore sull'inverter.") === true,
  "il cliente dichiara che non ci sono errori segnalati");
ok(fires("KR-14", "L'inverter segna errore ISO e non produce piu niente.") === false,
  "l'errore c'è davvero: la regola non si applica (FORUM-IT-007)");
ok(fires("KR-14", "La caldaia va in blocco dopo 3 secondi.") === false,
  "un blocco dichiarato non è una dichiarazione di assenza di allarmi");

section("7. killImpossible sul case_state — l'ipotesi giusta sopravvive");

var cs1 = caseWith(
  "Il differenziale scatta anche con tutte le prese staccate.",
  ["Guasto interno a un carico", "Dispersione verso terra sulla linea fissa", "Umidita in cassetta di derivazione"]
);
orch.killImpossible(cs1);
ok(statusOf(cs1, "Guasto interno a un carico") === "rejected",
  "il guasto nel carico viene escluso");
ok(statusOf(cs1, "Dispersione verso terra sulla linea fissa") === "active",
  "la dispersione sulla linea fissa resta: i carichi non c'entrano");
ok(statusOf(cs1, "Umidita in cassetta di derivazione") === "active",
  "l'umidità resta viva");

var cs2 = caseWith(
  "Ho misurato l'isolamento: 50 MOhm. Il differenziale continua a scattare.",
  ["Dispersione verso terra su carico o linea", "Dispositivo RCD difettoso"],
  [{ type: "isolamento", value: 50, unit: "MΩ" }]
);
orch.killImpossible(cs2);
ok(statusOf(cs2, "Dispersione verso terra su carico o linea") === "rejected",
  "isolamento sano esclude la dispersione");
ok(statusOf(cs2, "Dispositivo RCD difettoso") === "active",
  "resta il differenziale difettoso: la diagnosi corretta");
ok(/KR-01/.test((cs2.hypotheses[0].rejection_reason || "")),
  "l'esclusione è tracciata con l'id della regola");

section("8. Valvola di sicurezza — mai zero ipotesi attive");

var cs3 = caseWith(
  "Il differenziale scatta anche con tutto staccato.",
  ["Guasto interno a un carico"]
);
orch.killImpossible(cs3);
ok(statusOf(cs3, "Guasto interno a un carico") === "active",
  "l'ultima ipotesi attiva non viene uccisa");
ok(cs3.runtime.trace.some(function (t) { return t.step === "kill_skipped"; }),
  "la mancata esclusione è tracciata, non silenziosa");

var cs4 = caseWith(
  "Il differenziale scatta anche con tutto staccato.",
  ["Guasto interno a un carico", "Elettrodomestico difettoso", "Dispersione sulla linea fissa"]
);
orch.killImpossible(cs4);
var attive4 = cs4.hypotheses.filter(function (h) { return h.status === "active"; });
ok(attive4.length >= 1, "resta sempre almeno un'ipotesi attiva");
ok(statusOf(cs4, "Dispersione sulla linea fissa") === "active",
  "a sopravvivere è quella giusta, non una a caso");

section("9. Estrazione delle sole frasi di esclusione");

var ex = orch.extractUserExclusions("Impianto civile 230V. Ho staccato tutti i carichi e scatta ancora. Scatta solo di sera.");
ok(/staccato tutti i carichi/i.test(ex), "cattura la verifica dell'utente");
ok(/solo di sera/i.test(ex), "cattura la condizione discriminante");
ok(!/impianto civile 230v\./i.test(ex), "NON cattura la descrizione nominale dell'impianto");

var ctxN = ctxOf("Impianto civile 230V, non arriva tensione alla presa.");
ok(ctxN.story.indexOf("230") >= 0, "il racconto contiene i dati nominali");
ok(ctxN.text.indexOf("impianto civile 230v") < 0, "le prove non contengono i dati nominali");

section("10. Verifiche già eseguite dall'utente — non si riordinano");

// Escludere l'ipotesi non basta: se l'utente ha già staccato i carichi,
// ordinargli di staccare i carichi è la riga più visibile della risposta
// e lo fa sentire inascoltato.
function doneMatchers(message) {
  return orch.buildAlreadyDoneMatchers(ctxOf(message));
}
function rendeInutile(message, azione) {
  var az = azione.toLowerCase();
  return doneMatchers(message).some(function (re) { return re.test(az); });
}

ok(rendeInutile("Scatta anche con tutte le prese staccate.", "scollegare tutti i carichi a valle") === true,
  "carichi già staccati: non si riordina di staccarli");
ok(rendeInutile("Scatta anche con tutte le prese staccate.", "misura isolamento con megger") === false,
  "la misura di isolamento resta proponibile");
ok(rendeInutile("Ho misurato l'isolamento con il megger: 50 MOhm.", "misura isolamento con megger") === true,
  "isolamento già misurato: non si riordina la stessa misura");
ok(rendeInutile("Ho sostituito il differenziale ma il problema continua.", "sostituire il differenziale") === true,
  "componente già sostituito");
ok(rendeInutile("Ho serrato tutti i morsetti del quadro.", "verificare il serraggio dei morsetti") === true,
  "morsetti già serrati");
ok(rendeInutile("Il differenziale scatta quando accendo la lavatrice.", "scollegare tutti i carichi a valle") === false,
  "se l'utente non ha staccato niente, la verifica resta valida");
ok(doneMatchers("Il differenziale scatta.").length === 0,
  "senza dichiarazioni dell'utente non si filtra nulla");

// La penalità non deve mai azzerare le proposte
var csAz = caseWith("Scatta anche con tutte le prese staccate.", ["Cortocircuito sulla linea fissa"]);
csAz.hypotheses[0].confirm_tests = ["scollegare tutti i carichi a valle"];
csAz.hypotheses[0].deny_tests = [];
csAz.checks_requested = [];
csAz.safety = { level: "attention", reasons: [], blocked_actions: [], allowed_next_step: "" };
var azione = orch.selectBestAction(csAz);
ok(!!(azione && azione.action), "anche se l'unica verifica è già stata fatta, ROCCO propone qualcosa");

section("11. Corpus reale — le frasi vere, non quelle di comodo");

// Le regex sulle frasi italiane sono il punto più fragile di tutto questo
// lavoro: è facile tararle su frasi inventate a tavolino e credere che
// funzionino. Qui si misurano sulle 21 domande italiane reali raccolte in
// casi_reali_forum.js, dove la causa vera è nota.
//
// La prima versione di KR-13 pretendeva "ho sostituito X ma il problema
// persiste". Nel corpus reale la forma è "Lampadina nuova, interruttore
// nuovo, continua uguale": la regola non scattava mai.
var corpus = require("../casi_reali_forum");
var casiIt = corpus.CASI_FORUM.filter(function (c) { return c.lingua === "it"; });

ok(casiIt.length >= 20, "corpus italiano disponibile (" + casiIt.length + " casi)");

var conEsclusioni = casiIt.filter(function (c) {
  return !!orch.extractUserExclusions(c.domanda);
});
// Soglia volutamente sotto il valore attuale: è una rete di sicurezza
// contro le regressioni, non un bersaglio da rincorrere.
ok(conEsclusioni.length >= 12,
  "esclusioni riconosciute in almeno 12 casi reali (ora " + conEsclusioni.length + "/" + casiIt.length + ")");

// Le forme reali che la prima versione mancava
ok(/lampadina nuova|interruttore nuovo/i.test(
  orch.extractUserExclusions("La luce funziona quando le pare. Lampadina nuova, interruttore nuovo, continua uguale.")),
  "caso 5: 'lampadina nuova, interruttore nuovo'");
ok(fires("KR-13", "La luce funziona quando le pare. Lampadina nuova, interruttore nuovo, continua uguale.") === true,
  "caso 5: KR-13 scatta sulla forma reale, senza il verbo 'ho sostituito'");
ok(/le altre prese vanno/i.test(
  orch.extractUserExclusions("Non funziona più la presa del soggiorno. Le altre prese vanno.")),
  "caso 3: 'le altre prese vanno' — guasto circoscritto");
ok(/d'inverno non succedeva|non succedeva/i.test(
  orch.extractUserExclusions("Dopo 10 minuti scatta il magnetotermico. D'inverno non succedeva.")),
  "caso 6: 'd'inverno non succedeva' — qualcosa è cambiato");
ok(/quando piove/i.test(
  orch.extractUserExclusions("Il differenziale scatta quando piove forte. Coincidenza?")),
  "caso 9: 'quando piove' — condizione che innesca");
ok(/staccando di volta in volta/i.test(
  orch.extractUserExclusions("Staccando di volta in volta tutti i fili sono riuscito a trovare quello incriminato.")),
  "caso 16: prova di sezionamento già eseguita");

// La proprietà che conta più di tutte: su frasi vere non si uccide la causa vera.
function paroleChiave(t) {
  return String(t || "").toLowerCase()
    .replace(/[àáâä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
    .replace(/[òóôö]/g, "o").replace(/[ùúûü]/g, "u")
    .replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(function (w) { return w.length > 4; });
}
function descriveStessaCausa(label, causaReale) {
  var pc = paroleChiave(causaReale);
  var pl = paroleChiave(label);
  return pc.filter(function (w) { return pl.indexOf(w) >= 0; }).length >= 2;
}

var uccisioniSbagliate = [];
casiIt.forEach(function (c) {
  var cs = caseWith(c.domanda, [c.causa_reale]);
  // Due ipotesi di contorno, così la valvola di sicurezza non maschera il test
  cs.hypotheses.push({
    label: "Ipotesi di contorno A", reason: "", status: "active", confidence: "possible",
    source: "test", catena: [], confirm_tests: [], deny_tests: [], supporting_evidence: []
  });
  cs.hypotheses.push({
    label: "Ipotesi di contorno B", reason: "", status: "active", confidence: "possible",
    source: "test", catena: [], confirm_tests: [], deny_tests: [], supporting_evidence: []
  });
  orch.killImpossible(cs);
  var vera = cs.hypotheses[0];
  if (vera.status === "rejected" && /^KR-/.test(vera.rejection_reason || "") &&
      descriveStessaCausa(vera.label, c.causa_reale)) {
    uccisioniSbagliate.push(c.id + ": " + vera.rejection_reason);
  }
});
ok(uccisioniSbagliate.length === 0,
  "nessuna causa vera uccisa sui casi reali" +
  (uccisioniSbagliate.length ? " — " + uccisioniSbagliate.join(" | ") : ""));

console.log("\n" + new Array(61).join("="));
console.log("KILL RULES: " + passed + " passed, " + failed + " failed");
console.log(new Array(61).join("="));
process.exit(failed > 0 ? 1 : 0);
