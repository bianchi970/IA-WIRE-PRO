"use strict";

/**
 * ROCCO Diagnostic Engine v1
 *
 * Metodo Logico di Inferenza — 7 step canonici:
 *   1. OSSERVA    → normalizzazione input + facts
 *   2. INQUADRA   → problem type / anomaly class / target context
 *   3. IPOTIZZA   → generate hypotheses
 *   4. CONFRONTA  → supporti / missing / contradictions / safety
 *   5. VERIFICA   → select diagnostic checks
 *   6. AGGIORNA   → certainty/confidence after evidence filtering
 *   7. DECIDI o SOSPENDI → final output + next step + archive eligibility
 *
 * Modulo puro, nessun side-effect, nessun DB, nessun LLM.
 * Riusa pattern matching e dati da diagnosticEngine.js e knowledge/.
 */

var diagnosticEngine = require("./diagnosticEngine");

// ============================================================
// METODO LOGICO DI INFERENZA — definizione canonica
// ============================================================

var INFERENCE_METHOD = Object.freeze({
  id: "logical_inference_v1",
  steps: Object.freeze([
    Object.freeze({ order: 1, id: "osserva",   label: "OSSERVA",          fn: "normalizeObservations",  description: "Normalizza input e osservazioni in fatti strutturati" }),
    Object.freeze({ order: 2, id: "inquadra",  label: "INQUADRA",         fn: "runSafetyGate+detectContradictions", description: "Classifica anomalia, rileva contraddizioni, valuta sicurezza" }),
    Object.freeze({ order: 3, id: "ipotizza",  label: "IPOTIZZA",         fn: "buildHypotheses",        description: "Genera ipotesi candidate da pattern e ragionamento autonomo" }),
    Object.freeze({ order: 4, id: "confronta", label: "CONFRONTA",        fn: "evaluateCertainty",      description: "Confronta supporti, missing, contraddizioni — assegna certezza" }),
    Object.freeze({ order: 5, id: "verifica",  label: "VERIFICA",         fn: "selectChecks",           description: "Seleziona verifiche ad alto valore diagnostico" }),
    Object.freeze({ order: 6, id: "aggiorna",  label: "AGGIORNA",         fn: "formatOutput",           description: "Consolida output strutturato con fatti aggiornati" }),
    Object.freeze({ order: 7, id: "decidi",    label: "DECIDI o SOSPENDI", fn: "mapArchiveCase",         description: "Emetti decisione finale o sospendi — archivia solo se validato" })
  ])
});

// ============================================================
// COSTANTI DI DOMINIO
// ============================================================

var CERTAINTY = Object.freeze({
  CONFIRMED: "confirmed",
  PROBABLE: "probable",
  NON_VERIFIABLE: "non_verifiable"
});

var SAFETY_LEVEL = Object.freeze({
  SAFE: "safe",
  ATTENTION: "attention",
  DANGER: "danger",
  STOP: "stop"
});

// Keyword che alzano il safety level
var STOP_TRIGGERS = [
  /bypass\s*(protezioni|differenziale|rcd|magnetoterm)/i,
  /ponticell/i,
  /cortocircuit\w*\s*(protezione|rcd|salvavita)/i,
  /sotto\s*tensione\s*(senza|no)\s*(guanti|dpi|isolamento)/i,
  /gas\s*(perdita|fuga|odore)/i,
  /pressione\s*(eccessiva|pericolosa|alta)/i,
  /esplosion/i,
  /incendio/i,
  /fiamm[ae]/i
];

var DANGER_TRIGGERS = [
  /bruciat[oaie]/i,
  /fum[oa]/i,
  /scintill[ae]/i,
  /odore\s*bruciat/i,
  /cavo\s*annerit/i,
  /scosse/i,
  /folgorazione/i,
  /surriscaldat/i,
  /fonde|fuso|sciolto/i
];

var ATTENTION_TRIGGERS = [
  /differenziale\s*scatta/i,
  /rcd\s*scatta/i,
  /magnetoterm\w*\s*scatta/i,
  /blackout/i,
  /sfarfall/i,
  /formicolio/i,
  /tensione\s*(anomal|fuori|bassa|alta)/i
];

// Soglie per valutazione certezza
var CERTAINTY_THRESHOLDS = {
  CONFIRMED_MIN_SCORE: 7,
  CONFIRMED_MIN_FACTS: 3,
  CONFIRMED_MAX_CONTRADICTIONS: 0,
  PROBABLE_MIN_SCORE: 3,
  PROBABLE_MIN_FACTS: 1
};

// ============================================================
// ANOMALY CLASS — famiglie di anomalia
// ============================================================

var ANOMALY_CLASS = Object.freeze({
  DISPERSIONE: "dispersione",
  SURRISCALDAMENTO: "surriscaldamento",
  ANOMALIA_RETE: "anomalia_rete",
  SOVRACCARICO: "sovraccarico",
  CORTOCIRCUITO: "cortocircuito",
  GUASTO_COMPONENTE: "guasto_componente",
  INSTALLAZIONE_ERRATA: "installazione_errata"
});

