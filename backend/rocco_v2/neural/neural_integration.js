"use strict";

// ============================================================================
// NEURAL INTEGRATION — Collante tra moduli neurali e orchestrator ROCCO
// 6 hook cognitivi + training pipeline + warmup + graceful degradation
// ============================================================================

var path = require("path");
var fs = require("fs");

var nc = require("./neural_core");
var NeuralLanguage = require("./neural_language");
var NeuralPatterns = require("./neural_patterns");
var NeuralKnowledge = require("./neural_knowledge");
var NeuralMemory = require("./neural_memory");
var NeuralEvolution = null;
try { NeuralEvolution = require("./neural_evolution"); } catch(e) { /* opzionale */ }
var WorldModel = null;
try { WorldModel = require("./world_model"); } catch(e) { /* opzionale */ }
var NeuralSimulator = null;
try { NeuralSimulator = require("./neural_simulator"); } catch(e) { /* opzionale */ }
var NeuralVision = null;
try { NeuralVision = require("./neural_vision"); } catch(e) { /* opzionale */ }
// `casi_reali_forum` NON si importa qui: è il corpus d'esame, e questo è il
// modulo che addestra. Vedi il passo 7 del warmup e la regola unica.
var ExperienceDistiller = null;
try { ExperienceDistiller = require("./experience_distiller"); } catch(e) { /* opzionale */ }

var DATA_DIR = path.join(__dirname, "..", "..", "data", "neural");

var initialized = false;
var warmupDone = false;

// ============================================================================
// INIT / WARMUP
// ============================================================================

function init(options) {
  options = options || {};
  var dataDir = options.dataPath || DATA_DIR;

  // Assicurati che la directory esista
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  } catch(e) { /* ignore */ }

  // Carica pesi se esistono
  var loaded = loadAll(dataDir);

  // LA SCUOLA SI RIFÀ A OGNI AVVIO.
  //
  // Qui c'era: `if (!loaded.language && !loaded.patterns) warmup(options)`.
  // Il `warmup` non carica pesi: inietta la **conoscenza** — i 50 componenti
  // con i loro guasti tipici, i 40 pattern, i FENOMENI, i primi principi, i
  // 22 livelli di curriculum. Dopo la prima diagnosi `language_state.json` e
  // `patterns_state.json` esistono, quindi **dal secondo avvio in poi ROCCO
  // non rifaceva mai la scuola**.
  //
  // Misurato: grafo di conoscenza a 777 nodi caricati da disco contro 1305
  // dopo una scuola vera — congelato al giorno in cui erano stati scritti i
  // primi pesi. Tutto quel che abbiamo aggiunto dopo (banca dispositivi,
  // limiti normativi, nuovi pattern) non lo ha mai raggiunto. E con un grafo
  // vecchio `detectNovelty` non trova nulla di simile: ROCCO dichiarava
  // nuovo ogni caso (21 su 21) e passava la mano all'IA in 18 casi su 21,
  // diventando un involucro intorno al provider.
  //
  // Sembrava che "l'apprendimento costasse". Costava la scuola che non si
  // rifaceva.
  //
  // Perché ora si può: l'iniezione è **idempotente** — `aggiungiNodo`
  // riusa il nodo con lo stesso tipo e nome, e il curriculum non scrive più
  // episodi di memoria né addestra le reti (era scuola registrata come
  // esperienza). Verificato: tre iniezioni di fila lasciano 1227 nodi e
  // 1184 archi identici.
  if (options.autoWarmup !== false) {
    warmup(options, loaded);
  }

  initialized = true;
  return { initialized: true, loaded: loaded, warmupDone: warmupDone };
}

