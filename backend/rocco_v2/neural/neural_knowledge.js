"use strict";

// ============================================================================
// NEURAL KNOWLEDGE — Grafo di conoscenza vivente per ROCCO
// Nodi con embeddings, relazioni con pesi che evolvono, ricerca associativa
// ============================================================================

var nc = require("./neural_core");

var DIM_NODO = 32;

// --- Tipi di nodo ---
var TIPI_NODO = ["concetto", "componente", "fenomeno", "causa", "verifica", "principio", "sintomo"];

// --- Tipi di relazione ---
var TIPI_RELAZIONE = ["causa", "manifesta", "verifica", "esclude", "richiede", "simile_a", "protegge", "alimenta"];

// --- Storage ---
var nodi = {};     // id → NodoConoscenza
var archi = [];    // ArcoConoscenza[]
var nextNodeId = 0;

// ============================================================================
// Nodo
// ============================================================================

function NodoConoscenza(id, tipo, nome, embedding) {
  this.id = id;
  this.tipo = tipo;
  this.nome = nome;
  this.embedding = embedding || nc.randomVector(DIM_NODO);
  this.stats = {
    accessi: 0,
    ultimo_accesso: null,
    volte_utile: 0
  };
  this.metadata = {};
}

// ============================================================================
// Arco
// ============================================================================

function ArcoConoscenza(da, a, relazione, peso) {
  this.da = da;
  this.a = a;
  this.relazione = relazione;
  this.peso = peso !== undefined ? peso : 0.5;
  this.stats = {
    rinforzi: 0,
    ultimo_rinforzo: null
  };
}

// ============================================================================
// Operazioni su grafi
// ============================================================================

function aggiungiNodo(tipo, nome, embedding) {
  var id = "kn_" + (nextNodeId++);
  var nodo = new NodoConoscenza(id, tipo, nome, embedding);
  nodi[id] = nodo;
  return id;
}

function aggiungiNodoConId(id, tipo, nome, embedding) {
  if (nodi[id]) return id; // già esiste
  var nodo = new NodoConoscenza(id, tipo, nome, embedding);
  nodi[id] = nodo;
  if (parseInt(id.replace("kn_", "")) >= nextNodeId) {
    nextNodeId = parseInt(id.replace("kn_", "")) + 1;
  }
  return id;
}

function aggiungiArco(daId, aId, relazione, peso) {
  if (!nodi[daId] || !nodi[aId]) return null;
  // Evita duplicati
  for (var i = 0; i < archi.length; i++) {
    if (archi[i].da === daId && archi[i].a === aId && archi[i].relazione === relazione) {
      return archi[i]; // già esiste
    }
  }
  var arco = new ArcoConoscenza(daId, aId, relazione, peso);
  archi.push(arco);
  return arco;
}

function trovaNodo(id) {
  if (!nodi[id]) return null;
  nodi[id].stats.accessi++;
  nodi[id].stats.ultimo_accesso = Date.now();
  return nodi[id];
}

function trovaNodoPerNome(nome) {
  nome = (nome || "").toLowerCase();
  for (var id in nodi) {
    if (nodi[id].nome.toLowerCase() === nome) {
      return nodi[id];
    }
  }
  return null;
}

function trovaArchi(nodoId, direzione, relazione) {
  var risultati = [];
  for (var i = 0; i < archi.length; i++) {
    var a = archi[i];
    if (relazione && a.relazione !== relazione) continue;
    if (direzione === "uscenti" && a.da === nodoId) risultati.push(a);
    else if (direzione === "entranti" && a.a === nodoId) risultati.push(a);
    else if (!direzione && (a.da === nodoId || a.a === nodoId)) risultati.push(a);
  }
  return risultati;
}

// ============================================================================
// Ricerca per similarità
// ============================================================================

