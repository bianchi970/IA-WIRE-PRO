"use strict";

// ============================================================================
// NEURAL LANGUAGE — Assimilazione linguistica per ROCCO
// Embeddings, intent classification, entity extraction, contesto
// ============================================================================

var nc = require("./neural_core");

var DIM_EMBEDDING = 32;

// --- Stopwords italiane ---
var STOPWORDS = new Set([
  "il", "lo", "la", "le", "li", "gli", "i", "un", "uno", "una",
  "di", "da", "in", "con", "su", "per", "tra", "fra",
  "che", "chi", "cui", "dove", "come", "quando", "quale", "quali",
  "e", "o", "ma", "se", "non", "ne", "ci", "si", "mi", "ti", "vi",
  "al", "del", "dal", "nel", "sul", "col", "dello", "della", "delle",
  "dei", "degli", "alla", "alle", "ai", "agli", "allo",
  "nella", "nello", "nelle", "negli", "dalla", "dallo", "dalle", "dagli",
  "sulla", "sullo", "sulle", "sugli",
  "sono", "sei", "ha", "ho", "hai", "hanno", "essere", "avere",
  "questo", "questa", "questi", "queste", "quello", "quella",
  "molto", "poco", "tutto", "tutti", "ogni", "altro", "altri",
  "piu", "più", "meno", "anche", "solo", "proprio", "gia", "già",
  "era", "era", "stato", "stata", "stati", "è", "ed"
]);

// --- Vocabolario ---
var vocabolario = {};  // parola → indice
var inverso = [];      // indice → parola
var embeddings = [];   // indice → vettore [DIM_EMBEDDING]
var idf = {};          // parola → inverse document frequency
var docCount = 0;      // numero totale di documenti (interazioni)

// --- Intent classes ---
var INTENTS = [
  "diagnosi_guasto",     // 0 - problema elettrico da diagnosticare
  "domanda_misura",      // 1 - chiede che misura fare
  "richiesta_verifica",  // 2 - chiede conferma di un'ipotesi
  "conferma_fatto",      // 3 - conferma un fatto ("sì, scatta sempre")
  "negazione",           // 4 - nega qualcosa ("no, non è quello")
  "contesto_aggiuntivo", // 5 - aggiunge info ("ho anche notato che...")
  "domanda_norma",       // 6 - chiede riferimento normativo
  "fuori_dominio"        // 7 - non pertinente al dominio elettrico
];

var intentNet = null;