function warmup(options, loaded) {
  options = options || {};
  loaded = loaded || {};

  // 1. Carica knowledge base per bootstrap
  var knowledgePath = options.knowledgePath || path.join(__dirname, "..", "..", "knowledge");
  var components = safeLoadJSON(path.join(knowledgePath, "components.json"));
  var failurePatterns = safeLoadJSON(path.join(knowledgePath, "failure_patterns.json"));

  // 2. Carica FENOMENI e CONCETTI dall'orchestrator e dal causal model
  var fenomeni = null;
  var concetti = null;
  try {
    var orch = require("../orchestrator");
    fenomeni = orch.FENOMENI;
  } catch(e) { /* orchestrator non disponibile in isolamento */ }
  try {
    var cm = require("../causal_model");
    concetti = cm.CONCETTI;
  } catch(e) { /* causal_model non disponibile */ }

  // Override se passati direttamente
  if (options.fenomeni) fenomeni = options.fenomeni;
  if (options.concetti) concetti = options.concetti;
  if (options.components) components = options.components;
  if (options.failurePatterns) failurePatterns = options.failurePatterns;

  // 3. Bootstrap language
  NeuralLanguage.bootstrap(
    fenomeni ? (Array.isArray(fenomeni) ? fenomeni : Object.values(fenomeni)) : null,
    concetti,
    components
  );

  // 4. Bootstrap knowledge graph
  if (fenomeni) {
    NeuralKnowledge.bootstrapDaFenomeni(
      Array.isArray(fenomeni) ? fenomeni : Object.values(fenomeni)
    );
  }
  if (concetti) {
    NeuralKnowledge.bootstrapDaConcetti(concetti);
  }
  if (components || failurePatterns) {
    NeuralKnowledge.bootstrapDaKnowledge(components, failurePatterns);
  }

  // 5. Inviluppo del "normale" per le reti: **solo al primo avvio**.
  //
  // È l'unico passo che ADDESTRA invece di iniettare conoscenza: costruisce
  // la forma iniziale di anomalyNet e faultNet dai limiti normativi di
  // `knowledge/limiti.js`. Rifarlo a ogni avvio sovrascriverebbe con dati
  // sintetici quel che le reti hanno imparato dai guasti veri chiusi
  // dall'elettricista — che è l'unica cosa che le deve muovere.
  if (!loaded.patterns) {
    NeuralPatterns.bootstrapSintetico();
  }

  // 6. Studio curriculum tecnico — inietta conoscenza strutturata
  try {
    var StudyEngine = require("./study_engine");
    StudyEngine.studiaCompleto();
  } catch(e) {
    // curriculum/study_engine non disponibile — bootstrap base sufficiente
  }

  // 7. I CASI DEL CORPUS NON ADDESTRANO ROCCO.
  //
  // Qui veniva ingerito tutto `casi_reali_forum.js` — 48 casi **con la loro
  // `causa_reale`** — in lingua, grafo, memoria, pattern e distillatore. Lo
  // stesso file è il metro del banco di prova: ROCCO veniva quindi
  // interrogato su casi di cui conosceva la risposta, e la ritornava alla
  // lettera. Misurato: su FORUM-SPEC-004 l'ipotesi vincente arrivava da
  // `neural_similarita` ed era la stringa `causa_reale` copiata parola per
  // parola. La metrica "causa reale fra le ipotesi" misurava in parte la
  // memoria del risultato atteso, non la conoscenza.
  //
  // Regola unica, senza eccezioni:
  //   · i 48 casi del forum sono **esame**;
  //   · ROCCO impara **solo** dai casi che l'elettricista chiude e conferma
  //     (`/api/rocco/close-case` → `trainFromClosedCase`), e quello alimenta
  //     memoria, grafo, distillatore e reti.
  //
  // Non si tolgono "solo le causa_reale" lasciando i testi: addestrarsi sul
  // testo della domanda fa riconoscere a ROCCO la domanda d'esame e gonfia
  // somiglianza e novità. Una regola sola, nessuna doppia logica.

  warmupDone = true;
  return {
    language: NeuralLanguage.getStats(),
    patterns: NeuralPatterns.getStats(),
    knowledge: NeuralKnowledge.getStats(),
    memory: NeuralMemory.stats(),
    distiller: ExperienceDistiller ? ExperienceDistiller.getStats() : null
  };
}

