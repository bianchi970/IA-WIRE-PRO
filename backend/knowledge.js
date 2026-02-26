"use strict";

/**
 * IA Wire Pro — knowledge.js
 * Carica e interroga la base di conoscenza locale (backend/knowledge/*.json).
 * Nessun DB richiesto. Matching per keyword sul testo del messaggio.
 * Uso: const { fetchKnowledgeContext } = require("./knowledge");
 */

const fs = require("fs");
const path = require("path");

const KNOWLEDGE_DIR = path.join(__dirname, "knowledge");

// ============================================================
// Caricamento lazy (una sola volta al primo uso)
// ============================================================
let _loaded = false;
let _components = [];
let _protectionRules = [];
let _failurePatterns = [];
let _safetyProtocols = [];

function loadOnce() {
  if (_loaded) return;
  _loaded = true;

  function readJson(filename) {
    try {
      const p = path.join(KNOWLEDGE_DIR, filename);
      return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (e) {
      console.warn("[knowledge] ⚠️ Impossibile leggere " + filename + ":", e.message || e);
      return null;
    }
  }

  const comp = readJson("components.json");
  if (comp && Array.isArray(comp.items)) _components = comp.items;

  const prot = readJson("protection_rules.json");
  if (prot && Array.isArray(prot.rules)) _protectionRules = prot.rules;

  const fail = readJson("failure_patterns.json");
  if (fail && Array.isArray(fail.patterns)) _failurePatterns = fail.patterns;

  const safe = readJson("safety_protocols.json");
  if (safe && Array.isArray(safe.protocols)) _safetyProtocols = safe.protocols;

  console.log(
    "[knowledge] ✅ Caricato: " +
    _components.length + " componenti, " +
    _protectionRules.length + " regole protezione, " +
    _failurePatterns.length + " pattern guasto, " +
    _safetyProtocols.length + " protocolli sicurezza"
  );
}

// ============================================================
// Keyword matching semplice
// ============================================================
function textScore(text, queryWords) {
  var lower = String(text || "").toLowerCase();
  var score = 0;
  for (var i = 0; i < queryWords.length; i++) {
    if (lower.indexOf(queryWords[i]) >= 0) score++;
  }
  return score;
}

function scoreComponent(item, queryWords) {
  var s = 0;
  var kw = Array.isArray(item.keywords) ? item.keywords : [];
  for (var i = 0; i < kw.length; i++) {
    s += textScore(kw[i], queryWords);
  }
  s += textScore(item.id, queryWords);
  s += textScore(item.notes, queryWords) * 0.5;
  return s;
}

function scorePattern(pat, queryWords) {
  var s = textScore(pat.symptom, queryWords) * 2;
  var causes = Array.isArray(pat.likely_causes) ? pat.likely_causes : [];
  for (var i = 0; i < causes.length; i++) {
    s += textScore(causes[i], queryWords);
  }
  return s;
}

function scoreRule(rule, queryWords) {
  var s = textScore(rule.title, queryWords) * 2;
  s += textScore(rule.rule, queryWords);
  var seen = Array.isArray(rule.if_seen_in_photo) ? rule.if_seen_in_photo : [];
  for (var i = 0; i < seen.length; i++) {
    s += textScore(seen[i], queryWords);
  }
  return s;
}

function scoreProtocol(proto, queryWords) {
  var s = textScore(proto.title, queryWords) * 2;
  var pre = Array.isArray(proto.pre_checks) ? proto.pre_checks : [];
  for (var i = 0; i < pre.length; i++) {
    s += textScore(pre[i], queryWords) * 0.5;
  }
  return s;
}

// ============================================================
// Formattazione contesto
// ============================================================
function formatComponent(c) {
  var lines = [];
  lines.push("COMPONENTE: " + c.id.toUpperCase() + (c.brand ? " [" + c.brand + " " + (c.model || "") + "]" : ""));
  if (c.typical_faults && c.typical_faults.length) {
    lines.push("  Guasti tipici: " + c.typical_faults.slice(0, 3).join("; "));
  }
  if (c.field_checks && c.field_checks.length) {
    lines.push("  Verifiche sul campo:");
    c.field_checks.slice(0, 4).forEach(function (fc) { lines.push("    " + fc); });
  }
  if (c.notes) lines.push("  Note: " + c.notes);
  return lines.join("\n");
}

function formatPattern(p) {
  var lines = [];
  lines.push("PATTERN GUASTO: " + p.symptom);
  if (p.likely_causes && p.likely_causes.length) {
    lines.push("  Cause probabili: " + p.likely_causes.slice(0, 3).join("; "));
  }
  if (p.confidence_logic && p.confidence_logic.length) {
    lines.push("  Logica certezza: " + p.confidence_logic[0]);
  }
  if (p.checks && p.checks.length) {
    lines.push("  Verifiche:");
    p.checks.slice(0, 4).forEach(function (c) { lines.push("    " + c); });
  }
  if (p.example_case) lines.push("  Caso esempio: " + p.example_case.slice(0, 200));
  return lines.join("\n");
}

function formatRule(r) {
  var lines = [];
  lines.push("REGOLA [" + r.risk_level.toUpperCase() + "]: " + r.title);
  lines.push("  " + r.rule);
  if (r.verification_steps && r.verification_steps.length) {
    lines.push("  Passi verifica:");
    r.verification_steps.slice(0, 3).forEach(function (s) { lines.push("    " + s); });
  }
  return lines.join("\n");
}

function formatProtocol(p) {
  var lines = [];
  lines.push("PROTOCOLLO SICUREZZA: " + p.title);
  if (p.lockout_tagout && p.lockout_tagout.length) {
    lines.push("  LOTO: " + p.lockout_tagout.slice(0, 3).join("; "));
  }
  if (p.stop_conditions && p.stop_conditions.length) {
    lines.push("  Condizioni di STOP: " + p.stop_conditions[0]);
  }
  return lines.join("\n");
}

// ============================================================
// Funzione pubblica
// ============================================================
/**
 * Cerca nella base di conoscenza locale le voci più pertinenti al messaggio.
 * Ritorna una stringa formattata da iniettare nel system prompt, oppure "".
 * Max risultati: 2 componenti + 2 pattern + 1 regola + 1 protocollo.
 */
function fetchKnowledgeContext(queryText) {
  loadOnce();

  var q = String(queryText || "").trim().slice(0, 300).toLowerCase();
  if (!q) return "";

  // Parole chiave: rimuovi stop words brevi
  var queryWords = q.split(/[\s,;.!?]+/).filter(function (w) { return w.length > 2; });
  if (!queryWords.length) return "";

  // Scorify + sort + top-N
  var comps = _components
    .map(function (c) { return { item: c, score: scoreComponent(c, queryWords) }; })
    .filter(function (x) { return x.score > 0; })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 2);

  var patterns = _failurePatterns
    .map(function (p) { return { item: p, score: scorePattern(p, queryWords) }; })
    .filter(function (x) { return x.score > 0; })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 2);

  var rules = _protectionRules
    .map(function (r) { return { item: r, score: scoreRule(r, queryWords) }; })
    .filter(function (x) { return x.score > 0; })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 1);

  var protocols = _safetyProtocols
    .map(function (p) { return { item: p, score: scoreProtocol(p, queryWords) }; })
    .filter(function (x) { return x.score > 0; })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 1);

  var total = comps.length + patterns.length + rules.length + protocols.length;
  if (!total) return "";

  var lines = ["CONTESTO BASE TECNICA INTERNA (IA WIRE PRO KNOWLEDGE):"];

  if (comps.length) {
    lines.push("");
    comps.forEach(function (x) { lines.push(formatComponent(x.item)); });
  }
  if (patterns.length) {
    lines.push("");
    patterns.forEach(function (x) { lines.push(formatPattern(x.item)); });
  }
  if (rules.length) {
    lines.push("");
    rules.forEach(function (x) { lines.push(formatRule(x.item)); });
  }
  if (protocols.length) {
    lines.push("");
    protocols.forEach(function (x) { lines.push(formatProtocol(x.item)); });
  }

  lines.push("");
  lines.push("ISTRUZIONE: usa queste informazioni come base tecnica di riferimento SOLO se pertinente alla domanda.");

  return lines.join("\n");
}

/**
 * Restituisce i dati grezzi caricati dai JSON (dopo loadOnce).
 * Usato da diagnosticEngine per il pattern matching completo.
 */
function getLoadedKnowledge() {
  loadOnce();
  return {
    components:      _components,
    protectionRules: _protectionRules,
    failurePatterns: _failurePatterns,
    safetyProtocols: _safetyProtocols,
  };
}

module.exports = {
  fetchKnowledgeContext: fetchKnowledgeContext,
  getLoadedKnowledge:    getLoadedKnowledge,
};
