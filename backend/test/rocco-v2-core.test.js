"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var contracts = require("../rocco_v2/contracts");
var caseStateHelpers = require("../rocco_v2/case_state");
var orchestratorFactory = require("../rocco_v2/orchestrator");
var planner = require("../rocco_v2/planner");
var responseFormatter = require("../rocco_v2/response_formatter");
var toolRegistryFactory = require("../rocco_v2/tool_registry");
var verifier = require("../rocco_v2/verifier");
var calcTool = require("../rocco_v2/tools/calc_tool");
var closedCasesTool = require("../rocco_v2/tools/closed_cases_tool");
var knowledgeLookupTool = require("../rocco_v2/tools/knowledge_lookup_tool");
var recognitionTool = require("../rocco_v2/tools/recognition_tool");
var visionTool = require("../rocco_v2/tools/vision_tool");

var REAL_CASE_FIXTURE_PATH = path.join(__dirname, "fixtures", "rocco-v2-real-cases.json");

function makeGateway(capturedProviders, shouldFail) {
  return {
    runReasoner: function (payload) {
      capturedProviders.push(payload && payload.requested_provider ? payload.requested_provider : null);
      if (shouldFail) {
        return Promise.reject(new Error("network_down"));
      }
      return Promise.resolve({
        text: JSON.stringify({
          summary: "Dispersione tecnica probabile sulla linea controllata.",
          active: [{ label: "dispersione verso terra", reason: "intervento differenziale coerente" }],
          rejected: [{ label: "corto circuito franco", reason: "assenza di intervento magnetico" }],
          confidence: "probable"
        }),
        provider_used: payload && payload.requested_provider ? payload.requested_provider : "stub",
        model_used: "stub-model",
        fallback_used: false,
        fallback_reason: null
      });
    },
    runOcr: function () {
      return Promise.resolve({
        text: "QF1 16A curva C",
        provider_used: "stub",
        model_used: "stub-ocr",
        fallback_used: false,
        fallback_reason: null
      });
    }
  };
}

function makePromptCaptureGateway(store) {
  return {
    runReasoner: function (payload) {
      store.system_prompt = payload && payload.system_prompt ? payload.system_prompt : "";
      store.user_prompt = payload && payload.user_prompt ? payload.user_prompt : "";
      store.requested_provider = payload && payload.requested_provider ? payload.requested_provider : null;
      return Promise.resolve({
        text: JSON.stringify({
          summary: "Diagnosi prudente con output disciplinato.",
          active: [],
          rejected: [],
          confidence: "non_verifiable"
        }),
        provider_used: "stub",
        model_used: "stub-model",
        fallback_used: false,
        fallback_reason: null
      });
    },
    runOcr: function () {
      return Promise.resolve({
        text: "",
        provider_used: "stub",
        model_used: "stub-ocr",
        fallback_used: false,
        fallback_reason: null
      });
    }
  };
}

function makeSequenceGateway(sequence, capturedProviders) {
  var items = Array.isArray(sequence) ? sequence.slice(0) : [];
  var index = 0;

  return {
    runReasoner: function (payload) {
      var item = items[index < items.length ? index : items.length - 1] || {};
      index += 1;
      if (Array.isArray(capturedProviders)) {
        capturedProviders.push(payload && payload.requested_provider ? payload.requested_provider : null);
      }
      if (item.error) {
        return Promise.reject(new Error(item.error));
      }
      return Promise.resolve({
        text: item.text || JSON.stringify({
          summary: "Diagnosi prudente.",
          active: [],
          rejected: [],
          confidence: "non_verifiable"
        }),
        provider_used: item.provider_used || (payload && payload.requested_provider ? payload.requested_provider : "stub"),
        model_used: item.model_used || "stub-model",
        fallback_used: !!item.fallback_used,
        fallback_reason: item.fallback_reason || null
      });
    },
    runOcr: function () {
      return Promise.resolve({
        text: "",
        provider_used: "stub",
        model_used: "stub-ocr",
        fallback_used: false,
        fallback_reason: null
      });
    }
  };
}

function makeToolRegistry() {
  return {
    executeTool: function (toolName) {
      if (toolName === "recognition_tool") {
        return Promise.resolve({
          tool_name: "recognition_tool",
          ok: true,
          evidence: ["Rilevato differenziale linea cucina"],
          measurements: [],
          warnings: [],
          summary: "Riconoscimento componenti completato",
          raw_ref: {
            legacy_components: ["interruttore differenziale"],
            scored_components: [
              { component_name: "interruttore differenziale", confidence: 0.91 }
            ]
          }
        });
      }

      return Promise.resolve({
        tool_name: toolName,
        ok: true,
        evidence: ["Tool " + toolName + " eseguito"],
        measurements: [],
        warnings: [],
        summary: "Tool " + toolName + " completato",
        raw_ref: null
      });
    }
  };
}

function makeMalformedGateway() {
  return {
    runReasoner: function () {
      return Promise.resolve({
        text: "not-json",
        provider_used: "openai",
        model_used: "stub-model",
        fallback_used: false,
        fallback_reason: null
      });
    },
    runOcr: function () {
      return Promise.resolve({
        text: "QF1 16A curva C",
        provider_used: "stub",
        model_used: "stub-ocr",
        fallback_used: false,
        fallback_reason: null
      });
    }
  };
}

function makeFallbackGateway(capturedProviders) {
  return {
    runReasoner: function (payload) {
      capturedProviders.push(payload && payload.requested_provider ? payload.requested_provider : null);
      return Promise.resolve({
        text: JSON.stringify({
          summary: "Fallback riuscito su provider secondario con diagnosi prudente.",
          active: [{ label: "dispersione verso terra", reason: "fallback provider coerente" }],
          rejected: [],
          confidence: "probable"
        }),
        provider_used: "anthropic",
        model_used: "fallback-model",
        fallback_used: true,
        fallback_reason: "provider_switch"
      });
    },
    runOcr: function () {
      return Promise.resolve({
        text: "",
        provider_used: "anthropic",
        model_used: "fallback-ocr",
        fallback_used: true,
        fallback_reason: "provider_switch"
      });
    }
  };
}

function makeStructuredInvalidGateway() {
  return {
    runReasoner: function () {
      return Promise.resolve({
        text: JSON.stringify({
          summary: 17,
          active: { bad: true },
          rejected: "nope",
          confidence: "assoluta"
        }),
        provider_used: "openai",
        model_used: "stub-model",
        fallback_used: false,
        fallback_reason: null
      });
    },
    runOcr: function () {
      return Promise.resolve({
        text: "",
        provider_used: "openai",
        model_used: "stub-ocr",
        fallback_used: false,
        fallback_reason: null
      });
    }
  };
}

function makeInvalidToolRegistry() {
  return {
    executeTool: function () {
      return Promise.resolve({
        tool_name: "recognition_tool",
        ok: true
      });
    }
  };
}

function makeMeasuredToolRegistry() {
  return {
    executeTool: function (toolName) {
      return Promise.resolve({
        tool_name: toolName,
        ok: true,
        evidence: ["Misura strumentale coerente sul circuito"],
        measurements: [{ type: "voltage", value: { value: 230, unit: "V" } }],
        warnings: [],
        summary: "Evidenza forte acquisita dal tool.",
        raw_ref: null
      });
    }
  };
}

function makeStrongDispersionToolRegistry() {
  return {
    executeTool: function (toolName) {
      return Promise.resolve({
        tool_name: toolName,
        ok: true,
        evidence: [
          "Il differenziale scatta quando attivo la cucina",
          "Misura di isolamento bassa verso terra sulla linea cucina"
        ],
        measurements: [{ type: "insulation", value: { value: 0.22, unit: "Mohm" } }],
        warnings: [],
        summary: "Evidenza forte coerente con dispersione verso terra.",
        raw_ref: null
      });
    }
  };
}