// ============================================================================
// HOOK 1: Hypothesis Scoring
// Dopo ragiona() nell'orchestrator — arricchisce ogni ipotesi con neural_score
// ============================================================================

function scoreHypotheses(hypotheses, caseState) {
  if (!initialized || !hypotheses || hypotheses.length === 0) return hypotheses;

  try {
    var features = NeuralPatterns.estraiFeaturesSafe(caseState);
    var faultResult = NeuralPatterns.classificaGuasto(features);
    var problemEmb = NeuralLanguage.embeddingFrase(caseState.problem_summary || "");

    for (var i = 0; i < hypotheses.length; i++) {
      var h = hypotheses[i];
      if (h.status !== "active") continue;

      // Componente 1: similarità con knowledge graph
      var knResults = NeuralKnowledge.query(h.label, 3);
      var knScore = 0;
      if (knResults.length > 0) {
        knScore = Math.max(0, knResults[0].similarity);
      }

      // Componente 2: correlazione con pattern classifier
      var patternScore = 0;
      var faultClass = mapHypothesisToFault(h.label);
      if (faultClass && faultResult.all) {
        for (var f = 0; f < faultResult.all.length; f++) {
          if (faultResult.all[f].faultClass === faultClass) {
            patternScore = faultResult.all[f].probability;
            break;
          }
        }
      }

      // Componente 3: precedenti simili dalla memoria
      var hEmb = NeuralLanguage.embeddingFrase(h.label);
      var memResults = NeuralMemory.findSimilar(hEmb, 2);
      var memScore = 0;
      if (memResults.length > 0) {
        // Se un caso precedente con la stessa causa è stato confermato
        for (var m = 0; m < memResults.length; m++) {
          if (memResults[m].data && memResults[m].data.confirmed_cause) {
            var causeSim = NeuralLanguage.fraseSimile(h.label, memResults[m].data.confirmed_cause);
            if (causeSim > 0.5) memScore = Math.max(memScore, memResults[m].score * causeSim);
          }
        }
      }

      // Score neurale composito
      h.neural_score = knScore * 0.3 + patternScore * 0.3 + memScore * 0.4;
      h.neural_score = Math.min(1, Math.max(0, h.neural_score));
      h.neural_detail = {
        knowledge: knScore,
        pattern: patternScore,
        memory: memScore,
        faultClass: faultClass
      };
    }
  } catch(e) {
    // Graceful degradation — non toccare le ipotesi
  }

  return hypotheses;
}

function mapHypothesisToFault(label) {
  if (!label) return null;
  var l = label.toLowerCase();
  if (/dispersione|fuga|isolamento/.test(l)) return "dispersione";
  if (/cortocircuito|corto/.test(l)) return "cortocircuito";
  if (/sovraccarico|sovracorrente/.test(l)) return "sovraccarico";
  if (/interruzione|aperto|rotto/.test(l)) return "interruzione";
  if (/surriscald|caldo|termico/.test(l)) return "surriscaldamento";
  if (/guasto|difett|bruciato/.test(l)) return "guasto_componente";
  if (/squilibrio|sbilanc/.test(l)) return "squilibrio";
  return null;
}

// ============================================================================
// HOOK 2: Counterfactual Enhancement
// Dopo valutaIpotesiConControfattuale — arricchisce con predizioni neurali
// ============================================================================

