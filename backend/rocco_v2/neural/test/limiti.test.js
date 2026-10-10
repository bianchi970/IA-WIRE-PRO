"use strict";

/**
 * Test dei limiti normativi — il ponte fra la scuola e il motore.
 *
 * Prima di `knowledge/limiti.js` gli stessi numeri vivevano in sei posti, e
 * **avevano già divergito**: la temperatura limite su una connessione valeva
 * 70 °C nella regola che conferma un guasto e 80 °C nel fatto che il motore
 * deriva dalla misura; la tensione sana era 207–253 V per il motore e
 * 220–240 V per la rete neurale; l'isolamento sano partiva da 1 MOhm per
 * l'uno e da 5 MOhm per l'altra.
 *
 * Questo test tiene insieme tre cose che prima non si parlavano:
 *
 *  §2 ogni limite risale al punto del **curriculum** che lo insegna, e il
 *     numero compare davvero nel testo che la scuola insegna. Se qualcuno
 *     cambia il curriculum o la tabella senza allineare l'altro, qui si
 *     rompe. È il controllo che impedisce di nuovo la divergenza.
 *  §3 nessun consumatore si tiene più il proprio letterale.
 *  §4 quello che la scuola non insegna è **dichiarato** tale, non spacciato
 *     per norma.
 */

var fs = require("fs");
var path = require("path");
var limiti = require("../../../knowledge/limiti");
var curriculum = require("../curriculum");

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

function leggi(rel) {
  return fs.readFileSync(path.join(__dirname, "..", "..", "..", rel), "utf8");
}

function norm(t) {
  return String(t == null ? "" : t).toLowerCase().replace(/\s+/g, "");
}

// ─── §1 La tabella è usabile ───────────────────────────────────────────
console.log("\n§1 — la tabella");

var tutti = limiti.tutti();
check("ci sono limiti", tutti.length >= 20);

tutti.forEach(function (l) {
  check(l.id + ": ha un valore numerico", typeof l.valore === "number" && isFinite(l.valore));
  check(l.id + ": ha un'unità", !!l.unita);
  check(l.id + ": ha un'etichetta leggibile", !!l.etichetta);
  check(l.id + ": dichiara la provenienza",
    ["norma", "scuola", "pratica"].indexOf(l.fonte) >= 0);
  check(l.id + ": il confronto è dichiarato",
    ["min", "max", "nominale", "riferimento"].indexOf(l.confronto) >= 0);
});

eq("valore() legge il numero", limiti.valore("isolamento_minimo"), 1);
eq("etichetta() dà il testo", limiti.etichetta("isolamento_minimo"), "1 MOhm");
check("intervallo() apre la tolleranza", (function () {
  var i = limiti.intervallo("tensione_fase_neutro");
  return i && Math.round(i[0]) === 207 && Math.round(i[1]) === 253;
})());
eq("intervallo() è null senza tolleranza", limiti.intervallo("isolamento_minimo"), null);

// Un limite inesistente è un difetto, non un valore di ripiego.
var lanciato = false;
try { limiti.valore("limite_che_non_esiste"); } catch (e) { lanciato = true; }
check("valore() lancia su un id inesistente", lanciato);

// ─── §2 Ogni limite risale alla scuola ─────────────────────────────────
console.log("\n§2 — il legame col curriculum");

var livelliPerId = {};
curriculum.LIVELLI.forEach(function (l) { livelliPerId[l.id] = l; });

var normeCitate = {};
curriculum.LIVELLI.forEach(function (l) {
  (l.norme || []).forEach(function (n) { if (n && n.codice) normeCitate[n.codice] = l.id; });
});

tutti.forEach(function (l) {
  if (!l.livello) return;
  var liv = livelliPerId[l.livello];
  check(l.id + ": il livello " + l.livello + " esiste nel curriculum", !!liv);
  if (!liv) return;

  // La norma dichiarata deve essere citata dal curriculum (non
  // necessariamente dallo stesso livello: CEI 64-8 è citata in più punti).
  if (l.norma) {
    check(l.id + ": la norma " + l.norma + " è citata dal curriculum",
      normeCitate[l.norma] !== undefined);
  }

  // Il numero deve comparire nel valore che la scuola insegna per quella
  // grandezza: è il controllo che impedisce la divergenza silenziosa.
  if (l.misura) {
    var m = (liv.misure || []).filter(function (x) { return x.grandezza === l.misura; })[0];
    check(l.id + ": la misura \"" + l.misura + "\" esiste in " + l.livello, !!m);
    if (m && m.valore_tipico) {
      var testo = norm(m.valore_tipico);
      var numero = norm(String(l.valore));
      check(l.id + ": " + l.valore + " compare in \"" + String(m.valore_tipico).slice(0, 40) + "\"",
        testo.indexOf(numero) >= 0);
    }
  }
});

