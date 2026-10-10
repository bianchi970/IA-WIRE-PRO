"use strict";

var knowledge = require("../../knowledge");

function run(caseState) {
  var context = knowledge.fetchKnowledgeContext(caseState.problem_summary || "");
  return Promise.resolve({
    tool_name: "knowledge_lookup_tool",
    ok: !!context,
    evidence: context ? [context.replace(/\s+/g, " ").trim()] : [],
    measurements: [],
    warnings: [],
    summary: context ? "Knowledge base locale consultata." : "Knowledge base non pertinente o vuota.",
    raw_ref: context || null
  });
}

module.exports = {
  run: run
};
