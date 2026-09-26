"use strict";

// ============================================================================
// BENCHMARK — 48 casi reali nel pipeline completo ROCCO
//
// Per ogni caso forum:
// 1. Costruisce il caseState
// 2. Lo passa nel pipeline ragiona() + simulatore + knowledge
// 3. Verifica se la causa reale appare tra le ipotesi generate
// 4. Misura: tasso di successo, coverage, efficienza verifiche
//
// Questo benchmark NON chiama AI/LLM — testa solo il cervello locale.
// ============================================================================

var path = require("path");

// Carica i moduli necessari
var CasiRealiForum = require("../casi_reali_forum");
var neuralIntegration = require("../neural_integration");

// Init il cervello
neuralIntegration.init({
  autoWarmup: true,
  knowledgePath: path.join(__dirname, "..", "..", "..", "knowledge")
});

var passed = 0;
var failed = 0;
var current = "";

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.log("  FAIL [" + current + "]: " + msg); }
}

function normalize(s) {
  return (s || "").toLowerCase().replace(/[àáâãäèéêëìíîïòóôõöùúûü]/g, function(c) {
    return { "à":"a","á":"a","â":"a","ã":"a","ä":"a","è":"e","é":"e","ê":"e","ë":"e","ì":"i","í":"i","î":"i","ï":"i","ò":"o","ó":"o","ô":"o","õ":"o","ö":"o","ù":"u","ú":"u","û":"u","ü":"u" }[c] || c;
  }).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// ============================================================================
// BENCHMARK
// ============================================================================

var casi = CasiRealiForum.getTutti();
var totale = casi.length;

console.log("\n" + "=".repeat(70));
console.log("BENCHMARK ROCCO — " + totale + " casi reali dal web");
console.log("=".repeat(70));

// Contatori
var causaTrovata = 0;
var causaNonTrovata = 0;
var sintomoRiconosciuto = 0;
var sintomoNonRiconosciuto = 0;
var verificheSuggerite = 0;
var dettagli = [];

// Per ogni caso, simuliamo il pipeline
for (var i = 0; i < casi.length; i++) {
  var caso = casi[i];
  current = caso.id;

  var tr = CasiRealiForum.aTraining(caso);
  var cs = tr.caseState;
  cs.hypotheses = [];
  cs.facts_confirmed = cs.facts_confirmed || [];
  cs.measurements = cs.measurements || [];
  cs.components_detected = caso.componenti || [];

  // 1. Simulatore causale
  var simResult = null;
  try {
    if (neuralIntegration.NeuralSimulator) {
      simResult = neuralIntegration.NeuralSimulator.simula(cs);
    }
  } catch(e) { /* skip */ }

  var sintomoRic = simResult && simResult.sintomo ? simResult.sintomo : null;
  if (sintomoRic) {
    sintomoRiconosciuto++;
    cs.anomaly_type = sintomoRic;
  } else {
    sintomoNonRiconosciuto++;
  }

  // 2. Raccogli ipotesi dal simulatore
  if (simResult && simResult.ipotesi) {
    simResult.ipotesi.forEach(function(ip) {
      if (ip.stato === "attiva") {
        cs.hypotheses.push({
          label: ip.causa,
          reason: ip.come_verifico || "",
          source: "simulatore",
          probability: ip.probabilita,
          status: "active"
        });
      }
    });
  }

  // 3. Neural scoring
  try {
    cs.hypotheses = neuralIntegration.scoreHypotheses(cs.hypotheses, cs);
  } catch(e) { /* skip */ }

  // 4. Casi simili
  try {
    var simili = neuralIntegration.findSimilarCases(cs, 3);
    if (simili && simili.length > 0) {
      simili.forEach(function(sim) {
        if (sim && sim.data && sim.data.confirmed_cause) {
          cs.hypotheses.push({
            label: sim.data.confirmed_cause,
            reason: "Caso simile (score " + (sim.score || 0).toFixed(2) + ")",
            source: "neural_similarita",
            status: "active"
          });
        }
      });
    }
  } catch(e) { /* skip */ }

  // 5. Distillatore
  try {
    if (neuralIntegration.cercaRegoleDistillate) {
      var regoleDist = neuralIntegration.cercaRegoleDistillate(
        sintomoRic || "", cs.measurements || [], caso.componenti || [], []
      );
      // Non aggiungiamo ipotesi dal distillatore, facciamo solo boost
    }
  } catch(e) { /* skip */ }

  // 6. suggerisciVerifica
  var verificaSuggerita = null;
  try {
    if (neuralIntegration.suggerisciVerifica && sintomoRic) {
      verificaSuggerita = neuralIntegration.suggerisciVerifica(
        sintomoRic,
        cs.hypotheses.map(function(h) { return h.label; })
      );
      if (verificaSuggerita) verificheSuggerite++;
    }
  } catch(e) { /* skip */ }

  // 7. Verifica se la causa reale appare tra le ipotesi
  var causaNorm = normalize(caso.causa_reale);
  var trovata = false;
  var posizione = -1;

  for (var h = 0; h < cs.hypotheses.length; h++) {
    var ipNorm = normalize(cs.hypotheses[h].label);
    // Match parziale: almeno 2 parole significative della causa devono essere nell'ipotesi
    var paroleCausa = causaNorm.split(" ").filter(function(w) { return w.length > 3; });
    var matchCount = 0;
    paroleCausa.forEach(function(w) {
      if (ipNorm.indexOf(w) >= 0) matchCount++;
    });
    // Oppure l'ipotesi contiene una keyword chiave della causa
    var keywordMatch = false;
    var keywords = ["dispersione", "cortocircuito", "sovraccarico", "isolamento", "morsetto",
      "surriscaldamento", "interruzione", "degradat", "calcare", "umidita", "corto",
      "capacitiv", "armonich", "cumulativ", "resistenz", "bobina", "avvolgiment",
      "neutro", "terra"];
    keywords.forEach(function(kw) {
      if (causaNorm.indexOf(kw) >= 0 && ipNorm.indexOf(kw) >= 0) keywordMatch = true;
    });

    if (matchCount >= 2 || keywordMatch) {
      trovata = true;
      posizione = h + 1; // 1-indexed
      break;
    }
  }

  if (trovata) {
    causaTrovata++;
  } else {
    causaNonTrovata++;
  }

  dettagli.push({
    id: caso.id,
    lingua: caso.lingua,
    sintomo: caso.sintomo_atteso,
    sintomo_riconosciuto: sintomoRic || "NO",
    causa_reale_breve: caso.causa_reale.substring(0, 60),
    trovata: trovata,
    posizione: posizione,
    ipotesi_totali: cs.hypotheses.length,
    verifica_suggerita: verificaSuggerita ? verificaSuggerita.verifica.substring(0, 40) : "nessuna"
  });
}

// ============================================================================
// REPORT
// ============================================================================

console.log("\n--- DETTAGLIO PER CASO ---\n");

var maxIdLen = 16;
console.log(
  "ID".padEnd(maxIdLen) + " | " +
  "LNG" + " | " +
  "TROVATA" + " | " +
  "POS" + " | " +
  "IPO" + " | " +
  "SINTOMO RIC." + "        | " +
  "CAUSA"
);
console.log("-".repeat(120));

for (var d = 0; d < dettagli.length; d++) {
  var det = dettagli[d];
  console.log(
    det.id.padEnd(maxIdLen) + " | " +
    det.lingua.padEnd(3) + " | " +
    (det.trovata ? "  SI   " : "  NO   ") + " | " +
    String(det.posizione > 0 ? det.posizione : "-").padStart(3) + " | " +
    String(det.ipotesi_totali).padStart(3) + " | " +
    String(det.sintomo_riconosciuto).padEnd(22) + " | " +
    det.causa_reale_breve
  );
}

// Calcoli
var tassoSuccesso = totale > 0 ? Math.round(causaTrovata / totale * 100) : 0;
var tassoSintomo = totale > 0 ? Math.round(sintomoRiconosciuto / totale * 100) : 0;
var tassoVerifiche = sintomoRiconosciuto > 0 ? Math.round(verificheSuggerite / sintomoRiconosciuto * 100) : 0;

console.log("\n" + "=".repeat(70));
console.log("RISULTATI BENCHMARK");
console.log("=".repeat(70));
console.log("Casi totali:              " + totale);
console.log("Causa trovata:            " + causaTrovata + "/" + totale + " (" + tassoSuccesso + "%)");
console.log("Causa NON trovata:        " + causaNonTrovata + "/" + totale);
console.log("Sintomo riconosciuto:     " + sintomoRiconosciuto + "/" + totale + " (" + tassoSintomo + "%)");
console.log("Verifiche suggerite:      " + verificheSuggerite + "/" + sintomoRiconosciuto + " (" + tassoVerifiche + "% dei sintomi riconosciuti)");
console.log("=".repeat(70));

// Asserzioni di soglia minima
current = "BENCHMARK";
assert(totale >= 48, "almeno 48 casi nel benchmark");
assert(tassoSuccesso >= 30, "tasso successo >= 30% (attuale: " + tassoSuccesso + "%)");
assert(tassoSintomo >= 40, "tasso riconoscimento sintomo >= 40% (attuale: " + tassoSintomo + "%)");
assert(sintomoRiconosciuto > 0, "almeno un sintomo riconosciuto");
assert(causaTrovata > 0, "almeno una causa trovata");

// Report per lingua
var perLingua = {};
dettagli.forEach(function(d) {
  if (!perLingua[d.lingua]) perLingua[d.lingua] = { totale: 0, trovate: 0 };
  perLingua[d.lingua].totale++;
  if (d.trovata) perLingua[d.lingua].trovate++;
});

console.log("\n--- PER LINGUA ---");
Object.keys(perLingua).forEach(function(lang) {
  var l = perLingua[lang];
  console.log("  " + lang + ": " + l.trovate + "/" + l.totale + " (" + Math.round(l.trovate / l.totale * 100) + "%)");
});

// Report per sintomo
var perSintomo = {};
dettagli.forEach(function(d) {
  if (!perSintomo[d.sintomo]) perSintomo[d.sintomo] = { totale: 0, trovate: 0, riconosciuti: 0 };
  perSintomo[d.sintomo].totale++;
  if (d.trovata) perSintomo[d.sintomo].trovate++;
  if (d.sintomo_riconosciuto !== "NO") perSintomo[d.sintomo].riconosciuti++;
});

console.log("\n--- PER SINTOMO ---");
Object.keys(perSintomo).forEach(function(s) {
  var st = perSintomo[s];
  console.log("  " + s + ": causa " + st.trovate + "/" + st.totale +
    " | sintomo " + st.riconosciuti + "/" + st.totale);
});

console.log("\n" + "=".repeat(70));
console.log("BENCHMARK: " + passed + " passed, " + failed + " failed");
console.log("=".repeat(70));

if (failed > 0) process.exit(1);
