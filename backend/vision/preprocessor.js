"use strict";
/**
 * preprocessor.js — Pipeline di preprocessing immagini per ROCCO Vision.
 *
 * Usa `sharp` se disponibile, altrimenti fallback no-op.
 * NO import di librerie ML/pesanti.
 *
 * Env: VISION_DEBUG=1 per logging verbose.
 *
 * Operazioni (se sharp disponibile):
 *   1. Resize a lato lungo fisso (TARGET_LONG_SIDE) mantenendo aspect ratio
 *   2. Sharpen moderato + normalizzazione contrasto
 *   3. Auto-crop: non implementato (troppo context-dependent senza ML)
 *   4. Deskew: stima angolo via metadati EXIF (se disponibile), altrimenti 0°
 */

var path = require("path");
var fs   = require("fs");
var DEBUG = process.env.VISION_DEBUG === "1";

function dbg() {
  if (DEBUG) {
    var args = Array.prototype.slice.call(arguments);
    console.error.apply(console, ["[VISION-DEBUG][preproc]"].concat(args));
  }
}

// Carica sharp opzionalmente
var sharp = null;
try {
  sharp = require("sharp");
  dbg("sharp disponibile: preprocessing attivo");
} catch (e) {
  dbg("sharp non disponibile — preprocessing disabilitato (npm install sharp per attivarlo)");
}

var TARGET_LONG_SIDE = 1800; // px

/**
 * Legge dimensioni da buffer JPEG/PNG senza librerie esterne.
 * @param {Buffer} buf
 * @returns {{ width:number, height:number }|null}
 */
function readDimensions(buf) {
  if (!buf || buf.length < 24) return null;
  try {
    // JPEG: cerca SOF marker (FF C0, FF C1, FF C2)
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      var i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xFF) { i++; continue; }
        var marker = buf[i + 1];
        if (marker >= 0xC0 && marker <= 0xC3) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        var segLen = buf.readUInt16BE(i + 2);
        i += 2 + segLen;
      }
    }
    // PNG: dimensioni a offset 16
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
  } catch (e) { /* ignore */ }
  return null;
}

/**
 * Pre-elabora un buffer immagine.
 * @param {Buffer} imageBuffer
 * @returns {Promise<{ buffer:Buffer, deskew_deg:number, resized_to:[w,h]|null, notes:string[] }>}
 */
async function preprocess(imageBuffer) {
  var notes = [];
  var deskew_deg = 0;
  var resized_to = null;

  if (!Buffer.isBuffer(imageBuffer)) {
    notes.push("input non è un Buffer — preprocessing saltato");
    return { buffer: imageBuffer, deskew_deg, resized_to, notes };
  }

  var dims = readDimensions(imageBuffer);
  if (dims) {
    dbg("dimensioni originali:", dims.width + "x" + dims.height);
    notes.push("dimensioni originali: " + dims.width + "x" + dims.height);
  }

  if (!sharp) {
    notes.push("sharp non installato — immagine usata senza preprocessing (qualità OCR ridotta)");
    notes.push("suggerimento: cd backend && npm install sharp");
    return { buffer: imageBuffer, deskew_deg, resized_to, notes };
  }

  try {
    var meta = await sharp(imageBuffer).metadata();
    dbg("sharp metadata:", JSON.stringify({ width: meta.width, height: meta.height, format: meta.format }));

    // Orientamento EXIF → stima deskew
    if (meta.orientation && meta.orientation !== 1) {
      deskew_deg = [0, 0, 180, 180, 90, 90, -90, -90][meta.orientation - 1] || 0;
      notes.push("orientamento EXIF " + meta.orientation + " → deskew " + deskew_deg + "°");
    }

    var longSide = Math.max(meta.width || 0, meta.height || 0);
    var doResize = longSide > TARGET_LONG_SIDE;

    var pipeline = sharp(imageBuffer)
      .rotate()  // applica orientamento EXIF
      .normalise()  // normalizza contrasto (CLAHE-like per sharp)
      .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.5 })  // sharpen moderato
      .jpeg({ quality: 92 });

    if (doResize) {
      var scaleFactor = TARGET_LONG_SIDE / longSide;
      var newW = Math.round((meta.width || longSide) * scaleFactor);
      var newH = Math.round((meta.height || longSide) * scaleFactor);
      pipeline = sharp(imageBuffer)
        .rotate()
        .resize({ width: newW, height: newH, fit: "inside" })
        .normalise()
        .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.5 })
        .jpeg({ quality: 92 });
      resized_to = [newW, newH];
      notes.push("resize: " + meta.width + "x" + meta.height + " → " + newW + "x" + newH);
      dbg("resize a", newW + "x" + newH);
    } else {
      resized_to = [meta.width, meta.height];
      notes.push("resize non necessario (" + meta.width + "x" + meta.height + ")");
    }

    var outBuffer = await pipeline.toBuffer();
    dbg("preprocessing completato, output size:", outBuffer.length, "bytes");
    return { buffer: outBuffer, deskew_deg, resized_to, notes };

  } catch (e) {
    notes.push("sharp error: " + e.message + " — fallback buffer originale");
    dbg("sharp error:", e.message);
    return { buffer: imageBuffer, deskew_deg, resized_to, notes };
  }
}

/**
 * Crop di una regione da un buffer immagine.
 * @param {Buffer} imageBuffer
 * @param {number[]} bbox_norm [x, y, w, h] normalizzati 0..1
 * @param {number} imgW larghezza reale
 * @param {number} imgH altezza reale
 * @returns {Promise<Buffer|null>}
 */
async function cropRegion(imageBuffer, bbox_norm, imgW, imgH) {
  if (!sharp || !imageBuffer || !bbox_norm) return null;
  try {
    var x = Math.round(bbox_norm[0] * imgW);
    var y = Math.round(bbox_norm[1] * imgH);
    var w = Math.round(bbox_norm[2] * imgW);
    var h = Math.round(bbox_norm[3] * imgH);
    // Clamp
    x = Math.max(0, x); y = Math.max(0, y);
    w = Math.min(imgW - x, w); h = Math.min(imgH - y, h);
    if (w <= 0 || h <= 0) return null;
    return await sharp(imageBuffer)
      .extract({ left: x, top: y, width: w, height: h })
      .normalise()
      .sharpen({ sigma: 1.2 })
      .jpeg({ quality: 95 })
      .toBuffer();
  } catch (e) {
    dbg("cropRegion error:", e.message);
    return null;
  }
}

module.exports = { preprocess, cropRegion, readDimensions, sharpAvailable: !!sharp };