// Pattern di classificazione: regex + peso per ogni famiglia
var ANOMALY_PATTERNS = {};
ANOMALY_PATTERNS[ANOMALY_CLASS.DISPERSIONE] = [
  { re: /dispers\w*/i, w: 3 },
  { re: /differenziale\s*scatta/i, w: 3 },
  { re: /rcd\s*scatta/i, w: 3 },
  { re: /salvavita\s*scatta/i, w: 3 },
  { re: /isolamento\s*(basso|degradat|scarso|0[,.])/i, w: 3 },
  { re: /corrente\s*(di\s*)?dispersione/i, w: 3 },
  { re: /corrente\s*di\s*guasto/i, w: 2 },
  { re: /terra\s*(guasto|dispersione|perdita)/i, w: 2 },
  { re: /megohm|MΩ|mohm/i, w: 2 },
  { re: /perdita\s*(corrente|isolamento)/i, w: 2 },
  { re: /umid\w*/i, w: 1 },
  { re: /bagnato|acqua|infiltrazion/i, w: 1 }
];
ANOMALY_PATTERNS[ANOMALY_CLASS.SURRISCALDAMENTO] = [
  { re: /surriscald\w*/i, w: 3 },
  { re: /odore\s*bruciat/i, w: 3 },
  { re: /bruciat[oaie]/i, w: 3 },
  { re: /fum[oa]\s*(dal|nel|quadro|presa)/i, w: 3 },
  { re: /annerit[oaie]/i, w: 3 },
  { re: /caldo|calda|calore/i, w: 2 },
  { re: /fonde|fuso|sciolto|deformat/i, w: 3 },
  { re: /temperatura\s*(alta|elevat|eccessiv)/i, w: 2 },
  { re: /scottatur/i, w: 2 },
  { re: /presa\s*(calda|surriscaldat|brucia)/i, w: 3 }
];
ANOMALY_PATTERNS[ANOMALY_CLASS.ANOMALIA_RETE] = [
  { re: /tensione\s*(anomal|fuori|alta|bassa|instabil|fluttu)/i, w: 3 },
  { re: /sfarfall\w*/i, w: 3 },
  { re: /blackout/i, w: 2 },
  { re: /sottotension/i, w: 3 },
  { re: /sovratension/i, w: 3 },
  { re: /neutro\s*(interrott|assente|staccat|spezzat)/i, w: 3 },
  { re: /fase\s*(mancante|assente|interrott)/i, w: 3 },
  { re: /squilibri\w*\s*(fase|tensione|corrente)/i, w: 2 },
  { re: /sbalzi\s*(tensione|corrente)/i, w: 2 },
  { re: /luce\s*(tremola|sfarfalla|bassa|fioca)/i, w: 2 },
  { re: /285\s*V|250\s*V|180\s*V|160\s*V/i, w: 2 }
];
ANOMALY_PATTERNS[ANOMALY_CLASS.SOVRACCARICO] = [
  { re: /sovraccaric\w*/i, w: 3 },
  { re: /magnetoterm\w*\s*scatta/i, w: 3 },
  { re: /troppi\s*carich/i, w: 3 },
  { re: /corrente\s*eccessiv/i, w: 3 },
  { re: /sezione\s*(sottodimensionat|insufficiente|piccol)/i, w: 2 },
  { re: /portata\s*(superata|insufficiente)/i, w: 2 },
  { re: /mcb\s*scatta/i, w: 2 },
  { re: /interrupt\w*\s*(scatta|interviene)/i, w: 1 },
  { re: /carico\s*(eccessiv|troppo)/i, w: 2 }
];
ANOMALY_PATTERNS[ANOMALY_CLASS.CORTOCIRCUITO] = [
  { re: /cortocircuit\w*/i, w: 3 },
  { re: /corto\s*circuito/i, w: 3 },
  { re: /fusibil\w*\s*(bruciat|salt|intervent|fuso)/i, w: 3 },
  { re: /arco\s*(elettric|voltaic)/i, w: 3 },
  { re: /scoppio|esplos/i, w: 2 },
  { re: /scintill[ae]/i, w: 2 },
  { re: /flash\s*(arc|elettric)/i, w: 2 },
  { re: /cavo\s*(in\s*)?corto/i, w: 3 }
];
ANOMALY_PATTERNS[ANOMALY_CLASS.GUASTO_COMPONENTE] = [
  { re: /guast[oaie]/i, w: 2 },
  { re: /rott[oaie]/i, w: 2 },
  { re: /difettos[oaie]/i, w: 2 },
  { re: /non\s*funziona/i, w: 2 },
  { re: /non\s*parte/i, w: 2 },
  { re: /danneggi\w*/i, w: 2 },
  { re: /sostitui\w*/i, w: 1 },
  { re: /componente\s*(guast|rott|difett|dannegg)/i, w: 3 }
];
ANOMALY_PATTERNS[ANOMALY_CLASS.INSTALLAZIONE_ERRATA] = [
  { re: /cablagg\w*\s*(errat|sbagliat|invers)/i, w: 3 },
  { re: /collegament\w*\s*(errat|sbagliat|invers)/i, w: 3 },
  { re: /inversione\s*(fase|fasi|neutro|poli)/i, w: 3 },
  { re: /errore\s*(montaggio|installazion|collegament|cablagg)/i, w: 3 },
  { re: /sezione\s*(errat|sbagliat)/i, w: 2 },
  { re: /terra\s*(mancante|assente|non collegat)/i, w: 2 },
  { re: /PE\s*(mancante|assente|interrott|non collegat)/i, w: 2 },
  { re: /classe\s*(errat|sbagliat)/i, w: 2 }
];

// ============================================================
// VALIDAZIONE INPUT CANONICO
// ============================================================

/**
 * Valida e normalizza l'input canonico.
 * @param {Object} raw
 * @returns {Object} input canonico validato
 */
function validateInput(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      error: "Input mancante o non oggetto",
      input: null
    };
  }

  var input = {
    caseId: raw.caseId || ("CASE-" + Date.now()),
    timestamp: raw.timestamp || new Date().toISOString(),
    context: raw.context || {},
    target: raw.target || null,
    symptoms: Array.isArray(raw.symptoms) ? raw.symptoms : [],
    observations: Array.isArray(raw.observations) ? raw.observations : [],
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    // Campo legacy: testo libero per backward compatibility con diagnosticEngine
    message: raw.message || ""
  };

  // Valida observations
  input.observations = input.observations.map(function (obs, idx) {
    return {
      id: obs.id || ("OBS-" + (idx + 1)),
      kind: obs.kind || "measurement",  // measurement | visual | reported | inferred
      key: obs.key || "unknown",
      value: obs.value !== undefined ? obs.value : null,
      unit: obs.unit || null,
      source: obs.source || "user",     // user | instrument | engine | photo
      reliability: obs.reliability || "declared"  // measured | declared | inferred
    };
  });

  // Se non c'è message ma ci sono symptoms, componi un messaggio per il motore legacy
  if (!input.message && input.symptoms.length > 0) {
    input.message = input.symptoms.join(". ");
    if (input.target) input.message = input.target + ": " + input.message;
  }

  // Aggiungi observations come testo per il motore legacy
  if (!input.message) {
    var obsParts = input.observations
      .filter(function (o) { return o.value !== null; })
      .map(function (o) { return o.key + " " + o.value + (o.unit || ""); });
    if (obsParts.length > 0) {
      input.message = obsParts.join(", ");
    }
  }

  if (!input.message) {
    return { valid: false, error: "Nessun messaggio, sintomo o osservazione fornita", input: null };
  }

  return { valid: true, error: null, input: input };
}

// ============================================================
// STEP 1 — OSSERVA: normalizzazione input → NormalizedFact[]
// Metodo inferenziale: raccoglie tutti i fatti osservabili
// prima di qualsiasi interpretazione.
// ============================================================

/**
 * Converte observations + valori estratti dal motore in NormalizedFact[].
 * @param {Object} canonicalInput
 * @param {Object} engineResult - output di analyzeTechnicalRequest
 * @returns {Array} NormalizedFact[]
 */
