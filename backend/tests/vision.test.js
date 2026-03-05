"use strict";
/**
 * vision.test.js — Acceptance tests per ROCCO Vision Pipeline
 *
 * Esegui: node backend/tests/vision.test.js
 * (nessuna dipendenza esterna, solo assert + fs nativi Node.js)
 *
 * Test suite:
 *   Suite 1: Schema validation (sempre eseguito)
 *   Suite 2: Segmentazione ROI (sempre eseguito)
 *   Suite 3: OCR tokenizzazione (sempre eseguito — su testo sintetico)
 *   Suite 4: Fusione catalogo (sempre eseguito — con testo sintetico)
 *   Suite 5: Integration su fixture reali (SKIP se no fixtures)
 *
 * Criteri di DONE:
 *   - vision_result valido (schema)
 *   - >=1 REGION_PANEL e >=1 REGION_LABEL_ZONES prodotte
 *   - almeno 1 token tecnico estratto se OCR testo disponibile
 *   - NO componenti HIGH senza evidence
 *   - fusione correttamente identifica componenti da testo OCR simulato
 */

var assert = require("assert");
var path   = require("path");
var fs     = require("fs");

// ── Carica moduli ──────────────────────────────────────────────────────────

function loadModule(relPath) {
  try {
    return require(path.join(__dirname, relPath));
  } catch (e) {
    console.error("ERRORE: impossibile caricare", relPath, "→", e.message);
    process.exit(1);
  }
}

var visionTypes = loadModule("../vision/visionTypes");
var segmentor   = loadModule("../vision/segmentor");
var ocrEngine   = loadModule("../vision/ocrEngine");
var visionFusion = loadModule("../vision/visionFusion");
var analyzePanel = loadModule("../vision/analyzePanel").analyzePanel;

var emptyResult    = visionTypes.emptyResult;
var validateSchema = visionTypes.validateSchema;
var REGION_TYPES   = visionTypes.REGION_TYPES;
var CONF_TH        = visionTypes.CONF_THRESHOLDS;

// ── Utilities test ─────────────────────────────────────────────────────────

var passed = 0;
var failed = 0;

function test(desc, fn) {
  try {
    if (fn.constructor.name === "AsyncFunction") {
      // async test — run sync for now via wrapper
      console.log("  [async] " + desc + " — usa runAsync()");
      return;
    }
    fn();
    console.log("  \u2713 " + desc);
    passed++;
  } catch (e) {
    console.log("  \u2717 " + desc + " \u2014 " + e.message);
    failed++;
  }
}

async function testAsync(desc, fn) {
  try {
    await fn();
    console.log("  \u2713 " + desc);
    passed++;
  } catch (e) {
    console.log("  \u2717 " + desc + " \u2014 " + e.message);
    failed++;
  }
}

function skip(desc, reason) {
  console.log("  \u25CB SKIP " + desc + " — " + reason);
}

// ── Minimal JPEG stub (1x1 pixel JPEG valido) ──────────────────────────────
// Sequenza minima JPEG valida con SOF per readDimensions
var STUB_JPEG = Buffer.from(
  "FFD8FFE000104A46494600010100000100010000FFDB00430001010101010101010101" +
  "010101010101010101010101010101010101010101010101010101010101010101010101" +
  "010101010101010101010101010101010101010101FFC000110801000100011100FFDA" +
  "000801011200003F00FBFFD9".replace(/\s/g, ""),
  "hex"
);

// ══════════════════════════════════════════════════════════════════════
console.log("\n\u2550\u2550\u2550 ROCCO Vision Pipeline \u2014 Acceptance Tests \u2550\u2550\u2550\n");

