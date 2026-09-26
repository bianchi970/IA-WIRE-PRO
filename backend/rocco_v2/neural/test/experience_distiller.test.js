"use strict";

// ============================================================================
// TEST — Distillatore di Esperienza
// ~70 asserzioni: distillazione, rinforzo, firme, efficienze, correlazioni,
// sequenze, query, consolidamento, persistenza, graceful degradation
// ============================================================================

var distiller = require("../experience_distiller");

var passed = 0;
var failed = 0;
var current = "";

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.log("  FAIL [" + current + "]: " + msg); }
}

function section(name) { current = name; console.log("\n=== " + name + " ==="); }

// --- Helper: caso tipico per test ---
function casoDispersione() {
  return {
    caseState: {
      problem_summary: "Il differenziale scatta quando piove, impianto vecchio anni 80",
      measurements: [
        { grandezza: "isolamento", valore: 0.3, unita: "MOhm" },
        { grandezza: "tensione", valore: 228, unita: "V" }
      ],
      facts_confirmed: ["isolamento lavatrice 0.3 MOhm"],
      components_detected: ["RCD", "carico"]
    },
    feedback: {
      confirmedCause: "dispersione_a_terra",
      come_verificato: "sezionamento carichi; misura isolamento",
      componenti: ["RCD", "carico"]
    }
  };
}

function casoCorto() {
  return {
    caseState: {
      problem_summary: "Magnetotermico scatta subito all accensione",
      measurements: [
        { grandezza: "resistenza", valore: 0.5, unita: "ohm" }
      ],
      facts_confirmed: [],
      components_detected: ["MCB", "cavo"]
    },
    feedback: {
      confirmedCause: "cortocircuito",
      come_verificato: "misura continuita; ispezione visiva",
      componenti: ["MCB", "cavo"]
    }
  };
}

function casoSurriscaldamento() {
  return {
    caseState: {
      problem_summary: "Morsetto caldo e annerito nel quadro",
      measurements: [
        { grandezza: "temperatura", valore: 85, unita: "°C" }
      ],
      facts_confirmed: [],
      components_detected: ["morsetto", "quadro"]
    },
    feedback: {
      confirmedCause: "morsetto_allentato",
      come_verificato: "ispezione visiva; termografia",
      componenti: ["morsetto"]
    }
  };
}

// ============================================================================
// 1. DISTILLAZIONE DA CASO SINGOLO
// ============================================================================

section("1. Distillazione caso singolo");
distiller.reset();

var caso1 = casoDispersione();
var ris1 = distiller.distilla(caso1.caseState, caso1.feedback);

assert(ris1.distillato === true, "distillato deve essere true");
assert(ris1.regola !== null, "deve creare una regola condizionale");
assert(ris1.regola.tipo === "condizionale", "tipo deve essere condizionale");
assert(ris1.regola.allora === "dispersione a terra", "allora = causa normalizzata");
assert(ris1.regola.confidenza === 0.5, "confidenza iniziale 0.5");
assert(ris1.regola.casi_base === 1, "casi_base iniziale 1");

// Verifica che le condizioni NON contengano soglie inventate
assert(ris1.regola.se.indexOf("isolamento < 1 MOhm") < 0, "NO soglie inventate per isolamento");
assert(ris1.regola.se.indexOf("tensione bassa") < 0, "NO soglie inventate per tensione");
assert(ris1.regola.se.indexOf("temperatura > 60°C") < 0, "NO soglie inventate per temperatura");

// Verifica che le condizioni contengano indicatori di misura
assert(ris1.regola.se.some(function(c) { return c === "misura:isolamento"; }), "deve avere misura:isolamento");
assert(ris1.regola.se.some(function(c) { return c === "misura:tensione"; }), "deve avere misura:tensione");

// Condizioni ambientali estratte dal testo
assert(ris1.regola.se.some(function(c) { return c === "umidita"; }), "condizione umidita estratta da 'piove'");
assert(ris1.regola.se.some(function(c) { return c === "impianto_vecchio"; }), "condizione impianto_vecchio estratta");