function cercaPerSimilarita(queryEmbedding, topN) {
  topN = topN || 5;
  var results = [];

  for (var id in nodi) {
    var sim = nc.cosineSimilarity(queryEmbedding, nodi[id].embedding);
    results.push({ id: id, nodo: nodi[id], similarity: sim });
  }

  results.sort(function(a, b) { return b.similarity - a.similarity; });
  return results.slice(0, topN);
}

function recuperaAssociati(nodoId, maxDepth) {
  maxDepth = maxDepth || 2;
  var visited = {};
  var results = [];

  function bfs(currentId, depth, accumulatedWeight) {
    if (depth > maxDepth) return;
    if (visited[currentId]) return;
    visited[currentId] = true;

    if (currentId !== nodoId && nodi[currentId]) {
      results.push({
        id: currentId,
        nodo: nodi[currentId],
        depth: depth,
        weight: accumulatedWeight
      });
    }

    var edges = trovaArchi(currentId);
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      if (e.peso < 0.1) continue; // ignora archi deboli
      var nextId = e.da === currentId ? e.a : e.da;
      bfs(nextId, depth + 1, accumulatedWeight * e.peso);
    }
  }

  bfs(nodoId, 0, 1.0);
  results.sort(function(a, b) { return b.weight - a.weight; });
  return results;
}

// ============================================================================
// Rinforzo / Indebolimento
// ============================================================================

function rinforzaArco(daId, aId, delta) {
  delta = delta || 0.1;
  for (var i = 0; i < archi.length; i++) {
    var a = archi[i];
    if (a.da === daId && a.a === aId) {
      a.peso += delta * (1 - a.peso); // tende a 1
      a.peso = Math.min(1, a.peso);
      a.stats.rinforzi++;
      a.stats.ultimo_rinforzo = Date.now();
      return a;
    }
  }
  return null;
}

function indebolisciArco(daId, aId, delta) {
  delta = delta || 0.1;
  for (var i = 0; i < archi.length; i++) {
    var a = archi[i];
    if (a.da === daId && a.a === aId) {
      a.peso -= delta * a.peso; // tende a 0
      a.peso = Math.max(0.01, a.peso);
      return a;
    }
  }
  return null;
}

function rinforzaNodoUtile(nodoId) {
  if (nodi[nodoId]) {
    nodi[nodoId].stats.volte_utile++;
  }
}

// ============================================================================
// Consolidamento
// ============================================================================

function consolidaConoscenza() {
  var mergedCount = 0;
  var removedArcs = 0;
  var dormientCount = 0;

  // 1. Trova nodi con embeddings molto simili (>0.95) dello stesso tipo → merge
  var ids = Object.keys(nodi);
  var toMerge = [];
  for (var i = 0; i < ids.length; i++) {
    for (var j = i + 1; j < ids.length; j++) {
      if (nodi[ids[i]].tipo !== nodi[ids[j]].tipo) continue;
      var sim = nc.cosineSimilarity(nodi[ids[i]].embedding, nodi[ids[j]].embedding);
      if (sim > 0.95) {
        toMerge.push([ids[i], ids[j]]);
      }
    }
  }

  for (var m = 0; m < toMerge.length; m++) {
    var pair = toMerge[m];
    if (nodi[pair[0]] && nodi[pair[1]]) {
      mergeNodi(pair[0], pair[1]);
      mergedCount++;
    }
  }

  // 2. Rimuovi archi con peso < 0.05
  var newArchi = [];
  for (var i = 0; i < archi.length; i++) {
    if (archi[i].peso >= 0.05) {
      newArchi.push(archi[i]);
    } else {
      removedArcs++;
    }
  }
  archi = newArchi;

  // 3. Marca nodi dormienti (senza archi e non acceduti da 30+ giorni)
  var thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (var id in nodi) {
    var n = nodi[id];
    if (n.stats.ultimo_accesso && n.stats.ultimo_accesso < thirtyDaysAgo) {
      var hasEdges = false;
      for (var i = 0; i < archi.length; i++) {
        if (archi[i].da === id || archi[i].a === id) { hasEdges = true; break; }
      }
      if (!hasEdges) {
        n.metadata.dormiente = true;
        dormientCount++;
      }
    }
  }

  return { merged: mergedCount, removedArcs: removedArcs, dormient: dormientCount };
}

