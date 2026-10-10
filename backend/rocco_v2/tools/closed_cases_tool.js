"use strict";

var memory = require("../memory");

function run(caseState) {
  var matches = memory.findRelevantClosedCases(caseState, 3);
  return Promise.resolve({
    tool_name: "closed_cases_tool",
    ok: true,
    evidence: matches.map(function (item) {
      return item.summary + " | causa=" + item.confirmed_cause;
    }),
    measurements: [],
    warnings: [],
    summary: matches.length ? "Trovati " + matches.length + " casi chiusi simili." : "Nessun caso chiuso simile.",
    raw_ref: matches
  });
}

module.exports = {
  run: run
};
