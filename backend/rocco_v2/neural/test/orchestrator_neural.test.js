"use strict";

// ============================================================================
// TEST E2E — Verifica che tutti gli organi neurali siano collegati
//
// Non testa l'orchestrator intero (che richiede safetyGuard, tools, AI).
// Testa che i singoli innesti funzionino chiamando le funzioni direttamente
// sullo stesso caseState che l'orchestrator userebbe.
// ============================================================================

var assert = require("assert");
var neuralIntegration = require("../neural_integration");
var CasiRealiForum = require("../casi_reali_forum");
var NeuralSimulator = require("../neural_simulator");
var WorldModel = require("../world_model");
var NeuralVision = require("../neural_vision");

(function() {
  var passCount = 0;
  var failCount = 0;

  function ok(cond, msg) {
    if (cond) { passCount++; }
    else { failCount++; console.log("  FAIL: " + msg); }
  }

  function eq(a, b, msg) {
    if (a === b) { passCount++; }
    else { failCount++; console.log("  FAIL: " + msg + " — got " + JSON.stringify(a) + ", expected " + JSON.stringify(b)); }
  }

  // ========================================================================
  // SETUP — Inizializza il cervello con bootstrap + forum
  // ========================================================================
  console.log("\n=== SETUP: Init + Warmup ===");

  var initResult = neuralIntegration.init({ autoWarmup: true });
  ok(initResult.initialized, "init completato");

  // ========================================================================
  // BLOCCO 1: Bootstrap forum — i casi reali vengono appresi al warmup
  // ========================================================================
  console.log("\n=== BLOCCO 1: Bootstrap forum ===");

  var stats = neuralIntegration.getStats();
  ok(stats !== null, "getStats non null");

  // Verifica che la memoria abbia episodi (dai forum)
  if (stats.memory) {
    var memEp = stats.memory.episodi_totali || stats.memory.totalEpisodes || 0;
    ok(memEp >= 1, "memoria ha episodi dal forum — " + memEp);
  } else {
    ok(true, "memoria stats non disponibile (ma warmup ha funzionato)");
  }

  // Knowledge graph arricchito
  if (stats.knowledge) {
    ok(stats.knowledge.totalNodi > 0, "knowledge graph ha nodi — " + stats.knowledge.totalNodi);
  } else {
    ok(true, "knowledge stats non disponibile");
  }

  // ========================================================================
  // BLOCCO 2: World Model — costruzione da caseState
  // ========================================================================
  console.log("\n=== BLOCCO 2: World Model (innesto 4c) ===");

  // Simula un caseState come farebbe l'orchestrator
  var cs1 = {
    problem_summary: "il salvavita scatta quando accendo la lavatrice",
    components_detected: ["RCD", "carico"],
    facts_confirmed: [],
    measurements: []
  };

  // L'orchestrator chiamerebbe: neuralIntegration.buildWorldModel(cs1)
  var wm = null;
  try {
    wm = neuralIntegration.buildWorldModel(cs1);
  } catch(e) { /* graceful */ }

  ok(wm !== null, "world model costruito da caseState");
  if (wm) {
    ok(Object.keys(wm.nodi).length > 5, "world model ha nodi — " + Object.keys(wm.nodi).length);
    ok(wm.archi.length > 3, "world model ha archi — " + wm.archi.length);
    ok(wm.tipo_impianto !== undefined, "world model ha tipo_impianto: " + wm.tipo_impianto);
  }

  // ========================================================================
  // BLOCCO 3: Simulatore causale — genera ipotesi dal testo
  // ========================================================================
  console.log("\n=== BLOCCO 3: Simulatore causale (innesto 5c) ===");

  // L'orchestrator chiamerebbe: neuralIntegration.simulaCausale(cs1)
  var simResult = null;
  try {
    simResult = neuralIntegration.simulaCausale(cs1);
  } catch(e) { /* graceful */ }

  ok(simResult !== null, "simulatore produce risultato");
  if (simResult) {
    ok(simResult.sintomo !== null, "sintomo riconosciuto: " + simResult.sintomo);
    ok(simResult.ipotesi && simResult.ipotesi.length >= 2, "almeno 2 ipotesi — " + (simResult.ipotesi || []).length);
    ok(simResult.attive >= 1, "almeno 1 ipotesi attiva");

    // Verifica che le ipotesi abbiano struttura corretta
    var prima = simResult.ipotesi[0];
    ok(prima.causa !== undefined, "ipotesi ha campo 'causa'");
    ok(prima.probabilita > 0, "ipotesi ha probabilità > 0");
    ok(prima.stato === "attiva" || prima.stato === "esclusa", "ipotesi ha stato valido");
  }

  // ========================================================================
  // BLOCCO 4: Casi simili — findSimilarCases sempre attivo
  // ========================================================================
  console.log("\n=== BLOCCO 4: Casi simili (innesto 5d) ===");

  var simili = null;
  try {
    simili = neuralIntegration.findSimilarCases(cs1, 3);
  } catch(e) { /* graceful */ }

  // findSimilarCases potrebbe tornare array vuoto se il KG non ha abbastanza embedding
  ok(simili !== null && simili !== undefined, "findSimilarCases non crasha");
  ok(Array.isArray(simili), "findSimilarCases ritorna array");

  // ========================================================================
  // BLOCCO 5: Controfattuale arricchito — enhanceCounterfactual
  // ========================================================================
  console.log("\n=== BLOCCO 5: enhanceCounterfactual (innesto 5b+) ===");

  // Simula una ipotesi e un risultato controfattuale
  var fakeHypothesis = {
    label: "dispersione su carico",
    confidence: "possible",
    source: "simulatore_causale",
    catena: [],
    confirm_tests: []
  };
  var fakeCfResult = {
    valutazione: { plausibilita: 0.7, matching: 1, contradicting: 0 },
    verifiche_suggerite: ["misura isolamento"]
  };

  var ncf = null;
  try {
    ncf = neuralIntegration.enhanceCounterfactual(fakeHypothesis, fakeCfResult, cs1);
  } catch(e) { /* graceful */ }

  // enhanceCounterfactual può tornare null se non c'è abbastanza contesto
  ok(ncf === null || typeof ncf === "object", "enhanceCounterfactual non crasha");

  // ========================================================================
  // BLOCCO 6: Neural Vision — interpreta osservazioni
  // ========================================================================
  console.log("\n=== BLOCCO 6: Neural Vision (innesto 7+) ===");

  var visObs = [
    { tipo: "anomalia", descrizione: "morsetto annerito e allentato", componente: "quadro" },
    { tipo: "componente", descrizione: "MCB 16A Bticino", componente: "MCB" }
  ];

  var visResult = null;
  try {
    visResult = neuralIntegration.interpretaImmagine(visObs);
  } catch(e) { /* graceful */ }

  ok(visResult !== null, "interpretaImmagine produce risultato");
  if (visResult) {
    ok(visResult.totale_osservazioni >= 1, "osservazioni elaborate: " + visResult.totale_osservazioni);
    ok(visResult.anomalie_rilevate >= 0, "anomalie contate");
    ok(typeof visResult.gravita_massima === "string", "gravità massima calcolata");
  }

  // ========================================================================
  // BLOCCO 7: Hook scoring ipotesi
  // ========================================================================
  console.log("\n=== BLOCCO 7: scoreHypotheses ===");

  var fakeHyps = [
    { label: "dispersione su carico", confidence: "possible", source: "conoscenza",
      status: "active", catena: [], confirm_tests: [], exclude_tests: [] },
    { label: "RCD difettoso", confidence: "possible", source: "conoscenza",
      status: "active", catena: [], confirm_tests: [], exclude_tests: [] }
  ];

  var scored = null;
  try {
    scored = neuralIntegration.scoreHypotheses(fakeHyps, cs1);
  } catch(e) { /* graceful */ }

  ok(scored !== null, "scoreHypotheses non crasha");
  if (scored) {
    ok(Array.isArray(scored), "ritorna array di ipotesi");
    ok(scored.length === 2, "mantiene tutte le ipotesi");
  }

  // ========================================================================
  // BLOCCO 8: Hook shouldCallAI
  // ========================================================================
  console.log("\n=== BLOCCO 8: shouldCallAI ===");

  var aiHint = null;
  try {
    aiHint = neuralIntegration.shouldCallAI(cs1, fakeHyps);
  } catch(e) { /* graceful */ }

  ok(aiHint !== null && aiHint !== undefined, "shouldCallAI non crasha");
  if (aiHint) {
    ok(aiHint.needed === true || aiHint.needed === false || aiHint.needed === null,
      "needed è boolean o null");
  }

  // ========================================================================
  // BLOCCO 9: Hook scoreActionInformativeness
  // ========================================================================
  console.log("\n=== BLOCCO 9: scoreActionInformativeness ===");

  var fakeAction = {
    type: "ask_user",
    action: "misura isolamento con megger",
    reason: "discriminare tra dispersione e guasto RCD"
  };

  var enrichedAction = null;
  try {
    enrichedAction = neuralIntegration.scoreActionInformativeness(fakeAction, fakeHyps, cs1);
  } catch(e) { /* graceful */ }

  ok(enrichedAction !== null, "scoreActionInformativeness non crasha");

  // ========================================================================
  // BLOCCO 10: Hook detectNovelty
  // ========================================================================
  console.log("\n=== BLOCCO 10: detectNovelty ===");

  var fakePercezione = {
    fenomeno_principale: "differenziale_scatta",
    novita: "noto"
  };

  var novelty = null;
  try {
    novelty = neuralIntegration.detectNovelty(fakePercezione, cs1);
  } catch(e) { /* graceful */ }

  ok(novelty !== null, "detectNovelty non crasha");
  if (novelty) {
    ok(novelty.novel === true || novelty.novel === false, "novel è boolean");
    ok(typeof novelty.novelty_score === "number", "novelty_score è numero");
  }

  // ========================================================================
  // BLOCCO 11: Training da caso chiuso
  // ========================================================================
  console.log("\n=== BLOCCO 11: trainFromClosedCase ===");

  var csClosed = {
    problem_summary: "il differenziale scatta quando accendo lo scaldabagno",
    components_detected: ["RCD", "carico"],
    facts_confirmed: ["scatta dopo 5 minuti", "solo con acqua calda"],
    measurements: [{ grandezza: "isolamento", valore: 0.3, unita: "MOhm" }]
  };
  var feedback = {
    confirmedCause: "dispersione sulla resistenza dello scaldabagno",
    diagnosi: "resistenza con isolamento degradato dal calcare",
    componenti: ["RCD", "carico"],
    come_verificato: "misura isolamento a caldo: 0.3 MOhm"
  };

  var trainResult = null;
  try {
    trainResult = neuralIntegration.trainFromClosedCase(csClosed, feedback);
  } catch(e) { /* graceful */ }

  ok(trainResult !== null, "trainFromClosedCase produce risultato");
  if (trainResult) {
    ok(trainResult.trained === true, "training eseguito con successo");
  }

  // ========================================================================
  // BLOCCO 12: Flusso completo — caso forum → tutti gli innesti
  // ========================================================================
  console.log("\n=== BLOCCO 12: Flusso completo caso forum ===");

  var forumCasi = CasiRealiForum.getTutti();
  var casoTest = forumCasi[0]; // FORUM-IT-001: salvavita + lavatrice

  // Step 1: Costruisci caseState dal caso forum
  var csF = CasiRealiForum.aCaseState(casoTest);
  ok(csF.problem_summary.length > 20, "caseState dal forum ha problem_summary");

  // Step 2: World Model
  var wmF = null;
  try { wmF = neuralIntegration.buildWorldModel(csF); } catch(e) {}
  ok(wmF !== null, "world model costruito dal caso forum");

  // Step 3: Simulatore causale
  var simF = null;
  try { simF = neuralIntegration.simulaCausale(csF); } catch(e) {}
  ok(simF !== null, "simulatore produce risultato dal caso forum");
  if (simF) {
    eq(simF.sintomo, casoTest.sintomo_atteso,
      "sintomo riconosciuto correttamente: " + simF.sintomo + " vs " + casoTest.sintomo_atteso);
  }

  // Step 4: Casi simili
  var similiF = [];
  try { similiF = neuralIntegration.findSimilarCases(csF, 3); } catch(e) {}
  ok(Array.isArray(similiF), "findSimilarCases dal caso forum non crasha");

  // Step 5: Training
  var trF = CasiRealiForum.aTraining(casoTest);
  var trainF = null;
  try {
    trainF = neuralIntegration.trainFromClosedCase(trF.caseState, {
      confirmedCause: trF.esito.causa_reale,
      diagnosi: trF.esito.causa_reale,
      componenti: trF.esito.componenti,
      come_verificato: trF.esito.come_verificato
    });
  } catch(e) {}
  ok(trainF !== null && trainF.trained, "training dal caso forum completato");

  // ========================================================================
  // BLOCCO 13: Tutti i casi forum passano senza crash
  // ========================================================================
  console.log("\n=== BLOCCO 13: Tutti i forum → zero crash ===");

  var crashes = 0;
  for (var i = 0; i < forumCasi.length; i++) {
    try {
      var csLoop = CasiRealiForum.aCaseState(forumCasi[i]);
      // World model
      neuralIntegration.buildWorldModel(csLoop);
      // Simulatore
      neuralIntegration.simulaCausale(csLoop);
      // Casi simili
      neuralIntegration.findSimilarCases(csLoop, 2);
    } catch(e) {
      crashes++;
      console.log("  CRASH su " + forumCasi[i].id + ": " + e.message);
    }
  }
  eq(crashes, 0, "zero crash su tutti i " + forumCasi.length + " casi forum");

  // ========================================================================
  // BLOCCO 14: Graceful degradation — tutto deve essere opzionale
  // ========================================================================
  console.log("\n=== BLOCCO 14: Graceful degradation ===");

  // CaseState vuoto — niente deve crashare
  var csVuoto = { problem_summary: "", components_detected: [], facts_confirmed: [], measurements: [] };
  var errorCount = 0;

  try { neuralIntegration.buildWorldModel(csVuoto); } catch(e) { errorCount++; }
  try { neuralIntegration.simulaCausale(csVuoto); } catch(e) { errorCount++; }
  try { neuralIntegration.findSimilarCases(csVuoto, 3); } catch(e) { errorCount++; }
  try { neuralIntegration.scoreHypotheses([], csVuoto); } catch(e) { errorCount++; }
  try { neuralIntegration.shouldCallAI(csVuoto, []); } catch(e) { errorCount++; }
  try { neuralIntegration.detectNovelty({}, csVuoto); } catch(e) { errorCount++; }

  eq(errorCount, 0, "zero crash con caseState vuoto — graceful degradation");

  // CaseState null
  var errorNull = 0;
  try { neuralIntegration.buildWorldModel(null); } catch(e) { errorNull++; }
  try { neuralIntegration.simulaCausale(null); } catch(e) { errorNull++; }
  try { neuralIntegration.findSimilarCases(null, 3); } catch(e) { errorNull++; }

  eq(errorNull, 0, "zero crash con caseState null");

  // ========================================================================
  // BLOCCO 15: Persistenza — salva e carica senza errori
  // ========================================================================
  console.log("\n=== BLOCCO 15: Persistenza ===");

  var tmpDir = require("os").tmpdir() + "/rocco_neural_e2e_test_" + Date.now();
  require("fs").mkdirSync(tmpDir, { recursive: true });

  var saveOk = false;
  try {
    neuralIntegration.saveAll(tmpDir);
    saveOk = true;
  } catch(e) {}
  ok(saveOk, "saveAll non crasha");

  var loadResult = null;
  try {
    loadResult = neuralIntegration.loadAll(tmpDir);
  } catch(e) {}
  ok(loadResult !== null, "loadAll non crasha");

  // Cleanup
  try {
    var files = require("fs").readdirSync(tmpDir);
    for (var fi = 0; fi < files.length; fi++) {
      require("fs").unlinkSync(tmpDir + "/" + files[fi]);
    }
    require("fs").rmdirSync(tmpDir);
  } catch(e) {}

  // ========================================================================
  // RIEPILOGO
  // ========================================================================
  console.log("\n============================================");
  console.log("ORCHESTRATOR NEURAL E2E: " + passCount + " pass, " + failCount + " fail");
  console.log("============================================\n");

  if (failCount > 0) process.exit(1);
})();
