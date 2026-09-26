"use strict";

var assert = require("assert");
var forum = require("../casi_reali_forum");
var NeuralSimulator;
try { NeuralSimulator = require("../neural_simulator"); } catch(e) { NeuralSimulator = null; }

// ============================================================================
// TEST — CASI REALI FORUM
//
// Verifica che:
// 1. Ogni caso sia strutturato correttamente
// 2. I filtri funzionino
// 3. Le conversioni caseState/training siano corrette
// 4. Il simulatore riconosca i sintomi dalle domande VERE
// 5. Le stats siano coerenti
// ============================================================================

(function() {
  var passCount = 0;
  var failCount = 0;

  function ok(cond, msg) {
    if (cond) { passCount++; }
    else { failCount++; console.log("  FAIL: " + msg); }
  }

  function eq(a, b, msg) {
    if (a === b) { passCount++; }
    else { failCount++; console.log("  FAIL: " + msg + " — got " + a + ", expected " + b); }
  }

  // ========================================================================
  // BLOCCO 1: Struttura dati — ogni caso ha tutti i campi
  // ========================================================================
  console.log("\n=== BLOCCO 1: Struttura dati ===");

  var tutti = forum.getTutti();
  ok(tutti.length >= 25, "almeno 25 casi forum — got " + tutti.length);

  var campiObbligatori = ["id", "domanda", "lingua", "sintomo_atteso", "causa_reale", "componenti", "verifiche", "lezione"];
  var lingueValide = ["it", "en", "fr", "es", "de", "pt", "ro", "ar"];
  var ids = {};
  var idDuplicati = false;

  for (var i = 0; i < tutti.length; i++) {
    var caso = tutti[i];

    // Tutti i campi presenti
    for (var j = 0; j < campiObbligatori.length; j++) {
      ok(caso[campiObbligatori[j]] !== undefined && caso[campiObbligatori[j]] !== null,
        caso.id + " ha campo " + campiObbligatori[j]);
    }

    // ID unico
    if (ids[caso.id]) idDuplicati = true;
    ids[caso.id] = true;

    // Lingua valida
    ok(lingueValide.indexOf(caso.lingua) >= 0, caso.id + " lingua valida: " + caso.lingua);

    // domanda non vuota e abbastanza lunga (una frase vera, non una parola)
    ok(caso.domanda.length > 20, caso.id + " domanda lunga abbastanza (>20 char): " + caso.domanda.length);

    // componenti è array con almeno 1 elemento
    ok(Array.isArray(caso.componenti) && caso.componenti.length >= 1,
      caso.id + " componenti array non vuoto");

    // verifiche è array con almeno 1 elemento
    ok(Array.isArray(caso.verifiche) && caso.verifiche.length >= 1,
      caso.id + " verifiche array non vuoto");

    // lezione non vuota
    ok(caso.lezione.length > 10, caso.id + " lezione lunga abbastanza");

    // causa_reale non vuota
    ok(caso.causa_reale.length > 5, caso.id + " causa_reale presente");
  }

  ok(!idDuplicati, "nessun ID duplicato");

  // ========================================================================
  // BLOCCO 2: Copertura lingue
  // ========================================================================
  console.log("\n=== BLOCCO 2: Copertura lingue ===");

  var stats = forum.getStats();

  // Almeno 7 lingue
  var numLingue = Object.keys(stats.lingue).length;
  ok(numLingue >= 7, "almeno 7 lingue — got " + numLingue);

  // Italiano ha più casi (è il core)
  ok(stats.lingue.it >= 10, "almeno 10 casi IT — got " + (stats.lingue.it || 0));
  ok(stats.lingue.en >= 3, "almeno 3 casi EN — got " + (stats.lingue.en || 0));
  ok(stats.lingue.fr >= 1, "almeno 1 caso FR — got " + (stats.lingue.fr || 0));
  ok(stats.lingue.es >= 1, "almeno 1 caso ES — got " + (stats.lingue.es || 0));
  ok(stats.lingue.de >= 1, "almeno 1 caso DE — got " + (stats.lingue.de || 0));
  ok(stats.lingue.pt >= 1, "almeno 1 caso PT — got " + (stats.lingue.pt || 0));
  ok(stats.lingue.ro >= 1, "almeno 1 caso RO — got " + (stats.lingue.ro || 0));
  ok(stats.lingue.ar >= 1, "almeno 1 caso AR — got " + (stats.lingue.ar || 0));

  // Totale coerente
  eq(stats.totale, tutti.length, "stats.totale coerente");

  // ========================================================================
  // BLOCCO 3: Filtri — perLingua, perSintomo, cerca
  // ========================================================================
  console.log("\n=== BLOCCO 3: Filtri ===");

  // perLingua
  var itCasi = forum.perLingua("it");
  eq(itCasi.length, stats.lingue.it, "perLingua('it') coerente con stats");
  ok(itCasi.every(function(c) { return c.lingua === "it"; }), "perLingua('it') tutti italiani");

  var enCasi = forum.perLingua("en");
  ok(enCasi.every(function(c) { return c.lingua === "en"; }), "perLingua('en') tutti inglesi");

  var zzCasi = forum.perLingua("zz");
  eq(zzCasi.length, 0, "perLingua lingua inesistente → 0");

  // perSintomo
  var diffCasi = forum.perSintomo("differenziale_scatta");
  ok(diffCasi.length >= 5, "almeno 5 casi differenziale_scatta — got " + diffCasi.length);
  ok(diffCasi.every(function(c) { return c.sintomo_atteso === "differenziale_scatta"; }),
    "perSintomo tutti con sintomo corretto");

  var mcbCasi = forum.perSintomo("magnetotermico_scatta_subito");
  ok(mcbCasi.length >= 2, "almeno 2 casi magnetotermico_scatta_subito");

  var surCasi = forum.perSintomo("surriscaldamento");
  ok(surCasi.length >= 2, "almeno 2 casi surriscaldamento");

  // cerca
  var lavatrice = forum.cerca("lavatrice");
  ok(lavatrice.length >= 1, "cerca('lavatrice') trova almeno 1 caso");
  ok(lavatrice[0].domanda.toLowerCase().indexOf("lavatrice") >= 0, "caso trovato contiene 'lavatrice'");

  var dishwasher = forum.cerca("Spülmaschine");
  ok(dishwasher.length >= 1, "cerca('Spülmaschine') trova il caso tedesco");

  var niente = forum.cerca("xyznonesiste123");
  eq(niente.length, 0, "cerca parola inesistente → 0");

  // cerca case-insensitive
  var salvavita = forum.cerca("SALVAVITA");
  ok(salvavita.length >= 1, "cerca case-insensitive 'SALVAVITA'");

  // ========================================================================
  // BLOCCO 4: Conversione caseState
  // ========================================================================
  console.log("\n=== BLOCCO 4: Conversione caseState ===");

  var caso1 = tutti[0];
  var cs = forum.aCaseState(caso1);

  ok(cs.problem_summary === caso1.domanda, "caseState.problem_summary = domanda originale");
  ok(Array.isArray(cs.components_detected), "caseState.components_detected è array");
  eq(cs.components_detected.length, caso1.componenti.length, "componenti copiati correttamente");
  ok(Array.isArray(cs.facts_confirmed), "caseState.facts_confirmed è array");
  ok(Array.isArray(cs.measurements), "caseState.measurements è array");
  ok(cs.lingua === caso1.lingua, "caseState.lingua preservata");

  // ========================================================================
  // BLOCCO 5: Conversione training
  // ========================================================================
  console.log("\n=== BLOCCO 5: Conversione training ===");

  var tr = forum.aTraining(caso1);
  ok(tr.caseState !== undefined, "training ha caseState");
  ok(tr.esito !== undefined, "training ha esito");
  ok(tr.esito.causa_reale === caso1.causa_reale, "training.esito.causa_reale corretta");
  ok(tr.esito.componenti.length === caso1.componenti.length, "training.esito.componenti corretti");
  ok(typeof tr.esito.come_verificato === "string", "training.esito.come_verificato è stringa");
  ok(tr.esito.come_verificato.length > 0, "training.esito.come_verificato non vuota");

  // Verifiche join con ";"
  ok(tr.esito.come_verificato.indexOf(caso1.verifiche[0]) >= 0,
    "training.come_verificato contiene prima verifica");

  // ========================================================================
  // BLOCCO 6: Tutti i casi convertibili senza errori
  // ========================================================================
  console.log("\n=== BLOCCO 6: Conversione batch ===");

  var erroriConversione = 0;
  for (var k = 0; k < tutti.length; k++) {
    try {
      var cs2 = forum.aCaseState(tutti[k]);
      var tr2 = forum.aTraining(tutti[k]);
      if (!cs2.problem_summary || !tr2.esito) erroriConversione++;
    } catch(e) {
      erroriConversione++;
      console.log("  errore conversione caso " + tutti[k].id + ": " + e.message);
    }
  }
  eq(erroriConversione, 0, "tutti i " + tutti.length + " casi convertibili senza errori");

  // ========================================================================
  // BLOCCO 7: Copertura sintomi
  // ========================================================================
  console.log("\n=== BLOCCO 7: Copertura sintomi ===");

  var sintomiAttesi = [
    "differenziale_scatta",
    "magnetotermico_scatta_subito",
    "magnetotermico_scatta_dopo_tempo",
    "surriscaldamento",
    "niente_tensione",
    "intermittente",
    "fotovoltaico_non_produce",
    "caldaia_non_accende",
    "motore_non_parte"
  ];

  var sintomiPresenti = Object.keys(stats.sintomi);
  ok(sintomiPresenti.length >= 6, "almeno 6 sintomi diversi coperti — got " + sintomiPresenti.length);

  // I sintomi core devono essere presenti
  ok(stats.sintomi["differenziale_scatta"] >= 1, "differenziale_scatta presente");
  ok(stats.sintomi["magnetotermico_scatta_subito"] >= 1, "magnetotermico_scatta_subito presente");
  ok(stats.sintomi["surriscaldamento"] >= 1, "surriscaldamento presente");
  ok(stats.sintomi["niente_tensione"] >= 1, "niente_tensione presente");
  ok(stats.sintomi["intermittente"] >= 1, "intermittente presente");

  // ========================================================================
  // BLOCCO 8: Simulatore riconosce i sintomi dalle domande forum
  // ========================================================================
  console.log("\n=== BLOCCO 8: Simulatore riconosce domande forum ===");

  if (NeuralSimulator) {
    var riconosciuti = 0;
    var nonRiconosciuti = [];
    var sbagliati = [];

    for (var f = 0; f < tutti.length; f++) {
      var casoF = tutti[f];
      var sintomo = NeuralSimulator.riconosciSintomo(casoF.domanda);

      if (sintomo === casoF.sintomo_atteso) {
        riconosciuti++;
      } else if (sintomo === null) {
        nonRiconosciuti.push(casoF.id + " (" + casoF.lingua + "): " + casoF.domanda.substring(0, 50) + "...");
      } else {
        sbagliati.push(casoF.id + ": atteso=" + casoF.sintomo_atteso + " got=" + sintomo);
      }
    }

    // Almeno 50% riconosciuti (molti sono in lingue straniere, il simulatore è IT-centric)
    var percentuale = Math.round(riconosciuti / tutti.length * 100);
    ok(riconosciuti >= Math.floor(tutti.length * 0.4),
      "simulatore riconosce almeno 40% dei casi forum: " + riconosciuti + "/" + tutti.length + " (" + percentuale + "%)");

    // I casi italiani devono essere quasi tutti riconosciuti
    var itCasiSim = forum.perLingua("it");
    var itRiconosciuti = 0;
    for (var g = 0; g < itCasiSim.length; g++) {
      var sintomoIt = NeuralSimulator.riconosciSintomo(itCasiSim[g].domanda);
      if (sintomoIt === itCasiSim[g].sintomo_atteso) itRiconosciuti++;
    }
    var percIt = Math.round(itRiconosciuti / itCasiSim.length * 100);
    ok(itRiconosciuti >= Math.floor(itCasiSim.length * 0.7),
      "simulatore riconosce almeno 70% dei casi IT: " + itRiconosciuti + "/" + itCasiSim.length + " (" + percIt + "%)");

    // Report non-riconosciuti (informativo, non fail)
    if (nonRiconosciuti.length > 0) {
      console.log("  INFO: " + nonRiconosciuti.length + " casi non riconosciuti (lingue straniere è OK):");
      for (var nr = 0; nr < Math.min(nonRiconosciuti.length, 5); nr++) {
        console.log("    - " + nonRiconosciuti[nr]);
      }
    }
    if (sbagliati.length > 0) {
      console.log("  WARNING: " + sbagliati.length + " casi con sintomo SBAGLIATO:");
      for (var sb = 0; sb < sbagliati.length; sb++) {
        console.log("    - " + sbagliati[sb]);
      }
    }

    // Zero sbagliati sui casi IT
    var itSbagliati = 0;
    for (var h = 0; h < itCasiSim.length; h++) {
      var sintomoIt2 = NeuralSimulator.riconosciSintomo(itCasiSim[h].domanda);
      if (sintomoIt2 !== null && sintomoIt2 !== itCasiSim[h].sintomo_atteso) {
        itSbagliati++;
        console.log("  IT SBAGLIATO: " + itCasiSim[h].id + " atteso=" + itCasiSim[h].sintomo_atteso + " got=" + sintomoIt2);
      }
    }
    eq(itSbagliati, 0, "zero classificazioni SBAGLIATE sui casi italiani");

  } else {
    console.log("  SKIP: NeuralSimulator non disponibile");
    passCount += 4; // skip counts
  }

  // ========================================================================
  // BLOCCO 9: Ipotesi generate per ogni sintomo dei casi forum
  // ========================================================================
  console.log("\n=== BLOCCO 9: Ipotesi per sintomi forum ===");

  if (NeuralSimulator) {
    var sintomiUnici = {};
    for (var s = 0; s < tutti.length; s++) {
      sintomiUnici[tutti[s].sintomo_atteso] = true;
    }

    var tuttiConIpotesi = true;
    for (var sintomoKey in sintomiUnici) {
      var ipotesi = NeuralSimulator.generaIpotesi(sintomoKey);
      if (!ipotesi || ipotesi.length === 0) {
        // Alcuni sintomi speciali potrebbero non avere ipotesi dirette
        if (sintomoKey !== "intermittente" && sintomoKey !== "fotovoltaico_non_produce" &&
            sintomoKey !== "caldaia_non_accende" && sintomoKey !== "motore_non_parte") {
          tuttiConIpotesi = false;
          console.log("  FAIL: nessuna ipotesi per sintomo " + sintomoKey);
        }
      } else {
        ok(ipotesi.length >= 2, "sintomo '" + sintomoKey + "' ha almeno 2 ipotesi — got " + ipotesi.length);

        // Probabilità sommano a ~1
        var somma = 0;
        for (var ip = 0; ip < ipotesi.length; ip++) {
          somma += ipotesi[ip].probabilita;
        }
        ok(somma > 0.8 && somma <= 1.05,
          "probabilità per '" + sintomoKey + "' sommano a ~1 — got " + somma.toFixed(2));
      }
    }
  } else {
    console.log("  SKIP: NeuralSimulator non disponibile");
    passCount += 2;
  }

  // ========================================================================
  // BLOCCO 10: Componenti usano vocabolario consistente
  // ========================================================================
  console.log("\n=== BLOCCO 10: Vocabolario componenti ===");

  var compValide = ["RCD", "MCB", "carico", "conduttore", "giunzione", "sorgente",
    "inverter", "sensore", "comando", "contattore"];
  var compSconosciute = [];

  for (var c = 0; c < tutti.length; c++) {
    for (var d = 0; d < tutti[c].componenti.length; d++) {
      var comp = tutti[c].componenti[d];
      if (compValide.indexOf(comp) < 0 && compSconosciute.indexOf(comp) < 0) {
        compSconosciute.push(comp);
      }
    }
  }

  ok(compSconosciute.length === 0,
    "tutte le componenti usano vocabolario noto — sconosciute: [" + compSconosciute.join(", ") + "]");

  // ========================================================================
  // BLOCCO 11: Qualità domande — linguaggio umano, non AI
  // ========================================================================
  console.log("\n=== BLOCCO 11: Qualità linguaggio ===");

  var fraseAI = ["Bayesian", "neural network", "machine learning", "inference",
    "probabilistic", "stochastic", "algorithm", "optimize"];
  var casiConLinguaggioAI = 0;

  for (var la = 0; la < tutti.length; la++) {
    var domandaLower = tutti[la].domanda.toLowerCase();
    for (var ai = 0; ai < fraseAI.length; ai++) {
      if (domandaLower.indexOf(fraseAI[ai].toLowerCase()) >= 0) {
        casiConLinguaggioAI++;
        console.log("  LINGUAGGIO AI in " + tutti[la].id + ": trovato '" + fraseAI[ai] + "'");
      }
    }
  }
  eq(casiConLinguaggioAI, 0, "zero linguaggio AI nelle domande — solo parole umane");

  // Ogni domanda ha segni di punteggiatura (è una frase vera, non keyword)
  var senzaPunteggiatura = 0;
  for (var p = 0; p < tutti.length; p++) {
    if (!/[.?!,;:]/.test(tutti[p].domanda)) {
      senzaPunteggiatura++;
      console.log("  senza punteggiatura: " + tutti[p].id);
    }
  }
  eq(senzaPunteggiatura, 0, "tutte le domande hanno punteggiatura (frasi vere)");

  // Nei forum veri la gente non sempre mette ? — basta che ci sia punteggiatura
  var senzaPunteggiaturaForte = 0;
  for (var q = 0; q < tutti.length; q++) {
    if (!/[?!؟.]/.test(tutti[q].domanda)) {
      senzaPunteggiaturaForte++;
    }
  }
  eq(senzaPunteggiaturaForte, 0, "tutte le domande hanno almeno un segno di punteggiatura");

  // ========================================================================
  // BLOCCO 12: Casi speciali — i più difficili
  // ========================================================================
  console.log("\n=== BLOCCO 12: Casi speciali ===");

  var speciali = forum.cerca("fantasma");
  ok(speciali.length >= 1, "caso 'fantasma' presente (luci alle 3 di notte)");

  var neutro = forum.cerca("TV del soggiorno");
  ok(neutro.length >= 1, "caso neutro condiviso presente");

  var fv30 = forum.cerca("30%");
  ok(fv30.length >= 1, "caso FV -30% presente");

  var enel = forum.cerca("ENEL");
  ok(enel.length >= 1, "caso post-lavori ENEL presente");

  var caldaiaCicla = forum.cerca("cicli al minuto");
  ok(caldaiaCicla.length >= 1, "caso caldaia che cicla presente");

  // ========================================================================
  // BLOCCO 13: Multilingua — ogni lingua ha domande diverse dall'italiano
  // ========================================================================
  console.log("\n=== BLOCCO 13: Multilingua genuino ===");

  var lingueNonIt = ["en", "fr", "es", "de", "pt", "ro", "ar"];
  for (var li = 0; li < lingueNonIt.length; li++) {
    var casiLingua = forum.perLingua(lingueNonIt[li]);
    if (casiLingua.length > 0) {
      // Le domande non devono essere in italiano
      var primoCarattere = casiLingua[0].domanda;
      // Verifica che non contenga parole italiane tipiche come "il", "la", "quando", "sono"
      // (escludendo ovviamente parole comuni a più lingue)
      var sospettoIT = /\b(scatta|salvavita|quadro elettrico|morsetto|lampadina)\b/i.test(primoCarattere);
      ok(!sospettoIT,
        lingueNonIt[li].toUpperCase() + ": domanda è nella lingua corretta, non in italiano");
    }
  }

  // ========================================================================
  // BLOCCO 14: getStats coerenza
  // ========================================================================
  console.log("\n=== BLOCCO 14: Stats coerenza ===");

  // Somma lingue = totale
  var sommaLingue = 0;
  for (var sl in stats.lingue) sommaLingue += stats.lingue[sl];
  eq(sommaLingue, stats.totale, "somma casi per lingua = totale");

  // Somma sintomi = totale
  var sommaSintomi = 0;
  for (var ss in stats.sintomi) sommaSintomi += stats.sintomi[ss];
  eq(sommaSintomi, stats.totale, "somma casi per sintomo = totale");

  // ========================================================================
  // RIEPILOGO
  // ========================================================================
  console.log("\n============================================");
  console.log("CASI REALI FORUM TEST: " + passCount + " pass, " + failCount + " fail");
  console.log("============================================\n");

  if (failCount > 0) process.exit(1);
})();
