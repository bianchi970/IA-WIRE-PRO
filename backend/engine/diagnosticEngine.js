"use strict";

/**
 * IA Wire Pro — diagnosticEngine.js (ROCCO CORE v2)
 * Full JSON pattern matching + protection rules + safety protocols.
 * Produce output strutturato PRIMA del LLM e risposta offline se la rete cade.
 */

// ============================================================
// Keyword trigger interni (rilevazione dominio)
// ============================================================
var TECH_KEYWORDS = [
  "tensione", "volt", "230v", "400v", "24v",
  "differenziale", "rcd", "rcbo", "magnetoterm", "mcb",
  "contattore", "rele", "relay", "bobina",
  "quadro", "impianto", "morsett",
  "plc", "automazione", "ingresso", "uscita",
  "terra", "neutro", "fase", "dispersione",
  "cortocircuito", "sovraccarico", "fusibile", "sezionatore",
  "bruciato", "fuma", "scintille", "odore",
  "corrente", "misura", "multimetro", "pinza",
  "isolamento", "megohmetro",
  "ip44", "ip65", "guarnizione", "pressacavi",
  "caldaia", "termostato", "circolatore", "pompa",
  "shelly", "zigbee", "domotica"
];

var DANGER_KEYWORDS = [
  "bruciato", "fuma", "fumo", "scintille", "scintilla",
  "odore bruciato", "cavo annerito", "incendio", "fiamma"
];

var VOLTAGE_KEYWORDS   = ["tensione", "volt", "230v", "400v", "24v", "vac", "vdc"];
var RCD_KEYWORDS       = ["differenziale", "rcd", "rcbo", "salvavita", "scatta"];
var OUTDOOR_KEYWORDS   = ["esterno", "ip44", "ip65", "ip67", "cassetta", "guarnizione", "pressacavi"];
var MEASUREMENT_WORDS  = ["misura", "multimetro", "pinza", "megohmetro", "tester"];

// Score minimo perché un pattern sia considerato rilevante
var MATCH_THRESHOLD = 3;

// ============================================================
// Normalizzazione testo (lowercase + rimozione accenti semplice)
// ============================================================
var ACCENT_MAP = { "à":"a","è":"e","é":"e","ì":"i","ò":"o","ù":"u","ä":"a","ö":"o","ü":"u" };

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[àèéìòùäöü]/g, function (c) { return ACCENT_MAP[c] || c; });
}

function tokenize(text) {
  return normalize(text).split(/[\s,;.()\/\-\[\]]+/).filter(function (w) { return w.length > 3; });
}

function containsAny(text, keywords) {
  var n = normalize(text);
  for (var i = 0; i < keywords.length; i++) {
    if (n.indexOf(normalize(keywords[i])) >= 0) return true;
  }
  return false;
}

function findMatches(text, keywords) {
  var n = normalize(text);
  var found = [];
  for (var i = 0; i < keywords.length; i++) {
    if (n.indexOf(normalize(keywords[i])) >= 0) found.push(keywords[i]);
  }
  return found;
}

// ============================================================
// Scoring pattern (A)
// Pesa: symptom × 3, likely_causes × 2, checks × 1
// Boost per coppie chiave italiane
// ============================================================
var PAIR_BOOSTS = [
  ["differenziale", "scatta"],
  ["rcd",           "scatta"],
  ["rele",          "contattore"],
  ["relay",         "luce"],
  ["24v",           "plc"],
  ["tensione",      "flottante"],
  ["ghost",         "voltage"],
  ["ip",            "guarnizione"],
  ["esterno",       "pressacavi"],
  ["magnetoterm",   "caldo"],
  ["morsett",       "allentato"]
];

function scoreText(text, queryTokens) {
  var textTokens = tokenize(text);
  var score = 0;
  for (var i = 0; i < textTokens.length; i++) {
    for (var j = 0; j < queryTokens.length; j++) {
      if (textTokens[i] === queryTokens[j]) { score++; break; }
    }
  }
  return score;
}

