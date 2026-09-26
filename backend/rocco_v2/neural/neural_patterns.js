"use strict";

// ============================================================================
// NEURAL PATTERNS — Riconoscimento pattern misure elettriche per ROCCO
// Anomaly detection (autoencoder) + Fault classification
// ============================================================================

var nc = require("./neural_core");

// --- Feature schema ---
// Ogni vettore di features rappresenta una situazione elettrica misurata
var FEATURE_NAMES = [
  "tensione_fn",         // 0 - V fase-neutro (norm /400)
  "tensione_ff",         // 1 - V fase-fase (norm /700)
  "corrente",            // 2 - A (norm /100)
  "isolamento",          // 3 - MOhm (log scale, norm)
  "continuita",          // 4 - Ohm (log scale, norm)
  "cosfi",               // 5 - 0-1 diretto
  "frequenza",           // 6 - Hz (norm = (f-45)/20)
  "temperatura",         // 7 - °C (norm /200)
  "thd",                 // 8 - % armoniche (norm /100)
  "corrente_dispersione", // 9 - mA (norm /500)
  "squilibrio_fasi",     // 10 - % (norm /50)
  "corrente_neutro",     // 11 - A (norm /100)
  // Categorie one-hot (sistema)
  "sys_civile",          // 12
  "sys_motore",          // 13
  "sys_caldaia",         // 14
  "sys_fotovoltaico",    // 15
  "sys_generico",        // 16
  // Flag binari
  "ha_diff",             // 17
  "ha_mcb",              // 18
  "protezione_scattata", // 19
  "carico_collegato"     // 20
];

var INPUT_DIM = FEATURE_NAMES.length; // 21

// --- Fault classes ---
var FAULT_CLASSES = [
  "dispersione",         // 0
  "cortocircuito",       // 1
  "sovraccarico",        // 2
  "interruzione",        // 3
  "surriscaldamento",    // 4
  "guasto_componente",   // 5
  "squilibrio",          // 6
  "nessuno"              // 7
];

var NUM_FAULTS = FAULT_CLASSES.length;

// --- Reti neurali ---
var anomalyNet = null;   // Autoencoder: INPUT_DIM → 10 → 5 → 10 → INPUT_DIM
var faultNet = null;     // Classifier: INPUT_DIM → 32 → 16 → NUM_FAULTS

// Soglia anomalia (dinamica, si adatta)
var anomalyThreshold = 0.1;
var anomalyHistory = [];
var ANOMALY_HISTORY_MAX = 100;

// ============================================================================
// Feature Extraction
// ============================================================================

function normalizeValue(val, min, max) {
  if (val === null || val === undefined || val === -1) return -1; // missing
  return Math.max(0, Math.min(1, (val - min) / (max - min)));
}

function logNormalize(val, maxVal) {
  if (val === null || val === undefined || val === -1) return -1;
  if (val <= 0) return 0;
  return Math.min(1, Math.log(1 + val) / Math.log(1 + maxVal));
}

