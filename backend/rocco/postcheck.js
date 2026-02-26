"use strict";

const { TECH_REPORT_SECTIONS, CONFIDENCE_LEVELS, BANNED_PHRASES } = require("./policies");

function normalizeNewlines(text) {
  return (text || "").replace(/\r\n/g, "\n").trim();
}

function ensureSection(text, section) {
  const regex = new RegExp("^" + section + "\\s*:", "m");
  if (regex.test(text)) return text;
  return text.trim() + "\n\n" + section + ":\n- (da compilare)\n";
}

function ensureConfidence(text) {
  const found = CONFIDENCE_LEVELS.some((lvl) =>
    new RegExp("\\[" + lvl + "\\]", "i").test(text)
  );
  if (found) return text;
  // Aggiunge placeholder solo se IPOTESI esiste ma manca il prefisso
  return text.replace(
    /^(IPOTESI\s*:)/m,
    "IPOTESI:\n- [DA_VERIFICARE] Nessuna ipotesi formulabile con i dati attuali."
  ) || text;
}

// Rileva e segnala frasi vietate senza alterare il testo (solo log warning)
function warnBannedPhrases(text) {
  BANNED_PHRASES.forEach((phrase) => {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      console.warn("[POSTCHECK] Frase vietata rilevata: \"" + phrase + "\"");
    }
  });
}

function postcheck(answerText) {
  let output = normalizeNewlines(answerText);

  // 1) Garantisce che tutte le sezioni siano presenti
  TECH_REPORT_SECTIONS.forEach((section) => {
    output = ensureSection(output, section);
  });

  // 2) Garantisce almeno un livello di certezza in IPOTESI
  output = ensureConfidence(output);

  // 3) Log warning se frasi generiche/vietate sono presenti
  warnBannedPhrases(output);

  return output.trim();
}

module.exports = { postcheck };