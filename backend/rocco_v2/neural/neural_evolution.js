"use strict";

// ============================================================================
// NEURAL EVOLUTION — Motore di auto-evoluzione per ROCCO
//
// Ciclo chiuso: caso → diagnosi → esito → confronto → correzione → crescita
//
// 3 funzioni principali:
//   selfReview()      — capisce perché ha sbagliato o azzeccato
//   evolveKnowledge() — aggiorna grafo, memoria, pattern, classificatore
//   buildCurriculum() — individua aree deboli e decide cosa approfondire
//
// Plus:
//   cicloEvolutivo()       — orchestratore del ciclo completo
//   competence tracking    — mappa di competenza per dominio/guasto
//   confidence calibration — la confidenza di ROCCO corrisponde alla realtà?
//   drift detection        — sta peggiorando in un'area prima forte?
//   consolidamento ciclico — ogni N casi, riflessione profonda
// ============================================================================

var nk = require("./neural_knowledge");
var nl = require("./neural_language");
var np = require("./neural_patterns");
var nm = require("./neural_memory");
var nc = require("./neural_core");

// ============================================================================
// STATO EVOLUTIVO PERSISTENTE
// ============================================================================

var stato = {
  // Mappa competenza: dominio/tipo_guasto → stats
  competenza: {},
  // Storico review per analisi trend
  storico_review: [],
  // Calibrazione confidenza
  calibrazione: {
    predizioni: [],       // [{confidenza_predetta, esito_corretto}]
    accuratezza_media: 0,
    sovraconfidente: false,
    sottoconfidente: false
  },
  // Contatori
  casi_totali: 0,
  casi_corretti: 0,
  casi_errati: 0,
  evoluzioni_eseguite: 0,
  auto_studi_generati: 0,
  ultimo_consolidamento: 0,
  // Drift detection
  drift: {
    finestra: [],          // ultimi N risultati
    dimensione_finestra: 20,
    soglia_allarme: 0.4    // se accuratezza finestra < 40% → drift
  }
};

// Costanti
var CONSOLIDAMENTO_OGNI = 50;    // ogni N casi, consolidamento ciclico
var MAX_STORICO = 500;           // max review salvate
var SOGLIA_DEBOLE = 0.6;         // sotto 60% = area debole
var SOGLIA_LACUNA = 5;           // meno di N casi = lacuna

// ============================================================================
// TASSONOMIA ERRORI
// ============================================================================

var TIPI_ERRORE = {
  CORRETTO: "corretto",
  FALSO_POSITIVO: "falso_positivo",        // ha diagnosticato X ma non era X
  FALSO_NEGATIVO: "falso_negativo",        // non ha considerato la causa giusta
  RANKING_SBAGLIATO: "ranking_sbagliato",  // causa giusta ma non in cima
  CONOSCENZA_MANCANTE: "conoscenza_mancante", // causa mai vista nel KG
  DATI_INSUFFICIENTI: "dati_insufficienti"    // non ha chiesto le domande giuste
};

// ============================================================================
// SELF-REVIEW — Analizza perché ROCCO ha avuto ragione o torto
// ============================================================================

function selfReview(caseState, diagnosi, esitoReale) {
  if (!diagnosi || !esitoReale || !esitoReale.causa_reale) {
    return { tipo: TIPI_ERRORE.DATI_INSUFFICIENTI, analisi: null };
  }

  var causaReale = esitoReale.causa_reale;
  var causaPredetta = diagnosi.causa_predetta || null;
  var ipotesi = diagnosi.ipotesi || [];
  var confidenza = diagnosi.confidenza || 0;

  // Determina tipo di risultato
  var tipo;
  var dettaglio = {
    causa_reale: causaReale,
    causa_predetta: causaPredetta,
    confidenza_predetta: confidenza,
    ipotesi_attive: ipotesi.length,
    causa_era_nelle_ipotesi: false,
    posizione_causa_reale: -1
  };

  // Cerca la causa reale nelle ipotesi
  for (var i = 0; i < ipotesi.length; i++) {
    var label = (ipotesi[i].label || ipotesi[i].nome || "").toLowerCase();
    if (label === causaReale.toLowerCase() || label.indexOf(causaReale.toLowerCase()) >= 0 ||
        causaReale.toLowerCase().indexOf(label) >= 0) {
      dettaglio.causa_era_nelle_ipotesi = true;
      dettaglio.posizione_causa_reale = i;
      break;
    }
  }

  // Classifica errore (ordine conta: dal più specifico al più generico)
  if (causaPredetta && matchCausa(causaPredetta, causaReale)) {
    // Ha indovinato
    tipo = TIPI_ERRORE.CORRETTO;
  } else if (dettaglio.causa_era_nelle_ipotesi && dettaglio.posizione_causa_reale > 0) {
    // Causa giusta era nelle ipotesi ma non era la prima
    tipo = TIPI_ERRORE.RANKING_SBAGLIATO;
  } else if (!dettaglio.causa_era_nelle_ipotesi) {
    // Causa reale non era nemmeno nelle ipotesi
    var nodoKG = nk.trovaNodoPerNome(causaReale);
    if (!nodoKG) {
      // Non la conosce proprio
      tipo = TIPI_ERRORE.CONOSCENZA_MANCANTE;
    } else {
      // La conosce ma non l'ha considerata
      tipo = TIPI_ERRORE.FALSO_NEGATIVO;
    }
  } else if (causaPredetta && !matchCausa(causaPredetta, causaReale)) {
    // Ha predetto una causa sbagliata
    tipo = TIPI_ERRORE.FALSO_POSITIVO;
  } else {
    tipo = TIPI_ERRORE.DATI_INSUFFICIENTI;
  }

  // Analisi dei moduli: chi ha fallito?
  var analisiModuli = analizzaModuli(caseState, diagnosi, causaReale, tipo);

  // Segnali di apprendimento
  var segnali = generaSegnaliApprendimento(tipo, dettaglio, analisiModuli);

  var review = {
    timestamp: Date.now(),
    tipo: tipo,
    dettaglio: dettaglio,
    moduli: analisiModuli,
    segnali: segnali,
    dominio: caseState.domain || "elettrico",
    componenti: caseState.components_detected || []
  };

  // Aggiorna stato
  stato.casi_totali++;
  if (tipo === TIPI_ERRORE.CORRETTO) {
    stato.casi_corretti++;
  } else {
    stato.casi_errati++;
  }

  // Aggiorna calibrazione
  stato.calibrazione.predizioni.push({
    confidenza: confidenza,
    corretto: tipo === TIPI_ERRORE.CORRETTO
  });
  if (stato.calibrazione.predizioni.length > 200) {
    stato.calibrazione.predizioni = stato.calibrazione.predizioni.slice(-200);
  }
  aggiornaCalibrazione();

  // Aggiorna competenza
  aggiornaCompetenza(causaReale, tipo, caseState.domain || "elettrico");

  // Drift detection
  stato.drift.finestra.push(tipo === TIPI_ERRORE.CORRETTO ? 1 : 0);
  if (stato.drift.finestra.length > stato.drift.dimensione_finestra) {
    stato.drift.finestra.shift();
  }

  // Salva nello storico
  stato.storico_review.push(review);
  if (stato.storico_review.length > MAX_STORICO) {
    stato.storico_review = stato.storico_review.slice(-MAX_STORICO);
  }

  return review;
}

