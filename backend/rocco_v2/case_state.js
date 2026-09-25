"use strict";

var contracts = require("./contracts");

function safeText(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value.slice(0) : [];
}

function normalizeStatus(value) {
  var normalized = safeText(value).toLowerCase();
  if (normalized === "open" || normalized === "in_progress" || normalized === "blocked" || normalized === "closed") {
    return normalized;
  }
  return "open";
}

function normalizeConfidence(value) {
  var normalized = safeText(value).toLowerCase();
  if (normalized === "confirmed" || normalized === "probable" || normalized === "non_verifiable") {
    return normalized;
  }
  return "non_verifiable";
}

function normalizeSafetyLevel(value) {
  var normalized = safeText(value).toLowerCase();
  if (normalized === "safe" || normalized === "attention" || normalized === "danger" || normalized === "stop") {
    return normalized;
  }
  return "safe";
}

function normalizeHypothesis(value) {
  if (!value) {
    return { label: "", reason: "", source: "unknown" };
  }
  if (typeof value === "string") {
    return { label: safeText(value), reason: "", source: "unknown" };
  }
  return {
    label: safeText(value.label || value.causa || value.name || value.text),
    reason: safeText(value.reason || value.perche || value.motivo || value.family),
    source: safeText(value.source || "unknown")
  };
}

function createCaseState(params) {
  var input = params || {};
  return {
    case_id: safeText(input.case_id) || null,
    conversation_id: safeText(input.conversation_id) || null,
    status: normalizeStatus(input.status || "open"),
    domain: safeText(input.domain) || null,
    user_goal: safeText(input.user_goal || input.message),
    problem_summary: safeText(input.problem_summary || input.message),
    facts_confirmed: [],
    facts_uncertain: [],
    measurements: [],
    components_detected: [],
    visual_findings: [],
    safety: {
      level: normalizeSafetyLevel(input.safety && input.safety.level),
      reasons: [],
      blocked_actions: [],
      allowed_next_step: ""
    },
    hypotheses_active: [],
    hypotheses_rejected: [],
    checks_requested: [],
    checks_completed: [],
    tool_results: [],
    missing_critical_data: [],
    next_action: null,
    final_diagnosis: null,
    final_confidence: normalizeConfidence(input.final_confidence || "non_verifiable"),
    runtime: {
      provider_used: null,
      model_used: null,
      fallback_used: false,
      fallback_reason: null,
      tools_used: [],
      trace: []
    }
  };
}

function pushUniqueStrings(target, values) {
  var list = Array.isArray(target) ? target : [];
  var source = Array.isArray(values) ? values : [values];
  var i;
  var text;

  for (i = 0; i < source.length; i += 1) {
    text = safeText(source[i]);
    if (!text) continue;
    if (list.indexOf(text) >= 0) continue;
    list.push(text);
  }

  return list;
}

function pushUniqueMeasurements(target, values) {
  var list = Array.isArray(target) ? target : [];
  var source = Array.isArray(values) ? values : [];
  var seen = {};
  var i;
  var key;

  for (i = 0; i < list.length; i += 1) {
    seen[JSON.stringify(list[i])] = true;
  }

  for (i = 0; i < source.length; i += 1) {
    key = JSON.stringify(source[i]);
    if (seen[key]) continue;
    seen[key] = true;
    list.push(source[i]);
  }

  return list;
}

function pushUniqueHypotheses(target, values) {
  var list = Array.isArray(target) ? target : [];
  var source = Array.isArray(values) ? values : [];
  var seen = {};
  var i;
  var item;
  var key;

  for (i = 0; i < list.length; i += 1) {
    key = safeText(list[i] && list[i].label).toLowerCase();
    if (key) seen[key] = true;
  }

  for (i = 0; i < source.length; i += 1) {
    item = normalizeHypothesis(source[i]);
    key = safeText(item.label).toLowerCase();
    if (!key || seen[key]) continue;
    seen[key] = true;
    list.push(item);
  }

  return list;
}