function makeEmptyButValidToolRegistry() {
  return {
    executeTool: function (toolName) {
      return Promise.resolve({
        tool_name: toolName,
        ok: false,
        evidence: [],
        measurements: [],
        warnings: ["Tool privo di evidenze utili."],
        summary: "Nessuna evidenza utile ricavata.",
        raw_ref: null
      });
    }
  };
}

function makeRecognitionHypothesisRegistry() {
  return {
    executeTool: function () {
      return Promise.resolve({
        tool_name: "recognition_tool",
        ok: true,
        evidence: [],
        measurements: [],
        warnings: [],
        summary: "Riconoscimento ipotesi base",
        raw_ref: {
          legacy_components: [],
          scored_components: [
            { component_name: "contattore", confidence: 0.84 }
          ]
        }
      });
    }
  };
}

function isCanonicalStatus(value) {
  return ["open", "in_progress", "blocked", "closed"].indexOf(value) >= 0;
}

function isCanonicalConfidence(value) {
  return ["confirmed", "probable", "non_verifiable"].indexOf(value) >= 0;
}

function getTraceEntries(result, step) {
  var trace = result.case_state && result.case_state.runtime && Array.isArray(result.case_state.runtime.trace)
    ? result.case_state.runtime.trace
    : [];

  if (!step) return trace.slice(0);
  return trace.filter(function (entry) {
    return entry && entry.step === step;
  });
}

function countTraceStep(result, step) {
  return getTraceEntries(result, step).length;
}

function getLastTraceEntry(result, step) {
  var entries = getTraceEntries(result, step);
  return entries.length ? entries[entries.length - 1] : null;
}

function withPatchedPlanner(frame, task) {
  var original = planner.buildPlanningFrame;
  planner.buildPlanningFrame = function () {
    return contracts.safeClone(frame);
  };

  return Promise.resolve().then(function () {
    return task();
  }).then(function (result) {
    planner.buildPlanningFrame = original;
    return result;
  }, function (error) {
    planner.buildPlanningFrame = original;
    throw error;
  });
}

function assertTraceContains(result, expectedSteps, label) {
  var trace = result.case_state && result.case_state.runtime && Array.isArray(result.case_state.runtime.trace)
    ? result.case_state.runtime.trace.map(function (entry) { return entry.step; })
    : [];
  expectedSteps.forEach(function (step) {
    assert.ok(trace.indexOf(step) >= 0, (label || "trace") + " missing step: " + step + " in " + trace.join(", "));
  });
}

function assertDisciplinedResult(result, label) {
  var caseValidation = contracts.validateCaseState(result.case_state);
  var runtimeValidation = contracts.validateRuntimeMetadata(result.runtime_metadata);
  assert.strictEqual(caseValidation.valid, true, (label || "case_state") + ": " + caseValidation.errors.join(", "));
  assert.strictEqual(runtimeValidation.valid, true, (label || "runtime_metadata") + ": " + runtimeValidation.errors.join(", "));
  assert.strictEqual(isCanonicalStatus(result.case_state.status), true, (label || "status") + ": non-canonical");
  assert.strictEqual(isCanonicalConfidence(result.case_state.final_confidence), true, (label || "confidence") + ": non-canonical");
}

function readRealCaseFixtures() {
  return JSON.parse(fs.readFileSync(REAL_CASE_FIXTURE_PATH, "utf8"));
}

function makeRealCaseGateway() {
  return makeSequenceGateway([{
    text: JSON.stringify({
      summary: "Dati ancora insufficienti per chiudere in modo affidabile.",
      active: [],
      rejected: [],
      confidence: "non_verifiable"
    }),
    provider_used: "openai",
    model_used: "real-case-model"
  }]);
}

function makeRealCaseToolRegistry() {
  return makeToolRegistry();
}

function hasDuplicateLoopTools(result) {
  var seen = {};
  var duplicate = false;

  getTraceEntries(result, "loop_tool_selected").forEach(function (entry) {
    var toolName = entry && entry.details ? String(entry.details.tool_name || "") : "";
    if (!toolName) return;
    if (seen[toolName]) duplicate = true;
    seen[toolName] = true;
  });

  return duplicate;
}

function evaluateConvergence(result, expected) {
  var nextActionMeta = result.nextActionMeta || {};
  var executedSteps = countTraceStep(result, "loop_step");
  var matchedPrimaryGap = nextActionMeta.primaryGap === expected.primaryGap;
  var matchedActionType = nextActionMeta.selectedActionType === expected.nextActionType;
  var matchedCanonicalCheck = expected.canonicalCheckKey === null
    ? nextActionMeta.canonicalCheckKey === null
    : nextActionMeta.canonicalCheckKey === expected.canonicalCheckKey;
  var stopReasonOk = !nextActionMeta.stopReason ||
    (Array.isArray(expected.allowStopReasons) && expected.allowStopReasons.indexOf(nextActionMeta.stopReason) >= 0);

  return {
    converged: matchedPrimaryGap &&
      matchedActionType &&
      matchedCanonicalCheck &&
      stopReasonOk &&
      executedSteps <= expected.maxUsefulSteps,
    executedSteps: executedSteps,
    matchedPrimaryGap: matchedPrimaryGap,
    matchedActionType: matchedActionType,
    matchedCanonicalCheck: matchedCanonicalCheck,
    stopReasonOk: stopReasonOk
  };
}

function assertRealCaseSafe(caseId, result, expected) {
  var nextActionMeta = result.nextActionMeta || {};
  var riskyCheckKeys = {
    verify_voltage_presence: true,
    verify_current_absorption: true,
    verify_continuity_open_circuit: true
  };
  var prudentialCaseIds = {
    rcd_context_incomplete_prudent_01: true,
    unknown_protection_prudent_01: true,
    panel_no_photo_prudent_01: true
  };

  if (result.case_state.safety.level === "stop" || result.case_state.safety.level === "danger") {
    assert.ok(
      nextActionMeta.selectedActionType === "stop" || nextActionMeta.selectedActionType === null,
      caseId + ": action unsafe for safety level " + result.case_state.safety.level
    );
  }

  if (prudentialCaseIds[caseId]) {
    assert.notStrictEqual(nextActionMeta.primaryGap, "missing_measurement_insulation", caseId + ": insulation gap too early");
    assert.notStrictEqual(nextActionMeta.selectedActionType, "request_measurement", caseId + ": misura prematura");
    assert.strictEqual(Boolean(riskyCheckKeys[nextActionMeta.canonicalCheckKey]), false, caseId + ": risky canonical check");
  }

  if (expected.nextActionType === "stop") {
    assert.strictEqual(nextActionMeta.selectedActionType, "stop");
  }
}