function estraiFeaturesRaw(caseState) {
  var f = new Array(INPUT_DIM);
  for (var i = 0; i < INPUT_DIM; i++) f[i] = -1; // default: missing

  if (!caseState) return f;

  // Estrai misure da facts_confirmed, measurements, e problem_summary
  var allText = "";
  if (caseState.problem_summary) allText += caseState.problem_summary + " ";
  if (caseState.facts_confirmed) {
    for (var i = 0; i < caseState.facts_confirmed.length; i++) {
      allText += caseState.facts_confirmed[i] + " ";
    }
  }
  if (caseState.measurements) {
    for (var i = 0; i < caseState.measurements.length; i++) {
      var m = caseState.measurements[i];
      if (typeof m === "string") allText += m + " ";
      else if (m && m.description) allText += m.description + " ";
    }
  }

  // Parse valori dal testo
  var parsed = parseValoriDaTesto(allText);

  // Mappa valori a features normalizzate
  if (parsed.tensione_fn !== null) f[0] = normalizeValue(parsed.tensione_fn, 0, 400);
  if (parsed.tensione_ff !== null) f[1] = normalizeValue(parsed.tensione_ff, 0, 700);
  if (parsed.corrente !== null) f[2] = normalizeValue(parsed.corrente, 0, 100);
  if (parsed.isolamento !== null) f[3] = logNormalize(parsed.isolamento, 999);
  if (parsed.continuita !== null) f[4] = logNormalize(parsed.continuita, 999);
  if (parsed.cosfi !== null) f[5] = parsed.cosfi;
  if (parsed.frequenza !== null) f[6] = normalizeValue(parsed.frequenza, 45, 65);
  if (parsed.temperatura !== null) f[7] = normalizeValue(parsed.temperatura, 0, 200);
  if (parsed.thd !== null) f[8] = normalizeValue(parsed.thd, 0, 100);
  if (parsed.corrente_dispersione !== null) f[9] = normalizeValue(parsed.corrente_dispersione, 0, 500);
  if (parsed.squilibrio !== null) f[10] = normalizeValue(parsed.squilibrio, 0, 50);
  if (parsed.corrente_neutro !== null) f[11] = normalizeValue(parsed.corrente_neutro, 0, 100);

  // Sistema (one-hot)
  var sysType = detectSystemType(caseState);
  f[12] = sysType === "civile" ? 1 : 0;
  f[13] = sysType === "motore" ? 1 : 0;
  f[14] = sysType === "caldaia" ? 1 : 0;
  f[15] = sysType === "fotovoltaico" ? 1 : 0;
  f[16] = sysType === "generico" ? 1 : 0;

  // Flag binari
  f[17] = hasComponent(caseState, ["rcd", "rcbo", "differenziale", "salvavita"]) ? 1 : 0;
  f[18] = hasComponent(caseState, ["mcb", "magnetotermico", "interruttore"]) ? 1 : 0;
  f[19] = hasSymptom(allText, ["scatta", "interviene", "sgancia"]) ? 1 : 0;
  f[20] = hasSymptom(allText, ["carico", "collegato", "acceso", "funzionante"]) ? 1 : 0;

  // Sostituisci missing (-1) con 0.5 per la rete (valore neutro)
  return f;
}

function estraiFeaturesSafe(caseState) {
  var f = estraiFeaturesRaw(caseState);
  for (var i = 0; i < f.length; i++) {
    if (f[i] === -1) f[i] = 0.5; // neutro per la rete
  }
  return f;
}

// --- Parsing valori ---

function parseValoriDaTesto(testo) {
  var result = {
    tensione_fn: null, tensione_ff: null, corrente: null,
    isolamento: null, continuita: null, cosfi: null,
    frequenza: null, temperatura: null, thd: null,
    corrente_dispersione: null, squilibrio: null, corrente_neutro: null
  };

  if (!testo) return result;
  var t = testo.toLowerCase();

  // Tensione
  var vMatch = t.match(/(\d+[\.,]?\d*)\s*(v|volt)\b/);
  if (vMatch) {
    var v = parseFloat(vMatch[1].replace(",", "."));
    if (v > 300) result.tensione_ff = v;
    else result.tensione_fn = v;
  }

  // Corrente
  var aMatch = t.match(/(\d+[\.,]?\d*)\s*(a|ampere)\b/);
  if (aMatch) result.corrente = parseFloat(aMatch[1].replace(",", "."));

  // Corrente dispersione (mA)
  var maMatch = t.match(/(\d+[\.,]?\d*)\s*(ma|milliampere)/);
  if (maMatch) result.corrente_dispersione = parseFloat(maMatch[1].replace(",", "."));

  // Isolamento
  var isoMatch = t.match(/isolamento[:\s]*(\d+[\.,]?\d*)\s*(mohm|megaohm)/);
  if (isoMatch) result.isolamento = parseFloat(isoMatch[1].replace(",", "."));
  var isoMatch2 = t.match(/(\d+[\.,]?\d*)\s*(mohm|megaohm)/);
  if (!result.isolamento && isoMatch2) result.isolamento = parseFloat(isoMatch2[1].replace(",", "."));

  // Continuità
  var contMatch = t.match(/continuit[aà][:\s]*(\d+[\.,]?\d*)\s*(ohm)/);
  if (contMatch) result.continuita = parseFloat(contMatch[1].replace(",", "."));

  // Cosfi
  var cosMatch = t.match(/cos\s*[φfi][:\s=]*(\d+[\.,]?\d*)/);
  if (cosMatch) result.cosfi = parseFloat(cosMatch[1].replace(",", "."));

  // Frequenza
  var hzMatch = t.match(/(\d+[\.,]?\d*)\s*(hz|hertz)/);
  if (hzMatch) result.frequenza = parseFloat(hzMatch[1].replace(",", "."));

  // Temperatura
  var tempMatch = t.match(/(\d+[\.,]?\d*)\s*(°c|gradi|celsius)/);
  if (tempMatch) result.temperatura = parseFloat(tempMatch[1].replace(",", "."));

  // THD
  var thdMatch = t.match(/thd[:\s]*(\d+[\.,]?\d*)\s*%/);
  if (thdMatch) result.thd = parseFloat(thdMatch[1].replace(",", "."));

  return result;
}