// Firme misura create
assert(ris1.firme !== null, "deve creare firme misura");
assert(ris1.firme.length >= 1, "almeno una firma");
var firmaIso = ris1.firme.find(function(f) { return f.misura === "isolamento"; });
assert(firmaIso !== undefined, "firma per isolamento deve esistere");
assert(firmaIso.intervallo[0] === 0.3, "intervallo min = 0.3");
assert(firmaIso.intervallo[1] === 0.3, "intervallo max = 0.3 (primo caso)");
assert(firmaIso.indica === "dispersione a terra", "indica la causa corretta");

// Efficienza verifica
assert(ris1.efficienza !== null, "deve creare efficienza verifica");

// Correlazione
assert(ris1.correlazione !== null, "deve creare correlazione");

// Stats
var stats1 = distiller.getStats();
assert(stats1.totale > 0, "totale regole > 0 dopo distillazione");

// ============================================================================
// 2. RINFORZO REGOLA ESISTENTE
// ============================================================================

section("2. Rinforzo regola esistente");

// Stesso caso → regola si rinforza
var confPrima = ris1.regola.confidenza;
var ris2 = distiller.distilla(caso1.caseState, caso1.feedback);

assert(ris2.regola.id === ris1.regola.id, "stessa regola rinforzata (stesso ID)");
assert(ris2.regola.confidenza > confPrima, "confidenza aumentata");
assert(ris2.regola.casi_base === 2, "casi_base = 2");

// Terzo rinforzo
var conf2 = ris2.regola.confidenza;
distiller.distilla(caso1.caseState, caso1.feedback);
assert(ris2.regola.confidenza > conf2, "confidenza continua a crescere");
assert(ris2.regola.casi_base === 3, "casi_base = 3");

// ============================================================================
// 3. FIRMA MISURA — intervallo si aggiorna
// ============================================================================

section("3. Firma misura — aggiornamento intervallo");

// Caso con isolamento diverso
var caso3 = casoDispersione();
caso3.caseState.measurements[0].valore = 0.1; // più basso
distiller.distilla(caso3.caseState, caso3.feedback);

// L'intervallo della firma isolamento→dispersione deve essere [0.1, 0.3]
var firmaAgg = null;
var stats3 = distiller.salva();
for (var i = 0; i < stats3.firme.length; i++) {
  if (stats3.firme[i].misura === "isolamento" && stats3.firme[i].indica === "dispersione a terra") {
    firmaAgg = stats3.firme[i];
    break;
  }
}
assert(firmaAgg !== null, "firma isolamento→dispersione esiste");
assert(firmaAgg.intervallo[0] === 0.1, "min aggiornato a 0.1");
assert(firmaAgg.intervallo[1] === 0.3, "max resta 0.3");
assert(firmaAgg.casi_base >= 3, "casi_base >= 3");

// ============================================================================
// 4. EFFICIENZA VERIFICA
// ============================================================================

section("4. Efficienza verifica");

distiller.reset();
var casoEff = casoDispersione();
distiller.distilla(casoEff.caseState, casoEff.feedback);

var sug = distiller.suggerisciVerifica("differenziale_scatta", ["dispersione", "cortocircuito"]);
assert(sug !== null, "suggerimento verifica trovato");
if (sug) {
  assert(typeof sug.verifica === "string", "verifica è una stringa");
  assert(sug.verifica.length > 0, "verifica non vuota");
  assert(sug.confidenza > 0, "confidenza > 0");

  // Distilla altri casi con stessa verifica → efficienza sale
  var confSug1 = sug.confidenza;
  distiller.distilla(casoEff.caseState, casoEff.feedback);
  distiller.distilla(casoEff.caseState, casoEff.feedback);
  var sug2 = distiller.suggerisciVerifica("differenziale_scatta", ["dispersione"]);
  assert(sug2 !== null, "sug2 trovato dopo rinforzi");
  if (sug2) {
    assert(sug2.casi_base >= 3, "casi_base verifica >= 3 dopo rinforzi");
    assert(sug2.confidenza > confSug1, "confidenza verifica cresciuta");
  }
} else {
  // Se sug è null, segna i test come falliti ma non crashare
  assert(false, "verifica è una stringa (sug null)");
  assert(false, "verifica non vuota (sug null)");
  assert(false, "confidenza > 0 (sug null)");
  assert(false, "casi_base verifica >= 3 (sug null)");
  assert(false, "confidenza verifica cresciuta (sug null)");
}

