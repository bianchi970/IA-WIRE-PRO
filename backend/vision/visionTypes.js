"use strict";
/**
 * visionTypes.js — Schema e costanti per vision_result.
 * CONTRATTO OUTPUT: immutabile — modifiche qui impattano tutta la pipeline.
 *
 * Schema vision_result:
 * {
 *   image_id:  string,
 *   preproc:   { deskew_deg, resized_to:[w,h]|null, notes:[] },
 *   regions:   [ {id, type, bbox_norm:[x,y,w,h], confidence} ],
 *   ocr:       [ {region_id, text, tokens:[], confidence} ],
 *   components:[ {component_id, label_texts:[], bbox_norm, confidence, evidence:[]} ],
 *   warnings:  []
 * }
 * bbox_norm: coordinate normalizzate 0..1 rispetto all'immagine originale.
 */

/** Tipi di regione supportati */
var REGION_TYPES = {
  PANEL:        "REGION_PANEL",       // quadro intero (crop principale)
  DIN_STRIPS:   "REGION_DIN_STRIPS",  // bande orizzontali guida DIN
  LABEL_ZONES:  "REGION_LABEL_ZONES", // aree ad alto contrasto/testo
  TIMER_ZONE:   "REGION_TIMER_ZONE"   // aree con forme circolari (timer/orologi)
};

/** Soglie confidence (allineate a recognitionEngine.js) */
var CONF_THRESHOLDS = { HIGH: 0.75, MEDIUM: 0.50, LOW: 0.00 };

/**
 * Crea un vision_result vuoto con schema valido.
 * @param {string} imageId
 * @returns {object}
 */
function emptyResult(imageId) {
  return {
    image_id:   String(imageId || "unknown"),
    preproc:    { deskew_deg: 0, resized_to: null, notes: [] },
    regions:    [],
    ocr:        [],
    components: [],
    warnings:   []
  };
}

/**
 * Valida che un vision_result rispetti lo schema minimo.
 * @param {object} vr
 * @returns {{ valid:boolean, errors:string[] }}
 */
function validateSchema(vr) {
  var errs = [];
  if (!vr || typeof vr !== "object") { errs.push("vision_result is not an object"); return { valid: false, errors: errs }; }
  if (typeof vr.image_id !== "string")          errs.push("image_id must be string");
  if (!vr.preproc || typeof vr.preproc !== "object") errs.push("preproc missing");
  if (!Array.isArray(vr.regions))    errs.push("regions must be array");
  if (!Array.isArray(vr.ocr))        errs.push("ocr must be array");
  if (!Array.isArray(vr.components)) errs.push("components must be array");
  if (!Array.isArray(vr.warnings))   errs.push("warnings must be array");
  // Valida ogni componente HIGH ha evidence non vuota
  (vr.components || []).forEach(function(c, i) {
    if (c.confidence >= CONF_THRESHOLDS.HIGH) {
      if (!Array.isArray(c.evidence) || c.evidence.length === 0) {
        errs.push("components[" + i + "] HIGH senza evidence");
      }
    }
  });
  return { valid: errs.length === 0, errors: errs };
}

module.exports = { REGION_TYPES, CONF_THRESHOLDS, emptyResult, validateSchema };
