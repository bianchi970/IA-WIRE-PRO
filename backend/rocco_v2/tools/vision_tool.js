"use strict";

var analyzePanel = require("../../vision/analyzePanel").analyzePanel;
var lexicon = require("../lexicon");

function buildImageDataUrl(imageBuffer, mimeType) {
  if (!Buffer.isBuffer(imageBuffer)) return null;
  return "data:" + (mimeType || "image/jpeg") + ";base64," + imageBuffer.toString("base64");
}

function run(caseState, context) {
  var imageBuffer = context && context.image_buffer;
  var providerGateway = context && context.providerGateway;
  var mimeType = context && context.image_mime_type ? context.image_mime_type : "image/jpeg";

  if (!Buffer.isBuffer(imageBuffer)) {
    return Promise.resolve({
      tool_name: "vision_tool",
      ok: false,
      evidence: [],
      measurements: [],
      warnings: ["Nessuna immagine disponibile per la vision pipeline."],
      summary: "Vision non eseguita.",
      raw_ref: null
    });
  }

  return analyzePanel(imageBuffer, "rocco_v2_" + Date.now(), {
    userText: caseState.problem_summary,
    callOcr: function (buffer, prompt) {
      if (!providerGateway || typeof providerGateway.runOcr !== "function") {
        return Promise.resolve("");
      }
      return providerGateway.runOcr({
        prompt: prompt,
        image_b64: buffer.toString("base64"),
        image_data_url: buildImageDataUrl(buffer, mimeType),
        mime_type: mimeType,
        requested_provider: context && context.provider_hint
      }).then(function (response) {
        return response && response.text ? response.text : "";
      }).catch(function () {
        return "";
      });
    }
  }).then(function (result) {
    // Qui finivano slug e annotazioni nelle OSSERVAZIONI dell'utente
    // ("rcd-ac-2p conf=0.8"). Il lessico esiste per tradurli; i punteggi
    // restano in result.components per chi li usa.
    var evidence = (result.components || []).map(function (item) {
      return lexicon.humanizeComponent(item.component_id) || String(item.component_id || "");
    }).filter(Boolean);
    return {
      tool_name: "vision_tool",
      ok: true,
      evidence: evidence,
      measurements: [],
      warnings: result.warnings || [],
      summary: "Vision completata con " + evidence.length + " candidati.",
      raw_ref: result
    };
  });
}

module.exports = {
  run: run
};