function scorePatternMatch(pattern, queryNorm, queryTokens) {
  var score = 0;

  // symptom × 3
  score += scoreText(pattern.symptom || "", queryTokens) * 3;

  // likely_causes × 2
  var causes = Array.isArray(pattern.likely_causes) ? pattern.likely_causes : [];
  for (var i = 0; i < causes.length; i++) {
    score += scoreText(causes[i], queryTokens) * 2;
  }

  // checks × 1
  var checks = Array.isArray(pattern.checks) ? pattern.checks : [];
  for (var j = 0; j < checks.length; j++) {
    score += scoreText(checks[j], queryTokens);
  }

  // Pair boosts: se entrambe le parole della coppia sono nel query
  for (var b = 0; b < PAIR_BOOSTS.length; b++) {
    var w0 = PAIR_BOOSTS[b][0], w1 = PAIR_BOOSTS[b][1];
    var symNorm = normalize(pattern.symptom || "");
    // boost solo se la coppia è rilevante per il pattern
    if ((symNorm.indexOf(w0) >= 0 || symNorm.indexOf(w1) >= 0) &&
        queryNorm.indexOf(w0) >= 0 && queryNorm.indexOf(w1) >= 0) {
      score += 4;
    }
  }

  return score;
}

// ============================================================
// Scoring rules (B)
// Pesa: when_to_apply × 3, if_seen_in_photo × 2, rule text × 1
// ============================================================
function scoreRuleMatch(rule, queryNorm, queryTokens) {
  var score = 0;
  score += scoreText(rule.when_to_apply || "", queryTokens) * 3;
  var seen = Array.isArray(rule.if_seen_in_photo) ? rule.if_seen_in_photo : [];
  for (var i = 0; i < seen.length; i++) {
    if (queryNorm.indexOf(normalize(seen[i])) >= 0) score += 2;
  }
  score += scoreText(rule.rule || "", queryTokens);
  return score;
}

// ============================================================
// Parsing confidence_logic
// Ogni entry ha prefisso: "CONFERMATO ...", "PROBABILE ...", "NON VERIFICABILE ..."
// ============================================================
function parseLivello(logicEntry) {
  var s = normalize(String(logicEntry || ""));
  if (s.indexOf("non verificabile") >= 0) return "non_verificabile";
  if (s.indexOf("confermato") >= 0)       return "confermato";
  return "probabile";
}

/**
 * Mappa likely_causes → ipotesi con livello.
 * confidence_logic[i] → livello per likely_causes[i] se disponibile, altrimenti default.
 * Per default tutte le cause sono "probabile" (senza misure non si può confermare).
 */
function buildIpotesiFromPattern(pattern) {
  var causes  = Array.isArray(pattern.likely_causes) ? pattern.likely_causes : [pattern.symptom];
  var logics  = Array.isArray(pattern.confidence_logic) ? pattern.confidence_logic : [];

  return causes.map(function (causa, idx) {
    var livello = "probabile"; // default: senza misure non si conferma nulla
    if (logics[idx]) {
      var parsed = parseLivello(logics[idx]);
      // "confermato" nel confidence_logic descrive la condizione di conferma, NON lo stato attuale.
      // Quindi lo usiamo solo se è "non_verificabile" (indica un limite reale).
      if (parsed === "non_verificabile") livello = "non_verificabile";
    }
    return { causa: String(causa), livello: livello };
  });
}

// ============================================================
// Funzione principale
// ============================================================
/**
 * @param {Object} input   - { message: string, hasImage: boolean }
 * @param {Object} knowledge - { failurePatterns, protectionRules, safetyProtocols }
 * @returns {Object} output strutturato
 */
