"use strict";

/**
 * Test continuità multi-turn.
 *
 * Il difetto chiuso qui: `prior_context` veniva scritto in problem_summary
 * al passo 1 e cancellato al passo 3 da mergeSafetySeedOutput, che
 * riscrive problem_summary col seed del safety guard (solo messaggio
 * corrente). Da problem_summary dipendono sia il RACCONTO (`story`, l'ambito
 * delle regole) sia le PROVE (`text`, via extractUserExclusions): perso
 * quello, al secondo messaggio ROCCO dimenticava il caso e richiedeva la
 * verifica che l'utente aveva appena eseguito.
 *
 * Misurato sul corpus reale `casi_reali_forum.js`, come da metodo: le frasi
 * dei turni sono quelle dei clienti, non frasi di comodo.
 */

var orchestrator = require("../../orchestrator");
var corpus = require("../casi_reali_forum.js");

var pass = 0;
var fail = 0;

function check(label, condition) {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.log("  ✗ " + label);
  }
}

function eq(label, actual, expected) {
  var ok = actual === expected;
  if (!ok) console.log("    atteso " + JSON.stringify(expected) + ", ottenuto " + JSON.stringify(actual));
  check(label, ok);
}

function casiItaliani() {
  return corpus.CASI_FORUM.filter(function (c) { return c.lingua === "it"; });
}

function priorFrom(turni) {
  return turni.map(function (t) {
    return (t.role === "user" ? "UTENTE" : "ROCCO") + ": " + String(t.content).slice(0, 300);
  }).join("\n");
}

// Il case_state come lo costruisce l'orchestratore dopo il merge del safety
// guard: è il punto in cui il contesto veniva perso.
function caseStateDopoMerge(message, prior, measurements) {
  var caseStateHelpers = require("../../case_state");
  var cs = caseStateHelpers.createCaseState({ message: message });
  if (prior) {
    cs.prior_context = prior;
    orchestrator.applyPriorContext(cs);
  }
  // mergeSafetySeedOutput riscrive problem_summary col seed del messaggio
  // corrente: è esattamente quello che cancellava il contesto.
  caseStateHelpers.mergeSafetySeedOutput(cs, {
    safety: { level: "ok", blocked_actions: [], allowed_next_step: "" },
    seed: {
      problem_summary: message,
      measurements: measurements || []
    }
  });
  orchestrator.applyPriorContext(cs);
  return cs;
}

// ─── §1 Il contesto sopravvive al merge del safety guard ────────────────
console.log("\n§1 — il contesto sopravvive al merge");
var turno1 = "Ciao a tutti, da qualche giorno il salvavita scatta sempre quando accendo la lavatrice.";
var risposta1 = "OSSERVAZIONI: il differenziale scatta all'accensione della lavatrice. PROSSIMO PASSO: misura isolamento col megger.";
var turno2 = "Ho misurato l'isolamento della lavatrice col megger: 0,2 MOhm.";

var prior = priorFrom([
  { role: "user", content: turno1 },
  { role: "assistant", content: risposta1 }
]);
var cs2 = caseStateDopoMerge(turno2, prior);

check("problem_summary porta il marcatore di contesto", /\[CONTESTO PRECEDENTE\]/.test(cs2.problem_summary));
check("problem_summary porta il sintomo del turno 1", /salvavita|differenziale/i.test(cs2.problem_summary));
check("problem_summary porta il messaggio corrente", /0,2 MOhm/.test(cs2.problem_summary));
check("prior_context resta accessibile a parte", !!cs2.prior_context);

// Senza contesto il case_state resta quello del solo messaggio corrente.
var csSolo = caseStateDopoMerge(turno2, null);
check("senza prior_context nessun marcatore", !/\[CONTESTO PRECEDENTE\]/.test(csSolo.problem_summary));
check("senza prior_context il turno 1 non c'è", !/salvavita/i.test(csSolo.problem_summary));

// ─── §2 Idempotenza: il flusso la chiama due volte ─────────────────────
console.log("\n§2 — idempotenza");
var csIdem = caseStateDopoMerge(turno2, prior);
var primaDiRiapplicare = csIdem.problem_summary;
orchestrator.applyPriorContext(csIdem);
orchestrator.applyPriorContext(csIdem);
eq("nessun doppio append", csIdem.problem_summary, primaDiRiapplicare);
eq("un solo marcatore nel testo", csIdem.problem_summary.split("[CONTESTO PRECEDENTE]").length - 1, 1);

var csVuoto = require("../../case_state").createCaseState({ message: turno2 });
orchestrator.applyPriorContext(csVuoto);
check("senza prior_context non tocca nulla", !/\[CONTESTO PRECEDENTE\]/.test(csVuoto.problem_summary));

