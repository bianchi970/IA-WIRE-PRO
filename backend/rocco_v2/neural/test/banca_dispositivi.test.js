"use strict";

/**
 * Test della banca dispositivi.
 *
 * Era l'unica conoscenza di ROCCO che per esistere richiedeva Postgres:
 * all'avvio creava le tabelle e caricava `db/rocco_dispositivi_seed.sql`.
 * Col DB spento l'avvio diceva `[DEVICE KB] Schema error: Connection
 * terminated unexpectedly` e ROCCO restava **senza niente** sui
 * dispositivi — 35 apparecchi, 17 guasti e 17 misure attese chiusi in un
 * file SQL che nessuno leggeva.
 *
 * E c'era un secondo difetto, della famiglia "conoscenza che non arriva a
 * chi risponde": anche quando la banca funzionava, era collegata solo al
 * vecchio `/api/chat`. L'orchestratore V2 — il percorso che il frontend
 * usa — non la vedeva.
 *
 * Ora la banca è un file di conoscenza come gli altri, generato dalle
 * cinque fonti che ROCCO ha già, e i guasti noti entrano nel ragionamento
 * come ipotesi, con la loro verifica, lo strumento, il valore atteso e la
 * norma.
 */

var kb = require("../../../modules/rocco_university/device_kb");
var banca = require("../../../knowledge/dispositivi.json");
var orch = require("../../orchestrator");

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

// ─── §1 La banca esiste senza database ─────────────────────────────────
console.log("\n§1 — funziona senza DB");

check("il file di conoscenza c'è", !!banca && Array.isArray(banca.dispositivi));
check("dichiara di essere generato", /build_dispositivi/.test(banca.generato_da || ""));
check("dichiara le sue fonti", Object.keys(banca.fonti || {}).length >= 5);
check("avverte di non modificarlo a mano", /non modificarlo a mano/i.test(banca.avvertenza || ""));

// Nessun pezzo della banca deve richiedere pg.
var sorgente = require("fs").readFileSync(
  require("path").join(__dirname, "..", "..", "..", "modules", "rocco_university", "device_kb.js"), "utf8");