// ============================================================================
// ANALISI MODULI — Chi ha fallito e perché
// ============================================================================

function analizzaModuli(caseState, diagnosi, causaReale, tipoErrore) {
  var analisi = {
    language: { ok: true, problema: null },
    patterns: { ok: true, problema: null },
    knowledge: { ok: true, problema: null },
    memory: { ok: true, problema: null }
  };

  if (tipoErrore === TIPI_ERRORE.CORRETTO) return analisi;

  // Language: ha capito il problema?
  try {
    var testo = caseState.problem_summary || "";
    var entita = nl.estraiEntita(testo);
    var componentiTrovati = entita.filter(function(e) { return e.type === "componente"; });
    if (componentiTrovati.length === 0 && (caseState.components_detected || []).length > 0) {
      analisi.language.ok = false;
      analisi.language.problema = "non_ha_estratto_componenti";
    }
  } catch(e) { /* ignore */ }

  // Knowledge: conosceva la causa?
  try {
    var nodo = nk.trovaNodoPerNome(causaReale);
    if (!nodo) {
      analisi.knowledge.ok = false;
      analisi.knowledge.problema = "causa_sconosciuta";
    } else {
      // Verifica se gli archi portavano alla causa
      var archi = nk.trovaArchi(nodo.id, "entranti", "causa");
      if (archi.length === 0) {
        analisi.knowledge.ok = false;
        analisi.knowledge.problema = "archi_causa_mancanti";
      }
    }
  } catch(e) { /* ignore */ }

  // Patterns: ha classificato correttamente?
  if (diagnosi.neural_detail) {
    if (diagnosi.neural_detail.pattern < 0.3) {
      analisi.patterns.ok = false;
      analisi.patterns.problema = "score_pattern_basso";
    }
  }

  // Memory: c'erano casi simili?
  try {
    var embedding = nl.embeddingFrase(caseState.problem_summary || "");
    var simili = nm.findSimilar(embedding, 3);
    if (simili.length === 0) {
      analisi.memory.ok = false;
      analisi.memory.problema = "nessun_caso_simile";
    }
  } catch(e) { /* ignore */ }

  return analisi;
}

// ============================================================================
// SEGNALI DI APPRENDIMENTO — Cosa deve cambiare
// ============================================================================

function generaSegnaliApprendimento(tipo, dettaglio, analisiModuli) {
  var segnali = [];

  switch(tipo) {
    case TIPI_ERRORE.FALSO_POSITIVO:
      // Ha predetto X ma era Y: indebolisci X, rinforza Y
      segnali.push({
        azione: "indebolisci_arco",
        target: dettaglio.causa_predetta,
        intensita: 0.15
      });
      segnali.push({
        azione: "rinforza_arco",
        target: dettaglio.causa_reale,
        intensita: 0.2
      });
      break;

    case TIPI_ERRORE.FALSO_NEGATIVO:
      // Non ha considerato la causa: crea/rinforza connessioni
      segnali.push({
        azione: "crea_connessioni",
        target: dettaglio.causa_reale,
        intensita: 0.3
      });
      break;

    case TIPI_ERRORE.RANKING_SBAGLIATO:
      // Causa giusta ma non in cima: rinforza e indebolisci quelle sopra
      segnali.push({
        azione: "rinforza_arco",
        target: dettaglio.causa_reale,
        intensita: 0.15
      });
      if (dettaglio.causa_predetta) {
        segnali.push({
          azione: "indebolisci_arco",
          target: dettaglio.causa_predetta,
          intensita: 0.1
        });
      }
      break;

    case TIPI_ERRORE.CONOSCENZA_MANCANTE:
      // Non conosce la causa: crea nodo + archi + studio
      segnali.push({
        azione: "crea_nodo",
        target: dettaglio.causa_reale,
        intensita: 1.0
      });
      segnali.push({
        azione: "auto_studio",
        target: dettaglio.causa_reale,
        intensita: 1.0
      });
      break;

    case TIPI_ERRORE.CORRETTO:
      // Ha indovinato: rinforza tutto
      segnali.push({
        azione: "rinforza_arco",
        target: dettaglio.causa_reale,
        intensita: 0.1
      });
      segnali.push({
        azione: "rinforza_confidenza",
        target: dettaglio.causa_reale,
        intensita: 0.05
      });
      break;
  }

  // Segnali dai moduli falliti
  if (!analisiModuli.knowledge.ok && analisiModuli.knowledge.problema === "causa_sconosciuta") {
    segnali.push({
      azione: "crea_nodo",
      target: dettaglio.causa_reale,
      intensita: 1.0
    });
  }

  if (!analisiModuli.language.ok) {
    segnali.push({
      azione: "espandi_vocabolario",
      target: dettaglio.causa_reale,
      intensita: 0.5
    });
  }

  return segnali;
}