// ─── §3 Le esclusioni dei turni precedenti diventano PROVE ─────────────
console.log("\n§3 — le esclusioni del turno 1 diventano prove al turno 2");
// Forma reale dal corpus: il cliente elenca i pezzi nuovi, non dice
// "ho sostituito X ma il problema persiste".
var priorEscl = priorFrom([
  { role: "user", content: "Lampadina nuova, interruttore nuovo, continua uguale." },
  { role: "assistant", content: "OSSERVAZIONI: punto luce non funzionante. PROSSIMO PASSO: verifica tensione a monte." }
]);
var csEscl = caseStateDopoMerge("Ho misurato 230V a monte del punto luce.", priorEscl);
var ctxEscl = orchestrator.buildEvidenceContext(csEscl);

check("la sostituzione dichiarata al turno 1 è fra le prove", /lampadina nuova|interruttore nuovo/.test(ctxEscl.text));
check("il racconto contiene il turno 1", /lampadina nuova/.test(ctxEscl.story));

var ctxSenza = orchestrator.buildEvidenceContext(caseStateDopoMerge("Ho misurato 230V a monte del punto luce.", null));
check("senza contesto quelle prove non esistono", !/lampadina nuova/.test(ctxSenza.text));

// ─── §4 La misura del turno corrente resta leggibile come numero ───────
console.log("\n§4 — la misura resta un numero, non una frase");
// La misura arriva dal motore attraverso il seed, come nel flusso reale.
var csMis = caseStateDopoMerge(turno2, prior, [
  { type: "isolamento", value: 0.2, unit: "MΩ", raw: "0,2 mohm" }
]);
var ctx2 = orchestrator.buildEvidenceContext(csMis);
eq("isolamento leggibile come numero in MΩ", ctx2.measure("isolamento"), 0.2);
check("il racconto porta avanti il caso del turno 1", /lavatrice/.test(ctx2.story));
check("il contesto non ha cancellato la misura", ctx2.measure("isolamento") !== null);

// Unità diverse: la soglia si legge sul valore, non sulla frase.
var csKOhm = caseStateDopoMerge(turno2, prior, [
  { type: "isolamento", value: 200, unit: "kohm", raw: "200 kohm" }
]);
eq("200 kΩ normalizzati a 0,2 MΩ", orchestrator.buildEvidenceContext(csKOhm).measure("isolamento"), 0.2);

// ─── §5 Sul corpus reale: il contesto non altera il significato ────────
console.log("\n§5 — corpus reale: 21 casi italiani");
var casi = casiItaliani();
eq("21 casi italiani nel corpus", casi.length, 21);

var contestoPresente = 0;
var provePreservate = 0;
var proveRegredite = 0;

casi.forEach(function (caso) {
  // Turno 1 = la domanda vera del cliente; turno 2 = una misura di seguito.
  var p = priorFrom([
    { role: "user", content: caso.domanda },
    { role: "assistant", content: "PROSSIMO PASSO: " + (caso.verifiche && caso.verifiche[0] ? caso.verifiche[0] : "verifica strumentale") }
  ]);
  var seguito = "Ho eseguito la verifica che mi hai indicato.";

  var csCon = caseStateDopoMerge(seguito, p);
  var csSenza = caseStateDopoMerge(seguito, null);

  if (/\[CONTESTO PRECEDENTE\]/.test(csCon.problem_summary)) contestoPresente++;

  var con = orchestrator.buildEvidenceContext(csCon);
  var senza = orchestrator.buildEvidenceContext(csSenza);

  // Il contesto può solo aggiungere: nessuna prova deve sparire.
  if (con.text.length >= senza.text.length) provePreservate++; else proveRegredite++;

  // Il racconto del turno 2 deve contenere le parole della domanda vera.
  var parole = String(caso.domanda).toLowerCase().match(/[a-zàèéìòù]{6,}/g) || [];
  var ritrovate = parole.filter(function (w) { return con.story.indexOf(w.replace(/[àèéìòù]/g, function (c) {
    return { "à": "a", "è": "e", "é": "e", "ì": "i", "ò": "o", "ù": "u" }[c];
  })) !== -1; });
  if (parole.length > 0) {
    check("caso " + caso.id + ": il racconto riporta la domanda del cliente",
      ritrovate.length >= Math.ceil(parole.length * 0.5));
  }
});

eq("contesto riportato su tutti i casi", contestoPresente, casi.length);
eq("nessuna prova regredita aggiungendo il contesto", proveRegredite, 0);
eq("prove preservate su tutti i casi", provePreservate, casi.length);

// ─── Esito ─────────────────────────────────────────────────────────────
console.log("\n============================================================");
console.log("MULTI TURN: " + pass + " passed, " + fail + " failed");
console.log("============================================================");
process.exit(fail === 0 ? 0 : 1);
