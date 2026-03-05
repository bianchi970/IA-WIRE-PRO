"use strict";
/**
 * visionFusion.js — Fusione Vision + OCR + Catalogo per ROCCO.
 *
 * Integra i risultati OCR (marcature estratte dalle immagini) con il
 * Component Catalog per produrre candidati componenti con confidence + evidence.
 *
 * Pesi di boost (additivi rispetto a recognitionEngine):
 *   marking_from_ocr:  +0.45  (marcatura letta dall'immagine = fortissimo segnale)
 *   keyword_from_ocr:  +0.30  (alias/sigla OCR = segnale forte)
 *   context_from_region: +0.15 (tipo di regione suggerisce il componente)
 *
 * Soglie: allineate a recognitionEngine.js (HIGH >= 0.75, MEDIUM >= 0.50)
 *
 * Env: VISION_DEBUG=1
 */

var REGION_TYPES  = require("./visionTypes").REGION_TYPES;
var CONF_TH       = require("./visionTypes").CONF_THRESHOLDS;
var recEng        = require("../rocco/recognitionEngine");
var recognizeComponents = recEng.recognizeComponents;
var THRESHOLDS    = recEng.THRESHOLDS;

var DEBUG = process.env.VISION_DEBUG === "1";
function dbg() {
  if (DEBUG) {
    var args = Array.prototype.slice.call(arguments);
    console.error.apply(console, ["[VISION-DEBUG][fusion]"].concat(args));
  }
}

// Boost per tipo di evidenza visiva
var BOOST = {
  marking_ocr: 0.45,
  keyword_ocr: 0.30,
  region_ctx:  0.15
};

// Mapping tipo regione → componenti più probabili (bonus contesto)
var REGION_COMPONENT_BOOST = {};
REGION_COMPONENT_BOOST[REGION_TYPES.LABEL_ZONES]  = ["magnetotermico", "differenziale", "magnetotermico_differenziale", "alimentatore"];
REGION_COMPONENT_BOOST[REGION_TYPES.DIN_STRIPS]   = ["magnetotermico", "differenziale", "contattore", "rele", "alimentatore", "timer"];
REGION_COMPONENT_BOOST[REGION_TYPES.TIMER_ZONE]   = ["timer"];
REGION_COMPONENT_BOOST[REGION_TYPES.PANEL]        = [];

/**
 * Costruisce il testo aggregato da tutti i risultati OCR.
 * @param {Array} ocrResults
 * @returns {string}
 */
function buildOcrText(ocrResults) {
  if (!Array.isArray(ocrResults)) return "";
  return ocrResults.map(function(o) { return o.text || ""; }).join(" ");
}

/**
 * Produce candidati componenti fondendo OCR + regioni + catalog.
 *
 * @param {Array} regions      - da segmentor.js
 * @param {Array} ocrResults   - da ocrEngine.js (per ogni region_id)
 * @param {string} [userText]  - testo utente (fallback per recognitionEngine)
 * @returns {Array<{component_id, label_texts, bbox_norm, confidence, evidence[]}>}
 */