function analyzeTechnicalRequest(input, knowledge) {
  var message  = String((input && input.message) || "").trim();
  var hasImage = !!(input && input.hasImage);
  var lower    = normalize(message);
  var tokens   = tokenize(message);

  // --- Rilevazione dominio ---
  var isTechnical    = containsAny(lower, TECH_KEYWORDS);
  var isDangerous    = containsAny(lower, DANGER_KEYWORDS);
  var mentionsVoltage  = containsAny(lower, VOLTAGE_KEYWORDS);
  var mentionsRCD      = containsAny(lower, RCD_KEYWORDS);
  var mentionsOutdoor  = containsAny(lower, OUTDOOR_KEYWORDS);
  var mentionsMeasure  = containsAny(lower, MEASUREMENT_WORDS);

  var matchedKeywords = findMatches(message, TECH_KEYWORDS);

  // --- A) Pattern matching completo sui JSON ---
  var patterns = (knowledge && Array.isArray(knowledge.failurePatterns)) ? knowledge.failurePatterns : [];
  var scoredPatterns = patterns
    .map(function (p) { return { pattern: p, score: scorePatternMatch(p, lower, tokens) }; })
    .filter(function (x) { return x.score >= MATCH_THRESHOLD; })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 2);

  // --- B) Rule matching ---
  var rules = (knowledge && Array.isArray(knowledge.protectionRules)) ? knowledge.protectionRules : [];
  var scoredRules = rules
    .map(function (r) { return { rule: r, score: scoreRuleMatch(r, lower, tokens) }; })
    .filter(function (x) { return x.score >= MATCH_THRESHOLD; })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 3);

  // Regole LOTO obbligatorie se outdoor/RCD menzionati (sempre high-risk)
  if (mentionsOutdoor || mentionsRCD || isDangerous) {
    var lotoRule = rules.filter(function (r) { return r.id === "PR-02" || r.id === "SP-01"; });
    lotoRule.forEach(function (r) {
      if (!scoredRules.find(function (x) { return x.rule.id === r.id; })) {
        scoredRules.push({ rule: r, score: MATCH_THRESHOLD });
      }
    });
  }

  // --- Build output ---
  var osservazioni = [];
  var ipotesi      = [];
  var verifiche    = [];
  var rischi       = [];

  // Osservazioni
  if (matchedKeywords.length) {
    osservazioni.push("Keyword tecniche rilevate: " + matchedKeywords.slice(0, 6).join(", ") + ".");
  }
  if (hasImage)         osservazioni.push("Immagine allegata: analizzare i componenti visibili e il loro stato.");
  if (isDangerous)      osservazioni.push("ATTENZIONE: segnalati elementi pericolosi (bruciato/fumo/scintille).");
  if (mentionsRCD)      osservazioni.push("RCD/differenziale menzionato: richiesta verifica dispersione e isolamento.");
  if (mentionsOutdoor)  osservazioni.push("Cassetta/quadro esterno menzionato: richiesta valutazione IP e sigillatura.");
  if (mentionsMeasure)  osservazioni.push("Richiesta di misura elettrica: indicare strumenti e punti di misura.");

  // Pattern osservazioni + ipotesi
  scoredPatterns.forEach(function (x) {
    var p = x.pattern;
    console.log("ROCCO: JSON pattern matched ->", p.id, "(score=" + x.score + ")");
    osservazioni.push("Pattern identificato: " + p.symptom);
    buildIpotesiFromPattern(p).forEach(function (ip) { ipotesi.push(ip); });
  });

  // Verifiche mandatory da dominio
  if (mentionsVoltage) {
    verifiche.push("OBBLIGATORIA: misurare tensione IN e OUT di ogni protezione sotto carico (multimetro VAC).");
  }
  if (mentionsRCD) {
    verifiche.push("OBBLIGATORIA: misurare isolamento cavi con megohmetro 500V DC (>1MΩ richiesto).");
    verifiche.push("Verificare che N e PE non siano uniti a valle del nodo equipotenziale principale.");
  }
  if (mentionsOutdoor) {
    verifiche.push("Verificare integrità guarnizione perimetrale (elastica, continua, compressa).");
    verifiche.push("Verificare serraggio pressacavi e presenza coperchi ciechi su fori non usati.");
  }

  // Verifiche dai pattern (checks)
  scoredPatterns.forEach(function (x) {
    var checks = Array.isArray(x.pattern.checks) ? x.pattern.checks : [];
    checks.slice(0, 4).forEach(function (c) {
      if (verifiche.indexOf(c) < 0) verifiche.push(c);
    });
  });

  // Verifiche dalle regole (verification_steps)
  scoredRules.forEach(function (x) {
    var steps = Array.isArray(x.rule.verification_steps) ? x.rule.verification_steps : [];
    steps.slice(0, 2).forEach(function (s) {
      if (verifiche.indexOf(s) < 0) verifiche.push(s);
    });
  });

  // Rischi
  if (isDangerous) {
    rischi.push("PERICOLO IMMEDIATO: disalimentare prima di qualsiasi intervento. Attendere 5 minuti.");
    rischi.push("Non riaprire finché l'odore di bruciato non è scomparso.");
  }
  scoredRules.forEach(function (x) {
    if (x.rule.risk_level === "high") {
      rischi.push("RISCHIO ALTO — " + x.rule.title + ": " + String(x.rule.rule || "").slice(0, 130));
    }
  });
  // Safety protocols LOTO sempre per interventi tecnici
  if (isTechnical && !rischi.length) {
    rischi.push("Disalimentare e verificare assenza tensione con multimetro prima di aprire il quadro.");
  }

  // Conclusione
  var conclusione;
  if (!isTechnical) {
    conclusione = "Richiesta non tecnica: rispondere liberamente.";
  } else if (isDangerous) {
    conclusione = "STOP — condizione pericolosa. Sicurezza prima della diagnosi.";
  } else if (scoredPatterns.length) {
    conclusione = scoredPatterns.length + " pattern di guasto identificati (JSON). Guidare l'utente nelle verifiche sequenziali.";
  } else {
    conclusione = "Domanda tecnica generica. Richiedere dati specifici: marca/modello, misure, foto.";
  }

  return {
    isTechnical:     isTechnical,
    isDangerous:     isDangerous,
    matchedKeywords: matchedKeywords,
    matchedPatterns: scoredPatterns.map(function (x) { return x.pattern.id; }),
    matchedRules:    scoredRules.map(function (x) { return x.rule.id; }),
    osservazioni:    osservazioni,
    ipotesi:         ipotesi,
    verifiche:       verifiche.slice(0, 10),
    rischi:          rischi,
    conclusione:     conclusione
  };
}

