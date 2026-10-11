"use strict";

/**
 * IL CONTRATTO DEL MOTORE ATTUALE.
 *
 *   cd backend && node test/motore_attuale.test.js
 *
 * Nasce da `test/rocco-v2-core.test.js`, che era **il contratto di un
 * altro motore** e stava in repo rossa da sempre. Quella suite pretendeva
 * i passi di traccia del loop legacy (`loop_start`, `loop_tool_selected`,
 * `loop_stop`, `model_result`) e chiamava funzioni che sul modulo attuale
 * non esistono: `derivePrimaryGap`, `selectNextBestAction`,
 * `scoreEvidenceWeight`, `resolveEvidenceConflicts`,
 * `buildCanonicalSuggestedCheck`, `isAmbiguousLowContextCase`.
 *
 * Misurato provando ogni funzione in isolamento contro il motore attuale:
 * **8 verdi su 52**. Le 52 non erano copertura latente — il runner si
 * fermava al PRIMO fallimento (`testInvalidToolOutputRejected`), quindi le
 * 35 funzioni successive non sono mai state eseguite, e 22 di loro
 * lanciavano `TypeError` sulla prima riga.
 *
 * Qui restano quelle 8, con il testo delle asserzioni **estratto**, non
 * riscritto da me. Non sono poche cose ovvie: due di loro hanno trovato i
 * difetti dei metadati (`runtime_trace` che arrivava null, `fallback_used`
 * mai dichiarato), ed è l'unico posto dove si verifica che il
 * formattatore non alteri la diagnosi e che il contratto del case_state
 * regga.
 *
 * Due differenze volute rispetto all'originale:
 *  · **il runner esegue tutto e poi conta.** Fermarsi al primo
 *    fallimento è il motivo per cui 35 test sono rimasti invisibili per
 *    mesi: una suite rossa che nasconde quanto è rossa.
 *  · niente `planner`, `verifier`, `closed_cases_tool`,
 *    `knowledge_lookup_tool`: ritirati insieme al loop legacy.
 */

var assert = require("assert");
var contracts = require("../rocco_v2/contracts");
var caseStateHelpers = require("../rocco_v2/case_state");
var orchestratorFactory = require("../rocco_v2/orchestrator");
var responseFormatter = require("../rocco_v2/response_formatter");
var toolRegistryFactory = require("../rocco_v2/tool_registry");
var calcTool = require("../rocco_v2/tools/calc_tool");
var recognitionTool = require("../rocco_v2/tools/recognition_tool");
var visionTool = require("../rocco_v2/tools/vision_tool");

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

function isCanonicalStatus(value) {
  return ["open", "in_progress", "blocked", "closed"].indexOf(value) >= 0;
}

function isCanonicalConfidence(value) {
  return ["confirmed", "probable", "non_verifiable"].indexOf(value) >= 0;
}

function assertDisciplinedResult(result, label) {
  var caseValidation = contracts.validateCaseState(result.case_state);
  var runtimeValidation = contracts.validateRuntimeMetadata(result.runtime_metadata);
  assert.strictEqual(caseValidation.valid, true, (label || "case_state") + ": " + caseValidation.errors.join(", "));
  assert.strictEqual(runtimeValidation.valid, true, (label || "runtime_metadata") + ": " + runtimeValidation.errors.join(", "));
  assert.strictEqual(isCanonicalStatus(result.case_state.status), true, (label || "status") + ": non-canonical");
  assert.strictEqual(isCanonicalConfidence(result.case_state.final_confidence), true, (label || "confidence") + ": non-canonical");
}

function assertValidToolResult(result, label) {
  var validation = contracts.validateToolResult(result);
  assert.strictEqual(validation.valid, true, label + ": " + validation.errors.join(", "));
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
  // Era `verifier.verifyFormatterNeutrality()`: un confronto di JSON
  // travestito da modulo del motore. È un'asserzione, e sta qui.
  assert.strictEqual(
    JSON.stringify(formatted.diagnosis_snapshot),
    JSON.stringify(snapshot),
    "il formattatore ha alterato la diagnosi"
  );
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

// Rende deterministica la premessa dei due contratti sul ripiego: il
// ripiego esiste solo se ROCCO consulta davvero il ragionatore, e quella
// decisione la influenza il punteggio di novità del neurale — che cambia
// con lo stato appreso sul disco. Misurato: con lo stato accumulato questi
// due test passavano, con `data/neural/` vuota no. Passavano per fortuna.
function neuraleCheChiedeAiuto() {
  return {
    shouldCallAI: function () { return { needed: true, reason: "premessa del test" }; }
  };
}

function testFallbackMetadata() {
  var orchestrator = orchestratorFactory.createOrchestrator({
    providerGateway: makeGateway([], true),
    toolRegistry: makeToolRegistry(),
    neuralIntegration: neuraleCheChiedeAiuto()
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
    toolRegistry: makeToolRegistry(),
    neuralIntegration: neuraleCheChiedeAiuto()
  });

  // La premessa — ROCCO consulta davvero l'IA — è ora dichiarata dal
  // neurale finto sopra, non sperata dal messaggio. Le asserzioni restano
  // identiche: cambia la premessa, non la pretesa.
  return orchestrator.runDiagnosis({
    message: "Il differenziale scatta senza motivo apparente."
  }).then(function (result) {
    assert.strictEqual(result.runtime_metadata.fallback_used, true);
    assert.strictEqual(result.runtime_metadata.fallback_reason, "invalid_reasoner_json");
    assert.strictEqual(contracts.validateCaseState(result.case_state).valid, true);
    assert.strictEqual(isCanonicalStatus(result.case_state.status), true);
    assert.strictEqual(isCanonicalConfidence(result.case_state.final_confidence), true);
  });
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

// ── Il runner: esegue tutto, poi conta ───────────────────────────────
var PROVE = [
  ["contratto del case_state", testCaseStateContract],
  ["normalizzazione del case_state", testCaseStateNormalization],
  ["il formattatore non altera la diagnosi", testFormatterNeutrality],
  ["orchestratore unificato", testUnifiedOrchestrator],
  ["metadati del ripiego", testFallbackMetadata],
  ["JSON del ragionatore malformato", testMalformedReasonerFallback],
  ["contratto degli strumenti", testToolContracts],
  ["ripiego fra provider riuscito", testProviderFallbackSuccess]
];

var falliti = [];
var catena = Promise.resolve();

PROVE.forEach(function (prova) {
  catena = catena.then(function () {
    var esito;
    try {
      esito = prova[1]();
    } catch (error) {
      falliti.push([prova[0], error]);
      return;
    }
    if (esito && typeof esito.then === "function") {
      return esito.then(null, function (error) { falliti.push([prova[0], error]); });
    }
  });
});

catena.then(function () {
  console.log("\n============================================================");
  console.log("MOTORE ATTUALE: " + (PROVE.length - falliti.length) + " passed, " + falliti.length + " failed");
  console.log("============================================================");
  falliti.forEach(function (f) {
    console.log("\n  \u2717 " + f[0]);
    console.log("    " + String(f[1] && f[1].message || f[1]).split("\n").join("\n    "));
  });
  process.exit(falliti.length === 0 ? 0 : 1);
});
