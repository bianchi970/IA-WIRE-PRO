"use strict";

var contracts = require("./contracts");
var caseStateHelpers = require("./case_state");
var runtimeTrace = require("./runtime_trace");
var providerGatewayFactory = require("./provider_gateway");
var safetyGuard = require("./safety_guard");
var planner = require("./planner");
var toolRegistryFactory = require("./tool_registry");
var reasoner = require("./reasoner");
var verifier = require("./verifier");
var responseFormatter = require("./response_formatter");
var memory = require("./memory");

function safeText(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeConfidence(value) {
  var normalized = safeText(value).toLowerCase();
  if (normalized === "confirmed" || normalized === "probable" || normalized === "non_verifiable") {
    return normalized;
  }
  return "non_verifiable";
}

function normalizeEvidenceConfidence(value) {
  var normalized = safeText(value).toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "low";
}

function mapEvidenceConfidenceToCaseConfidence(value) {
  var normalized = normalizeEvidenceConfidence(value);
  if (normalized === "high") return "confirmed";
  if (normalized === "medium") return "probable";
  return "non_verifiable";
}

function collectVerificationIssues(result) {
  var issues = [];
  if (!result) return issues;
  if (Array.isArray(result.contradictions)) issues = issues.concat(result.contradictions);
  if (Array.isArray(result.safetyFlags)) issues = issues.concat(result.safetyFlags);
  if (Array.isArray(result.notes)) issues = issues.concat(result.notes);
  return issues;
}

function extractToolResult(caseState, toolName) {
  var i;
  for (i = 0; i < caseState.tool_results.length; i += 1) {
    if (caseState.tool_results[i] && caseState.tool_results[i].tool_name === toolName) {
      return caseState.tool_results[i];
    }
  }
  return null;
}

function normalizeHypothesis(value, source) {
  if (!value) return null;
  if (typeof value === "string") {
    return { label: safeText(value), reason: "", source: source || "orchestrator" };
  }
  return {
    label: safeText(value.label || value.causa || value.name || value.text),
    reason: safeText(value.reason || value.perche || value.motivo || value.family),
    source: safeText(source || value.source || "orchestrator")
  };
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return "";
  }
}

function buildEvidenceText(evidence) {
  if (typeof evidence === "string") return safeText(evidence);
  if (!evidence || typeof evidence !== "object") return safeText(evidence);
  if (safeText(evidence.text)) return safeText(evidence.text);
  if (safeText(evidence.summary)) return safeText(evidence.summary);
  if (safeText(evidence.reason)) return safeText(evidence.reason);
  if (safeText(evidence.label)) return safeText(evidence.label) + " " + safeText(evidence.reason || evidence.summary);
  return safeText(safeJsonStringify(evidence));
}

function inferEvidenceSourceType(evidence, normalizedText) {
  var explicit = safeText(evidence && evidence.sourceType).toLowerCase();
  if (explicit === "measurement" ||
      explicit === "direct_observation" ||
      explicit === "photo_visible" ||
      explicit === "user_statement" ||
      explicit === "inference") {
    return explicit;
  }
  if (evidence && typeof evidence === "object" &&
      (safeText(evidence.type) || (evidence.value && typeof evidence.value === "object"))) {
    return "measurement";
  }
  if (/misuro|tester|multimetro|strumentale|volt|230|400|ampere|ohm|mohm|misura/.test(normalizedText)) {
    return "measurement";
  }
  if (/foto|immagine|visibile|targhetta|etichetta|label/.test(normalizedText)) {
    return "photo_visible";
  }
  if (/vedo|visibile|annerit|bruciato|fusione|odore|scatta|salta|interviene/.test(normalizedText)) {
    return "direct_observation";
  }
  if (/probabil|forse|ipotes|deduc|infer|sembra/.test(normalizedText)) {
    return "inference";
  }
  return "user_statement";
}

function inferEvidenceSpecificityScore(evidence, normalizedText) {
  var score = 0.08;
  if (!normalizedText) return score;
  if (normalizedText.length >= 24) score += 0.08;
  if (/\b\d+([.,]\d+)?\b/.test(normalizedText)) score += 0.08;
  if (/differenziale|magnetotermico|forno|caldaia|presa|quadro|linea|terra|cucina|tapparella|motore/.test(normalizedText)) {
    score += 0.09;
  }
  if (evidence && typeof evidence === "object" && safeText(evidence.type) && evidence.value && typeof evidence.value === "object") {
    score += 0.1;
  }
  if (score > 0.35) score = 0.35;
  return score;
}

function inferEvidenceReliabilityScore(sourceType, normalizedText) {
  if (sourceType === "measurement") return 0.28;
  if (sourceType === "direct_observation" || sourceType === "photo_visible") return 0.2;
  if (sourceType === "user_statement") {
    if (/\b\d+([.,]\d+)?\b/.test(normalizedText) || /esattamente|preciso|specifico/.test(normalizedText)) {
      return 0.14;
    }
    return 0.09;
  }
  return 0.04;
}

function inferEvidenceRecencyScore(normalizedText) {
  if (/ieri|settimana scorsa|mesi fa|storico|da tempo|gia successo/.test(normalizedText)) return 0.03;
  return 0.08;
}

function inferEvidenceSafetyScore(normalizedText) {
  if (/bruciato|annerit|fusione|carbonizz|dispersion|terra|differenziale|scatta|salta|interviene|surriscald/.test(normalizedText)) {
    return 0.1;
  }
  return 0;
}

function deriveEvidenceReliabilityBand(sourceType, normalizedText) {
  if (sourceType === "measurement") return "measured";
  if (sourceType === "direct_observation" || sourceType === "photo_visible") return "observed";
  if (sourceType === "user_statement") {
    if (/\b\d+([.,]\d+)?\b/.test(normalizedText)) return "reported";
    return "vague";
  }
  return "inferred";
}

function scoreEvidenceWeight(evidence) {
  var text = buildEvidenceText(evidence);
  var normalizedText = normalizeFingerprintText(text);
  var sourceType = inferEvidenceSourceType(evidence, normalizedText);
  var baseMap = {
    measurement: 0.44,
    direct_observation: 0.33,
    photo_visible: 0.27,
    user_statement: 0.16,
    inference: 0.07
  };
  var weight = (baseMap[sourceType] || 0.1) +
    inferEvidenceSpecificityScore(evidence, normalizedText) +
    inferEvidenceReliabilityScore(sourceType, normalizedText) +
    inferEvidenceRecencyScore(normalizedText) +
    inferEvidenceSafetyScore(normalizedText);
  var strength = "weak";
  if (weight > 0.99) weight = 0.99;
  if (weight >= 0.75) strength = "strong";
  else if (weight >= 0.5) strength = "medium";
  return {
    weight: Math.round(weight * 100) / 100,
    strength: strength,
    reliabilityBand: deriveEvidenceReliabilityBand(sourceType, normalizedText)
  };
}

function extractEvidenceSignals(evidence) {
  var text = buildEvidenceText(evidence);
  var normalizedText = normalizeFingerprintText(text);
  var signals = [];
  var numericValue = null;

  if (evidence && typeof evidence === "object" &&
      evidence.value && typeof evidence.value === "object" &&
      evidence.value.value !== undefined && evidence.value.value !== null) {
    numericValue = Number(evidence.value.value);
  }

  if ((evidence && typeof evidence === "object" && safeText(evidence.type).toLowerCase() === "voltage" && isFinite(numericValue) && numericValue > 20) ||
      /tensione presente|presenza tensione|misuro 230|misura 230|230v|400v|fase neutro presenti|alimentazione presente/.test(normalizedText)) {
    signals.push("voltage_present");
  }
  if ((evidence && typeof evidence === "object" && safeText(evidence.type).toLowerCase() === "voltage" && isFinite(numericValue) && numericValue <= 1) ||
      /nessuna tensione|assenza di tensione|tensione assente|non c e tensione|presa senza tensione|alimentazione assente/.test(normalizedText)) {
    signals.push("voltage_absent");
  }
  if (/sovraccarico|assorbimento alto|corrente alta|carico eccessivo|magnetotermico scatta|termico interviene/.test(normalizedText)) {
    signals.push("overload_signal");
  }
  if ((evidence && typeof evidence === "object" && safeText(evidence.type).toLowerCase() === "insulation" && isFinite(numericValue) && numericValue > 0 && numericValue < 1) ||
      /dispersion|terra|isolament basso|misura di isolamento bassa|megger/.test(normalizedText)) {
    signals.push("ground_fault_signal");
  }
  if (/corto circuito|cortocircuito|guasto franco/.test(normalizedText)) {
    signals.push("short_circuit_signal");
  }
  if (/interruzione|circuito aperto|continuita assente|linea interrotta|filo spezzato/.test(normalizedText)) {
    signals.push("open_circuit_signal");
  }
  if (/bruciato|annerit|fusione|carbonizz|surriscald/.test(normalizedText)) {
    signals.push("safety_damage_signal");
  }
  if (/(differenziale|salvavita|rcd|rcbo)/.test(normalizedText) && /(scatta|salta|interviene|trip)/.test(normalizedText)) {
    signals.push("rcd_trip_signal");
  }
  if (/(magnetotermico|fusibile|termico)/.test(normalizedText) && /(scatta|salta|interviene|trip)/.test(normalizedText)) {
    signals.push("mcb_trip_signal");
  }

  return signals;
}

function buildEvidenceRecord(evidence) {
  var text = buildEvidenceText(evidence);
  var normalizedText = normalizeFingerprintText(text);
  var scored = scoreEvidenceWeight(evidence);

  return {
    raw: contracts.safeClone(evidence),
    text: text,
    normalizedText: normalizedText,
    sourceType: inferEvidenceSourceType(evidence, normalizedText),
    weight: scored.weight,
    strength: scored.strength,
    reliabilityBand: scored.reliabilityBand,
    signals: extractEvidenceSignals(evidence)
  };
}