function detectSystemType(cs) {
  if (!cs) return "generico";
  var text = ((cs.problem_summary || "") + " " + (cs.domain || "")).toLowerCase();
  if (/motore|trifase|3[\s-]?fasi/.test(text)) return "motore";
  if (/caldaia|boiler|scaldabagno/.test(text)) return "caldaia";
  if (/fotovoltaico|pannelli|inverter|solare/.test(text)) return "fotovoltaico";
  if (/civile|casa|appartamento|cucina|bagno|camera/.test(text)) return "civile";
  return "generico";
}

function hasComponent(cs, keywords) {
  if (!cs) return false;
  var text = ((cs.problem_summary || "") + " " +
    ((cs.components_detected || []).join(" "))).toLowerCase();
  for (var i = 0; i < keywords.length; i++) {
    if (text.indexOf(keywords[i]) >= 0) return true;
  }
  return false;
}

function hasSymptom(text, keywords) {
  text = (text || "").toLowerCase();
  for (var i = 0; i < keywords.length; i++) {
    if (text.indexOf(keywords[i]) >= 0) return true;
  }
  return false;
}

// ============================================================================
// Anomaly Detection (Autoencoder)
// ============================================================================

function initAnomalyNet() {
  if (anomalyNet) return;
  anomalyNet = nc.createNetwork([INPUT_DIM, 12, 6, 12, INPUT_DIM], "sigmoid");
  anomalyNet.config.learningRate = 0.05;
  anomalyNet.config.lossFunction = "mse";
}

function detectAnomaly(features) {
  initAnomalyNet();
  var safe = features.slice();
  for (var i = 0; i < safe.length; i++) {
    if (safe[i] === -1) safe[i] = 0.5;
  }

  var reconstructed = anomalyNet.predict(safe);
  var error = nc.mseLoss(reconstructed, safe);

  // Calcola quali features contribuiscono di più all'errore
  var featureErrors = [];
  for (var i = 0; i < safe.length; i++) {
    var fe = Math.abs(reconstructed[i] - safe[i]);
    if (fe > 0.1) {
      featureErrors.push({ feature: FEATURE_NAMES[i], error: fe });
    }
  }
  featureErrors.sort(function(a, b) { return b.error - a.error; });

  return {
    anomaly: error > anomalyThreshold,
    score: Math.min(1, error / Math.max(0.01, anomalyThreshold)),
    reconstructionError: error,
    threshold: anomalyThreshold,
    topFeatures: featureErrors.slice(0, 5)
  };
}

function aggiornaBaseline(features) {
  initAnomalyNet();
  var safe = features.slice();
  for (var i = 0; i < safe.length; i++) {
    if (safe[i] === -1) safe[i] = 0.5;
  }

  // Train autoencoder: input = output (ricostruzione)
  anomalyNet.trainStep(safe, safe);

  // Aggiorna soglia dinamica
  var reconstructed = anomalyNet.predict(safe);
  var error = nc.mseLoss(reconstructed, safe);
  anomalyHistory.push(error);
  if (anomalyHistory.length > ANOMALY_HISTORY_MAX) anomalyHistory.shift();

  // Soglia = media + 2 * deviazione standard
  if (anomalyHistory.length >= 10) {
    var mean = 0;
    for (var i = 0; i < anomalyHistory.length; i++) mean += anomalyHistory[i];
    mean /= anomalyHistory.length;
    var variance = 0;
    for (var i = 0; i < anomalyHistory.length; i++) {
      var d = anomalyHistory[i] - mean;
      variance += d * d;
    }
    variance /= anomalyHistory.length;
    anomalyThreshold = mean + 2 * Math.sqrt(variance);
    if (anomalyThreshold < 0.01) anomalyThreshold = 0.01;
  }
}

// ============================================================================
// Fault Classifier
// ============================================================================