function testRealCaseRegressionPack() {
  var fixtures = readRealCaseFixtures();
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeRealCaseGateway(),
    toolRegistry: makeRealCaseToolRegistry()
  });
  var totals = {
    cases: 0,
    pass: 0,
    failed: 0,
    steps: 0
  };

  return fixtures.reduce(function (promise, fixture) {
    return promise.then(function () {
      return orchestrator.runDiagnosis({
        message: fixture.input && fixture.input.text ? fixture.input.text : "",
        max_steps: fixture.expected && fixture.expected.maxUsefulSteps ? fixture.expected.maxUsefulSteps : 2
      }).then(function (result) {
        var evaluation = evaluateConvergence(result, fixture.expected || {});
        var line = "[" + (evaluation.converged ? "PASS" : "FAIL") + "] " + fixture.id +
          " -> gap=" + String((result.nextActionMeta && result.nextActionMeta.primaryGap) || "") +
          " action=" + String((result.nextActionMeta && result.nextActionMeta.selectedActionType) || "null") +
          " check=" + String((result.nextActionMeta && result.nextActionMeta.canonicalCheckKey) || "null") +
          " steps=" + evaluation.executedSteps;

        totals.cases += 1;
        totals.steps += evaluation.executedSteps;

        assertDisciplinedResult(result, "real-case:" + fixture.id);
        assert.strictEqual(hasDuplicateLoopTools(result), false, fixture.id + ": duplicate loop tool");
        assertRealCaseSafe(fixture.id, result, fixture.expected || {});
        assert.strictEqual(evaluation.matchedPrimaryGap, true, fixture.id + ": primaryGap mismatch");
        assert.strictEqual(evaluation.matchedActionType, true, fixture.id + ": actionType mismatch");
        assert.strictEqual(evaluation.matchedCanonicalCheck, true, fixture.id + ": canonicalCheck mismatch");
        assert.strictEqual(evaluation.stopReasonOk, true, fixture.id + ": stopReason mismatch");
        assert.strictEqual(evaluation.executedSteps <= fixture.expected.maxUsefulSteps, true, fixture.id + ": exceeded maxUsefulSteps");
        assert.strictEqual(evaluation.converged, true, fixture.id + ": convergence failed");

        totals.pass += 1;
        console.log(line);
      }).catch(function (error) {
        totals.cases += 1;
        totals.failed += 1;
        console.log("[FAIL] " + fixture.id + " -> " + String(error && error.message || error));
        throw error;
      });
    });
  }, Promise.resolve()).then(function () {
    var avgSteps = totals.cases ? (totals.steps / totals.cases).toFixed(1) : "0.0";
    console.log("cases: " + totals.cases);
    console.log("pass: " + totals.pass);
    console.log("failed: " + totals.failed);
    console.log("avgStepsToUsefulAction: " + avgSteps);
    assert.strictEqual(parseFloat(avgSteps) <= 2.0, true, "avgStepsToUsefulAction worsened: " + avgSteps);
  });
}

function testAmbiguousLowContextClampActive() {
  var state = makeSelectionState("Scatta una protezione ma non so quale dispositivo del quadro interviene e non ho foto ne misure");
  assert.strictEqual(orchestratorFactory.isAmbiguousLowContextCase(state), true);
}

function testAmbiguousRcdDoesNotExposeInsulationBranch() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeRealCaseGateway(),
    toolRegistry: makeRealCaseToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "Il differenziale scatta ma non so quando e non ho misure ne foto"
  }).then(function (result) {
    assertDisciplinedResult(result, "ambiguous-rcd");
    assert.ok(result.ambiguityMeta);
    assert.strictEqual(result.ambiguityMeta.ambiguousLowContext, true);
    assert.notStrictEqual(result.nextActionMeta.primaryGap, "missing_measurement_insulation");
    assert.notStrictEqual(result.nextActionMeta.selectedActionType, "request_measurement");
    assert.notStrictEqual(result.nextActionMeta.canonicalCheckKey, "verify_voltage_presence");
    assert.notStrictEqual(result.nextActionMeta.canonicalCheckKey, "verify_current_absorption");
  });
}

function testAmbiguousNoPhotoNoMeasurementsPrefersContextOrPhoto() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeRealCaseGateway(),
    toolRegistry: makeRealCaseToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "Quadro non visibile e non so quale protezione scatta"
  }).then(function (result) {
    assertDisciplinedResult(result, "ambiguous-no-photo");
    assert.ok(result.ambiguityMeta);
    assert.strictEqual(result.ambiguityMeta.ambiguousLowContext, true);
    assert.ok(
      result.nextActionMeta.selectedActionType === "suggest_check" ||
      result.nextActionMeta.selectedActionType === "request_photo"
    );
    assert.ok(
      result.nextActionMeta.canonicalCheckKey === "verify_trip_condition_context" ||
      result.nextActionMeta.canonicalCheckKey === "verify_trip_device_identity" ||
      result.nextActionMeta.canonicalCheckKey === null
    );
  });
}

function testAmbiguousNoSafeActionStopsPrudently() {
  var state = makeSelectionState("Scatta una protezione ma non so quale dispositivo del quadro interviene");
  var selection = orchestratorFactory.selectNextBestAction({
    caseState: state,
    loopState: {},
    availableActions: {
      primaryGap: "missing_measurement_insulation",
      primaryGapReason: "missing_insulation_measurement",
      ambiguityMeta: {
        ambiguousLowContext: true,
        ambiguitySignals: ["missing_protection_identity", "missing_trip_context", "missing_visual_panel"],
        prudentialClampApplied: true
      },
      actions: [{
        actionType: "request_measurement",
        target: "misura di isolamento verso terra",
        reason: "manca una misura tecnica decisiva"
      }]
    }
  });

  assert.strictEqual(selection.selectedAction, null);
  assert.strictEqual(selection.stopReason, "insufficient_safe_context");
}

function testEvidenceWeightMeasurementBeatsVagueText() {
  var measured = orchestratorFactory.scoreEvidenceWeight({
    sourceType: "measurement",
    type: "voltage",
    value: { value: 230, unit: "V" },
    text: "Misuro 230V fase neutro sulla presa cucina"
  });
  var vague = orchestratorFactory.scoreEvidenceWeight({
    sourceType: "user_statement",
    text: "forse manca corrente"
  });

  assert.ok(measured.weight > vague.weight);
  assert.strictEqual(measured.reliabilityBand, "measured");
}

function testEvidenceObservationBeatsWeakInference() {
  var observation = orchestratorFactory.scoreEvidenceWeight({
    sourceType: "direct_observation",
    text: "Vedo annerimento sul morsetto del quadro"
  });
  var inference = orchestratorFactory.scoreEvidenceWeight({
    sourceType: "inference",
    text: "forse e un sovraccarico"
  });

  assert.ok(observation.weight > inference.weight);
  assert.ok(observation.strength !== "weak");
}

function testConflictedHypothesisDoesNotBeatMeasuredEvidence() {
  var conflictInfo = orchestratorFactory.resolveEvidenceConflicts({
    facts: ["utente riferisce assenza di tensione alla presa"],
    measurements: [{ type: "voltage", value: { value: 230, unit: "V" }, text: "Misuro 230V fase neutro sulla presa" }],
    observations: [],
    hypotheses: []
  });
  var absentVoltage = orchestratorFactory.evaluateHypothesisCoverage(
    { label: "assenza di tensione", reason: "presa senza alimentazione" },
    conflictInfo.evidenceSet,
    conflictInfo
  );

  assert.strictEqual(conflictInfo.conflictCount >= 1, true);
  assert.strictEqual(absentVoltage.coverageLevel, "conflicted");
  assert.strictEqual(absentVoltage.contradictingEvidenceCount >= 1, true);
}

function testSupportedHypothesisBeatsWeakHypothesis() {
  var conflictInfo = orchestratorFactory.resolveEvidenceConflicts({
    facts: ["Il differenziale scatta quando attivo la cucina"],
    measurements: [{ type: "insulation", value: { value: 0.18, unit: "Mohm" }, text: "Misura di isolamento bassa verso terra" }],
    observations: ["forse c'e un sovraccarico leggero"],
    hypotheses: []
  });
  var supported = orchestratorFactory.evaluateHypothesisCoverage(
    { label: "dispersione verso terra", reason: "intervento differenziale coerente" },
    conflictInfo.evidenceSet,
    conflictInfo
  );
  var weak = orchestratorFactory.evaluateHypothesisCoverage(
    { label: "sovraccarico puro", reason: "indizio debole" },
    conflictInfo.evidenceSet,
    conflictInfo
  );

  assert.ok(supported.coverageLevel === "supported" || supported.coverageLevel === "partial");
  assert.strictEqual(supported.supportingEvidenceCount >= 2, true);
  assert.ok(weak.coverageLevel === "weak" || weak.coverageLevel === "conflicted" || weak.coverageLevel === "none");
}

