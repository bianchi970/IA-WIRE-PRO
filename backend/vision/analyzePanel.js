"use strict";
/**
 * analyzePanel.js — Entry point pipeline ROCCO Vision.
 *
 * Funzione principale: analyzePanel(imageInput, imageId?, opts?) → vision_result
 *
 * Pipeline:
 *   1. Preprocessing (sharp opzionale)
 *   2. Segmentazione ROI euristica
 *   3. OCR mirato su LABEL_ZONES via callOcr iniettato (LLM-based)
 *   4. Fusione Vision + OCR + Catalogo → component candidates
 *   5. Output vision_result schema-validato
 *
 * @param {Buffer|string} imageInput - Buffer di bytes JPEG/PNG o percorso file
 * @param {string}       [imageId]  - ID immagine per tracciabilità
 * @param {Object}       [opts]
 * @param {Function}     [opts.callOcr] - async(buf, prompt) → string (LLM vision)
 * @param {string}       [opts.userText] - testo utente per recognition engine
 * @returns {Promise<vision_result>}
 *
 * Env: VISION_DEBUG=1 per log verbose
 */

var fs   = require("fs");
var path = require("path");

var visionTypes = require("./visionTypes");
var emptyResult = visionTypes.emptyResult;
var validateSchema = visionTypes.validateSchema;
var REGION_TYPES   = visionTypes.REGION_TYPES;

var preprocessor  = require("./preprocessor");
var segmentor     = require("./segmentor");
var ocrEngine     = require("./ocrEngine");
var visionFusion  = require("./visionFusion");

var DEBUG = process.env.VISION_DEBUG === "1";

function dbg() {
  if (DEBUG) {
    var args = Array.prototype.slice.call(arguments);
    console.error.apply(console, ["[VISION-DEBUG][analyzePanel]"].concat(args));
  }
}

/**
 * Analizza un'immagine di quadro elettrico.
 * @returns {Promise<{image_id, preproc, regions, ocr, components, warnings}>}
 */
async function analyzePanel(imageInput, imageId, opts) {
  opts = opts || {};
  var callOcr  = typeof opts.callOcr  === "function" ? opts.callOcr  : null;
  var userText = typeof opts.userText === "string"   ? opts.userText : "";
  var imgId    = String(imageId || ("img_" + Date.now()));

  var result   = emptyResult(imgId);

  dbg("=== analyzePanel START ===", imgId);
  dbg("callOcr disponibile:", !!callOcr);
  dbg("userText:", userText.slice(0, 80));

  // ── Step 0: Carica buffer ──────────────────────────────────────────────
  var rawBuffer = null;
  try {
    if (Buffer.isBuffer(imageInput)) {
      rawBuffer = imageInput;
    } else if (typeof imageInput === "string") {
      rawBuffer = fs.readFileSync(imageInput);
      dbg("letto file:", imageInput, "size:", rawBuffer.length);
    } else {
      result.warnings.push("imageInput non è un Buffer né un percorso file");
      return result;
    }
  } catch (e) {
    result.warnings.push("errore caricamento immagine: " + e.message);
    return result;
  }

  // ── Step 1: Preprocessing ─────────────────────────────────────────────
  var preprocOut = { buffer: rawBuffer, deskew_deg: 0, resized_to: null, notes: [] };
  try {
    preprocOut = await preprocessor.preprocess(rawBuffer);
    result.preproc.deskew_deg  = preprocOut.deskew_deg || 0;
    result.preproc.resized_to  = preprocOut.resized_to || null;
    result.preproc.notes       = preprocOut.notes || [];
    dbg("preprocessing OK:", preprocOut.notes.join(" | "));
  } catch (e) {
    var msg = "preprocessing error: " + e.message;
    result.preproc.notes.push(msg);
    result.warnings.push(msg);
    dbg(msg);
  }

  // ── Step 2: Segmentazione ROI ─────────────────────────────────────────
  var dims = preprocessor.readDimensions(preprocOut.buffer) ||
             (preprocOut.resized_to ? { width: preprocOut.resized_to[0], height: preprocOut.resized_to[1] } : null);
  try {
    result.regions = segmentor.segmentPanel(dims);
    dbg("segmentazione OK:", result.regions.length, "regioni");
  } catch (e) {
    result.warnings.push("segmentazione error: " + e.message);
    result.regions = [{
      id: "r1", type: REGION_TYPES.PANEL,
      bbox_norm: [0, 0, 1, 1], confidence: 1.0
    }];
  }

  // ── Step 3: OCR su LABEL_ZONES (e PANEL come fallback) ───────────────
  var ocrResults = [];
  if (callOcr) {
    // OCR su LABEL_ZONES (massimo 3 per non saturare LLM)
    var labelRegions = result.regions
      .filter(function(r) { return r.type === REGION_TYPES.LABEL_ZONES; })
      .slice(0, 3);

    if (labelRegions.length === 0) {
      // Fallback: OCR su immagine intera
      dbg("nessuna LABEL_ZONE, OCR su full image");
      var fullOcr = await ocrEngine.ocrFullImage(preprocOut.buffer, callOcr);
      ocrResults.push(fullOcr);
    } else {
      for (var li = 0; li < labelRegions.length; li++) {
        var region = labelRegions[li];
        var regionBuf = null;
        // Crop se sharp disponibile
        if (dims) {
          regionBuf = await preprocessor.cropRegion(
            preprocOut.buffer, region.bbox_norm,
            dims.width, dims.height
          );
        }
        // Fallback: usa immagine intera se crop non disponibile
        var bufToUse = regionBuf || preprocOut.buffer;
        var ocrR = await ocrEngine.ocrRegion(region.id, bufToUse, callOcr);
        ocrResults.push(ocrR);
        dbg("OCR regione", region.id, "— token:", ocrR.tokens.length);
      }
    }

    result.ocr = ocrResults;
    dbg("OCR completato:", ocrResults.length, "regioni analizzate");
  } else {
    result.warnings.push("callOcr non disponibile — OCR saltato (passare opts.callOcr per attivare)");
    dbg("OCR saltato: nessun callOcr");
  }

  // ── Step 4: Fusione componenti ────────────────────────────────────────
  try {
    var fusedComponents = visionFusion.fuseComponents(
      result.regions, ocrResults, userText
    );
    // Mappiamo al formato vision_result.components
    result.components = fusedComponents.map(function(fc) {
      return {
        component_id:  fc.component_id,
        label_texts:   fc.label_texts || [],
        bbox_norm:     fc.bbox_norm   || [0, 0, 1, 1],
        confidence:    fc.confidence,
        band:          fc.band,
        evidence:      fc.evidence    || []
      };
    });
    dbg("fusione OK:", result.components.length, "candidati");
    // Log top candidati
    result.components.slice(0, 5).forEach(function(c) {
      dbg("  →", c.component_id, "conf=" + c.confidence.toFixed(2), "band=" + c.band,
          c.label_texts.length ? "labels:" + c.label_texts.join(",") : "");
    });
  } catch (e) {
    result.warnings.push("fusione error: " + e.message);
    dbg("fusione error:", e.message);
  }

  // ── Step 5: Validazione schema ────────────────────────────────────────
  var validation = validateSchema(result);
  if (!validation.valid) {
    validation.errors.forEach(function(err) { result.warnings.push("schema: " + err); });
    dbg("schema warnings:", validation.errors.join("; "));
  }

  dbg("=== analyzePanel END ===", "components:", result.components.length,
      "warnings:", result.warnings.length);
  return result;
}

module.exports = { analyzePanel };