function initFaultNet() {
  if (faultNet) return;
  faultNet = nc.createNetwork([INPUT_DIM, 32, 16, NUM_FAULTS], "relu", "cross_entropy");
  faultNet.config.learningRate = 0.05;
}

function classificaGuasto(features) {
  initFaultNet();
  var safe = features.slice();
  for (var i = 0; i < safe.length; i++) {
    if (safe[i] === -1) safe[i] = 0.5;
  }

  var probs = faultNet.predict(safe);
  var best = nc.argmax(probs);

  return {
    faultClass: FAULT_CLASSES[best],
    confidence: probs[best],
    all: FAULT_CLASSES.map(function(name, i) {
      return { faultClass: name, probability: probs[i] };
    }).sort(function(a, b) { return b.probability - a.probability; })
  };
}

function stimaIncertezza(features, faultResult) {
  var maxProb = faultResult.confidence;
  var sorted = faultResult.all;

  // Alta incertezza se la classe top ha bassa confidenza
  if (maxProb < 0.3) {
    return { certainty: "bassa", reason: "nessuna classe dominante" };
  }

  // Ambiguità se due classi sono vicine
  if (sorted.length >= 2 && sorted[1].probability > 0.25) {
    return {
      certainty: "media",
      reason: "ambiguità tra " + sorted[0].faultClass + " e " + sorted[1].faultClass
    };
  }

  if (maxProb > 0.7) {
    return { certainty: "alta", reason: "classe dominante chiara" };
  }

  return { certainty: "media", reason: "confidenza moderata" };
}

// ============================================================================
// Training
// ============================================================================

function trainDaCasoChiuso(caseState, feedback) {
  if (!feedback || !feedback.confirmedCause) return { trained: false, reason: "no confirmed cause" };

  var features = estraiFeaturesSafe(caseState);

  // Mappa causa confermata a classe di guasto
  var faultIdx = mapCauseToFaultClass(feedback.confirmedCause);

  // Train fault classifier
  initFaultNet();
  var target = nc.oneHot(faultIdx, NUM_FAULTS);
  faultNet.trainStep(features, target);

  // Se il guasto è "nessuno", addestra l'autoencoder come baseline
  if (faultIdx === FAULT_CLASSES.indexOf("nessuno")) {
    aggiornaBaseline(features);
  }

  return { trained: true, faultClass: FAULT_CLASSES[faultIdx] };
}

function mapCauseToFaultClass(cause) {
  if (!cause) return FAULT_CLASSES.indexOf("nessuno");
  var c = cause.toLowerCase();

  if (/dispersione|fuga|isolamento/i.test(c)) return 0;
  if (/cortocircuito|corto/i.test(c)) return 1;
  if (/sovraccarico|sovracorrente/i.test(c)) return 2;
  if (/interruzione|aperto|rotto|interrotto/i.test(c)) return 3;
  if (/surriscald|caldo|termico|joule/i.test(c)) return 4;
  if (/guasto|difettoso|bruciato|danneggiato/i.test(c)) return 5;
  if (/squilibrio|sbilanc/i.test(c)) return 6;
  return 7; // nessuno
}

// ============================================================================
// Bootstrap sintetico
// ============================================================================