function testCoverageDrivenConfidenceAndEvidenceMeta() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeSequenceGateway([{
      text: JSON.stringify({
        summary: "Assenza tensione confermata.",
        active: [{ label: "assenza di tensione", reason: "presa spenta" }],
        rejected: [],
        confidence: "confirmed"
      }),
      provider_used: "openai",
      model_used: "coverage-model"
    }]),
    toolRegistry: makeMeasuredToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "presa non funziona in cucina"
  }).then(function (result) {
    assertDisciplinedResult(result, "coverage-driven");
    assert.ok(result.evidenceMeta);
    assert.ok(result.case_state.strongestHypothesisMeta);
    assert.strictEqual(result.evidenceMeta.topHypothesisConfidenceSource, "coverage_based");
    assert.strictEqual(result.case_state.strongestHypothesisMeta.coverageLevel, "conflicted");
    assert.strictEqual(result.case_state.final_confidence, "non_verifiable");
  });
}

function testCaseStateContract() {
  var state = caseStateHelpers.createCaseState({ message: "Il differenziale scatta in cucina." });
  var validation = contracts.validateCaseState(state);
  assert.strictEqual(validation.valid, true, validation.errors.join(", "));
  assert.strictEqual(state.problem_summary, "Il differenziale scatta in cucina.");
  assert.strictEqual(Array.isArray(state.hypotheses_active), true);
}

function testCaseStateNormalization() {
  var state = caseStateHelpers.createCaseState({
    message: "Linea cucina KO",
    conversation_id: "  conv-42  ",
    status: "unexpected",
    final_confidence: "unsafe-value",
    safety: { level: "not-real" }
  });
  assert.strictEqual(state.conversation_id, "conv-42");
  assert.strictEqual(state.status, "open");
  assert.strictEqual(state.final_confidence, "non_verifiable");
  assert.strictEqual(state.safety.level, "safe");
}

function testFormatterNeutrality() {
  var snapshot = {
    facts_confirmed: ["Differenziale della linea cucina interviene"],
    components_detected: ["interruttore differenziale"],
    hypotheses_active: [{ label: "dispersione verso terra", reason: "intervento ripetuto del differenziale" }],
    hypotheses_rejected: [{ label: "sovraccarico puro", reason: "assenza di intervento termico" }],
    safety: {
      level: "safe",
      reasons: [],
      blocked_actions: [],
      allowed_next_step: "Misurare l'isolamento della linea cucina"
    },
    final_diagnosis: "Dispersione probabile verso terra.",
    final_confidence: "probable",
    next_action: {
      action_type: "ask_user",
      tool_name: null,
      reason: "serve misura di isolamento",
      expected_discriminator: "valore di isolamento verso terra"
    },
    runtime: {
      provider_used: "openai",
      model_used: "stub-model",
      fallback_used: false,
      fallback_reason: null,
      tools_used: ["recognition_tool"],
      trace: []
    }
  };
  var formatted = responseFormatter.format(snapshot);
  var neutrality = verifier.verifyFormatterNeutrality(snapshot, formatted.diagnosis_snapshot);
  assert.strictEqual(neutrality.valid, true, (neutrality.contradictions || []).join(", "));
  assert.strictEqual(formatted.runtime_metadata.orchestrator_version, "rocco_v2");
}

function testUnifiedOrchestrator() {
  var capturedProviders = [];
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeGateway(capturedProviders, false),
    toolRegistry: makeToolRegistry()
  });
  var firstRunCount = 0;

  return orchestrator.runDiagnosis({
    message: "Il differenziale scatta quando attivo la cucina.",
    provider_hint: "openai"
  }).then(function (openaiResult) {
    firstRunCount = capturedProviders.length;
    return orchestrator.runDiagnosis({
      message: "Il differenziale scatta quando attivo la cucina.",
      provider_hint: "anthropic"
    }).then(function (anthropicResult) {
      var firstRunProviders = capturedProviders.slice(0, firstRunCount);
      var secondRunProviders = capturedProviders.slice(firstRunCount);
      assert.ok(firstRunProviders.length >= 1);
      assert.ok(secondRunProviders.length >= 1);
      firstRunProviders.forEach(function (providerName) {
        assert.strictEqual(providerName, "openai");
      });
      secondRunProviders.forEach(function (providerName) {
        assert.strictEqual(providerName, "anthropic");
      });
      assert.strictEqual(openaiResult.runtime_metadata.orchestrator_version, "rocco_v2");
      assert.strictEqual(anthropicResult.runtime_metadata.orchestrator_version, "rocco_v2");
      assert.strictEqual(openaiResult.runtime_metadata.provider_used, "openai");
      assert.strictEqual(anthropicResult.runtime_metadata.provider_used, "anthropic");
      assert.ok(openaiResult.case_state.runtime.trace.length > 0);
      assert.strictEqual(contracts.validateCaseState(openaiResult.case_state).valid, true);
      assert.strictEqual(isCanonicalStatus(openaiResult.case_state.status), true);
      assert.strictEqual(isCanonicalConfidence(openaiResult.case_state.final_confidence), true);
      assert.notStrictEqual(openaiResult.case_state.status, "finalized");
    });
  });
}

function testFallbackMetadata() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeGateway([], true),
    toolRegistry: makeToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "Il differenziale scatta senza motivo apparente."
  }).then(function (result) {
    assert.strictEqual(result.runtime_metadata.fallback_used, true);
    assert.ok(String(result.runtime_metadata.fallback_reason || "").indexOf("network_down") >= 0);
      assert.strictEqual(result.runtime_metadata.orchestrator_version, "rocco_v2");
  });
}

function testMalformedReasonerFallback() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeMalformedGateway(),
    toolRegistry: makeToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "Il differenziale scatta quando attivo la cucina."
  }).then(function (result) {
    assert.strictEqual(result.runtime_metadata.fallback_used, true);
    assert.strictEqual(result.runtime_metadata.fallback_reason, "invalid_reasoner_json");
    assert.strictEqual(contracts.validateCaseState(result.case_state).valid, true);
    assert.strictEqual(isCanonicalStatus(result.case_state.status), true);
    assert.strictEqual(isCanonicalConfidence(result.case_state.final_confidence), true);
  });
}

function testInvalidToolOutputRejected() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeGateway([], false),
    toolRegistry: makeInvalidToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "Il differenziale scatta quando attivo la cucina."
  }).then(function (result) {
    assertDisciplinedResult(result, "invalid-tool-output");
    assert.strictEqual(countTraceStep(result, "loop_tool_selected"), 1);
    assert.strictEqual(countTraceStep(result, "loop_tool_skipped"), 1);
    assert.strictEqual(getLastTraceEntry(result, "loop_stop").details.reason, "tool_error");
    assert.strictEqual(countTraceStep(result, "model_result") >= 1, true);
  });
}

function assertValidToolResult(result, label) {
  var validation = contracts.validateToolResult(result);
  assert.strictEqual(validation.valid, true, label + ": " + validation.errors.join(", "));
}

function makeSelectionState(message) {
  return caseStateHelpers.createCaseState({ message: message || "Caso tecnico generico" });
}

