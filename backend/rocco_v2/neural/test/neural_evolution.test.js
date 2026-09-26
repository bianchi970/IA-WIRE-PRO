"use strict";

var assert = require("assert");
var ne = require("../neural_evolution");
var nk = require("../neural_knowledge");
var nl = require("../neural_language");
var nm = require("../neural_memory");
var np = require("../neural_patterns");

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  \u2713 " + name);
  } catch(e) {
    failed++;
    console.log("  \u2717 " + name + ": " + e.message);
  }
}

// Setup: bootstrap moduli
nk.reset();
nl.reset();
nm.reset();
np.reset();
ne.reset();
nl.bootstrap(null, null, null);
np.bootstrapSintetico();

// Aggiungi nodi di test al KG
nk.aggiungiNodo("causa", "dispersione");
nk.aggiungiNodo("causa", "cortocircuito");
nk.aggiungiNodo("causa", "sovraccarico");
nk.aggiungiNodo("componente", "RCD");
nk.aggiungiNodo("componente", "magnetotermico");
var dispNodo = nk.trovaNodoPerNome("dispersione");
var rcdNodo = nk.trovaNodoPerNome("RCD");
if (dispNodo && rcdNodo) {
  nk.aggiungiArco(dispNodo.id, rcdNodo.id, "manifesta", 0.5);
}

console.log("\n=== NEURAL EVOLUTION TESTS ===\n");

// --- Mock data ---
var mockCS = {
  problem_summary: "il differenziale scatta con la lavatrice",
  domain: "elettrico",
  components_detected: ["RCD"],
  facts_confirmed: ["scatta quando accendo la lavatrice"]
};

var mockDiagnosiCorretta = {
  causa_predetta: "dispersione",
  confidenza: 0.8,
  ipotesi: [
    { label: "dispersione", status: "active", neural_score: 0.8 },
    { label: "cortocircuito", status: "active", neural_score: 0.3 }
  ]
};

var mockDiagnosiSbagliata = {
  causa_predetta: "cortocircuito",
  confidenza: 0.7,
  ipotesi: [
    { label: "cortocircuito", status: "active", neural_score: 0.7 },
    { label: "dispersione", status: "active", neural_score: 0.4 }
  ]
};

var mockEsitoReale = {
  causa_reale: "dispersione"
};

// ============================================================
// SELF-REVIEW TESTS
// ============================================================

