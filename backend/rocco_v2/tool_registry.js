"use strict";

var contracts = require("./contracts");
var calcTool = require("./tools/calc_tool");
var visionTool = require("./tools/vision_tool");
var recognitionTool = require("./tools/recognition_tool");

// Qui erano registrati anche `closed_cases_tool` e `knowledge_lookup_tool`.
// Ritirati: `decideToolNeeded()` nell'orchestratore può restituire soltanto
// vision/calc/recognition, quindi quei due non venivano **mai** selezionati —
// li invocava solo il loop legacy, attraverso `planner.js`.
//
// Non è conoscenza persa, sono doppie strade: i casi chiusi entrano nel
// ragionamento da `ragionaPerAnalogia()` (che li legge dalla stessa memoria,
// `rocco_v2/memory.js`) e la knowledge base locale da `ragionaDaKnowledge()`.
// Uno strumento registrato e non raggiungibile è peggio di nessuno
// strumento: fa credere che una capacità ci sia.
function createRegistry() {
  var tools = {
    calc_tool: calcTool,
    vision_tool: visionTool,
    recognition_tool: recognitionTool
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