function enhanceCounterfactual(hypothesis, cfResult, caseState) {
  if (!initialized || !cfResult) return cfResult;

  try {
    var knResults = NeuralKnowledge.query(hypothesis.label, 5);
    var neuralPredictions = [];

    for (var i = 0; i < knResults.length; i++) {
      var assoc = NeuralKnowledge.recuperaAssociati(knResults[i].id, 1);
      for (var j = 0; j < assoc.length; j++) {
        if (assoc[j].nodo.tipo === "verifica") {
          neuralPredictions.push({
            verifica: assoc[j].nodo.nome,
            weight: assoc[j].weight,
            source: "neural_knowledge"
          });
        }
      }
    }

    var anomaly = NeuralPatterns.detectAnomaly(NeuralPatterns.estraiFeaturesSafe(caseState));

    cfResult.neural_predictions = neuralPredictions;
    cfResult.neural_anomaly = anomaly.anomaly;
    cfResult.neural_anomaly_score = anomaly.score;
  } catch(e) {
    // Graceful degradation
  }

  return cfResult;
}

// ============================================================================
// HOOK 3: Case Similarity (semantic, not keyword)
// Sostituisce/integra memory.findRelevantClosedCases
// ============================================================================

function findSimilarCases(caseState, limit) {
  limit = limit || 5;
  if (!initialized) return [];

  try {
    var embedding = NeuralLanguage.embeddingFrase(caseState.problem_summary || "");
    return NeuralMemory.findSimilar(embedding, limit);
  } catch(e) {
    return [];
  }
}

// ============================================================================
// HOOK 4: Action Discrimination
// Dopo selectBestAction — ri-scora con intelligenza neurale
// ============================================================================

function scoreActionInformativeness(action, hypotheses, caseState) {
  if (!initialized || !action) return action;

  try {
    var actionText = action.action || action.expected_discriminator || "";
    var knResults = NeuralKnowledge.query(actionText, 5);

    // Stima quante ipotesi il test tocca (via knowledge graph)
    var touchedHyp = 0;
    var activeHyp = hypotheses.filter(function(h) { return h.status === "active"; });
    for (var i = 0; i < activeHyp.length; i++) {
      var hResults = NeuralKnowledge.query(activeHyp[i].label, 3);
      // Se condividono nodi nel knowledge graph → il test è rilevante
      for (var k = 0; k < knResults.length; k++) {
        for (var h = 0; h < hResults.length; h++) {
          if (knResults[k].id === hResults[h].id) { touchedHyp++; break; }
        }
      }
    }

    action.neural_discrimination_score = activeHyp.length > 0
      ? touchedHyp / activeHyp.length
      : 0;
  } catch(e) {
    // Graceful degradation
  }

  return action;
}

// ============================================================================
// HOOK 5: Novel Problem Detection
// Dopo percepire() — rileva se il problema è nuovo per ROCCO
// ============================================================================

function detectNovelty(percezione, caseState) {
  if (!initialized) return { novel: false, novelty_score: 0 };

  try {
    var embedding = NeuralLanguage.embeddingFrase(caseState.problem_summary || "");
    var results = NeuralKnowledge.cercaPerSimilarita(embedding, 1);

    var maxSim = results.length > 0 ? results[0].similarity : 0;
    var noveltyScore = 1 - Math.max(0, maxSim);

    // Conferma con pattern
    var features = NeuralPatterns.estraiFeaturesSafe(caseState);
    var anomaly = NeuralPatterns.detectAnomaly(features);
    if (anomaly.anomaly) noveltyScore = Math.min(1, noveltyScore + 0.2);

    return {
      novel: noveltyScore > 0.7,
      novelty_score: noveltyScore,
      closest_known: results.length > 0 ? results[0].nodo.nome : null,
      closest_similarity: maxSim
    };
  } catch(e) {
    return { novel: false, novelty_score: 0 };
  }
}

// ============================================================================
// HOOK 6: AI Call Decision
// Dentro decideAINeeded() — il neural suggerisce se serve l'LLM
// ============================================================================

