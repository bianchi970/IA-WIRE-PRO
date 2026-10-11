"use strict";

/**
 * TUTTE LE PROVE, UN COMANDO.
 *
 *   cd backend && npm test
 *
 * Perché esiste: `npm test` eseguiva soltanto `test.js` — cinque chiamate
 * HTTP di smoke test, verdi. Le 30 suite che provano il motore
 * (`rocco_v2/neural/test/*.test.js`, `test/*.test.js`) non venivano eseguite
 * da nessun comando: andavano lanciate a mano, una per una, sapendo che
 * esistono. Per mesi "i test passano" ha voluto dire che il server
 * rispondeva, e intanto una suite era rossa da sempre e 35 delle sue
 * funzioni non venivano mai eseguite perché il runner si fermava al primo
 * fallimento.
 *
 * Due regole, le stesse che mancavano:
 *  · **si esegue tutto e poi si conta.** Fermarsi al primo rosso nasconde
 *    quanto si è rossi;
 *  · **l'uscita è diversa da zero se una suite fallisce**, altrimenti un
 *    comando verde non vuol dire niente.
 *
 * Il banco di prova (`bench/rocco_bench.js`) NON è qui: è la pagella della
 * qualità delle diagnosi, si guarda a parte e ha il suo confronto con le
 * linee di base. Queste sono le prove di correttezza.
 */

var fs = require("fs");
var path = require("path");
var child = require("child_process");

var RADICE = path.join(__dirname, "..");

// ── Lo stato appreso dell'utente non si tocca ─────────────────────────
//
// Le suite neurali si addestrano e **salvano**: una corsa di prove
// riscriveva i pesi, gli embedding, gli episodi e il grafo di chi lavora su
// questa macchina. Misurato: dopo un `npm test`, sei file su otto diversi.
// Un comando di verifica che altera la memoria di ROCCO non è una verifica.
//
// Lo stato accumulato viene messo da parte prima di lanciare le suite e
// rimesso identico alla fine, anche se qualcosa va storto (`process.on
// "exit"`). Restano al loro posto il seed di conoscenza e l'enciclopedia.
var DIR_DATA = path.join(RADICE, "data");
var SEED = ["simulator_state.json", "encyclopedia.json"];

function fileDiStato() {
  var out = [];
  [DIR_DATA, path.join(DIR_DATA, "neural")].forEach(function (d) {
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).forEach(function (f) {
      if (!/\.json$/.test(f)) return;
      if (SEED.indexOf(f) >= 0) return;
      var p = path.join(d, f);
      if (fs.statSync(p).isFile()) out.push(p);
    });
  });
  return out;
}

var ACCANTONATO = {};
fileDiStato().forEach(function (p) {
  try { ACCANTONATO[p] = fs.readFileSync(p, "utf8"); fs.unlinkSync(p); } catch (e) { /* non bloccare */ }
});

process.on("exit", function rimetti() {
  // Prima si rimuove quel che le suite hanno creato, poi si rimette l'originale.
  fileDiStato().forEach(function (p) {
    if (ACCANTONATO[p] !== undefined) return;
    try { fs.unlinkSync(p); } catch (e) { /* idem */ }
  });
  Object.keys(ACCANTONATO).forEach(function (p) {
    try { fs.writeFileSync(p, ACCANTONATO[p], "utf8"); } catch (e) { /* idem */ }
  });
});

function suitesIn(dir) {
  var abs = path.join(RADICE, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter(function (f) { return /\.test\.js$/.test(f); })
    .sort()
    .map(function (f) { return path.join(dir, f); });
}

// `test.js` è lo smoke test HTTP: avvia il server su una porta sua e
// interroga gli endpoint. Va per ultimo, perché apre una porta.
var PROVE = suitesIn(path.join("rocco_v2", "neural", "test"))
  .concat(suitesIn("test"))
  .concat(["test.js"]);

var falliti = [];
var durate = [];

console.log("\nTUTTE LE PROVE — " + PROVE.length + " suite\n");

PROVE.forEach(function (rel) {
  var inizio = Date.now();
  var esito = child.spawnSync(process.execPath, [rel], {
    cwd: RADICE,
    encoding: "utf8",
    timeout: 10 * 60 * 1000
  });
  var secondi = Math.round((Date.now() - inizio) / 100) / 10;
  durate.push([rel, secondi]);

  var ok = esito.status === 0;
  if (!ok) falliti.push([rel, esito]);

  // Dalla coda di ogni suite si pesca il riepilogo, se ne stampa uno.
  var uscita = String(esito.stdout || "") + String(esito.stderr || "");
  var riepilogo = (uscita.match(/[0-9]+ passed, [0-9]+ failed|Risultato: [0-9]+\/[0-9]+ PASS/g) || []).pop() || "";

  console.log("  " + (ok ? "✓" : "✗") + " " +
    path.basename(rel).padEnd(38) +
    String(secondi + "s").padStart(7) + "   " + riepilogo);
});

console.log("\n============================================================");
console.log("TOTALE: " + (PROVE.length - falliti.length) + " suite verdi, " + falliti.length + " rosse");
console.log("============================================================");

falliti.forEach(function (f) {
  console.log("\n✗ " + f[0]);
  var uscita = String(f[1].stdout || "") + String(f[1].stderr || "");
  // Le ultime righe: lì sta il motivo.
  uscita.split(/\r?\n/).slice(-22).forEach(function (r) {
    if (r.trim()) console.log("    " + r);
  });
});

var lente = durate.slice().sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3);
console.log("\nLe più lente: " + lente.map(function (d) {
  return path.basename(d[0]) + " " + d[1] + "s";
}).join(", "));
console.log("");

process.exit(falliti.length === 0 ? 0 : 1);