function normalizeObservations(canonicalInput, engineResult) {
  var facts = [];
  var seen = {};

  // 1. Fatti da observations strutturate (input)
  canonicalInput.observations.forEach(function (obs) {
    var key = obs.key + ":" + obs.value;
    if (seen[key]) return;
    seen[key] = true;
    facts.push({
      key: obs.key,
      value: obs.value,
      unit: obs.unit,
      reliability: obs.reliability === "measured" ? "measured"
        : obs.reliability === "declared" ? "declared"
        : "inferred",
      sourceRefs: [obs.id]
    });
  });

  // 2. Fatti da estrazione numerica del motore
  if (engineResult.extractedValues) {
    engineResult.extractedValues.forEach(function (v) {
      var key = v.type + ":" + v.value;
      if (seen[key]) return;
      seen[key] = true;
      facts.push({
        key: v.type,
        value: v.value,
        unit: v.unit || null,
        reliability: "measured",  // estratti da valori numerici nel testo
        sourceRefs: ["engine:extractNumericValues"],
        warning: v.warning || null
      });
    });
  }

  // 3. Fatti booleani dal motore
  if (engineResult.isDangerous) {
    facts.push({
      key: "condizione_pericolosa",
      value: true,
      unit: null,
      reliability: "inferred",
      sourceRefs: ["engine:DANGER_KEYWORDS"]
    });
  }

  if (engineResult.matchedKeywords && engineResult.matchedKeywords.length > 0) {
    facts.push({
      key: "dominio_tecnico",
      value: engineResult.matchedKeywords.slice(0, 6).join(", "),
      unit: null,
      reliability: "inferred",
      sourceRefs: ["engine:TECH_KEYWORDS"]
    });
  }

  return facts;
}

// ============================================================
// STEP 2a — INQUADRA (parte 1): rilevazione contraddizioni
// Metodo inferenziale: prima di ipotizzare, verifica se i fatti
// si contraddicono — la coerenza dei dati guida tutto il resto.
// ============================================================

/**
 * Rileva contraddizioni tra fatti normalizzati.
 * @param {Array} facts - NormalizedFact[]
 * @returns {Array} contraddizioni trovate
 */
function detectContradictions(facts) {
  var contradictions = [];

  // Raggruppa fatti per key
  var byKey = {};
  facts.forEach(function (f) {
    if (!byKey[f.key]) byKey[f.key] = [];
    byKey[f.key].push(f);
  });

  // Contraddizioni per valori numerici: stessa key, valori molto diversi
  Object.keys(byKey).forEach(function (key) {
    var group = byKey[key];
    if (group.length < 2) return;

    var numerics = group.filter(function (f) { return typeof f.value === "number"; });
    if (numerics.length < 2) return;

    for (var i = 0; i < numerics.length; i++) {
      for (var j = i + 1; j < numerics.length; j++) {
        var a = numerics[i], b = numerics[j];
        var avg = (Math.abs(a.value) + Math.abs(b.value)) / 2;
        if (avg === 0) continue;
        var diff = Math.abs(a.value - b.value) / avg;
        // >30% di differenza relativa → contraddizione
        if (diff > 0.30) {
          contradictions.push({
            key: key,
            factA: { value: a.value, unit: a.unit, source: a.sourceRefs },
            factB: { value: b.value, unit: b.unit, source: b.sourceRefs },
            severity: diff > 0.50 ? "forte" : "moderata",
            note: key + ": " + a.value + (a.unit || "") + " vs " + b.value + (b.unit || "")
          });
        }
      }
    }
  });

  // Contraddizioni logiche esplicite
  var hasDanger = facts.some(function (f) { return f.key === "condizione_pericolosa" && f.value === true; });
  var hasStable = facts.some(function (f) { return f.key === "tensione" && !f.warning; });
  var hasAnomaly = facts.some(function (f) { return f.key === "tensione" && f.warning; });

  if (hasStable && hasAnomaly) {
    contradictions.push({
      key: "tensione",
      factA: { value: "stabile", source: ["engine"] },
      factB: { value: "anomala", source: ["engine"] },
      severity: "moderata",
      note: "Tensione stabile e anomala contemporaneamente — verificare punti di misura"
    });
  }

  return contradictions;
}

// ============================================================
// STEP 2b — INQUADRA (parte 2): safety gate
// Metodo inferenziale: la sicurezza viene prima di qualsiasi
// diagnosi. Se il contesto è pericoloso, il motore blocca o
// limita le azioni PRIMA di generare ipotesi.
// ============================================================

/**
 * Valuta il livello di sicurezza.
 * @param {Object} canonicalInput
 * @param {Array} facts - NormalizedFact[]
 * @param {Array} contradictions
 * @param {Object} engineResult
 * @returns {Object} SafetyDecision
 */