function buildConflictNote(winnerSignal, loserSignal) {
  var map = {
    "voltage_present|voltage_absent": "Contraddizione: presenza tensione sostenuta da evidenza piu forte rispetto ad assenza tensione.",
    "voltage_absent|voltage_present": "Contraddizione: assenza tensione sostenuta da evidenza piu forte rispetto a presenza tensione.",
    "ground_fault_signal|overload_signal": "Contraddizione: dispersione verso terra sostenuta da evidenza piu forte rispetto a sovraccarico puro.",
    "overload_signal|ground_fault_signal": "Contraddizione: sovraccarico sostenuto da evidenza piu forte rispetto a dispersione verso terra.",
    "open_circuit_signal|voltage_present": "Contraddizione: circuito aperto sostenuto da evidenza piu forte rispetto a tensione presente.",
    "voltage_present|open_circuit_signal": "Contraddizione: tensione presente sostenuta da evidenza piu forte rispetto a circuito aperto."
  };
  return map[winnerSignal + "|" + loserSignal] || "Contraddizione tra evidenze tecniche con peso diverso.";
}

function resolveEvidenceConflicts(input) {
  var payload = input || {};
  var evidenceSet = [];
  var signalBest = {};
  var contradictions = [];
  var strongEvidenceCount = 0;
  var weakEvidenceCount = 0;
  var dominantSignals = {};
  var suppressedSignals = {};

  safeArray(payload.facts).forEach(function (item) {
    evidenceSet.push(buildEvidenceRecord(item));
  });
  safeArray(payload.measurements).forEach(function (item) {
    evidenceSet.push(buildEvidenceRecord(item));
  });
  safeArray(payload.observations).forEach(function (item) {
    evidenceSet.push(buildEvidenceRecord(item));
  });

  evidenceSet.forEach(function (record) {
    if (record.strength === "strong") strongEvidenceCount += 1;
    if (record.strength === "weak") weakEvidenceCount += 1;
    record.signals.forEach(function (signal) {
      if (!signalBest[signal] || record.weight > signalBest[signal].weight) {
        signalBest[signal] = record;
      }
    });
  });

  function addConflict(leftSignal, rightSignal) {
    var left = signalBest[leftSignal];
    var right = signalBest[rightSignal];
    var winner;
    var loser;
    if (!left || !right) return;
    winner = left.weight >= right.weight ? left : right;
    loser = winner === left ? right : left;
    dominantSignals[winner.signals.indexOf(leftSignal) >= 0 ? leftSignal : rightSignal] = true;
    suppressedSignals[loser.signals.indexOf(leftSignal) >= 0 ? leftSignal : rightSignal] = true;
    contradictions.push({
      winnerSignal: winner.signals.indexOf(leftSignal) >= 0 ? leftSignal : rightSignal,
      loserSignal: loser.signals.indexOf(leftSignal) >= 0 ? leftSignal : rightSignal,
      note: buildConflictNote(
        winner.signals.indexOf(leftSignal) >= 0 ? leftSignal : rightSignal,
        loser.signals.indexOf(leftSignal) >= 0 ? leftSignal : rightSignal
      )
    });
  }

  addConflict("voltage_present", "voltage_absent");
  addConflict("ground_fault_signal", "overload_signal");
  addConflict("open_circuit_signal", "voltage_present");

  return {
    evidenceSet: evidenceSet,
    contradictions: contradictions,
    strongEvidenceCount: strongEvidenceCount,
    weakEvidenceCount: weakEvidenceCount,
    conflictCount: contradictions.length,
    dominantSignals: dominantSignals,
    suppressedSignals: suppressedSignals
  };
}

function getHypothesisSignalProfile(label) {
  var normalized = normalizeFingerprintText(label);

  if (/dispersion|terra|isolament/.test(normalized)) {
    return {
      supportSignals: ["ground_fault_signal", "rcd_trip_signal"],
      contradictionSignals: ["overload_signal"]
    };
  }
  if (/sovraccarico|assorb|overload/.test(normalized)) {
    return {
      supportSignals: ["overload_signal", "mcb_trip_signal"],
      contradictionSignals: ["ground_fault_signal"]
    };
  }
  if (/assenza di tensione|mancanza tensione|tensione assente|alimentazione assente/.test(normalized)) {
    return {
      supportSignals: ["voltage_absent", "open_circuit_signal"],
      contradictionSignals: ["voltage_present"]
    };
  }
  if (/circuito aperto|interruzione|continuita/.test(normalized)) {
    return {
      supportSignals: ["open_circuit_signal", "voltage_absent"],
      contradictionSignals: ["voltage_present"]
    };
  }
  if (/corto circuito|cortocircuito|guasto franco/.test(normalized)) {
    return {
      supportSignals: ["short_circuit_signal", "mcb_trip_signal"],
      contradictionSignals: ["ground_fault_signal"]
    };
  }

  return {
    supportSignals: [],
    contradictionSignals: []
  };
}

function evaluateHypothesisCoverage(hypothesis, evidenceSet, conflictInfo) {
  var normalized = normalizeHypothesis(hypothesis, "arbitration");
  var profile = getHypothesisSignalProfile(normalized && normalized.label);
  var evidenceItems = safeArray(evidenceSet);
  var conflicts = conflictInfo || {};
  var supportWeight = 0;
  var contradictionWeight = 0;
  var supportingEvidenceCount = 0;
  var contradictingEvidenceCount = 0;
  var supportingStrongCount = 0;
  var contradictingStrongCount = 0;
  var bestReliability = "inferred";
  var coverageLevel = "none";
  var overlapTokens;

  function bandRank(value) {
    if (value === "measured") return 4;
    if (value === "observed") return 3;
    if (value === "reported") return 2;
    if (value === "vague") return 1;
    return 0;
  }

  evidenceItems.forEach(function (record) {
    var matchedSupport = false;
    var matchedContradiction = false;

    if (!record) return;
    record.signals.forEach(function (signal) {
      if (profile.supportSignals.indexOf(signal) >= 0) {
        if (conflicts.suppressedSignals && conflicts.suppressedSignals[signal]) {
          matchedContradiction = true;
          return;
        }
        matchedSupport = true;
      }
      if (profile.contradictionSignals.indexOf(signal) >= 0) {
        matchedContradiction = true;
      }
    });

    if (!profile.supportSignals.length && normalized && normalized.label) {
      overlapTokens = normalizeFingerprintText(normalized.label).split(" ").filter(function (item) {
        return item && item.length > 4;
      });
      if (overlapTokens.some(function (item) { return record.normalizedText.indexOf(item) >= 0; })) {
        matchedSupport = true;
      }
    }

    if (matchedSupport) {
      supportingEvidenceCount += 1;
      supportWeight += record.weight;
      if (record.strength === "strong") supportingStrongCount += 1;
      if (bandRank(record.reliabilityBand) > bandRank(bestReliability)) {
        bestReliability = record.reliabilityBand;
      }
    }
    if (matchedContradiction) {
      contradictingEvidenceCount += 1;
      contradictionWeight += record.weight;
      if (record.strength === "strong") contradictingStrongCount += 1;
    }
  });

  if (contradictingStrongCount > 0 && contradictionWeight >= supportWeight) {
    coverageLevel = "conflicted";
  } else if (supportingEvidenceCount === 0 && contradictingEvidenceCount === 0) {
    coverageLevel = "none";
  } else if (bestReliability === "measured" &&
      supportingEvidenceCount >= 1 &&
      contradictingEvidenceCount === 0 &&
      supportWeight >= 0.75) {
    coverageLevel = "supported";
  } else if (supportingEvidenceCount >= 1 && contradictionWeight < supportWeight && supportWeight >= 0.55) {
    coverageLevel = "partial";
  } else if (supportingEvidenceCount >= 1 && contradictionWeight === 0) {
    coverageLevel = "weak";
  } else if (contradictingEvidenceCount > 0) {
    coverageLevel = "conflicted";
  }

  return {
    supportingEvidenceCount: supportingEvidenceCount,
    contradictingEvidenceCount: contradictingEvidenceCount,
    coverageLevel: coverageLevel,
    reliabilityBand: bestReliability,
    supportWeight: Math.round(supportWeight * 100) / 100,
    contradictionWeight: Math.round(contradictionWeight * 100) / 100
  };
}

function deriveCoverageConfidence(coverageLevel, coverageMeta) {
  var meta = coverageMeta || {};
  if (coverageLevel === "supported" && !meta.contradictingEvidenceCount) return "high";
  if (coverageLevel === "partial" && !meta.contradictingEvidenceCount) return "medium";
  return "low";
}

function hypothesisCoverageRank(coverageLevel) {
  var rank = {
    supported: 5,
    partial: 4,
    weak: 3,
    conflicted: 2,
    none: 1
  };
  return rank[coverageLevel] || 0;
}

function mapRecognitionHypotheses(rawRef) {
  var scored = rawRef && rawRef.scored_components ? rawRef.scored_components : [];
  return scored.slice(0, 3).map(function (item) {
    return {
      label: item.component_name,
      reason: "riconoscimento componente con confidenza " + item.confidence.toFixed(2),
      source: "recognition_tool"
    };
  });
}

function needsCalcTool(caseState) {
  return /(kw|w\b|ampere|a\b|caduta|sezione|icc|cos|differenziale|curva|terra)/i.test(caseState.problem_summary || "");
}

function hasEnoughFacts(caseState) {
  return caseState.facts_confirmed.length + caseState.measurements.length >= 2;
}

