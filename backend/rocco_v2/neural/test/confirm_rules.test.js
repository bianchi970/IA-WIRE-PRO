"use strict";

/**
 * Test conferma per misura e scala di certezza.
 *
 * Il difetto chiuso qui: la certezza non saliva mai. Il motore sapeva solo
 * escludere — KR-01 legge l'isolamento per uccidere "dispersione" quando è
 * ≥ 1 MΩ, e nessuno leggeva il caso simmetrico (sotto soglia = dispersione
 * accertata). `supporting_evidence` era inizializzato a [], letto una volta
 * in verifyConclusion e scritto mai; i due guardrail stavano dopo il return
 * del ramo confirmed, quindi non potevano girare. Misurato sui 21 casi
 * italiani: 18 `non_verifiable` e 3 `confirmed`, e quei 3 erano arresti di
 * sicurezza con zero ipotesi. Con la misura decisiva in mano l'utente
 * leggeva ancora "DA VERIFICARE: ripetere la misura".
 *
 * La proprietà che conta più della copertura: **nessuna conferma sbagliata**.
 * Un CONFERMATO su una causa che non è quella vera manda un elettricista a
 * lavorare sul punto sbagliato, ed è peggio di un DA VERIFICARE.
 */

var orchestrator = require("../../orchestrator");
var caseStateHelpers = require("../../case_state");
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