// ============================================================================
// EVOLVE KNOWLEDGE — Applica i segnali di apprendimento
// ============================================================================

function evolveKnowledge(review) {
  if (!review || !review.segnali) return { evolved: false };

  var risultato = {
    evolved: true,
    archi_rinforzati: 0,
    archi_indeboliti: 0,
    nodi_creati: 0,
    parole_aggiunte: 0,
    pattern_aggiornati: 0
  };

  for (var i = 0; i < review.segnali.length; i++) {
    var s = review.segnali[i];

    switch(s.azione) {
      case "rinforza_arco":
        risultato.archi_rinforzati += rinforzaArchiCausa(s.target, s.intensita);
        break;

      case "indebolisci_arco":
        risultato.archi_indeboliti += indebolisciArchiCausa(s.target, s.intensita);
        break;

      case "crea_connessioni":
        risultato.archi_rinforzati += creaConnessioniMancanti(s.target, review);
        break;

      case "crea_nodo":
        var nodoCreato = creaNodoCausaNuova(s.target, review);
        if (nodoCreato) risultato.nodi_creati++;
        break;

      case "espandi_vocabolario":
        risultato.parole_aggiunte += espandiVocabolario(s.target);
        break;

      case "auto_studio":
        // Delegato a buildCurriculum
        break;

      case "rinforza_confidenza":
        // I rinforzi sugli archi già bastano
        break;
    }
  }

  // Aggiorna pattern se c'è un caso con misure
  if (review.dettaglio && review.dettaglio.causa_reale) {
    try {
      // Il training dei pattern avviene tramite trainFromClosedCase nell'integration
      risultato.pattern_aggiornati = 1;
    } catch(e) { /* ignore */ }
  }

  stato.evoluzioni_eseguite++;

  return risultato;
}

// --- Helper: rinforza archi legati a una causa ---
function rinforzaArchiCausa(causaNome, intensita) {
  var nodo = nk.trovaNodoPerNome(causaNome);
  if (!nodo) return 0;

  var archi = nk.trovaArchi(nodo.id);
  var count = 0;
  for (var i = 0; i < archi.length; i++) {
    nk.rinforzaArco(archi[i].da, archi[i].a, intensita);
    count++;
  }
  nk.rinforzaNodoUtile(nodo.id);
  return count;
}

// --- Helper: indebolisci archi legati a una causa ---
function indebolisciArchiCausa(causaNome, intensita) {
  var nodo = nk.trovaNodoPerNome(causaNome);
  if (!nodo) return 0;

  var archi = nk.trovaArchi(nodo.id);
  var count = 0;
  for (var i = 0; i < archi.length; i++) {
    nk.indebolisciArco(archi[i].da, archi[i].a, intensita);
    count++;
  }
  return count;
}

// --- Helper: crea connessioni mancanti per una causa non raggiunta ---
function creaConnessioniMancanti(causaNome, review) {
  var nodo = nk.trovaNodoPerNome(causaNome);
  if (!nodo) {
    // Crea il nodo se non esiste
    var id = nk.aggiungiNodo("causa", causaNome);
    nodo = nk.trovaNodo(id);
  }
  if (!nodo) return 0;

  var count = 0;

  // Collega ai componenti del caso
  var componenti = review.componenti || [];
  for (var i = 0; i < componenti.length; i++) {
    var compNodo = nk.trovaNodoPerNome(componenti[i]);
    if (compNodo) {
      nk.aggiungiArco(nodo.id, compNodo.id, "manifesta", 0.6);
      count++;
    }
  }

  return count;
}

// --- Helper: crea nodo per causa completamente nuova ---
function creaNodoCausaNuova(causaNome, review) {
  var esistente = nk.trovaNodoPerNome(causaNome);
  if (esistente) return false;

  var nodoId = nk.aggiungiNodo("causa", causaNome);
  var nodo = nk.trovaNodo(nodoId);
  if (nodo) {
    nodo.metadata.origine = "auto_evoluzione";
    nodo.metadata.caso_origine = review.timestamp;
    nodo.metadata.dominio = review.dominio;
  }

  // Collega ai componenti del caso
  var componenti = review.componenti || [];
  for (var i = 0; i < componenti.length; i++) {
    var compNodo = nk.trovaNodoPerNome(componenti[i]);
    if (compNodo) {
      nk.aggiungiArco(nodoId, compNodo.id, "manifesta", 0.5);
    }
  }

  // Aggiungi al vocabolario
  espandiVocabolario(causaNome);

  return true;
}

