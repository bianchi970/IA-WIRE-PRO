"use strict";

// ============================================================================
// NEURAL MEMORY — Memoria episodica e semantica per ROCCO
// Episodi individuali → consolidamento → pattern semantici → decadimento
// ============================================================================

var nc = require("./neural_core");

var DIM_EMBEDDING = 32;

// --- Soglie ---
var SOGLIA_CONSOLIDAMENTO = 3;    // episodi simili necessari per creare pattern
var SOGLIA_SIMILARITA = 0.85;     // cosine minima per considerare episodi "simili"
var DECAY_DAYS = 60;              // giorni dopo cui inizia il decadimento
var DECAY_RATE = 0.95;            // fattore di decadimento
var MIN_RINFORZO = 0.1;           // sotto questo valore → dimenticato
var MAX_EPISODI = 500;            // limite episodi

// --- Storage ---
var episodi = [];
var semantici = [];
var nextEpisodioId = 0;
var nextSemanticoId = 0;

// ============================================================================
// Episodio
// ============================================================================

function EpisodioMemoria(id, embedding, snapshot, feedback) {
  this.id = id;
  this.embedding = embedding;
  this.snapshot = {
    problem_summary: snapshot.problem_summary || "",
    domain: snapshot.domain || "",
    confirmed_cause: (feedback && feedback.confirmedCause) || "",
    decisive_checks: (feedback && feedback.decisiveChecks) || [],
    components: snapshot.components_detected || [],
    facts: snapshot.facts_confirmed || [],
    safety_level: (snapshot.safety && snapshot.safety.level) || "normal"
  };
  this.timestamp = Date.now();
  this.rinforzo = 1.0;
  this.accessi = 0;
  this.ultimoAccesso = this.timestamp;
  this.consolidato = false;
}

// ============================================================================
// Pattern Semantico
// ============================================================================

function PatternSemantico(id, embedding, pattern, episodeIds) {
  this.id = id;
  this.embedding = embedding;
  this.pattern = pattern; // { domain, typical_cause, typical_checks, typical_components }
  this.count = episodeIds.length;
  this.episodes = episodeIds;
  this.timestamp = Date.now();
  this.accessi = 0;
}

// ============================================================================
// Storage
// ============================================================================

function store(caseState, feedback) {
  if (!caseState || !feedback) return null;

  // Genera embedding
  var NeuralLanguage;
  try { NeuralLanguage = require("./neural_language"); } catch(e) {}

  var text = caseState.problem_summary || "";
  var embedding;
  if (NeuralLanguage) {
    embedding = NeuralLanguage.embeddingFrase(text);
  } else {
    embedding = nc.randomVector(DIM_EMBEDDING);
  }

  var id = "ep_" + (nextEpisodioId++);
  var episodio = new EpisodioMemoria(id, embedding, caseState, feedback);
  episodi.push(episodio);

  // Limite FIFO
  if (episodi.length > MAX_EPISODI) {
    // Rimuovi il più vecchio non consolidato con rinforzo minimo
    var minIdx = -1;
    var minRinforzo = Infinity;
    for (var i = 0; i < episodi.length; i++) {
      if (!episodi[i].consolidato && episodi[i].rinforzo < minRinforzo) {
        minRinforzo = episodi[i].rinforzo;
        minIdx = i;
      }
    }
    if (minIdx >= 0) episodi.splice(minIdx, 1);
  }

  // Tenta consolidamento
  tentaConsolidamento(episodio);

  return episodio;
}

function findSimilar(queryEmbedding, topN) {
  topN = topN || 5;
  var results = [];

  // Cerca negli episodi
  for (var i = 0; i < episodi.length; i++) {
    var ep = episodi[i];
    if (ep.rinforzo < MIN_RINFORZO) continue; // dimenticato
    var sim = nc.cosineSimilarity(queryEmbedding, ep.embedding);
    results.push({
      tipo: "episodico",
      id: ep.id,
      score: sim,
      data: ep.snapshot,
      rinforzo: ep.rinforzo,
      timestamp: ep.timestamp
    });
  }

  // Cerca nei pattern semantici (peso x1.5)
  for (var i = 0; i < semantici.length; i++) {
    var sem = semantici[i];
    var sim = nc.cosineSimilarity(queryEmbedding, sem.embedding);
    results.push({
      tipo: "semantico",
      id: sem.id,
      score: sim * 1.5, // bonus per conoscenza consolidata
      data: sem.pattern,
      count: sem.count,
      timestamp: sem.timestamp
    });
  }

  results.sort(function(a, b) { return b.score - a.score; });

  // Aggiorna accessi
  var top = results.slice(0, topN);
  for (var i = 0; i < top.length; i++) {
    if (top[i].tipo === "episodico") {
      var ep = findEpisodioById(top[i].id);
      if (ep) { ep.accessi++; ep.ultimoAccesso = Date.now(); ep.rinforzo = Math.min(1, ep.rinforzo + 0.05); }
    } else {
      var sem = findSemanticoById(top[i].id);
      if (sem) { sem.accessi++; }
    }
  }

  return top;
}