function mergeNodi(keepId, removeId) {
  if (!nodi[keepId] || !nodi[removeId]) return;

  // Media embeddings
  var e1 = nodi[keepId].embedding;
  var e2 = nodi[removeId].embedding;
  nodi[keepId].embedding = nc.averageVectors([e1, e2]);

  // Somma stats
  nodi[keepId].stats.accessi += nodi[removeId].stats.accessi;
  nodi[keepId].stats.volte_utile += nodi[removeId].stats.volte_utile;

  // Trasferisci archi
  for (var i = 0; i < archi.length; i++) {
    if (archi[i].da === removeId) archi[i].da = keepId;
    if (archi[i].a === removeId) archi[i].a = keepId;
  }

  // Rimuovi self-loops
  archi = archi.filter(function(a) { return a.da !== a.a; });

  // Rimuovi nodo
  delete nodi[removeId];
}

// ============================================================================
// Query neurale
// ============================================================================

function query(testo, topN) {
  topN = topN || 5;

  // Importa embedding dalla lingua se disponibile
  var NeuralLanguage;
  try { NeuralLanguage = require("./neural_language"); } catch(e) { return []; }

  var embedding = NeuralLanguage.embeddingFrase(testo);
  var simili = cercaPerSimilarita(embedding, topN * 2);

  // Espandi con associati
  var expanded = [];
  var seen = {};

  for (var i = 0; i < Math.min(simili.length, topN); i++) {
    var s = simili[i];
    if (!seen[s.id]) {
      expanded.push({
        id: s.id,
        nome: s.nodo.nome,
        tipo: s.nodo.tipo,
        similarity: s.similarity,
        source: "diretto"
      });
      seen[s.id] = true;
    }

    // Associati di primo livello
    var assoc = recuperaAssociati(s.id, 1);
    for (var j = 0; j < assoc.length; j++) {
      if (!seen[assoc[j].id]) {
        expanded.push({
          id: assoc[j].id,
          nome: assoc[j].nodo.nome,
          tipo: assoc[j].nodo.tipo,
          similarity: s.similarity * assoc[j].weight,
          source: "associato_da_" + s.nodo.nome
        });
        seen[assoc[j].id] = true;
      }
    }
  }

  expanded.sort(function(a, b) { return b.similarity - a.similarity; });
  return expanded.slice(0, topN);
}

// ============================================================================
// Bootstrap dal dominio
// ============================================================================

function bootstrapDaFenomeni(fenomeni) {
  if (!fenomeni) return 0;
  var count = 0;

  for (var i = 0; i < fenomeni.length; i++) {
    var f = fenomeni[i];
    var fenId = aggiungiNodo("fenomeno", f.id || ("FEN-" + i));
    count++;

    // Ipotesi
    if (f.ipotesi) {
      for (var h = 0; h < f.ipotesi.length; h++) {
        var ip = f.ipotesi[h];
        var causaId = aggiungiNodo("causa", ip.label || ip.causa || ("causa_" + i + "_" + h));
        aggiungiArco(fenId, causaId, "manifesta", 0.7);
        count++;

        // Test di conferma
        if (ip.conferma) {
          for (var c = 0; c < ip.conferma.length; c++) {
            var verName = typeof ip.conferma[c] === "string" ? ip.conferma[c] : ip.conferma[c].test || ("ver_" + c);
            var verId = aggiungiNodo("verifica", verName);
            aggiungiArco(causaId, verId, "verifica", 0.6);
            count++;
          }
        }
      }
    }
  }
  return count;
}