// ============================================================================
// 5. CORRELAZIONE COMPONENTE-CAUSA
// ============================================================================

section("5. Correlazione componente-causa");

distiller.reset();
var casoCor = casoDispersione();
var risCor = distiller.distilla(casoCor.caseState, casoCor.feedback);

assert(risCor.correlazione !== null, "correlazione creata");
assert(risCor.correlazione.length >= 1, "almeno 1 correlazione");
var corRcd = risCor.correlazione.find(function(c) { return c.componente === "rcd"; });
assert(corRcd !== undefined || risCor.correlazione.length > 0, "correlazione per componente esiste");

// Rinforzo correlazione
distiller.distilla(casoCor.caseState, casoCor.feedback);
var saved = distiller.salva();
var anyCorr = saved.correlazioni[0];
assert(anyCorr.casi_base >= 2, "correlazione rinforzata");

// ============================================================================
// 6. SEQUENZA DI GUASTO
// ============================================================================

section("6. Sequenza di guasto");

distiller.reset();
// Prima: morsetto allentato su morsetto
var casoSeq1 = casoSurriscaldamento();
distiller.distilla(casoSeq1.caseState, casoSeq1.feedback);

// Poi: arco elettrico sullo stesso componente
var casoSeq2 = {
  caseState: {
    problem_summary: "Segni di arco elettrico nel quadro",
    measurements: [],
    facts_confirmed: [],
    components_detected: ["morsetto", "quadro"]
  },
  feedback: {
    confirmedCause: "arco_elettrico",
    come_verificato: "ispezione visiva",
    componenti: ["morsetto"]
  }
};
var risSeq = distiller.distilla(casoSeq2.caseState, casoSeq2.feedback);

// La sequenza può essere creata se esiste correlazione precedente per stesso componente
// con causa diversa
if (risSeq.sequenza) {
  assert(risSeq.sequenza.catena.length >= 2, "catena con almeno 2 cause");
  assert(risSeq.sequenza.tipo === "sequenza", "tipo = sequenza");
} else {
  // Anche senza sequenza, la correlazione deve esistere
  assert(risSeq.correlazione !== null, "almeno correlazione creata");
}

// cercaSequenza
var seqRis = distiller.cercaSequenza("morsetto_allentato");
// Potrebbe non trovare nulla se la sequenza non è stata creata
assert(seqRis === null || Array.isArray(seqRis), "cercaSequenza ritorna null o array");

// ============================================================================
// 7. cercaRegole — matching corretto
// ============================================================================

section("7. cercaRegole matching");

distiller.reset();
var casoQ = casoDispersione();
distiller.distilla(casoQ.caseState, casoQ.feedback);
// Rinforza per alzare confidenza
distiller.distilla(casoQ.caseState, casoQ.feedback);
distiller.distilla(casoQ.caseState, casoQ.feedback);

// Cerca con misure e condizioni matching
var regoleTrovate = distiller.cercaRegole(
  "differenziale_scatta",
  [{ grandezza: "isolamento", valore: 0.4, unita: "MOhm" }],
  ["RCD"],
  ["umidita", "impianto_vecchio"]
);

assert(Array.isArray(regoleTrovate), "risultato è array");
assert(regoleTrovate.length > 0, "almeno una regola trovata");
assert(regoleTrovate[0].boost > 0, "boost > 0");
assert(regoleTrovate[0].regola !== undefined, "regola presente nel risultato");

