"use strict";
/**
 * ocrEngine.js — OCR mirato su ROI tramite LLM vision API.
 *
 * NESSUNA dipendenza pesante (tesseract, opencv, ecc.).
 * Usa il callOcr iniettato da server.js (OpenAI/Anthropic vision).
 *
 * Pipeline per ROI:
 *   1. Riceve buffer immagine (già preprocessato)
 *   2. Chiama callOcr(imageBuffer, prompt) → testo estratto
 *   3. Tokenizzazione regex su marcature tecniche elettriche
 *
 * Env: VISION_DEBUG=1 per logging.
 */

var DEBUG = process.env.VISION_DEBUG === "1";

function dbg() {
  if (DEBUG) {
    var args = Array.prototype.slice.call(arguments);
    console.error.apply(console, ["[VISION-DEBUG][ocr]"].concat(args));
  }
}

// ── Regex tokenizzazione tecnica ──────────────────────────────────────────

var TOKEN_PATTERNS = [
  // Curve magnetotermici: C16, B10, D6, K4
  { name: "curve",   rx: /\b[CBDK]\d{1,3}\b/g },
  // Corrente differenziale: 30mA, 300mA, 10mA, 0.03A
  { name: "mA",      rx: /\b\d{1,4}\s*mA\b|\b0\.0?3\s*A\b/gi },
  // Tensione: 230V, 400V, 24VDC, 24V DC, 12VDC
  { name: "voltage", rx: /\b\d{1,4}\s*V\s*(AC|DC)?\b/gi },
  // Frequenza: 50Hz, 60Hz
  { name: "hz",      rx: /\b\d{2,3}\s*Hz\b/gi },
  // Corrente nominale: 16A, 32A, 63A, 100A
  { name: "ampere",  rx: /\b\d{1,4}\s*A\b/g },
  // Potenza: 1.5kW, 250W
  { name: "power",   rx: /\b\d+(\.\d+)?\s*[kK]?W\b/g },
  // Pressione: 4bar, 1.5 bar
  { name: "bar",     rx: /\b\d+(\.\d+)?\s*bar\b/gi },
  // Tipo differenziale: tipo A, tipo AC, tipo F, tipo B
  { name: "tipoRCD", rx: /\btipo\s+[ABFHI]\b/gi },
  // IP rating: IP65, IP67, IP44
  { name: "ip",      rx: /\bIP\s*\d{2,3}\b/gi },
  // Sigle note: MCB, RCD, RCBO, VFD, PLC, KM1, A1-A2
  { name: "sigle",   rx: /\b(MCB|RCD|RCCB|RCBO|VFD|PLC|MTR|KM\d*|LC1[A-Z0-9\-]*)\b/gi }
];

/**
 * Estrae token tecnici da un testo OCR grezzo.
 * @param {string} rawText
 * @returns {Array<{name, value, rx_name}>}
 */
function tokenize(rawText) {
  if (!rawText) return [];
  var tokens = [];
  var seen = {};
  TOKEN_PATTERNS.forEach(function(tp) {
    var rx = new RegExp(tp.rx.source, tp.rx.flags);
    var match;
    while ((match = rx.exec(rawText)) !== null) {
      var val = match[0].trim();
      var key = tp.name + ":" + val.toLowerCase();
      if (!seen[key]) {
        seen[key] = true;
        tokens.push({ name: tp.name, value: val, rx_name: tp.name });
      }
    }
  });
  dbg("tokenize: trovati", tokens.length, "token in", rawText.length, "chars");
  return tokens;
}

// ── Prompt OCR strutturato ────────────────────────────────────────────────

var OCR_PROMPT = [
  "You are an OCR engine specialized in electrical panel images.",
  "Extract ALL visible technical text from this image region.",
  "Focus specifically on:",
  "- Circuit breaker ratings (e.g. C16, B10, C32, D6)",
  "- Differential ratings (e.g. 30mA, 300mA, tipo AC, tipo A)",
  "- Voltage labels (e.g. 230V, 400V, 24VDC, 24V DC)",
  "- Current ratings (e.g. 16A, 25A, 63A)",
  "- Component codes (e.g. KM1, KM2, LC1-D18, MTR, RCD, RCBO)",
  "- Brand names (e.g. HAGER, ABB, SCHNEIDER, MEAN WELL)",
  "- Any other alphanumeric text visible on DIN-rail modules, labels or nameplates.",
  "Return ONLY the extracted text, one item per line. No explanations."
].join("\n");

/**
 * Esegue OCR su una regione immagine via callOcr iniettato.
 * @param {string} regionId
 * @param {Buffer|null} regionBuffer
 * @param {Function|null} callOcr - async(imageBuffer, promptString) → string
 * @returns {Promise<{region_id, text, tokens, confidence}>}
 */
async function ocrRegion(regionId, regionBuffer, callOcr) {
  var result = { region_id: regionId, text: "", tokens: [], confidence: 0 };

  if (!regionBuffer) {
    dbg("ocrRegion", regionId, "— buffer null, skip");
    return result;
  }
  if (typeof callOcr !== "function") {
    dbg("ocrRegion", regionId, "— callOcr non disponibile, skip");
    return result;
  }

  try {
    dbg("ocrRegion", regionId, "— chiamata callOcr, buffer size:", regionBuffer.length);
    var rawText = await callOcr(regionBuffer, OCR_PROMPT);
    if (!rawText) return result;

    result.text       = String(rawText).trim();
    result.tokens     = tokenize(result.text);
    result.confidence = result.tokens.length > 0 ? 0.70 : 0.30;
    dbg("ocrRegion", regionId, "— testo estratto:", result.text.slice(0, 100),
        "| token:", result.tokens.length);
  } catch (e) {
    dbg("ocrRegion", regionId, "— errore:", e.message);
    result.confidence = 0;
  }

  return result;
}

/**
 * Esegue OCR sull'immagine intera (fallback se no cropping disponibile).
 * @param {Buffer} imageBuffer
 * @param {Function|null} callOcr
 * @returns {Promise<{region_id, text, tokens, confidence}>}
 */
async function ocrFullImage(imageBuffer, callOcr) {
  return ocrRegion("full_image", imageBuffer, callOcr);
}

module.exports = { ocrRegion, ocrFullImage, tokenize, OCR_PROMPT, TOKEN_PATTERNS };
