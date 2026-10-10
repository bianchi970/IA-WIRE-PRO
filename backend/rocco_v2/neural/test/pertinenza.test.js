"use strict";

/**
 * Test pertinenza delle ipotesi.
 *
 * Il difetto chiuso qui: su una lavatrice in appartamento ROCCO esponeva
 * "Dispersione DC verso terra: pannello con celle rotte, bypass diode
 * guasto, cavo MC4" e "Cavo di terra con perdita di isolamento a valle del
 * relè". Misurato sui 21 casi italiani: 42 ipotesi attive su 234
 * appartenevano a una famiglia che il racconto non giustifica, e 5 di esse
 * finivano fra le 4 **stampate** — cioè davanti all'elettricista.
 *
 * Due metriche, entrambe misurate qui sotto sul corpus reale:
 *  - **rumore**: ipotesi fuori contesto fra quelle stampate (era 5, deve
 *    restare 0);
 *  - **copertura**: la causa reale compare fra le ipotesi stampate (era 12
 *    su 21, non deve scendere).
 *
 * La pertinenza è una RETROCESSIONE, non un'esclusione: la famiglia è
 * un'euristica sul linguaggio, non una legge fisica. L'ipotesi resta viva e
 * torna su se l'utente nomina ciò che manca.
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

// Matcher lessicale largo: serve a confrontare prima/dopo sullo stesso
// metro, non a giudicare la correttezza di una singola ipotesi.
function coerente(label, causaReale) {
  var a = norm(label);
  var parole = norm(causaReale).match(/[a-z]{5,}/g) || [];
  return parole.some(function (w) { return a.indexOf(w.slice(0, 6)) >= 0; });
}

function makeCase(opts) {
  var o = opts || {};
  var cs = caseStateHelpers.createCaseState({ message: o.message || "problema elettrico" });
  cs.hypotheses = (o.hypotheses || []).map(function (h) {
    return {
      label: h.label, reason: h.reason || "ragione", source: h.source || "knowledge",
      catena: [], supporting_evidence: h.supporting_evidence || [],
      contradicting_evidence: [], confirm_tests: [], deny_tests: [],
      confidence: h.confidence || "possible", status: "active",
      rejection_reason: null, probabilita: h.probabilita == null ? null : h.probabilita
    };
  });
  cs.measurements = o.measurements || [];
  return cs;
}

// ─── §1 Quando un'ipotesi è fuori contesto ─────────────────────────────
console.log("\n§1 — famiglie e marcatori");

var fuori = orchestrator.isOutOfDomain;

// Fotovoltaico: senza impianto non esiste dispersione DC da pannello.
check("ipotesi FV su una lavatrice in appartamento è fuori contesto",
  fuori("Dispersione DC verso terra: pannello con celle rotte, cavo MC4",
        "il salvavita scatta quando accendo la lavatrice"));
check("la stessa ipotesi su un impianto FV è pertinente",
  !fuori("Dispersione DC verso terra: pannello con celle rotte, cavo MC4",
         "impianto fotovoltaico 4 kW con inverter, il differenziale scatta"));
check("basta che il racconto nomini l'inverter",
  !fuori("Connettori MC4 non agganciati o ossidati",
         "da ieri l'inverter segna errore ISO e non produce"));

// PLC e segnali di comando: non esistono in un appartamento.
check("ipotesi PLC su un impianto domestico è fuori contesto",
  fuori("Resistenza di pull-up nel PLC che fa misurare una tensione",
        "non funziona la presa del soggiorno, le altre vanno"));
check("su una macchina industriale è pertinente",
  !fuori("Mancanza segnale Enable o Run: il drive è in stand-by",
         "la macchina in produzione si ferma e il quadro di comando segnala errore"));

// Commutazione: i marcatori sono larghi per una ragione misurata.
// Un motore, un compressore, una caldaia contengono organi di commutazione
// anche quando il cliente non li nomina.
check("ipotesi su relè con un motore nel racconto è pertinente",
  !fuori("Cavo di terra con perdita di isolamento a valle del relè",
         "ho un motore 2cv di un compressore che fa scattare il differenziale"));
check("ipotesi su contattore con un motore trifase è pertinente",
  !fuori("Contatto del contattore usurato o non chiuso su una fase",
         "ho un motore trifase da 5.5 kW su un compressore, ronza ma non parte"));
check("ipotesi su relè con una caldaia è pertinente",
  !fuori("Bobina relè in cortocircuito o aperta",
         "la caldaia parte e si ferma continuamente, 3-4 cicli al minuto"));
check("relè crepuscolare su luci che si accendono da sole è pertinente",
  !fuori("Tensione residua sul circuito (deviatore/relè con spia luminosa)",
         "le luci del bagno si accendono da sole alle 3 di notte"));
check("ipotesi su relè senza nulla che commuti è fuori contesto",
  fuori("Condensatore di soppressione guasto o mancante sulla bobina del relè",
        "lo scaldabagno elettrico fa saltare il differenziale"));

// La famiglia che ha scattato viene nominata: serve per capire perché.
var fam = orchestrator.outOfDomainFamilies(
  "Dispersione DC verso terra: pannello con celle rotte",
  "il salvavita scatta con la lavatrice");
eq("dice quale famiglia è fuori contesto", fam.join(","), "fotovoltaico");
eq("nessuna famiglia quando è pertinente",
  orchestrator.outOfDomainFamilies("Dispersione verso terra su carico", "il salvavita scatta").length, 0);

// ─── §2 Retrocessione, non esclusione ─────────────────────────────────
console.log("\n§2 — retrocede, non esclude");

var csMisto = makeCase({
  message: "il salvavita scatta quando accendo la lavatrice",
  hypotheses: [
    { label: "Dispersione DC verso terra: pannello con celle rotte, cavo MC4",
      confidence: "confirmed", supporting_evidence: ["CF-01: ..."] },
    { label: "Dispersione verso terra su carico o linea",
      confidence: "possible" }
  ],
  measurements: [{ type: "isolamento", value: 0.2, unit: "MΩ" }]
});

var ordina = orchestrator.makeHypothesisComparator(csMisto);
var ordinate = csMisto.hypotheses.slice().sort(ordina);

check("l'ipotesi pertinente passa davanti a quella fuori contesto",
  /carico o linea/.test(ordinate[0].label));
check("quella fuori contesto non è esclusa, solo retrocessa",
  ordinate.length === 2 && csMisto.hypotheses.every(function (h) { return h.status === "active"; }));

// E il punto che il blocco doveva chiudere: la diagnosi non la nomina.
// Qui l'unica ipotesi che la soglia conferma è quella fotovoltaica, cioè
// inapplicabile: la misura resta un fatto, ma la certezza non sale su
// un'etichetta che non si applica all'impianto — sarebbe la versione
// peggiore del difetto, perché il CONFERMATO darebbe peso al nome sbagliato.
orchestrator.verifyConclusion(csMisto);
eq("con l'unica confermata fuori contesto la certezza scende",
  csMisto.final_confidence, "probable");
check("la diagnosi NON nomina l'ipotesi fotovoltaica",
  !/pannello|MC4/i.test(csMisto.final_diagnosis));
check("nomina invece l'ipotesi pertinente",
  /carico o linea/.test(csMisto.final_diagnosis));
check("e spiega perché non è confermata",
  /non si applica/i.test(csMisto.final_diagnosis));

// Quando una confermata è pertinente, la certezza sale normalmente.
var csConfPertinente = makeCase({
  message: "il salvavita scatta quando accendo la lavatrice",
  hypotheses: [
    { label: "Dispersione DC verso terra: pannello con celle rotte",
      confidence: "confirmed", supporting_evidence: ["CF-01: ..."] },
    { label: "Dispersione verso terra su carico o linea",
      confidence: "confirmed", supporting_evidence: ["CF-01: ..."] }
  ],
  measurements: [{ type: "isolamento", value: 0.2, unit: "MΩ" }]
});
orchestrator.verifyConclusion(csConfPertinente);
eq("con una confermata pertinente la certezza sale",
  csConfPertinente.final_confidence, "confirmed");
check("e la diagnosi nomina quella pertinente",
  /carico o linea/.test(csConfPertinente.final_diagnosis));

// La pertinenza precede la certezza: una conferma per soglia su un'etichetta
// inapplicabile non la fa guidare.
var csSoloFuori = makeCase({
  message: "lo scaldabagno fa saltare il differenziale",
  hypotheses: [
    { label: "Cavo di terra con perdita di isolamento a valle del relè",
      confidence: "confirmed", supporting_evidence: ["CF-01: ..."] },
    { label: "Dispersione verso terra su carico", confidence: "possible" }
  ],
  measurements: [{ type: "isolamento", value: 0.2, unit: "MΩ" }]
});
var ordinate2 = csSoloFuori.hypotheses.slice().sort(orchestrator.makeHypothesisComparator(csSoloFuori));
check("la pertinenza viene prima della conferma per misura",
  /Dispersione verso terra su carico/.test(ordinate2[0].label));

// ─── §3 L'ordine delle chiavi ─────────────────────────────────────────
console.log("\n§3 — ordine delle chiavi");

function primoFra(message, hyps) {
  var cs = makeCase({ message: message, hypotheses: hyps });
  return cs.hypotheses.slice().sort(orchestrator.makeHypothesisComparator(cs))[0].label;
}

eq("fra pertinenti, la confermata prima",
  primoFra("il differenziale scatta", [
    { label: "Ipotesi stimata", probabilita: 0.9 },
    { label: "Ipotesi confermata", confidence: "confirmed", supporting_evidence: ["CF-01"] }
  ]), "Ipotesi confermata");

eq("a pari certezza, la più probabile prima",
  primoFra("il differenziale scatta", [
    { label: "Poco probabile", probabilita: 0.1 },
    { label: "Molto probabile", probabilita: 0.6 }
  ]), "Molto probabile");

eq("senza probabilità decide il controfattuale",
  primoFra("il differenziale scatta", [
    { label: "Solo possibile", confidence: "possible" },
    { label: "Probabile dal controfattuale", confidence: "probable", supporting_evidence: ["Controfattuale"] }
  ]), "Probabile dal controfattuale");

eq("a pari tutto decide il numero di prove",
  primoFra("il differenziale scatta", [
    { label: "Una prova", supporting_evidence: ["a"] },
    { label: "Due prove", supporting_evidence: ["a", "b"] }
  ]), "Due prove");

// ─── §4 Corpus reale: le due metriche ─────────────────────────────────
console.log("\n§4 — corpus reale: rumore e copertura (21 casi)");

process.env.ROCCO_NARRATOR = "0";

var casiIt = corpus.CASI_FORUM.filter(function (c) { return c.lingua === "it"; });
eq("21 casi italiani", casiIt.length, 21);

function ipotesiStampate(answer) {
  var sez = String(answer).split("IPOTESI:")[1] || "";
  sez = sez.split(/\n(?:IPOTESI ESCLUSE|LIVELLO DI CERTEZZA|ANALISI):/)[0];
  return sez.split(/\r?\n/).filter(function (l) { return /^- /.test(l); })
    .map(function (l) { return l.slice(2); });
}

var catena = Promise.resolve();
var esiti = [];
casiIt.forEach(function (caso) {
  catena = catena.then(function () {
    return orchestrator.runDiagnosis({ message: caso.domanda, user_id: "test-pert", max_steps: 5 })
      .then(function (r) {
        esiti.push({ caso: caso, cs: r.case_state, stampate: ipotesiStampate(r.answer) });
      });
  });
});

catena.then(function () {
  var rumore = 0;
  var stampateTot = 0;
  var copertura = 0;
  var vive = 0;

  esiti.forEach(function (e) {
    stampateTot += e.stampate.length;
    e.stampate.forEach(function (label) {
      if (orchestrator.isOutOfDomain(label, e.cs.problem_summary)) {
        rumore++;
        console.log("  ✗ rumore stampato in " + e.caso.id + ": " + label.slice(0, 60));
      }
    });
    if (e.stampate.some(function (l) { return coerente(l, e.caso.causa_reale); })) copertura++;
    var attive = (e.cs.hypotheses || []).filter(function (h) { return h.status === "active"; });
    if (attive.some(function (h) { return coerente(h.label, e.caso.causa_reale); })) vive++;
  });

  console.log("    rumore stampato: " + rumore + "/" + stampateTot + " (era 5)");
  console.log("    causa reale stampata: " + copertura + "/21 (era 12)");
  console.log("    causa reale fra le attive: " + vive + "/21 (era 15)");

  eq("nessuna ipotesi fuori contesto fra quelle stampate", rumore, 0);

  // L'ordine del motore deve essere quello del case_state, non restare
  // locale alla bozza: una seconda `sort` girava dopo verifyConclusion e
  // riordinava per conto proprio, così il narratore — che legge le prime 8
  // di cs.hypotheses — ripescava le ipotesi retrocesse e l'ipotesi
  // fotovoltaica tornava in risposta su una lavatrice.
  var ordineRotto = [];
  esiti.forEach(function (e) {
    var attive = (e.cs.hypotheses || []).filter(function (h) { return h.status === "active"; });
    var vistoFuori = false;
    attive.forEach(function (h) {
      var fuoriQ = orchestrator.isOutOfDomain(h.label, e.cs.problem_summary);
      if (fuoriQ) vistoFuori = true;
      else if (vistoFuori) ordineRotto.push(e.caso.id + ": " + h.label.slice(0, 40));
    });
  });
  eq("nel case_state tutte le pertinenti precedono le fuori contesto", ordineRotto.length, 0);
  ordineRotto.slice(0, 3).forEach(function (x) { console.log("      ordine rotto →", x); });
  check("la copertura non è scesa sotto la baseline", copertura >= 12);
  check("nessuna ipotesi è stata persa: le attive restano quelle di prima", vive >= 15);

  // La retrocessione non deve far sparire ipotesi dal case_state.
  var totaliAttive = esiti.reduce(function (acc, e) {
    return acc + (e.cs.hypotheses || []).filter(function (h) { return h.status === "active"; }).length;
  }, 0);
  check("le ipotesi attive restano molte: nessun massacro", totaliAttive > 150);

  console.log("\n============================================================");
  console.log("PERTINENZA: " + pass + " passed, " + fail + " failed");
  console.log("============================================================");
  process.exit(fail === 0 ? 0 : 1);
}).catch(function (err) {
  console.log("ERRORE NEL TEST: " + (err && err.stack));
  process.exit(1);
});