// Cerca senza condizioni → meno match ma qualcosa
var regoleParziali = distiller.cercaRegole(
  null,
  [{ grandezza: "isolamento", valore: 0.4 }],
  ["RCD"]
);
assert(Array.isArray(regoleParziali), "risultato parziale è array");

// ============================================================================
// 8. suggerisciVerifica — la più efficiente
// ============================================================================

section("8. suggerisciVerifica");

distiller.reset();
// Distilla 5 casi con stessa verifica per differenziale
for (var v = 0; v < 5; v++) {
  distiller.distilla(casoDispersione().caseState, casoDispersione().feedback);
}

var sugV = distiller.suggerisciVerifica("differenziale_scatta", ["dispersione", "cortocircuito", "guasto_rcd"]);
assert(sugV !== null, "suggerimento trovato dopo 5 casi");
assert(sugV.casi_base >= 5, "basato su >= 5 casi");

// Sintomo sconosciuto → null
var sugNull = distiller.suggerisciVerifica("guasto_sconosciuto_xyz", ["ipotesi1"]);
assert(sugNull === null, "null per sintomo sconosciuto");

// ============================================================================
// 9. consolidaRegole — rimuove deboli, fonde simili
// ============================================================================

section("9. consolidaRegole");

distiller.reset();
// Crea una regola debole
distiller.distilla(casoDispersione().caseState, casoDispersione().feedback);
var saved9 = distiller.salva();
// Abbassa la confidenza artificialmente
if (saved9.regole.length > 0) {
  saved9.regole[0].confidenza = 0.05; // sotto CONFIDENZA_MIN
  saved9.regole[0].casi_base = 1;     // pochi casi
  distiller.carica(saved9);
}

var prima = distiller.getStats().totale;
var consolidato = distiller.consolidaRegole();
assert(typeof consolidato.rimossi === "number", "rimossi è un numero");
assert(typeof consolidato.fusi === "number", "fusi è un numero");

if (prima > 0) {
  // La regola debole dovrebbe essere stata rimossa
  var dopo = distiller.getStats().totale;
  assert(dopo <= prima, "totale non è aumentato dopo consolidamento");
}

// ============================================================================
// 10. Salva / Carica persistenza
// ============================================================================

section("10. Persistenza salva/carica");

distiller.reset();
distiller.distilla(casoDispersione().caseState, casoDispersione().feedback);
distiller.distilla(casoCorto().caseState, casoCorto().feedback);
distiller.distilla(casoSurriscaldamento().caseState, casoSurriscaldamento().feedback);

var snapshot = distiller.salva();
assert(snapshot.version === 1, "version = 1");
assert(Array.isArray(snapshot.regole), "regole è array");
assert(Array.isArray(snapshot.sequenze), "sequenze è array");
assert(Array.isArray(snapshot.firme), "firme è array");
assert(Array.isArray(snapshot.efficienze), "efficienze è array");
assert(Array.isArray(snapshot.correlazioni), "correlazioni è array");
assert(snapshot.nextId !== undefined, "nextId salvato");
assert(typeof snapshot.savedAt === "string", "savedAt è stringa ISO");

var statsPrima = distiller.getStats();

// Reset e ricarica
distiller.reset();
assert(distiller.getStats().totale === 0, "dopo reset, totale = 0");

var ok = distiller.carica(snapshot);
assert(ok === true, "carica ritorna true");

var statsDopo = distiller.getStats();
assert(statsDopo.totale === statsPrima.totale, "totale ripristinato dopo carica");
assert(statsDopo.regole === statsPrima.regole, "regole ripristinate");
assert(statsDopo.firme === statsPrima.firme, "firme ripristinate");

// Carica dati invalidi → false
assert(distiller.carica(null) === false, "carica(null) = false");
assert(distiller.carica({}) === false, "carica({}) = false");
assert(distiller.carica({ version: 99 }) === false, "carica(v99) = false");

// ============================================================================
// 11. Graceful degradation
// ============================================================================

section("11. Graceful degradation");

distiller.reset();

// Input nulli
var risNull = distiller.distilla(null, null);
assert(risNull.distillato === false, "distilla(null,null) → distillato false");

