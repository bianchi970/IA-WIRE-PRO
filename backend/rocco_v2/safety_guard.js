"use strict";

var diagnosticEngine = require("../engine/diagnosticEngine");
var knowledge = require("../knowledge");

function mapHypotheses(values) {
  return (Array.isArray(values) ? values : []).map(function (item) {
    return {
      label: String(item && (item.causa || item.label || item.text) || "").trim(),
      reason: String(item && (item.perche || item.reason || item.family) || "").trim(),
      source: "legacy_safety_evidence"
    };
  }).filter(function (item) {
    return item.label;
  });
}

// Le letture strumentali che non hanno un numero.
//
// `extractedValues` del motore estrae VALORI: dove l'elettricista riferisce
// l'ESITO di una prova senza una cifra, nel seme non arrivava niente. La
// prova di continuità è il caso tipico — e il corpus la prescrive su
// FORUM-IT-003 come verifica discriminante ("misura continuità del cavo
// dalla cassetta alla presa"): la risposta vera di un elettricista è "il
// buzzer non suona", non un numero di ohm. Il dato arrivava e si fermava
// qui, prima di qualunque lettore.
//
// Sta in questo modulo e non in `tools/recognition_tool.js` per una ragione
// di ordine dei passi: il riconoscitore gira al passo `tool`, **dopo** le
// regole di conferma e di esclusione — una misura che arriva lì non viene
// letta da nessuna regola in quel giro. Il seme della percezione è questo.
//
// Due scelte deliberate:
//  - **nessun valore inventato**: `value` porta la parola, non uno zero.
//    Scrivere "0 Ω" per "nessuna continuità" direbbe l'opposto di quello che
//    l'utente ha letto (continuità assente = resistenza alta).
//    `buildEvidenceContext` scarta i non numerici da `measures`, e il `raw`
//    resta leggibile fra le prove, dove CF-07 lo cerca.
//  - **solo l'esito negativo**, che ha un lettore. Registrare anche la
//    continuità presente, che nessuna regola legge, sarebbe il difetto
//    ricorrente di questo codice: un dato calcolato e mai letto.
var LETTURE_SENZA_NUMERO = [
  { type: "continuita", value: "assente",
    re: /(?:nessuna|assenza di|niente|zero)\s+continuit[àa]|continuit[àa]\s+(?:assente|interrotta|non riscontrata)|non\s+c[’']?\s*[eè]\s+continuit[àa]|(?:buzzer|cicalino)\s+non\s+suona/i,
    raw: "prova di continuità: nessuna continuità sul conduttore" }
];

function letturePerEsito(message) {
  var testo = String(message == null ? "" : message);
  var out = [];
  LETTURE_SENZA_NUMERO.forEach(function (l) {
    if (l.re.test(testo)) out.push({ type: l.type, value: l.value, raw: l.raw });
  });
  return out;
}

function run(input) {
  var payload = input || {};
  var libraries = knowledge.getLoadedKnowledge();
  var diag = diagnosticEngine.analyzeTechnicalRequest({
    message: payload.message,
    hasImage: !!payload.has_image
  }, libraries);
  var internal = diag && diag._roccoInternal ? diag._roccoInternal : {};
  var safety = internal.safetyDecision || {};
  var decisionPolicy = internal.decisionPolicy || {};
  var facts = Array.isArray(internal.facts) ? internal.facts : [];
  var factLabels = facts.map(function (fact) {
    if (!fact) return "";
    if (fact.normalizedName) return fact.normalizedName;
    if (fact.name) return fact.name;
    if (fact.type) return fact.type;
    return "";
  }).filter(Boolean);

  // Le misure del seme in un posto solo: la riga era scritta due volte,
  // identica, in `tool_result` e in `seed`.
  var misure = (diag && Array.isArray(diag.extractedValues) ? diag.extractedValues : [])
    .slice(0, 8).concat(letturePerEsito(payload.message));

  return Promise.resolve({
    tool_result: {
      tool_name: "safety_guard",
      ok: true,
      evidence: (diag && Array.isArray(diag.osservazioni) ? diag.osservazioni : []).slice(0, 8),
      measurements: misure,
      warnings: (diag && Array.isArray(diag.rischi) ? diag.rischi : []).slice(0, 8),
      summary: diag && diag.conclusione ? diag.conclusione : "",
      raw_ref: {
        isTechnical: !!(diag && diag.isTechnical),
        isDangerous: !!(diag && diag.isDangerous),
        matchedPatterns: diag && diag.matchedPatterns ? diag.matchedPatterns : [],
        matchedComponents: diag && diag.matchedComponents ? diag.matchedComponents : []
      }
    },
    safety: {
      level: String(safety.level || "safe"),
      reasons: Array.isArray(safety.reasons) ? safety.reasons.slice(0, 6) : [],
      blocked_actions: Array.isArray(decisionPolicy.blockedActions) ? decisionPolicy.blockedActions.slice(0, 6) : [],
      allowed_next_step: String(decisionPolicy.allowedNextStep || "")
    },
    seed: {
      fenomeno_osservato: internal.caseState && internal.caseState.observedDomains && internal.caseState.observedDomains[0] ? internal.caseState.observedDomains[0] : null,
      problem_summary: payload.message,
      facts_confirmed: factLabels.slice(0, 10),
      facts_uncertain: (diag && Array.isArray(diag.rischi) ? diag.rischi : []).slice(0, 6),
      measurements: misure,
      components_detected: diag && Array.isArray(diag.matchedComponents) ? diag.matchedComponents.slice(0, 8) : [],
      visual_findings: [],
      hypotheses_active: mapHypotheses(diag && diag.ipotesi),
      missing_critical_data: (!diag || !diag.ipotesi || !diag.ipotesi.length) ? ["Servono piu dati tecnici o misure per confermare la causa."] : []
    }
  });
}

module.exports = {
  run: run,
  // Esportata per i test: la lettura senza numero è una regola di
  // percezione, e in questo repo ogni regola ha una prova.
  letturePerEsito: letturePerEsito
};
