"use strict";

/**
 * Test del giro dell'apprendimento: guasto chiuso → esperienza salvata →
 * ROCCO la riusa.
 *
 * Il difetto chiuso qui era una strada interrotta nel mezzo di quel giro.
 * `/api/rocco/close-case` — il bottone "Caso risolto" del frontend —
 * addestrava i pesi neurali e **non salvava il caso**: non in
 * `rocco_v2/memory.js` (i casi chiusi citabili), non nella memoria didattica
 * dell'università. Misurato sul disco: `data/rocco-v2-memory.json` era
 * `{"closed_cases": []}` da sempre.
 *
 * E la cosa non si vedeva perché le due metà si nascondevano a vicenda:
 * `ragionaPerAnalogia()` leggeva i casi chiusi da sempre, trovandone
 * sistematicamente zero. Lettura aperta, scrittura chiusa — il corpus non
 * poteva crescere per costruzione, non perché nessuno usasse ROCCO.
 *
 * **Perché questo test esiste e non una riga nel banco di prova**: il banco
 * fotografa `data/**.json` e lo ripristina prima di ogni caso, per misurare
 * ogni caso sullo stesso motore. Di conseguenza nel banco i casi chiusi sono
 * sempre zero e questa strada è inerte: il banco non vedrebbe né il
 * collegamento né una sua rottura futura.
 *
 * La proprietà che conta più di tutte è l'ultima (§5): **un precedente non
 * fa salire la certezza.** Un caso chiuso è "ho visto", non "so": può
 * ordinare e suggerire, mai affermare. Se un precedente da solo portasse a
 * CONFERMATO, ROCCO manderebbe l'elettricista su un punto perché una volta
 * era quello — che è esattamente l'invenzione che non deve fare.
 */

var fs = require("fs");
var path = require("path");

var orchestrator = require("../../orchestrator");
var memory = require("../../memory");

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
  return String(t == null ? "" : t).toLowerCase();
}

// ── Isolamento dello stato ────────────────────────────────────────────
//
// Il test scrive casi chiusi veri nello store vero. Lo stato va fotografato
// e rimesso come era, altrimenti una corsa di test lascia casi inventati
// nella memoria di produzione — e il caso successivo di Romeo verrebbe
// diagnosticato con precedenti scritti da me.
var FILE_STATO = [];
(function raccogliStato() {
  var dirs = [
    path.join(__dirname, "..", "..", "..", "data"),
    path.join(__dirname, "..", "..", "..", "data", "neural")
  ];
  dirs.forEach(function (d) {
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).forEach(function (f) {
      if (!/\.json$/.test(f)) return;
      var p = path.join(d, f);
      if (fs.statSync(p).isFile()) FILE_STATO.push({ path: p, body: fs.readFileSync(p, "utf8") });
    });
  });
})();

function ripristinaStato() {
  FILE_STATO.forEach(function (s) {
    try { fs.writeFileSync(s.path, s.body, "utf8"); } catch (_e) {}
  });
}

function svuotaCasiChiusi() {
  try {
    fs.writeFileSync(memory.STORE_PATH, JSON.stringify({ version: 1, closed_cases: [] }, null, 2), "utf8");
  } catch (_e) {}
}

// Il caso: quello che un elettricista scrive davvero, e la causa che ha
// trovato. Non una frase di comodo — la forma è quella dei casi italiani di
// casi_reali_forum.js.
var RACCONTO = "Il differenziale salta quando parte la lavatrice. Ho provato a staccare tutto il resto e salta comunque.";
var CAUSA_VERA = "Resistenza di riscaldamento della lavatrice con isolamento degradato verso massa";
var VERIFICA = "Misura di isolamento sulla resistenza scollegata: 0,15 MOhm a impianto fuori tensione";

// Il feedback nella forma che `/api/rocco/close-case` costruisce. Se questa
// forma cambia e il test non lo segue, il test smette di provare la strada
// vera: `validated` e `status` sono la dichiarazione che il bottone è stato
// premuto, e senza di loro `saveValidatedClosedCase` rifiuta il caso.
function feedbackDalBottone() {
  return {
    confirmedCause: CAUSA_VERA,
    diagnosi: CAUSA_VERA,
    componenti: ["differenziale", "lavatrice"],
    come_verificato: VERIFICA,
    decisiveChecks: [VERIFICA],
    validated: true,
    status: "closed"
  };
}

function caseStateDalFrontend() {
  return {
    problem_summary: RACCONTO,
    components_detected: ["differenziale", "lavatrice"],
    facts_confirmed: [],
    hypotheses_active: [],
    final_confidence: "probable"
  };
}

function diagnosi(messaggio, userId) {
  return orchestrator.runDiagnosis({
    message: messaggio,
    user_id: userId || "test_caso_chiuso",
    max_steps: 5
  });
}