// ============================================================================
// HOOK 6 — RITIRATO: la decisione "serve l'IA?" è una sola, e sta nel motore
// ============================================================================
//
// Qui viveva `shouldCallAI(caseState, hypotheses)`, 45 righe che potevano
// **ribaltare** la decisione dell'orchestratore in tre modi: nessuna ipotesi
// attiva, punteggi neurali alti, novità alta, incertezza del classificatore.
//
// Misurato sui 21 casi italiani: l'IA veniva chiamata 18 volte, e **15 di
// quelle per "alta incertezza pattern"** — cioè perché una rete appena
// addestrata non era sicura, mentre il motore aveva da 12 a 20 ipotesi
// proprie. Si chiedeva a un modello di lingua di risolvere l'insicurezza di
// una rete, non la mancanza di una diagnosi. E non serviva: spegnendo i
// provider il risultato sull'italiano è identico.
//
// La regola ora è una riga in `orchestrator.decideAINeeded()`: l'IA si
// consulta se il ragionamento deterministico non ha prodotto nessuna
// ipotesi. Il neurale continua a fare le cose che sa fare — ordinare,
// rilevare la novità, costruire il modello del mondo — ma non decide più
// quando chiamare un modello remoto.

// ============================================================================
// TRAINING PIPELINE
// Chiamato al step 12 dell'orchestrator quando un caso è chiuso e validato
// ============================================================================

function trainFromClosedCase(caseState, feedback) {
  if (!initialized || !feedback) return { trained: false };
  // Accetta sia casi chiusi (confirmedCause) che correzioni (rejectedCauses)
  if (!feedback.confirmedCause && !(feedback.rejectedCauses && feedback.rejectedCauses.length > 0)) return { trained: false };

  try {
    // 1. Language: impara dall'interazione
    var text = caseState.problem_summary || "";
    var entita = NeuralLanguage.estraiEntita(text);
    var intento = NeuralLanguage.classificaIntento(text);
    NeuralLanguage.imparaDaInterazione(text, intento.intent, entita);

    // 2. Patterns: addestra fault classifier
    var patResult = NeuralPatterns.trainDaCasoChiuso(caseState, feedback);

    // 3. Knowledge: rinforza connessioni corrette
    var knResult = NeuralKnowledge.imparaDaCasoChiuso(caseState, feedback);

    // 4. Memory: salva episodio
    var memResult = NeuralMemory.store(caseState, feedback);

    // 5. Distillazione esperienza: estrai regole dal caso chiuso
    var distillerResult = null;
    if (ExperienceDistiller) {
      try {
        distillerResult = ExperienceDistiller.distilla(caseState, feedback);
      } catch(e) { /* distillazione non critica */ }
    }

    // 6. Auto-evoluzione: ciclo di review se ci sono dati diagnostici
    //    selfReview si aspetta diagnosi = { causa_predetta, ipotesi, confidenza }
    var evolutionResult = null;
    if (NeuralEvolution && feedback.confirmedCause) {
      try {
        // Costruisci oggetto diagnosi nel formato atteso da selfReview
        var diagnosiObj = {
          causa_predetta: feedback.diagnosi || feedback.confirmedCause,
          ipotesi: feedback.ipotesi || (caseState.hypotheses || []).filter(function(h) {
            return h && h.status === "active";
          }).map(function(h) { return h.label || h; }),
          confidenza: feedback.confidenza || 0.5
        };
        evolutionResult = NeuralEvolution.cicloEvolutivo(
          caseState,
          diagnosiObj,
          { causa_reale: feedback.confirmedCause }
        );
      } catch(e) { /* evoluzione non critica */ }
    }

    // 7. G3: Consolida regole distillatore (pruning regole deboli, merge simili)
    var consolidaResult = null;
    if (ExperienceDistiller && ExperienceDistiller.consolidaRegole) {
      try {
        consolidaResult = ExperienceDistiller.consolidaRegole();
      } catch(e) { /* non critico */ }
    }

    // 8. Salva pesi (fire-and-forget, non bloccante)
    try { saveAll(); } catch(e) { /* non critico */ }

    return {
      trained: true,
      language: { vocabolario: NeuralLanguage.getStats().vocabolarioSize },
      patterns: patResult,
      knowledge: knResult,
      memory: memResult ? { id: memResult.id } : null,
      distiller: distillerResult ? { distillato: distillerResult.distillato } : null,
      evolution: evolutionResult ? evolutionResult.stato : null,
      consolidamento: consolidaResult || null
    };
  } catch(e) {
    return { trained: false, error: e.message || String(e) };
  }
}