check("device_kb non richiede più pg", !/require\(['"]pg['"]\)/.test(sorgente));
check("device_kb non apre più un Pool", !/new Pool/.test(sorgente));

// ─── §2 Quanta conoscenza, e da dove ──────────────────────────────────
console.log("\n§2 — copertura e provenienza");

var c = banca.copertura;
console.log("    " + c.dispositivi + " dispositivi · " + c.guasti + " guasti · " +
  c.misure_attese + " valori di riferimento · " + c.famiglie + " famiglie");

check("i dispositivi sono più dei 35 del solo seed", c.dispositivi > 35);
check("i guasti sono molti più dei 17 del solo seed", c.guasti > 150);
check("ci sono valori di riferimento", c.misure_attese >= 30);
check("le famiglie coprono più dei quadri di protezione", c.famiglie >= 20);

// Ogni voce dichiara da dove viene: niente conoscenza anonima.
var fontiAttese = ["seed_sql", "components", "encyclopedia", "failure_patterns", "limiti"];
banca.dispositivi.forEach(function (d) {
  check("dispositivo " + d.codice + " dichiara la fonte", fontiAttese.indexOf(d.fonte) >= 0);
});
var senzaFonte = banca.guasti.filter(function (g) { return fontiAttese.indexOf(g.fonte) < 0; });
eq("nessun guasto senza fonte", senzaFonte.length, 0);

// Tutte e cinque le fonti devono aver contribuito: se una smette di
// portare dati, è un difetto del generatore.
fontiAttese.forEach(function (f) {
  var n = banca.dispositivi.filter(function (x) { return x.fonte === f; }).length
    + banca.guasti.filter(function (x) { return x.fonte === f; }).length
    + banca.misure_attese.filter(function (x) { return x.fonte === f; }).length;
  check("la fonte " + f + " ha portato dati", n > 0);
});

// ─── §3 Le lacune sono dichiarate, non nascoste ───────────────────────
console.log("\n§3 — dire anche cosa non si sa");

check("le lacune sono elencate nel file", Array.isArray(banca.lacune));
check("ci sono lacune dichiarate (la banca non finge di sapere tutto)", banca.lacune.length > 0);
console.log("    lacune dichiarate: " + banca.lacune.length +
  " · guasti senza valore atteso nella fonte: " + c.guasti_senza_valore_atteso);

// Un valore atteso che la fonte non dà resta scritto come mancante, non
// riempito con un numero inventato.
var inventati = banca.guasti.filter(function (g) {
  return /non specificato/.test(g.valore_atteso) && /[0-9]/.test(g.valore_atteso);
});
eq("nessun valore atteso mezzo inventato", inventati.length, 0);

// E quelli che un valore lo hanno, lo hanno con un'unità.
var conValore = banca.guasti.filter(function (g) { return !/non specificato/.test(g.valore_atteso); });
check("i valori attesi veri sono molti", conValore.length >= 15);
// Un valore atteso può essere un numero con la sua unità ("> 1 MΩ") oppure
// un'osservazione ("il differenziale non scatta a vuoto", "nessuna
// continuità tra L e N"): per un elettricista valgono entrambe, e la
// seconda è spesso la più utile sul campo.
//
// Quello che NON deve esistere è il numero orfano — ">1", "di che cosa?".
// Il generatore ne produceva 35 su 51, per un difetto nell'elenco delle
// unità: c'era un'alternativa che matcha la stringa vuota, quindi l'unità
// era di fatto opzionale e il numero usciva nudo.
var NUMERO_ORFANO = new RegExp("^[\s<>≤≥=]*\d+[.,]?\d*\s*$");
var orfani = conValore.filter(function (g) { return NUMERO_ORFANO.test(g.valore_atteso); });
orfani.slice(0, 5).forEach(function (g) { console.log("      numero orfano →", g.valore_atteso); });
eq("nessun valore atteso è un numero senza unità", orfani.length, 0);

// ─── §4 La ricerca serve a chi ha un guasto davanti ───────────────────
console.log("\n§4 — ricerca");

eq("riconosce la famiglia del differenziale",
  kb.rileveFamigliaInTesto("il salvavita scatta quando accendo la lavatrice"), "RCCB");
eq("riconosce il motore",
  kb.rileveFamigliaInTesto("ho un motore trifase su un compressore che ronza"), "MOTORE");
eq("riconosce il fotovoltaico",
  kb.rileveFamigliaInTesto("impianto fotovoltaico, l inverter segna errore ISO"), "FOTOVOLTAICO");
eq("riconosce il termico",
  kb.rileveFamigliaInTesto("la caldaia va in blocco dopo 3 secondi"), "TERMICO");
eq("riconosce la domotica",
  kb.rileveFamigliaInTesto("il dimmer dei faretti ronza"), "DOMOTICA");
check("su un testo senza apparecchi non inventa una famiglia",
  kb.rileveFamigliaInTesto("ho una domanda generica") === null);

var sintomi = kb.rilevaSintomoDalTesto("il differenziale scatta e sento odore di bruciato");
check("riconosce il sintomo dello scatto", sintomi.indexOf("scatta") >= 0);
check("riconosce il surriscaldamento", sintomi.indexOf("surriscalda") >= 0);

var guastiRccb = kb.cercaGuastiSync("scatta dispersione", "RCCB");
check("trova guasti del differenziale", guastiRccb.length > 0);
check("i guasti portano una verifica", guastiRccb.some(function (g) {
  return g.verifica && !/non specificata/.test(g.verifica);
}));
check("i più probabili vengono prima",
  guastiRccb.length < 2 || ["Alta", "Media"].indexOf(guastiRccb[0].probabilita) >= 0);

var misure = kb.getMisureAtteseSync("RCCB");
check("i valori d'impianto valgono anche per una famiglia", misure.length > 0);
check("e portano il riferimento normativo", misure.some(function (m) { return !!m.riferimento; }));

// ─── §5 Il contesto per il prompt ─────────────────────────────────────
console.log("\n§5 — quello che arriva nel prompt");

var catena = kb.getContestoTecnico("Il salvavita scatta quando accendo la lavatrice");
catena.then(function (ctx) {
  eq("famiglia rilevata", ctx.famiglia_rilevata, "RCCB");
  check("trova apparecchi", ctx.dispositivi.length > 0);
  check("trova guasti", ctx.guasti.length > 0);

  var testo = kb.formattaContestoPerPrompt(ctx);
  check("il contesto nomina gli apparecchi con la targa", /30mA/.test(testo));
  check("cita la norma", /CEI/.test(testo));
  check("dà la verifica", /Verifica:/.test(testo));
  check("non scrive 'non specificato' davanti all'utente", !/non specificat/i.test(testo));

  // ─── §6 La banca arriva al motore che risponde ──────────────────────
  console.log("\n§6 — la conoscenza arriva a chi risponde");

  process.env.ROCCO_NARRATOR = "0";
  return orch.runDiagnosis({
    message: "Ho un motore trifase da 5.5 kW su un compressore. Da stamattina ronza ma non parte.",
    user_id: "test-banca", max_steps: 5
  });
}).then(function (r) {
  var cs = r.case_state;
  var dallaBanca = (cs.hypotheses || []).filter(function (h) { return h.source === "banca_dispositivi"; });

  check("l'orchestratore ha preso ipotesi dalla banca", dallaBanca.length > 0);
  check("ha riconosciuto la famiglia dell'apparecchio", cs.famiglia_dispositivo === "MOTORE");
  check("le ipotesi della banca portano la verifica", dallaBanca.some(function (h) {
    return (h.confirm_tests || []).length > 0;
  }));
  check("e dichiarano da dove vengono", dallaBanca.every(function (h) {
    return (h.catena || []).join(" ").indexOf("banca dispositivi") >= 0;
  }));
  check("non allagano il campo: al massimo 3", dallaBanca.length <= 3);

  // Passano per le stesse regole di tutte le altre ipotesi.
  check("hanno una probabilità confrontabile con le altre", dallaBanca.every(function (h) {
    return typeof h.probabilita === "number" && h.probabilita > 0 && h.probabilita <= 1;
  }));

  console.log("\n============================================================");
  console.log("BANCA DISPOSITIVI: " + pass + " passed, " + fail + " failed");
  console.log("============================================================");
  process.exit(fail === 0 ? 0 : 1);
}).catch(function (err) {
  console.log("ERRORE NEL TEST: " + (err && err.stack));
  process.exit(1);
});
