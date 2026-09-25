"use strict";

var contracts = require("./contracts");

function safeText(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value.slice(0) : [];
}

function ensureRuntime(caseState) {
  if (!caseState.runtime || typeof caseState.runtime !== "object" || Array.isArray(caseState.runtime)) {
    caseState.runtime = {};
  }
  if (!Array.isArray(caseState.runtime.trace)) {
    caseState.runtime.trace = [];
  }
  if (!Array.isArray(caseState.runtime.tools_used)) {
    caseState.runtime.tools_used = [];
  }
  return caseState.runtime;
}

function normalizeToolsUsed(value) {
  var source = safeArray(value);
  var seen = {};
  var result = [];

  source.forEach(function (item) {
    var text = safeText(item);
    if (!text || seen[text]) return;
    seen[text] = true;
    result.push(text);
  });

  return result;
}

function record(caseState, step, details) {
  var runtime = ensureRuntime(caseState);
  var normalizedStep = safeText(step) || "unknown_step";
  var entry = {
    step: normalizedStep,
    details: contracts.safeClone(details && typeof details === "object" ? details : {}),
    timestamp: new Date().toISOString()
  };

  runtime.trace.push(entry);
  return entry;
}

function mergeRuntime(caseState, metadata) {
  var data = metadata || {};
  var runtime = ensureRuntime(caseState);
  if (Object.prototype.hasOwnProperty.call(data, "provider_used")) {
    runtime.provider_used = safeText(data.provider_used) || null;
  }
  if (Object.prototype.hasOwnProperty.call(data, "model_used")) {
    runtime.model_used = safeText(data.model_used) || null;
  }
  if (Object.prototype.hasOwnProperty.call(data, "fallback_used")) {
    runtime.fallback_used = !!data.fallback_used;
  }
  if (Object.prototype.hasOwnProperty.call(data, "fallback_reason")) {
    runtime.fallback_reason = safeText(data.fallback_reason) || null;
  }
  if (Array.isArray(data.tools_used)) {
    runtime.tools_used = normalizeToolsUsed(data.tools_used);
  }
  return caseState;
}

function buildRuntimeMetadata(caseState) {
  var runtime = caseState && caseState.runtime && typeof caseState.runtime === "object" ? caseState.runtime : {};
  var safety = caseState && caseState.safety && typeof caseState.safety === "object" ? caseState.safety : {};
  return {
    provider_used: safeText(runtime.provider_used) || null,
    model_used: safeText(runtime.model_used) || null,
    fallback_used: !!runtime.fallback_used,
    tools_used: normalizeToolsUsed(runtime.tools_used),
    safety_level: safeText(safety.level) || "",
    orchestrator_version: "rocco_v2",
    fallback_reason: safeText(runtime.fallback_reason) || null
  };
}

module.exports = {
  record: record,
  mergeRuntime: mergeRuntime,
  buildRuntimeMetadata: buildRuntimeMetadata
};
