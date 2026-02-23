"use strict";

const { TECH_REPORT_SECTIONS, CONFIDENCE_LEVELS } = require("./policies");

function normalizeNewlines(text) {
  return (text || "").replace(/\r\n/g, "\n").trim();
}

function ensureSection(text, section) {
  const regex = new RegExp("^" + section + "\\s*:", "m");
  if (regex.test(text)) return text;

  return (
    text.trim() +
    "\n\n" +
    section +
    ":\n- (da compilare)\n"
  );
}

function ensureConfidence(text) {
  const found = CONFIDENCE_LEVELS.some((lvl) =>
    new RegExp("\\b" + lvl + "\\b", "i").test(text)
  );

  if (found) return text;

  return (
    text.trim() +
    "\n\nLIVELLO DI CERTEZZA:\n- Non verificabile\n"
  );
}

function postcheck(answerText) {
  let output = normalizeNewlines(answerText);

  TECH_REPORT_SECTIONS.forEach((section) => {
    output = ensureSection(output, section);
  });

  output = ensureConfidence(output);

  return output.trim();
}

module.exports = { postcheck };