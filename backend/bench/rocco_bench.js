"use strict";

/**
 * BANCO DI PROVA DI ROCCO
 *
 *   cd backend && node bench/rocco_bench.js
 *
 * Un comando, una pagella. Misura sulle domande reali di
 * `rocco_v2/neural/casi_reali_forum.js` le cinque cose che dicono se ROCCO
 * serve a un elettricista, confronta con la linea di base registrata, e
 * **esce con errore se una metrica peggiora**.
 *
 * Perché esiste: fino a ieri ogni numero di qualità veniva da misure che
 * scrivevo a mano, una per blocco, e che sparivano col blocco. Senza una
 * pagella stabile non si vede né un miglioramento né una regressione, e con
 * un corpus di 21 casi il rischio vero non è sbagliare una regola: è tararla
 * su 21 esempi senza accorgersene.
 *
 * Le linee di base sono i numeri misurati al 2026-10-10, dopo i blocchi
 * multi-turn, certezza, pertinenza, senso delle parole e vocabolario.
 * **Si alzano quando una misura le supera, non si abbassano per far passare
 * una modifica.** Se una scende, è una regressione: va spiegata, non
 * riscritta.
 *
 * Nota sul metro: `coerente()` è un confronto lessicale largo fra
 * l'etichetta dell'ipotesi e la causa reale del caso. Non giudica la
 * correttezza di una singola ipotesi — serve a confrontare prima e dopo
 * sullo stesso metro. Un numero che sale è un miglioramento relativo, non
 * una percentuale di diagnosi corrette.
 */

process.env.ROCCO_NARRATOR = process.env.ROCCO_NARRATOR || "0";
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });

var fs = require("fs");
var path = require("path");

// ── Riproducibilità ───────────────────────────────────────────────────
//
// Qui il banco sostituiva `Math.random` con un PRNG a seme fisso, perché il
// motore era non deterministico: `neural_core.js` inizializzava i pesi della
// rete a caso e `neural_patterns.js` generava a caso i suoi esempi di
// addestramento. Due corse di fila davano 10 e 11 casi conclusi.
//
// Quel trucco è stato rimosso perché il difetto è stato corretto alla
// radice: la casualità del neurale ora viene da `nc.rnd()`, con seme fisso e
// `nc.setSeed()` per variarlo deliberatamente. Il banco misura il motore
// come gira in produzione, senza manometterlo — che è l'unico modo perché i
// numeri vogliano dire qualcosa.

var de = require("../engine/diagnosticEngine");
var componenti = require("../knowledge/components.json").items;
var corpus = require("../rocco_v2/neural/casi_reali_forum.js");
var orch = require("../rocco_v2/orchestrator");

var casi = corpus.CASI_FORUM.filter(function (c) { return c.lingua === "it"; });

// ── Isolamento dello stato appreso ────────────────────────────────────
//
// Durante una diagnosi ROCCO scrive quello che impara in
// `data/neural/*.json` e `data/rocco-v2-memory.json`. In un banco di prova
// questo falsa tutto due volte: il caso N+1 viene misurato su un motore che
// ha già visto il caso N, e la corsa lascia lo stato sporco per la
// produzione. Misurato: senza isolamento la stessa metrica dava 14 o 15 su
// 21 a seconda dell'ordine.
//
// Qui lo stato viene fotografato all'avvio, ripristinato **prima di ogni
// caso** — così ogni caso è misurato sullo stesso motore — e rimesso come
// era alla fine.
var FILE_STATO = [];
(function raccogliStato() {
  var dirs = [path.join(__dirname, "..", "data"), path.join(__dirname, "..", "data", "neural")];
  dirs.forEach(function (d) {
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).forEach(function (f) {
      if (!/\.json$/.test(f)) return;
      var p = path.join(d, f);
      if (fs.statSync(p).isFile()) FILE_STATO.push(p);
    });
  });
})();

var SNAPSHOT = {};
FILE_STATO.forEach(function (p) {
  try { SNAPSHOT[p] = fs.readFileSync(p, "utf8"); } catch (e) { /* illeggibile: si ignora */ }
});

function ripristinaStato() {
  Object.keys(SNAPSHOT).forEach(function (p) {
    try {
      if (fs.readFileSync(p, "utf8") !== SNAPSHOT[p]) fs.writeFileSync(p, SNAPSHOT[p], "utf8");
    } catch (e) { /* non bloccare il banco per un file */ }
  });
}

process.on("exit", ripristinaStato);