function mergeSafetySeedOutput(caseState, safetyOutput) {
  var output = safetyOutput || {};
  var safety = output.safety || {};
  var seed = output.seed || {};

  caseState.safety.level = normalizeSafetyLevel(safety.level);
  caseState.safety.reasons = pushUniqueStrings([], safeArray(safety.reasons));
  caseState.safety.blocked_actions = pushUniqueStrings([], safeArray(safety.blocked_actions));
  caseState.safety.allowed_next_step = safeText(safety.allowed_next_step);
  caseState.domain = caseState.domain || safeText(seed.domain) || null;
  caseState.problem_summary = safeText(seed.problem_summary || caseState.problem_summary);
  caseState.facts_confirmed = pushUniqueStrings(caseState.facts_confirmed, safeArray(seed.facts_confirmed));
  caseState.facts_uncertain = pushUniqueStrings(caseState.facts_uncertain, safeArray(seed.facts_uncertain));
  caseState.measurements = pushUniqueMeasurements(caseState.measurements, safeArray(seed.measurements));
  caseState.components_detected = pushUniqueStrings(caseState.components_detected, safeArray(seed.components_detected));
  caseState.visual_findings = pushUniqueStrings(caseState.visual_findings, safeArray(seed.visual_findings));
  caseState.hypotheses_active = pushUniqueHypotheses(caseState.hypotheses_active, safeArray(seed.hypotheses_active));
  caseState.missing_critical_data = pushUniqueStrings(caseState.missing_critical_data, safeArray(seed.missing_critical_data));
  return caseState;
}

function addToolResult(caseState, toolResult) {
  var validation = contracts.validateToolResult(toolResult);
  if (!validation.valid) {
    throw new Error("tool_result invalid: " + validation.errors.join(", "));
  }

  caseState.tool_results.push(contracts.safeClone(toolResult));
  caseState.runtime.tools_used = pushUniqueStrings(caseState.runtime.tools_used, toolResult.tool_name);
  caseState.facts_confirmed = pushUniqueStrings(caseState.facts_confirmed, safeArray(toolResult.evidence));
  caseState.measurements = pushUniqueMeasurements(caseState.measurements, safeArray(toolResult.measurements));
  caseState.facts_uncertain = pushUniqueStrings(caseState.facts_uncertain, safeArray(toolResult.warnings));
  return caseState;
}

function setNextAction(caseState, decision) {
  caseState.next_action = contracts.safeClone(decision || null);
  return caseState;
}

function buildDiagnosisSnapshot(caseState) {
  return {
    problem_summary: caseState.problem_summary,
    facts_confirmed: safeArray(caseState.facts_confirmed),
    components_detected: safeArray(caseState.components_detected),
    hypotheses_active: contracts.safeClone(caseState.hypotheses_active),
    hypotheses_rejected: contracts.safeClone(caseState.hypotheses_rejected),
    safety: contracts.safeClone(caseState.safety),
    final_diagnosis: caseState.final_diagnosis,
    final_confidence: caseState.final_confidence,
    next_action: contracts.safeClone(caseState.next_action),
    missing_critical_data: safeArray(caseState.missing_critical_data),
    runtime: contracts.safeClone(caseState.runtime)
  };
}

module.exports = {
  createCaseState: createCaseState,
  normalizeStatus: normalizeStatus,
  normalizeConfidence: normalizeConfidence,
  normalizeSafetyLevel: normalizeSafetyLevel,
  normalizeHypothesis: normalizeHypothesis,
  mergeSafetySeedOutput: mergeSafetySeedOutput,
  addToolResult: addToolResult,
  setNextAction: setNextAction,
  pushUniqueStrings: pushUniqueStrings,
  pushUniqueMeasurements: pushUniqueMeasurements,
  pushUniqueHypotheses: pushUniqueHypotheses,
  buildDiagnosisSnapshot: buildDiagnosisSnapshot
};