// --- Helper: espandi vocabolario con termini nuovi ---
function espandiVocabolario(testo) {
  if (!testo) return 0;
  var parole = testo.toLowerCase()
    .replace(/[^a-zà-ú0-9_]/g, " ")
    .split(/\s+/)
    .filter(function(p) { return p.length >= 3; });

  var count = 0;
  for (var i = 0; i < parole.length; i++) {
    nl.aggiungiAlVocabolario(parole[i]);
    count++;
  }
  return count;
}

// ============================================================================
// BUILD CURRICULUM — Identifica lacune e genera auto-studio
// ============================================================================

function buildCurriculum() {
  var lacune = [];
  var aree_deboli = [];
  var studio = [];

  // 1. Analizza mappa competenza
  var keys = Object.keys(stato.competenza);
  for (var i = 0; i < keys.length; i++) {
    var comp = stato.competenza[keys[i]];
    var accuratezza = comp.casi > 0 ? comp.corretti / comp.casi : 0;

    if (comp.casi < SOGLIA_LACUNA) {
      lacune.push({
        area: keys[i],
        casi: comp.casi,
        accuratezza: accuratezza,
        tipo: "lacuna",
        priorita: 1.0 - (comp.casi / SOGLIA_LACUNA)
      });
    } else if (accuratezza < SOGLIA_DEBOLE) {
      aree_deboli.push({
        area: keys[i],
        casi: comp.casi,
        accuratezza: accuratezza,
        tipo: "debolezza",
        priorita: 1.0 - accuratezza
      });
    }
  }

  // 2. Analizza errori ricorrenti (pattern negli errori)
  var erroriPerTipo = {};
  var recenti = stato.storico_review.slice(-50);
  for (var j = 0; j < recenti.length; j++) {
    var r = recenti[j];
    if (r.tipo !== TIPI_ERRORE.CORRETTO) {
      var causa = r.dettaglio.causa_reale;
      if (!erroriPerTipo[causa]) erroriPerTipo[causa] = 0;
      erroriPerTipo[causa]++;
    }
  }

  // Errori ripetuti (stessa causa sbagliata 3+ volte) → priorità alta
  var erroriRipetuti = Object.keys(erroriPerTipo);
  for (var k = 0; k < erroriRipetuti.length; k++) {
    if (erroriPerTipo[erroriRipetuti[k]] >= 3) {
      studio.push({
        area: erroriRipetuti[k],
        motivo: "errore_ripetuto_" + erroriPerTipo[erroriRipetuti[k]] + "_volte",
        priorita: 0.9,
        azione: "studio_mirato"
      });
    }
  }

  // 3. Cerca livelli curriculum collegati alle lacune
  var curriculumDisponibile = [];
  try {
    var curriculum = require("./curriculum");
    curriculumDisponibile = curriculum.LIVELLI;
  } catch(e) { /* curriculum non disponibile */ }

  // 4. Mappa lacune → livelli curriculum
  for (var l = 0; l < lacune.length; l++) {
    var livelloRilevante = trovaLivelloPerArea(curriculumDisponibile, lacune[l].area);
    if (livelloRilevante) {
      studio.push({
        area: lacune[l].area,
        motivo: "lacuna_" + lacune[l].casi + "_casi",
        priorita: lacune[l].priorita,
        azione: "studio_livello",
        livello: livelloRilevante.id
      });
    }
  }

  for (var m = 0; m < aree_deboli.length; m++) {
    var livelloDebole = trovaLivelloPerArea(curriculumDisponibile, aree_deboli[m].area);
    if (livelloDebole) {
      studio.push({
        area: aree_deboli[m].area,
        motivo: "accuratezza_" + Math.round(aree_deboli[m].accuratezza * 100) + "%",
        priorita: aree_deboli[m].priorita,
        azione: "ripasso_livello",
        livello: livelloDebole.id
      });
    }
  }

  // 5. Ordina per priorità
  studio.sort(function(a, b) { return b.priorita - a.priorita; });

  stato.auto_studi_generati += studio.length;

  return {
    lacune: lacune,
    aree_deboli: aree_deboli,
    piano_studio: studio,
    competenza_globale: stato.casi_totali > 0 ? stato.casi_corretti / stato.casi_totali : 0,
    drift_rilevato: detectDrift()
  };
}

// --- Helper: trova livello curriculum rilevante per un'area ---
function trovaLivelloPerArea(livelli, area) {
  if (!livelli || livelli.length === 0) return null;

  var areaLower = area.toLowerCase();

  for (var i = 0; i < livelli.length; i++) {
    var l = livelli[i];

    // Cerca nei concetti
    var concetti = l.concetti || [];
    for (var c = 0; c < concetti.length; c++) {
      if (concetti[c].nome.toLowerCase().indexOf(areaLower) >= 0 ||
          areaLower.indexOf(concetti[c].nome.toLowerCase()) >= 0) {
        return l;
      }
    }

    // Cerca nei guasti
    var guasti = l.guasti || [];
    for (var g = 0; g < guasti.length; g++) {
      if (guasti[g].nome.toLowerCase().indexOf(areaLower) >= 0 ||
          areaLower.indexOf(guasti[g].nome.toLowerCase()) >= 0) {
        return l;
      }
    }

    // Cerca nei componenti
    var componenti = l.componenti || [];
    for (var p = 0; p < componenti.length; p++) {
      if (componenti[p].nome.toLowerCase().indexOf(areaLower) >= 0 ||
          areaLower.indexOf(componenti[p].nome.toLowerCase()) >= 0) {
        return l;
      }
    }

    // Cerca nel nome del livello
    if (l.nome.toLowerCase().indexOf(areaLower) >= 0) {
      return l;
    }
  }

  return null;
}

// ============================================================================
// ESEGUI AUTO-STUDIO — Studia i livelli indicati dal curriculum
// ============================================================================