function bootstrapDaConcetti(concetti) {
  if (!concetti) return 0;
  var count = 0;
  var conceptIds = {};

  for (var key in concetti) {
    var c = concetti[key];
    var id = aggiungiNodo("concetto", key);
    conceptIds[key] = id;
    count++;

    // Collega concetti correlati
    if (c.collega) {
      for (var r = 0; r < c.collega.length; r++) {
        var related = c.collega[r];
        if (conceptIds[related]) {
          aggiungiArco(id, conceptIds[related], "simile_a", 0.5);
        }
      }
    }
  }
  return count;
}

function bootstrapDaKnowledge(components, failurePatterns) {
  var count = 0;

  if (components) {
    for (var i = 0; i < components.length; i++) {
      var comp = components[i];
      var compId = aggiungiNodo("componente", comp.name || ("comp_" + i));
      count++;

      // Guasti tipici
      if (comp.typical_faults) {
        for (var f = 0; f < comp.typical_faults.length; f++) {
          var faultName = typeof comp.typical_faults[f] === "string"
            ? comp.typical_faults[f]
            : comp.typical_faults[f].name || ("fault_" + f);
          var faultId = aggiungiNodo("causa", faultName);
          aggiungiArco(compId, faultId, "manifesta", 0.6);
          count++;
        }
      }

      // Field checks
      if (comp.field_checks) {
        for (var c = 0; c < comp.field_checks.length; c++) {
          var checkName = typeof comp.field_checks[c] === "string"
            ? comp.field_checks[c]
            : comp.field_checks[c].name || ("check_" + c);
          var checkId = aggiungiNodo("verifica", checkName);
          aggiungiArco(compId, checkId, "verifica", 0.5);
          count++;
        }
      }
    }
  }

  if (failurePatterns) {
    for (var i = 0; i < failurePatterns.length; i++) {
      var fp = failurePatterns[i];
      var patId = aggiungiNodo("causa", fp.name || fp.id || ("pattern_" + i));
      count++;

      // Sintomi
      if (fp.symptoms) {
        for (var s = 0; s < fp.symptoms.length; s++) {
          var symName = typeof fp.symptoms[s] === "string" ? fp.symptoms[s] : fp.symptoms[s].name;
          var symId = aggiungiNodo("sintomo", symName || ("sym_" + s));
          aggiungiArco(symId, patId, "manifesta", 0.6);
          count++;
        }
      }
    }
  }

  return count;
}

// ============================================================================
// Apprendimento da casi chiusi
// ============================================================================

function imparaDaCasoChiuso(caseState, feedback) {
  if (!feedback || !feedback.confirmedCause) return { learned: false };

  var causaConfermata = feedback.confirmedCause;
  var causaNodo = trovaNodoPerNome(causaConfermata);
  if (!causaNodo) {
    // Crea nuovo nodo per questa causa
    var newId = aggiungiNodo("causa", causaConfermata);
    causaNodo = nodi[newId];
  }

  rinforzaNodoUtile(causaNodo.id);

  // Rinforza archi verso componenti coinvolti
  if (caseState.components_detected) {
    for (var i = 0; i < caseState.components_detected.length; i++) {
      var comp = caseState.components_detected[i];
      var compNodo = trovaNodoPerNome(comp);
      if (compNodo) {
        var arco = aggiungiArco(compNodo.id, causaNodo.id, "manifesta", 0.5);
        if (arco) rinforzaArco(compNodo.id, causaNodo.id, 0.15);
      }
    }
  }

  // Indebolisci archi verso cause scartate
  if (feedback.rejectedCauses) {
    for (var i = 0; i < feedback.rejectedCauses.length; i++) {
      var rejected = feedback.rejectedCauses[i];
      var rejNodo = trovaNodoPerNome(rejected);
      if (rejNodo) {
        // Indebolisci tutti gli archi entranti verso questa causa
        var edges = trovaArchi(rejNodo.id, "entranti");
        for (var e = 0; e < edges.length; e++) {
          indebolisciArco(edges[e].da, edges[e].a, 0.05);
        }
      }
    }
  }

  // Rinforza verifiche decisive
  if (feedback.decisiveChecks) {
    for (var i = 0; i < feedback.decisiveChecks.length; i++) {
      var check = feedback.decisiveChecks[i];
      var checkNodo = trovaNodoPerNome(check);
      if (checkNodo) {
        aggiungiArco(causaNodo.id, checkNodo.id, "verifica", 0.7);
        rinforzaArco(causaNodo.id, checkNodo.id, 0.2);
        rinforzaNodoUtile(checkNodo.id);
      }
    }
  }

  return { learned: true, causaNode: causaNodo.id };
}