function attive(cs) {
  return (cs.hypotheses || []).filter(function (h) { return h.status === "active"; });
}

function trovaPrecedente(cs) {
  var trovata = null;
  attive(cs).forEach(function (h) {
    if (trovata) return;
    if (norm(h.label).indexOf("resistenza di riscaldamento") >= 0) trovata = h;
  });
  return trovata;
}

process.env.ROCCO_NARRATOR = "0"; // si misura la bozza deterministica

console.log("\n============================================================");
console.log("CASO CHIUSO — il giro dell'apprendimento");
console.log("============================================================\n");

svuotaCasiChiusi();

// ═══ 1. Il bottone scrive davvero ═══════════════════════════════════════
console.log("§1 la scrittura");

var salvato = memory.saveValidatedClosedCase(caseStateDalFrontend(), feedbackDalBottone());
check("il caso chiuso viene registrato", salvato.recorded === true);
eq("nessun motivo di rifiuto", salvato.reason, null);

// Il difetto originale, in forma di test: senza `validated` il caso viene
// rifiutato. È la ragione per cui l'endpoint deve dichiararlo — se qualcuno
// lo toglie, qui si rompe e non in produzione sei mesi dopo.
var senzaValidazione = memory.saveValidatedClosedCase(caseStateDalFrontend(), {
  confirmedCause: CAUSA_VERA,
  come_verificato: VERIFICA
});
eq("un feedback senza `validated` viene rifiutato", senzaValidazione.reason, "case_not_validated");

var store = memory.readStore();
eq("sul disco c'è un caso solo", store.closed_cases.length, 1);
eq("la causa accertata è quella del tecnico", store.closed_cases[0].confirmed_cause, CAUSA_VERA);
check("la verifica che ha deciso il caso è salvata",
  store.closed_cases[0].decisive_checks.indexOf(VERIFICA) >= 0);

// ═══ 2. La lettura trova il precedente ══════════════════════════════════
console.log("§2 la lettura");

var simili = memory.findRelevantClosedCases({ problem_summary: RACCONTO }, 3);
check("lo stesso racconto ritrova il caso chiuso", simili.length >= 1);
if (simili.length) {
  eq("la causa ritrovata è quella accertata", simili[0].confirmed_cause, CAUSA_VERA);
  check("la somiglianza supera la soglia di 0,25 di ragionaPerAnalogia", simili[0].match_score >= 0.25);
}

// Un racconto di un altro mestiere non deve pescare questo precedente:
// l'analogia non è "qualcosa che assomiglia a qualcosa".
var estranei = memory.findRelevantClosedCases({
  problem_summary: "Il citofono non suona e il portiere elettrico non apre il cancello."
}, 3);
eq("un guasto estraneo non ritrova il precedente", estranei.length, 0);