function eseguiAutoStudio(pianostudio) {
  if (!pianostudio || pianostudio.length === 0) return { studiati: 0 };

  var StudyEngine;
  try {
    StudyEngine = require("./study_engine");
  } catch(e) {
    return { studiati: 0, errore: "study_engine non disponibile" };
  }

  var curriculum;
  try {
    curriculum = require("./curriculum");
  } catch(e) {
    return { studiati: 0, errore: "curriculum non disponibile" };
  }

  var studiati = 0;

  for (var i = 0; i < pianostudio.length; i++) {
    var task = pianostudio[i];
    if (!task.livello) continue;

    // Trova il livello nel curriculum
    var livello = null;
    for (var j = 0; j < curriculum.LIVELLI.length; j++) {
      if (curriculum.LIVELLI[j].id === task.livello) {
        livello = curriculum.LIVELLI[j];
        break;
      }
    }

    if (livello) {
      StudyEngine.studiaLivello(livello);
      studiati++;
    }
  }

  return { studiati: studiati };
}

// ============================================================================
// CICLO EVOLUTIVO COMPLETO — Orchestratore
// ============================================================================

function cicloEvolutivo(caseState, diagnosi, esitoReale) {
  // 1. Self-review: analizza il risultato
  var review = selfReview(caseState, diagnosi, esitoReale);

  // 2. Evolve knowledge: applica le correzioni
  var evoluzione = evolveKnowledge(review);

  // 3. Propagazione per analogia (se corretto, diffondi la conoscenza)
  var analogia = null;
  if (review.tipo === TIPI_ERRORE.CORRETTO) {
    analogia = propagaAnalogia(review);
    if (analogia.propagazioni > 0) registraStrategia("propagazione_analogia");
  }

  // 4. Auto-studio se serve (solo su errori gravi)
  var studioResult = null;
  if (review.tipo === TIPI_ERRORE.CONOSCENZA_MANCANTE ||
      review.tipo === TIPI_ERRORE.FALSO_NEGATIVO) {
    var piano = buildCurriculum();
    if (piano.piano_studio.length > 0) {
      studioResult = eseguiAutoStudio(piano.piano_studio.slice(0, 3));
      registraStrategia("studio_livello");
    }
  }

  // 5. Registra strategie usate per meta-apprendimento
  if (evoluzione.archi_rinforzati > 0) registraStrategia("rinforzo_archi");
  if (evoluzione.nodi_creati > 0) registraStrategia("creazione_nodi");
  if (evoluzione.parole_aggiunte > 0) registraStrategia("espansione_vocabolario");

  // 6. Verifica efficacia strategie precedenti
  verificaEfficacia();

  // 7. Registra pendente per meta-apprendimento
  var causaReale = review.dettaglio ? review.dettaglio.causa_reale : null;
  if (causaReale && evoluzione.evolved) {
    var compPre = stato.competenza[causaReale];
    metaApprendimento.pendenti.push({
      area: causaReale,
      strategia: evoluzione.nodi_creati > 0 ? "creazione_nodi" : "rinforzo_archi",
      casi_al_momento: stato.casi_totali,
      accuratezza_pre: compPre ? (compPre.casi > 0 ? compPre.corretti / compPre.casi : 0) : 0
    });
    // Limita pendenti
    if (metaApprendimento.pendenti.length > 100) {
      metaApprendimento.pendenti = metaApprendimento.pendenti.slice(-100);
    }
  }

  // 8. Consolidamento ciclico se necessario
  var consolidamento = null;
  if (stato.casi_totali > 0 && stato.casi_totali % CONSOLIDAMENTO_OGNI === 0) {
    consolidamento = consolidamentoCiclico();
  }

  // 9. Drift detection
  var drift = detectDrift();

  return {
    review: review,
    evoluzione: evoluzione,
    analogia: analogia,
    studio: studioResult,
    consolidamento: consolidamento,
    drift: drift,
    meta: getMetaApprendimento(),
    stato: getStatoSintetico()
  };
}

// ============================================================================
// CONSOLIDAMENTO CICLICO — Ogni N casi, riflessione profonda
// ============================================================================

function consolidamentoCiclico() {
  var risultato = {
    timestamp: Date.now(),
    casi_analizzati: stato.casi_totali,
    azioni: []
  };

  // 1. Consolida knowledge graph
  try {
    var kgConsolidamento = nk.consolidaConoscenza();
    risultato.azioni.push({
      modulo: "knowledge",
      tipo: "consolidamento",
      dettaglio: kgConsolidamento
    });
  } catch(e) { /* ignore */ }

  // 2. Consolida memoria episodica → semantica
  try {
    var memConsolidamento = nm.consolida();
    risultato.azioni.push({
      modulo: "memory",
      tipo: "consolidamento",
      dettaglio: memConsolidamento
    });
  } catch(e) { /* ignore */ }

  // 3. Decadimento memoria vecchia
  try {
    var decadimento = nm.decadimento();
    risultato.azioni.push({
      modulo: "memory",
      tipo: "decadimento",
      dettaglio: decadimento
    });
  } catch(e) { /* ignore */ }

  // 4. Ricalibra confidenza
  aggiornaCalibrazione();
  risultato.azioni.push({
    modulo: "calibrazione",
    tipo: "aggiornamento",
    dettaglio: {
      accuratezza: stato.calibrazione.accuratezza_media,
      sovraconfidente: stato.calibrazione.sovraconfidente,
      sottoconfidente: stato.calibrazione.sottoconfidente
    }
  });

  // 5. Identifica aree deboli e genera piano
  var piano = buildCurriculum();
  if (piano.piano_studio.length > 0) {
    risultato.azioni.push({
      modulo: "auto_studio",
      tipo: "piano_generato",
      dettaglio: { studi_pianificati: piano.piano_studio.length }
    });
    // Esegui studio sulle prime 2 aree più deboli
    eseguiAutoStudio(piano.piano_studio.slice(0, 2));
  }

  // 6. Report
  risultato.report = {
    accuratezza_globale: stato.casi_totali > 0 ? stato.casi_corretti / stato.casi_totali : 0,
    aree_deboli: piano.aree_deboli.length,
    lacune: piano.lacune.length,
    drift: detectDrift(),
    prossimo_consolidamento: stato.casi_totali + CONSOLIDAMENTO_OGNI
  };

  stato.ultimo_consolidamento = Date.now();

  return risultato;
}

