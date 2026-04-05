"use strict";

// PATCH 22 — delega il riordino deterministico al planner
var roccoCheckPlanner = require("./roccoCheckPlanner");

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value === undefined || value === null ? "" : value).toLowerCase();
}

function stripTrailingDot(text) {
  return String(text || "").replace(/[.\s]+$/, "");
}

function stableSortChecks(checks) {
  return ensureArray(checks)
    .map(function (check, index) {
      return { check: check, index: index };
    })
    .sort(function (left, right) {
      var leftPriority = Number(left.check && left.check.priority || 0);
      var rightPriority = Number(right.check && right.check.priority || 0);

      if (rightPriority !== leftPriority) return rightPriority - leftPriority;
      return left.index - right.index;
    })
    .map(function (entry) { return entry.check; });
}

function isIsolationCheck(text) {
  return /isolament|megohm|megger/.test(text);
}

function isCircuitIsolationCheck(text) {
  return isIsolationCheck(text) && /circuit.*circuit|carichi scollegati|guasto di isolamento/.test(text);
}

function isLoadSeparationCheck(text) {
  return (/scolleg|distacc|separ/.test(text) && /caric|circuit/.test(text)) || /uno alla volta/.test(text);
}

function isOverloadFocusCheck(text) {
  return /corrente assorbit|pinza amperometr|protezione installata|taglia.*protez|verific.*carico|simultaneit|sezione.*cavo|linea/.test(text);
}

function isSafeIsolationStep(text) {
  return /disalimentare|assenza tensione|messa in sicurezza|lockout|loto/.test(text);
}

function isSafeInspectionCheck(text) {
  return /ispezion|serragg|sezione cavo|punto surriscaldato/.test(text);
}

function isLiveMeasurementCheck(text) {
  return /sotto carico|durante il funzionamento|misurare tensione|misure l-n|misure l-pe|ripetere le misure|pinza amperometr|rilanciare|riattivare/.test(text);
}

function isComponentCommandCheck(text) {
  return /contatt|bobina|comando|consens|uscita|ingresso|commut|continuit|apert|chius|pressostat|rele/.test(text);
}

function findPreferredReason(checks, predicate) {
  var list = ensureArray(checks);
  var index;
  var normalizedReason;

  for (index = 0; index < list.length; index++) {
    normalizedReason = normalizeText(list[index] && list[index].reason);
    if (predicate(normalizedReason)) return stripTrailingDot(list[index].reason);
  }

  return "";
}

function normalizeCaseClassification(caseClassification) {
  var safeClassification = caseClassification || {};

  return {
    caseType: safeClassification.caseType || "generic_unknown",
    matchedSignals: ensureArray(safeClassification.matchedSignals),
    confidence: safeClassification.confidence || "low"
  };
}

function hasMatchedSignal(caseClassification, signal) {
  return normalizeCaseClassification(caseClassification).matchedSignals.indexOf(signal) >= 0;
}

function ensureMethodCheck(checks, reason, priority, basedOnFacts) {
  var normalizedReason = normalizeText(reason);
  var list = ensureArray(checks);
  var alreadyPresent = list.some(function (check) {
    return normalizeText(check && check.reason) === normalizedReason;
  });

  if (!reason || alreadyPresent) return list;

  return list.concat([{
    id: "CHK-METHOD-" + list.length,
    reason: reason,
    priority: priority,
    basedOnFacts: basedOnFacts
  }]);
}

function recoverCaseCheckFromHypotheses(checks, caseClassification, hypotheses) {
  var list = ensureArray(checks);
  var normalizedClassification = normalizeCaseClassification(caseClassification);
  var rankedHypotheses = ensureArray(hypotheses);
  var targetHypothesis;
  var hasIsolationLowSignal = hasMatchedSignal(normalizedClassification, "fact:isolation_low");

  if (normalizedClassification.caseType === "overload_trip") {
    targetHypothesis = rankedHypotheses.find(function (hypothesis) {
      return normalizeText(hypothesis && hypothesis.family) === "sovraccarico" &&
        isOverloadFocusCheck(normalizeText(hypothesis && (hypothesis.bestCheck || hypothesis.verificationNeeded)));
    });

    if (targetHypothesis) {
      return ensureMethodCheck(
        list,
        targetHypothesis.bestCheck || targetHypothesis.verificationNeeded,
        99,
        ["method_gate", "overload_trip"]
      );
    }
  }

  if (normalizedClassification.caseType === "differential_trip" && !hasIsolationLowSignal) {
    targetHypothesis = rankedHypotheses.find(function (hypothesis) {
      return isLoadSeparationCheck(normalizeText(hypothesis && (hypothesis.bestCheck || hypothesis.verificationNeeded)));
    });

    if (targetHypothesis) {
      return ensureMethodCheck(
        list,
        targetHypothesis.bestCheck || targetHypothesis.verificationNeeded,
        99,
        ["method_gate", "differential_trip"]
      );
    }
  }

  return list;
}