function runSafetyGate(canonicalInput, facts, contradictions, engineResult) {
  var level = SAFETY_LEVEL.SAFE;
  var reasons = [];
  var blockedActions = [];
  var allowedChecks = [];
  var text = (canonicalInput.message || "").toLowerCase();

  // STOP: rischio diretto
  for (var i = 0; i < STOP_TRIGGERS.length; i++) {
    if (STOP_TRIGGERS[i].test(text)) {
      level = SAFETY_LEVEL.STOP;
      reasons.push("Rilevato: " + STOP_TRIGGERS[i].source);
    }
  }

  // STOP: bypass protezioni esplicito
  if (/bypass|ponticell|scavalca\w*\s*(protezione|rcd|differenziale|magnetoterm)/i.test(text)) {
    level = SAFETY_LEVEL.STOP;
    reasons.push("Richiesta di bypass protezioni — VIETATO");
    blockedActions.push("Qualsiasi bypass di protezioni elettriche");
  }

  // DANGER: segnali di pericolo concreto
  if (level !== SAFETY_LEVEL.STOP) {
    for (var d = 0; d < DANGER_TRIGGERS.length; d++) {
      if (DANGER_TRIGGERS[d].test(text)) {
        if (level !== SAFETY_LEVEL.STOP) level = SAFETY_LEVEL.DANGER;
        reasons.push("Segnale pericoloso: " + DANGER_TRIGGERS[d].source);
      }
    }
  }

  // DANGER: temperatura molto alta (>120°C)
  facts.forEach(function (f) {
    if (f.key === "temperatura" && typeof f.value === "number" && f.value > 120) {
      if (level !== SAFETY_LEVEL.STOP) level = SAFETY_LEVEL.DANGER;
      reasons.push("Temperatura critica: " + f.value + "°C");
    }
  });

  // ATTENTION: segnali di anomalia
  if (level === SAFETY_LEVEL.SAFE) {
    for (var a = 0; a < ATTENTION_TRIGGERS.length; a++) {
      if (ATTENTION_TRIGGERS[a].test(text)) {
        level = SAFETY_LEVEL.ATTENTION;
        reasons.push("Anomalia rilevata: " + ATTENTION_TRIGGERS[a].source);
      }
    }
  }

  // ATTENTION: contraddizioni forti degradano safety
  var strongContradictions = contradictions.filter(function (c) { return c.severity === "forte"; });
  if (strongContradictions.length > 0 && level === SAFETY_LEVEL.SAFE) {
    level = SAFETY_LEVEL.ATTENTION;
    reasons.push("Contraddizioni forti nei dati — prudenza necessaria");
  }

  // Checks permessi in base al livello
  if (level === SAFETY_LEVEL.STOP) {
    blockedActions.push("Qualsiasi verifica operativa");
    allowedChecks.push("Solo ispezione visiva a distanza di sicurezza");
    allowedChecks.push("Chiamata tecnico abilitato CEI 11-27");
  } else if (level === SAFETY_LEVEL.DANGER) {
    blockedActions.push("Lavoro sotto tensione");
    blockedActions.push("Apertura quadro senza LOTO");
    allowedChecks.push("Misure con multimetro CAT III/IV dopo sezionamento");
    allowedChecks.push("Ispezione visiva dopo disalimentazione");
  } else if (level === SAFETY_LEVEL.ATTENTION) {
    allowedChecks.push("Misure con DPI adeguati");
    allowedChecks.push("Verifiche strumentali standard");
  } else {
    allowedChecks.push("Verifiche strumentali standard");
    allowedChecks.push("Ispezione visiva");
  }

  // Deduplica reasons
  var uniqueReasons = [];
  reasons.forEach(function (r) {
    if (uniqueReasons.indexOf(r) < 0) uniqueReasons.push(r);
  });

  return {
    level: level,
    reasons: uniqueReasons.slice(0, 5),
    blockedActions: blockedActions,
    allowedChecks: allowedChecks
  };
}

// ============================================================
// STEP 2c — INQUADRA (parte 3): classificazione anomalia
// Metodo inferenziale: identifica la FAMIGLIA del problema
// (dispersione, surriscaldamento, ecc.) prima di ipotizzare.
// Questo guida la generazione delle ipotesi e la priorità
// delle verifiche.
// ============================================================

/**
 * Classifica l'anomalia in una o più famiglie.
 * Analizza testo (message + symptoms) e fatti normalizzati.
 *
 * @param {Object} canonicalInput
 * @param {Array} facts - NormalizedFact[]
 * @param {Object} engineResult
 * @returns {Object} { primary, secondaries, scores, reasoning }
 */
function classifyAnomaly(canonicalInput, facts, engineResult) {
  var scores = {};
  var reasoning = {};

  // Inizializza scores
  Object.keys(ANOMALY_PATTERNS).forEach(function (cls) {
    scores[cls] = 0;
    reasoning[cls] = [];
  });

  // 1. Match su testo (message + symptoms)
  var text = (canonicalInput.message || "").toLowerCase();
  if (canonicalInput.symptoms) {
    text += " " + canonicalInput.symptoms.join(" ").toLowerCase();
  }

  Object.keys(ANOMALY_PATTERNS).forEach(function (cls) {
    ANOMALY_PATTERNS[cls].forEach(function (pat) {
      if (pat.re.test(text)) {
        scores[cls] += pat.w;
        reasoning[cls].push("testo: " + pat.re.source);
      }
    });
  });

  // 2. Match su fatti normalizzati
  facts.forEach(function (f) {
    // Isolamento basso → dispersione
    if (f.key === "isolamento" && typeof f.value === "number" && f.value < 1) {
      scores[ANOMALY_CLASS.DISPERSIONE] += 3;
      reasoning[ANOMALY_CLASS.DISPERSIONE].push("fatto: isolamento " + f.value + " MΩ (basso)");
    }

    // Temperatura alta → surriscaldamento
    if (f.key === "temperatura" && typeof f.value === "number") {
      if (f.value > 80) {
        scores[ANOMALY_CLASS.SURRISCALDAMENTO] += 3;
        reasoning[ANOMALY_CLASS.SURRISCALDAMENTO].push("fatto: temperatura " + f.value + "°C (alta)");
      } else if (f.value > 50) {
        scores[ANOMALY_CLASS.SURRISCALDAMENTO] += 1;
        reasoning[ANOMALY_CLASS.SURRISCALDAMENTO].push("fatto: temperatura " + f.value + "°C (elevata)");
      }
    }

    // Tensione anomala → anomalia_rete
    if (f.key === "tensione" && typeof f.value === "number") {
      if (f.value > 253 || f.value < 207) {
        scores[ANOMALY_CLASS.ANOMALIA_RETE] += 3;
        reasoning[ANOMALY_CLASS.ANOMALIA_RETE].push("fatto: tensione " + f.value + "V (fuori range)");
      } else if (f.warning) {
        scores[ANOMALY_CLASS.ANOMALIA_RETE] += 2;
        reasoning[ANOMALY_CLASS.ANOMALIA_RETE].push("fatto: tensione con warning");
      }
    }

    // Corrente alta → sovraccarico
    if (f.key === "corrente" && typeof f.value === "number" && f.value > 16) {
      scores[ANOMALY_CLASS.SOVRACCARICO] += 2;
      reasoning[ANOMALY_CLASS.SOVRACCARICO].push("fatto: corrente " + f.value + "A (alta)");
    }

    // Condizione pericolosa + bruciato/fumo → surriscaldamento o cortocircuito
    if (f.key === "condizione_pericolosa" && f.value === true) {
      // Boost se ci sono keyword di bruciato/fumo
      if (/bruciat|fum[oa]|annerit|scintill/.test(text)) {
        scores[ANOMALY_CLASS.SURRISCALDAMENTO] += 1;
      }
      if (/cortocircuit|corto\s*circuito|scoppio/.test(text)) {
        scores[ANOMALY_CLASS.CORTOCIRCUITO] += 1;
      }
    }
  });

  // 3. Boost da matchedPatterns del motore legacy (family field)
  if (engineResult.matchedPatterns) {
    engineResult.matchedPatterns.forEach(function (mp) {
      var family = mp.family || null;
      if (family && scores[family] !== undefined) {
        scores[family] += 2;
        reasoning[family].push("pattern: " + (mp.id || mp.name || "match"));
      }
    });
  }

  // 4. Ordina per score e determina primary/secondary
  var ranked = Object.keys(scores)
    .filter(function (cls) { return scores[cls] > 0; })
    .sort(function (a, b) { return scores[b] - scores[a]; });

  var primary = ranked.length > 0 ? ranked[0] : null;
  var secondaries = ranked.slice(1).filter(function (cls) {
    // Solo se score >= 2 e >= 40% del primary
    return scores[cls] >= 2 && (primary ? scores[cls] >= scores[primary] * 0.4 : false);
  });

  // 5. Filtra reasoning solo per classi attive
  var activeReasoning = {};
  if (primary) {
    activeReasoning[primary] = reasoning[primary];
    secondaries.forEach(function (cls) {
      activeReasoning[cls] = reasoning[cls];
    });
  }

  return {
    primary: primary,
    secondaries: secondaries,
    scores: scores,
    reasoning: activeReasoning
  };
}