// ============================================================================
// Persistenza
// ============================================================================

function salva() {
  var nodiData = {};
  for (var id in nodi) {
    var n = nodi[id];
    nodiData[id] = {
      id: n.id,
      tipo: n.tipo,
      nome: n.nome,
      embedding: n.embedding,
      stats: n.stats,
      metadata: n.metadata
    };
  }

  var archiData = archi.map(function(a) {
    return {
      da: a.da,
      a: a.a,
      relazione: a.relazione,
      peso: a.peso,
      stats: a.stats
    };
  });

  return {
    version: 1,
    nodi: nodiData,
    archi: archiData,
    nextNodeId: nextNodeId,
    savedAt: new Date().toISOString()
  };
}

function carica(data) {
  if (!data || data.version !== 1) return false;
  nodi = {};
  archi = [];
  nextNodeId = data.nextNodeId || 0;

  for (var id in data.nodi) {
    var nd = data.nodi[id];
    var nodo = new NodoConoscenza(nd.id, nd.tipo, nd.nome, nd.embedding);
    nodo.stats = nd.stats || { accessi: 0, ultimo_accesso: null, volte_utile: 0 };
    nodo.metadata = nd.metadata || {};
    nodi[id] = nodo;
  }

  for (var i = 0; i < data.archi.length; i++) {
    var ad = data.archi[i];
    var arco = new ArcoConoscenza(ad.da, ad.a, ad.relazione, ad.peso);
    arco.stats = ad.stats || { rinforzi: 0, ultimo_rinforzo: null };
    archi.push(arco);
  }

  return true;
}

function reset() {
  nodi = {};
  archi = [];
  nextNodeId = 0;
}

function getStats() {
  var tipiCount = {};
  for (var id in nodi) {
    var t = nodi[id].tipo;
    tipiCount[t] = (tipiCount[t] || 0) + 1;
  }
  var relCount = {};
  for (var i = 0; i < archi.length; i++) {
    var r = archi[i].relazione;
    relCount[r] = (relCount[r] || 0) + 1;
  }
  return {
    totalNodi: Object.keys(nodi).length,
    totalArchi: archi.length,
    nodiPerTipo: tipiCount,
    archiPerRelazione: relCount
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // CRUD
  aggiungiNodo: aggiungiNodo,
  aggiungiNodoConId: aggiungiNodoConId,
  aggiungiArco: aggiungiArco,
  trovaNodo: trovaNodo,
  trovaNodoPerNome: trovaNodoPerNome,
  trovaArchi: trovaArchi,
  // Ricerca
  cercaPerSimilarita: cercaPerSimilarita,
  recuperaAssociati: recuperaAssociati,
  query: query,
  // Rinforzo
  rinforzaArco: rinforzaArco,
  indebolisciArco: indebolisciArco,
  rinforzaNodoUtile: rinforzaNodoUtile,
  // Consolidamento
  consolidaConoscenza: consolidaConoscenza,
  // Bootstrap
  bootstrapDaFenomeni: bootstrapDaFenomeni,
  bootstrapDaConcetti: bootstrapDaConcetti,
  bootstrapDaKnowledge: bootstrapDaKnowledge,
  // Learning
  imparaDaCasoChiuso: imparaDaCasoChiuso,
  // Persistence
  salva: salva,
  carica: carica,
  reset: reset,
  getStats: getStats,
  // Constants
  DIM_NODO: DIM_NODO
};