function fuseComponents(regions, ocrResults, userText) {
  // Aggrega tutto il testo OCR
  var ocrText  = buildOcrText(ocrResults);
  var fullText = [ocrText, userText || ""].join(" ").trim();

  dbg("fuseComponents — ocrText length:", ocrText.length, "| userText length:", (userText || "").length);

  if (!fullText) {
    dbg("nessun testo disponibile per la fusione");
    return [];
  }

  // Base: recognition engine su testo combinato
  var baseResults = recognizeComponents(fullText);
  dbg("base results:", baseResults.map(function(r) { return r.component_id + "=" + r.confidence.toFixed(2); }).join(", "));

  // Mappa regione → OCR result
  var ocrByRegion = {};
  (ocrResults || []).forEach(function(o) {
    ocrByRegion[o.region_id] = o;
  });

  // Calcola boost da token OCR (marcature trovate nelle immagini = boost forte)
  var ocrBoosts = {};  // component_id → { boost, labelTexts[], evidence[] }
  var CATALOG = require("../rocco/componentCatalog").CATALOG;

  ocrResults.forEach(function(ocr) {
    if (!ocr.tokens || !ocr.tokens.length) return;

    // Trova la regione corrispondente
    var region = null;
    (regions || []).forEach(function(r) { if (r.id === ocr.region_id) region = r; });

    ocr.tokens.forEach(function(tok) {
      // Cerca quale componente del catalog ha questo marking
      CATALOG.forEach(function(cat) {
        var tokLower = tok.value.toLowerCase();
        var matched  = false;
        var matchType = "";

        // Check aliases
        cat.aliases.forEach(function(alias) {
          if (tokLower.indexOf(alias.toLowerCase()) >= 0 ||
              alias.toLowerCase().indexOf(tokLower) >= 0) {
            matched = true; matchType = "keyword_ocr";
          }
        });

        // Check markings (regex)
        if (!matched) {
          cat.markings.forEach(function(markingPattern) {
            try {
              var rx = new RegExp(markingPattern, "i");
              if (rx.test(tok.value)) { matched = true; matchType = "marking_ocr"; }
            } catch(e) { /* skip invalid regex */ }
          });
        }

        if (matched) {
          if (!ocrBoosts[cat.id]) {
            ocrBoosts[cat.id] = { boost: 0, labelTexts: [], evidence: [] };
          }
          var w = (matchType === "marking_ocr") ? BOOST.marking_ocr : BOOST.keyword_ocr;
          ocrBoosts[cat.id].boost += w;
          ocrBoosts[cat.id].labelTexts.push(tok.value);
          ocrBoosts[cat.id].evidence.push({
            source:    "ocr",
            region_id: ocr.region_id,
            type:      matchType,
            matched:   tok.value,
            weight:    w
          });
          dbg("boost", cat.id, "+", w.toFixed(2), "da token:", tok.value, "(", matchType, ")");
        }
      });
    });
  });

  // Calcola boost da tipo regione
  var regionTypeBoosts = {};  // component_id → { boost, evidence[] }
  (regions || []).forEach(function(region) {
    var boostedComps = REGION_COMPONENT_BOOST[region.type] || [];
    boostedComps.forEach(function(cid) {
      if (!regionTypeBoosts[cid]) regionTypeBoosts[cid] = { boost: 0, evidence: [] };
      regionTypeBoosts[cid].boost += BOOST.region_ctx * region.confidence;
      regionTypeBoosts[cid].evidence.push({
        source:    "region",
        region_id: region.id,
        type:      "context_from_region",
        matched:   region.type,
        weight:    BOOST.region_ctx * region.confidence
      });
    });
  });

  // Combina: base results + OCR boosts + region boosts
  var merged = {};  // component_id → { confidence, labelTexts, bbox_norm, evidence }

  // Inizializza da base results
  baseResults.forEach(function(r) {
    merged[r.component_id] = {
      component_id: r.component_id,
      component_name: r.component_name,
      confidence:   r.confidence,
      labelTexts:   [],
      bbox_norm:    [0, 0, 1, 1],
      evidence:     r.evidence.slice()
    };
  });

  // Applica OCR boosts
  Object.keys(ocrBoosts).forEach(function(cid) {
    var ob = ocrBoosts[cid];
    if (!merged[cid]) {
      // Componente non trovato da testo ma trovato da OCR immagine
      var cat = null;
      CATALOG.forEach(function(c) { if (c.id === cid) cat = c; });
      merged[cid] = {
        component_id:   cid,
        component_name: cat ? cat.name_it : cid,
        confidence:     0,
        labelTexts:     [],
        bbox_norm:      [0, 0, 1, 1],
        evidence:       []
      };
    }
    merged[cid].confidence  = Math.min(1.0, merged[cid].confidence + ob.boost);
    merged[cid].labelTexts  = merged[cid].labelTexts.concat(ob.labelTexts);
    merged[cid].evidence    = merged[cid].evidence.concat(ob.evidence);
    dbg("dopo OCR boost — " + cid + " conf=" + merged[cid].confidence.toFixed(2));
  });

  // Applica region boosts (solo se già presente, non crea nuovi candidati)
  Object.keys(regionTypeBoosts).forEach(function(cid) {
    if (!merged[cid]) return;
    var rb = regionTypeBoosts[cid];
    merged[cid].confidence = Math.min(1.0, merged[cid].confidence + rb.boost);
    merged[cid].evidence   = merged[cid].evidence.concat(rb.evidence);
  });

  // Converti in array, calcola band, filtra score 0
  var results = Object.keys(merged).map(function(cid) {
    var m   = merged[cid];
    var conf = m.confidence;
    var band = conf >= THRESHOLDS.HIGH   ? "HIGH"   :
               conf >= THRESHOLDS.MEDIUM ? "MEDIUM" : "LOW";
    return {
      component_id:   cid,
      component_name: m.component_name,
      label_texts:    m.labelTexts.filter(function(v, i, a) { return a.indexOf(v) === i; }),
      bbox_norm:      m.bbox_norm,
      confidence:     conf,
      band:           band,
      evidence:       m.evidence
    };
  }).filter(function(r) { return r.confidence > 0; });

  results.sort(function(a, b) { return b.confidence - a.confidence; });
  dbg("fusione completata:", results.length, "candidati");
  return results;
}

/**
 * Genera il contratto ROCCO da vision_result per iniezione nel prompt LLM.
 * @param {Array} components - da fuseComponents()
 * @returns {string}
 */
function buildVisionContract(components) {
  var high   = components.filter(function(c) { return c.band === "HIGH"; });
  var medium = components.filter(function(c) { return c.band === "MEDIUM"; });
  var lines  = [];

  lines.push("══ VISION ANALYSIS (ROCCO vision pipeline) ══");

  if (high.length > 0) {
    lines.push("Componenti ALTA certezza da foto (conf ≥ 0.75):");
    high.forEach(function(c) {
      var marks = c.label_texts.length ? " — etichette lette: " + c.label_texts.join(", ") : "";
      lines.push("  • " + c.component_name + " [conf=" + c.confidence.toFixed(2) + "]" + marks);
    });
  }

  if (medium.length > 0) {
    lines.push("Componenti MEDIA certezza da foto (conf 0.50–0.74):");
    medium.forEach(function(c) {
      lines.push("  • " + c.component_name + " [conf=" + c.confidence.toFixed(2) + "]");
    });
  }

  if (high.length === 0 && medium.length === 0) {
    lines.push(
      "Nessun componente identificato con certezza dalla foto — " +
      "descrivere verbalmente o indicare le marcature visibili"
    );
  }

  return lines.join("\n");
}

module.exports = { fuseComponents, buildVisionContract, buildOcrText };