// ============================================================
// STEP 3 — IPOTIZZA: generazione ipotesi candidate
// Metodo inferenziale: produce tutte le ipotesi plausibili
// dai pattern e dal ragionamento autonomo. Nessuna viene
// scartata qui — il filtro avviene dopo, nel CONFRONTA.
// ============================================================

/**
 * Converte le ipotesi del motore nel formato strutturato Hypothesis.
 * @param {Object} engineResult
 * @param {Array} facts
 * @param {Array} contradictions
 * @param {Object} safety
 * @param {Object} anomalyClass - classificazione anomalia (primary, secondaries, scores)
 * @returns {Array} Hypothesis[]
 */
function buildHypotheses(engineResult, facts, contradictions, safety, anomalyClass) {
  var hypotheses = [];
  var seenCauses = {};

  // Ipotesi dal motore esistente
  var rawIpotesi = engineResult.ipotesi || [];
  rawIpotesi.forEach(function (ip, idx) {
    var causeKey = (ip.causa || ip.symptom || "unknown").toLowerCase().replace(/\s+/g, "_").slice(0, 60);
    if (seenCauses[causeKey]) return;
    seenCauses[causeKey] = true;

    // Raccogli fatti a supporto
    var supporting = [];
    var missing = [];
    var contradicting = [];

    if (ip.supports && ip.supports.length) {
      ip.supports.forEach(function (s) { supporting.push(s); });
    }
    if (ip.contradictions && ip.contradictions.length) {
      ip.contradictions.forEach(function (c) { contradicting.push(c); });
    }
    if (ip.missingEvidence) {
      missing.push(ip.missingEvidence);
    }
    if (ip.contradictingMeasurements) {
      ip.contradictingMeasurements.forEach(function (cm) { contradicting.push(cm); });
    }

    // Aggiungi contraddizioni globali se pertinenti
    contradictions.forEach(function (ct) {
      if (ct.severity === "forte") {
        contradicting.push(ct.note);
      }
    });

    var score = typeof ip.deductionScore === "number" ? ip.deductionScore
      : typeof ip.score === "number" ? ip.score
      : 0;

    // Checks raccomandati
    var checks = [];
    if (ip.bestCheck) checks.push(ip.bestCheck);
    if (ip.verificationNeeded && ip.verificationNeeded !== ip.bestCheck) {
      checks.push(ip.verificationNeeded);
    }

    // Determina anomalyFamily: da ipotesi, o inferita dalla anomalyClass
    var anomalyFamily = ip.family || null;
    if (!anomalyFamily && anomalyClass && anomalyClass.primary) {
      anomalyFamily = anomalyClass.primary;
    }

    // Boost score se l'ipotesi è coerente con la anomaly class primaria
    var anomalyBoost = 0;
    if (anomalyClass && anomalyClass.primary && anomalyFamily === anomalyClass.primary) {
      anomalyBoost = 1;
    }

    hypotheses.push({
      id: ip.id || ip.patternId || ("H-" + (idx + 1)),
      causeKey: causeKey,
      title: ip.causa || ip.symptom || "Ipotesi " + (idx + 1),
      description: ip.causa || "",
      certainty: null,  // valutata nello step successivo
      score: score + anomalyBoost,
      supportingFacts: supporting,
      missingFacts: missing,
      contradictingFacts: contradicting,
      recommendedChecks: checks,
      source: ip.source || "pattern_matching",
      family: anomalyFamily,
      reasoningTrace: ip.reasoningTrace || null
    });
  });

  // Limita a 5 ipotesi
  hypotheses.sort(function (a, b) { return b.score - a.score; });
  return hypotheses.slice(0, 5);
}

// ============================================================
// STEP 4 — CONFRONTA: valuta certezza per ogni ipotesi
// Metodo inferenziale: confronta ogni ipotesi con i fatti
// disponibili. Supporti la rafforzano, contraddizioni la
// degradano, dati mancanti la limitano a non_verifiable.
// ============================================================

/**
 * Valuta il livello di certezza per ogni ipotesi.
 * Regole:
 * - confirmed: solo se evidenze dirette coerenti, no contraddizioni, score alto
 * - probable: pattern coerente, evidenze indirette, manca test finale
 * - non_verifiable: dati insufficienti, contraddizioni forti, contesto non sicuro
 *
 * @param {Array} hypotheses
 * @param {Array} facts
 * @param {Array} contradictions
 * @param {Object} safety
 * @returns {Array} hypotheses con certainty valorizzata
 */
function evaluateCertainty(hypotheses, facts, contradictions, safety) {
  var hasStrongContradictions = contradictions.some(function (c) { return c.severity === "forte"; });
  var measuredFacts = facts.filter(function (f) { return f.reliability === "measured"; });

  hypotheses.forEach(function (h) {
    // Default: non_verifiable
    h.certainty = CERTAINTY.NON_VERIFIABLE;

    // Safety STOP o DANGER → max probable
    if (safety.level === SAFETY_LEVEL.STOP) {
      h.certainty = CERTAINTY.NON_VERIFIABLE;
      return;
    }

    // Contraddizioni forti sull'ipotesi → max probable
    if (h.contradictingFacts.length > 0 && hasStrongContradictions) {
      h.certainty = CERTAINTY.NON_VERIFIABLE;
      return;
    }

    // Dati insufficienti
    if (measuredFacts.length === 0 && h.supportingFacts.length === 0) {
      h.certainty = CERTAINTY.NON_VERIFIABLE;
      return;
    }

    // Confirmed: score alto, fatti sufficienti, no contraddizioni
    if (h.score >= CERTAINTY_THRESHOLDS.CONFIRMED_MIN_SCORE &&
        h.supportingFacts.length >= CERTAINTY_THRESHOLDS.CONFIRMED_MIN_FACTS &&
        h.contradictingFacts.length <= CERTAINTY_THRESHOLDS.CONFIRMED_MAX_CONTRADICTIONS &&
        !hasStrongContradictions &&
        safety.level !== SAFETY_LEVEL.DANGER) {
      h.certainty = CERTAINTY.CONFIRMED;
      return;
    }

    // Probable: score medio, almeno qualche fatto
    if (h.score >= CERTAINTY_THRESHOLDS.PROBABLE_MIN_SCORE &&
        (h.supportingFacts.length >= CERTAINTY_THRESHOLDS.PROBABLE_MIN_FACTS || measuredFacts.length > 0)) {
      h.certainty = CERTAINTY.PROBABLE;
      return;
    }

    // Altrimenti: non_verifiable (default già impostato)
  });

  return hypotheses;
}

