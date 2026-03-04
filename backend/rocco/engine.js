"use strict";
/**
 * engine.js — ROCCO FOUNDATION ENGINE (BT civile/industriale)
 * Pipeline: domainGuard → componentRecognizer → numericRecognizer
 *           → basicPatterns → scoreHypotheses → questionBuilder → output
 *
 * Questo modulo è addizionale rispetto al diagnosticEngine principale.
 * Viene usato da server.js per arricchire il contesto prima della chiamata LLM.
 * Non cambia il formato di output ROCCO (OSSERVAZIONI/IPOTESI/VERIFICHE/RISCHI).
 */

const { isOutOfScope, outOfScopeResponse } = require("./domainGuard");
const { extractComponents, formatComponents } = require("./componentRecognizer");
const { extractElectricalValues, formatElectricalValues, checkAnomalies } = require("./numericRecognizer");
const { scoreHypotheses } = require("./scoringEngine");
const { buildQuestions } = require("./questionBuilder");
const { patterns: basicPatterns } = require("./patterns/basicPatterns");

/**
 * Esegue il pattern matching sui basicPatterns.
 * @param {string} text
 * @returns {object|null} il primo pattern che fa match, oppure null
 */
function matchBasicPattern(text) {
  if (!text) return null;
  var t = String(text).toLowerCase();
  for (var i = 0; i < basicPatterns.length; i++) {
    var p = basicPatterns[i];
    if (!Array.isArray(p.keywords)) continue;
    for (var j = 0; j < p.keywords.length; j++) {
      if (t.indexOf(String(p.keywords[j]).toLowerCase()) >= 0) {
        return p;
      }
    }
  }
  return null;
}

/**
 * Formatta il risultato del foundation engine come testo per il contesto LLM.
 * @param {object} result
 * @returns {string}
 */
function formatFoundationContext(result) {
  if (!result || result.outOfScope) return "";
  var lines = [];

  if (result.components && result.components.length) {
    lines.push("COMPONENTI RILEVATI (Foundation): " + result.components.join(", "));
  }
  if (result.numericSummary) {
    lines.push("VALORI ELETTRICI: " + result.numericSummary);
  }
  if (result.patternId) {
    lines.push("PATTERN TROVATO: " + result.patternId);
  }
  if (result.hypotheses && result.hypotheses.length) {
    lines.push("IPOTESI ORDINATE:");
    result.hypotheses.forEach(function (h, idx) {
      var cert = (h && h.certainty) ? "[" + h.certainty + "]" : "";
      lines.push("  " + (idx + 1) + ") " + cert + " " + (h && h.text || ""));
    });
  }
  if (result.questions && result.questions.length) {
    lines.push("DOMANDE SUGGERITE PER L'UTENTE:");
    result.questions.forEach(function (q, idx) {
      lines.push("  " + (idx + 1) + ") " + q);
    });
  }

  return lines.join("\n");
}

/**
 * Esegue la pipeline Foundation Engine.
 * @param {string} userMessage
 * @returns {object} { outOfScope, components, numericValues, numericSummary, anomalies, patternId, hypotheses, checks, risks, questions, safetyLock, formattedContext }
 */
function runFoundationEngine(userMessage) {
  var text = String(userMessage || "");

  // 1) Controllo dominio
  if (isOutOfScope(text)) {
    var oos = outOfScopeResponse();
    oos.outOfScope = true;
    oos.safetyLock = true;
    oos.formattedContext = "";
    return oos;
  }

  // 2) Estrazione componenti
  var components = [];
  try {
    components = extractComponents(text) || [];
  } catch (e) {
    console.warn("⚠️ Foundation: extractComponents error:", e && e.message);
  }

  // 3) Estrazione valori elettrici
  var numericValues = {};
  var numericSummary = "";
  var anomalies = [];
  try {
    numericValues = extractElectricalValues(text) || {};
    numericSummary = formatElectricalValues(numericValues) || "";
    anomalies = checkAnomalies(numericValues) || [];
  } catch (e) {
    console.warn("⚠️ Foundation: numericRecognizer error:", e && e.message);
  }

  // 4) Pattern matching
  var matchedPattern = matchBasicPattern(text);
  var patternId = matchedPattern ? matchedPattern.id : null;
  var rawHypotheses = matchedPattern ? (matchedPattern.hypotheses || []) : [];
  var checks = matchedPattern ? (matchedPattern.checks || []) : [];
  var risks = matchedPattern ? (matchedPattern.risks || []) : [];

  // 5) Scoring ipotesi
  var hypotheses = scoreHypotheses(rawHypotheses);

  // 6) Domande
  var questions = buildQuestions(components);

  // 7) Safety lock per anomalie (MT/AT voltages già bloccati da isOutOfScope)
  var safetyLock = anomalies.some(function (a) {
    return a && (a.toLowerCase().indexOf("mt") >= 0 || a.toLowerCase().indexOf("alta tensione") >= 0);
  });

  var result = {
    outOfScope: false,
    components: components,
    numericValues: numericValues,
    numericSummary: numericSummary,
    anomalies: anomalies,
    patternId: patternId,
    hypotheses: hypotheses,
    checks: checks,
    risks: risks,
    questions: questions,
    safetyLock: safetyLock
  };

  result.formattedContext = formatFoundationContext(result);
  return result;
}

module.exports = {
  runFoundationEngine: runFoundationEngine,
  formatFoundationContext: formatFoundationContext,
  matchBasicPattern: matchBasicPattern
};
