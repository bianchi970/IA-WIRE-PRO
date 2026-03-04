"use strict";
/**
 * scoringEngine.js — ordina le ipotesi per punteggio di certezza.
 * Certainty: ALTA (70pt) > MEDIA (50pt) > BASSA (30pt).
 * In caso di parità conserva l'ordine originale (stabile).
 */

var CERTAINTY_SCORES = {
  "ALTA":  70,
  "alta":  70,
  "MEDIA": 50,
  "media": 50,
  "BASSA": 30,
  "bassa": 30
};

/**
 * Assegna un punteggio numerico alla certezza.
 * @param {string} certainty
 * @returns {number}
 */
function scoreForCertainty(certainty) {
  return CERTAINTY_SCORES[String(certainty || "").trim()] || 50;
}

/**
 * Ordina le ipotesi per punteggio di certezza decrescente.
 * L'ordine originale viene preservato a parità di punteggio (stable sort).
 * @param {Array<{text:string, certainty:string}>} hypotheses
 * @returns {Array<{text:string, certainty:string}>}
 */
function scoreHypotheses(hypotheses) {
  if (!Array.isArray(hypotheses)) return [];
  // Aggiunge indice per sort stabile
  var indexed = hypotheses.map(function (h, i) {
    return { h: h, score: scoreForCertainty(h && h.certainty), idx: i };
  });
  indexed.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.idx - b.idx;
  });
  return indexed.map(function (item) { return item.h; });
}

module.exports = { scoreHypotheses: scoreHypotheses, scoreForCertainty: scoreForCertainty };