// ============================================================
// Formattazione contesto per LLM
// ============================================================
function formatDiagnosticContext(diag) {
  if (!diag || !diag.isTechnical) return "";

  var lines = ["[ROCCO ENGINE — PRE-ANALISI AUTOMATICA]"];

  if (diag.isDangerous) {
    lines.push("");
    lines.push("⚠️⚠️ CONDIZIONE PERICOLOSA — SICUREZZA PRIORITARIA ⚠️⚠️");
  }

  if (diag.osservazioni.length) {
    lines.push("");
    lines.push("OSSERVAZIONI PRELIMINARI:");
    diag.osservazioni.forEach(function (o) { lines.push("- " + o); });
  }

  if (diag.ipotesi.length) {
    lines.push("");
    lines.push("IPOTESI (da confermare con misure):");
    diag.ipotesi.slice(0, 6).forEach(function (ip) {
      lines.push("- [" + ip.livello.toUpperCase() + "] " + ip.causa);
    });
  }

  if (diag.verifiche.length) {
    lines.push("");
    lines.push("VERIFICHE DA PROPORRE:");
    diag.verifiche.slice(0, 6).forEach(function (v) { lines.push("- " + v); });
  }

  if (diag.rischi.length) {
    lines.push("");
    lines.push("RISCHI / SICUREZZA:");
    diag.rischi.forEach(function (r) { lines.push("- " + r); });
  }

  lines.push("");
  lines.push("CONCLUSIONE ENGINE: " + diag.conclusione);
  lines.push("ISTRUZIONE: usa questa pre-analisi come base strutturale. Il formato obbligatorio della risposta è: OSSERVAZIONI / COMPONENTI COINVOLTI / IPOTESI / VERIFICHE OPERATIVE / RISCHI REALI / PROSSIMO PASSO.");

  return lines.join("\n");
}