// ============================================================================
// Consolidamento
// ============================================================================

function tentaConsolidamento(nuovoEpisodio) {
  // Trova episodi simili non ancora consolidati
  var simili = [];
  for (var i = 0; i < episodi.length; i++) {
    if (episodi[i].id === nuovoEpisodio.id) continue;
    if (episodi[i].consolidato) continue;
    var sim = nc.cosineSimilarity(nuovoEpisodio.embedding, episodi[i].embedding);
    if (sim >= SOGLIA_SIMILARITA) {
      simili.push(episodi[i]);
    }
  }

  if (simili.length + 1 >= SOGLIA_CONSOLIDAMENTO) {
    // Consolida!
    simili.push(nuovoEpisodio);
    creaPatternSemantico(simili);
  }
}

function consolida() {
  // Consolidamento globale: trova tutti i cluster di episodi simili
  var nonConsolidati = episodi.filter(function(ep) { return !ep.consolidato && ep.rinforzo >= MIN_RINFORZO; });
  var clustered = new Set();
  var newPatterns = 0;

  for (var i = 0; i < nonConsolidati.length; i++) {
    if (clustered.has(nonConsolidati[i].id)) continue;
    var cluster = [nonConsolidati[i]];

    for (var j = i + 1; j < nonConsolidati.length; j++) {
      if (clustered.has(nonConsolidati[j].id)) continue;
      var sim = nc.cosineSimilarity(nonConsolidati[i].embedding, nonConsolidati[j].embedding);
      if (sim >= SOGLIA_SIMILARITA) {
        cluster.push(nonConsolidati[j]);
      }
    }

    if (cluster.length >= SOGLIA_CONSOLIDAMENTO) {
      creaPatternSemantico(cluster);
      for (var k = 0; k < cluster.length; k++) clustered.add(cluster[k].id);
      newPatterns++;
    }
  }

  return { newPatterns: newPatterns };
}

function creaPatternSemantico(episodiCluster) {
  // Embedding medio
  var embeddings = episodiCluster.map(function(ep) { return ep.embedding; });
  var avgEmb = nc.averageVectors(embeddings);

  // Estrai pattern comune
  var causes = {};
  var checks = {};
  var components = {};
  var domains = {};

  for (var i = 0; i < episodiCluster.length; i++) {
    var s = episodiCluster[i].snapshot;
    if (s.confirmed_cause) causes[s.confirmed_cause] = (causes[s.confirmed_cause] || 0) + 1;
    if (s.domain) domains[s.domain] = (domains[s.domain] || 0) + 1;
    for (var j = 0; j < s.decisive_checks.length; j++) {
      checks[s.decisive_checks[j]] = (checks[s.decisive_checks[j]] || 0) + 1;
    }
    for (var j = 0; j < s.components.length; j++) {
      components[s.components[j]] = (components[s.components[j]] || 0) + 1;
    }
  }

  var pattern = {
    domain: topKey(domains),
    typical_cause: topKey(causes),
    typical_checks: topKeys(checks, 3),
    typical_components: topKeys(components, 3)
  };

  var episodeIds = episodiCluster.map(function(ep) { return ep.id; });
  var id = "sem_" + (nextSemanticoId++);
  var sem = new PatternSemantico(id, avgEmb, pattern, episodeIds);
  semantici.push(sem);

  // Marca episodi come consolidati
  for (var i = 0; i < episodiCluster.length; i++) {
    episodiCluster[i].consolidato = true;
  }

  return sem;
}

// ============================================================================
// Decadimento
// ============================================================================

function decadimento() {
  var now = Date.now();
  var decayThreshold = now - DECAY_DAYS * 24 * 60 * 60 * 1000;
  var decayed = 0;
  var forgotten = 0;

  for (var i = 0; i < episodi.length; i++) {
    var ep = episodi[i];
    if (ep.ultimoAccesso < decayThreshold) {
      ep.rinforzo *= DECAY_RATE;
      decayed++;
      if (ep.rinforzo < MIN_RINFORZO && !ep.consolidato) {
        forgotten++;
      }
    }
  }

  // I pattern semantici NON decadono — sono conoscenza consolidata

  return { decayed: decayed, forgotten: forgotten };
}

