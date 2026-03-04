"use strict";

const { TECH_REPORT_SECTIONS, CONFIDENCE_LEVELS, CERTAINTY_SECTION_VALUES, BANNED_PHRASES } = require("./policies");

function normalizeNewlines(text) {
  return (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n") // max 3 righe vuote consecutive
    .trim();
}

// Cerca la sezione — riconosce varianti con/senza asterischi, grassetto markdown, spaziatura variabile
function hasSection(text, section) {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    "(?:^|\\n)\\s*\\*{0,2}" + escaped + "\\*{0,2}\\s*:",
    "i"
  );
  return pattern.test(text);
}

function ensureSection(text, section) {
  if (hasSection(text, section)) return text;
  console.warn("[POSTCHECK] Sezione mancante aggiunta: " + section);
  const defaultBody = section === "LIVELLO DI CERTEZZA"
    ? "Non verificabile"
    : "- (dato non disponibile)";
  return text.trim() + "\n\n" + section + ":\n" + defaultBody + "\n";
}

// Normalizza LIVELLO DI CERTEZZA verso uno dei 3 valori canonici
function normalizeCertaintySection(text) {
  return text.replace(
    /^(LIVELLO DI CERTEZZA\s*:\s*-?\s*)([^\n]+)/m,
    function (match, prefix, raw) {
      const v = raw.trim().replace(/[\.\:\;\*]+$/, "").toLowerCase();
      if (v.includes("confermato")) return prefix + "Confermato";
      if (v.includes("probabile")) return prefix + "Probabile";
      return prefix + "Non verificabile";
    }
  );
}

// Garantisce almeno un badge di confidenza in IPOTESI
function ensureConfidence(text) {
  const found = CONFIDENCE_LEVELS.some((lvl) =>
    new RegExp("\\[" + lvl + "\\]", "i").test(text)
  );
  if (found) return text;
  return text.replace(
    /^(IPOTESI\s*:)/m,
    "IPOTESI:\n- [DA_VERIFICARE] Nessuna ipotesi formulabile con i dati attuali."
  ) || text;
}

// Rimuove markdown (***, **, __) dai titoli delle sezioni per uniformità
function cleanSectionHeadings(text) {
  return text.replace(
    /\n\s*\*{1,3}([A-ZÀÈÉÌÒÙ \/]+)\*{1,3}\s*:/g,
    function (match, name) {
      return "\n" + name.trim() + ":";
    }
  );
}

// Segnala frasi vietate (solo log, non altera testo)
function warnBannedPhrases(text) {
  BANNED_PHRASES.forEach((phrase) => {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      console.warn("[POSTCHECK] Frase vietata: \"" + phrase + "\"");
    }
  });
}

// Segnala sezioni con contenuto troppo corto (indicatore di risposta scadente)
function warnEmptySections(text) {
  TECH_REPORT_SECTIONS.forEach((section) => {
    const match = text.match(new RegExp(section + "\\s*:\\s*\\n([\\s\\S]*?)(?=\\n[A-ZÀÈÉÌÒÙ ]{3,}:|$)", "i"));
    if (match) {
      const body = match[1].trim();
      if (body.length < 10 || body === "- (dato non disponibile)") {
        console.warn("[POSTCHECK] Sezione vuota o placeholder: " + section);
      }
    }
  });
}

function postcheck(answerText) {
  let output = normalizeNewlines(answerText);

  // 1) Pulisce heading markdown
  output = cleanSectionHeadings(output);

  // 2) Garantisce tutte le sezioni obbligatorie
  TECH_REPORT_SECTIONS.forEach((section) => {
    output = ensureSection(output, section);
  });

  // 3) Garantisce almeno un badge confidenza in IPOTESI
  output = ensureConfidence(output);

  // 4) Normalizza LIVELLO DI CERTEZZA
  output = normalizeCertaintySection(output);

  // 5) Warning su frasi vietate e sezioni vuote (solo log)
  warnBannedPhrases(output);
  warnEmptySections(output);

  return output.trim();
}

module.exports = { postcheck };