// --- Entity patterns ---
var ENTITY_PATTERNS = {
  componente: [
    { regex: /\b(differenziale|rcd|rcbo)\b/gi, type: "protezione_diff" },
    { regex: /\b(magnetotermico|mcb|interruttore\s+automatico)\b/gi, type: "protezione_mcb" },
    { regex: /\b(salvavita)\b/gi, type: "protezione_diff" },
    { regex: /\b(contattore|teleruttore)\b/gi, type: "contattore" },
    { regex: /\b(motore)\b/gi, type: "motore" },
    { regex: /\b(caldaia|boiler|scaldabagno|scaldacqua)\b/gi, type: "caldaia" },
    { regex: /\b(inverter|fotovoltaico|pannelli?\s+solari?)\b/gi, type: "inverter_pv" },
    { regex: /\b(quadro|quadro\s+elettrico)\b/gi, type: "quadro" },
    { regex: /\b(presa|prese)\b/gi, type: "presa" },
    { regex: /\b(lampada|lampadina|luce|luci|plafoniera|faretto)\b/gi, type: "illuminazione" },
    { regex: /\b(cavo|conduttore|filo)\b/gi, type: "conduttore" },
    { regex: /\b(messa\s+a\s+terra|terra|dispersore)\b/gi, type: "terra" },
    { regex: /\b(trasformatore|trafo)\b/gi, type: "trasformatore" },
    { regex: /\b(ups|gruppo\s+di\s+continuita|gruppo\s+di\s+continuità)\b/gi, type: "ups" },
    { regex: /\b(variatore|dimmer)\b/gi, type: "dimmer" },
    { regex: /\b(sezionatore)\b/gi, type: "sezionatore" },
    { regex: /\b(fusibile|fusibili)\b/gi, type: "fusibile" },
    { regex: /\b(rel[eè]|rele)\b/gi, type: "rele" },
    { regex: /\b(termostato)\b/gi, type: "termostato" },
    { regex: /\b(ventilatore|ventola|fan)\b/gi, type: "ventilatore" },
    { regex: /\b(condizionatore|climatizzatore|split)\b/gi, type: "climatizzatore" }
  ],
  misura: [
    { regex: /(\d+[\.,]?\d*)\s*(v|volt)\b/gi, unit: "V" },
    { regex: /(\d+[\.,]?\d*)\s*(a|ampere|amp)\b/gi, unit: "A" },
    { regex: /(\d+[\.,]?\d*)\s*(ma|milliampere)\b/gi, unit: "mA" },
    { regex: /(\d+[\.,]?\d*)\s*(kv|kilovolt)\b/gi, unit: "kV" },
    { regex: /(\d+[\.,]?\d*)\s*(ohm|Ω)\b/gi, unit: "ohm" },
    { regex: /(\d+[\.,]?\d*)\s*(mohm|megaohm|mΩ)\b/gi, unit: "MOhm" },
    { regex: /(\d+[\.,]?\d*)\s*(w|watt)\b/gi, unit: "W" },
    { regex: /(\d+[\.,]?\d*)\s*(kw|kilowatt)\b/gi, unit: "kW" },
    { regex: /(\d+[\.,]?\d*)\s*(hz|hertz)\b/gi, unit: "Hz" },
    { regex: /(\d+[\.,]?\d*)\s*(°c|gradi|celsius)\b/gi, unit: "°C" },
    { regex: /cos\s*[φfi]\s*[=:]?\s*(\d+[\.,]?\d*)/gi, unit: "cosφ", valueGroup: 1 }
  ],
  sintomo: [
    { regex: /\b(scatta|interviene|sgancia)\b/gi, type: "intervento_protezione" },
    { regex: /\b(non\s+funziona|non\s+parte|non\s+si\s+accende|guast[oa])\b/gi, type: "non_funzionante" },
    { regex: /\b(surriscald|cald[oa]|bollente|brucia|odore|fumo)\b/gi, type: "surriscaldamento" },
    { regex: /\b(intermittente|a\s+volte|ogni\s+tanto|saltuari[oa])\b/gi, type: "intermittente" },
    { regex: /\b(ronzio|ronza|vibra|vibrazione|rumore)\b/gi, type: "rumore_vibrazione" },
    { regex: /\b(scintilla|arco|scarica)\b/gi, type: "arco_elettrico" },
    { regex: /\b(bassa\s+tensione|tensione\s+bassa|calo|abbassamento)\b/gi, type: "sottotensione" },
    { regex: /\b(sovratensione|tensione\s+alta|troppa\s+tensione)\b/gi, type: "sovratensione" },
    { regex: /\b(dispersione|corrente\s+di\s+fuga|perdita)\b/gi, type: "dispersione" },
    { regex: /\b(cortocircuito|corto)\b/gi, type: "cortocircuito" },
    { regex: /\b(sovraccarico)\b/gi, type: "sovraccarico" },
    { regex: /\b(squilibri[oa]|sbilanciamento)\b/gi, type: "squilibrio" }
  ],
  luogo: [
    { regex: /\b(cucina)\b/gi, type: "cucina" },
    { regex: /\b(bagno)\b/gi, type: "bagno" },
    { regex: /\b(camera|stanza)\b/gi, type: "camera" },
    { regex: /\b(soggiorno|salotto|salone)\b/gi, type: "soggiorno" },
    { regex: /\b(cantina|seminterrato)\b/gi, type: "cantina" },
    { regex: /\b(garage|box)\b/gi, type: "garage" },
    { regex: /\b(esterno|giardino|terrazzo|balcone)\b/gi, type: "esterno" },
    { regex: /\b(ufficio)\b/gi, type: "ufficio" },
    { regex: /\b(capannone|officina|laboratorio)\b/gi, type: "industriale" }
  ],
  temporale: [
    { regex: /\b(da\s+ieri|da\s+stamattina|da\s+oggi|da\s+questa\s+mattina)\b/gi, type: "recente" },
    { regex: /\b(da\s+quando|da\s+sempre|sempre\s+stato)\b/gi, type: "cronico" },
    { regex: /\b(a\s+volte|ogni\s+tanto|saltuariamente|a\s+intermittenza)\b/gi, type: "intermittente" },
    { regex: /\b(dopo\s+(aver|che)|quando\s+(accendo|uso|collego))\b/gi, type: "condizionato" },
    { regex: /\b(di\s+notte|la\s+notte|di\s+sera)\b/gi, type: "notturno" },
    { regex: /\b(di\s+giorno|la\s+mattina|di\s+mattina)\b/gi, type: "diurno" },
    { regex: /\b(con\s+(la\s+)?pioggia|quando\s+piove|con\s+umidità)\b/gi, type: "meteo_dipendente" }
  ]
};