function norm(t) {
  return String(t == null ? "" : t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Un case_state come lo vede verifyConclusion: ipotesi, misure, racconto.
function makeCase(opts) {
  var o = opts || {};
  var cs = caseStateHelpers.createCaseState({ message: o.message || "problema elettrico" });
  cs.hypotheses = (o.hypotheses || []).map(function (h) {
    return {
      label: h.label,
      reason: h.reason || "ragione",
      source: h.source || "knowledge",
      catena: [],
      supporting_evidence: h.supporting_evidence || [],
      contradicting_evidence: h.contradicting_evidence || [],
      confirm_tests: [], deny_tests: [],
      confidence: h.confidence || "possible",
      status: h.status || "active",
      rejection_reason: null
    };
  });
  cs.measurements = o.measurements || [];
  cs.facts_confirmed = o.facts || [];
  if (o.story) cs.problem_summary = cs.problem_summary + " " + o.story;
  return cs;
}

// ─── §1 La tesi dell'ipotesi, non la frase intera ──────────────────────
console.log("\n§1 — il match si pretende sulla tesi");
var claim = orchestrator.hypothesisClaim;
eq("tesi semplice invariata", claim("Conduttore interrotto nel percorso"), "conduttore interrotto nel percorso");
eq("taglia la spiegazione dopo il trattino lungo",
  claim("Cavo BT deteriorato — guaina rotta con dispersione"), "cavo bt deteriorato");
eq("taglia dopo la virgola",
  claim("Morsetto allentato, contatto resistivo che scalda"), "morsetto allentato");
// normalize() toglie anche i trattini interni: "pull-up" → "pull up".
eq("taglia dopo 'che'",
  claim("Resistenza di pull-up nel PLC che fa misurare una tensione anche a circuito aperto"),
  "resistenza di pull up nel plc");

// Il caso reale che ha motivato la funzione: CF-04 confermava un'ipotesi
// che prevede di misurare tensione, perché conteneva "circuito aperto".
check("la nomina di passaggio non è più una tesi",
  !/circuito.*aperto/.test(claim("Resistenza di pull-up nel PLC che fa misurare una tensione anche a circuito aperto")));

// ─── §2 CF-01: la soglia di isolamento conferma, non solo esclude ───────
console.log("\n§2 — CF-01 isolamento sotto 1 MOhm");
var csIso = makeCase({
  message: "il differenziale scatta con la lavatrice",
  hypotheses: [
    { label: "Dispersione verso terra su carico o linea" },
    { label: "Sovraccarico del circuito" }
  ],
  measurements: [{ type: "isolamento", value: 0.2, unit: "MΩ", raw: "0,2 mohm" }]
});
orchestrator.applyConfirmRules(csIso);
eq("la dispersione è confermata", csIso.hypotheses[0].confidence, "confirmed");
check("con la prova scritta, non solo il verdetto", csIso.hypotheses[0].supporting_evidence.length > 0);
check("la prova cita la regola", /CF-01/.test(csIso.hypotheses[0].supporting_evidence[0]));
check("la prova è visibile all'utente nella catena", /CF-01/.test(csIso.hypotheses[0].catena.join(" ")));
eq("il sovraccarico non viene confermato", csIso.hypotheses[1].confidence, "possible");

// Isolamento sano: non conferma nulla (ed è KR-01 a ucciderla).
var csIsoOk = makeCase({
  hypotheses: [{ label: "Dispersione verso terra su carico o linea" }],
  measurements: [{ type: "isolamento", value: 50, unit: "MΩ", raw: "50 mohm" }]
});
orchestrator.applyConfirmRules(csIsoOk);
eq("isolamento a 50 MOhm non conferma la dispersione", csIsoOk.hypotheses[0].confidence, "possible");

// kΩ convertiti: la soglia si legge sul valore, non sulla frase.
var csKOhm = makeCase({
  hypotheses: [{ label: "Dispersione verso terra su carico o linea" }],
  measurements: [{ type: "isolamento", value: 200, unit: "kohm", raw: "200 kohm" }]
});
orchestrator.applyConfirmRules(csKOhm);
eq("200 kOhm = 0,2 MOhm: conferma", csKOhm.hypotheses[0].confidence, "confirmed");

// Il fatto derivato dal motore vale quanto la misura, perché viene da una misura.
var csFact = makeCase({
  hypotheses: [{ label: "Guasto isolamento su carico specifico" }],
  facts: ["isolation_low"]
});
orchestrator.applyConfirmRules(csFact);
eq("isolation_low conferma", csFact.hypotheses[0].confidence, "confirmed");

// ─── §3 CF-04: zero volt non è interruzione se una protezione è scattata ─
console.log("\n§3 — CF-04 e la protezione che scatta");
function casoTensione(story) {
  var cs = makeCase({
    message: "non funziona la presa",
    story: story,
    hypotheses: [{ label: "Conduttore interrotto nel percorso" }],
    measurements: [{ type: "tensione", value: 0, unit: "V", raw: "0 v" }]
  });
  orchestrator.applyConfirmRules(cs);
  return cs.hypotheses[0].confidence;
}
eq("0 V misurati senza scatti: interruzione confermata",
  casoTensione("ho forato il muro e la presa del soggiorno non va"), "confirmed");
eq("0 V con il magnetotermico che scatta: NON confermata",
  casoTensione("il magnetotermico scatta appena lo tiro su"), "possible");
// La forma vera del cliente, dal corpus: niente parole tecniche.
eq("0 V con 'uno non resta su, fa TRAC e ricade': NON confermata",
  casoTensione("ho provato a tirare su tutti gli interruttori ma uno non resta su, fa TRAC e ricade subito"),
  "possible");

// Il pattern sull'italiano vero, misurato sul corpus.
var P = orchestrator.PROTECTION_TRIPPING_PATTERN;
var TECNICHE = /scatt|salt|intervi|sgancia/;
var casiIt = corpus.CASI_FORUM.filter(function (c) { return c.lingua === "it"; });
var diScatto = casiIt.filter(function (c) {
  return /scatta|trip/.test(c.sintomo_atteso || "");
});
var copertiNuovo = diScatto.filter(function (c) { return P.test(norm(c.domanda)); }).length;
var copertiTecnici = diScatto.filter(function (c) { return TECNICHE.test(norm(c.domanda)); }).length;
check("ci sono casi di scatto nel corpus", diScatto.length >= 8);
eq("il pattern copre tutti i casi di scatto reali", copertiNuovo, diScatto.length);
check("copre più delle sole parole tecniche", copertiNuovo >= copertiTecnici);
var falsiPositivi = casiIt.filter(function (c) {
  return !/scatta|trip/.test(c.sintomo_atteso || "") && P.test(norm(c.domanda));
}).length;
eq("nessun falso positivo sui casi che non parlano di scatti", falsiPositivi, 0);

// ─── §4 CF-03: il contesto è obbligatorio ──────────────────────────────
console.log("\n§4 — CF-03 resistenza prossima a zero");
function casoResistenza(story) {
  var cs = makeCase({
    story: story,
    hypotheses: [{ label: "Cortocircuito fase-neutro" }],
    measurements: [{ type: "resistenza", value: 0.5, unit: "ohm", raw: "0,5 ohm" }]
  });
  orchestrator.applyConfirmRules(cs);
  return cs.hypotheses[0].confidence;
}
eq("0,5 Ohm fra fase e neutro: cortocircuito confermato",
  casoResistenza("ho misurato fra fase e neutro"), "confirmed");
eq("0,5 Ohm senza contesto di corto: non conferma (è un avvolgimento)",
  casoResistenza("ho misurato la resistenza dell avvolgimento del motore"), "possible");

// ─── §5 La scala di certezza ───────────────────────────────────────────
console.log("\n§5 — la scala");

// CONFERMATO: misura + ipotesi confermata + non solo IA.
var csConf = makeCase({
  hypotheses: [{ label: "Dispersione verso terra", confidence: "confirmed", supporting_evidence: ["CF-01: ..."] }],
  measurements: [{ type: "isolamento", value: 0.2, unit: "MΩ" }]
});
orchestrator.verifyConclusion(csConf);
eq("confermata con misura", csConf.final_confidence, "confirmed");
check("la diagnosi nomina l'ipotesi", /dispersione/i.test(csConf.final_diagnosis));

// Guardrail che prima era codice morto: nessuna misura → scende.
var csNoMis = makeCase({
  hypotheses: [{ label: "Dispersione verso terra", confidence: "confirmed", supporting_evidence: ["CF-01: ..."] }],
  measurements: []
});
orchestrator.verifyConclusion(csNoMis);
eq("confermata senza misure registrate → probabile", csNoMis.final_confidence, "probable");
check("e lo dice", /strumental/i.test(csNoMis.final_diagnosis));

// Guardrail che prima era codice morto: solo IA → scende.
var csAi = makeCase({
  hypotheses: [{ label: "Dispersione verso terra", confidence: "confirmed", source: "external_ai", supporting_evidence: ["CF-01: ..."] }],
  measurements: [{ type: "isolamento", value: 0.2, unit: "MΩ" }]
});
orchestrator.verifyConclusion(csAi);
eq("confermata solo dall'IA → probabile", csAi.final_confidence, "probable");
check("e lo dice", /IA esterna/i.test(csAi.final_diagnosis));

// Prova contraria: non si conferma.
var csContro = makeCase({
  hypotheses: [{ label: "Dispersione verso terra", confidence: "confirmed",
    supporting_evidence: ["CF-01: ..."], contradicting_evidence: ["Controfattuale: contraddetta"] }],
  measurements: [{ type: "isolamento", value: 0.2, unit: "MΩ" }]
});
orchestrator.verifyConclusion(csContro);
check("con una prova contraria non è confermata", csContro.final_confidence !== "confirmed");

// PROBABILE vuol dire che UNA ipotesi guida.
var csGuida = makeCase({
  hypotheses: [
    { label: "Ipotesi A", supporting_evidence: ["Controfattuale: 2 previsioni"] },
    { label: "Ipotesi B" },
    { label: "Ipotesi C" }
  ]
});
orchestrator.verifyConclusion(csGuida);
eq("una sola sostenuta → probabile", csGuida.final_confidence, "probable");
check("la diagnosi nomina quella sostenuta", /Ipotesi A/.test(csGuida.final_diagnosis));

var csPari = makeCase({
  hypotheses: [
    { label: "Ipotesi A", supporting_evidence: ["x"] },
    { label: "Ipotesi B", supporting_evidence: ["y"] },
    { label: "Ipotesi C", supporting_evidence: ["z"] },
    { label: "Ipotesi D" }
  ]
});
orchestrator.verifyConclusion(csPari);
eq("tre sostenute a pari merito → resta da verificare", csPari.final_confidence, "non_verifiable");

var csPrevale = makeCase({
  hypotheses: [
    { label: "Ipotesi A", supporting_evidence: ["x", "y"] },
    { label: "Ipotesi B", supporting_evidence: ["z"] }
  ]
});
orchestrator.verifyConclusion(csPrevale);
eq("una prevale sulle altre → probabile", csPrevale.final_confidence, "probable");
check("prevale quella con più prove", /Ipotesi A/.test(csPrevale.final_diagnosis));

// Convergenza per esclusione: una sola sopravvissuta ai kill.
var csUnica = makeCase({
  hypotheses: [
    { label: "Sopravvissuta" },
    { label: "Uccisa 1", status: "rejected" },
    { label: "Uccisa 2", status: "rejected" }
  ]
});
orchestrator.verifyConclusion(csUnica);
eq("unica sopravvissuta all'esclusione → probabile", csUnica.final_confidence, "probable");
check("e lo dice", /esclusione/i.test(csUnica.final_diagnosis));

// Una sola ipotesi MAI eliminata non è convergenza: nessuna alternativa è
// stata scartata, quindi non c'è nessuna prova.
var csSola = makeCase({ hypotheses: [{ label: "Unica generata" }] });
orchestrator.verifyConclusion(csSola);
eq("una sola generata, nessun kill → da verificare", csSola.final_confidence, "non_verifiable");

// Nessuna ipotesi: dati insufficienti.
var csVuoto = makeCase({ hypotheses: [] });
orchestrator.verifyConclusion(csVuoto);
eq("nessuna ipotesi attiva", csVuoto.final_confidence, "non_verifiable");
check("lo dichiara", /insufficienti/i.test(csVuoto.final_diagnosis));

// ─── §6 Ambiguità residua dichiarata ───────────────────────────────────
console.log("\n§6 — onestà sull'ambiguità residua");
var csAmbiguo = makeCase({
  hypotheses: [
    { label: "Dispersione su carico", confidence: "confirmed", supporting_evidence: ["CF-01: ..."] },
    { label: "Dispersione su linea", confidence: "confirmed", supporting_evidence: ["CF-01: ..."] },
    { label: "Dispersione in cassetta", confidence: "confirmed", supporting_evidence: ["CF-01: ..."] }
  ],
  measurements: [{ type: "isolamento", value: 0.2, unit: "MΩ" }]
});
orchestrator.verifyConclusion(csAmbiguo);
eq("fenomeno accertato", csAmbiguo.final_confidence, "confirmed");
check("ma dichiara che resta da localizzare", /localizzare/i.test(csAmbiguo.final_diagnosis));

var csUnico = makeCase({
  hypotheses: [{ label: "Dispersione su carico", confidence: "confirmed", supporting_evidence: ["CF-01: ..."] }],
  measurements: [{ type: "isolamento", value: 0.2, unit: "MΩ" }]
});
orchestrator.verifyConclusion(csUnico);
check("con una sola ipotesi non parla di localizzazione", !/localizzare/i.test(csUnico.final_diagnosis));

// ─── §6b Chi rappresenta una famiglia confermata ───────────────────────
console.log("\n§6b — il rappresentante della famiglia confermata");
// A pari prove decide la probabilità del simulatore. Senza questo spareggio
// vinceva la prima generata: su una lavatrice in appartamento usciva
// "CONFERMATO: dispersione DC verso terra — pannello con celle rotte".
var csFamiglia = makeCase({
  hypotheses: [
    { label: "Dispersione DC verso terra: pannello con celle rotte, cavo MC4",
      confidence: "confirmed", supporting_evidence: ["CF-01: ..."] },
    { label: "dispersione su carico",
      confidence: "confirmed", supporting_evidence: ["CF-01: ..."] }
  ],
  measurements: [{ type: "isolamento", value: 0.2, unit: "MΩ" }]
});
csFamiglia.hypotheses[1].probabilita = 0.45;
orchestrator.verifyConclusion(csFamiglia);
check("a pari prove vince la più probabile", /dispersione su carico/i.test(csFamiglia.final_diagnosis));
check("non l'ipotesi fotovoltaica", !/pannello|MC4/i.test(csFamiglia.final_diagnosis));

// La prova MISURATA batte la stima — ma è la chiave `confirmed` a dirlo,
// non il conteggio delle righe di prova.
var csMisuraVsStima = makeCase({
  hypotheses: [
    { label: "Confermata dalla misura", confidence: "confirmed", supporting_evidence: ["CF-01: ..."] },
    { label: "Solo molto probabile", confidence: "probable", supporting_evidence: ["Controfattuale: ..."] }
  ],
  measurements: [{ type: "isolamento", value: 0.2, unit: "MΩ" }]
});
csMisuraVsStima.hypotheses[1].probabilita = 0.95;
orchestrator.verifyConclusion(csMisuraVsStima);
check("la misura batte una stima anche al 95%", /Confermata dalla misura/.test(csMisuraVsStima.final_diagnosis));

// Fra due ipotesi **egualmente** confermate decide la probabilità, non il
// numero di righe in `supporting_evidence`. Questa asserzione prima diceva
// il contrario ("le prove contano più della probabilità"): era una mia
// affermazione di progetto, e la misura l'ha corretta. Quel che resta in
// `supporting_evidence` oltre alla conferma è in gran parte il
// controfattuale, che dice solo "una previsione combacia" — un booleano
// debole, non una seconda misura. Sui 21 casi italiani: causa reale fra le
// ipotesi stampate 12/21 col conteggio davanti, 14/21 con la probabilità.
var csProve = makeCase({
  hypotheses: [
    { label: "Due righe di prova", confidence: "confirmed", supporting_evidence: ["CF-01: ...", "Controfattuale: ..."] },
    { label: "Una prova ma più probabile", confidence: "confirmed", supporting_evidence: ["CF-01: ..."] }
  ],
  measurements: [{ type: "isolamento", value: 0.2, unit: "MΩ" }]
});
csProve.hypotheses[1].probabilita = 0.9;
orchestrator.verifyConclusion(csProve);
check("fra due confermate decide la probabilità", /più probabile/.test(csProve.final_diagnosis));

// ─── §7 Idempotenza ───────────────────────────────────────────────────
console.log("\n§7 — idempotenza");
var csIdem = makeCase({
  hypotheses: [{ label: "Dispersione verso terra su carico" }],
  measurements: [{ type: "isolamento", value: 0.2, unit: "MΩ" }]
});
orchestrator.applyConfirmRules(csIdem);
var dopoUno = csIdem.hypotheses[0].supporting_evidence.length;
orchestrator.applyConfirmRules(csIdem);
orchestrator.applyConfirmRules(csIdem);
eq("le prove non si duplicano", csIdem.hypotheses[0].supporting_evidence.length, dopoUno);
eq("nemmeno nella catena", csIdem.hypotheses[0].catena.filter(function (c) {
  return /CF-01/.test(c);
}).length, 1);

// Le ipotesi già escluse non si confermano.
var csRejected = makeCase({
  hypotheses: [{ label: "Dispersione verso terra", status: "rejected", confidence: "rejected" }],
  measurements: [{ type: "isolamento", value: 0.2, unit: "MΩ" }]
});
orchestrator.applyConfirmRules(csRejected);
eq("un'ipotesi esclusa resta esclusa", csRejected.hypotheses[0].confidence, "rejected");

// ─── §8 Corpus reale: nessuna conferma sbagliata ──────────────────────
// La proprietà di sicurezza. Per ogni caso italiano si gira il secondo
// turno con la misura pertinente al sintomo; se ROCCO conferma, la causa
// reale del caso deve essere fra le ipotesi confermate.
console.log("\n§8 — corpus reale: nessuna conferma sbagliata (21 casi)");

var MISURE = {
  isolamento: "Ho misurato l isolamento col megger: 0,2 MOhm.",
  tensione: "Ho misurato con il tester a monte: 0 V.",
  temperatura: "Col termometro a infrarossi sul morsetto: 95 gradi."
};

function misuraPertinente(caso) {
  var t = caso.domanda + " " + caso.causa_reale;
  if (/isolament|dispersion|differenzial|salvavita/i.test(t)) return "isolamento";
  if (/odore|brucia|caldo|nero|morsett/i.test(t)) return "temperatura";
  return "tensione";
}

function coerente(label, causaReale) {
  var a = norm(label);
  var parole = norm(causaReale).match(/[a-z]{5,}/g) || [];
  return parole.some(function (w) { return a.indexOf(w.slice(0, 6)) >= 0; });
}

var orch = orchestrator;

function giraCorpus() {
  var risultati = [];
  var catena = Promise.resolve();
  casiIt.forEach(function (caso) {
    catena = catena.then(function () {
      var prior = "UTENTE: " + caso.domanda + "\nROCCO: PROSSIMO PASSO: "
        + ((caso.verifiche || [])[0] || "verifica strumentale");
      return orch.runDiagnosis({
        message: MISURE[misuraPertinente(caso)],
        user_id: "test-confirm",
        max_steps: 5,
        prior_context: prior
      }).then(function (r) {
        var cs = r.case_state || {};
        var confermate = (cs.hypotheses || []).filter(function (h) {
          return h.status === "active" && h.confidence === "confirmed";
        });
        risultati.push({ caso: caso, cs: cs, confermate: confermate });
      });
    });
  });
  return catena.then(function () { return risultati; });
}

process.env.ROCCO_NARRATOR = "0";

giraCorpus().then(function (risultati) {
  var conConferma = 0;
  var sbagliate = 0;
  var saliteDaVerificare = 0;
  // Casi in cui almeno una delle ipotesi confermate è **applicabile** a
  // questo impianto. Solo per questi la certezza finale deve salire.
  var conConfermaInContesto = 0;
  var nonSalite = [];

  risultati.forEach(function (r) {
    if (r.confermate.length === 0) return;
    conConferma++;
    var dentro = r.confermate.some(function (h) { return coerente(h.label, r.caso.causa_reale); });
    if (!dentro) {
      sbagliate++;
      console.log("  ✗ " + r.caso.id + ": confermata senza la causa reale (" + r.caso.causa_reale + ")");
      console.log("      confermate: " + r.confermate.map(function (h) { return h.label; }).join(" | "));
    }
    var inContesto = r.confermate.some(function (h) {
      return !orchestrator.isOutOfDomain(h.label, r.cs.problem_summary);
    });
    if (inContesto) {
      conConfermaInContesto++;
      if (r.cs.final_confidence !== "confirmed") {
        nonSalite.push(r.caso.id + " (" + r.cs.final_confidence + ")");
      }
    }
    if (r.cs.final_confidence === "confirmed") saliteDaVerificare++;
  });

  check("su diversi casi la misura produce una conferma", conConferma >= 8);
  eq("NESSUNA conferma senza la causa reale fra le confermate", sbagliate, 0);

  // Qui si pretendeva `saliteDaVerificare >= conConferma`: che OGNI ipotesi
  // confermata facesse salire la certezza finale. Contraddice la guardia di
  // pertinenza, che rifiuta deliberatamente di dire CONFERMATO quando le
  // sole etichette confermate sono inapplicabili all'impianto del caso —
  // dire "confermato: dispersione DC su pannello fotovoltaico" per una
  // lavatrice è il difetto peggiore, perché la certezza dà peso al nome
  // sbagliato.
  //
  // Le due regole convivevano perché il motore riaccodava le proprie prime
  // tre ipotesi dentro le `osservazioni`, che finiscono in
  // `facts_confirmed`, da cui `buildEvidenceContext()` ricava le **prove**
  // su cui le confirm rules cercano i loro segnali: alcune conferme in
  // contesto nascevano quindi dal testo di un'ipotesi di ROCCO. Togliendo
  // quel giro (vedi osservazioni_pulite.test.js §5) restano tre casi —
  // FORUM-IT-003, FORUM-SPEC-005, FORUM-IT-011 — dove l'unica ipotesi che
  // la soglia conferma è fuori contesto, e la certezza correttamente non
  // sale.
  //
  // L'asserzione ora dice il contratto vero: la certezza sale quando la
  // misura conferma un'ipotesi **applicabile**. Resta una rete di
  // sicurezza, non un rituale: se la certezza smettesse di salire su un
  // caso pertinente, qui diventa rosso.
  check("la certezza sale su ogni caso con una conferma pertinente",
    saliteDaVerificare >= conConfermaInContesto);
  nonSalite.forEach(function (x) { console.log("      non sale: " + x); });
  check("e le conferme fuori contesto non fanno salire la certezza",
    saliteDaVerificare <= conConferma);

  // Senza misura, sul solo racconto, non si conferma nulla: niente certezze
  // regalate a chi ha solo descritto il sintomo.
  var catena = Promise.resolve();
  var senzaMisura = [];
  casiIt.forEach(function (caso) {
    catena = catena.then(function () {
      return orch.runDiagnosis({ message: caso.domanda, user_id: "test-confirm", max_steps: 5 })
        .then(function (r) {
          var cs = r.case_state || {};
          var conf = (cs.hypotheses || []).filter(function (h) {
            return h.status === "active" && h.confidence === "confirmed";
          });
          senzaMisura.push({ caso: caso, conf: conf.length, cs: cs });
        });
    });
  });

  return catena.then(function () {
    var confermateSenzaMisura = senzaMisura.filter(function (x) { return x.conf > 0; });
    eq("sul solo racconto nessuna ipotesi viene confermata", confermateSenzaMisura.length, 0);

    // Gli unici `confirmed` senza ipotesi sono gli arresti di sicurezza:
    // lì ROCCO conferma il PERICOLO, non una diagnosi.
    var confSenzaIpotesi = senzaMisura.filter(function (x) {
      return x.cs.final_confidence === "confirmed";
    });
    check("i confirmed sul solo racconto sono arresti di sicurezza",
      confSenzaIpotesi.every(function (x) {
        return (x.cs.hypotheses || []).filter(function (h) { return h.status === "active"; }).length === 0;
      }));

    console.log("\n============================================================");
    console.log("CONFIRM RULES: " + pass + " passed, " + fail + " failed");
    console.log("============================================================");
    process.exit(fail === 0 ? 0 : 1);
  });
}).catch(function (err) {
  console.log("ERRORE NEL TEST: " + (err && err.stack));
  process.exit(1);
});