// ============================================================
// STEP 5 — VERIFICA: selezione verifiche diagnostiche
// Metodo inferenziale: sceglie le verifiche con il più alto
// valore discriminante — quelle il cui esito separa le ipotesi
// concorrenti. Sicurezza prima, poi strumentali, poi visive.
// ============================================================

/**
 * Seleziona le verifiche più utili, strutturate.
 * @param {Array} hypotheses
 * @param {Object} safety
 * @param {Object} engineResult
 * @returns {Array} DiagnosticCheck[]
 */
function selectChecks(hypotheses, safety, engineResult) {
  var checks = [];
  var seenTitles = {};
  var priority = 1;

  // Se safety è STOP: solo chiamata tecnico
  if (safety.level === SAFETY_LEVEL.STOP) {
    return [{
      id: "CHK-STOP",
      type: "safety",
      title: "Fermare ogni attività",
      instruction: "Non procedere con verifiche operative. Chiamare tecnico abilitato CEI 11-27.",
      expectedOutcome: "Messa in sicurezza dell'area",
      riskNote: "Rischio diretto rilevato — non operare",
      requiresIsolation: true,
      priority: 1
    }];
  }

  // Checks dalle ipotesi (max 2 per ipotesi, max top 3 ipotesi)
  hypotheses.slice(0, 3).forEach(function (h) {
    h.recommendedChecks.forEach(function (checkText) {
      if (seenTitles[checkText]) return;
      seenTitles[checkText] = true;

      var requiresIsolation = /disaliment|seziona|lockout|loto|assenza tensione/i.test(checkText);
      var isDangerCheck = /megohm|isolamento|tensione|sotto carico/i.test(checkText);

      checks.push({
        id: "CHK-" + priority,
        type: requiresIsolation ? "isolation_required" : isDangerCheck ? "instrumental" : "visual",
        title: checkText.slice(0, 80),
        instruction: checkText,
        expectedOutcome: null,
        riskNote: requiresIsolation ? "Richiede sezionamento preventivo" : null,
        requiresIsolation: requiresIsolation,
        priority: priority
      });
      priority++;
    });
  });

  // Checks dal motore legacy (verifiche)
  var engineVerifiche = engineResult.verifiche || [];
  engineVerifiche.slice(0, 4).forEach(function (v) {
    if (seenTitles[v]) return;
    seenTitles[v] = true;

    checks.push({
      id: "CHK-" + priority,
      type: "instrumental",
      title: v.slice(0, 80),
      instruction: v,
      expectedOutcome: null,
      riskNote: null,
      requiresIsolation: /disaliment|seziona/i.test(v),
      priority: priority
    });
    priority++;
  });

  // Safety DANGER: anteponi sezionamento obbligatorio
  if (safety.level === SAFETY_LEVEL.DANGER) {
    checks.unshift({
      id: "CHK-SAFETY",
      type: "safety",
      title: "Sezionamento e LOTO obbligatorio",
      instruction: "Disalimentare, applicare LOTO, verificare assenza tensione con multimetro CAT III su tutti i conduttori prima di procedere.",
      expectedOutcome: "Assenza tensione confermata su L-N, L-PE, L-L (0V)",
      riskNote: "Rischio elettrico diretto",
      requiresIsolation: true,
      priority: 0
    });
  }

  // Max 6 checks
  return checks.slice(0, 6);
}

// ============================================================
// STEP 6 — AGGIORNA: formattazione output strutturato
// Metodo inferenziale: consolida tutti i risultati in un
// output a schema fisso. Qui i fatti aggiornati, le ipotesi
// con certezza, le verifiche ordinate e i rischi convergono.
// ============================================================

/**
 * Formatta l'output strutturato del motore diagnostico.
 * @param {Object} params
 * @returns {Object} DiagnosticOutput
 */
function formatOutput(params) {
  var input = params.input;
  var facts = params.facts;
  var contradictions = params.contradictions;
  var safety = params.safety;
  var hypotheses = params.hypotheses;
  var checks = params.checks;
  var engineResult = params.engineResult;
  var anomalyClass = params.anomalyClass || null;

  // Osservazioni: fatti + contraddizioni + osservazioni engine
  var osservazioni = [];
  facts.forEach(function (f) {
    if (typeof f.value === "number") {
      osservazioni.push(f.key + ": " + f.value + (f.unit || "") +
        " [" + f.reliability + "]" +
        (f.warning ? " — " + f.warning : ""));
    } else if (typeof f.value === "string" && f.key === "dominio_tecnico") {
      osservazioni.push("Dominio tecnico: " + f.value);
    } else if (f.key === "condizione_pericolosa") {
      osservazioni.push("CONDIZIONE PERICOLOSA RILEVATA");
    }
  });
  contradictions.forEach(function (c) {
    osservazioni.push("CONTRADDIZIONE (" + c.severity + "): " + c.note);
  });

  // Ipotesi formattate
  var ipotesiOutput = hypotheses.map(function (h) {
    return {
      id: h.id,
      title: h.title,
      certainty: h.certainty,
      score: h.score,
      supportingFacts: h.supportingFacts,
      missingFacts: h.missingFacts,
      contradictingFacts: h.contradictingFacts,
      family: h.family
    };
  });

  // Verifiche consigliate
  var verificheConsigliate = checks.map(function (c) {
    return {
      id: c.id,
      type: c.type,
      title: c.title,
      instruction: c.instruction,
      expectedOutcome: c.expectedOutcome,
      riskNote: c.riskNote,
      requiresIsolation: c.requiresIsolation,
      priority: c.priority
    };
  });

  // Rischi sicurezza
  var rischiSicurezza = {
    level: safety.level,
    reasons: safety.reasons,
    blockedActions: safety.blockedActions
  };

  // Prossimo passo: la verifica a priorità più alta, o richiesta dati
  var prossimoPasso = null;
  if (checks.length > 0) {
    prossimoPasso = {
      action: checks[0].type === "safety" ? "safety_first" : "verify",
      description: checks[0].instruction,
      checkId: checks[0].id
    };
  } else if (hypotheses.length === 0) {
    prossimoPasso = {
      action: "request_data",
      description: "Dati insufficienti. Fornire: sintomi specifici, misure effettuate, foto del componente.",
      checkId: null
    };
  } else {
    var topMissing = hypotheses[0].missingFacts;
    prossimoPasso = {
      action: "request_data",
      description: topMissing.length > 0
        ? "Servono: " + topMissing.join(", ")
        : "Completare le verifiche raccomandate",
      checkId: null
    };
  }

  // Meta
  var meta = {
    caseId: input.caseId,
    timestamp: input.timestamp,
    engineVersion: "rocco_diagnostic_v1",
    factCount: facts.length,
    contradictionCount: contradictions.length,
    hypothesisCount: hypotheses.length,
    safetyLevel: safety.level,
    topCertainty: hypotheses.length > 0 ? hypotheses[0].certainty : null,
    anomalyClass: anomalyClass ? anomalyClass.primary : null,
    anomalySecondaries: anomalyClass ? anomalyClass.secondaries : []
  };

  return {
    osservazioni: osservazioni,
    ipotesi: ipotesiOutput,
    verificheConsigliate: verificheConsigliate,
    rischiSicurezza: rischiSicurezza,
    prossimoPasso: prossimoPasso,
    meta: meta
  };
}