function testToolContracts() {
  var registry = toolRegistryFactory.createRegistry();
  var calcState = { problem_summary: "Calcola la corrente per 6 kW a 230 V con cosphi 0.9" };
  var recState = { problem_summary: "Il differenziale da 16A curva C scatta sulla linea cucina." };
  var infoState = { problem_summary: "Problema su differenziale linea cucina." };

  return Promise.resolve().then(function () {
    return calcTool.run(calcState).then(function (result) {
      assertValidToolResult(result, "calc_tool");
    });
  }).then(function () {
    return recognitionTool.run(recState).then(function (result) {
      assertValidToolResult(result, "recognition_tool");
      assert.strictEqual(Array.isArray(result.measurements), true);
    });
  }).then(function () {
    return closedCasesTool.run(infoState).then(function (result) {
      assertValidToolResult(result, "closed_cases_tool");
    });
  }).then(function () {
    return knowledgeLookupTool.run(infoState).then(function (result) {
      assertValidToolResult(result, "knowledge_lookup_tool");
    });
  }).then(function () {
    return visionTool.run(infoState, {}).then(function (result) {
      assertValidToolResult(result, "vision_tool");
      assert.strictEqual(result.ok, false);
    });
  }).then(function () {
    return registry.executeTool("vision_tool", infoState, {}).then(function (result) {
      assertValidToolResult(result, "tool_registry vision_tool");
    });
  }).then(function () {
    return registry.executeTool("missing_tool", infoState, {}).then(function () {
      assert.fail("missing tool should reject");
    }).catch(function (error) {
      assert.ok(String(error && error.message || error).indexOf("tool_not_found") >= 0);
    });
  });
}

function testReasonerPromptDiscipline() {
  var captured = {};
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makePromptCaptureGateway(captured),
    toolRegistry: makeToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "salta il differenziale quando accendo la caldaia",
    provider_hint: "openai"
  }).then(function () {
    assert.ok(captured.system_prompt.indexOf("Rispondi solo con JSON valido") >= 0);
    assert.ok(captured.system_prompt.indexOf("confirmed solo con evidenza forte e coerente") >= 0);
    assert.ok(captured.user_prompt.indexOf("Usa SOLO i campi previsti dal contratto.") >= 0);
    assert.ok(captured.user_prompt.indexOf("Non aggiungere campi nuovi.") >= 0);
    assert.ok(captured.user_prompt.indexOf("Evidenza parziale != diagnosi certa.") >= 0);
    assert.ok(captured.user_prompt.indexOf("Se ci sono ambiguita o contraddizioni, abbassa confidence.") >= 0);
    assert.ok(captured.user_prompt.indexOf("FATTI INCERTI O CONTRADDIZIONI:") >= 0);
    assert.ok(captured.user_prompt.indexOf("blocked_actions=") >= 0);
  });
}

function testPartialEvidenceScenarios() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeGateway([], false),
    toolRegistry: makeToolRegistry()
  });
  var scenarios = [
    "salta il differenziale quando accendo la caldaia",
    "presa non funziona ma luce presente in stanza",
    "motore tapparella ronza ma non parte"
  ];

  return Promise.all(scenarios.map(function (message) {
    return orchestrator.runDiagnosis({ message: message }).then(function (result) {
      assertDisciplinedResult(result, "partial:" + message);
      assert.notStrictEqual(result.case_state.final_confidence, "confirmed");
      assert.ok(result.case_state.next_action, "next_action mancante");
      assert.ok(
        result.case_state.next_action.action_type === "run_tool" ||
        result.case_state.next_action.action_type === "ask_user" ||
        result.case_state.next_action.action_type === "finalize"
      );
      assertTraceContains(result, [
        "orchestrator_start",
        "safety_guard",
        "loop_start",
        "loop_step",
        "loop_stop",
        "orchestrator_decision",
        "model_result",
        "diagnosis_applied",
        "case_state_validated",
        "response_formatter"
      ], "partial");
    });
  }));
}

function testContradictionScenarios() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeGateway([], false),
    toolRegistry: makeToolRegistry()
  });
  var scenarios = [
    "non c'è tensione alla presa ma misuro 230V fase neutro",
    "sintomo incompatibile con misura caricata: nessuna tensione ma tester segna 230V"
  ];

  return Promise.all(scenarios.map(function (message) {
    return orchestrator.runDiagnosis({ message: message }).then(function (result) {
      assertDisciplinedResult(result, "contradiction:" + message);
      assert.notStrictEqual(result.case_state.final_confidence, "confirmed");
      assert.strictEqual(result.case_state.safety.level, "attention");
      if (message.indexOf("sintomo incompatibile") >= 0) {
        assert.ok(result.case_state.safety.reasons.join(" ").toLowerCase().indexOf("contradd") >= 0);
      }
      assertTraceContains(result, [
        "orchestrator_start",
        "safety_guard",
        "loop_start",
        "loop_stop",
        "orchestrator_decision",
        "model_result",
        "diagnosis_applied",
        "case_state_validated"
      ], "contradiction");
    });
  }));
}

function testHighSafetyScenario() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeGateway([], false),
    toolRegistry: makeToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "odore di bruciato nel quadro, annerimento e scatto protezione"
  }).then(function (result) {
    assertDisciplinedResult(result, "high-safety");
    assert.strictEqual(result.case_state.safety.level, "stop");
    assert.ok(result.case_state.safety.blocked_actions.length > 0);
    assert.strictEqual(result.case_state.status, "closed");
    assert.strictEqual(result.case_state.next_action.action_type, "finalize");
    assertTraceContains(result, [
      "orchestrator_start",
      "safety_guard",
      "loop_start",
      "loop_stop",
      "orchestrator_decision",
      "model_result",
      "diagnosis_applied",
      "case_state_validated",
      "response_formatter"
    ], "high-safety");
    assert.strictEqual(countTraceStep(result, "loop_step"), 0);
    assert.strictEqual(
      result.case_state.runtime.trace.map(function (entry) { return entry.step; }).indexOf("tool_registry"),
      -1
    );
  });
}

function testProviderFallbackSuccess() {
  var capturedProviders = [];
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeFallbackGateway(capturedProviders),
    toolRegistry: makeToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "Il differenziale scatta quando attivo la cucina.",
    provider_hint: "openai"
  }).then(function (result) {
    assertDisciplinedResult(result, "provider-fallback");
    assert.ok(capturedProviders.length >= 1);
    capturedProviders.forEach(function (providerName) {
      assert.strictEqual(providerName, "openai");
    });
    assert.strictEqual(result.runtime_metadata.fallback_used, true);
    assert.strictEqual(result.runtime_metadata.fallback_reason, "provider_switch");
    assert.strictEqual(result.runtime_metadata.provider_used, "anthropic");
    assert.strictEqual(result.runtime_metadata.model_used, "fallback-model");
  });
}

function testStructuredInvalidReasonerOutputStaysDisciplined() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeStructuredInvalidGateway(),
    toolRegistry: makeToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "presa non funziona ma luce presente in stanza"
  }).then(function (result) {
    assertDisciplinedResult(result, "invalid-structured-reasoner");
    assert.strictEqual(result.case_state.final_confidence, "non_verifiable");
    assert.notStrictEqual(result.case_state.final_diagnosis, "assoluta");
    assertTraceContains(result, [
      "orchestrator_start",
      "safety_guard",
      "loop_start",
      "model_result",
      "diagnosis_applied",
      "case_state_validated"
    ], "invalid-structured-reasoner");
  });
}

