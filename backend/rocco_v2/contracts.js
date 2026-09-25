"use strict";

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function isArray(value) {
  return Array.isArray(value);
}

function safeClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function validateRequiredKeys(obj, keys, errors, prefix) {
  var i;
  var scope = prefix || "";
  for (i = 0; i < keys.length; i += 1) {
    if (!Object.prototype.hasOwnProperty.call(obj, keys[i])) {
      errors.push(scope + keys[i] + " missing");
    }
  }
}

function validateCaseState(caseState) {
  var errors = [];
  var safety;
  var runtime;

  if (!isObject(caseState)) {
    return { valid: false, errors: ["case_state invalid"] };
  }

  validateRequiredKeys(caseState, [
    "case_id",
    "conversation_id",
    "status",
    "domain",
    "user_goal",
    "problem_summary",
    "facts_confirmed",
    "facts_uncertain",
    "measurements",
    "components_detected",
    "visual_findings",
    "safety",
    "hypotheses_active",
    "hypotheses_rejected",
    "checks_requested",
    "checks_completed",
    "tool_results",
    "missing_critical_data",
    "next_action",
    "final_diagnosis",
    "final_confidence",
    "runtime"
  ], errors, "");

  if (!isArray(caseState.facts_confirmed)) errors.push("facts_confirmed invalid");
  if (!isArray(caseState.facts_uncertain)) errors.push("facts_uncertain invalid");
  if (!isArray(caseState.measurements)) errors.push("measurements invalid");
  if (!isArray(caseState.components_detected)) errors.push("components_detected invalid");
  if (!isArray(caseState.visual_findings)) errors.push("visual_findings invalid");
  if (!isArray(caseState.hypotheses_active)) errors.push("hypotheses_active invalid");
  if (!isArray(caseState.hypotheses_rejected)) errors.push("hypotheses_rejected invalid");
  if (!isArray(caseState.checks_requested)) errors.push("checks_requested invalid");
  if (!isArray(caseState.checks_completed)) errors.push("checks_completed invalid");
  if (!isArray(caseState.tool_results)) errors.push("tool_results invalid");
  if (!isArray(caseState.missing_critical_data)) errors.push("missing_critical_data invalid");

  safety = caseState.safety;
  runtime = caseState.runtime;

  if (!isObject(safety)) {
    errors.push("safety invalid");
  } else {
    validateRequiredKeys(safety, ["level", "reasons", "blocked_actions", "allowed_next_step"], errors, "safety.");
    if (!isArray(safety.reasons)) errors.push("safety.reasons invalid");
    if (!isArray(safety.blocked_actions)) errors.push("safety.blocked_actions invalid");
  }

  if (!isObject(runtime)) {
    errors.push("runtime invalid");
  } else {
    validateRequiredKeys(runtime, [
      "provider_used",
      "model_used",
      "fallback_used",
      "fallback_reason",
      "tools_used",
      "trace"
    ], errors, "runtime.");
    if (!isArray(runtime.tools_used)) errors.push("runtime.tools_used invalid");
    if (!isArray(runtime.trace)) errors.push("runtime.trace invalid");
  }

  return { valid: errors.length === 0, errors: errors };
}

function validateToolResult(toolResult) {
  var errors = [];

  if (!isObject(toolResult)) {
    return { valid: false, errors: ["tool_result invalid"] };
  }

  validateRequiredKeys(toolResult, [
    "tool_name",
    "ok",
    "evidence",
    "measurements",
    "warnings",
    "summary",
    "raw_ref"
  ], errors, "");

  if (!isArray(toolResult.evidence)) errors.push("tool_result.evidence invalid");
  if (!isArray(toolResult.measurements)) errors.push("tool_result.measurements invalid");
  if (!isArray(toolResult.warnings)) errors.push("tool_result.warnings invalid");

  return { valid: errors.length === 0, errors: errors };
}

function validateReasonerOutput(reasonerOutput) {
  var errors = [];
  var decision;
  var diagnosis;

  if (!isObject(reasonerOutput)) {
    return { valid: false, errors: ["reasoner_output invalid"] };
  }

  validateRequiredKeys(reasonerOutput, [
    "updated_case_state",
    "decision",
    "diagnosis"
  ], errors, "");

  decision = reasonerOutput.decision;
  diagnosis = reasonerOutput.diagnosis;

  if (!isObject(reasonerOutput.updated_case_state)) {
    errors.push("updated_case_state invalid");
  }

  if (!isObject(decision)) {
    errors.push("decision invalid");
  } else {
    validateRequiredKeys(decision, [
      "action_type",
      "tool_name",
      "reason",
      "expected_discriminator"
    ], errors, "decision.");
  }

  if (!isObject(diagnosis)) {
    errors.push("diagnosis invalid");
  } else {
    validateRequiredKeys(diagnosis, [
      "summary",
      "hypotheses_active",
      "hypotheses_rejected",
      "confidence"
    ], errors, "diagnosis.");
    if (!isArray(diagnosis.hypotheses_active)) errors.push("diagnosis.hypotheses_active invalid");
    if (!isArray(diagnosis.hypotheses_rejected)) errors.push("diagnosis.hypotheses_rejected invalid");
  }

  return { valid: errors.length === 0, errors: errors };
}

function validateRuntimeMetadata(metadata) {
  var errors = [];

  if (!isObject(metadata)) {
    return { valid: false, errors: ["runtime_metadata invalid"] };
  }

  validateRequiredKeys(metadata, [
    "provider_used",
    "model_used",
    "fallback_used",
    "tools_used",
    "safety_level",
    "orchestrator_version"
  ], errors, "");

  if (!isArray(metadata.tools_used)) errors.push("runtime_metadata.tools_used invalid");

  return { valid: errors.length === 0, errors: errors };
}

module.exports = {
  isObject: isObject,
  isArray: isArray,
  safeClone: safeClone,
  validateCaseState: validateCaseState,
  validateToolResult: validateToolResult,
  validateReasonerOutput: validateReasonerOutput,
  validateRuntimeMetadata: validateRuntimeMetadata
};