// --- Intent keywords per bootstrap ---
var INTENT_SEEDS = {
  diagnosi_guasto: [
    "il differenziale scatta", "non funziona", "si è bruciato",
    "problema elettrico", "guasto", "il magnetotermico interviene",
    "scatta la corrente", "va via la luce", "non parte il motore",
    "surriscaldamento cavo", "odore di bruciato", "scintille",
    "cortocircuito", "dispersione", "sovraccarico",
    "la caldaia non parte", "inverter in errore", "squilibrio fasi"
  ],
  domanda_misura: [
    "che misura devo fare", "come misuro", "con che strumento",
    "che valore dovrei trovare", "come verifico", "quale prova",
    "devo misurare", "cosa uso per misurare", "multimetro",
    "pinza amperometrica", "megger", "misura di isolamento"
  ],
  richiesta_verifica: [
    "potrebbe essere", "penso che sia", "secondo te è",
    "è possibile che", "può dipendere da", "è corretto",
    "ho ragione", "confermi che", "è giusto dire"
  ],
  conferma_fatto: [
    "sì è così", "confermo", "esatto", "proprio quello",
    "hai ragione", "è vero", "sì scatta sempre",
    "effettivamente", "in effetti"
  ],
  negazione: [
    "no non è quello", "non è così", "sbagliato", "no",
    "non credo", "non è corretto", "non è possibile",
    "ti sbagli", "non è vero"
  ],
  contesto_aggiuntivo: [
    "ho anche notato", "aggiungo che", "inoltre",
    "dimenticavo", "un'altra cosa", "c'è anche",
    "devo dire che", "preciso che"
  ],
  domanda_norma: [
    "che norma", "normativa", "CEI", "riferimento",
    "è a norma", "è conforme", "obbligo di legge",
    "regolamento", "prescrizione"
  ],
  fuori_dominio: [
    "che tempo fa", "come stai", "raccontami una barzelletta",
    "chi sei", "parlami di politica", "che ore sono"
  ]
};

// ============================================================================
// Tokenizzazione
// ============================================================================

function normalizeText(testo) {
  if (!testo) return "";
  return testo.toLowerCase()
    .replace(/[àáâ]/g, "a")
    .replace(/[èéê]/g, "e")
    .replace(/[ìíî]/g, "i")
    .replace(/[òóô]/g, "o")
    .replace(/[ùúû]/g, "u")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"');
}

function tokenizza(testo) {
  var norm = normalizeText(testo);
  var tokens = norm.match(/[a-z0-9]+/g) || [];
  return tokens.filter(function(t) {
    return t.length > 1 && !STOPWORDS.has(t);
  });
}

// ============================================================================
// Vocabolario & Embeddings
// ============================================================================

function aggiungiAlVocabolario(parola) {
  parola = normalizeText(parola);
  if (vocabolario[parola] !== undefined) return vocabolario[parola];
  var idx = inverso.length;
  vocabolario[parola] = idx;
  inverso.push(parola);
  embeddings.push(nc.randomVector(DIM_EMBEDDING));
  return idx;
}

