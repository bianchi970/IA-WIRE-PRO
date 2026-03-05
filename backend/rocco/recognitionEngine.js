"use strict";
/**
 * recognitionEngine.js — ROCCO Component Recognition Engine v2
 *
 * Input:  testo libero (descrizione utente)
 * Output: candidati componenti ordinati per confidence 0..1
 *         + buildRoccoContext() → stringa di contratto per il prompt LLM
 *
 * Pesi per tipo (soglie costanti):
 *   alias   → base 0.50, aggiuntivi +0.10
 *   marking → base 0.45, aggiuntivi +0.08
 *   context → base 0.18, aggiuntivi +0.07
 *
 * Soglie confidence:
 *   HIGH   >= 0.75  → rilevato con certezza (entra in OSSERVAZIONI)
 *   MEDIUM  0.50–0.74 → probabile (entra in IPOTESI come [PROBABILE])
 *   LOW    < 0.50   → segnale debole (non in OSSERVAZIONI, solo avviso)
 *
 * Logging: ROCCO_DEBUG=1 per output verbose su stderr
 */

var PATTERNS_MOD = require("./patternLibrary");
var CATALOG_MOD  = require("./componentCatalog");

var PATTERNS = PATTERNS_MOD.PATTERNS;
var CATALOG  = CATALOG_MOD.CATALOG;

// ── Costanti ──────────────────────────────────────────────────────────────

var THRESHOLDS = { HIGH: 0.75, MEDIUM: 0.50 };

var TYPE_WEIGHTS = {
  alias:   { first: 0.50, additional: 0.10 },
  marking: { first: 0.45, additional: 0.08 },
  context: { first: 0.18, additional: 0.07 }
};

var DEBUG = process.env.ROCCO_DEBUG === "1";