// ============================================================================
// DRIFT DETECTION — Sta peggiorando?
// ============================================================================

function detectDrift() {
  var finestra = stato.drift.finestra;
  if (finestra.length < 5) return { rilevato: false, campioni: finestra.length };

  var somma = 0;
  for (var i = 0; i < finestra.length; i++) somma += finestra[i];
  var accuratezza = somma / finestra.length;

  var globale = stato.casi_totali > 0 ? stato.casi_corretti / stato.casi_totali : 0;

  return {
    rilevato: accuratezza < stato.drift.soglia_allarme,
    accuratezza_recente: accuratezza,
    accuratezza_globale: globale,
    delta: accuratezza - globale,
    campioni: finestra.length
  };
}

// ============================================================================
// CALIBRAZIONE CONFIDENZA
// ============================================================================

function aggiornaCalibrazione() {
  var pred = stato.calibrazione.predizioni;
  if (pred.length < 5) return;

  // Calcola accuratezza reale
  var corretti = 0;
  var confidenzaMedia = 0;
  for (var i = 0; i < pred.length; i++) {
    if (pred[i].corretto) corretti++;
    confidenzaMedia += pred[i].confidenza;
  }

  var accuratezza = corretti / pred.length;
  confidenzaMedia = confidenzaMedia / pred.length;

  stato.calibrazione.accuratezza_media = accuratezza;
  stato.calibrazione.sovraconfidente = confidenzaMedia > accuratezza + 0.15;
  stato.calibrazione.sottoconfidente = confidenzaMedia < accuratezza - 0.15;
}

// ============================================================================
// COMPETENZA TRACKING
// ============================================================================

function aggiornaCompetenza(causa, tipo, dominio) {
  // Per causa
  if (!stato.competenza[causa]) {
    stato.competenza[causa] = { casi: 0, corretti: 0, ultimo: 0 };
  }
  stato.competenza[causa].casi++;
  if (tipo === TIPI_ERRORE.CORRETTO) stato.competenza[causa].corretti++;
  stato.competenza[causa].ultimo = Date.now();

  // Per dominio
  var chiaveDominio = "dominio:" + dominio;
  if (!stato.competenza[chiaveDominio]) {
    stato.competenza[chiaveDominio] = { casi: 0, corretti: 0, ultimo: 0 };
  }
  stato.competenza[chiaveDominio].casi++;
  if (tipo === TIPI_ERRORE.CORRETTO) stato.competenza[chiaveDominio].corretti++;
  stato.competenza[chiaveDominio].ultimo = Date.now();
}

function getCompetenza() {
  var risultato = {};
  var keys = Object.keys(stato.competenza);
  for (var i = 0; i < keys.length; i++) {
    var c = stato.competenza[keys[i]];
    risultato[keys[i]] = {
      casi: c.casi,
      corretti: c.corretti,
      accuratezza: c.casi > 0 ? c.corretti / c.casi : 0,
      ultimo: c.ultimo
    };
  }
  return risultato;
}

// ============================================================================
// ANALOGIA TRASVERSALE — Impara da un dominio, applica a un altro
// Se ROCCO impara che "connessione lenta → surriscaldamento" su un contattore,
// deve capire che lo stesso vale per un morsetto, un fusibile, una sbarra.
// ============================================================================

function propagaAnalogia(review) {
  if (review.tipo !== TIPI_ERRORE.CORRETTO) return { propagazioni: 0 };

  var causaReale = review.dettaglio.causa_reale;
  var nodo = nk.trovaNodoPerNome(causaReale);
  if (!nodo) return { propagazioni: 0 };

  // Cerca nodi simili nel KG (cosine similarity > 0.7)
  var simili = nk.cercaPerSimilarita(nodo.embedding, 10);
  var propagazioni = 0;

  for (var i = 0; i < simili.length; i++) {
    if (simili[i].similarity < 0.7) continue;
    if (simili[i].id === nodo.id) continue;

    // Propaga gli archi del nodo corretto ai nodi simili (con peso ridotto)
    var archiOrigine = nk.trovaArchi(nodo.id, "uscenti");
    for (var j = 0; j < archiOrigine.length; j++) {
      var arco = archiOrigine[j];
      // Crea arco analogo con peso proporzionale alla similarità
      var pesoAnalogo = arco.peso * simili[i].similarity * 0.5;
      if (pesoAnalogo > 0.1) {
        nk.aggiungiArco(simili[i].id, arco.a, arco.relazione, pesoAnalogo);
        propagazioni++;
      }
    }
  }

  return { propagazioni: propagazioni };
}

// ============================================================================
// META-APPRENDIMENTO — ROCCO impara COME impara meglio
// Traccia quali strategie di apprendimento funzionano e quali no.
// ============================================================================

