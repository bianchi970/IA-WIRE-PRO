"use strict";

/**
 * NIENTE STRADE MORTE.
 *
 *   cd backend && node test/niente_strade_morte.test.js
 *
 * Ogni file `.js` del backend deve essere **una** di queste cose:
 *
 *   · raggiungibile da `server.js` — partecipa al flusso vivo
 *        input → percezione → sicurezza → ragionamento → simulazione
 *        → verifica → risposta → caso chiuso → apprendimento
 *   · un comando dichiarato in `package.json` (`npm run …`)
 *   · una prova (`test/`, `bench/`, `*.test.js`)
 *   · il corpus d'esame
 *
 * Nient'altro. Un file che non è in nessuna di queste categorie è una strada
 * morta: non si esegue, non si misura, non si aggiorna — e intanto sembra
 * codice vero. Il difetto che si ripete in questo progetto è *conoscenza che
 * non arriva*, e una strada morta è la sua forma più grande.
 *
 * Perché questo test esiste. Dal 2026-10-11 sono state ritirate 3.924 righe
 * di loop legacy più 838 di strumenti di studio, e in entrambi i casi il
 * problema non era che il codice fosse sbagliato: era che **nessuno sapeva
 * che non girava**. La mappa va ricostruita dopo ogni aggiunta, e un test la
 * ricostruisce da sé.
 *
 * Non misura la qualità: misura che non ci sia codice orfano. Se aggiungi uno
 * strumento, dichiaralo in `package.json` — una riga — e questo test tace.
 */

var fs = require("fs");
var path = require("path");
var assert = require("assert");

var RADICE = path.join(__dirname, "..");

var pass = 0;
var fail = 0;
function check(label, cond) {
  if (cond) pass++;
  else { fail++; console.log("  ✗ " + label); }
}

// ── Il grafo vero: il risolutore di Node a partire da server.js ───────
function risolvi(da, spec) {
  if (spec.charAt(0) !== ".") return null;              // pacchetto npm
  var p = path.resolve(path.dirname(da), spec);
  var candidati = [p, p + ".js", path.join(p, "index.js")];
  for (var i = 0; i < candidati.length; i++) {
    try { if (fs.statSync(candidati[i]).isFile()) return candidati[i]; } catch (e) {}
  }
  return null;
}

function raggiungibili(ingresso) {
  var visti = {};
  (function cammina(f) {
    if (visti[f]) return;
    visti[f] = true;
    var src;
    try { src = fs.readFileSync(f, "utf8"); } catch (e) { return; }
    var re = /require\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
    var m;
    while ((m = re.exec(src))) {
      var r = risolvi(f, m[1]);
      if (r) cammina(r);
    }
  })(ingresso);
  return visti;
}

function tuttiIFile(dir) {
  var out = [];
  (function rec(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === "data") return;
      var f = path.join(d, e.name);
      if (e.isDirectory()) rec(f);
      else if (/\.js$/.test(e.name)) out.push(f);
    });
  })(dir);
  return out;
}

function rel(f) { return path.relative(RADICE, f).split(path.sep).join("/"); }

console.log("\n============================================================");
console.log("NIENTE STRADE MORTE");
console.log("============================================================\n");

var vivi = raggiungibili(path.join(RADICE, "server.js"));
var tutti = tuttiIFile(RADICE);

// ── I comandi dichiarati in package.json ─────────────────────────────
var scripts = require(path.join(RADICE, "package.json")).scripts || {};
var dichiarati = {};
Object.keys(scripts).forEach(function (nome) {
  // "node knowledge/build_dispositivi.js" → knowledge/build_dispositivi.js
  var m = /node\s+([^\s]+\.js)/.exec(String(scripts[nome]));
  if (m) dichiarati[m[1].split(path.sep).join("/")] = nome;
});

check("package.json dichiara dei comandi", Object.keys(dichiarati).length > 0);

// Ogni comando dichiarato deve esistere: uno script che punta a un file
// cancellato è l'altra faccia dello stesso problema.
Object.keys(dichiarati).forEach(function (f) {
  check("il comando `npm run " + dichiarati[f] + "` punta a un file che esiste: " + f,
    fs.existsSync(path.join(RADICE, f)));
});

// ── Chi è uno strumento raggiungibile DAI comandi ────────────────────
// Un comando può avere i suoi moduli: anche quelli sono legittimi.
var daiComandi = {};
Object.keys(dichiarati).forEach(function (f) {
  var ingresso = path.join(RADICE, f);
  if (!fs.existsSync(ingresso)) return;
  var r = raggiungibili(ingresso);
  Object.keys(r).forEach(function (x) { daiComandi[x] = true; });
});

// ── Chi è raggiungibile DALLE prove ──────────────────────────────────
var dalleProve = {};
tutti.filter(function (f) {
  return /(^|\/)(test|bench)(\/|$)|\.test\.js$/.test(rel(f));
}).forEach(function (f) {
  var r = raggiungibili(f);
  Object.keys(r).forEach(function (x) { dalleProve[x] = true; });
});

// ── Il verdetto ──────────────────────────────────────────────────────
var orfani = [];
tutti.forEach(function (f) {
  var r = rel(f);
  if (vivi[f]) return;                                        // flusso vivo
  if (/(^|\/)(test|bench)(\/|$)|\.test\.js$/.test(r)) return;  // è una prova
  if (dichiarati[r]) return;                                   // comando npm
  if (daiComandi[f]) return;                                   // modulo di un comando
  if (dalleProve[f]) return;                                   // serve a una prova
  orfani.push(r);
});

var righe = function (r) {
  try { return fs.readFileSync(path.join(RADICE, r), "utf8").split("\n").length; }
  catch (e) { return 0; }
};

console.log("  file totali: " + tutti.length);
console.log("  nel flusso vivo (da server.js): " + Object.keys(vivi).length);
console.log("  comandi dichiarati in package.json: " + Object.keys(dichiarati).length);

if (orfani.length) {
  var tot = 0;
  console.log("\n  ORFANI (" + orfani.length + "):");
  orfani.sort().forEach(function (r) {
    var n = righe(r);
    tot += n;
    console.log("    " + String(n).padStart(5) + "  " + r);
  });
  console.log("    " + String(tot).padStart(5) + "  righe in totale");
  console.log("\n  Un file orfano non è raggiungibile dal server, non è un");
  console.log("  comando dichiarato e non serve a nessuna prova. Due strade:");
  console.log("  dichiararlo in `package.json` (se è uno strumento) oppure");
  console.log("  ritirarlo. Lasciarlo lì è la terza, ed è quella che costa.");
}

check("nessun file orfano", orfani.length === 0);

console.log("\n============================================================");
console.log("NIENTE STRADE MORTE: " + pass + " passed, " + fail + " failed");
console.log("============================================================");
process.exit(fail === 0 ? 0 : 1);