// ============================================================================
// Replay ("Dream mode")
// ============================================================================

function replay() {
  // Raccoglie tutti i pattern semantici e ritorna i dati per ri-addestrare
  var replayData = [];

  for (var i = 0; i < semantici.length; i++) {
    var sem = semantici[i];
    replayData.push({
      embedding: sem.embedding,
      pattern: sem.pattern,
      count: sem.count
    });
  }

  return {
    patterns: replayData,
    totalPatterns: semantici.length,
    totalEpisodes: episodi.length,
    activeEpisodes: episodi.filter(function(ep) { return ep.rinforzo >= MIN_RINFORZO; }).length
  };
}

// ============================================================================
// Utilità
// ============================================================================

function findEpisodioById(id) {
  for (var i = 0; i < episodi.length; i++) {
    if (episodi[i].id === id) return episodi[i];
  }
  return null;
}

function findSemanticoById(id) {
  for (var i = 0; i < semantici.length; i++) {
    if (semantici[i].id === id) return semantici[i];
  }
  return null;
}

function topKey(obj) {
  var best = null, bestCount = 0;
  for (var k in obj) {
    if (obj[k] > bestCount) { best = k; bestCount = obj[k]; }
  }
  return best;
}

function topKeys(obj, n) {
  var entries = [];
  for (var k in obj) entries.push({ key: k, count: obj[k] });
  entries.sort(function(a, b) { return b.count - a.count; });
  return entries.slice(0, n).map(function(e) { return e.key; });
}

// ============================================================================
// Stats
// ============================================================================

function stats() {
  var active = episodi.filter(function(ep) { return ep.rinforzo >= MIN_RINFORZO; }).length;
  var consolidated = episodi.filter(function(ep) { return ep.consolidato; }).length;
  var forgotten = episodi.length - active;

  return {
    episodi_totali: episodi.length,
    episodi_attivi: active,
    episodi_consolidati: consolidated,
    episodi_dimenticati: forgotten,
    semantici_totali: semantici.length,
    ultimo_consolidamento: semantici.length > 0 ? semantici[semantici.length - 1].timestamp : null,
    max_episodi: MAX_EPISODI
  };
}

// ============================================================================
// Persistenza
// ============================================================================

function salva() {
  return {
    version: 1,
    episodi: episodi.map(function(ep) {
      return {
        id: ep.id,
        embedding: ep.embedding,
        snapshot: ep.snapshot,
        timestamp: ep.timestamp,
        rinforzo: ep.rinforzo,
        accessi: ep.accessi,
        ultimoAccesso: ep.ultimoAccesso,
        consolidato: ep.consolidato
      };
    }),
    semantici: semantici.map(function(sem) {
      return {
        id: sem.id,
        embedding: sem.embedding,
        pattern: sem.pattern,
        count: sem.count,
        episodes: sem.episodes,
        timestamp: sem.timestamp,
        accessi: sem.accessi
      };
    }),
    nextEpisodioId: nextEpisodioId,
    nextSemanticoId: nextSemanticoId,
    savedAt: new Date().toISOString()
  };
}

function carica(data) {
  if (!data || data.version !== 1) return false;
  nextEpisodioId = data.nextEpisodioId || 0;
  nextSemanticoId = data.nextSemanticoId || 0;

  episodi = (data.episodi || []).map(function(ed) {
    var ep = new EpisodioMemoria(ed.id, ed.embedding, ed.snapshot || {}, null);
    ep.snapshot = ed.snapshot;
    ep.timestamp = ed.timestamp;
    ep.rinforzo = ed.rinforzo;
    ep.accessi = ed.accessi;
    ep.ultimoAccesso = ed.ultimoAccesso;
    ep.consolidato = ed.consolidato;
    return ep;
  });

  semantici = (data.semantici || []).map(function(sd) {
    var sem = new PatternSemantico(sd.id, sd.embedding, sd.pattern, sd.episodes || []);
    sem.count = sd.count;
    sem.timestamp = sd.timestamp;
    sem.accessi = sd.accessi;
    return sem;
  });

  return true;
}

function reset() {
  episodi = [];
  semantici = [];
  nextEpisodioId = 0;
  nextSemanticoId = 0;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  store: store,
  findSimilar: findSimilar,
  consolida: consolida,
  decadimento: decadimento,
  replay: replay,
  stats: stats,
  salva: salva,
  carica: carica,
  reset: reset,
  DIM_EMBEDDING: DIM_EMBEDDING
};