function dbg() {
  if (DEBUG) {
    var args = Array.prototype.slice.call(arguments);
    console.error.apply(console, ["[ROCCO-DEBUG]"].concat(args));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getCatalogEntry(id) {
  for (var i = 0; i < CATALOG.length; i++) {
    if (CATALOG[i].id === id) return CATALOG[i];
  }
  return null;
}

function bandFor(conf) {
  if (conf >= THRESHOLDS.HIGH)   return "HIGH";
  if (conf >= THRESHOLDS.MEDIUM) return "MEDIUM";
  return "LOW";
}

// ── Funzione principale ───────────────────────────────────────────────────

/**
 * Riconosce componenti nel testo con scoring multi-dimensionale.
 * @param {string} text
 * @returns {Array<{component_id, component_name, confidence, band, evidence[]}>}
 *   Ordinato per confidence decrescente.
 */
function recognizeComponents(text) {
  if (!text) return [];
  var t = String(text);

  // Accumula evidenze per component_id
  var byComp = {};  // component_id → { evidence: [], typeCounts: { alias:0, marking:0, context:0 } }

  for (var i = 0; i < PATTERNS.length; i++) {
    var p = PATTERNS[i];
    var matched = null;

    try {
      if (p.pattern instanceof RegExp) {
        var m = t.match(p.pattern);
        if (m) matched = m[0];
      } else {
        // string pattern (fallback)
        if (t.toLowerCase().indexOf(String(p.pattern).toLowerCase()) >= 0) {
          matched = String(p.pattern);
        }
      }
    } catch (e) {
      dbg("Pattern error", p.id, e.message);
      continue;
    }

    if (!matched) continue;

    var cid = p.component_id;
    if (!byComp[cid]) {
      byComp[cid] = { evidence: [], typeCounts: { alias: 0, marking: 0, context: 0 } };
    }

    var typ  = p.type || "alias";
    var wDef = TYPE_WEIGHTS[typ] || TYPE_WEIGHTS.alias;
    var cnt  = byComp[cid].typeCounts[typ] || 0;
    var w    = (cnt === 0) ? wDef.first : wDef.additional;

    byComp[cid].typeCounts[typ] = cnt + 1;
    byComp[cid].evidence.push({
      patternId: p.id,
      family:    p.family,
      type:      typ,
      matched:   matched,
      weight:    w
    });
  }

  // Calcola confidence e costruisce risultati
  var results = [];

  for (var compId in byComp) {
    if (!Object.prototype.hasOwnProperty.call(byComp, compId)) continue;

    var data = byComp[compId];
    var raw  = 0;
    for (var j = 0; j < data.evidence.length; j++) {
      raw += data.evidence[j].weight;
    }
    var confidence = Math.min(1.0, raw);
    var band = bandFor(confidence);
    var cat  = getCatalogEntry(compId);

    dbg(
      "Component:", compId,
      "| conf:", confidence.toFixed(2),
      "| band:", band,
      "| evidence:", data.evidence.map(function(e) {
        return e.type + ":" + e.matched;
      }).join(", ")
    );

    results.push({
      component_id:   compId,
      component_name: cat ? cat.name_it : compId,
      confidence:     confidence,
      band:           band,
      evidence:       data.evidence
    });
  }

  // Ordina per confidence decrescente
  results.sort(function(a, b) { return b.confidence - a.confidence; });
  return results;
}

// ── Contratto ROCCO ───────────────────────────────────────────────────────

/**
 * Genera il testo di contratto da iniettare nel prompt LLM.
 * Specifica quali componenti vanno in OSSERVAZIONI vs IPOTESI vs avviso.
 * @param {string} text
 * @returns {string}
 */
function buildRoccoContext(text) {
  var results = recognizeComponents(text);

  var high   = results.filter(function(r) { return r.band === "HIGH";   });
  var medium = results.filter(function(r) { return r.band === "MEDIUM"; });
  var low    = results.filter(function(r) { return r.band === "LOW";    });

  var lines = [];
  lines.push("══ RICONOSCIMENTO COMPONENTI (ROCCO recognition v2) ══");

  // ── Componenti HIGH ──
  if (high.length > 0) {
    lines.push("ALTA certezza (conf ≥ 0.75):");
    high.forEach(function(r) {
      var marks = r.evidence
        .filter(function(e) { return e.type === "marking"; })
        .map(function(e) { return e.matched; });
      var line = "  • " + r.component_name +
        " [conf=" + r.confidence.toFixed(2) + "]";
      if (marks.length) line += " — marcature: " + marks.join(", ");
      lines.push(line);
    });
  }

  // ── Componenti MEDIUM ──
  if (medium.length > 0) {
    lines.push("MEDIA certezza (conf 0.50–0.74):");
    medium.forEach(function(r) {
      var evSum = r.evidence
        .map(function(e) { return e.type + ":" + e.matched; })
        .join(", ");
      lines.push(
        "  • " + r.component_name +
        " [conf=" + r.confidence.toFixed(2) + "]" +
        " — evidenze: " + evSum
      );
    });
  }

  // ── Componenti LOW ──
  if (low.length > 0 && high.length === 0 && medium.length === 0) {
    lines.push(
      "BASSA certezza (conf < 0.50): segnali deboli, insufficienti per identificazione."
    );
  }

  // ── Contratto risposta ──
  lines.push("");
  lines.push("══ CONTRATTO RISPOSTA ROCCO ══");

  if (high.length > 0) {
    var highNames = high.map(function(r) { return r.component_name; }).join(", ");
    lines.push("OSSERVAZIONI: riportare come componenti RILEVATI → " + highNames);
  } else {
    lines.push(
      "OSSERVAZIONI: nessun componente riconosciuto con certezza — " +
      "NON listare componenti in OSSERVAZIONI senza evidenza visiva o testuale certa"
    );
  }

  if (medium.length > 0) {
    var medNames = medium.map(function(r) { return r.component_name; }).join(", ");
    lines.push(
      "IPOTESI: " + medNames +
      " come [PROBABILE] con evidenza dichiarata nel testo"
    );
  }

  if (high.length === 0 && medium.length === 0) {
    lines.push(
      "COMPONENTI COINVOLTI: scrivere esattamente → " +
      "\"Componente non riconosciuto con certezza — " +
      "specificare tipo, modello e marcatura stampata sul componente\""
    );
    lines.push(
      "VERIFICHE: includere ALMENO 4 verifiche per identificare il componente sconosciuto"
    );
    lines.push(
      "RISCHI: elevare la prudenza diagnostica (componente non classificato)"
    );
  } else if (medium.length > 0 && high.length === 0) {
    lines.push(
      "VERIFICHE: includere 3–6 verifiche mirate per CONFERMARE il componente di media certezza"
    );
    lines.push(
      "RISCHI: cautela diagnostica — componente a certezza media, verificare prima di intervenire"
    );
  }

  return lines.join("\n");
}

// ── Export ────────────────────────────────────────────────────────────────

module.exports = {
  recognizeComponents: recognizeComponents,
  buildRoccoContext:   buildRoccoContext,
  THRESHOLDS:          THRESHOLDS
};