function selectAllowedNextStep(checks, caseClassification, baseAllowedNextStep, safetyDecision) {
  var normalizedClassification = normalizeCaseClassification(caseClassification);
  var hasIsolationLowSignal = hasMatchedSignal(normalizedClassification, "fact:isolation_low");
  var preferredReason = "";
  var safeStep = findPreferredReason(checks, isSafeIsolationStep);

  if ((safetyDecision && (safetyDecision.level === "stop" || safetyDecision.level === "danger")) && safeStep) {
    return safeStep;
  }

  if (normalizedClassification.caseType === "overheating_or_burnt_contact") {
    preferredReason = findPreferredReason(checks, isSafeIsolationStep) ||
      findPreferredReason(checks, isSafeInspectionCheck);
  } else if (normalizedClassification.caseType === "differential_trip") {
    preferredReason = hasIsolationLowSignal
      ? findPreferredReason(checks, isCircuitIsolationCheck)
      : findPreferredReason(checks, isLoadSeparationCheck) || findPreferredReason(checks, isCircuitIsolationCheck);
  } else if (normalizedClassification.caseType === "overload_trip") {
    preferredReason = findPreferredReason(checks, isOverloadFocusCheck);
  } else if (normalizedClassification.caseType === "no_output_with_input_present") {
    preferredReason = findPreferredReason(checks, isComponentCommandCheck);
  }

  return preferredReason ||
    stripTrailingDot(baseAllowedNextStep) ||
    (checks[0] ? stripTrailingDot(checks[0].reason) : "");
}

function applyRoccoMethodGate(params) {
  var safeParams = params || {};
  var baseDecisionPolicy = Object.assign({
    immediateAction: "",
    allowedNextStep: "",
    blockedActions: [],
    technicianPriority: "general"
  }, safeParams.decisionPolicy || {});
  var caseClassification = normalizeCaseClassification(safeParams.caseClassification);
  // PATCH 22 — usa il planner deterministico per l'aggiustamento priorità
  var plannerResult = roccoCheckPlanner.planChecks({
    caseClassification: caseClassification,
    diagnosticChecks: safeParams.diagnosticChecks,
    hypotheses: safeParams.hypotheses
  });
  var gatedChecks = plannerResult.diagnosticChecks;

  gatedChecks = recoverCaseCheckFromHypotheses(gatedChecks, caseClassification, safeParams.hypotheses);

  if (caseClassification.caseType === "overheating_or_burnt_contact") {
    var filtered = gatedChecks.filter(function (check) {
      var normalizedReason = normalizeText(check && check.reason);
      return !isLiveMeasurementCheck(normalizedReason) || isSafeIsolationStep(normalizedReason);
    });

    if (filtered.length) gatedChecks = filtered;
  }

  gatedChecks = stableSortChecks(gatedChecks);

  return {
    caseClassification: caseClassification,
    diagnosticChecks: gatedChecks,
    decisionPolicy: Object.assign({}, baseDecisionPolicy, {
      // PATCH 22 — selectAllowedNextStep mantiene il controllo safety (danger/stop);
      // plannerResult.allowedNextStep viene usato come base di fallback se i checks non producono un match migliore
      allowedNextStep: selectAllowedNextStep(
        gatedChecks,
        caseClassification,
        plannerResult.allowedNextStep || baseDecisionPolicy.allowedNextStep,
        safeParams.safetyDecision
      )
    })
  };
}

module.exports = {
  stripTrailingDot: stripTrailingDot,
  applyRoccoMethodGate: applyRoccoMethodGate
};