function bootstrapSintetico() {
  initAnomalyNet();
  initFaultNet();

  // --- Dati sintetici "normali" per autoencoder ---
  var normali = [];
  for (var n = 0; n < 100; n++) {
    var f = new Array(INPUT_DIM);
    f[0] = normalizeValue(220 + Math.random() * 20, 0, 400);     // tensione_fn ~220-240V
    f[1] = normalizeValue(380 + Math.random() * 20, 0, 700);     // tensione_ff ~380-400V
    f[2] = normalizeValue(2 + Math.random() * 14, 0, 100);       // corrente ~2-16A
    f[3] = logNormalize(5 + Math.random() * 995, 999);           // isolamento >5MOhm
    f[4] = logNormalize(0.1 + Math.random() * 0.9, 999);         // continuità <1ohm
    f[5] = 0.85 + Math.random() * 0.15;                          // cosφ ~0.85-1.0
    f[6] = normalizeValue(49.5 + Math.random(), 45, 65);         // frequenza ~49.5-50.5Hz
    f[7] = normalizeValue(20 + Math.random() * 25, 0, 200);      // temperatura ~20-45°C
    f[8] = normalizeValue(Math.random() * 5, 0, 100);            // THD <5%
    f[9] = normalizeValue(Math.random() * 10, 0, 500);           // dispersione <10mA
    f[10] = normalizeValue(Math.random() * 3, 0, 50);            // squilibrio <3%
    f[11] = normalizeValue(Math.random() * 2, 0, 100);           // corrente neutro <2A
    // Sistema random
    var sys = Math.floor(Math.random() * 5);
    for (var s = 0; s < 5; s++) f[12 + s] = s === sys ? 1 : 0;
    f[17] = Math.random() > 0.3 ? 1 : 0;  // ha diff
    f[18] = 1;                              // ha mcb
    f[19] = 0;                              // non scattato
    f[20] = 1;                              // carico collegato
    normali.push(f);
  }

  // Addestra autoencoder su normali
  anomalyNet.train(normali, normali, { epochs: 50, shuffle: true });

  // --- Dati sintetici per fault classifier ---
  var faultInputs = [];
  var faultTargets = [];

  // Dispersione: isolamento basso, corrente dispersione alta
  for (var n = 0; n < 20; n++) {
    var f = generaFeatureBase();
    f[3] = logNormalize(0.01 + Math.random() * 0.4, 999); // isolamento <0.5MOhm
    f[9] = normalizeValue(30 + Math.random() * 200, 0, 500); // dispersione >30mA
    f[19] = 1; // protezione scattata
    faultInputs.push(f);
    faultTargets.push(nc.oneHot(0, NUM_FAULTS));
  }

  // Cortocircuito: corrente molto alta
  for (var n = 0; n < 20; n++) {
    var f = generaFeatureBase();
    f[2] = normalizeValue(50 + Math.random() * 50, 0, 100); // corrente >50A
    f[3] = logNormalize(0, 999); // isolamento ~0
    f[19] = 1;
    faultInputs.push(f);
    faultTargets.push(nc.oneHot(1, NUM_FAULTS));
  }

  // Sovraccarico: corrente sopra nominale
  for (var n = 0; n < 20; n++) {
    var f = generaFeatureBase();
    f[2] = normalizeValue(18 + Math.random() * 15, 0, 100); // corrente 18-33A
    f[7] = normalizeValue(50 + Math.random() * 40, 0, 200); // temperatura alta
    f[19] = 1;
    faultInputs.push(f);
    faultTargets.push(nc.oneHot(2, NUM_FAULTS));
  }

  // Interruzione: tensione 0, corrente 0
  for (var n = 0; n < 20; n++) {
    var f = generaFeatureBase();
    f[0] = normalizeValue(Math.random() * 5, 0, 400); // tensione ~0
    f[2] = normalizeValue(0, 0, 100); // corrente 0
    f[20] = 0;
    faultInputs.push(f);
    faultTargets.push(nc.oneHot(3, NUM_FAULTS));
  }

  // Surriscaldamento: temperatura alta
  for (var n = 0; n < 20; n++) {
    var f = generaFeatureBase();
    f[7] = normalizeValue(70 + Math.random() * 80, 0, 200); // >70°C
    f[2] = normalizeValue(10 + Math.random() * 20, 0, 100); // corrente moderata-alta
    faultInputs.push(f);
    faultTargets.push(nc.oneHot(4, NUM_FAULTS));
  }

  // Guasto componente: valori anomali misti
  for (var n = 0; n < 20; n++) {
    var f = generaFeatureBase();
    f[5] = Math.random() * 0.5; // cosφ basso
    f[0] = normalizeValue(180 + Math.random() * 30, 0, 400); // tensione bassa
    faultInputs.push(f);
    faultTargets.push(nc.oneHot(5, NUM_FAULTS));
  }

  // Squilibrio: squilibrio alto
  for (var n = 0; n < 20; n++) {
    var f = generaFeatureBase();
    f[10] = normalizeValue(10 + Math.random() * 30, 0, 50); // squilibrio >10%
    f[11] = normalizeValue(5 + Math.random() * 20, 0, 100); // corrente neutro alta
    f[13] = 1; f[12] = 0; // sistema motore
    faultInputs.push(f);
    faultTargets.push(nc.oneHot(6, NUM_FAULTS));
  }

  // Nessun guasto (normali)
  for (var n = 0; n < 20; n++) {
    faultInputs.push(normali[n % normali.length]);
    faultTargets.push(nc.oneHot(7, NUM_FAULTS));
  }

  // Addestra fault classifier
  faultNet.train(faultInputs, faultTargets, { epochs: 100, shuffle: true });

  // Aggiorna soglia anomalia
  for (var i = 0; i < normali.length; i++) {
    var recon = anomalyNet.predict(normali[i]);
    anomalyHistory.push(nc.mseLoss(recon, normali[i]));
  }
  if (anomalyHistory.length >= 10) {
    var mean = 0;
    for (var i = 0; i < anomalyHistory.length; i++) mean += anomalyHistory[i];
    mean /= anomalyHistory.length;
    var variance = 0;
    for (var i = 0; i < anomalyHistory.length; i++) {
      var d = anomalyHistory[i] - mean;
      variance += d * d;
    }
    variance /= anomalyHistory.length;
    anomalyThreshold = mean + 2 * Math.sqrt(variance);
  }

  return {
    normalSamples: normali.length,
    faultSamples: faultInputs.length,
    anomalyThreshold: anomalyThreshold
  };
}