function ottieniEmbedding(parola) {
  parola = normalizeText(parola);
  if (vocabolario[parola] === undefined) {
    aggiungiAlVocabolario(parola);
  }
  return embeddings[vocabolario[parola]];
}

function embeddingFrase(testo) {
  var tokens = tokenizza(testo);
  if (tokens.length === 0) return nc.zeroVector(DIM_EMBEDDING);

  var vecs = [];
  var weights = [];
  for (var i = 0; i < tokens.length; i++) {
    vecs.push(ottieniEmbedding(tokens[i]));
    // Peso IDF se disponibile
    var w = idf[tokens[i]] || 1.0;
    weights.push(w);
  }

  // Media pesata
  var result = nc.zeroVector(DIM_EMBEDDING);
  var totalWeight = 0;
  for (var i = 0; i < vecs.length; i++) {
    for (var j = 0; j < DIM_EMBEDDING; j++) {
      result[j] += vecs[i][j] * weights[i];
    }
    totalWeight += weights[i];
  }
  if (totalWeight > 0) {
    for (var j = 0; j < DIM_EMBEDDING; j++) result[j] /= totalWeight;
  }
  return result;
}

function fraseSimile(testo1, testo2) {
  var e1 = embeddingFrase(testo1);
  var e2 = embeddingFrase(testo2);
  return nc.cosineSimilarity(e1, e2);
}

// ============================================================================
// Intent Classification
// ============================================================================

function initIntentNet() {
  if (intentNet) return;
  intentNet = nc.createNetwork([DIM_EMBEDDING, 24, INTENTS.length], "relu", "cross_entropy");
  intentNet.config.learningRate = 0.05;
}

function trainIntentFromSeeds() {
  initIntentNet();

  var inputs = [];
  var targets = [];

  for (var intentIdx = 0; intentIdx < INTENTS.length; intentIdx++) {
    var seeds = INTENT_SEEDS[INTENTS[intentIdx]] || [];
    for (var s = 0; s < seeds.length; s++) {
      inputs.push(embeddingFrase(seeds[s]));
      targets.push(nc.oneHot(intentIdx, INTENTS.length));
    }
  }

  if (inputs.length > 0) {
    intentNet.train(inputs, targets, { epochs: 100, shuffle: true });
  }
}

function classificaIntento(testo) {
  initIntentNet();
  var emb = embeddingFrase(testo);
  var probs = intentNet.predict(emb);
  var best = nc.argmax(probs);
  return {
    intent: INTENTS[best],
    confidence: probs[best],
    all: INTENTS.map(function(name, i) {
      return { intent: name, probability: probs[i] };
    }).sort(function(a, b) { return b.probability - a.probability; })
  };
}

// ============================================================================
// Entity Extraction
// ============================================================================

function estraiEntita(testo) {
  var result = {
    componenti: [],
    misure: [],
    sintomi: [],
    luoghi: [],
    temporali: []
  };

  // Componenti
  for (var i = 0; i < ENTITY_PATTERNS.componente.length; i++) {
    var p = ENTITY_PATTERNS.componente[i];
    p.regex.lastIndex = 0;
    var m = p.regex.exec(testo);
    if (m) {
      result.componenti.push({ match: m[0], type: p.type });
    }
  }

  // Misure
  for (var i = 0; i < ENTITY_PATTERNS.misura.length; i++) {
    var p = ENTITY_PATTERNS.misura[i];
    p.regex.lastIndex = 0;
    var m = p.regex.exec(testo);
    while (m) {
      var valGroup = p.valueGroup || 1;
      var val = parseFloat((m[valGroup] || "0").replace(",", "."));
      result.misure.push({ value: val, unit: p.unit, match: m[0] });
      m = p.regex.exec(testo);
    }
  }

  // Sintomi
  for (var i = 0; i < ENTITY_PATTERNS.sintomo.length; i++) {
    var p = ENTITY_PATTERNS.sintomo[i];
    p.regex.lastIndex = 0;
    var m = p.regex.exec(testo);
    if (m) {
      result.sintomi.push({ match: m[0], type: p.type });
    }
  }

  // Luoghi
  for (var i = 0; i < ENTITY_PATTERNS.luogo.length; i++) {
    var p = ENTITY_PATTERNS.luogo[i];
    p.regex.lastIndex = 0;
    var m = p.regex.exec(testo);
    if (m) {
      result.luoghi.push({ match: m[0], type: p.type });
    }
  }

  // Temporali
  for (var i = 0; i < ENTITY_PATTERNS.temporale.length; i++) {
    var p = ENTITY_PATTERNS.temporale[i];
    p.regex.lastIndex = 0;
    var m = p.regex.exec(testo);
    if (m) {
      result.temporali.push({ match: m[0], type: p.type });
    }
  }

  return result;
}

