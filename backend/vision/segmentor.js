"use strict";
/**
 * segmentor.js — Segmentazione euristica regioni di un quadro elettrico.
 *
 * NON usa ML. Produce regioni candidate basate su:
 *   - Layout tipico di un quadro elettrico (guida DIN in strisce orizzontali)
 *   - Aspect ratio dell'immagine
 *   - Euristiche di posizionamento standard IEC 60439
 *
 * Output: array di regioni con bbox_norm:[x,y,w,h] e confidence.
 * bbox_norm = coordinate normalizzate 0..1 rispetto all'immagine.
 *
 * Env: VISION_DEBUG=1 per logging verbose.
 */

var REGION_TYPES = require("./visionTypes").REGION_TYPES;
var DEBUG = process.env.VISION_DEBUG === "1";

function dbg() {
  if (DEBUG) {
    var args = Array.prototype.slice.call(arguments);
    console.error.apply(console, ["[VISION-DEBUG][segmentor]"].concat(args));
  }
}

// Layout tipico quadro DIN: 3–6 strisce orizzontali (ripiani)
// Ciascuna striscia è circa il 15–20% dell'altezza totale
var DIN_STRIP_HEIGHT = 0.15;  // proporzione altezza per striscia
var DIN_STRIPS_COUNT = 5;     // numero tipico di strisce

// Zona etichette: spesso nell'ultimo 20% in basso (morsettiera + etichette)
// o nei 10% superiori (intestazione quadro)

/**
 * Segmenta l'immagine in regioni candidate.
 * @param {{ width:number, height:number }|null} dims - dimensioni immagine (null = usa default 4:3)
 * @returns {Array<{id, type, bbox_norm:[x,y,w,h], confidence}>}
 */
function segmentPanel(dims) {
  var w = (dims && dims.width)  || 1200;
  var h = (dims && dims.height) || 1600;
  var aspectRatio = w / h;
  var regions = [];
  var regionId = 0;

  dbg("segmento immagine", w + "x" + h, "aspect=" + aspectRatio.toFixed(2));

  // ── 1. REGION_PANEL: quadro intero ───────────────────────────────────
  regions.push({
    id:         "r" + (++regionId),
    type:       REGION_TYPES.PANEL,
    bbox_norm:  [0.0, 0.0, 1.0, 1.0],
    confidence: 1.0
  });
  dbg("REGION_PANEL aggiunto");

  // ── 2. REGION_DIN_STRIPS: strisce DIN orizzontali ────────────────────
  // I quadri elettrici hanno tipicamente 3–6 ripiani DIN
  // Partenza: ~5% dall'alto (intestazione panel), termine: ~85% (sopra morsettiera)
  var stripStart = 0.05;
  var stripEnd   = 0.85;
  var usableH    = stripEnd - stripStart;
  var stripH     = Math.min(DIN_STRIP_HEIGHT, usableH / DIN_STRIPS_COUNT);
  var numStrips  = Math.round(usableH / stripH);
  numStrips = Math.max(2, Math.min(numStrips, DIN_STRIPS_COUNT));

  for (var i = 0; i < numStrips; i++) {
    var y0 = stripStart + i * (usableH / numStrips);
    var h0 = usableH / numStrips;
    // Larghezza: 90% al centro (esclude bordi quadro)
    regions.push({
      id:        "r" + (++regionId),
      type:       REGION_TYPES.DIN_STRIPS,
      bbox_norm:  [0.05, y0, 0.90, h0],
      confidence: 0.70  // certezza media — layout euristico
    });
  }
  dbg("DIN_STRIPS:", numStrips, "strisce aggiunte");

  // ── 3. REGION_LABEL_ZONES: zone etichette ────────────────────────────
  // a) Header zone: primo 8% in alto (targhetta identificativa)
  regions.push({
    id:        "r" + (++regionId),
    type:       REGION_TYPES.LABEL_ZONES,
    bbox_norm:  [0.05, 0.00, 0.90, 0.08],
    confidence: 0.65
  });
  // b) Footer zone: ultimo 15% (morsettiere + etichette circuiti)
  regions.push({
    id:        "r" + (++regionId),
    type:       REGION_TYPES.LABEL_ZONES,
    bbox_norm:  [0.05, 0.85, 0.90, 0.15],
    confidence: 0.65
  });
  // c) Finestrelle moduli DIN: bande strette a ~1/3 e ~2/3 altezza
  //    (le finestrelle di visualizzazione dei moduli sono ~10% altezza, centrate verticalmente)
  [0.30, 0.55].forEach(function(yCenter) {
    regions.push({
      id:        "r" + (++regionId),
      type:       REGION_TYPES.LABEL_ZONES,
      bbox_norm:  [0.05, yCenter - 0.05, 0.90, 0.10],
      confidence: 0.60
    });
  });
  dbg("LABEL_ZONES: 4 zone aggiunte");

  // ── 4. REGION_TIMER_ZONE: zone timer/orologi ─────────────────────────
  // I timer digitali DIN hanno tipicamente forme circolari/quadrate con display
  // Posizione tipica: secondo ripiano (25–45% altezza), lato sinistro/centro
  regions.push({
    id:        "r" + (++regionId),
    type:       REGION_TYPES.TIMER_ZONE,
    bbox_norm:  [0.05, 0.20, 0.50, 0.25],
    confidence: 0.40  // confidenza bassa — puramente euristica
  });
  dbg("TIMER_ZONE aggiunta");

  dbg("totale regioni:", regions.length);
  return regions;
}

module.exports = { segmentPanel };