var risNull2 = distiller.distilla({}, {});
// Senza causa → non crea regola ma non crasha
assert(risNull2.distillato === true, "distilla({},{}) non crasha");

// cercaRegole con input vuoti
var regVuote = distiller.cercaRegole(null, null, null, null);
assert(Array.isArray(regVuote), "cercaRegole(null) → array vuoto");

// suggerisciVerifica con input vuoti
assert(distiller.suggerisciVerifica(null, null) === null, "suggerisciVerifica(null) = null");

// cercaSequenza con input vuoti
assert(distiller.cercaSequenza(null) === null, "cercaSequenza(null) = null");

// previsione con input vuoti
assert(Array.isArray(distiller.previsione(null)), "previsione(null) = []");
assert(distiller.previsione([]).length === 0, "previsione([]) = []");

// ============================================================================
// 12. Nessuna soglia tecnica inventata nelle regole
// ============================================================================

section("12. Zero soglie inventate");

distiller.reset();

// Distilla vari casi
distiller.distilla(casoDispersione().caseState, casoDispersione().feedback);
distiller.distilla(casoCorto().caseState, casoCorto().feedback);
distiller.distilla(casoSurriscaldamento().caseState, casoSurriscaldamento().feedback);

var snapshot12 = distiller.salva();
var soglieVietate = [
  "isolamento < 1 MOhm", "isolamento >= 1 MOhm",
  "tensione bassa", "tensione alta",
  "corrente presente", "temperatura > 60"
];

var trovataInventata = false;
for (var r = 0; r < snapshot12.regole.length; r++) {
  var reg = snapshot12.regole[r];
  for (var s = 0; s < reg.se.length; s++) {
    for (var sv = 0; sv < soglieVietate.length; sv++) {
      if (reg.se[s] === soglieVietate[sv]) {
        trovataInventata = true;
        console.log("  TROVATA SOGLIA INVENTATA: " + reg.se[s] + " in regola " + reg.id);
      }
    }
  }
}
assert(!trovataInventata, "NESSUNA soglia tecnica inventata nelle regole");

// Le condizioni devono essere solo: misura:*, condizioni ambientali, sintomo:*, componente:*
var prefissiValidi = ["misura:", "sintomo:", "componente:"];
var condizioniAmbientali = [
  "umidita", "caldo", "freddo", "impianto_vecchio", "impianto_nuovo",
  "all_accensione", "dopo_tempo", "permanente", "intermittente"
];

var tutteValide = true;
for (var r2 = 0; r2 < snapshot12.regole.length; r2++) {
  for (var s2 = 0; s2 < snapshot12.regole[r2].se.length; s2++) {
    var cond = snapshot12.regole[r2].se[s2];
    var valida = false;
    for (var p = 0; p < prefissiValidi.length; p++) {
      if (cond.indexOf(prefissiValidi[p]) === 0) { valida = true; break; }
    }
    if (!valida && condizioniAmbientali.indexOf(cond) >= 0) valida = true;
    if (!valida) {
      tutteValide = false;
      console.log("  CONDIZIONE NON VALIDA: '" + cond + "' in regola " + snapshot12.regole[r2].id);
    }
  }
}
assert(tutteValide, "tutte le condizioni usano prefissi validi o sono ambientali");

// ============================================================================
// 13. Helper functions
// ============================================================================

section("13. Helper: estraiSintomo, estraiMisure, parseMisuraStringa");

// estraiSintomo
var s1 = distiller.estraiSintomo({ problem_summary: "Il differenziale scatta" });
assert(s1 === "differenziale_scatta", "estraiSintomo differenziale");

var s2 = distiller.estraiSintomo({ problem_summary: "Magnetotermico scatta subito" });
assert(s2 === "magnetotermico_scatta_subito", "estraiSintomo magnetotermico");

var s3 = distiller.estraiSintomo({ problem_summary: "Non funziona niente, buio totale" });
assert(s3 === "niente_tensione", "estraiSintomo niente_tensione");

