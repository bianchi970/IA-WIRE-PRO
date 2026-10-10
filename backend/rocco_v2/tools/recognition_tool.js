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
    evidence: legacyComponents.concat(scoredComponents.map(function (item) {
      return item.component_name + " conf=" + item.confidence.toFixed(2);
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