// ============================================================================
// Context Window
// ============================================================================

function creaContesto(maxTurni) {
  return {
    maxTurni: maxTurni || 10,
    turni: []
  };
}

function aggiornaContesto(contesto, testo, ruolo) {
  var turno = {
    testo: testo,
    ruolo: ruolo || "user",
    embedding: embeddingFrase(testo),
    intento: classificaIntento(testo),
    entita: estraiEntita(testo),
    timestamp: Date.now()
  };

  contesto.turni.push(turno);
  if (contesto.turni.length > contesto.maxTurni) {
    contesto.turni.shift();
  }
  return turno;
}

function focusAttuale(contesto) {
  if (!contesto.turni || contesto.turni.length === 0) {
    return nc.zeroVector(DIM_EMBEDDING);
  }

  // Media pesata: turni recenti pesano di più (decay esponenziale)
  var vecs = [];
  var weights = [];
  var n = contesto.turni.length;
  for (var i = 0; i < n; i++) {
    vecs.push(contesto.turni[i].embedding);
    weights.push(Math.pow(0.7, n - 1 - i)); // più recente = peso maggiore
  }

  var totalWeight = 0;
  var result = nc.zeroVector(DIM_EMBEDDING);
  for (var i = 0; i < vecs.length; i++) {
    for (var j = 0; j < DIM_EMBEDDING; j++) {
      result[j] += vecs[i][j] * weights[i];
    }
    totalWeight += weights[i];
  }
  if (totalWeight > 0) {
    for (var j = 0; j < DIM_EMBEDDING; j++) result[j] /= totalWeight;
  }
  return result;
}

// ============================================================================
// Apprendimento continuo
// ============================================================================

function imparaAssociazione(parola1, parola2, forza) {
  forza = forza || 0.05;
  var e1 = ottieniEmbedding(parola1);
  var e2 = ottieniEmbedding(parola2);
  var idx1 = vocabolario[normalizeText(parola1)];
  var idx2 = vocabolario[normalizeText(parola2)];
  if (idx1 === undefined || idx2 === undefined) return;

  // Avvicina gli embeddings
  for (var j = 0; j < DIM_EMBEDDING; j++) {
    embeddings[idx1][j] += forza * (e2[j] - e1[j]);
    embeddings[idx2][j] += forza * (e1[j] - e2[j]);
  }
}

function imparaDaInterazione(testo, intentLabel, entita) {
  var tokens = tokenizza(testo);
  docCount++;

  // Aggiorna IDF
  var seen = new Set();
  for (var i = 0; i < tokens.length; i++) {
    if (!seen.has(tokens[i])) {
      idf[tokens[i]] = (idf[tokens[i]] || 0) + 1;
      seen.add(tokens[i]);
    }
  }
  // Ricalcola IDF values
  for (var word in idf) {
    idf[word] = Math.log(docCount / idf[word]) + 1;
  }

  // Rinforza associazioni tra parole co-occorrenti
  for (var i = 0; i < tokens.length; i++) {
    for (var j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
      imparaAssociazione(tokens[i], tokens[j], 0.02);
    }
  }

  // Se abbiamo intent, addestra la rete
  if (intentLabel && intentNet) {
    var intentIdx = INTENTS.indexOf(intentLabel);
    if (intentIdx >= 0) {
      var emb = embeddingFrase(testo);
      intentNet.trainStep(emb, nc.oneHot(intentIdx, INTENTS.length));
    }
  }

  // Associa entità co-occorrenti
  if (entita) {
    var allEntities = [];
    if (entita.componenti) entita.componenti.forEach(function(e) { allEntities.push(e.type); });
    if (entita.sintomi) entita.sintomi.forEach(function(e) { allEntities.push(e.type); });
    if (entita.luoghi) entita.luoghi.forEach(function(e) { allEntities.push(e.type); });

    for (var i = 0; i < allEntities.length; i++) {
      for (var j = i + 1; j < allEntities.length; j++) {
        imparaAssociazione(allEntities[i], allEntities[j], 0.03);
      }
    }
  }
}