// ============================================================
// STEP 7 — DECIDI o SOSPENDI: mapping archivio caso
// Metodo inferenziale: se le evidenze sono sufficienti e il
// caso è chiuso (closureData), archivia. Altrimenti sospende
// e indica cosa manca per decidere. MAI archiviare incompleti.
// ============================================================

/**
 * Genera un caso archiviabile SOLO se il caso è validato.
 * Condizioni per archiviazione:
 * - almeno 1 ipotesi confirmed
 * - safety non è stop
 * - il caso ha un fix applicato (opzionale se passato in input)
 * - outcome verificato (opzionale se passato in input)
 *
 * @param {Object} diagnosticOutput
 * @param {Object} canonicalInput
 * @param {Object} closureData - opzionale: { causaFinale, fixApplicato, outcomeVerificato, noteAggiuntive }
 * @returns {Object|null} ArchiveCase o null se non validato
 */
function mapArchiveCase(diagnosticOutput, canonicalInput, closureData) {
  if (!closureData) return null;

  // Condizione: deve esserci almeno un'ipotesi confirmed o il closureData deve avere causa finale esplicita
  var hasConfirmed = diagnosticOutput.ipotesi.some(function (h) {
    return h.certainty === CERTAINTY.CONFIRMED;
  });
  var hasCausaFinale = closureData.causaFinale && closureData.causaFinale.length > 0;

  if (!hasConfirmed && !hasCausaFinale) return null;

  // Safety stop → non archiviabile
  if (diagnosticOutput.rischiSicurezza.level === SAFETY_LEVEL.STOP) return null;

  // Fix e outcome devono essere presenti per archiviazione completa
  if (!closureData.fixApplicato || !closureData.outcomeVerificato) return null;

  // Firma input: sintomi chiave
  var sintomiChiave = canonicalInput.symptoms.slice(0, 5);
  if (sintomiChiave.length === 0 && canonicalInput.message) {
    sintomiChiave = [canonicalInput.message.slice(0, 120)];
  }

  // Pattern riusabili: ipotesi confermate con i loro fatti
  var patternRiusabili = diagnosticOutput.ipotesi
    .filter(function (h) { return h.certainty === CERTAINTY.CONFIRMED || h.certainty === CERTAINTY.PROBABLE; })
    .map(function (h) {
      return {
        causeKey: h.id,
        title: h.title,
        certainty: h.certainty,
        supportingFacts: h.supportingFacts
      };
    });

  // Percorso diagnostico
  var percorsoDiagnostico = diagnosticOutput.verificheConsigliate.map(function (v) {
    return v.instruction;
  });

  return {
    caseId: diagnosticOutput.meta.caseId,
    timestamp: diagnosticOutput.meta.timestamp,
    classificazione: canonicalInput.context.domain || "elettrico",
    firmaInput: sintomiChiave,
    percorsoDiagnostico: percorsoDiagnostico,
    causaFinale: closureData.causaFinale || diagnosticOutput.ipotesi[0].title,
    fixApplicato: closureData.fixApplicato,
    outcomeVerificato: closureData.outcomeVerificato,
    patternRiusabili: patternRiusabili,
    noteSicurezza: diagnosticOutput.rischiSicurezza.reasons,
    validazione: {
      validato: true,
      dataValidazione: new Date().toISOString(),
      metodo: hasCausaFinale ? "closure_esplicita" : "confirmed_hypothesis",
      certezzaFinale: hasConfirmed ? CERTAINTY.CONFIRMED : CERTAINTY.PROBABLE
    }
  };
}

// ============================================================
// INFERENCE TRACE — traccia dell'esecuzione del metodo
// ============================================================

/**
 * Costruisce la traccia di esecuzione del metodo inferenziale.
 * Registra quali step sono stati eseguiti, con quali risultati
 * quantitativi, e se il motore ha deciso o sospeso.
 *
 * @param {Object} params - risultati intermedi della pipeline
 * @returns {Object} inference trace
 */
