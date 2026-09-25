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

  return Promise.resolve({
    tool_result: {
      tool_name: "safety_guard",
      ok: true,
      evidence: (diag && Array.isArray(diag.osservazioni) ? diag.osservazioni : []).slice(0, 8),
      measurements: (diag && Array.isArray(diag.extractedValues) ? diag.extractedValues : []).slice(0, 8),
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
      domain: internal.caseState && internal.caseState.observedDomains && internal.caseState.observedDomains[0] ? internal.caseState.observedDomains[0] : null,
      problem_summary: payload.message,
      facts_confirmed: factLabels.slice(0, 10),
      facts_uncertain: (diag && Array.isArray(diag.rischi) ? diag.rischi : []).slice(0, 6),
      measurements: (diag && Array.isArray(diag.extractedValues) ? diag.extractedValues : []).slice(0, 8),
      components_detected: diag && Array.isArray(diag.matchedComponents) ? diag.matchedComponents.slice(0, 8) : [],
      visual_findings: [],
      hypotheses_active: mapHypotheses(diag && diag.ipotesi),
      missing_critical_data: (!diag || !diag.ipotesi || !diag.ipotesi.length) ? ["Servono piu dati tecnici o misure per confermare la causa."] : []
    }
  });
}

module.exports = {
  run: run
};