function testUsefulVsUselessToolOutput() {
  var usefulOrchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeGateway([], false),
    toolRegistry: makeMeasuredToolRegistry()
  });
  var uselessOrchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeGateway([], false),
    toolRegistry: makeEmptyButValidToolRegistry()
  });

  return usefulOrchestrator.runDiagnosis({
    message: "Il differenziale scatta quando attivo la cucina."
  }).then(function (usefulResult) {
    assertDisciplinedResult(usefulResult, "useful-tool");
    assert.ok(usefulResult.case_state.measurements.length > 0);
    assert.ok(usefulResult.case_state.facts_confirmed.length > 0);
    assert.strictEqual(countTraceStep(usefulResult, "loop_tool_result_applied") >= 1, true);
    assert.strictEqual(countTraceStep(usefulResult, "loop_reasoner_rerun") >= 1, true);
    return uselessOrchestrator.runDiagnosis({
      message: "Il differenziale scatta quando attivo la cucina."
    });
  }).then(function (uselessResult) {
    assertDisciplinedResult(uselessResult, "useless-tool");
    assert.ok(uselessResult.case_state.facts_uncertain.join(" ").indexOf("Tool privo di evidenze utili.") >= 0);
    assertTraceContains(uselessResult, [
      "loop_start",
      "loop_tool_selected",
      "loop_tool_skipped",
      "loop_no_progress",
      "model_result",
      "diagnosis_applied",
      "case_state_validated"
    ], "useless-tool");
    assert.strictEqual(countTraceStep(uselessResult, "loop_tool_result_applied"), 0);
  });
}

function testLoopMalformedRerunStaysDisciplined() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeMalformedGateway(),
    toolRegistry: makeMeasuredToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "Il differenziale scatta quando attivo la cucina."
  }).then(function (result) {
    assertDisciplinedResult(result, "loop-malformed-rerun");
    assert.strictEqual(result.runtime_metadata.fallback_used, true);
    assert.strictEqual(result.runtime_metadata.fallback_reason, "invalid_reasoner_json");
    assertTraceContains(result, [
      "loop_start",
      "loop_tool_selected",
      "loop_tool_result_applied",
      "loop_reasoner_rerun",
      "model_result",
      "diagnosis_applied",
      "case_state_validated"
    ], "loop-malformed-rerun");
  });
}

function testLoopMaxStepsRespected() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeGateway([], false),
    toolRegistry: makeMeasuredToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "Calcola 6 kW e verifica perche il differenziale scatta in cucina.",
    max_steps: 1
  }).then(function (result) {
    assertDisciplinedResult(result, "loop-max-steps");
    assert.strictEqual(countTraceStep(result, "loop_step"), 1);
    assert.strictEqual(getLastTraceEntry(result, "loop_stop").details.reason, "max_steps_reached");
  });
}

function testLoopSafetyStopDoesNotInsist() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeGateway([], false),
    toolRegistry: makeMeasuredToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "quadro con fusione, annerimento e forte odore di bruciato"
  }).then(function (result) {
    assertDisciplinedResult(result, "loop-safety-stop");
    assert.strictEqual(result.case_state.safety.level, "stop");
    assert.strictEqual(countTraceStep(result, "loop_step"), 0);
    assert.strictEqual(getLastTraceEntry(result, "loop_stop").details.reason, "safety_stop");
  });
}

function testLoopTraceContainsEssentialSteps() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeGateway([], false),
    toolRegistry: makeMeasuredToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "Il differenziale scatta quando attivo la cucina."
  }).then(function (result) {
    assertTraceContains(result, [
      "loop_start",
      "loop_step",
      "loop_tool_selected",
      "loop_tool_result_applied",
      "loop_reasoner_rerun",
      "loop_progress",
      "loop_stop"
    ], "loop-trace");
  });
}

function testSameNextActionWithoutStateChangeStopsImmediately() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeSequenceGateway([{
      text: JSON.stringify({
        summary: "Nessuna nuova inferenza utile.",
        active: [],
        rejected: [],
        confidence: "non_verifiable"
      }),
      provider_used: "openai",
      model_used: "loop-model"
    }]),
    toolRegistry: makeRecognitionHypothesisRegistry()
  });

  return withPatchedPlanner({
    safety_level: "safe",
    safety_next_step: "",
    has_image: false,
    has_vision_tool: true,
    has_recognition_tool: false,
    has_calc_tool: false,
    has_knowledge_tool: false,
    has_closed_cases_tool: false,
    facts_confirmed_count: 0,
    measurements_count: 0,
    hypotheses_active_count: 0,
    missing_critical_data: []
  }, function () {
    return orchestrator.runDiagnosis({
      message: "motore tapparella ronza ma non parte",
      max_steps: 3
    }).then(function (result) {
      assertDisciplinedResult(result, "same-next-action");
      assert.strictEqual(countTraceStep(result, "loop_tool_selected"), 1);
      assert.strictEqual(countTraceStep(result, "loop_step"), 2);
      assert.strictEqual(getLastTraceEntry(result, "loop_stop").details.reason, "same_next_action_without_state_change");
    });
  });
}

function testSameToolWithoutProgressIsNotRepeated() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeGateway([], false),
    toolRegistry: makeEmptyButValidToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "Il differenziale scatta quando attivo la cucina.",
    max_steps: 3
  }).then(function (result) {
    assertDisciplinedResult(result, "same-tool-no-progress");
    assert.strictEqual(countTraceStep(result, "loop_tool_selected"), 1);
    assert.strictEqual(countTraceStep(result, "loop_tool_skipped"), 1);
    assert.strictEqual(getLastTraceEntry(result, "loop_stop").details.reason, "tool_result_without_progress");
  });
}

function testNextBestActionSelectsMeasurement() {
  var state = makeSelectionState("presa non funziona in cucina");
  var selection = orchestratorFactory.selectNextBestAction({
    caseState: state,
    loopState: {},
    availableActions: {
      primaryGap: "missing_measurement_voltage",
      primaryGapReason: "missing_voltage_measurement",
      actions: [{
        actionType: "request_measurement",
        target: "misura di tensione",
        reason: "manca una misura tecnica decisiva"
      }, {
        actionType: "suggest_check",
        target: "verifica locale della presa",
        reason: "serve una verifica tecnica concreta"
      }]
    }
  });

  assert.strictEqual(selection.primaryGap, "missing_measurement_voltage");
  assert.strictEqual(selection.selectedAction.actionType, "request_measurement");
}

function testNextBestActionSelectsPhoto() {
  var state = makeSelectionState("quadro elettrico annerito e pulsante bruciato");
  var selection = orchestratorFactory.selectNextBestAction({
    caseState: state,
    loopState: {},
    availableActions: {
      primaryGap: "missing_visual_panel",
      primaryGapReason: "missing_panel_visual",
      actions: [{
        actionType: "request_photo",
        target: "panel",
        reason: "manca evidenza visiva concreta"
      }, {
        actionType: "ask_user",
        target: "panel",
        reason: "serve chiarire il contesto visivo"
      }]
    }
  });

  assert.strictEqual(selection.primaryGap, "missing_visual_panel");
  assert.strictEqual(selection.selectedAction.actionType, "request_photo");
}

function testNextBestActionRejectsDuplicate() {
  var state = makeSelectionState("presa non funziona");
  state.checks_requested = ["misura di tensione"];

  var selection = orchestratorFactory.selectNextBestAction({
    caseState: state,
    loopState: {},
    availableActions: {
      primaryGap: "missing_measurement_voltage",
      actions: [{
        actionType: "request_measurement",
        target: "misura di tensione",
        reason: "manca una misura tecnica decisiva"
      }]
    }
  });

  assert.strictEqual(selection.selectedAction, null);
  assert.strictEqual(selection.rejectedActions[0].rejectReason, "duplicate");
}

