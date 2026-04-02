"use strict";

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value === undefined || value === null ? "" : value).toLowerCase();
}

function createBucket(caseType) {
  return {
    caseType: caseType,
    score: 0,
    matchedSignals: []
  };
}

function pushSignal(bucket, signal, weight) {
  if (!bucket || !signal || !weight) return;
  bucket.score += weight;
  if (bucket.matchedSignals.indexOf(signal) < 0) bucket.matchedSignals.push(signal);
}

function hasFactType(facts, type) {
  return ensureArray(facts).some(function (fact) {
    return fact && fact.type === type;
  });
}

function hasFactValue(facts, pattern) {
  return ensureArray(facts).some(function (fact) {
    return pattern.test(normalizeText(fact && fact.value));
  });
}

function topHypothesisMatches(hypotheses, pattern) {
  var topHypothesis = ensureArray(hypotheses)[0] || {};

  return pattern.test(normalizeText([
    topHypothesis.family || "",
    topHypothesis.causa || "",
    topHypothesis.bestCheck || "",
    topHypothesis.verificationNeeded || ""
  ].join(" ")));
}

function checksMatch(checks, pattern) {
  return ensureArray(checks).some(function (check) {
    return pattern.test(normalizeText(check && check.reason));
  });
}

function buildBuckets(params) {
  var facts = ensureArray(params.facts);
  var hypotheses = ensureArray(params.hypotheses);
  var checks = ensureArray(params.diagnosticChecks);
  var caseState = params.caseState || {};
  var safetyDecision = params.safetyDecision || {};
  var buckets = {
    differential_trip: createBucket("differential_trip"),
    overload_trip: createBucket("overload_trip"),
    overheating_or_burnt_contact: createBucket("overheating_or_burnt_contact"),
    no_output_with_input_present: createBucket("no_output_with_input_present")
  };

  if (hasFactType(facts, "burn_signs")) {
    pushSignal(buckets.overheating_or_burnt_contact, "fact:burn_signs", 5);
  }
  if (hasFactType(facts, "temperature_high")) {
    pushSignal(buckets.overheating_or_burnt_contact, "fact:temperature_high", 4);
  }
  if (hasFactType(facts, "domain_bruciato_fumo_odore")) {
    pushSignal(buckets.overheating_or_burnt_contact, "fact:domain_bruciato_fumo_odore", 2);
  }
  if (hasFactValue(facts, /annerit|morsett|contatto|bruciat|surriscald|odore|fumo/)) {
    pushSignal(buckets.overheating_or_burnt_contact, "fact:text_overheating_marker", 2);
  }
  if (checksMatch(checks, /disalimentare|assenza tensione|ispezionare subito il punto surriscaldato/)) {
    pushSignal(buckets.overheating_or_burnt_contact, "check:safe_isolation_or_inspection", 1);
  }
  if (caseState.dominantRisk === "bruciato_fumo_odore") {
    pushSignal(buckets.overheating_or_burnt_contact, "state:dominantRisk_bruciato_fumo_odore", 3);
  }
  if (safetyDecision.level === "stop" && buckets.overheating_or_burnt_contact.score > 0) {
    pushSignal(buckets.overheating_or_burnt_contact, "safety:stop", 1);
  }

  if (hasFactType(facts, "high_current")) {
    pushSignal(buckets.overload_trip, "fact:high_current", 5);
  }
  if (hasFactType(facts, "mcb_trip")) {
    pushSignal(buckets.overload_trip, "fact:mcb_trip", 3);
  }
  if (hasFactValue(facts, /magnetoterm|sovraccaric|protezione|forno|lavastov|linea/)) {
    pushSignal(buckets.overload_trip, "fact:text_overload_marker", 2);
  }
  if (checksMatch(checks, /corrente assorbita|pinza amperometrica|protezione installata|sezione del cavo|verificare il carico/)) {
    pushSignal(buckets.overload_trip, "check:overload_focus", 2);
  }
  if (topHypothesisMatches(hypotheses, /sovraccarico/)) {
    pushSignal(buckets.overload_trip, "hypothesis:top_family_sovraccarico", 1);
  }
  if (caseState.dominantRisk === "overload" || caseState.dominantRisk === "sovraccarico") {
    pushSignal(buckets.overload_trip, "state:dominantRisk_overload", 2);
  }

  if (hasFactType(facts, "isolation_low")) {
    pushSignal(buckets.differential_trip, "fact:isolation_low", 5);
  }
  if (hasFactType(facts, "mentions_rcd")) {
    pushSignal(buckets.differential_trip, "fact:mentions_rcd", 4);
  }
  if (hasFactType(facts, "rcd_trip")) {
    pushSignal(buckets.differential_trip, "fact:rcd_trip", 2);
  }
  if (hasFactType(facts, "domain_differenziale")) {
    pushSignal(buckets.differential_trip, "fact:domain_differenziale", 2);
  }
  if (checksMatch(checks, /guasto di isolamento|misura circuito per circuito|carichi scollegati|differenziale|dispersione/)) {
    pushSignal(buckets.differential_trip, "check:differential_or_isolation_focus", 2);
  }
  if (topHypothesisMatches(hypotheses, /dispersion|isolament|differenzial/)) {
    pushSignal(buckets.differential_trip, "hypothesis:top_dispersion_support", 1);
  }
  if (caseState.dominantRisk === "isolamento" || caseState.dominantRisk === "differenziale") {
    pushSignal(buckets.differential_trip, "state:dominantRisk_differential", 2);
  }

  if (hasFactType(facts, "mentions_voltage")) {
    pushSignal(buckets.no_output_with_input_present, "fact:mentions_voltage", 2);
  }
  if (hasFactType(facts, "voltage_nominal")) {
    pushSignal(buckets.no_output_with_input_present, "fact:voltage_nominal", 2);
  }
  if (hasFactValue(facts, /ingresso|uscita|pressostato|gallegg|bobina|contatt|consenso|pompa/)) {
    pushSignal(buckets.no_output_with_input_present, "fact:text_input_output_marker", 4);
  }
  if (checksMatch(checks, /continuita del neutro|verificare alimentazione .* morsetti|contatti di potenza chiudano|misurare tensione.*a monte|uscita on/)) {
    pushSignal(buckets.no_output_with_input_present, "check:input_output_focus", 2);
  }
  if (topHypothesisMatches(hypotheses, /alimentazione|neutro|riferimento/)) {
    pushSignal(buckets.no_output_with_input_present, "hypothesis:top_supply_support", 1);
  }
  if (caseState.dominantRisk === "tensione" || caseState.dominantRisk === "continuita") {
    pushSignal(buckets.no_output_with_input_present, "state:dominantRisk_supply", 2);
  }

  if (buckets.overload_trip.score >= 5 && !hasFactType(facts, "isolation_low")) {
    buckets.differential_trip.score = Math.max(0, buckets.differential_trip.score - 2);
  }
  if (buckets.overheating_or_burnt_contact.score >= 5) {
    buckets.no_output_with_input_present.score = Math.max(0, buckets.no_output_with_input_present.score - 1);
  }

  return buckets;
}

function resolveConfidence(topScore, gap) {
  if (topScore >= 7 && gap >= 3) return "high";
  if (topScore >= 4 && gap >= 1) return "medium";
  return "low";
}

function classifyCase(params) {
  var buckets = buildBuckets(params || {});
  var ranked = Object.keys(buckets).map(function (key) {
    return buckets[key];
  }).sort(function (left, right) {
    if (right.score !== left.score) return right.score - left.score;
    return left.caseType.localeCompare(right.caseType);
  });
  var winner = ranked[0] || createBucket("generic_unknown");
  var runnerUp = ranked[1] || createBucket("generic_unknown");
  var gap = winner.score - runnerUp.score;
  var confidence = resolveConfidence(winner.score, gap);

  if (winner.score < 4 || (winner.score === runnerUp.score && winner.score < 7)) {
    return {
      caseType: "generic_unknown",
      matchedSignals: winner.matchedSignals.slice(0, 6),
      confidence: "low"
    };
  }

  return {
    caseType: winner.caseType,
    matchedSignals: winner.matchedSignals.slice(0, 8),
    confidence: confidence
  };
}

module.exports = {
  classifyCase: classifyCase
};