// ═══ 3. ROCCO lo riusa, e lo dice ═══════════════════════════════════════
diagnosi(RACCONTO, "test_riuso").then(function (res) {
  console.log("§3 il riuso");

  var cs = res.case_state || res.caseState || {};
  var prec = trovaPrecedente(cs);
  check("il precedente è fra le ipotesi attive", !!prec);

  if (prec) {
    eq("la fonte dichiara il caso validato", prec.source, "caso_validato");
    check("l'ipotesi porta il campo esperienza", !!prec.esperienza);
    check("l'esperienza dichiara quale caso", !!(prec.esperienza && prec.esperienza.caso_id));
    check("la catena dice che è già stato risolto",
      (prec.catena || []).some(function (r) { return norm(r).indexOf("già risolto in un caso chiuso") >= 0; }));
    check("la catena riporta come fu accertato allora",
      (prec.catena || []).some(function (r) { return norm(r).indexOf("allora fu accertata") >= 0; }));
    check("la verifica del caso precedente diventa una verifica proponibile",
      (prec.confirm_tests || []).indexOf(VERIFICA) >= 0);

    // Il punteggio di somiglianza serve all'ordine, non al racconto: nel
    // `reason` stava "score 0.42", un numero da macchina davanti
    // all'elettricista — stessa famiglia degli slug in OSSERVAZIONI.
    check("nessun punteggio grezzo nel testo mostrato",
      !/score\s*[0-9]/.test(norm(prec.reason)) &&
      !(prec.catena || []).some(function (r) { return /score\s*[0-9]/.test(norm(r)); }));
  }

  // `evidenceMeta` è il nome che l'orchestratore usa; `server.js` lo
  // ripubblica come `evidence_meta` nella risposta HTTP. Leggere il nome
  // sbagliato darebbe `undefined` — cioè un test verde su un dato assente,
  // il difetto ricorrente di questo codice in forma di test.
  var meta = res.evidenceMeta || res.evidence_meta || {};
  eq("la risposta dichiara quanti precedenti hanno pesato", meta.casi_chiusi_simili, 1);

  // La bozza stampa le prime 4 ipotesi: perché l'elettricista legga il
  // precedente, il precedente deve essere fra quelle. È la ragione per cui
  // l'esperienza ha una chiave nel comparatore e non solo un campo.
  var testo = String(res.answer || res.response || "");
  check("l'elettricista legge che il caso è già stato risolto",
    norm(testo).indexOf("già risolto in un caso chiuso") >= 0);

  // ═══ 4. Un precedente non sparisce quando il motore concorda ══════════
  console.log("§4 quando le due fonti concordano");

  // `ragiona()` deduplica tenendo la PRIMA ipotesi, e l'analogia è
  // concatenata per ultima: se il motore pensa la stessa causa da sé, il
  // precedente verrebbe scartato e `esperienza` persa proprio nel caso in
  // cui le due fonti concordano — il più forte. Si prova chiudendo un caso
  // con una causa che il motore produce da solo.
  svuotaCasiChiusi();
  var causaChePensaDaSe = null;
  attive(cs).forEach(function (h) {
    if (causaChePensaDaSe) return;
    if (h.source !== "caso_validato" && norm(h.label).indexOf("dispersione") >= 0) causaChePensaDaSe = h.label;
  });

  if (!causaChePensaDaSe) {
    console.log("  (nessuna ipotesi di dispersione dal motore: §4 non applicabile su questo racconto)");
    return null;
  }

  memory.saveValidatedClosedCase(caseStateDalFrontend(), {
    confirmedCause: causaChePensaDaSe,
    come_verificato: VERIFICA,
    decisiveChecks: [VERIFICA],
    validated: true,
    status: "closed"
  });

  return diagnosi(RACCONTO, "test_concordanza").then(function (res2) {
    var cs2 = res2.case_state || res2.caseState || {};
    var doppie = attive(cs2).filter(function (h) {
      return norm(h.label).substring(0, 40) === norm(causaChePensaDaSe).substring(0, 40);
    });
    eq("l'ipotesi non è duplicata nell'elenco", doppie.length, 1);
    check("l'ipotesi del motore riceve il precedente invece di perderlo",
      doppie.length === 1 && !!doppie[0].esperienza);
    check("e porta anche la verifica del caso precedente",
      doppie.length === 1 && (doppie[0].confirm_tests || []).indexOf(VERIFICA) >= 0);
    return cs2;
  });
}).then(function (cs2) {

  // ═══ 5. Il precedente ORDINA, non AFFERMA ════════════════════════════
  console.log("§5 il precedente non fa salire la certezza");

  if (!cs2) return null;

  // Nessuna misura è stata data in questo turno: il racconto è lo stesso di
  // prima. Un precedente, da solo, non può portare a CONFERMATO.
  var conPrecedente = attive(cs2).filter(function (h) { return !!h.esperienza; });
  check("almeno un'ipotesi porta un precedente", conPrecedente.length >= 1);

  var confermateDalPrecedente = conPrecedente.filter(function (h) { return h.confidence === "confirmed"; });
  eq("nessun precedente si auto-conferma", confermateDalPrecedente.length, 0);

  // Le due scale che il precedente non deve toccare: `supporting_evidence`
  // farebbe salire la certezza a `probable` (verifyConclusion la legge per
  // decidere se una ipotesi "guida"), `probabilita` è la scala del
  // simulatore causale. L'esperienza ha una chiave sua nel comparatore.
  // Attenzione a cosa si pretende: un'ipotesi che porta un precedente PUÒ
  // guadagnare prove da altri meccanismi — il controfattuale che valuta una
  // sua previsione, per esempio — e sono prove vere. Quello che il
  // precedente non deve fare è scriversele LUI.
  conPrecedente.forEach(function (h) {
    var proveDalPrecedente = (h.supporting_evidence || []).filter(function (p) {
      return /caso chiuso|precedente|gi. risolto/i.test(String(p));
    });
    eq("il precedente non si scrive prove a sostegno da sé", proveDalPrecedente.length, 0);
  });

  var soloPrecedente = conPrecedente.filter(function (h) { return h.source === "caso_validato"; });
  soloPrecedente.forEach(function (h) {
    eq("un'ipotesi nata da un precedente non porta probabilità da simulatore", h.probabilita, null);
  });

  return null;
}).then(function () {
  ripristinaStato();
  console.log("\n============================================================");
  console.log("CASO CHIUSO: " + pass + " passed, " + fail + " failed");
  console.log("============================================================");
  process.exit(fail === 0 ? 0 : 1);
}).catch(function (err) {
  ripristinaStato();
  console.log("ERRORE NEL TEST: " + (err && err.stack));
  process.exit(1);
});