// ============================================================
// Risposta offline (C) — usata quando tutti i provider LLM falliscono per rete
// ============================================================
function formatOfflineAnswer(diag, message) {
  var lines = [];

  // --- OSSERVAZIONI ---
  lines.push("OSSERVAZIONI:");
  if (diag.osservazioni.length) {
    diag.osservazioni.forEach(function (o) { lines.push("- " + o); });
  } else {
    lines.push("- Richiesta tecnica ricevuta (analisi locale — LLM non raggiungibile).");
  }

  // --- COMPONENTI COINVOLTI ---
  lines.push("");
  lines.push("COMPONENTI COINVOLTI:");
  if (diag.matchedKeywords.length) {
    lines.push("- " + diag.matchedKeywords.slice(0, 6).join(", ") + " (da keyword).");
  } else {
    lines.push("- Nessun componente specifico identificato automaticamente.");
  }

  // --- IPOTESI ---
  lines.push("");
  lines.push("IPOTESI:");
  if (diag.ipotesi.length) {
    diag.ipotesi.slice(0, 5).forEach(function (ip) {
      var badge = ip.livello === "non_verificabile" ? "DA_VERIFICARE" :
                  ip.livello === "confermato"       ? "CONFERMATO" : "PROBABILE";
      lines.push("- [" + badge + "] " + ip.causa);
    });
  } else {
    lines.push("- [DA_VERIFICARE] Dati insufficienti per formulare un'ipotesi precisa.");
    lines.push("  Fornire marca/modello, misure effettuate e foto del componente.");
  }

  // --- VERIFICHE OPERATIVE ---
  lines.push("");
  lines.push("VERIFICHE OPERATIVE:");
  if (diag.verifiche.length) {
    diag.verifiche.slice(0, 5).forEach(function (v, i) { lines.push((i + 1) + ") " + v); });
  } else {
    lines.push("1) Strumento: multimetro VAC — misurare tensione IN e OUT del differenziale.");
    lines.push("2) Strumento: megohmetro 500V — misurare isolamento cavi (valore atteso >1MΩ).");
    lines.push("3) Indicare marca/modello e cosa è già stato verificato.");
  }

  // --- RISCHI REALI ---
  lines.push("");
  lines.push("RISCHI REALI:");
  if (diag.rischi.length) {
    diag.rischi.slice(0, 3).forEach(function (r) { lines.push("- " + r); });
  } else {
    lines.push("- Disalimentare e verificare assenza tensione prima di qualsiasi intervento.");
  }

  // --- PROSSIMO PASSO ---
  lines.push("");
  lines.push("PROSSIMO PASSO:");
  if (diag.verifiche.length) {
    lines.push("- " + diag.verifiche[0]);
  } else {
    lines.push("- Inviare foto nitida del componente e indicare marca/modello.");
  }

  lines.push("");
  lines.push("⚠️ Nota: risposta generata localmente (motore ROCCO offline) — LLM non raggiungibile.");

  return lines.join("\n");
}

// ============================================================
// Test case per /api/engine/test
// ============================================================
var TEST_CASE = {
  message: "Ogni volta che premo il pulsante per accendere le luci esterne il differenziale scatta. Ho un rele che pilota il contattore KM1. La linea e 230V. Come faccio a capire la causa?",
  hasImage: false
};

module.exports = {
  analyzeTechnicalRequest: analyzeTechnicalRequest,
  formatDiagnosticContext: formatDiagnosticContext,
  formatOfflineAnswer:     formatOfflineAnswer,
  TEST_CASE:               TEST_CASE
};
