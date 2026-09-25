"use strict";

var contracts = require("./contracts");
var calcTool = require("./tools/calc_tool");
var visionTool = require("./tools/vision_tool");
var recognitionTool = require("./tools/recognition_tool");
var closedCasesTool = require("./tools/closed_cases_tool");
var knowledgeLookupTool = require("./tools/knowledge_lookup_tool");

function createRegistry() {
  var tools = {
    calc_tool: calcTool,
    vision_tool: visionTool,
    recognition_tool: recognitionTool,
    closed_cases_tool: closedCasesTool,
    knowledge_lookup_tool: knowledgeLookupTool
  };

  return {
    executeTool: function (toolName, caseState, context) {
      var tool = tools[toolName];
      if (!tool || typeof tool.run !== "function") {
        return Promise.reject(new Error("tool_not_found:" + toolName));
      }

      return tool.run(caseState, context || {}).then(function (result) {
        var validation = contracts.validateToolResult(result);
        if (!validation.valid) {
          throw new Error("tool_result_invalid:" + validation.errors.join(","));
        }
        return result;
      });
    }
  };
}

module.exports = {
  createRegistry: createRegistry
};