function generaFeatureBase() {
  var f = new Array(INPUT_DIM);
  f[0] = normalizeValue(225 + Math.random() * 10, 0, 400);
  f[1] = normalizeValue(385 + Math.random() * 10, 0, 700);
  f[2] = normalizeValue(5 + Math.random() * 10, 0, 100);
  f[3] = logNormalize(10 + Math.random() * 500, 999);
  f[4] = logNormalize(0.2 + Math.random() * 0.5, 999);
  f[5] = 0.9 + Math.random() * 0.1;
  f[6] = normalizeValue(50, 45, 65);
  f[7] = normalizeValue(25 + Math.random() * 15, 0, 200);
  f[8] = normalizeValue(2 + Math.random() * 3, 0, 100);
  f[9] = normalizeValue(Math.random() * 5, 0, 500);
  f[10] = normalizeValue(Math.random() * 2, 0, 50);
  f[11] = normalizeValue(Math.random() * 1, 0, 100);
  var sys = Math.floor(Math.random() * 5);
  for (var s = 0; s < 5; s++) f[12 + s] = s === sys ? 1 : 0;
  f[17] = 1;
  f[18] = 1;
  f[19] = 0;
  f[20] = 1;
  return f;
}

// ============================================================================
// Persistenza
// ============================================================================

function salva() {
  return {
    version: 1,
    anomalyNet: anomalyNet ? anomalyNet.save() : null,
    faultNet: faultNet ? faultNet.save() : null,
    anomalyThreshold: anomalyThreshold,
    anomalyHistory: anomalyHistory,
    savedAt: new Date().toISOString()
  };
}

function carica(data) {
  if (!data || data.version !== 1) return false;
  anomalyThreshold = data.anomalyThreshold || 0.1;
  anomalyHistory = data.anomalyHistory || [];
  if (data.anomalyNet) {
    initAnomalyNet();
    anomalyNet.load(data.anomalyNet);
  }
  if (data.faultNet) {
    initFaultNet();
    faultNet.load(data.faultNet);
  }
  return true;
}

function reset() {
  anomalyNet = null;
  faultNet = null;
  anomalyThreshold = 0.1;
  anomalyHistory = [];
}

function getStats() {
  return {
    anomalyNetEpochs: anomalyNet ? anomalyNet.epoch : 0,
    faultNetEpochs: faultNet ? faultNet.epoch : 0,
    anomalyThreshold: anomalyThreshold,
    anomalyHistorySize: anomalyHistory.length,
    inputDim: INPUT_DIM,
    faultClasses: FAULT_CLASSES.length
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Feature extraction
  estraiFeaturesRaw: estraiFeaturesRaw,
  estraiFeaturesSafe: estraiFeaturesSafe,
  FEATURE_NAMES: FEATURE_NAMES,
  INPUT_DIM: INPUT_DIM,
  // Anomaly
  detectAnomaly: detectAnomaly,
  aggiornaBaseline: aggiornaBaseline,
  // Fault classification
  classificaGuasto: classificaGuasto,
  stimaIncertezza: stimaIncertezza,
  FAULT_CLASSES: FAULT_CLASSES,
  // Training
  trainDaCasoChiuso: trainDaCasoChiuso,
  bootstrapSintetico: bootstrapSintetico,
  // Persistence
  salva: salva,
  carica: carica,
  reset: reset,
  getStats: getStats
};