var metaApprendimento = {
  strategie: {
    rinforzo_archi: { usate: 0, efficaci: 0 },
    creazione_nodi: { usate: 0, efficaci: 0 },
    studio_livello: { usate: 0, efficaci: 0 },
    propagazione_analogia: { usate: 0, efficaci: 0 },
    espansione_vocabolario: { usate: 0, efficaci: 0 }
  },
  // Traccia: dopo un'evoluzione, la performance su quell'area è migliorata?
  pendenti: []   // [{area, strategia, timestamp, accuratezza_pre}]
};

function registraStrategia(strategia) {
  if (metaApprendimento.strategie[strategia]) {
    metaApprendimento.strategie[strategia].usate++;
  }
}

function verificaEfficacia() {
  // Controlla le strategie pendenti: se l'accuratezza sull'area è migliorata
  var nuoviPendenti = [];
  for (var i = 0; i < metaApprendimento.pendenti.length; i++) {
    var p = metaApprendimento.pendenti[i];
    // Se sono passati almeno 5 casi dall'applicazione
    if (stato.casi_totali - p.casi_al_momento < 5) {
      nuoviPendenti.push(p);
      continue;
    }

    var comp = stato.competenza[p.area];
    if (comp) {
      var accuratezzaPost = comp.casi > 0 ? comp.corretti / comp.casi : 0;
      if (accuratezzaPost > p.accuratezza_pre) {
        // La strategia ha funzionato
        if (metaApprendimento.strategie[p.strategia]) {
          metaApprendimento.strategie[p.strategia].efficaci++;
        }
      }
    }
  }
  metaApprendimento.pendenti = nuoviPendenti;
}

function getMetaApprendimento() {
  var risultato = {};
  var keys = Object.keys(metaApprendimento.strategie);
  for (var i = 0; i < keys.length; i++) {
    var s = metaApprendimento.strategie[keys[i]];
    risultato[keys[i]] = {
      usate: s.usate,
      efficaci: s.efficaci,
      tasso_efficacia: s.usate > 0 ? s.efficaci / s.usate : 0
    };
  }
  return risultato;
}

// ============================================================================
// AUTO-GENERAZIONE IPOTESI — Quando ROCCO non conosce una causa,
// prova a GENERARLA per analogia dal knowledge graph
// ============================================================================

function generaIpotesiPerAnalogia(caseState) {
  var testo = caseState.problem_summary || "";
  var embedding = nl.embeddingFrase(testo);
  var ipotesiGenerate = [];

  // 1. Cerca nodi KG simili al testo del problema
  var nodiSimili = nk.cercaPerSimilarita(embedding, 10);

  for (var i = 0; i < nodiSimili.length; i++) {
    var nodo = nodiSimili[i].nodo;
    if (nodiSimili[i].similarity < 0.3) continue;

    // 2. Segui gli archi "causa" da ciascun nodo simile
    var archiCausa = nk.trovaArchi(nodo.id, "entranti", "causa");
    for (var j = 0; j < archiCausa.length; j++) {
      var causaNodo = nk.trovaNodo(archiCausa[j].da);
      if (causaNodo && causaNodo.tipo === "causa") {
        // 3. Controlla se questa causa non è già nelle ipotesi note
        var giaNota = false;
        for (var k = 0; k < ipotesiGenerate.length; k++) {
          if (ipotesiGenerate[k].nome === causaNodo.nome) {
            giaNota = true;
            break;
          }
        }
        if (!giaNota) {
          ipotesiGenerate.push({
            nome: causaNodo.nome,
            origine: "analogia_kg",
            confidenza: nodiSimili[i].similarity * archiCausa[j].peso,
            via: nodo.nome
          });
        }
      }
    }

    // 3. Segui anche gli archi "manifesta" (invertiti)
    var archiManifesta = nk.trovaArchi(nodo.id, "entranti", "manifesta");
    for (var m = 0; m < archiManifesta.length; m++) {
      var manifestaNodo = nk.trovaNodo(archiManifesta[m].da);
      if (manifestaNodo && manifestaNodo.tipo === "causa") {
        var giaNotaM = false;
        for (var n = 0; n < ipotesiGenerate.length; n++) {
          if (ipotesiGenerate[n].nome === manifestaNodo.nome) { giaNotaM = true; break; }
        }
        if (!giaNotaM) {
          ipotesiGenerate.push({
            nome: manifestaNodo.nome,
            origine: "analogia_kg",
            confidenza: nodiSimili[i].similarity * archiManifesta[m].peso * 0.8,
            via: nodo.nome
          });
        }
      }
    }
  }

  // 4. Ordina per confidenza e taglia
  ipotesiGenerate.sort(function(a, b) { return b.confidenza - a.confidenza; });
  return ipotesiGenerate.slice(0, 5);
}

// ============================================================================
// INTROSPEZIONE — ROCCO sa cosa sa e cosa non sa
// Genera un report completo sullo stato cognitivo
// ============================================================================