function testNextBestActionRejectsGeneric() {
  var state = makeSelectionState("motore non parte");
  var selection = orchestratorFactory.selectNextBestAction({
    caseState: state,
    loopState: {},
    availableActions: {
      primaryGap: "missing_trip_context",
      actions: [{
        actionType: "ask_user",
        target: "unknown",
        reason: "serve controllo generico"
      }]
    }
  });

  assert.strictEqual(selection.selectedAction, null);
  assert.strictEqual(selection.rejectedActions[0].rejectReason, "generic");
}

function testNextBestActionRejectsUnsafe() {
  var state = makeSelectionState("odore di bruciato nel quadro");
  state.safety.level = "stop";

  var selection = orchestratorFactory.selectNextBestAction({
    caseState: state,
    loopState: {},
    availableActions: {
      primaryGap: "safety_block",
      actions: [{
        actionType: "request_measurement",
        target: "misura di tensione",
        reason: "manca una misura tecnica decisiva"
      }]
    }
  });

  assert.strictEqual(selection.selectedAction, null);
  assert.strictEqual(selection.rejectedActions[0].rejectReason, "unsafe");
}

function testNextBestActionPrefersConcreteAction() {
  var state = makeSelectionState("il differenziale scatta quando avvio la caldaia");
  var selection = orchestratorFactory.selectNextBestAction({
    caseState: state,
    loopState: {},
    availableActions: {
      primaryGap: "missing_measurement_voltage",
      actions: [{
        actionType: "request_measurement",
        target: "misura di isolamento verso terra",
        reason: "manca una misura tecnica decisiva"
      }, {
        actionType: "suggest_check",
        target: "verifica locale della linea cucina",
        reason: "serve una verifica tecnica concreta"
      }]
    }
  });

  assert.strictEqual(selection.selectedAction.actionType, "request_measurement");
  assert.strictEqual(selection.rejectedActions[0].rejectReason, "weaker_than_alternative");
}

function testDerivePrimaryGapSafetyBlock() {
  var state = makeSelectionState("odore di bruciato nel quadro");
  state.safety.level = "stop";
  assert.strictEqual(orchestratorFactory.derivePrimaryGap(state), "safety_block");
}

function testDerivePrimaryGapSufficientAnswer() {
  var state = makeSelectionState("differenziale scatta quando avvio la cucina");
  state.facts_confirmed = ["linea cucina identificata", "protezione differenziale coinvolta"];
  state.measurements = [{ type: "insulation", value: { value: 0.2, unit: "Mohm" } }];
  state.hypotheses_active = [{ label: "dispersione verso terra", reason: "misura coerente" }];
  state.final_confidence = "probable";
  assert.strictEqual(orchestratorFactory.derivePrimaryGap(state, { missing_critical_data: [] }), "sufficient_answer");
}

function testDerivePrimaryGapProtectionIdentity() {
  var state = makeSelectionState("la protezione scatta quando avvio la linea cucina");
  assert.strictEqual(orchestratorFactory.derivePrimaryGap(state, { missing_critical_data: [] }), "missing_protection_identity");
}

function testDerivePrimaryGapTripContext() {
  var state = makeSelectionState("il differenziale scatta");
  assert.strictEqual(orchestratorFactory.derivePrimaryGap(state, { missing_critical_data: [] }), "missing_trip_context");
}

function testDerivePrimaryGapDeviceIdentity() {
  var state = makeSelectionState("componente sconosciuto non funziona");
  assert.strictEqual(orchestratorFactory.derivePrimaryGap(state, { missing_critical_data: [] }), "missing_device_identity");
}

function testDerivePrimaryGapVisualPanel() {
  var state = makeSelectionState("quadro annerito con morsetti bruciati");
  state.safety.level = "attention";
  assert.strictEqual(orchestratorFactory.derivePrimaryGap(state, { missing_critical_data: [] }), "missing_visual_panel");
}

function testDerivePrimaryGapVisualDeviceLabel() {
  var state = makeSelectionState("serve la targhetta del motore per identificarlo");
  assert.strictEqual(orchestratorFactory.derivePrimaryGap(state, { missing_critical_data: [] }), "missing_visual_device_label");
}

function testDerivePrimaryGapMeasurementVoltage() {
  var state = makeSelectionState("presa non funziona, manca tensione in uscita");
  assert.strictEqual(orchestratorFactory.derivePrimaryGap(state, { missing_critical_data: [] }), "missing_measurement_voltage");
}

function testDerivePrimaryGapMeasurementCurrent() {
  var state = makeSelectionState("magnetotermico scatta quando accendo il forno per sovraccarico");
  assert.strictEqual(orchestratorFactory.derivePrimaryGap(state, { missing_critical_data: [] }), "missing_measurement_current");
}

function testDerivePrimaryGapDoesNotForceInsulationTooEarly() {
  var state = makeSelectionState("il differenziale scatta sulla linea cucina");
  assert.notStrictEqual(orchestratorFactory.derivePrimaryGap(state, { missing_critical_data: [] }), "missing_measurement_insulation");
}

function testCanonicalSuggestCheckProfiles() {
  var state = makeSelectionState("caso tecnico");
  var voltageState = makeSelectionState("presa non funziona con alimentazione assente sul punto utenza");
  var currentState = makeSelectionState("il magnetotermico scatta sotto carico con il forno acceso e il contesto di intervento e chiaro");
  var protectionCheck = orchestratorFactory.buildCanonicalSuggestedCheck({
    caseState: state,
    selectedAction: { actionType: "suggest_check" },
    primaryGap: "missing_protection_identity"
  });
  var tripCheck = orchestratorFactory.buildCanonicalSuggestedCheck({
    caseState: state,
    selectedAction: { actionType: "suggest_check" },
    primaryGap: "missing_trip_context"
  });
  var panelCheck = orchestratorFactory.buildCanonicalSuggestedCheck({
    caseState: state,
    selectedAction: { actionType: "suggest_check" },
    primaryGap: "missing_visual_panel"
  });
  var labelCheck = orchestratorFactory.buildCanonicalSuggestedCheck({
    caseState: state,
    selectedAction: { actionType: "suggest_check" },
    primaryGap: "missing_visual_device_label"
  });
  var voltageCheck = orchestratorFactory.buildCanonicalSuggestedCheck({
    caseState: voltageState,
    selectedAction: { actionType: "suggest_check" },
    primaryGap: "missing_measurement_voltage"
  });
  var currentCheck = orchestratorFactory.buildCanonicalSuggestedCheck({
    caseState: currentState,
    selectedAction: { actionType: "suggest_check" },
    primaryGap: "missing_measurement_current"
  });

  assert.strictEqual(protectionCheck.checkKey, "verify_trip_device_identity");
  assert.strictEqual(tripCheck.checkKey, "verify_trip_condition_context");
  assert.strictEqual(panelCheck.checkKey, "verify_panel_visual_context");
  assert.strictEqual(labelCheck.checkKey, "verify_device_nameplate");
  assert.strictEqual(voltageCheck.checkKey, "verify_voltage_presence");
  assert.strictEqual(currentCheck.checkKey, "verify_current_absorption");
  assert.ok(protectionCheck.instruction.length < 160);
  assert.ok(voltageCheck.instruction.toLowerCase().indexOf("verificare") >= 0);
}