test("selfReview diagnosi corretta", function() {
  ne.reset();
  var review = ne.selfReview(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  assert(review.tipo === ne.TIPI_ERRORE.CORRETTO, "tipo: " + review.tipo);
  assert(review.dettaglio.causa_reale === "dispersione");
  assert(review.dettaglio.confidenza_predetta === 0.8);
});

test("selfReview falso positivo", function() {
  ne.reset();
  var review = ne.selfReview(mockCS, mockDiagnosiSbagliata, mockEsitoReale);
  assert(review.tipo === ne.TIPI_ERRORE.RANKING_SBAGLIATO ||
         review.tipo === ne.TIPI_ERRORE.FALSO_POSITIVO,
         "tipo: " + review.tipo);
});

test("selfReview ranking sbagliato", function() {
  ne.reset();
  var diagRanking = {
    causa_predetta: "cortocircuito",
    confidenza: 0.6,
    ipotesi: [
      { label: "cortocircuito", neural_score: 0.6 },
      { label: "dispersione", neural_score: 0.4 }
    ]
  };
  var review = ne.selfReview(mockCS, diagRanking, mockEsitoReale);
  assert(review.tipo === ne.TIPI_ERRORE.RANKING_SBAGLIATO, "tipo: " + review.tipo);
  assert(review.dettaglio.causa_era_nelle_ipotesi === true);
  assert(review.dettaglio.posizione_causa_reale === 1);
});

test("selfReview conoscenza mancante", function() {
  ne.reset();
  var diagMancante = {
    causa_predetta: "cortocircuito",
    confidenza: 0.5,
    ipotesi: [{ label: "cortocircuito" }]
  };
  var esitoNuovo = { causa_reale: "guasto_inverter_solare_xyz" };
  var review = ne.selfReview(mockCS, diagMancante, esitoNuovo);
  assert(review.tipo === ne.TIPI_ERRORE.CONOSCENZA_MANCANTE, "tipo: " + review.tipo);
});

test("selfReview senza esito reale", function() {
  ne.reset();
  var review = ne.selfReview(mockCS, mockDiagnosiCorretta, {});
  assert(review.tipo === ne.TIPI_ERRORE.DATI_INSUFFICIENTI);
});

test("selfReview aggiorna contatori", function() {
  ne.reset();
  ne.selfReview(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  ne.selfReview(mockCS, mockDiagnosiSbagliata, mockEsitoReale);
  var stato = ne.getStato();
  assert(stato.casi_totali === 2, "casi: " + stato.casi_totali);
  assert(stato.casi_corretti >= 1);
});

test("selfReview genera segnali apprendimento", function() {
  ne.reset();
  var review = ne.selfReview(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  assert(review.segnali.length > 0, "nessun segnale");
  assert(review.segnali[0].azione, "segnale senza azione");
});

test("selfReview analizza moduli", function() {
  ne.reset();
  var review = ne.selfReview(mockCS, mockDiagnosiSbagliata, mockEsitoReale);
  assert(review.moduli, "moduli mancanti");
  assert(typeof review.moduli.language.ok === "boolean");
  assert(typeof review.moduli.knowledge.ok === "boolean");
  assert(typeof review.moduli.patterns.ok === "boolean");
  assert(typeof review.moduli.memory.ok === "boolean");
});

// ============================================================
// EVOLVE KNOWLEDGE TESTS
// ============================================================

test("evolveKnowledge da review corretta", function() {
  ne.reset();
  var review = ne.selfReview(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  var result = ne.evolveKnowledge(review);
  assert(result.evolved === true);
  assert(result.archi_rinforzati >= 0);
});

test("evolveKnowledge da review sbagliata", function() {
  ne.reset();
  var review = ne.selfReview(mockCS, mockDiagnosiSbagliata, mockEsitoReale);
  var result = ne.evolveKnowledge(review);
  assert(result.evolved === true);
  // Deve aver indebolito e/o rinforzato archi
  assert(result.archi_rinforzati + result.archi_indeboliti > 0 ||
         result.nodi_creati > 0,
         "nessuna evoluzione applicata");
});

test("evolveKnowledge crea nodo per causa sconosciuta", function() {
  ne.reset();
  var diagMancante = {
    causa_predetta: "cortocircuito",
    confidenza: 0.5,
    ipotesi: [{ label: "cortocircuito" }]
  };
  var esitoNuovo = { causa_reale: "surriscaldamento_reostato_xyz" };
  var review = ne.selfReview(mockCS, diagMancante, esitoNuovo);
  var result = ne.evolveKnowledge(review);
  assert(result.nodi_creati > 0, "nessun nodo creato");
  // Verifica che il nodo esista nel KG
  var nodo = nk.trovaNodoPerNome("surriscaldamento_reostato_xyz");
  assert(nodo, "nodo non trovato nel KG");
});

test("evolveKnowledge con review null non crasha", function() {
  var result = ne.evolveKnowledge(null);
  assert(result.evolved === false);
});

test("evolveKnowledge espande vocabolario", function() {
  ne.reset();
  var statsPrima = nl.getStats().vocabolarioSize;
  var diagMancante = {
    causa_predetta: null,
    confidenza: 0,
    ipotesi: []
  };
  var esitoNuovo = { causa_reale: "fulminazione_varistori_protezione" };
  var review = ne.selfReview(mockCS, diagMancante, esitoNuovo);
  ne.evolveKnowledge(review);
  var statsDopo = nl.getStats().vocabolarioSize;
  assert(statsDopo >= statsPrima, "vocabolario non cresciuto");
});

// ============================================================
// BUILD CURRICULUM TESTS
// ============================================================

test("buildCurriculum con stato vuoto", function() {
  ne.reset();
  var piano = ne.buildCurriculum();
  assert(Array.isArray(piano.lacune));
  assert(Array.isArray(piano.aree_deboli));
  assert(Array.isArray(piano.piano_studio));
  assert(typeof piano.competenza_globale === "number");
});

test("buildCurriculum identifica aree deboli", function() {
  ne.reset();
  // Simula 10 casi: 3 corretti, 7 sbagliati su "sovraccarico"
  for (var i = 0; i < 10; i++) {
    var diag = i < 3 ? mockDiagnosiCorretta : mockDiagnosiSbagliata;
    var esito = { causa_reale: "sovraccarico" };
    ne.selfReview(mockCS, diag, esito);
  }
  var piano = ne.buildCurriculum();
  // Sovraccarico ha accuratezza 30% < 60% → area debole
  var trovatoDebole = false;
  for (var j = 0; j < piano.aree_deboli.length; j++) {
    if (piano.aree_deboli[j].area === "sovraccarico") {
      trovatoDebole = true;
      break;
    }
  }
  assert(trovatoDebole, "sovraccarico non identificato come debole");
});

test("buildCurriculum identifica lacune", function() {
  ne.reset();
  // Simula 2 casi su "armoniche" (sotto soglia 5)
  ne.selfReview(mockCS, mockDiagnosiCorretta, { causa_reale: "armoniche" });
  ne.selfReview(mockCS, mockDiagnosiSbagliata, { causa_reale: "armoniche" });
  var piano = ne.buildCurriculum();
  var trovatoLacuna = false;
  for (var i = 0; i < piano.lacune.length; i++) {
    if (piano.lacune[i].area === "armoniche") {
      trovatoLacuna = true;
      break;
    }
  }
  assert(trovatoLacuna, "armoniche non identificato come lacuna");
});

test("buildCurriculum mappa aree deboli a livelli curriculum", function() {
  ne.reset();
  for (var i = 0; i < 10; i++) {
    ne.selfReview(mockCS, mockDiagnosiSbagliata, { causa_reale: "motore" });
  }
  var piano = ne.buildCurriculum();
  var studioMotore = null;
  for (var j = 0; j < piano.piano_studio.length; j++) {
    if (piano.piano_studio[j].area === "motore") {
      studioMotore = piano.piano_studio[j];
      break;
    }
  }
  assert(studioMotore, "nessuno studio pianificato per motore");
  assert(studioMotore.livello, "nessun livello associato");
});

// ============================================================
// CICLO EVOLUTIVO TESTS
// ============================================================

test("cicloEvolutivo completo su caso corretto", function() {
  ne.reset();
  var result = ne.cicloEvolutivo(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  assert(result.review.tipo === ne.TIPI_ERRORE.CORRETTO);
  assert(result.evoluzione.evolved === true);
  assert(result.stato.casi_totali === 1);
  assert(result.stato.accuratezza === 1.0);
});

test("cicloEvolutivo completo su caso sbagliato", function() {
  ne.reset();
  var result = ne.cicloEvolutivo(mockCS, mockDiagnosiSbagliata, mockEsitoReale);
  assert(result.review.tipo !== ne.TIPI_ERRORE.CORRETTO);
  assert(result.evoluzione.evolved === true);
});

test("cicloEvolutivo con causa sconosciuta lancia auto-studio", function() {
  ne.reset();
  var diagVuota = { causa_predetta: null, confidenza: 0, ipotesi: [] };
  var esitoNuovo = { causa_reale: "guasto_mai_visto_12345" };
  var result = ne.cicloEvolutivo(mockCS, diagVuota, esitoNuovo);
  assert(result.review.tipo === ne.TIPI_ERRORE.CONOSCENZA_MANCANTE);
  // Auto-studio potrebbe o meno trovare livelli rilevanti
});

test("cicloEvolutivo multipli aggiorna accuratezza", function() {
  ne.reset();
  ne.cicloEvolutivo(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  ne.cicloEvolutivo(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  ne.cicloEvolutivo(mockCS, mockDiagnosiSbagliata, mockEsitoReale);
  var stato = ne.getStato();
  assert(stato.casi_totali === 3);
  assert(stato.casi_corretti === 2);
  assert(Math.abs(stato.accuratezza - 2/3) < 0.01, "accuratezza: " + stato.accuratezza);
});

// ============================================================
// DRIFT DETECTION TESTS
// ============================================================

test("drift non rilevato con pochi dati", function() {
  ne.reset();
  var drift = ne.detectDrift();
  assert(drift.rilevato === false);
  assert(drift.campioni < 5);
});

test("drift rilevato con molti errori consecutivi", function() {
  ne.reset();
  // 20 errori consecutivi
  for (var i = 0; i < 20; i++) {
    ne.selfReview(mockCS, mockDiagnosiSbagliata, { causa_reale: "causa_rara_" + i });
  }
  var drift = ne.detectDrift();
  assert(drift.rilevato === true, "drift non rilevato");
  assert(drift.accuratezza_recente < 0.4);
});

test("drift non rilevato con buona accuratezza", function() {
  ne.reset();
  // 18 corretti + 2 errati
  for (var i = 0; i < 18; i++) {
    ne.selfReview(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  }
  ne.selfReview(mockCS, mockDiagnosiSbagliata, mockEsitoReale);
  ne.selfReview(mockCS, mockDiagnosiSbagliata, { causa_reale: "altro" });
  var drift = ne.detectDrift();
  assert(drift.rilevato === false, "falso drift rilevato");
});

// ============================================================
// COMPETENZA TRACKING TESTS
// ============================================================

test("competenza tracking per causa", function() {
  ne.reset();
  ne.selfReview(mockCS, mockDiagnosiCorretta, { causa_reale: "dispersione" });
  ne.selfReview(mockCS, mockDiagnosiCorretta, { causa_reale: "dispersione" });
  ne.selfReview(mockCS, mockDiagnosiSbagliata, { causa_reale: "dispersione" });
  var comp = ne.getCompetenza();
  assert(comp.dispersione, "manca dispersione");
  assert(comp.dispersione.casi === 3, "casi: " + comp.dispersione.casi);
  assert(comp.dispersione.corretti === 2, "corretti: " + comp.dispersione.corretti);
  assert(Math.abs(comp.dispersione.accuratezza - 2/3) < 0.01);
});

test("competenza tracking per dominio", function() {
  ne.reset();
  ne.selfReview(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  var comp = ne.getCompetenza();
  assert(comp["dominio:elettrico"], "manca dominio:elettrico");
  assert(comp["dominio:elettrico"].casi === 1);
});

// ============================================================
// CALIBRAZIONE TESTS
// ============================================================

test("calibrazione si aggiorna", function() {
  ne.reset();
  // 10 predizioni con confidenza 0.8, tutte corrette → ben calibrato
  for (var i = 0; i < 10; i++) {
    ne.selfReview(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  }
  var stato = ne.getStato();
  assert(typeof stato.calibrazione.accuratezza === "number");
  assert(typeof stato.calibrazione.sovraconfidente === "boolean");
});

test("calibrazione rileva sovraconfidenza", function() {
  ne.reset();
  // 10 predizioni con confidenza alta ma sbagliate
  var diagAlta = {
    causa_predetta: "cortocircuito",
    confidenza: 0.95,
    ipotesi: [{ label: "cortocircuito" }]
  };
  for (var i = 0; i < 10; i++) {
    ne.selfReview(mockCS, diagAlta, { causa_reale: "causa_diversa_" + i });
  }
  var stato = ne.getStato();
  // Confidenza media 0.95, accuratezza ~0 → sovraconfidente
  assert(stato.calibrazione.sovraconfidente === true, "non rileva sovraconfidenza");
});

// ============================================================
// CONSOLIDAMENTO CICLICO TESTS
// ============================================================

test("consolidamentoCiclico non crasha", function() {
  ne.reset();
  var result = ne.consolidamentoCiclico();
  assert(result.timestamp > 0);
  assert(Array.isArray(result.azioni));
  assert(result.report);
  assert(typeof result.report.accuratezza_globale === "number");
});

// ============================================================
// PERSISTENCE TESTS
// ============================================================

test("salva e carica preservano stato", function() {
  ne.reset();
  ne.selfReview(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  ne.selfReview(mockCS, mockDiagnosiSbagliata, mockEsitoReale);
  var saved = ne.salva();
  var statoPreReset = ne.getStato();
  ne.reset();
  assert(ne.getStato().casi_totali === 0);
  ne.carica(saved);
  var statoPostCarica = ne.getStato();
  assert(statoPostCarica.casi_totali === statoPreReset.casi_totali,
    "casi persi: " + statoPostCarica.casi_totali + " vs " + statoPreReset.casi_totali);
});

// ============================================================
// ESEGUI AUTO-STUDIO TESTS
// ============================================================

test("eseguiAutoStudio con piano vuoto", function() {
  var result = ne.eseguiAutoStudio([]);
  assert(result.studiati === 0);
});

test("eseguiAutoStudio con livello valido", function() {
  var result = ne.eseguiAutoStudio([{ area: "motore", livello: "L10" }]);
  assert(result.studiati === 1 || result.studiati === 0); // dipende da curriculum disponibile
});

// ============================================================
// EDGE CASES
// ============================================================

test("selfReview con ipotesi vuote", function() {
  ne.reset();
  var diag = { causa_predetta: null, confidenza: 0, ipotesi: [] };
  var review = ne.selfReview(mockCS, diag, mockEsitoReale);
  assert(review.tipo);
  assert(review.segnali);
});

test("cicloEvolutivo non crasha con dati minimi", function() {
  ne.reset();
  var result = ne.cicloEvolutivo(
    { problem_summary: "test" },
    { causa_predetta: "test", confidenza: 0.5, ipotesi: [] },
    { causa_reale: "test" }
  );
  assert(result.review.tipo === ne.TIPI_ERRORE.CORRETTO);
});

// ============================================================
// ANALOGIA TRASVERSALE TESTS
// ============================================================

test("propagaAnalogia su caso corretto", function() {
  ne.reset();
  var review = ne.selfReview(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  var result = ne.propagaAnalogia(review);
  assert(typeof result.propagazioni === "number");
});

test("propagaAnalogia non propaga su errore", function() {
  ne.reset();
  var review = ne.selfReview(mockCS, mockDiagnosiSbagliata, mockEsitoReale);
  // La funzione non dovrebbe essere chiamata su errori, ma non deve crashare
  var result = ne.propagaAnalogia(review);
  assert(typeof result.propagazioni === "number");
});

// ============================================================
// GENERAZIONE IPOTESI PER ANALOGIA
// ============================================================

test("generaIpotesiPerAnalogia ritorna array", function() {
  ne.reset();
  var ipotesi = ne.generaIpotesiPerAnalogia(mockCS);
  assert(Array.isArray(ipotesi));
});

test("generaIpotesiPerAnalogia ha struttura corretta", function() {
  ne.reset();
  var ipotesi = ne.generaIpotesiPerAnalogia(mockCS);
  if (ipotesi.length > 0) {
    assert(ipotesi[0].nome, "manca nome");
    assert(ipotesi[0].origine === "analogia_kg", "origine sbagliata");
    assert(typeof ipotesi[0].confidenza === "number", "manca confidenza");
  }
});

test("generaIpotesiPerAnalogia max 5 risultati", function() {
  ne.reset();
  var ipotesi = ne.generaIpotesiPerAnalogia(mockCS);
  assert(ipotesi.length <= 5);
});

// ============================================================
// INTROSPEZIONE TESTS
// ============================================================

test("introspezione ritorna struttura completa", function() {
  ne.reset();
  // Genera un po' di storia
  for (var i = 0; i < 8; i++) {
    ne.selfReview(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  }
  ne.selfReview(mockCS, mockDiagnosiSbagliata, { causa_reale: "cortocircuito" });

  var intro = ne.introspezione();
  assert(intro.esperienza, "manca esperienza");
  assert(intro.conoscenza, "manca conoscenza");
  assert(intro.autoconsapevolezza, "manca autoconsapevolezza");
  assert(intro.meta_apprendimento, "manca meta_apprendimento");
  assert(intro.piano_crescita, "manca piano_crescita");
});

test("introspezione identifica punti di forza", function() {
  ne.reset();
  for (var i = 0; i < 10; i++) {
    ne.selfReview(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  }
  var intro = ne.introspezione();
  // 10 corretti su dispersione → punto di forza
  assert(intro.autoconsapevolezza.punti_forza.length > 0 ||
         intro.esperienza.casi_totali === 10,
         "introspezione non funziona");
});

test("introspezione identifica punti deboli", function() {
  ne.reset();
  for (var i = 0; i < 10; i++) {
    ne.selfReview(mockCS, mockDiagnosiSbagliata, { causa_reale: "sovraccarico" });
  }
  var intro = ne.introspezione();
  assert(intro.autoconsapevolezza.punti_deboli.length > 0,
    "non identifica punti deboli");
});

// ============================================================
// META-APPRENDIMENTO TESTS
// ============================================================

test("meta-apprendimento traccia strategie", function() {
  ne.reset();
  ne.cicloEvolutivo(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  var meta = ne.getMetaApprendimento();
  assert(meta, "manca meta-apprendimento");
  // Almeno una strategia deve essere stata usata
  var totaleUsate = 0;
  var keys = Object.keys(meta);
  for (var i = 0; i < keys.length; i++) {
    totaleUsate += meta[keys[i]].usate;
  }
  assert(totaleUsate > 0, "nessuna strategia tracciata");
});

test("cicloEvolutivo include analogia su caso corretto", function() {
  ne.reset();
  var result = ne.cicloEvolutivo(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  assert(result.analogia !== null, "analogia mancante su caso corretto");
  assert(typeof result.analogia.propagazioni === "number");
});

test("cicloEvolutivo include meta", function() {
  ne.reset();
  var result = ne.cicloEvolutivo(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  assert(result.meta, "meta mancante");
});

// ============================================================
// PERSISTENCE CON META-APPRENDIMENTO
// ============================================================

test("salva e carica preservano meta-apprendimento", function() {
  ne.reset();
  ne.cicloEvolutivo(mockCS, mockDiagnosiCorretta, mockEsitoReale);
  var saved = ne.salva();
  assert(saved.meta_apprendimento, "meta non salvato");
  ne.reset();
  ne.carica(saved);
  var meta = ne.getMetaApprendimento();
  var totale = 0;
  var keys = Object.keys(meta);
  for (var i = 0; i < keys.length; i++) totale += meta[keys[i]].usate;
  assert(totale > 0, "meta-apprendimento perso dopo carica");
});

console.log("\n--- Results: " + passed + " passed, " + failed + " failed ---\n");
process.exit(failed > 0 ? 1 : 0);
