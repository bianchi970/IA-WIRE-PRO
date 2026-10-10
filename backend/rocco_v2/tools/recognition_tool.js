"use strict";

var componentRecognizer = require("../../rocco/componentRecognizer");
var numericRecognizer = require("../../rocco/numericRecognizer");

function run(caseState) {
  var text = caseState.problem_summary || "";
  var legacyComponents = componentRecognizer.extractComponents(text);
  var scoredComponents = componentRecognizer.recognizeComponents(text);
  var values = numericRecognizer.extractElectricalValues(text);
  var warnings = numericRecognizer.checkAnomalies(values);
  var measurementList = [];

  Object.keys(values).forEach(function (key) {
    values[key].forEach(function (item) {
      measurementList.push({ type: key, value: item });
    });
  });

  return Promise.resolve({
    tool_name: "recognition_tool",
    ok: true,
    // `evidence` finisce in facts_confirmed e da lì nelle OSSERVAZIONI che
    // legge l'elettricista: ci va il nome del componente, non l'annotazione
    // del riconoscitore. Usciva "Differenziale conf=0.70". Il punteggio
    // resta in raw_ref.scored_components, che è dove lo cerca chi lo usa
    // (orchestrator_legacy): nessuno leggeva "conf=" da qui.
    evidence: legacyComponents.concat(scoredComponents.map(function (item) {
      return item.component_name;
    })),
    measurements: measurementList,
    warnings: warnings,
    summary: "Recognition completata.",
    raw_ref: {
      legacy_components: legacyComponents,
      scored_components: scoredComponents,
      values: values
    }
  });
}

module.exports = {
  run: run
};