// ── Linee di base misurate (2026-10-10) ───────────────────────────────
var BASELINE = {
  componenti_fantasma:        { valore: 0,  verso: "min" },   // meno è meglio
  causa_vera_stampata:        { valore: 15, verso: "max" },   // su 21
  causa_vera_attiva:          { valore: 16, verso: "max" },
  rumore_fuori_contesto:      { valore: 0,  verso: "min" },
  conferme_senza_misura:      { valore: 0,  verso: "min" },   // certezze regalate
  casi_conclusi_con_misura:   { valore: 9,  verso: "max" },   // su 13 casi che prescrivono una misura
  conferme_sbagliate:         { valore: 0,  verso: "min" },   // causa vera NON fra le confermate
  contesto_perso_multi_turn:  { valore: 0,  verso: "min" }
};

// ── Etichettatura a mano dei componenti inesistenti ───────────────────
// Derivata dall'attribuzione keyword per keyword di ogni rilevamento.
// FORUM-IT-002 è l'eccezione: lì "interruttori" significa davvero i
// magnetotermici, quindi mcb-curva-c è corretto e non è in elenco.
var FANTASMA = {
  "FORUM-IT-003": ["enclosure-ip", "rcbo-combinato"],
  "FORUM-IT-004": ["caldaia-riscaldamento"],
  "FORUM-IT-005": ["mcb-curva-c", "pulsante-comando"],
  "FORUM-IT-007": ["inverter-vfd", "dimmer"],
  "FORUM-SPEC-001": ["mcb-curva-c"],
  "FORUM-SPEC-003": ["inverter-vfd", "dimmer"],
  "FORUM-SPEC-005": ["timer-relay"],
  "FORUM-IT-014": ["pompa-circolatore"],
  "FORUM-IT-016": ["inverter-vfd", "trasformatore-24v"]
};


// ── Dove il metro lessicale è noto per sbagliare ──────────────────────
//
// `coerente()` confronta parole, non significati. Su FORUM-IT-010 il motore
// conferma "conduttore interrotto nel percorso" misurando una fase a 0 V: è
// la causa reale del caso — "mancanza di una fase, fusibile bruciato o
// contatto del contattore degradato" — detta con altre parole, e il
// confronto lessicale non le collega.
//
// Questi casi sono esclusi dal conteggio e **stampati come nota**: così una
// conferma davvero fuori bersaglio resta visibile, invece di sparire in un
// numero che nessuno guarda più perché è sempre rosso.
var METRO_CIECO = {
  "FORUM-IT-010": "conferma 'conduttore interrotto' = la mancanza di fase del caso, detta con altre parole"
};

// ── La misura del secondo turno la decide il CASO ─────────────────────
//
// Prima la sceglievo io da una parola della domanda, e su FORUM-SPEC-001 —
// "le luci del bagno si accendono da sole", le cui verifiche prescritte sono
// "verificare se c'è un relè crepuscolare" e "separare i cavi di segnale" —
// mettevo in bocca all'utente "ho misurato 0 V a monte". Il motore
// concludeva "interruzione", cioè ragionava bene su una premessa che avevo
// inventato io, e il banco lo segnava come conferma sbagliata.
//
// Ora la misura viene dedotta dalle `verifiche` del caso, che sono parte del
// corpus. Dove il caso non prescrive uno strumento, il secondo turno **non
// si fa**: non si inventa un dato per avere un numero.
var MISURE = {
  isolamento:  "Ho misurato l isolamento col megger: 0,2 MOhm.",
  resistenza:  "Ho misurato la resistenza fase-neutro: 0,5 Ohm.",
  continuita:  "Ho fatto la prova di continuita col tester in buzzer: nessuna continuita sul cavo.",
  tensione:    "Ho misurato la tensione ai morsetti col tester: 0 V.",
  corrente:    "Ho misurato con la pinza amperometrica: 18 A su un circuito da 16 A.",
  corrente_ma: "Ho misurato con la pinza in mA sulla linea: 42 mA di dispersione.",
  temperatura: "Col termometro a infrarossi sul morsetto: 95 gradi.",
  // Dove la verifica dice "sulle 3 fasi", la misura è per fase: con tre fasi
  // a zero un motore non ronzerebbe nemmeno.
  tensione_trifase: "Ho misurato le tre fasi ai morsetti del motore: 400 V, 400 V e 0 V."
};

function misuraPrescritta(caso) {
  var v = norm((caso.verifiche || []).join(" ; "));
  if (/isolamento/.test(v)) return "isolamento";
  if (/resistenza fase/.test(v)) return "resistenza";
  if (/continuit/.test(v)) return "continuita";
  if (/termografia/.test(v)) return "temperatura";
  if (/in ma\b|corrente dispersione|dispersione con/.test(v)) return "corrente_ma";
  if (/misura corrente|pinza amperometrica/.test(v)) return "corrente";
  if (/3 fasi|tre fasi/.test(v)) return "tensione_trifase";
  if (/misura tensione|tensione fase|verifica tensione|tensione sulle/.test(v)) return "tensione";
  return null;   // il caso non prescrive strumenti: niente secondo turno
}