async function runAllTests() {

  // ── SUITE 1: Schema validation ─────────────────────────────────────
  console.log("SUITE 1: Schema validation\n");

  test("emptyResult produce schema valido", function() {
    var vr = emptyResult("test-001");
    var v  = validateSchema(vr);
    assert.ok(v.valid, "schema non valido: " + v.errors.join("; "));
  });

  test("validateSchema rileva image_id mancante", function() {
    var vr = emptyResult("x");
    delete vr.image_id;
    var v = validateSchema(vr);
    assert.ok(!v.valid, "doveva essere invalido");
  });

  test("validateSchema rileva regions non-array", function() {
    var vr = emptyResult("x");
    vr.regions = "non-array";
    var v = validateSchema(vr);
    assert.ok(!v.valid && v.errors.some(function(e) { return e.indexOf("regions") >= 0; }),
      "errore regions non rilevato");
  });

  test("validateSchema blocca HIGH senza evidence", function() {
    var vr = emptyResult("x");
    vr.components.push({
      component_id: "magnetotermico", confidence: 0.90,
      band: "HIGH", label_texts: [], bbox_norm: [0,0,1,1], evidence: []
    });
    var v = validateSchema(vr);
    assert.ok(!v.valid && v.errors.some(function(e) { return e.indexOf("evidence") >= 0; }),
      "errore evidence non rilevato");
  });

  test("validateSchema accetta HIGH con evidence non vuota", function() {
    var vr = emptyResult("x");
    vr.components.push({
      component_id: "magnetotermico", confidence: 0.90,
      band: "HIGH", label_texts: ["C16"], bbox_norm: [0,0,1,1],
      evidence: [{ type: "alias", matched: "magnetotermico", weight: 0.5 }]
    });
    var v = validateSchema(vr);
    assert.ok(v.valid, "schema non valido: " + v.errors.join("; "));
  });

  // ── SUITE 2: Segmentazione ROI ─────────────────────────────────────
  console.log("\nSUITE 2: Segmentazione ROI\n");

  test("segmentPanel produce >=1 REGION_PANEL", function() {
    var regions = segmentor.segmentPanel({ width: 1200, height: 1600 });
    var panels  = regions.filter(function(r) { return r.type === REGION_TYPES.PANEL; });
    assert.ok(panels.length >= 1, "nessuna REGION_PANEL trovata");
  });

  test("segmentPanel produce >=1 REGION_LABEL_ZONES", function() {
    var regions = segmentor.segmentPanel({ width: 1200, height: 1600 });
    var labels  = regions.filter(function(r) { return r.type === REGION_TYPES.LABEL_ZONES; });
    assert.ok(labels.length >= 1, "nessuna REGION_LABEL_ZONES trovata");
  });

  test("segmentPanel produce >=1 REGION_DIN_STRIPS", function() {
    var regions = segmentor.segmentPanel({ width: 1200, height: 1600 });
    var strips  = regions.filter(function(r) { return r.type === REGION_TYPES.DIN_STRIPS; });
    assert.ok(strips.length >= 1, "nessuna REGION_DIN_STRIPS trovata");
  });

  test("segmentPanel funziona con dims null (fallback)", function() {
    var regions = segmentor.segmentPanel(null);
    assert.ok(regions.length >= 3, "troppo poche regioni senza dims");
  });

  test("segmentPanel: tutte le bbox_norm sono in [0,1]", function() {
    var regions = segmentor.segmentPanel({ width: 800, height: 600 });
    regions.forEach(function(r, i) {
      var b = r.bbox_norm;
      assert.ok(b[0] >= 0 && b[1] >= 0 && b[2] > 0 && b[3] > 0 &&
                b[0] + b[2] <= 1.01 && b[1] + b[3] <= 1.01,
        "bbox_norm[" + i + "] non valida: " + JSON.stringify(b));
    });
  });

  // ── SUITE 3: OCR tokenizzazione ────────────────────────────────────
  console.log("\nSUITE 3: OCR tokenizzazione (su testo sintetico)\n");

  test("tokenize estrae curva magnetotermico (C16)", function() {
    var tokens = ocrEngine.tokenize("Hager C16 2P 6kA curva C");
    var curves = tokens.filter(function(t) { return t.name === "curve"; });
    assert.ok(curves.length >= 1, "C16 non estratto. Tokens: " + JSON.stringify(tokens));
  });

  test("tokenize estrae mA differenziale (30mA)", function() {
    var tokens = ocrEngine.tokenize("RCD 40A 30mA tipo AC");
    var maTok  = tokens.filter(function(t) { return t.name === "mA"; });
    assert.ok(maTok.length >= 1, "30mA non estratto");
  });

  test("tokenize estrae tensione (24VDC)", function() {
    var tokens = ocrEngine.tokenize("MEAN WELL 24VDC 5A");
    var vTok   = tokens.filter(function(t) { return t.name === "voltage"; });
    assert.ok(vTok.length >= 1, "24VDC non estratto");
  });

  test("tokenize estrae sigla KM1", function() {
    var tokens = ocrEngine.tokenize("KM1 bobina 24VAC contattore");
    var sigs   = tokens.filter(function(t) { return t.name === "sigle"; });
    assert.ok(sigs.length >= 1, "KM1 non estratto");
  });

  test("tokenize restituisce array vuoto su stringa vuota", function() {
    var tokens = ocrEngine.tokenize("");
    assert.strictEqual(tokens.length, 0, "atteso array vuoto");
  });

  test("tokenize non duplica lo stesso token", function() {
    var tokens = ocrEngine.tokenize("C16 protezione C16 linea C16");
    var c16toks = tokens.filter(function(t) { return t.value === "C16"; });
    assert.ok(c16toks.length <= 1, "C16 duplicato: " + c16toks.length + " volte");
  });

  // ── SUITE 4: Fusione con catalogo ──────────────────────────────────
  console.log("\nSUITE 4: Fusione Vision + OCR + Catalogo\n");

  test("fuseComponents identifica magnetotermico da OCR (C16)", function() {
    var regions = segmentor.segmentPanel({ width: 1000, height: 1400 });
    var ocrResults = [{
      region_id: "r1", text: "Hager C16 2P curva C magnetotermico",
      tokens: ocrEngine.tokenize("Hager C16 2P curva C magnetotermico"),
      confidence: 0.80
    }];
    var comps = visionFusion.fuseComponents(regions, ocrResults, "");
    var mt = comps.find(function(c) { return c.component_id === "magnetotermico"; });
    assert.ok(mt && mt.confidence >= 0.50,
      "magnetotermico non trovato o conf troppo bassa: " + (mt ? mt.confidence : "non trovato"));
  });

  test("fuseComponents identifica differenziale da OCR (30mA tipo AC)", function() {
    var regions = segmentor.segmentPanel({ width: 1000, height: 1400 });
    var ocrResults = [{
      region_id: "r1", text: "RCD 40A 30mA tipo AC differenziale",
      tokens: ocrEngine.tokenize("RCD 40A 30mA tipo AC differenziale"),
      confidence: 0.80
    }];
    var comps = visionFusion.fuseComponents(regions, ocrResults, "");
    var rcd = comps.find(function(c) { return c.component_id === "differenziale"; });
    assert.ok(rcd && rcd.confidence >= 0.50,
      "differenziale non trovato o conf troppo bassa: " + (rcd ? rcd.confidence : "non trovato"));
  });

  test("fuseComponents: HIGH components hanno sempre evidence non vuota", function() {
    var regions = segmentor.segmentPanel({ width: 1000, height: 1400 });
    var ocrResults = [{
      region_id: "r2", text: "contattore LC1-D18 KM1 bobina 24V avvio motore",
      tokens: ocrEngine.tokenize("contattore LC1-D18 KM1 bobina 24V avvio motore"),
      confidence: 0.85
    }];
    var comps = visionFusion.fuseComponents(regions, ocrResults, "contattore KM1 non chiude");
    comps.forEach(function(c) {
      if (c.confidence >= CONF_TH.HIGH) {
        assert.ok(c.evidence && c.evidence.length > 0,
          "HIGH senza evidence: " + c.component_id);
      }
    });
  });

  test("buildVisionContract produce testo con componente HIGH", function() {
    var mockComps = [{
      component_id: "magnetotermico", component_name: "Magnetotermico",
      label_texts: ["C16"], bbox_norm: [0,0,1,1],
      confidence: 0.95, band: "HIGH",
      evidence: [{ type: "alias", matched: "magnetotermico", weight: 0.5 }]
    }];
    var contract = visionFusion.buildVisionContract(mockComps);
    assert.ok(contract.indexOf("Magnetotermico") >= 0, "componente assente nel contract");
    assert.ok(contract.indexOf("C16") >= 0, "label_text C16 assente nel contract");
  });

  // ── SUITE 5: Integration test con stub buffer ──────────────────────
  console.log("\nSUITE 5: Integration con buffer stub\n");

  await testAsync("analyzePanel con stub JPEG + no callOcr → schema valido", async function() {
    var result = await analyzePanel(STUB_JPEG, "test-stub-001");
    var v = validateSchema(result);
    assert.ok(v.valid, "schema non valido: " + v.errors.join("; "));
    assert.ok(result.warnings.length > 0, "atteso warning su callOcr non disponibile");
    assert.ok(result.regions.length >= 1, "nessuna regione prodotta");
  });

  await testAsync("analyzePanel con stub JPEG → REGION_PANEL presente", async function() {
    var result = await analyzePanel(STUB_JPEG, "test-stub-002");
    var panels = result.regions.filter(function(r) { return r.type === REGION_TYPES.PANEL; });
    assert.ok(panels.length >= 1, "REGION_PANEL assente");
  });

  await testAsync("analyzePanel con stub JPEG → REGION_LABEL_ZONES presente", async function() {
    var result = await analyzePanel(STUB_JPEG, "test-stub-003");
    var labels = result.regions.filter(function(r) { return r.type === REGION_TYPES.LABEL_ZONES; });
    assert.ok(labels.length >= 1, "REGION_LABEL_ZONES assente");
  });

  await testAsync("analyzePanel con callOcr stub → OCR eseguito e componenti prodotti", async function() {
    // callOcr stub: restituisce testo fisso con marcature di test
    var stubCallOcr = async function(buf, prompt) {
      return "magnetotermico C16 curva C Hager 2P 6kA differenziale 30mA tipo AC";
    };
    var result = await analyzePanel(STUB_JPEG, "test-stub-004", {
      callOcr: stubCallOcr,
      userText: ""
    });
    var v = validateSchema(result);
    assert.ok(v.valid, "schema non valido: " + v.errors.join("; "));
    assert.ok(result.ocr.length >= 1, "nessun risultato OCR");
    // Almeno 1 token tecnico estratto
    var allTokens = result.ocr.reduce(function(acc, o) { return acc.concat(o.tokens || []); }, []);
    assert.ok(allTokens.length >= 1, "nessun token tecnico estratto dall'OCR stub");
    // Almeno 1 componente rilevato
    assert.ok(result.components.length >= 1, "nessun componente identificato");
    // Tutti i HIGH hanno evidence
    result.components.forEach(function(c) {
      if (c.confidence >= CONF_TH.HIGH) {
        assert.ok(c.evidence && c.evidence.length > 0,
          "HIGH senza evidence: " + c.component_id);
      }
    });
  });

  // ── SUITE 6: Fixture reali (condizionale) ──────────────────────────
  console.log("\nSUITE 6: Fixture reali\n");

  var fixturesDir = path.join(__dirname, "fixtures/panels");
  var fixtures = [];
  try {
    fixtures = fs.readdirSync(fixturesDir)
      .filter(function(f) { return /\.(jpg|jpeg|png)$/i.test(f); });
  } catch (e) { /* directory potrebbe non esistere */ }

  if (fixtures.length === 0) {
    skip("Test su immagini reali",
      "nessuna fixture in tests/fixtures/panels/ — vedi README.md per aggiungerne");
  } else {
    console.log("  Trovate " + fixtures.length + " fixture immagini");
    await testAsync("almeno 1 fixture produce vision_result valido", async function() {
      var imgPath = path.join(fixturesDir, fixtures[0]);
      var result  = await analyzePanel(imgPath, "fixture-001");
      var v = validateSchema(result);
      assert.ok(v.valid, "schema non valido: " + v.errors.join("; "));
      assert.ok(result.regions.length >= 1, "nessuna regione");
    });
  }

  // ── RISULTATO ───────────────────────────────────────────────────────
  console.log("\n" + "\u2550".repeat(55));
  console.log("RISULTATO: " + passed + "/" + (passed + failed) + " test superati");
  if (failed > 0) {
    console.log("FALLITI: " + failed + " test");
    process.exit(1);
  } else {
    console.log("TUTTI I TEST SUPERATI \u2713");
    process.exit(0);
  }
}

runAllTests().catch(function(e) {
  console.error("ERRORE CRITICO:", e.message);
  process.exit(1);
});