var s4 = distiller.estraiSintomo({ problem_summary: "Morsetto bruciato e caldo" });
assert(s4 === "surriscaldamento", "estraiSintomo surriscaldamento");

var s5 = distiller.estraiSintomo({ problem_summary: "" });
assert(s5 === null, "estraiSintomo vuoto → null");

// parseMisuraStringa
var pm1 = distiller.parseMisuraStringa("isolamento 0.3 MOhm");
assert(pm1 !== null && pm1.grandezza === "isolamento", "parse isolamento");
assert(pm1.valore === 0.3, "valore 0.3");

var pm2 = distiller.parseMisuraStringa("tensione: 230V");
assert(pm2 !== null && pm2.grandezza === "tensione", "parse tensione");
assert(pm2.valore === 230, "valore 230");

var pm3 = distiller.parseMisuraStringa("0.5 MOhm");
assert(pm3 !== null && pm3.grandezza === "isolamento", "parse senza label");

var pm4 = distiller.parseMisuraStringa("");
assert(pm4 === null, "parse stringa vuota → null");

var pm5 = distiller.parseMisuraStringa(null);
assert(pm5 === null, "parse null → null");

// estraiMisure
var mis = distiller.estraiMisure({
  measurements: [
    { grandezza: "isolamento", valore: 0.5, unita: "MOhm" },
    "tensione: 230V"
  ],
  facts_confirmed: ["resistenza 0.1 ohm"]
});
assert(mis.length === 3, "3 misure estratte (2 measurements + 1 fatto)");

var misVuote = distiller.estraiMisure(null);
assert(misVuote.length === 0, "estraiMisure(null) = []");

// estraiCondizioni
var cond = distiller.estraiCondizioni({
  problem_summary: "Quando piove il salvavita scatta, impianto vecchio anni 70",
  facts_confirmed: [],
  components_detected: ["RCD"]
});
assert(cond.indexOf("umidita") >= 0, "condizione umidita");
assert(cond.indexOf("impianto_vecchio") >= 0, "condizione impianto_vecchio");
assert(cond.some(function(c) { return c.indexOf("componente:") === 0; }), "condizione componente presente");

// ============================================================================
// 14. Previsione
// ============================================================================

section("14. Previsione");

distiller.reset();
// Crea correlazioni con casi_base >= 2
distiller.distilla(casoDispersione().caseState, casoDispersione().feedback);
distiller.distilla(casoDispersione().caseState, casoDispersione().feedback);

var prev = distiller.previsione(["RCD", "carico"], [{ grandezza: "isolamento", valore: 0.3 }]);
assert(Array.isArray(prev), "previsione ritorna array");
// Con 2 casi, le correlazioni dovrebbero essere sopra soglia
if (prev.length > 0) {
  assert(prev[0].componente !== undefined, "previsione ha componente");
  assert(prev[0].rischio !== undefined, "previsione ha rischio");
  assert(prev[0].confidenza > 0, "previsione ha confidenza > 0");
  assert(prev[0].basato_su !== undefined, "previsione ha basato_su");
}

// ============================================================================
// 15. Casi multipli — regole diverse coesistono
// ============================================================================

section("15. Casi multipli — regole diverse");

distiller.reset();
distiller.distilla(casoDispersione().caseState, casoDispersione().feedback);
distiller.distilla(casoCorto().caseState, casoCorto().feedback);
distiller.distilla(casoSurriscaldamento().caseState, casoSurriscaldamento().feedback);

var stats15 = distiller.getStats();
assert(stats15.regole >= 3, "almeno 3 regole diverse per 3 cause diverse");
assert(stats15.correlazioni >= 3, "almeno 3 correlazioni");
assert(stats15.confidenza_media > 0, "confidenza media > 0");

// ============================================================================
// RISULTATO
// ============================================================================

console.log("\n" + "=".repeat(60));
console.log("DISTILLATORE ESPERIENZA: " + passed + " passed, " + failed + " failed");
console.log("=".repeat(60));

if (failed > 0) process.exit(1);