function norm(t) {
  return String(t == null ? "" : t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function coerente(label, causaReale) {
  var a = norm(label);
  var parole = norm(causaReale).match(/[a-z]{5,}/g) || [];
  return parole.some(function (w) { return a.indexOf(w.slice(0, 6)) >= 0; });
}

function ipotesiStampate(answer) {
  var sez = String(answer).split("IPOTESI:")[1] || "";
  sez = sez.split(/\n(?:IPOTESI ESCLUSE|LIVELLO DI CERTEZZA|ANALISI):/)[0];
  return sez.split(/\r?\n/).filter(function (l) { return /^- /.test(l); })
    .map(function (l) { return l.slice(2); });
}

function attive(cs) {
  return (cs.hypotheses || []).filter(function (h) { return h.status === "active"; });
}

// ── La corsa ──────────────────────────────────────────────────────────

var m = {
  componenti_rilevati: 0, componenti_fantasma: 0,
  causa_vera_stampata: 0, causa_vera_attiva: 0,
  ipotesi_stampate: 0, rumore_fuori_contesto: 0,
  conferme_senza_misura: 0,
  casi_conclusi_con_misura: 0, conferme_sbagliate: 0,
  contesto_perso_multi_turn: 0, casi_senza_misura_prescritta: 0,
  certezza_t1: {}, certezza_t2: {}
};
var dettagli = [];
var note = [];

function primoTurno(caso) {
  var q = de.normalizeQuery(caso.domanda);
  var qt = de.tokenize(q);
  var rilevati = componenti.filter(function (c) {
    return de.scoreComponentMatch(c, q, qt) >= 2;
  }).map(function (c) { return c.id; });

  m.componenti_rilevati += rilevati.length;
  rilevati.forEach(function (id) {
    if ((FANTASMA[caso.id] || []).indexOf(id) >= 0) {
      m.componenti_fantasma++;
      dettagli.push(caso.id + ": componente inesistente " + id);
    }
  });

  return orch.runDiagnosis({ message: caso.domanda, user_id: "bench", max_steps: 5 })
    .then(function (r) {
      var cs = r.case_state;
      var stampate = ipotesiStampate(r.answer);
      m.ipotesi_stampate += stampate.length;

      stampate.forEach(function (l) {
        if (orch.isOutOfDomain(l, cs.problem_summary)) {
          m.rumore_fuori_contesto++;
          dettagli.push(caso.id + ": ipotesi fuori contesto stampata — " + l.slice(0, 50));
        }
      });

      if (stampate.some(function (l) { return coerente(l, caso.causa_reale); })) m.causa_vera_stampata++;
      if (attive(cs).some(function (h) { return coerente(h.label, caso.causa_reale); })) m.causa_vera_attiva++;

      // Sul solo racconto nessuna ipotesi deve risultare confermata.
      var confermateSenzaMisura = attive(cs).filter(function (h) { return h.confidence === "confirmed"; });
      if (confermateSenzaMisura.length) {
        m.conferme_senza_misura += confermateSenzaMisura.length;
        dettagli.push(caso.id + ": confermata senza misura — " + confermateSenzaMisura[0].label.slice(0, 44));
      }

      var fc = cs.final_confidence || "?";
      m.certezza_t1[fc] = (m.certezza_t1[fc] || 0) + 1;
      return r;
    });
}

function secondoTurno(caso, rT1) {
  var tipo = misuraPrescritta(caso);
  if (!tipo) { m.casi_senza_misura_prescritta++; return Promise.resolve(); }
  var prior = "UTENTE: " + caso.domanda + "\nROCCO: " + String(rT1.answer).slice(0, 300);
  return orch.runDiagnosis({
    message: MISURE[tipo],
    user_id: "bench", max_steps: 5, prior_context: prior
  }).then(function (r) {
    var cs = r.case_state;

    // Il contesto del primo turno deve essere ancora leggibile.
    if (String(cs.problem_summary).indexOf("[CONTESTO PRECEDENTE]") < 0) {
      m.contesto_perso_multi_turn++;
      dettagli.push(caso.id + ": contesto del primo turno perso al secondo");
    }

    var confermate = attive(cs).filter(function (h) { return h.confidence === "confirmed"; });
    if (confermate.length) {
      m.casi_conclusi_con_misura++;
      if (!confermate.some(function (h) { return coerente(h.label, caso.causa_reale); })) {
        if (METRO_CIECO[caso.id]) {
          note.push(caso.id + ": metro cieco — " + METRO_CIECO[caso.id]);
        } else {
          m.conferme_sbagliate++;
          dettagli.push(caso.id + ": CONFERMA SBAGLIATA — causa reale non fra le confermate (" +
            caso.causa_reale.slice(0, 44) + ")");
        }
      }
    }

    var fc = cs.final_confidence || "?";
    m.certezza_t2[fc] = (m.certezza_t2[fc] || 0) + 1;
  });
}

function riga(nome, ottenuto, su) {
  var base = BASELINE[nome];
  var ok = !base ? true
    : base.verso === "min" ? ottenuto <= base.valore
    : ottenuto >= base.valore;
  var meglio = base && (base.verso === "min" ? ottenuto < base.valore : ottenuto > base.valore);
  var segno = !base ? "  " : ok ? (meglio ? "↑ " : "✓ ") : "✗ ";
  var atteso = base ? (base.verso === "min" ? "≤ " : "≥ ") + base.valore : "—";
  console.log("  " + segno + nome.replace(/_/g, " ").padEnd(28) +
    String(ottenuto + (su ? "/" + su : "")).padStart(7) + "   atteso " + atteso);
  return ok;
}

var catena = Promise.resolve();
casi.forEach(function (caso) {
  catena = catena.then(function () {
    // Ogni caso parte dallo stesso motore: stesso stato appreso e stesso
    // seme, così la differenza fra due casi è il caso, non la corsa.
    ripristinaStato();
    return primoTurno(caso).then(function (r) { return secondoTurno(caso, r); });
  });
});

catena.then(function () {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  BANCO DI PROVA ROCCO — " + casi.length + " domande reali italiane          ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  console.log("\nRICONOSCIMENTO");
  var ok = true;
  console.log("    componenti rilevati                      " + String(m.componenti_rilevati).padStart(4));
  ok = riga("componenti_fantasma", m.componenti_fantasma) && ok;

  console.log("\nIPOTESI");
  ok = riga("causa_vera_stampata", m.causa_vera_stampata, casi.length) && ok;
  ok = riga("causa_vera_attiva", m.causa_vera_attiva, casi.length) && ok;
  console.log("    ipotesi stampate in totale              " + String(m.ipotesi_stampate).padStart(4));
  ok = riga("rumore_fuori_contesto", m.rumore_fuori_contesto) && ok;

  console.log("\nCERTEZZA");
  console.log("    1º turno, solo racconto:  " + JSON.stringify(m.certezza_t1));
  ok = riga("conferme_senza_misura", m.conferme_senza_misura) && ok;
  console.log("    2º turno, con la misura:  " + JSON.stringify(m.certezza_t2));
  ok = riga("casi_conclusi_con_misura", m.casi_conclusi_con_misura, casi.length) && ok;
  ok = riga("conferme_sbagliate", m.conferme_sbagliate) && ok;

  console.log("\nMULTI-TURN");
  ok = riga("contesto_perso_multi_turn", m.contesto_perso_multi_turn) && ok;

  // Informativo: quanta parte del vocabolario è esercitata da frasi vere.
  var chiavi = Object.keys(de.SYNONYM_MAP);
  var tutto = de.normalize(corpus.CASI_FORUM.map(function (c) {
    return [c.domanda, c.causa_reale, (c.verifiche || []).join(" "), c.lezione || ""].join(" ");
  }).join(" \n "));
  var esercitate = chiavi.filter(function (k) { return de.containsKeyword(tutto, de.normalize(k)); }).length;
  console.log("\nCOPERTURA DELLE PROVE (informativo, non un voto)");
  console.log("    casi reali con causa nota:               " + String(corpus.CASI_FORUM.length).padStart(4) +
    "   di cui italiani: " + casi.length);
  console.log("    voci di vocabolario esercitate:          " + String(esercitate).padStart(4) +
    " su " + chiavi.length + " (" + Math.round(esercitate / chiavi.length * 100) + "%)");
  console.log("\n    È il numero che limita tutto il resto: ogni soglia e ogni");
  console.log("    regola di linguaggio è tarata su questi casi. Il modo di");
  console.log("    migliorare ROCCO è farlo crescere, non aggiungere regole.");

  if (note.length) {
    console.log("\nNOTE SUL METRO (" + note.length + ") — non sono difetti di ROCCO");
    note.forEach(function (n) { console.log("    · " + n); });
  }

  if (dettagli.length) {
    console.log("\nDA GUARDARE (" + dettagli.length + ")");
    dettagli.slice(0, 12).forEach(function (d) { console.log("    • " + d); });
    if (dettagli.length > 12) console.log("    … e altri " + (dettagli.length - 12));
  }

  console.log("\n" + (ok
    ? "✓ nessuna regressione rispetto alla linea di base"
    : "✗ REGRESSIONE: una metrica è peggiorata — va spiegata, non riscritta"));
  console.log("");
  process.exit(ok ? 0 : 1);
}).catch(function (err) {
  console.log("ERRORE NEL BANCO: " + (err && err.stack));
  process.exit(1);
});