function testCanonicalSuggestCheckAvoidsRiskyInsulation() {
  var state = makeSelectionState("il differenziale scatta sulla linea cucina");
  var check = orchestratorFactory.buildCanonicalSuggestedCheck({
    caseState: state,
    selectedAction: { actionType: "suggest_check" },
    primaryGap: "missing_measurement_insulation"
  });

  assert.ok(
    check.checkKey === "verify_trip_device_identity" ||
    check.checkKey === "verify_trip_condition_context" ||
    check.checkKey === "verify_panel_visual_context"
  );
}

function testNextBestActionReturnsNullWhenNoViableAction() {
  var state = makeSelectionState("caso generico");
  var selection = orchestratorFactory.selectNextBestAction({
    caseState: state,
    loopState: {},
    availableActions: {
      primaryGap: "missing_trip_context",
      actions: [{
        actionType: "ask_user",
        target: "unknown",
        reason: "serve controllo generico"
      }]
    }
  });

  assert.strictEqual(selection.selectedAction, null);
}

function testNextActionMetaPresentInPipeline() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeSequenceGateway([{
      text: JSON.stringify({
        summary: "Dati ancora insufficienti per chiudere in modo affidabile.",
        active: [],
        rejected: [],
        confidence: "non_verifiable"
      }),
      provider_used: "openai",
      model_used: "stub-model"
    }]),
    toolRegistry: makeToolRegistry()
  });

  return orchestrator.runDiagnosis({
    message: "la protezione scatta ma non e chiaro quale dispositivo interviene"
  }).then(function (result) {
    assertDisciplinedResult(result, "next-action-meta");
    assert.ok(result.nextActionMeta);
    assert.strictEqual(result.nextActionMeta.selectedActionType, "suggest_check");
    assert.ok(Object.prototype.hasOwnProperty.call(result.nextActionMeta, "selectedActionType"));
    assert.ok(Object.prototype.hasOwnProperty.call(result.nextActionMeta, "primaryGap"));
    assert.ok(Object.prototype.hasOwnProperty.call(result.nextActionMeta, "primaryGapReason"));
    assert.ok(Object.prototype.hasOwnProperty.call(result.nextActionMeta, "rejectedCount"));
    assert.ok(Object.prototype.hasOwnProperty.call(result.nextActionMeta, "canonicalCheckKey"));
    assert.ok(result.case_state.next_action_check);
    assert.ok(result.case_state.next_action_check.checkKey);
    assert.ok(result.case_state.next_action_check.instruction.length < 200);
  });
}

function testPrudentClosureVersusSupportedClosure() {
  var strongGateway = {
    runReasoner: function () {
      return Promise.resolve({
        text: JSON.stringify({
          summary: "Dispersione confermata da misura e comportamento coerente.",
          active: [{ label: "dispersione verso terra", reason: "misura coerente" }],
          rejected: [{ label: "sovraccarico puro", reason: "misure non coerenti" }],
          confidence: "confirmed"
        }),
        provider_used: "openai",
        model_used: "strong-model",
        fallback_used: false,
        fallback_reason: null
      });
    },
    runOcr: function () {
      return Promise.resolve({
        text: "",
        provider_used: "openai",
        model_used: "strong-ocr",
        fallback_used: false,
        fallback_reason: null
      });
    }
  };
  var strongOrchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: strongGateway,
    toolRegistry: makeStrongDispersionToolRegistry()
  });
  var weakOrchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: strongGateway,
    toolRegistry: makeToolRegistry()
  });

  return strongOrchestrator.runDiagnosis({
    message: "Il differenziale scatta quando attivo la cucina."
  }).then(function (strongResult) {
    assertDisciplinedResult(strongResult, "strong-closure");
    assert.ok(strongResult.evidenceMeta);
    assert.strictEqual(strongResult.evidenceMeta.topHypothesisCoverage, "supported");
    assert.strictEqual(strongResult.case_state.strongestHypothesisMeta.coverageLevel, "supported");
    assert.strictEqual(strongResult.case_state.final_confidence, "confirmed");
    return weakOrchestrator.runDiagnosis({
      message: "odore di bruciato nel quadro, annerimento e scatto protezione"
    });
  }).then(function (weakResult) {
    assertDisciplinedResult(weakResult, "weak-closure");
    assert.notStrictEqual(weakResult.case_state.final_confidence, "confirmed");
    assert.strictEqual(weakResult.case_state.safety.level, "stop");
  });
}

function run() {
  console.log("\n[rocco-v2-core] start");
  testCaseStateContract();
  testCaseStateNormalization();
  testFormatterNeutrality();

  return testUnifiedOrchestrator().then(function () {
    return testFallbackMetadata();
  }).then(function () {
    return testMalformedReasonerFallback();
  }).then(function () {
    return testInvalidToolOutputRejected();
  }).then(function () {
    return testToolContracts();
  }).then(function () {
    return testReasonerPromptDiscipline();
  }).then(function () {
    return testPartialEvidenceScenarios();
  }).then(function () {
    return testContradictionScenarios();
  }).then(function () {
    return testHighSafetyScenario();
  }).then(function () {
    return testProviderFallbackSuccess();
  }).then(function () {
    return testStructuredInvalidReasonerOutputStaysDisciplined();
  }).then(function () {
    return testUsefulVsUselessToolOutput();
  }).then(function () {
    return testLoopMalformedRerunStaysDisciplined();
  }).then(function () {
    return testLoopMaxStepsRespected();
  }).then(function () {
    return testLoopSafetyStopDoesNotInsist();
  }).then(function () {
    return testLoopTraceContainsEssentialSteps();
  }).then(function () {
    return testSameNextActionWithoutStateChangeStopsImmediately();
  }).then(function () {
    return testSameToolWithoutProgressIsNotRepeated();
  }).then(function () {
    testAmbiguousLowContextClampActive();
    return testAmbiguousRcdDoesNotExposeInsulationBranch();
  }).then(function () {
    return testAmbiguousNoPhotoNoMeasurementsPrefersContextOrPhoto();
  }).then(function () {
    testAmbiguousNoSafeActionStopsPrudently();
    testEvidenceWeightMeasurementBeatsVagueText();
    testEvidenceObservationBeatsWeakInference();
    testConflictedHypothesisDoesNotBeatMeasuredEvidence();
    testSupportedHypothesisBeatsWeakHypothesis();
    return testCoverageDrivenConfidenceAndEvidenceMeta();
  }).then(function () {
    testNextBestActionSelectsMeasurement();
    testNextBestActionSelectsPhoto();
    testNextBestActionRejectsDuplicate();
    testNextBestActionRejectsGeneric();
    testNextBestActionRejectsUnsafe();
    testNextBestActionPrefersConcreteAction();
    testDerivePrimaryGapSafetyBlock();
    testDerivePrimaryGapSufficientAnswer();
    testDerivePrimaryGapProtectionIdentity();
    testDerivePrimaryGapTripContext();
    testDerivePrimaryGapDeviceIdentity();
    testDerivePrimaryGapVisualPanel();
    testDerivePrimaryGapVisualDeviceLabel();
    testDerivePrimaryGapMeasurementVoltage();
    testDerivePrimaryGapMeasurementCurrent();
    testDerivePrimaryGapDoesNotForceInsulationTooEarly();
    testCanonicalSuggestCheckProfiles();
    testCanonicalSuggestCheckAvoidsRiskyInsulation();
    testNextBestActionReturnsNullWhenNoViableAction();
    return testNextActionMetaPresentInPipeline();
  }).then(function () {
    return testRealCaseRegressionPack();
  }).then(function () {
    return testPrudentClosureVersusSupportedClosure();
  }).then(function () {
    console.log("[rocco-v2-core] ok");
  });
}

run().catch(function (error) {
  console.error("[rocco-v2-core] fail:", error && error.stack ? error.stack : error);
  process.exit(1);
});
