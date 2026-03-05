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
const { recognizeComponents, buildRoccoContext } = require("./recognitionEngine");

/**
 * Esegue il pattern matching sui basicPatterns con algoritmo best-match.
 * Ogni pattern riceve un punteggio: somma delle lunghezze delle keyword matchate.
 * Keyword più lunghe pesano di più → pattern specifici battono quelli generici.
 * @param {string} text
 * @returns {object|null} il pattern con punteggio più alto, oppure null
 */
function matchBasicPattern(text) {
  if (!text) return null;
  var t = String(text).toLowerCase();
  var bestPattern = null;
  var bestScore = 0;

  for (var i = 0; i < basicPatterns.length; i++) {
    var p = basicPatterns[i];
    if (!Array.isArray(p.keywords)) continue;
    var score = 0;
    for (var j = 0; j < p.keywords.length; j++) {
      var kw = String(p.keywords[j]).toLowerCase();
      if (t.indexOf(kw) >= 0) {
        // keyword più lunghe valgono di più (peso = lunghezza keyword)
        score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestPattern = p;
    }
  }

  return bestPattern;
}

/**
 * Formatta il risultato del foundation engine come testo per il contesto LLM.
 * @param {object} result
 * @returns {string}
 */
function formatFoundationContext(result) {
  if (!result || result.outOfScope) return "";
  var lines = [];

  // ── Contratto ROCCO v2 (ha priorità, include scoring + regole risposta) ──
  if (result.roccoContract) {
    lines.push(result.roccoContract);
    lines.push("");
  }

  // ── Valori elettrici ──
  if (result.numericSummary) {
    lines.push("VALORI ELETTRICI: " + result.numericSummary);
  }

  // ── Pattern matching (v1) ──
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

  // 2) Estrazione componenti (v1 backward compat)
  var components = [];
  try {
    components = extractComponents(text) || [];
  } catch (e) {
    console.warn("⚠️ Foundation: extractComponents error:", e && e.message);
  }

  // 2b) Recognition engine v2: scoring 0..1 con contratto ROCCO
  var recResults = [];
  var recContext = "";
  try {
    recResults = recognizeComponents(text) || [];
    recContext  = buildRoccoContext(text)  || "";
  } catch (e) {
    console.warn("⚠️ Foundation: recognitionEngine v2 error:", e && e.message);
  }

  // Integra componenti v2 (HIGH/MEDIUM) nella lista v1 per backward compat
  try {
    recResults.forEach(function(r) {
      if ((r.band === "HIGH" || r.band === "MEDIUM") &&
          components.indexOf(r.component_id) < 0) {
        components.push(r.component_id);
      }
    });
  } catch (e) { /* silent */ }

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
    // v2 recognition
    componentScores: recResults,
    highComponents:  recResults.filter(function(r) { return r.band === "HIGH";   }),
    mediumComponents:recResults.filter(function(r) { return r.band === "MEDIUM"; }),
    lowComponents:   recResults.filter(function(r) { return r.band === "LOW";    }),
    roccoContract:   recContext,
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