function buildInferenceTrace(params) {
  var facts = params.facts;
  var contradictions = params.contradictions;
  var safety = params.safety;
  var hypotheses = params.hypotheses;
  var checks = params.checks;
  var archiveCase = params.archiveCase;
  var anomalyClass = params.anomalyClass || null;

  var hasConfirmed = hypotheses.some(function (h) { return h.certainty === CERTAINTY.CONFIRMED; });
  var hasProbable = hypotheses.some(function (h) { return h.certainty === CERTAINTY.PROBABLE; });
  var isSuspended = !hasConfirmed && (hypotheses.length === 0 || safety.level === SAFETY_LEVEL.STOP);
  var isDecided = hasConfirmed || archiveCase !== null;

  var stepsApplied = [];

  // Step 1: OSSERVA — sempre eseguito
  stepsApplied.push({
    id: "osserva",
    applied: true,
    result: { factCount: facts.length, measuredCount: facts.filter(function (f) { return f.reliability === "measured"; }).length }
  });

  // Step 2: INQUADRA — sempre eseguito
  stepsApplied.push({
    id: "inquadra",
    applied: true,
    result: {
      safetyLevel: safety.level,
      contradictionCount: contradictions.length,
      anomalyClass: anomalyClass ? anomalyClass.primary : null,
      anomalySecondaries: anomalyClass ? anomalyClass.secondaries : []
    }
  });

  // Step 3: IPOTIZZA — eseguito se safety non è STOP
  var ipotizzaBlocked = safety.level === SAFETY_LEVEL.STOP;
  stepsApplied.push({
    id: "ipotizza",
    applied: !ipotizzaBlocked,
    result: ipotizzaBlocked
      ? { blocked: true, reason: "safety_stop" }
      : { hypothesisCount: hypotheses.length }
  });

  // Step 4: CONFRONTA — eseguito se ci sono ipotesi
  stepsApplied.push({
    id: "confronta",
    applied: hypotheses.length > 0,
    result: {
      confirmedCount: hypotheses.filter(function (h) { return h.certainty === CERTAINTY.CONFIRMED; }).length,
      probableCount: hypotheses.filter(function (h) { return h.certainty === CERTAINTY.PROBABLE; }).length,
      nonVerifiableCount: hypotheses.filter(function (h) { return h.certainty === CERTAINTY.NON_VERIFIABLE; }).length
    }
  });

  // Step 5: VERIFICA — eseguito se ci sono checks
  stepsApplied.push({
    id: "verifica",
    applied: checks.length > 0,
    result: { checkCount: checks.length, firstCheckType: checks.length > 0 ? checks[0].type : null }
  });

  // Step 6: AGGIORNA — sempre eseguito (formatOutput)
  stepsApplied.push({
    id: "aggiorna",
    applied: true,
    result: { outputGenerated: true }
  });

  // Step 7: DECIDI o SOSPENDI
  stepsApplied.push({
    id: "decidi",
    applied: true,
    result: {
      outcome: isDecided ? "decided" : isSuspended ? "suspended" : "pending",
      archived: archiveCase !== null,
      reason: isDecided
        ? (archiveCase ? "caso chiuso e archiviato" : "ipotesi confermata")
        : isSuspended
          ? (safety.level === SAFETY_LEVEL.STOP ? "bloccato per sicurezza" : "dati insufficienti")
          : "ipotesi aperte — servono verifiche"
    }
  });

  return {
    method: INFERENCE_METHOD.id,
    stepsApplied: stepsApplied,
    outcome: isDecided ? "decided" : isSuspended ? "suspended" : "pending"
  };
}

// ============================================================
// PIPELINE PRINCIPALE
// ============================================================

/**
 * Esegue la pipeline diagnostica completa.
 * @param {Object} rawInput - input canonico (o legacy {message, hasImage})
 * @param {Object} knowledge - dati knowledge base (failurePatterns, etc.)
 * @returns {Object} { ok, output, archiveCase, error }
 */
function runDiagnosticV1(rawInput, knowledge) {
  // 0. Validazione input
  var validated = validateInput(rawInput);
  if (!validated.valid) {
    return {
      ok: false,
      output: null,
      archiveCase: null,
      error: validated.error
    };
  }
  var input = validated.input;

  // 1. Chiama il motore legacy per il lavoro pesante (pattern matching, extraction, etc.)
  var engineResult;
  try {
    engineResult = diagnosticEngine.analyzeTechnicalRequest(
      { message: input.message, hasImage: input.attachments.length > 0 },
      knowledge || {}
    );
  } catch (e) {
    return {
      ok: false,
      output: null,
      archiveCase: null,
      error: "Errore motore diagnostico: " + (e.message || e)
    };
  }

  // 2. Normalizza osservazioni
  var facts = normalizeObservations(input, engineResult);

  // 3. Rileva contraddizioni
  var contradictions = detectContradictions(facts);

  // 4. Safety gate (PRIMA delle ipotesi)
  var safety = runSafetyGate(input, facts, contradictions, engineResult);

  // 4b. Classifica anomalia (INQUADRA parte 3)
  var anomalyClass = classifyAnomaly(input, facts, engineResult);

  // 5. Build hypotheses
  var hypotheses = buildHypotheses(engineResult, facts, contradictions, safety, anomalyClass);

  // 6. Evaluate certainty
  hypotheses = evaluateCertainty(hypotheses, facts, contradictions, safety);

  // 7. Select checks
  var checks = selectChecks(hypotheses, safety, engineResult);

  // 8. Format output
  var output = formatOutput({
    input: input,
    facts: facts,
    contradictions: contradictions,
    safety: safety,
    hypotheses: hypotheses,
    checks: checks,
    engineResult: engineResult,
    anomalyClass: anomalyClass
  });

  // 9. Archive case mapping — DECIDI o SOSPENDI (solo se closureData presente)
  var archiveCase = null;
  if (rawInput.closureData) {
    archiveCase = mapArchiveCase(output, input, rawInput.closureData);
  }

  // 10. Inference trace — traccia del metodo logico applicato
  var inferenceTrace = buildInferenceTrace({
    facts: facts,
    contradictions: contradictions,
    safety: safety,
    hypotheses: hypotheses,
    checks: checks,
    archiveCase: archiveCase,
    anomalyClass: anomalyClass
  });

  // Arricchisci meta con riferimento al metodo inferenziale
  output.meta.inferenceMethod = inferenceTrace.method;
  output.meta.inferenceOutcome = inferenceTrace.outcome;
  output.meta.inferenceStepsApplied = inferenceTrace.stepsApplied.map(function (s) { return s.id; });

  return {
    ok: true,
    output: output,
    archiveCase: archiveCase,
    error: null,
    // Traccia inferenziale completa (per debug e audit)
    _inferenceTrace: inferenceTrace,
    // Dati interni per debug (non esposti all'utente)
    _debug: {
      factCount: facts.length,
      contradictionCount: contradictions.length,
      safetyLevel: safety.level,
      hypothesisScores: hypotheses.map(function (h) { return { id: h.id, score: h.score, certainty: h.certainty }; })
    }
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  runDiagnosticV1: runDiagnosticV1,
  // Esposti per test unitari
  validateInput: validateInput,
  normalizeObservations: normalizeObservations,
  detectContradictions: detectContradictions,
  runSafetyGate: runSafetyGate,
  classifyAnomaly: classifyAnomaly,
  buildHypotheses: buildHypotheses,
  evaluateCertainty: evaluateCertainty,
  selectChecks: selectChecks,
  formatOutput: formatOutput,
  mapArchiveCase: mapArchiveCase,
  buildInferenceTrace: buildInferenceTrace,
  // Costanti
  CERTAINTY: CERTAINTY,
  SAFETY_LEVEL: SAFETY_LEVEL,
  ANOMALY_CLASS: ANOMALY_CLASS,
  INFERENCE_METHOD: INFERENCE_METHOD
};
