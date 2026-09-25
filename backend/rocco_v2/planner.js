"use strict";

function hasToolResult(caseState, toolName) {
  var i;
  for (i = 0; i < caseState.tool_results.length; i += 1) {
    if (caseState.tool_results[i] && caseState.tool_results[i].tool_name === toolName) return true;
  }
  return false;
}

function buildPlanningFrame(caseState) {
  return {
    safety_level: caseState.safety.level || "safe",
    safety_next_step: caseState.safety.allowed_next_step || "",
    has_image: !!(caseState.runtime && caseState.runtime.has_image),
    has_vision_tool: hasToolResult(caseState, "vision_tool"),
    has_recognition_tool: hasToolResult(caseState, "recognition_tool"),
    has_calc_tool: hasToolResult(caseState, "calc_tool"),
    has_knowledge_tool: hasToolResult(caseState, "knowledge_lookup_tool"),
    has_closed_cases_tool: hasToolResult(caseState, "closed_cases_tool"),
    facts_confirmed_count: Array.isArray(caseState.facts_confirmed) ? caseState.facts_confirmed.length : 0,
    measurements_count: Array.isArray(caseState.measurements) ? caseState.measurements.length : 0,
    hypotheses_active_count: Array.isArray(caseState.hypotheses_active) ? caseState.hypotheses_active.length : 0,
    missing_critical_data: Array.isArray(caseState.missing_critical_data)
      ? caseState.missing_critical_data.slice(0)
      : []
  };
}

module.exports = {
  buildPlanningFrame: buildPlanningFrame
};