function introspezione() {
  var kgStats = nk.getStats();
  var langStats = nl.getStats();
  var memStats = nm.stats();
  var patStats = np.getStats();
  var piano = buildCurriculum();
  var drift = detectDrift();
  var meta = getMetaApprendimento();

  // Punti di forza: aree con accuratezza > 80% e almeno 5 casi
  var puntiForza = [];
  var puntiDeboli = [];
  var keys = Object.keys(stato.competenza);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf("dominio:") === 0) continue; // skip domini
    var c = stato.competenza[keys[i]];
    var acc = c.casi > 0 ? c.corretti / c.casi : 0;
    if (c.casi >= 5 && acc >= 0.8) {
      puntiForza.push({ area: keys[i], accuratezza: acc, casi: c.casi });
    } else if (c.casi >= 3 && acc < 0.5) {
      puntiDeboli.push({ area: keys[i], accuratezza: acc, casi: c.casi });
    }
  }

  return {
    // Identità cognitiva
    esperienza: {
      casi_totali: stato.casi_totali,
      accuratezza_globale: stato.casi_totali > 0 ? stato.casi_corretti / stato.casi_totali : 0,
      aree_conosciute: keys.filter(function(k) { return k.indexOf("dominio:") !== 0; }).length
    },
    // Conoscenza
    conoscenza: {
      nodi_kg: kgStats.totalNodi,
      archi_kg: kgStats.totalArchi,
      vocabolario: langStats.vocabolarioSize,
      episodi_memoria: memStats.episodi_totali,
      pattern_semantici: memStats.semantici_totali
    },
    // Autoconsapevolezza
    autoconsapevolezza: {
      punti_forza: puntiForza,
      punti_deboli: puntiDeboli,
      lacune: piano.lacune,
      drift: drift,
      calibrazione: {
        sovraconfidente: stato.calibrazione.sovraconfidente,
        sottoconfidente: stato.calibrazione.sottoconfidente,
        accuratezza_reale: stato.calibrazione.accuratezza_media
      }
    },
    // Meta-apprendimento
    meta_apprendimento: meta,
    // Piano di crescita
    piano_crescita: piano.piano_studio.slice(0, 5)
  };
}

// ============================================================================
// UTILITY
// ============================================================================

function matchCausa(a, b) {
  if (!a || !b) return false;
  var al = a.toLowerCase().trim();
  var bl = b.toLowerCase().trim();
  if (al === bl) return true;
  // Match parziale: una contiene l'altra
  if (al.indexOf(bl) >= 0 || bl.indexOf(al) >= 0) return true;
  // Match normalizzato: rimuovi spazi/underscore
  var aNorm = al.replace(/[\s_-]+/g, "");
  var bNorm = bl.replace(/[\s_-]+/g, "");
  return aNorm === bNorm;
}

function getStatoSintetico() {
  return {
    casi_totali: stato.casi_totali,
    casi_corretti: stato.casi_corretti,
    casi_errati: stato.casi_errati,
    accuratezza: stato.casi_totali > 0 ? stato.casi_corretti / stato.casi_totali : 0,
    evoluzioni: stato.evoluzioni_eseguite,
    auto_studi: stato.auto_studi_generati,
    calibrazione: {
      accuratezza: stato.calibrazione.accuratezza_media,
      sovraconfidente: stato.calibrazione.sovraconfidente,
      sottoconfidente: stato.calibrazione.sottoconfidente
    },
    aree_competenza: Object.keys(stato.competenza).length,
    drift: detectDrift()
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

function salva() {
  var data = JSON.parse(JSON.stringify(stato));
  data.meta_apprendimento = JSON.parse(JSON.stringify(metaApprendimento));
  return data;
}

function carica(data) {
  if (!data) return;
  stato.competenza = data.competenza || {};
  stato.storico_review = data.storico_review || [];
  stato.calibrazione = data.calibrazione || stato.calibrazione;
  stato.casi_totali = data.casi_totali || 0;
  stato.casi_corretti = data.casi_corretti || 0;
  stato.casi_errati = data.casi_errati || 0;
  stato.evoluzioni_eseguite = data.evoluzioni_eseguite || 0;
  stato.auto_studi_generati = data.auto_studi_generati || 0;
  stato.ultimo_consolidamento = data.ultimo_consolidamento || 0;
  if (data.drift) {
    stato.drift.finestra = data.drift.finestra || [];
  }
  if (data.meta_apprendimento) {
    metaApprendimento.strategie = data.meta_apprendimento.strategie || metaApprendimento.strategie;
    metaApprendimento.pendenti = data.meta_apprendimento.pendenti || [];
  }
}

function reset() {
  stato.competenza = {};
  stato.storico_review = [];
  stato.calibrazione = {
    predizioni: [],
    accuratezza_media: 0,
    sovraconfidente: false,
    sottoconfidente: false
  };
  stato.casi_totali = 0;
  stato.casi_corretti = 0;
  stato.casi_errati = 0;
  stato.evoluzioni_eseguite = 0;
  stato.auto_studi_generati = 0;
  stato.ultimo_consolidamento = 0;
  stato.drift.finestra = [];
  metaApprendimento.strategie = {
    rinforzo_archi: { usate: 0, efficaci: 0 },
    creazione_nodi: { usate: 0, efficaci: 0 },
    studio_livello: { usate: 0, efficaci: 0 },
    propagazione_analogia: { usate: 0, efficaci: 0 },
    espansione_vocabolario: { usate: 0, efficaci: 0 }
  };
  metaApprendimento.pendenti = [];
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Core 3 functions
  selfReview: selfReview,
  evolveKnowledge: evolveKnowledge,
  buildCurriculum: buildCurriculum,
  // Orchestrator
  cicloEvolutivo: cicloEvolutivo,
  eseguiAutoStudio: eseguiAutoStudio,
  // Advanced
  propagaAnalogia: propagaAnalogia,
  generaIpotesiPerAnalogia: generaIpotesiPerAnalogia,
  introspezione: introspezione,
  getMetaApprendimento: getMetaApprendimento,
  // Consolidamento
  consolidamentoCiclico: consolidamentoCiclico,
  // Detection
  detectDrift: detectDrift,
  // Competence
  getCompetenza: getCompetenza,
  // State
  getStato: getStatoSintetico,
  // Persistence
  salva: salva,
  carica: carica,
  reset: reset,
  // Constants (for testing)
  TIPI_ERRORE: TIPI_ERRORE
};
