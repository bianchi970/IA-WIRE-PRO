"use strict";

/**
 * Test: nelle OSSERVAZIONI non entra la contabilità interna del motore.
 *
 * `facts_confirmed` riceve anche le `osservazioni` del motore diagnostico
 * (case_state.js: toolResult.evidence) e `cleanFacts` dà priorità alle
 * frasi sugli slug: quelle righe sono frasi, quindi occupavano tutti e sei
 * i posti e spingevano fuori i fatti veri. Con il narratore che torna alla
 * bozza — comportamento previsto quando riformula un'ipotesi che il motore
 * non afferma — l'elettricista leggeva:
 *
 *   - Keyword tecniche rilevate: misura, megohmetro, dispersione.
 *   - CASO: domini osservati isolamento, differenziale.
 *   - SAFETY: safe - Nessun blocco safety critico emerso.
 *   - AZIONE IMMEDIATA: Procedere con il prossimo passo tecnico coerente.
 *   - Differenziale conf=0.70
 *
 * Criterio: si scarta la contabilità interna e ciò che duplica un'altra
 * sezione del referto (SAFETY → RISCHI REALI, AZIONE IMMEDIATA → PROSSIMO
 * PASSO, IPOTESI → IPOTESI). Resta quel che afferma un fatto sull'impianto.
 */

var lexicon = require("../../lexicon");

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

// ─── §1 Riconoscimento della contabilità interna ───────────────────────
console.log("\n§1 — cosa è contabilità interna");

// Le righe vere emesse da engine/diagnosticEngine.js.
[
  "Keyword tecniche rilevate: misura, megohmetro, dispersione, isolamento.",
  "CASO: domini osservati isolamento, differenziale.",
  "MEMORIA TECNICA: trovati 1 casi simili validati.",
  "SAFETY: safe - Nessun blocco safety critico emerso dalle evidenze normalizzate.",
  "AZIONE IMMEDIATA: Procedere con il prossimo passo tecnico coerente con la causa dominante.",
  "IPOTESI: [dispersione, sovraccarico]"
].forEach(function (riga) {
  check("scartata: " + riga.slice(0, 32), lexicon.isEngineInternal(riga));
});

// Quello che invece è un fatto sull'impianto e deve restare.
[
  "Valori misurati rilevati: 0.2MΩ (isolamento).",
  "CONTRADDIZIONE: la misura non concorda con il sintomo descritto.",
  "il differenziale scatta",
  "isolamento verso terra basso",
  "coinvolto un elettrodomestico",
  "Immagine allegata: integrare le verifiche con l'analisi visiva."
].forEach(function (riga) {
  check("tenuta: " + riga.slice(0, 32), !lexicon.isEngineInternal(riga));
});

// Il confronto è sull'inizio della riga: una frase che *parla* di sicurezza
// non è la riga di servizio "SAFETY:".
check("non scarta una frase che cita la sicurezza a metà",
  !lexicon.isEngineInternal("Il quadro non ha protezioni: safety critica da ripristinare."));

// ─── §2 cleanFacts: i fatti veri non vengono più spinti fuori ──────────
console.log("\n§2 — i fatti veri arrivano all'utente");

var fattiReali = [
  "Keyword tecniche rilevate: misura, megohmetro, dispersione, isolamento.",
  "CASO: domini osservati isolamento, differenziale.",
  "MEMORIA TECNICA: trovati 1 casi simili validati.",
  "SAFETY: safe - Nessun blocco safety critico.",
  "AZIONE IMMEDIATA: Procedere con il prossimo passo tecnico.",
  "Valori misurati rilevati: 0.2MΩ (isolamento).",
  "il differenziale scatta",
  "isolamento verso terra basso",
  "coinvolto un elettrodomestico",
  "il difetto si presenta sotto carico"
];

var puliti = lexicon.cleanFacts(fattiReali, 6);

// Cinque: tanti quanti sono i fatti veri nell'elenco. Prima le cinque righe
// di servizio saturavano i sei posti e ne arrivava uno solo.
eq("arrivano tutti i fatti veri", puliti.length, 5);
check("nessuna riga di contabilità interna", puliti.every(function (f) {
  return !lexicon.isEngineInternal(f);
}));
check("la misura c'è", puliti.some(function (f) { return /0\.2/.test(f); }));
check("il sintomo c'è", puliti.some(function (f) { return /differenziale scatta/.test(f); }));
check("l'isolamento basso c'è", puliti.some(function (f) { return /isolamento verso terra basso/.test(f); }));
check("il carico c'è", puliti.some(function (f) { return /sotto carico/.test(f); }));

// Prima del filtro le cinque righe di servizio saturavano i sei posti:
// restava un solo fatto vero.
var quantiVeriPrima = fattiReali.filter(function (f) {
  return !lexicon.isEngineInternal(f);
}).length;
check("i fatti veri disponibili erano più dei posti liberi di prima", quantiVeriPrima >= 5);

// Con pochi fatti non si inventa nulla e non si duplica.
eq("elenco vuoto resta vuoto", lexicon.cleanFacts([], 6).length, 0);
eq("solo contabilità interna → nessun fatto", lexicon.cleanFacts([
  "SAFETY: safe", "AZIONE IMMEDIATA: procedere"
], 6).length, 0);
eq("duplicati rimossi", lexicon.cleanFacts([
  "il differenziale scatta", "il differenziale scatta"
], 6).length, 1);

// ─── §3 Gli strumenti non scrivono annotazioni da macchina ─────────────
console.log("\n§3 — gli strumenti parlano italiano");

var recognition = require("../../tools/recognition_tool");
return recognition.run({ problem_summary: "il differenziale scatta quando accendo la lavatrice" }, {})
  .then(function (res) {
    var ev = res.evidence || [];
    check("il recognition_tool non emette 'conf=' nelle evidenze",
      ev.every(function (e) { return String(e).indexOf("conf=") < 0; }));
    check("i punteggi restano in raw_ref per chi li usa",
      !!(res.raw_ref && Array.isArray(res.raw_ref.scored_components)));
    if (res.raw_ref.scored_components.length) {
      check("e lì hanno ancora il numero",
        typeof res.raw_ref.scored_components[0].confidence === "number");
    } else {
      pass++; // niente componenti su questo testo: nulla da verificare
    }

    console.log("\n============================================================");
    console.log("OSSERVAZIONI PULITE: " + pass + " passed, " + fail + " failed");
    console.log("============================================================");
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch(function (err) {
    console.log("ERRORE NEL TEST: " + (err && err.stack));
    process.exit(1);
  });