// ============================================================================
// ANALYZE — Analisi neurale completa di un input (per uso diretto)
// ============================================================================

function analyze(text) {
  if (!initialized) return null;

  try {
    return {
      intent: NeuralLanguage.classificaIntento(text),
      entities: NeuralLanguage.estraiEntita(text),
      embedding: NeuralLanguage.embeddingFrase(text),
      knowledgeQuery: NeuralKnowledge.query(text, 5),
      similarCases: NeuralMemory.findSimilar(NeuralLanguage.embeddingFrase(text), 3)
    };
  } catch(e) {
    return null;
  }
}

// ============================================================================
// SAVE / LOAD
// ============================================================================

function saveAll(dataDir) {
  dataDir = dataDir || DATA_DIR;
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    safeWriteJSON(path.join(dataDir, "language_state.json"), NeuralLanguage.salva());
    safeWriteJSON(path.join(dataDir, "patterns_state.json"), NeuralPatterns.salva());
    safeWriteJSON(path.join(dataDir, "knowledge_graph.json"), NeuralKnowledge.salva());
    safeWriteJSON(path.join(dataDir, "memory_state.json"), NeuralMemory.salva());

    if (NeuralEvolution) {
      safeWriteJSON(path.join(dataDir, "evolution_state.json"), NeuralEvolution.salva());
    }
    if (NeuralSimulator) {
      safeWriteJSON(path.join(dataDir, "simulator_state.json"), NeuralSimulator.salva());
    }
    if (ExperienceDistiller) {
      safeWriteJSON(path.join(dataDir, "distiller_rules.json"), ExperienceDistiller.salva());
    }

    return true;
  } catch(e) {
    return false;
  }
}

function loadAll(dataDir) {
  dataDir = dataDir || DATA_DIR;
  var result = { language: false, patterns: false, knowledge: false, memory: false };

  try {
    var langData = safeLoadJSON(path.join(dataDir, "language_state.json"));
    if (langData) result.language = NeuralLanguage.carica(langData);

    var patData = safeLoadJSON(path.join(dataDir, "patterns_state.json"));
    if (patData) result.patterns = NeuralPatterns.carica(patData);

    var knData = safeLoadJSON(path.join(dataDir, "knowledge_graph.json"));
    if (knData) result.knowledge = NeuralKnowledge.carica(knData);

    var memData = safeLoadJSON(path.join(dataDir, "memory_state.json"));
    if (memData) result.memory = NeuralMemory.carica(memData);

    if (NeuralEvolution) {
      var evoData = safeLoadJSON(path.join(dataDir, "evolution_state.json"));
      if (evoData) { NeuralEvolution.carica(evoData); result.evolution = true; }
    }
    if (NeuralSimulator) {
      var simData = safeLoadJSON(path.join(dataDir, "simulator_state.json"));
      if (simData) { NeuralSimulator.carica(simData); result.simulator = true; }
    }
    if (ExperienceDistiller) {
      var distData = safeLoadJSON(path.join(dataDir, "distiller_rules.json"));
      if (distData) { ExperienceDistiller.carica(distData); result.distiller = true; }
    }
  } catch(e) { /* ignore */ }

  return result;
}

// ============================================================================
// STATS
// ============================================================================