// ─── §3 Nessun consumatore si tiene il proprio numero ──────────────────
console.log("\n§3 — i consumatori leggono, non ridichiarano");

var motore = leggi("engine/diagnosticEngine.js");
var orch = leggi("rocco_v2/orchestrator.js");
var narr = leggi("rocco_v2/narrator.js");
var pattern = leggi("rocco_v2/neural/neural_patterns.js");

[["engine/diagnosticEngine.js", motore],
 ["rocco_v2/orchestrator.js", orch],
 ["rocco_v2/narrator.js", narr],
 ["rocco_v2/neural/neural_patterns.js", pattern]].forEach(function (par) {
  check(par[0] + " legge i limiti", /require\(["'][^"']*knowledge\/limiti["']\)/.test(par[1]));
});

// I letterali che erano sparsi non devono tornare.
check("il motore non ridichiara 230 come nominale", !/NOMINAL_VOLTAGE\s*=\s*230/.test(motore));
check("il motore non ridichiara la tolleranza", !/VOLTAGE_TOLERANCE\s*=\s*0\.10/.test(motore));
check("il motore non confronta l'isolamento con 1 a mano", !/value\s*<\s*1\s*\)/.test(motore));
check("il motore non confronta la temperatura con 80 a mano", !/value\s*>\s*80\b/.test(motore));
check("il motore non confronta la corrente con 16 a mano", !/value\s*>\s*16\b/.test(motore));
check("le confirm rules non hanno più 70 °C", !/>=\s*70\b/.test(orch));
check("le confirm rules non hanno più 50 V a mano", !/<\s*50;/.test(orch));
check("il narratore non ha più l'elenco a mano",
  !/var NORMATIVE_NUMBERS = \[\s*\n\s*6, 10/.test(narr));
check("la rete non ha più 220 come tensione sana", !/220 \+ nc\.rnd/.test(pattern));
check("la rete non ha più 5 MOhm come isolamento sano", !/logNormalize\(5 \+ nc\.rnd/.test(pattern));

// ─── §4 Quello che la scuola non insegna è dichiarato ──────────────────
console.log("\n§4 — chi è nudo si vede");

var nudi = limiti.soloPratica();
check("ci sono limiti senza una norma, ed è dichiarato", nudi.length >= 1);
nudi.forEach(function (l) {
  console.log("    · " + l.fonte + " — " + l.id + " = " + l.etichetta +
    (l.livello ? " (livello " + l.livello + ")" : " (nessun livello)"));
  check(l.id + ": se è pratica, non dichiara una norma",
    l.fonte !== "pratica" || !l.norma);
});

// Il caso che ha motivato tutto: una sola temperatura, dichiarata pratica.
var temp = limiti.limite("temperatura_connessione");
eq("la temperatura su una connessione è una sola", temp.valore, 80);
eq("ed è dichiarata pratica, non norma", temp.fonte, "pratica");
check("la nota spiega che la norma è il delta fra le fasi",
  /delta_t|delta t|fra le fasi/i.test(temp.nota || ""));
check("il delta fra le fasi invece è norma",
  limiti.limite("delta_t_fasi_critico").fonte === "norma");

// ─── §5 I numeri che il narratore può scrivere ─────────────────────────
console.log("\n§5 — i numeri ammessi nelle risposte");

var numeri = limiti.numeriNormativi();
[1, 30, 50, 230, 400, 207, 253, 16].forEach(function (n) {
  check("fra i numeri ammessi c'è " + n, numeri.indexOf(n) >= 0);
});
check("non è un elenco infinito", numeri.length < 60);

console.log("\n============================================================");
console.log("LIMITI NORMATIVI: " + pass + " passed, " + fail + " failed");
console.log("============================================================");
process.exit(fail === 0 ? 0 : 1);
