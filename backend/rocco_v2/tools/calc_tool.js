"use strict";

var calcEngine = require("../../rocco/calcEngine");

function run(caseState) {
  var result = calcEngine.runCalcEngine(caseState.problem_summary || "");
  return Promise.resolve({
    tool_name: "calc_tool",
    ok: !!result.hasCalc,
    evidence: result.hasCalc ? [result.context.replace(/\s+/g, " ").trim()] : [],
    measurements: [],
    warnings: [],
    summary: result.hasCalc ? "Calcoli tecnici disponibili." : "Nessun calcolo applicabile.",
    raw_ref: result.results || null
  });
}

module.exports = {
  run: run
};
