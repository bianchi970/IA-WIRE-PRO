"use strict";

var contracts = require("./contracts");

function buildVerificationResult(valid, contradictions, safetyFlags, notes) {
  return {
    valid: !!valid,
    contradictions: Array.isArray(contradictions) ? contradictions.slice(0) : [],
    safetyFlags: Array.isArray(safetyFlags) ? safetyFlags.slice(0) : [],
    notes: Array.isArray(notes) ? notes.slice(0) : []
  };
}

function verifyCaseState(caseState) {
  var validation = contracts.validateCaseState(caseState);
  return buildVerificationResult(validation.valid, validation.errors, [], []);
}

function verifyRuntimeMetadata(metadata) {
  var validation = contracts.validateRuntimeMetadata(metadata);
  return buildVerificationResult(validation.valid, validation.errors, [], []);
}

function verifyFormatterNeutrality(beforeSnapshot, afterSnapshot) {
  var beforeText = JSON.stringify(beforeSnapshot || {});
  var afterText = JSON.stringify(afterSnapshot || {});
  return buildVerificationResult(
    beforeText === afterText,
    beforeText === afterText ? [] : ["formatter mutated diagnosis snapshot"],
    [],
    []
  );
}

module.exports = {
  buildVerificationResult: buildVerificationResult,
  verifyCaseState: verifyCaseState,
  verifyRuntimeMetadata: verifyRuntimeMetadata,
  verifyFormatterNeutrality: verifyFormatterNeutrality
};