function getStats() {
  return {
    initialized: initialized,
    warmupDone: warmupDone,
    language: NeuralLanguage.getStats(),
    patterns: NeuralPatterns.getStats(),
    knowledge: NeuralKnowledge.getStats(),
    memory: NeuralMemory.stats(),
    evolution: NeuralEvolution ? NeuralEvolution.getStato() : null,
    simulator: NeuralSimulator ? NeuralSimulator.getStats() : null,
    vision: NeuralVision ? NeuralVision.getStats() : null,
    distiller: ExperienceDistiller ? ExperienceDistiller.getStats() : null
  };
}

// ============================================================================
// Utilità file
// ============================================================================

function safeLoadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    var raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch(e) {
    return null;
  }
}

function safeWriteJSON(filePath, data) {
  var tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data), "utf8");
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  fs.renameSync(tmp, filePath);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Lifecycle
  init: init,
  warmup: warmup,
  initialized: function() { return initialized; },

  // 6 Hooks
  scoreHypotheses: scoreHypotheses,
  enhanceCounterfactual: enhanceCounterfactual,
  findSimilarCases: findSimilarCases,
  scoreActionInformativeness: scoreActionInformativeness,
  detectNovelty: detectNovelty,

  // Training
  trainFromClosedCase: trainFromClosedCase,

  // Analysis
  analyze: analyze,

  // Persistence
  saveAll: saveAll,
  loadAll: loadAll,

  // Stats
  getStats: getStats,

  // Evolution
  evolve: NeuralEvolution ? NeuralEvolution.cicloEvolutivo.bind(NeuralEvolution) : null,
  getCompetenza: NeuralEvolution ? NeuralEvolution.getCompetenza.bind(NeuralEvolution) : null,
  buildCurriculum: NeuralEvolution ? NeuralEvolution.buildCurriculum.bind(NeuralEvolution) : null,

  // World Model
  buildWorldModel: WorldModel ? WorldModel.costruisciDaCaseState : null,
  simulaWorldModel: WorldModel ? WorldModel.simula : null,
  snapshotWorldModel: WorldModel ? WorldModel.snapshot : null,
  WorldModel: WorldModel,

  // Simulatore Causale
  simulaCausale: NeuralSimulator ? NeuralSimulator.simula : null,
  aggiornaCausale: NeuralSimulator ? NeuralSimulator.aggiorna : null,
  NeuralSimulator: NeuralSimulator,

  // Visione tecnica
  interpretaImmagine: NeuralVision ? NeuralVision.interpretaImmagine : null,
  confrontaImmagini: NeuralVision ? NeuralVision.confrontaImmagini : null,
  NeuralVision: NeuralVision,

  // Il corpus del forum NON è esposto da qui, deliberatamente.
  // Era `CasiRealiForum` + `getForumCases` + `searchForumCases`: strade per
  // cui le `causa_reale` del corpus d'esame potevano rientrare nel
  // ragionamento. Chi ha bisogno del corpus — il banco e i test — importa
  // `./casi_reali_forum` direttamente, dove si vede che sta facendo un esame.

  // Distillatore di esperienza
  cercaRegoleDistillate: ExperienceDistiller ? ExperienceDistiller.cercaRegole : null,
  suggerisciVerifica: ExperienceDistiller ? ExperienceDistiller.suggerisciVerifica : null,
  cercaSequenza: ExperienceDistiller ? ExperienceDistiller.cercaSequenza : null,
  previsioneDistiller: ExperienceDistiller ? ExperienceDistiller.previsione : null,
  consolidaRegole: ExperienceDistiller ? ExperienceDistiller.consolidaRegole : null,
  ExperienceDistiller: ExperienceDistiller,

  // Sub-modules (esposti per test)
  NeuralLanguage: NeuralLanguage,
  NeuralPatterns: NeuralPatterns,
  NeuralKnowledge: NeuralKnowledge,
  NeuralMemory: NeuralMemory,
  NeuralEvolution: NeuralEvolution,
  NeuralCore: nc
};