function normalizeFingerprintText(text) {
  return safeText(text)
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSignalText(caseState, planningFrame) {
  var frame = planningFrame || {};
  var text = [
    caseState.problem_summary,
    caseState.facts_confirmed.join(" "),
    caseState.facts_uncertain.join(" "),
    caseState.components_detected.join(" "),
    caseState.visual_findings.join(" "),
    caseState.checks_requested.join(" "),
    caseState.missing_critical_data.join(" "),
    Array.isArray(frame.missing_critical_data) ? frame.missing_critical_data.join(" ") : "",
    caseState.hypotheses_active.map(function (item) {
      return safeText(item && item.label);
    }).join(" ")
  ].join(" ");
  return normalizeFingerprintText(text);
}

function hasMeasurement(caseState, kind) {
  var measurementsText = normalizeFingerprintText(JSON.stringify(caseState.measurements || []));
  var signalText = buildSignalText(caseState);

  if (kind === "voltage") {
    return /voltage|volt|230|400|tensione/.test(measurementsText) || /misura di tensione/.test(signalText);
  }
  if (kind === "current") {
    return /current|corrente|ampere|assorb/.test(measurementsText) || /misura di corrente/.test(signalText);
  }
  if (kind === "insulation") {
    return /isolament|megger|dispersion|terra/.test(measurementsText) || /misura di isolamento/.test(signalText);
  }
  if (kind === "continuity") {
    return /continuit|ohm|resistenza/.test(measurementsText) || /misura di continuita/.test(signalText);
  }
  return false;
}

function hasVisualEvidence(caseState, kind) {
  var findingsText = normalizeFingerprintText(caseState.visual_findings.join(" "));
  if (kind === "panel") {
    return !!caseState.runtime.has_image || /quadro|pannello|cablaggio|morsetto/.test(findingsText);
  }
  if (kind === "device_label") {
    return !!caseState.runtime.has_image && /targhetta|etichetta|matricola|label|sigla/.test(findingsText);
  }
  return !!caseState.runtime.has_image || caseState.visual_findings.length > 0;
}

function hasKnownProtectionIdentity(caseState, planningFrame) {
  var signalText = buildSignalText(caseState, planningFrame);
  return /differenziale|magnetotermico|fusibile|salvavita|rcd|rcbo|mt/.test(signalText);
}

function hasKnownTripContext(caseState, planningFrame) {
  var signalText = buildSignalText(caseState, planningFrame);
  if (!/scatta|salta|interviene|trip/.test(signalText)) return true;
  if (/non so quando|non e chiaro quando|non chiaro quando|non ricordo quando/.test(signalText)) return false;
  return /quando|appena|solo quando|all accensione|durante|sotto carico|a vuoto|riarmo|all avvio|mentre/.test(signalText);
}

function hasKnownDeviceIdentity(caseState, planningFrame) {
  var signalText = buildSignalText(caseState, planningFrame);
  return caseState.components_detected.length > 0 ||
    /presa|interruttore|quadro|motore|contattore|caldaia|tapparella|rel[eè]|scheda|pompa|termostato|magnetotermico|differenziale|fusibile|salvavita/.test(signalText);
}

function hasKnownLoadIdentity(caseState, planningFrame) {
  var signalText = buildSignalText(caseState, planningFrame);
  return /caldaia|motore|tapparella|forno|pompa|compressore|frigo|boiler|carico|linea cucina|presa/.test(signalText);
}

function canAskInsulation(caseState, planningFrame) {
  var signalText = buildSignalText(caseState, planningFrame);
  if (caseState.safety.level === "stop" || caseState.safety.level === "danger") return false;
  if (!hasKnownProtectionIdentity(caseState, planningFrame)) return false;
  if (!hasKnownTripContext(caseState, planningFrame)) return false;
  if (!/differenziale|dispersion|terra/.test(signalText)) return false;
  if (!caseState.hypotheses_active.length && !/dispersion|terra/.test(signalText)) return false;
  return true;
}

function hasSufficientAnswer(caseState, planningFrame) {
  var frame = planningFrame || planner.buildPlanningFrame(caseState);
  if (caseState.status === "closed") return true;
  if (!hasEnoughFacts(caseState)) return false;
  if (Array.isArray(frame.missing_critical_data) && frame.missing_critical_data.length > 0) return false;
  if (caseState.final_confidence === "confirmed") return true;
  if (caseState.final_confidence === "probable" && caseState.hypotheses_active.length > 0) return true;
  return caseState.measurements.length > 0 && caseState.hypotheses_active.length > 0;
}

function buildAmbiguityMeta(caseState, planningFrame) {
  var frame = planningFrame || planner.buildPlanningFrame(caseState);
  var signalText = buildSignalText(caseState, frame);
  var problemText = normalizeFingerprintText(caseState.problem_summary);
  var signals = [];
  var coreSignals = [];
  var noVisual = !hasVisualEvidence(caseState, "panel");
  var noMeasurements = !caseState.measurements.length;
  var liveTripLowContext;
  var ambiguousLowContext;

  if (!hasKnownProtectionIdentity(caseState, frame) &&
      /differenziale|magnetotermico|fusibile|salvavita|protezione|scatta|salta|interviene|trip/.test(signalText)) {
    signals.push("missing_protection_identity");
    coreSignals.push("missing_protection_identity");
  }
  if (!hasKnownTripContext(caseState, frame) &&
      /scatta|salta|interviene|trip|differenziale|magnetotermico/.test(signalText)) {
    signals.push("missing_trip_context");
    coreSignals.push("missing_trip_context");
  }
  if (noVisual &&
      (/quadro|pannello|cablaggio|morsetto/.test(problemText) ||
      ((signals.indexOf("missing_protection_identity") >= 0 || signals.indexOf("missing_trip_context") >= 0) &&
      /protezione|scatta|salta|interviene|trip/.test(signalText)))) {
    signals.push("missing_visual_panel");
  }
  if (noMeasurements) {
    signals.push("missing_measurement_context");
  }
  if (!hasKnownDeviceIdentity(caseState, frame)) {
    signals.push("weak_device_identity");
    coreSignals.push("weak_device_identity");
  }
  if (!hasKnownLoadIdentity(caseState, frame) &&
      /caldaia|motore|tapparella|forno|pompa|presa|luce|lampada|carico|linea/.test(problemText)) {
    signals.push("weak_load_identity");
    coreSignals.push("weak_load_identity");
  }
  if (caseState.safety.level === "attention" &&
      !hasSufficientAnswer(caseState, frame) &&
      caseState.hypotheses_active.length === 0 &&
      coreSignals.length > 0) {
    signals.push("risk_without_supporting_evidence");
  }

  liveTripLowContext = /differenziale|scatta|salta|interviene|trip/.test(signalText) &&
    (!hasKnownProtectionIdentity(caseState, frame) || !hasKnownTripContext(caseState, frame)) &&
    noMeasurements;

  if (liveTripLowContext) {
    signals.push("live_trip_low_context");
    coreSignals.push("live_trip_low_context");
  }

  ambiguousLowContext = (coreSignals.length >= 2 && noMeasurements) ||
    (liveTripLowContext && noVisual) ||
    (signals.indexOf("missing_protection_identity") >= 0 && signals.indexOf("missing_trip_context") >= 0) ||
    (signals.indexOf("weak_device_identity") >= 0 && noMeasurements && noVisual);

  return {
    ambiguousLowContext: !!ambiguousLowContext,
    ambiguitySignals: signals,
    prudentialClampApplied: !!ambiguousLowContext
  };
}

function isAmbiguousLowContextCase(caseState, planningFrame) {
  return buildAmbiguityMeta(caseState, planningFrame).ambiguousLowContext;
}

function derivePrimaryGapReason(primaryGap) {
  var reasonMap = {
    missing_measurement_current: "missing_current_measurement",
    missing_measurement_voltage: "missing_voltage_measurement",
    missing_measurement_insulation: "missing_insulation_measurement",
    missing_measurement_continuity: "missing_continuity_measurement",
    missing_trip_context: "missing_trip_trigger_context",
    missing_visual_panel: "missing_panel_visual",
    missing_visual_device_label: "missing_device_label_visual",
    missing_device_identity: "missing_device_identity",
    missing_load_identity: "missing_load_identity",
    missing_protection_identity: "missing_protection_type",
    safety_block: "safety_policy_block",
    sufficient_answer: "case_mature_enough"
  };
  return reasonMap[primaryGap] || "missing_trip_trigger_context";
}

function detectMeasurementTarget(caseState, planningFrame, primaryGap) {
  var missing = planningFrame && Array.isArray(planningFrame.missing_critical_data)
    ? planningFrame.missing_critical_data
    : [];
  var i;
  var item;

  if (primaryGap === "missing_measurement_voltage") return "misura di tensione";
  if (primaryGap === "missing_measurement_current") return "misura di corrente o assorbimento";
  if (primaryGap === "missing_measurement_insulation") return "misura di isolamento verso terra";
  if (primaryGap === "missing_measurement_continuity") return "misura di continuita del circuito";

  for (i = 0; i < missing.length; i += 1) {
    item = safeText(missing[i]);
    if (/misur|tension|volt|corrente|ampere|isolament|terra|dispersion|resistenza/i.test(item)) {
      return item;
    }
  }

  if (/differenziale|dispersione|terra/i.test(caseState.problem_summary || "")) {
    return "misura di isolamento o dispersione";
  }
  if (/presa|tensione|230v|alimentazione/i.test(caseState.problem_summary || "")) {
    return "misura di tensione";
  }
  if (needsCalcTool(caseState)) {
    return "misura o verifica numerica decisiva";
  }
  return "measurement";
}

function detectPhotoTarget(caseState, primaryGap) {
  if (primaryGap === "missing_visual_panel") return "panel";
  if (primaryGap === "missing_visual_device_label") return "device_label";
  if (/quadro|pannello/i.test(caseState.problem_summary || "")) return "panel";
  if (/presa|interruttore|spina/i.test(caseState.problem_summary || "")) return "device_label";
  return "photo";
}

function detectCheckTarget(caseState, planningFrame, primaryGap) {
  var missing = planningFrame && Array.isArray(planningFrame.missing_critical_data)
    ? planningFrame.missing_critical_data
    : [];
  var first = safeText(missing[0]);

  if (primaryGap === "missing_protection_identity") return "identificazione della protezione coinvolta";
  if (primaryGap === "missing_trip_context") return "contesto esatto di scatto della protezione";
  if (primaryGap === "missing_device_identity") return "identificazione del dispositivo coinvolto";
  if (primaryGap === "missing_load_identity") return "identificazione del carico coinvolto";
  if (first) return first;
  if (caseState.components_detected.length === 0) return "identificazione dispositivo o protezione";
  if (/scatta|differenziale|magnetotermico/i.test(caseState.problem_summary || "")) return "contesto di scatto della protezione";
  return "unknown";
}

function derivePrimaryGap(caseState, planningFrame) {
  var frame = planningFrame || planner.buildPlanningFrame(caseState);
  var signalText = buildSignalText(caseState, frame);
  var problemText = normalizeFingerprintText(caseState.problem_summary);
  var ambiguityMeta = buildAmbiguityMeta(caseState, frame);

  if (caseState.safety.level === "stop" || caseState.safety.level === "danger") {
    return "safety_block";
  }

  if (hasSufficientAnswer(caseState, frame)) {
    return "sufficient_answer";
  }

  if (!hasKnownProtectionIdentity(caseState, frame) && /differenziale|magnetotermico|fusibile|salvavita|protezione|scatta|salta|interviene/.test(signalText)) {
    return "missing_protection_identity";
  }

  if (!hasKnownTripContext(caseState, frame)) {
    return "missing_trip_context";
  }

  if (!hasKnownDeviceIdentity(caseState, frame)) {
    return "missing_device_identity";
  }

  if (!hasKnownLoadIdentity(caseState, frame) && /caldaia|motore|tapparella|forno|pompa|carico|presa|linea/.test(problemText)) {
    return "missing_load_identity";
  }

  if (!hasVisualEvidence(caseState, "panel") && /quadro|pannello|cablaggio|morsetto|bruciato|annerit/.test(problemText)) {
    return "missing_visual_panel";
  }

  if (!hasVisualEvidence(caseState, "device_label") && /targhetta|etichetta|label|matricola|sigla/.test(problemText)) {
    return "missing_visual_device_label";
  }

  if (!hasMeasurement(caseState, "voltage") && /tensione|230|400|alimentazione|presa non funziona|assenza di tensione|non c e tensione/.test(problemText)) {
    return "missing_measurement_voltage";
  }

  if (!hasMeasurement(caseState, "current") && /sovraccarico|assorbimento|corrente|ampere|carico eccessivo|scalda troppo/.test(problemText)) {
    return "missing_measurement_current";
  }

  if (!ambiguityMeta.ambiguousLowContext &&
      !hasMeasurement(caseState, "insulation") &&
      canAskInsulation(caseState, frame)) {
    return "missing_measurement_insulation";
  }

  if (!hasMeasurement(caseState, "continuity") && /interruzione|circuito aperto|continuita|filo spezzato|linea interrotta/.test(problemText)) {
    return "missing_measurement_continuity";
  }

  if (Array.isArray(frame.missing_critical_data) && frame.missing_critical_data.length > 0) {
    return "missing_trip_context";
  }

  return "missing_trip_context";
}

function buildAvailableActions(caseState, loopState, planningFrame) {
  var primaryGap = derivePrimaryGap(caseState, planningFrame);
  var ambiguityMeta = buildAmbiguityMeta(caseState, planningFrame);
  var actions = [];

  if (primaryGap === "safety_block" || primaryGap === "sufficient_answer") {
    actions.push({
      actionType: "stop",
      target: primaryGap === "safety_block" ? "safety" : "case_closed",
      reason: primaryGap === "safety_block" ? "safety_block" : "sufficient_answer"
    });
  }

  if (/^missing_measurement_/.test(primaryGap)) {
    actions.push({
      actionType: "request_measurement",
      target: detectMeasurementTarget(caseState, planningFrame, primaryGap),
      reason: "manca una misura tecnica decisiva"
    });
    actions.push({
      actionType: "suggest_check",
      target: detectCheckTarget(caseState, planningFrame, primaryGap),
      reason: "serve una verifica tecnica concreta"
    });
  }

  if (primaryGap === "missing_visual_panel" || primaryGap === "missing_visual_device_label") {
    actions.push({
      actionType: "request_photo",
      target: detectPhotoTarget(caseState, primaryGap),
      reason: "manca evidenza visiva concreta"
    });
    actions.push({
      actionType: "ask_user",
      target: detectPhotoTarget(caseState, primaryGap),
      reason: "serve chiarire il contesto visivo"
    });
  }

  if (primaryGap === "missing_device_identity" ||
      primaryGap === "missing_trip_context" ||
      primaryGap === "missing_load_identity" ||
      primaryGap === "missing_protection_identity") {
    actions.push({
      actionType: "suggest_check",
      target: detectCheckTarget(caseState, planningFrame, primaryGap),
      reason: "serve una verifica concreta sul gap principale"
    });
    actions.push({
      actionType: "ask_user",
      target: detectCheckTarget(caseState, planningFrame, primaryGap),
      reason: "serve un chiarimento strutturato"
    });
  }

  if (ambiguityMeta.ambiguousLowContext &&
      (primaryGap === "missing_trip_context" || primaryGap === "missing_protection_identity")) {
    if (!hasVisualEvidence(caseState, "panel")) {
      actions.push({
        actionType: "request_photo",
        target: "panel",
        reason: "manca evidenza visiva concreta"
      });
    }
  }

  return {
    primaryGap: primaryGap,
    primaryGapReason: derivePrimaryGapReason(primaryGap),
    actions: actions,
    ambiguityMeta: ambiguityMeta
  };
}

function scoreActionPriority(action, caseState, primaryGap, ambiguityMeta) {
  var scoreMap = {
    stop: 500,
    request_measurement: 400,
    request_photo: 300,
    suggest_check: 200,
    ask_user: 100
  };
  var score = scoreMap[action.actionType] || 0;
  var ambiguity = ambiguityMeta || buildAmbiguityMeta(caseState);

  if (normalizeFingerprintText(action.target) && normalizeFingerprintText(action.target) !== "unknown") {
    score += 20;
  }
  if (/^missing_measurement_/.test(primaryGap) && action.actionType === "request_measurement") {
    score += 40;
  }
  if ((primaryGap === "missing_visual_panel" || primaryGap === "missing_visual_device_label") &&
      action.actionType === "request_photo") {
    score += 40;
  }
  if ((primaryGap === "missing_device_identity" ||
      primaryGap === "missing_trip_context" ||
      primaryGap === "missing_load_identity" ||
      primaryGap === "missing_protection_identity" ||
      /^missing_measurement_/.test(primaryGap)) &&
      action.actionType === "suggest_check") {
    score += 30;
  }
  if (caseState.safety.level === "attention" && action.actionType === "ask_user") {
    score -= 10;
  }
  if (ambiguity.ambiguousLowContext) {
    if (action.actionType === "request_measurement") {
      score -= 180;
      if (primaryGap === "missing_measurement_insulation") score -= 200;
    }
    if (action.actionType === "request_photo" && ambiguity.ambiguitySignals.indexOf("missing_visual_panel") >= 0) {
      score += 80;
    }
    if (action.actionType === "suggest_check" &&
        /protezione coinvolta|contesto esatto di scatto|contesto di scatto/.test(normalizeFingerprintText(action.target))) {
      score += 90;
    }
    if (action.actionType === "ask_user") {
      score += 15;
    }
  }
  return score;
}

function isGenericAction(action) {
  var target = normalizeFingerprintText(action && action.target);
  var reason = normalizeFingerprintText(action && action.reason);

  if (!target || target === "unknown" || target === "photo" || target === "measurement") return true;
  if (/verificare impianto|controllare impianto|fare una verifica|serve controllo generico/.test(reason)) return true;
  return false;
}

function buildAbstractActionFingerprint(action) {
  return normalizeFingerprintText([
    action && action.actionType,
    action && action.target,
    action && action.reason
  ].join(" "));
}

function hasDuplicateAction(action, caseState, loopState) {
  var fingerprint = buildAbstractActionFingerprint(action);
  var expected = normalizeFingerprintText(action && action.target);
  var history = loopState && Array.isArray(loopState.history) ? loopState.history : [];
  var i;

  if (action.actionType === "request_measurement" ||
      action.actionType === "request_photo" ||
      action.actionType === "suggest_check" ||
      action.actionType === "ask_user") {
    if (caseState.checks_requested.some(function (item) {
      return normalizeFingerprintText(item) === expected;
    })) {
      return true;
    }
  }

  for (i = 0; i < history.length; i += 1) {
    if (normalizeFingerprintText(history[i].fingerprint) === fingerprint) {
      return true;
    }
  }

  return false;
}

function isAlreadySatisfiedAction(action, caseState, primaryGap) {
  var target = normalizeFingerprintText(action && action.target);
  var completedChecks = Array.isArray(caseState.checks_completed) ? caseState.checks_completed : [];
  var requestedChecks = Array.isArray(caseState.checks_requested) ? caseState.checks_requested : [];

  if (action.actionType === "request_photo") {
    if (target === "panel") return hasVisualEvidence(caseState, "panel");
    if (target === "device_label") return hasVisualEvidence(caseState, "device_label");
    return !!caseState.runtime.has_image || caseState.visual_findings.length > 0;
  }
  if (action.actionType === "request_measurement") {
    if (primaryGap === "missing_measurement_voltage" || /tensione|volt|230|400/.test(target)) {
      return hasMeasurement(caseState, "voltage");
    }
    if (primaryGap === "missing_measurement_current" || /corrente|assorb|ampere/.test(target)) {
      return hasMeasurement(caseState, "current");
    }
    if (primaryGap === "missing_measurement_insulation" || /isolament|dispersion|terra/.test(target)) {
      return hasMeasurement(caseState, "insulation");
    }
    if (primaryGap === "missing_measurement_continuity" || /continuita|circuito aperto|interruzione/.test(target)) {
      return hasMeasurement(caseState, "continuity");
    }
    return caseState.measurements.length > 0;
  }
  if (action.actionType === "suggest_check" || action.actionType === "ask_user") {
    return requestedChecks.some(function (item) {
      return normalizeFingerprintText(item) === target;
    }) || completedChecks.some(function (item) {
      return normalizeFingerprintText(item) === target;
    });
  }
  return false;
}

function isUnsafeAction(action, caseState) {
  if (action.actionType === "stop") return false;
  if (caseState.safety.level === "stop" || caseState.safety.level === "danger") return true;
  return false;
}

function isPrematureAction(action, caseState, primaryGap, planningFrame) {
  var ambiguity = buildAmbiguityMeta(caseState, planningFrame);

  if (action.actionType === "request_measurement" && !/^missing_measurement_/.test(primaryGap)) return true;
  if (ambiguity.ambiguousLowContext &&
      action.actionType === "request_measurement" &&
      (primaryGap === "missing_measurement_insulation" ||
      ambiguity.ambiguitySignals.indexOf("missing_protection_identity") >= 0 ||
      ambiguity.ambiguitySignals.indexOf("missing_trip_context") >= 0)) {
    return true;
  }
  if (action.actionType === "request_photo" &&
      primaryGap !== "missing_visual_panel" &&
      primaryGap !== "missing_visual_device_label") {
    return true;
  }
  if (action.actionType === "suggest_check" &&
      primaryGap !== "missing_device_identity" &&
      primaryGap !== "missing_trip_context" &&
      primaryGap !== "missing_load_identity" &&
      primaryGap !== "missing_protection_identity" &&
      !/^missing_measurement_/.test(primaryGap)) {
    return true;
  }
  if (action.actionType === "ask_user" &&
      (/^missing_measurement_/.test(primaryGap) ||
      primaryGap === "missing_visual_panel" ||
      primaryGap === "missing_visual_device_label")) {
    return true;
  }
  return false;
}

function buildInternalActionFromSelectedAction(selectedAction) {
  if (!selectedAction) return null;

  if (selectedAction.actionType === "stop") {
    return {
      action_type: "finalize",
      tool_name: null,
      reason: selectedAction.reason,
      expected_discriminator: selectedAction.target
    };
  }

  return {
    action_type: "ask_user",
    tool_name: null,
    reason: selectedAction.reason,
    expected_discriminator: selectedAction.target
  };
}

function getCanonicalCheckProfile(checkKey) {
  var profiles = {
    verify_trip_device_identity: {
      checkKey: "verify_trip_device_identity",
      title: "Identificare la protezione che interviene",
      instruction: "Verificare quale dispositivo scatta esattamente tra differenziale, magnetotermico o generale.",
      reason: "Serve distinguere il tipo di intervento prima di proporre misure o ipotesi specifiche.",
      safetyLevel: "safe",
      requiresPowerOn: false,
      requiresInstrument: false
    },
    verify_trip_condition_context: {
      checkKey: "verify_trip_condition_context",
      title: "Chiarire il contesto di scatto",
      instruction: "Verificare in quale condizione precisa scatta la protezione: all'avvio, sotto carico o su un carico specifico.",
      reason: "Serve definire il trigger tecnico prima di chiedere misure o controlli piu specifici.",
      safetyLevel: "safe",
      requiresPowerOn: false,
      requiresInstrument: false
    },
    verify_device_nameplate: {
      checkKey: "verify_device_nameplate",
      title: "Acquisire la targhetta del dispositivo",
      instruction: "Verificare la targhetta o l'etichetta identificativa del dispositivo coinvolto.",
      reason: "Serve identificare il dispositivo prima di selezionare verifiche o misure pertinenti.",
      safetyLevel: "safe",
      requiresPowerOn: false,
      requiresInstrument: false
    },
    verify_panel_visual_context: {
      checkKey: "verify_panel_visual_context",
      title: "Acquisire il contesto visivo del quadro",
      instruction: "Verificare il quadro o il cablaggio coinvolto con una vista chiara del contesto.",
      reason: "Serve vedere protezioni, cablaggi e segnali evidenti prima di proporre controlli successivi.",
      safetyLevel: "safe",
      requiresPowerOn: false,
      requiresInstrument: false
    },
    verify_voltage_presence: {
      checkKey: "verify_voltage_presence",
      title: "Verificare la presenza tensione",
      instruction: "Verificare la presenza della tensione sul punto coinvolto con misura coerente e in sicurezza.",
      reason: "Serve confermare alimentazione presente o assente prima di restringere la diagnosi.",
      safetyLevel: "attention",
      requiresPowerOn: true,
      requiresInstrument: true
    },
    verify_current_absorption: {
      checkKey: "verify_current_absorption",
      title: "Verificare l'assorbimento del carico",
      instruction: "Verificare la corrente assorbita dal carico coinvolto con misura coerente e in sicurezza.",
      reason: "Serve distinguere sovraccarico reale da altri guasti sul circuito.",
      safetyLevel: "attention",
      requiresPowerOn: true,
      requiresInstrument: true
    },
    verify_load_identification: {
      checkKey: "verify_load_identification",
      title: "Identificare il carico coinvolto",
      instruction: "Verificare quale carico o utenza e realmente coinvolto nel problema segnalato.",
      reason: "Serve legare il sintomo a un carico specifico prima di chiedere misure dedicate.",
      safetyLevel: "safe",
      requiresPowerOn: false,
      requiresInstrument: false
    },
    verify_continuity_open_circuit: {
      checkKey: "verify_continuity_open_circuit",
      title: "Verificare la continuita del circuito",
      instruction: "Verificare la continuita del circuito interessato a impianto disalimentato e in sicurezza.",
      reason: "Serve confermare un'interruzione reale prima di proporre cause piu specifiche.",
      safetyLevel: "safe",
      requiresPowerOn: false,
      requiresInstrument: true
    }
  };

  return profiles[checkKey] ? contracts.safeClone(profiles[checkKey]) : null;
}

function chooseSafeFallbackCheckKey(caseState, planningFrame) {
  if (!hasKnownProtectionIdentity(caseState, planningFrame)) return "verify_trip_device_identity";
  if (!hasKnownTripContext(caseState, planningFrame)) return "verify_trip_condition_context";
  return "verify_panel_visual_context";
}

function buildCanonicalSuggestedCheck(options) {
  var config = options || {};
  var caseState = config.caseState || {};
  var selectedAction = config.selectedAction || {};
  var primaryGap = safeText(config.primaryGap);
  var planningFrame = config.planningFrame || planner.buildPlanningFrame(caseState);
  var ambiguityMeta = buildAmbiguityMeta(caseState, planningFrame);
  var checkKey = null;
  var profile;

  if (safeText(selectedAction.actionType) !== "suggest_check") {
    return null;
  }

  if (primaryGap === "missing_protection_identity") checkKey = "verify_trip_device_identity";
  else if (primaryGap === "missing_trip_context") checkKey = "verify_trip_condition_context";
  else if (primaryGap === "missing_visual_panel") checkKey = "verify_panel_visual_context";
  else if (primaryGap === "missing_visual_device_label") checkKey = "verify_device_nameplate";
  else if (primaryGap === "missing_measurement_voltage") checkKey = "verify_voltage_presence";
  else if (primaryGap === "missing_measurement_current") checkKey = "verify_current_absorption";
  else if (primaryGap === "missing_load_identity") checkKey = "verify_load_identification";
  else if (primaryGap === "missing_measurement_continuity") checkKey = "verify_continuity_open_circuit";
  else if (primaryGap === "missing_measurement_insulation") checkKey = chooseSafeFallbackCheckKey(caseState, planningFrame);

  if (!checkKey) {
    checkKey = chooseSafeFallbackCheckKey(caseState, planningFrame);
  }

  if ((checkKey === "verify_voltage_presence" || checkKey === "verify_current_absorption") &&
      (caseState.safety.level === "stop" || caseState.safety.level === "danger")) {
    checkKey = chooseSafeFallbackCheckKey(caseState, planningFrame);
  }

  if ((checkKey === "verify_voltage_presence" || checkKey === "verify_current_absorption") &&
      !hasKnownTripContext(caseState, planningFrame) &&
      /scatta|salta|interviene|trip/.test(buildSignalText(caseState, planningFrame))) {
    checkKey = chooseSafeFallbackCheckKey(caseState, planningFrame);
  }

  if (ambiguityMeta.ambiguousLowContext &&
      (checkKey === "verify_voltage_presence" ||
      checkKey === "verify_current_absorption" ||
      primaryGap === "missing_measurement_insulation")) {
    checkKey = chooseSafeFallbackCheckKey(caseState, planningFrame);
  }

  profile = getCanonicalCheckProfile(checkKey);
  return profile;
}

function selectNextBestAction(options) {
  var config = options || {};
  var caseState = config.caseState || {};
  var loopState = config.loopState || {};
  var planningFrame = config.planningFrame || planner.buildPlanningFrame(caseState);
  var availablePack = config.availableActions || buildAvailableActions(caseState, loopState, planningFrame);
  var primaryGap = safeText(config.primaryGap || availablePack.primaryGap) || "sufficient_answer";
  var primaryGapReason = safeText(config.primaryGapReason || availablePack.primaryGapReason) || derivePrimaryGapReason(primaryGap);
  var ambiguityMeta = config.ambiguityMeta || availablePack.ambiguityMeta || buildAmbiguityMeta(caseState, planningFrame);
  var actions = Array.isArray(availablePack.actions) ? availablePack.actions.slice(0) : [];
  var validActions = [];
  var rejectedActions = [];
  var allowedTypes = {
    ask_user: true,
    request_measurement: true,
    request_photo: true,
    suggest_check: true,
    stop: true
  };

  actions.forEach(function (action) {
    var candidate = {
      actionType: safeText(action && action.actionType),
      target: safeText(action && action.target) || "unknown",
      reason: safeText(action && action.reason),
      priorityScore: 0
    };
    var rejectReason = null;

    if (!allowedTypes[candidate.actionType]) {
      rejectReason = "low_value";
    } else if (isUnsafeAction(candidate, caseState)) {
      rejectReason = "unsafe";
    } else if (hasDuplicateAction(candidate, caseState, loopState)) {
      rejectReason = "duplicate";
    } else if (isAlreadySatisfiedAction(candidate, caseState, primaryGap)) {
      rejectReason = "already_satisfied";
    } else if (isPrematureAction(candidate, caseState, primaryGap, planningFrame)) {
      rejectReason = "premature";
    } else if (isGenericAction(candidate)) {
      rejectReason = "generic";
    }

    if (rejectReason) {
      rejectedActions.push({
        actionType: candidate.actionType,
        target: candidate.target,
        rejectReason: rejectReason
      });
      return;
    }

    candidate.priorityScore = scoreActionPriority(candidate, caseState, primaryGap, ambiguityMeta);
    validActions.push(candidate);
  });

  validActions.sort(function (left, right) {
    return right.priorityScore - left.priorityScore;
  });

  if (validActions.length > 1) {
    validActions.slice(1).forEach(function (action) {
      rejectedActions.push({
        actionType: action.actionType,
        target: action.target,
        rejectReason: "weaker_than_alternative"
      });
    });
  }

  return {
    selectedAction: validActions.length ? validActions[0] : null,
    rejectedActions: rejectedActions,
    primaryGap: primaryGap,
    primaryGapReason: primaryGapReason,
    stopReason: validActions.length ? null : (ambiguityMeta.ambiguousLowContext ? "insufficient_safe_context" : "no_viable_action"),
    ambiguityMeta: ambiguityMeta
  };
}

function clampMaxSteps(value) {
  var parsed = parseInt(value, 10);
  if (!isFinite(parsed) || parsed <= 0) return 2;
  if (parsed > 3) return 3;
  return parsed;
}

function buildActionSignature(action) {
  return JSON.stringify({
    action_type: safeText(action && action.action_type),
    tool_name: safeText(action && action.tool_name),
    expected_discriminator: safeText(action && action.expected_discriminator)
  });
}

function buildDecisionStateSignature(caseState) {
  return JSON.stringify({
    facts_confirmed: caseState.facts_confirmed,
    measurements: caseState.measurements,
    tool_results: caseState.tool_results.map(function (item) {
      return {
        tool_name: item && item.tool_name ? item.tool_name : null,
        summary: item && item.summary ? item.summary : ""
      };
    })
  });
}

function buildProgressSnapshot(caseState) {
  return {
    facts_confirmed: contracts.safeClone(caseState.facts_confirmed),
    measurements: contracts.safeClone(caseState.measurements),
    tool_results: contracts.safeClone(caseState.tool_results.map(function (item) {
      return {
        tool_name: item && item.tool_name ? item.tool_name : null,
        summary: item && item.summary ? item.summary : ""
      };
    })),
    hypotheses_active: contracts.safeClone(caseState.hypotheses_active),
    checks_requested: contracts.safeClone(caseState.checks_requested)
  };
}

function calculateProgress(beforeSnapshot, afterSnapshot) {
  var before = beforeSnapshot || {};
  var after = afterSnapshot || {};
  var progress = {
    facts_confirmed: JSON.stringify(before.facts_confirmed || []) !== JSON.stringify(after.facts_confirmed || []),
    measurements: JSON.stringify(before.measurements || []) !== JSON.stringify(after.measurements || []),
    tool_results: JSON.stringify(before.tool_results || []) !== JSON.stringify(after.tool_results || []),
    hypotheses_active: JSON.stringify(before.hypotheses_active || []) !== JSON.stringify(after.hypotheses_active || []),
    checks_requested: JSON.stringify(before.checks_requested || []) !== JSON.stringify(after.checks_requested || [])
  };

  progress.any = progress.facts_confirmed ||
    progress.measurements ||
    progress.hypotheses_active ||
    progress.checks_requested;
  return progress;
}

function applyReasonedState(caseState, reasoned, validationLabel) {
  var stateValidation;

  runtimeTrace.mergeRuntime(caseState, reasoned.runtime);
  runtimeTrace.record(caseState, "model_result", {
    provider_used: caseState.runtime.provider_used,
    fallback_used: caseState.runtime.fallback_used
  });

  applyDiagnosis(caseState, reasoned.diagnosis);
  runtimeTrace.record(caseState, "diagnosis_applied", {
    confidence: caseState.final_confidence,
    status: caseState.status
  });

  stateValidation = verifier.verifyCaseState(caseState);
  if (!stateValidation.valid) {
    throw new Error((validationLabel || "case_state_invalid") + ":" + collectVerificationIssues(stateValidation).join(","));
  }
  runtimeTrace.record(caseState, "case_state_validated", {
    phase: validationLabel || "loop",
    valid: true
  });
}

function chooseNextAction(caseState, planningFrame) {
  var frame = planningFrame || planner.buildPlanningFrame(caseState);
  var enoughFacts = hasEnoughFacts(caseState);
  var activeHypothesesCount = caseState.hypotheses_active.length;

  if (frame.safety_level === "stop" || frame.safety_level === "danger") {
    return {
      action_type: "finalize",
      tool_name: null,
      reason: "safety_lock",
      expected_discriminator: frame.safety_next_step || ""
    };
  }

  if (frame.has_image && !frame.has_vision_tool) {
    return {
      action_type: "run_tool",
      tool_name: "vision_tool",
      reason: "servono evidenze visive ufficiali",
      expected_discriminator: "componenti visibili e marcature"
    };
  }

  if (!frame.has_recognition_tool) {
    return {
      action_type: "run_tool",
      tool_name: "recognition_tool",
      reason: "servono componenti e valori riconosciuti in modo uniforme",
      expected_discriminator: "componenti e misure rilevate"
    };
  }

  if (needsCalcTool(caseState) && !frame.has_calc_tool) {
    return {
      action_type: "run_tool",
      tool_name: "calc_tool",
      reason: "serve conferma numerica ufficiale",
      expected_discriminator: "valori di calcolo"
    };
  }

  if (enoughFacts && !frame.has_knowledge_tool) {
    return {
      action_type: "run_tool",
      tool_name: "knowledge_lookup_tool",
      reason: "serve contesto tecnico locale coerente",
      expected_discriminator: "pattern e basi tecniche pertinenti"
    };
  }

  if (enoughFacts && !frame.has_closed_cases_tool) {
    return {
      action_type: "run_tool",
      tool_name: "closed_cases_tool",
      reason: "serve memoria consultiva dei casi chiusi",
      expected_discriminator: "casi simili validati"
    };
  }

  if (frame.missing_critical_data.length > 0 && activeHypothesesCount === 0) {
    return {
      action_type: "ask_user",
      tool_name: null,
      reason: "dati insufficienti",
      expected_discriminator: frame.missing_critical_data[0]
    };
  }

  return {
    action_type: "finalize",
    tool_name: null,
    reason: "evidenza sufficiente per sintesi tecnica",
    expected_discriminator: ""
  };
}

function buildReasonerPrompt(caseState) {
  var lines = [];
  lines.push("Restituisci SOLO JSON valido.");
  lines.push("Nessun testo fuori JSON. Nessun markdown. Nessun commento.");
  lines.push("Usa SOLO i campi previsti dal contratto.");
  lines.push("Non aggiungere campi nuovi.");
  lines.push("Schema obbligatorio:");
  lines.push("{\"summary\":\"\",\"active\":[{\"label\":\"\",\"reason\":\"\"}],\"rejected\":[{\"label\":\"\",\"reason\":\"\"}],\"confidence\":\"confirmed|probable|non_verifiable\"}");
  lines.push("");
  lines.push("REGOLE DI PRUDENZA:");
  lines.push("- Evidenza parziale != diagnosi certa.");
  lines.push("- Se mancano misure o verifiche decisive, non usare confirmed.");
  lines.push("- Se ci sono ambiguita o contraddizioni, abbassa confidence.");
  lines.push("- Usa probable solo per ipotesi plausibili e coerenti.");
  lines.push("- Usa non_verifiable quando i dati non bastano.");
  lines.push("- Non trasformare sintomi generici in causa certa.");
  lines.push("- Mantieni output tecnico, sintetico e stabile.");
  lines.push("");
  lines.push("PROBLEMA:");
  lines.push(caseState.problem_summary);
  lines.push("");
  lines.push("SICUREZZA:");
  lines.push("level=" + caseState.safety.level);
  lines.push("reasons=" + caseState.safety.reasons.join(" | "));
  lines.push("blocked_actions=" + caseState.safety.blocked_actions.join(" | "));
  lines.push("allowed_next_step=" + caseState.safety.allowed_next_step);
  lines.push("");
  lines.push("FATTI CERTI:");
  lines.push(caseState.facts_confirmed.join("\n"));
  lines.push("");
  lines.push("FATTI INCERTI O CONTRADDIZIONI:");
  lines.push(caseState.facts_uncertain.join("\n"));
  lines.push("");
  lines.push("MISURE:");
  lines.push(JSON.stringify(caseState.measurements));
  lines.push("");
  lines.push("COMPONENTI:");
  lines.push(caseState.components_detected.join(", "));
  lines.push("");
  lines.push("IPOTESI ATTIVE:");
  lines.push(JSON.stringify(caseState.hypotheses_active));
  lines.push("");
  lines.push("TOOL RESULTS:");
  lines.push(JSON.stringify(caseState.tool_results.map(function (item) {
    return { tool_name: item.tool_name, summary: item.summary, warnings: item.warnings };
  })));
  lines.push("");
  lines.push("DATI MANCANTI:");
  lines.push(caseState.missing_critical_data.join(" | "));
  return lines.join("\n");
}

function extractJson(text) {
  var source = String(text || "").trim();
  var start = source.indexOf("{");
  var end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return source.slice(start, end + 1);
}

function parseReasonerText(text) {
  try {
    return JSON.parse(extractJson(text) || "");
  } catch (_error) {
    return null;
  }
}

function buildDeterministicDiagnosis(caseState, fallbackReason) {
  var action = chooseNextAction(caseState);
  var confidence = caseState.hypotheses_active.length ? "probable" : "non_verifiable";
  var summary;

  if (caseState.safety.level === "stop" || caseState.safety.level === "danger") {
    action.action_type = "finalize";
    summary = caseState.safety.reasons[0] || "Condizione pericolosa rilevata.";
    confidence = "probable";
  } else if (caseState.hypotheses_active.length) {
    summary = "Diagnosi tecnica provvisoria basata su evidenze disponibili.";
  } else {
    summary = "Dati insufficienti per una diagnosi tecnica confermata.";
  }

  return {
    summary: summary,
    active: contracts.safeClone(caseState.hypotheses_active),
    rejected: contracts.safeClone(caseState.hypotheses_rejected),
    confidence: confidence,
    action: {
      action_type: action.action_type,
      tool_name: action.tool_name,
      reason: fallbackReason || action.reason,
      expected_discriminator: action.expected_discriminator
    }
  };
}

function applyDiagnosis(caseState, diagnosisResult) {
  var active = Array.isArray(diagnosisResult.active) ? diagnosisResult.active : [];
  var rejected = Array.isArray(diagnosisResult.rejected) ? diagnosisResult.rejected : [];
  var rejectedKeys = {};
  var conflictInfo;
  var scoredHypotheses = [];
  var topHypothesis;
  var topCoverageConfidence = "low";
  var evidenceMeta;

  caseState.hypotheses_rejected = caseStateHelpers.pushUniqueHypotheses(caseState.hypotheses_rejected, rejected);
  caseState.hypotheses_rejected.forEach(function (item) {
    rejectedKeys[safeText(item.label).toLowerCase()] = true;
  });

  conflictInfo = resolveEvidenceConflicts({
    facts: caseState.facts_confirmed,
    measurements: caseState.measurements,
    observations: [caseState.problem_summary].concat(caseState.visual_findings, caseState.facts_uncertain),
    hypotheses: active
  });
  caseState.facts_uncertain = caseStateHelpers.pushUniqueStrings(
    caseState.facts_uncertain,
    conflictInfo.contradictions.map(function (item) {
      return item.note;
    })
  );

  caseState.hypotheses_active = [];
  active.forEach(function (item) {
    var normalized = normalizeHypothesis(item, "orchestrator");
    var key = safeText(normalized && normalized.label).toLowerCase();
    var coverage;
    if (!normalized || !normalized.label) return;
    if (rejectedKeys[key]) return;
    coverage = evaluateHypothesisCoverage(normalized, conflictInfo.evidenceSet, conflictInfo);
    scoredHypotheses.push({
      hypothesis: normalized,
      coverage: coverage,
      evidenceConfidence: deriveCoverageConfidence(coverage.coverageLevel, coverage)
    });
  });

  scoredHypotheses.sort(function (left, right) {
    var rankDiff = hypothesisCoverageRank(right.coverage.coverageLevel) - hypothesisCoverageRank(left.coverage.coverageLevel);
    if (rankDiff) return rankDiff;
    if (right.coverage.supportWeight !== left.coverage.supportWeight) {
      return right.coverage.supportWeight - left.coverage.supportWeight;
    }
    if (left.coverage.contradictionWeight !== right.coverage.contradictionWeight) {
      return left.coverage.contradictionWeight - right.coverage.contradictionWeight;
    }
    return safeText(left.hypothesis.label).localeCompare(safeText(right.hypothesis.label));
  });

  scoredHypotheses.forEach(function (item) {
    if (item.coverage.coverageLevel === "conflicted") {
      caseState.hypotheses_rejected = caseStateHelpers.pushUniqueHypotheses(caseState.hypotheses_rejected, [{
        label: item.hypothesis.label,
        reason: item.hypothesis.reason || "ipotesi in conflitto con evidenze piu forti",
        source: item.hypothesis.source
      }]);
      return;
    }
    caseState.hypotheses_active.push(item.hypothesis);
  });

  topHypothesis = scoredHypotheses.length ? scoredHypotheses[0] : null;
  if (topHypothesis) {
    topCoverageConfidence = deriveCoverageConfidence(topHypothesis.coverage.coverageLevel, topHypothesis.coverage);
  }

  if (diagnosisResult.confidence === "confirmed" && (caseState.measurements.length === 0 && caseState.tool_results.length <= 1)) {
    diagnosisResult.confidence = "probable";
  }
  if (!caseState.hypotheses_active.length && diagnosisResult.confidence !== "non_verifiable") {
    diagnosisResult.confidence = "non_verifiable";
  }

  evidenceMeta = {
    strongEvidenceCount: conflictInfo.strongEvidenceCount,
    weakEvidenceCount: conflictInfo.weakEvidenceCount,
    conflictCount: conflictInfo.conflictCount,
    topHypothesisCoverage: topHypothesis ? topHypothesis.coverage.coverageLevel : "none",
    topHypothesisConfidenceSource: "coverage_based"
  };
  caseState.evidenceMeta = contracts.safeClone(evidenceMeta);
  caseState.strongestHypothesisMeta = topHypothesis ? {
    supportingEvidenceCount: topHypothesis.coverage.supportingEvidenceCount,
    contradictingEvidenceCount: topHypothesis.coverage.contradictingEvidenceCount,
    coverageLevel: topHypothesis.coverage.coverageLevel,
    reliabilityBand: topHypothesis.coverage.reliabilityBand,
    confidenceBand: normalizeEvidenceConfidence(topCoverageConfidence)
  } : {
    supportingEvidenceCount: 0,
    contradictingEvidenceCount: 0,
    coverageLevel: "none",
    reliabilityBand: "inferred",
    confidenceBand: "low"
  };

  caseState.final_diagnosis = safeText(diagnosisResult.summary) || "Dati insufficienti per una diagnosi tecnica confermata.";
  caseState.final_confidence = normalizeConfidence(mapEvidenceConfidenceToCaseConfidence(topCoverageConfidence));
  caseState.next_action = contracts.safeClone(diagnosisResult.action);
  if (diagnosisResult.action && diagnosisResult.action.action_type === "finalize") {
    caseState.status = "closed";
  }

  return caseState;
}

function runModelReasoning(caseState, providerGateway, providerHint) {
  var prompt = buildReasonerPrompt(caseState);
  return reasoner.execute(providerGateway, {
    requested_provider: providerHint,
    system_prompt: "Sei ROCCO v2 reasoner. Rispondi solo con JSON valido. Usa solo summary, active, rejected, confidence. Confidence ammessa: confirmed, probable, non_verifiable. confirmed solo con evidenza forte e coerente; in dubbio usa probable o non_verifiable.",
    user_prompt: prompt
  }).then(function (response) {
    var parsed = parseReasonerText(response.text);
    var candidate;
    var validation;
    if (!parsed) {
      return {
        diagnosis: buildDeterministicDiagnosis(caseState, "invalid_reasoner_json"),
        runtime: {
          provider_used: response.provider_used,
          model_used: response.model_used,
          fallback_used: true,
          fallback_reason: "invalid_reasoner_json"
        }
      };
    }

    candidate = {
      updated_case_state: {},
      decision: chooseNextAction(caseState),
      diagnosis: {
        summary: safeText(parsed.summary),
        hypotheses_active: Array.isArray(parsed.active) ? parsed.active : [],
        hypotheses_rejected: Array.isArray(parsed.rejected) ? parsed.rejected : [],
        confidence: normalizeConfidence(parsed.confidence)
      }
    };
    validation = contracts.validateReasonerOutput(candidate);
    if (!validation.valid) {
      return {
        diagnosis: buildDeterministicDiagnosis(caseState, "invalid_reasoner_output"),
        runtime: {
          provider_used: response.provider_used,
          model_used: response.model_used,
          fallback_used: true,
          fallback_reason: "invalid_reasoner_output"
        }
      };
    }

    return {
      diagnosis: {
        summary: candidate.diagnosis.summary,
        active: candidate.diagnosis.hypotheses_active,
        rejected: candidate.diagnosis.hypotheses_rejected,
        confidence: candidate.diagnosis.confidence,
        action: candidate.decision
      },
      runtime: {
        provider_used: response.provider_used,
        model_used: response.model_used,
        fallback_used: !!response.fallback_used,
        fallback_reason: response.fallback_reason
      }
    };
  }).catch(function (error) {
    return {
      diagnosis: buildDeterministicDiagnosis(caseState, "provider_unavailable"),
      runtime: {
        provider_used: null,
        model_used: null,
        fallback_used: true,
        fallback_reason: String(error && error.message || "provider_unavailable")
      }
    };
  });
}

function runDiagnosticLoop(caseState, providerGateway, toolRegistry, input, maxSteps) {
  var loopState = {
    step_count: 0,
    max_steps: maxSteps,
    last_action_signature: null,
    last_decision_state_signature: null,
    no_progress_tools: {},
    diagnosis_applied: false,
    stop_reason: null
  };

  runtimeTrace.record(caseState, "loop_start", {
    max_steps: maxSteps
  });

  function stopLoop(reason, details) {
    loopState.stop_reason = reason;
    runtimeTrace.record(caseState, "loop_stop", {
      reason: reason,
      step: loopState.step_count,
      details: details || {}
    });
    return Promise.resolve(loopState);
  }

  function runStep() {
    var planningFrame;
    var nextAction;
    var actionSignature;
    var decisionStateSignature;
    var beforeToolSnapshot;
    var beforeDiagnosisSnapshot;
    var progress;

    if (caseState.safety.level === "stop") {
      return stopLoop("safety_stop", { safety_level: caseState.safety.level });
    }

    if (loopState.step_count >= loopState.max_steps) {
      return stopLoop("max_steps_reached", { max_steps: loopState.max_steps });
    }

    loopState.step_count += 1;
    planningFrame = planner.buildPlanningFrame(caseState);
    nextAction = chooseNextAction(caseState, planningFrame);
    caseStateHelpers.setNextAction(caseState, nextAction);
    runtimeTrace.record(caseState, "loop_step", {
      step: loopState.step_count,
      action_type: nextAction ? nextAction.action_type : null,
      tool_name: nextAction ? nextAction.tool_name : null
    });

    if (!nextAction || !nextAction.action_type) {
      return stopLoop("no_next_action", {});
    }

    actionSignature = buildActionSignature(nextAction);
    decisionStateSignature = buildDecisionStateSignature(caseState);
    if (loopState.last_action_signature === actionSignature &&
        loopState.last_decision_state_signature === decisionStateSignature) {
      runtimeTrace.record(caseState, "loop_no_progress", {
        step: loopState.step_count,
        reason: "same_next_action_without_state_change"
      });
      return stopLoop("same_next_action_without_state_change", {
        action_type: nextAction.action_type,
        tool_name: nextAction.tool_name || null
      });
    }

    if (nextAction.action_type !== "run_tool") {
      if (nextAction.action_type === "ask_user" && nextAction.expected_discriminator) {
        beforeToolSnapshot = buildProgressSnapshot(caseState);
        caseState.checks_requested = caseStateHelpers.pushUniqueStrings(
          caseState.checks_requested,
          nextAction.expected_discriminator
        );
        progress = calculateProgress(beforeToolSnapshot, buildProgressSnapshot(caseState));
        if (progress.any) {
          runtimeTrace.record(caseState, "loop_progress", {
            step: loopState.step_count,
            checks_requested: progress.checks_requested
          });
        } else {
          runtimeTrace.record(caseState, "loop_no_progress", {
            step: loopState.step_count,
            reason: "ask_user_without_new_check"
          });
        }
      }
      return stopLoop("next_action_" + nextAction.action_type, {
        action_type: nextAction.action_type
      });
    }

    if (loopState.no_progress_tools[nextAction.tool_name]) {
      runtimeTrace.record(caseState, "loop_tool_skipped", {
        step: loopState.step_count,
        tool_name: nextAction.tool_name,
        reason: "tool_already_used_without_progress"
      });
      return stopLoop("tool_already_used_without_progress", {
        tool_name: nextAction.tool_name
      });
    }

    runtimeTrace.record(caseState, "loop_tool_selected", {
      step: loopState.step_count,
      tool_name: nextAction.tool_name
    });
    beforeToolSnapshot = buildProgressSnapshot(caseState);

    return toolRegistry.executeTool(nextAction.tool_name, caseState, {
      providerGateway: providerGateway,
      provider_hint: input && input.provider_hint,
      image_buffer: input && input.image_buffer,
      image_mime_type: input && input.image_mime_type
    }).then(function (toolResult) {
      caseStateHelpers.addToolResult(caseState, toolResult);

      if (toolResult.tool_name === "recognition_tool" && toolResult.raw_ref) {
        caseState.components_detected = caseStateHelpers.pushUniqueStrings(
          caseState.components_detected,
          toolResult.raw_ref.legacy_components || []
        );
        caseState.hypotheses_active = caseStateHelpers.pushUniqueHypotheses(
          caseState.hypotheses_active,
          mapRecognitionHypotheses(toolResult.raw_ref)
        );
      }

      progress = calculateProgress(beforeToolSnapshot, buildProgressSnapshot(caseState));
      if (!progress.any) {
        loopState.no_progress_tools[nextAction.tool_name] = true;
        runtimeTrace.record(caseState, "loop_tool_skipped", {
          step: loopState.step_count,
          tool_name: nextAction.tool_name,
          reason: "tool_result_without_progress"
        });
        runtimeTrace.record(caseState, "loop_no_progress", {
          step: loopState.step_count,
          reason: "tool_result_without_progress"
        });
        return stopLoop("tool_result_without_progress", {
          tool_name: nextAction.tool_name
        });
      }

      runtimeTrace.record(caseState, "loop_tool_result_applied", {
        step: loopState.step_count,
        tool_name: toolResult.tool_name,
        ok: toolResult.ok
      });
      runtimeTrace.record(caseState, "loop_progress", {
        step: loopState.step_count,
        facts_confirmed: progress.facts_confirmed,
        measurements: progress.measurements,
        tool_results: progress.tool_results,
        hypotheses_active: progress.hypotheses_active
      });

      runtimeTrace.record(caseState, "loop_reasoner_rerun", {
        step: loopState.step_count,
        tool_name: nextAction.tool_name
      });
      beforeDiagnosisSnapshot = buildProgressSnapshot(caseState);
      return runModelReasoning(caseState, providerGateway, input && input.provider_hint).then(function (reasoned) {
        var diagnosisProgress;

        applyReasonedState(caseState, reasoned, "loop_step_" + loopState.step_count);
        loopState.diagnosis_applied = true;
        diagnosisProgress = calculateProgress(beforeDiagnosisSnapshot, buildProgressSnapshot(caseState));
        if (!diagnosisProgress.any) {
          runtimeTrace.record(caseState, "loop_no_progress", {
            step: loopState.step_count,
            reason: "reasoner_without_progress"
          });
          return stopLoop("reasoner_without_progress", {});
        }

        runtimeTrace.record(caseState, "loop_progress", {
          step: loopState.step_count,
          hypotheses_active: diagnosisProgress.hypotheses_active,
          checks_requested: diagnosisProgress.checks_requested
        });

        if (caseState.status === "closed" || caseState.safety.level === "stop") {
          return stopLoop("diagnosis_closed", {
            status: caseState.status,
            safety_level: caseState.safety.level
          });
        }

        loopState.last_action_signature = actionSignature;
        loopState.last_decision_state_signature = buildDecisionStateSignature(caseState);
        return runStep();
      });
    }).catch(function (error) {
      loopState.no_progress_tools[nextAction.tool_name] = true;
      runtimeTrace.record(caseState, "loop_tool_skipped", {
        step: loopState.step_count,
        tool_name: nextAction.tool_name,
        reason: String(error && error.message || error || "tool_error")
      });
      runtimeTrace.record(caseState, "loop_no_progress", {
        step: loopState.step_count,
        reason: "tool_error"
      });
      return stopLoop("tool_error", {
        tool_name: nextAction.tool_name
      });
    });
  }

  return runStep();
}

function createOrchestrator(options) {
  var settings = options || {};
  var providerGateway = settings.providerGateway || providerGatewayFactory.createDefaultGateway();
  var toolRegistry = settings.toolRegistry || toolRegistryFactory.createRegistry();

  function runDiagnosis(input) {
    var caseState = caseStateHelpers.createCaseState(input);
    var initialValidation;
    var loopMaxSteps = clampMaxSteps(input && input.max_steps);
    var loopResult;
    var finalReasoned;
    var nextActionSelection;
    var nextActionMeta;
    var nextActionCheck;
    var preFormatSnapshot;
    var formatted;
    var formatterCheck;
    var runtimeValidation;
    var ambiguityMeta;
    var evidenceMeta;

    caseState.runtime.has_image = !!(input && input.image_buffer);
    runtimeTrace.record(caseState, "orchestrator_start", {
      conversation_id: caseState.conversation_id,
      has_image: !!caseState.runtime.has_image
    });

    initialValidation = verifier.verifyCaseState(caseState);
    if (!initialValidation.valid) {
      return Promise.reject(new Error("case_state_invalid:" + collectVerificationIssues(initialValidation).join(",")));
    }

    return safetyGuard.run(input || {}).then(function (safetyOutput) {
      caseStateHelpers.mergeSafetySeedOutput(caseState, safetyOutput);
      caseStateHelpers.addToolResult(caseState, safetyOutput.tool_result);
      runtimeTrace.record(caseState, "safety_guard", {
        safety_level: caseState.safety.level,
        allowed_next_step: caseState.safety.allowed_next_step
      });
      return runDiagnosticLoop(caseState, providerGateway, toolRegistry, input, loopMaxSteps);
    }).then(function (loopOutcome) {
      loopResult = loopOutcome;
      if (loopResult && loopResult.diagnosis_applied) {
        return null;
      }
      if (caseState.safety.level === "stop") {
        finalReasoned = {
          diagnosis: buildDeterministicDiagnosis(caseState, (loopResult && loopResult.stop_reason) || "safety_stop"),
          runtime: {}
        };
        applyReasonedState(caseState, finalReasoned, "final_deterministic");
        return null;
      }
      return runModelReasoning(caseState, providerGateway, input && input.provider_hint).then(function (reasoned) {
        finalReasoned = reasoned;
        applyReasonedState(caseState, reasoned, "final_reasoner");
        return null;
      });
    }).then(function () {
      nextActionSelection = selectNextBestAction({
        caseState: caseState,
        loopState: loopResult || {},
        planningFrame: planner.buildPlanningFrame(caseState)
      });
      ambiguityMeta = contracts.safeClone(nextActionSelection.ambiguityMeta || buildAmbiguityMeta(caseState));
      nextActionMeta = {
        selectedActionType: nextActionSelection.selectedAction ? nextActionSelection.selectedAction.actionType : null,
        selectedTarget: nextActionSelection.selectedAction ? nextActionSelection.selectedAction.target : null,
        primaryGap: nextActionSelection.primaryGap,
        primaryGapReason: nextActionSelection.primaryGapReason,
        rejectedCount: nextActionSelection.rejectedActions.length,
        canonicalCheckKey: null,
        stopReason: nextActionSelection.stopReason || (nextActionSelection.selectedAction ? null : "no_viable_action")
      };

      caseState.next_action = null;
      caseState.next_action_check = null;
      caseState.ambiguity_meta = contracts.safeClone(ambiguityMeta);
      if (nextActionSelection.selectedAction) {
        caseState.next_action = buildInternalActionFromSelectedAction(nextActionSelection.selectedAction);
        if (nextActionSelection.selectedAction.actionType === "suggest_check") {
          nextActionCheck = buildCanonicalSuggestedCheck({
            caseState: caseState,
            selectedAction: nextActionSelection.selectedAction,
            primaryGap: nextActionSelection.primaryGap,
            planningFrame: planner.buildPlanningFrame(caseState),
            safetyDecision: caseState.safety
          });
          if (nextActionCheck) {
            caseState.next_action_check = contracts.safeClone(nextActionCheck);
            nextActionMeta.canonicalCheckKey = nextActionCheck.checkKey;
          }
        }
      }
      caseState.next_action_meta = contracts.safeClone(nextActionMeta);
      runtimeTrace.record(caseState, "orchestrator_decision", {
        next_action: contracts.safeClone(caseState.next_action),
        next_action_meta: contracts.safeClone(nextActionMeta),
        ambiguity_meta: contracts.safeClone(ambiguityMeta)
      });

      preFormatSnapshot = caseStateHelpers.buildDiagnosisSnapshot(caseState);
      formatted = responseFormatter.format(preFormatSnapshot);
      formatterCheck = verifier.verifyFormatterNeutrality(preFormatSnapshot, formatted.diagnosis_snapshot);
      if (!formatterCheck.valid) {
        throw new Error(collectVerificationIssues(formatterCheck).join(","));
      }

      runtimeValidation = verifier.verifyRuntimeMetadata(formatted.runtime_metadata);
      if (!runtimeValidation.valid) {
        throw new Error("runtime_metadata_invalid:" + collectVerificationIssues(runtimeValidation).join(","));
      }

      evidenceMeta = contracts.safeClone(caseState.evidenceMeta || {
        strongEvidenceCount: 0,
        weakEvidenceCount: 0,
        conflictCount: 0,
        topHypothesisCoverage: "none",
        topHypothesisConfidenceSource: "coverage_based"
      });
      runtimeTrace.record(caseState, "response_formatter", {
        answer_length: formatted.answer.length
      });

      if (input && input.closed_case_feedback) {
        return {
          answer: formatted.answer,
          diagnosis_snapshot: formatted.diagnosis_snapshot,
          runtime_metadata: formatted.runtime_metadata,
          memory_result: memory.saveValidatedClosedCase(caseState, input.closed_case_feedback),
          next_action_meta: contracts.safeClone(nextActionMeta),
          ambiguity_meta: contracts.safeClone(ambiguityMeta),
          evidence_meta: evidenceMeta
        };
      }

      return {
        answer: formatted.answer,
        diagnosis_snapshot: formatted.diagnosis_snapshot,
        runtime_metadata: formatted.runtime_metadata,
        memory_result: null,
        next_action_meta: contracts.safeClone(nextActionMeta),
        ambiguity_meta: contracts.safeClone(ambiguityMeta),
        evidence_meta: evidenceMeta
      };
    }).then(function (result) {
      return {
        ok: true,
        answer: result.answer,
        case_state: caseState,
        diagnosis_snapshot: result.diagnosis_snapshot,
        runtime_metadata: result.runtime_metadata,
        memory_result: result.memory_result,
        nextActionMeta: result.next_action_meta,
        ambiguityMeta: result.ambiguity_meta,
        evidenceMeta: result.evidence_meta
      };
    });
  }

  return {
    runDiagnosis: runDiagnosis
  };
}

module.exports = {
  createOrchestrator: createOrchestrator,
  selectNextBestAction: selectNextBestAction,
  derivePrimaryGap: derivePrimaryGap,
  isAmbiguousLowContextCase: isAmbiguousLowContextCase,
  scoreActionPriority: scoreActionPriority,
  buildCanonicalSuggestedCheck: buildCanonicalSuggestedCheck,
  scoreEvidenceWeight: scoreEvidenceWeight,
  resolveEvidenceConflicts: resolveEvidenceConflicts,
  evaluateHypothesisCoverage: evaluateHypothesisCoverage,
  runDiagnosis: function (input, options) {
    return createOrchestrator(options).runDiagnosis(input);
  }
};