// ============================================================================
// Bootstrap dal dominio
// ============================================================================

function bootstrap(fenomeni, concetti, componenti) {
  // 1. Aggiungi tutti i termini al vocabolario
  if (fenomeni) {
    for (var i = 0; i < fenomeni.length; i++) {
      var f = fenomeni[i];
      if (f.id) aggiungiAlVocabolario(f.id);
      // Tokenizza descrizione e aggiungi
      var tokens = tokenizza((f.principio || "") + " " + (f.label || ""));
      for (var t = 0; t < tokens.length; t++) aggiungiAlVocabolario(tokens[t]);
    }
  }

  if (concetti) {
    for (var key in concetti) {
      aggiungiAlVocabolario(key);
      var c = concetti[key];
      if (c.descr) {
        var tokens = tokenizza(c.descr);
        for (var t = 0; t < tokens.length; t++) aggiungiAlVocabolario(tokens[t]);
      }
    }
  }

  if (componenti) {
    for (var i = 0; i < componenti.length; i++) {
      var comp = componenti[i];
      if (comp.name) {
        var tokens = tokenizza(comp.name);
        for (var t = 0; t < tokens.length; t++) aggiungiAlVocabolario(tokens[t]);
      }
      if (comp.keywords) {
        for (var k = 0; k < comp.keywords.length; k++) {
          aggiungiAlVocabolario(comp.keywords[k]);
        }
      }
    }
  }

  // 2. Addestra intent net dai seed
  trainIntentFromSeeds();
}

// ============================================================================
// Persistenza
// ============================================================================

function salva() {
  var intentData = intentNet ? intentNet.save() : null;
  return {
    version: 1,
    vocabolario: vocabolario,
    inverso: inverso,
    embeddings: embeddings,
    idf: idf,
    docCount: docCount,
    intentNet: intentData,
    savedAt: new Date().toISOString()
  };
}

function carica(data) {
  if (!data || data.version !== 1) return false;
  vocabolario = data.vocabolario || {};
  inverso = data.inverso || [];
  embeddings = data.embeddings || [];
  idf = data.idf || {};
  docCount = data.docCount || 0;
  if (data.intentNet) {
    initIntentNet();
    intentNet.load(data.intentNet);
  }
  return true;
}

function reset() {
  vocabolario = {};
  inverso = [];
  embeddings = [];
  idf = {};
  docCount = 0;
  intentNet = null;
}

function getStats() {
  return {
    vocabolarioSize: inverso.length,
    docCount: docCount,
    embeddingDim: DIM_EMBEDDING,
    intentsCount: INTENTS.length,
    intentNetTrained: intentNet ? intentNet.epoch > 0 : false
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Core
  tokenizza: tokenizza,
  normalizeText: normalizeText,
  embeddingFrase: embeddingFrase,
  fraseSimile: fraseSimile,
  aggiungiAlVocabolario: aggiungiAlVocabolario,
  ottieniEmbedding: ottieniEmbedding,
  // Intent
  classificaIntento: classificaIntento,
  INTENTS: INTENTS,
  // Entities
  estraiEntita: estraiEntita,
  // Context
  creaContesto: creaContesto,
  aggiornaContesto: aggiornaContesto,
  focusAttuale: focusAttuale,
  // Learning
  imparaAssociazione: imparaAssociazione,
  imparaDaInterazione: imparaDaInterazione,
  // Bootstrap
  bootstrap: bootstrap,
  // Persistence
  salva: salva,
  carica: carica,
  reset: reset,
  getStats: getStats,
  // Constants
  DIM_EMBEDDING: DIM_EMBEDDING
};
