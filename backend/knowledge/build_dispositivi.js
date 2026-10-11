"use strict";

/**
 * COSTRUISCE LA BANCA DISPOSITIVI DI ROCCO
 *
 *   cd backend && node knowledge/build_dispositivi.js
 *
 * Non inventa niente: raccoglie la conoscenza sui dispositivi che ROCCO ha
 * già, sparsa in cinque posti con cinque forme diverse, e la mette in un
 * file leggibile senza database.
 *
 * ── Perché ───────────────────────────────────────────────────────────
 *
 * La banca dispositivi (`modules/rocco_university/device_kb.js`) era
 * l'unico pezzo di conoscenza che per esistere richiedeva Postgres: le
 * tabelle venivano create e popolate all'avvio da `db/rocco_dispositivi_*.sql`.
 * Col DB spento l'avvio diceva `[DEVICE KB] Schema error: Connection
 * terminated unexpectedly` e ROCCO restava senza sapere nulla dei
 * dispositivi — 35 apparecchi, 17 guasti e 17 misure attese chiusi in un
 * file SQL che nessuno poteva leggere.
 *
 * ── Le sei fonti ─────────────────────────────────────────────────────
 *
 *  1. `db/rocco_dispositivi_seed.sql`  35 apparecchi con targa e norma,
 *     17 guasti con verifica/strumento/valore atteso, 17 misure attese.
 *  2. `knowledge/components.json`      50 componenti, ognuno con guasti
 *     tipici e verifiche di campo.
 *  3. `data/encyclopedia.json`         24 componenti con specifiche di
 *     targa e guasti con sintomi, cause, prove e rimedi.
 *  4. `knowledge/failure_patterns.json` 40 pattern di guasto non legati a
 *     un dispositivo: valgono per famiglia o per impianto.
 *  5. `knowledge/limiti.js`            22 limiti normativi → diventano i
 *     valori di riferimento, con la norma che li fonda.
 *
 * ── La regola ────────────────────────────────────────────────────────
 *
 * Ogni voce porta `fonte`. Nessuna riga nasce qui: se un dato non c'è in
 * nessuna delle sei fonti, **manca**, e il file lo dichiara nella
 * sezione `lacune`. Dire "non lo so" è parte della conoscenza.
 */

var fs = require("fs");
var path = require("path");

var QUI = __dirname;
var BACKEND = path.join(QUI, "..");
var USCITA = path.join(QUI, "dispositivi.json");

function leggiJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(BACKEND, rel), "utf8"));
}

// ── 1. Il seed SQL ────────────────────────────────────────────────────
//
// Si legge il SQL invece di ricopiarlo: quel file resta la fonte di quei
// 35 apparecchi, e se qualcuno lo aggiorna basta rigenerare.

/** Divide una tupla SQL rispettando gli apici e i doppi apici di escape. */
function dividiTupla(testo) {
  var campi = [];
  var corrente = "";
  var dentroApici = false;
  var i = 0;
  while (i < testo.length) {
    var c = testo[i];
    if (dentroApici) {
      if (c === "'" && testo[i + 1] === "'") { corrente += "'"; i += 2; continue; }
      if (c === "'") { dentroApici = false; i++; continue; }
      corrente += c; i++; continue;
    }
    if (c === "'") { dentroApici = true; i++; continue; }
    if (c === ",") { campi.push(corrente.trim()); corrente = ""; i++; continue; }
    corrente += c; i++;
  }
  campi.push(corrente.trim());
  return campi.map(function (v) {
    if (v === "NULL" || v === "") return null;
    return v;
  });
}

function numero(v) {
  if (v === null) return null;
  var n = parseFloat(String(v).replace(",", "."));
  return isFinite(n) ? n : null;
}

/** Estrae le tuple di ogni INSERT con le sue colonne dichiarate. */
function leggiSeed() {
  var sql = fs.readFileSync(path.join(BACKEND, "db", "rocco_dispositivi_seed.sql"), "utf8");
  var out = { rocco_dispositivi: [], rocco_guasti: [], rocco_misure_attese: [] };

  var re = /INSERT INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);/g;
  var m;
  while ((m = re.exec(sql)) !== null) {
    var tabella = m[1];
    if (!out[tabella]) continue;
    var colonne = m[2].split(",").map(function (c) { return c.trim(); });
    var corpo = m[3];

    // Ogni tupla è un gruppo fra parentesi a inizio riga.
    var tuple = [];
    var liv = 0, buf = "", dentro = false, apici = false;
    for (var i = 0; i < corpo.length; i++) {
      var c = corpo[i];
      if (apici) { buf += c; if (c === "'" && corpo[i + 1] !== "'") apici = false; else if (c === "'") { buf += corpo[++i]; } continue; }
      if (c === "'") { apici = true; buf += c; continue; }
      if (c === "(") { liv++; if (liv === 1) { dentro = true; buf = ""; continue; } }
      if (c === ")") { liv--; if (liv === 0 && dentro) { tuple.push(buf); dentro = false; continue; } }
      if (dentro) buf += c;
    }

    tuple.forEach(function (t) {
      var valori = dividiTupla(t);
      if (valori.length !== colonne.length) return;   // tupla malformata: si scarta
      var riga = {};
      colonne.forEach(function (col, idx) { riga[col] = valori[idx]; });
      out[tabella].push(riga);
    });
  }
  return out;
}

// ── 2. Famiglie: come si chiama una cosa nella banca ──────────────────
//
// Le famiglie sono quelle che `device_kb.js` già riconosce nel testo
// dell'utente (FAMIGLIA_PATTERNS). Qui si aggiungono quelle che le altre
// fonti portano: la banca deve coprire quello che ROCCO sa, non solo i
// quadri di protezione.
var CATEGORIA_FAMIGLIA = {
  rcd: "RCCB", rcbo: "RCBO", mcb: "MCB", mccb: "MCCB",
  contactor: "CONTATTORE", relay: "RELE", plc: "PLC",
  transformer: "TRASFORMATORE", current_transformer: "TRASFORMATORE",
  isolator: "SEZIONATORE", disconnector: "SEZIONATORE",
  surge: "SPD", enclosure: "QUADRO", main_panel: "QUADRO", busbar: "QUADRO",
  terminal: "MORSETTIERA", fuse: "FUSIBILE",
  motor: "MOTORE", motor_protector: "MOTORE", overload_relay: "MOTORE",
  soft_starter: "MOTORE", inverter: "INVERTER", pv_inverter: "FOTOVOLTAICO",
  battery_storage: "FOTOVOLTAICO", generator: "GENERAZIONE", ats: "GENERAZIONE",
  ups: "UPS", power_supply: "ALIMENTATORE",
  heating: "TERMICO", pump: "TERMICO", heat_pump: "TERMICO",
  motorized_valve: "TERMICO", pressure_switch: "TERMICO",
  sensor: "SENSORE", temp_sensor: "SENSORE", pir_sensor: "DOMOTICA",
  dimmer: "DOMOTICA", twilight_switch: "DOMOTICA", timer: "DOMOTICA",
  pushbutton: "COMANDO", selector: "COMANDO", indicator_light: "COMANDO",
  emergency_stop: "SICUREZZA", safety_relay: "SICUREZZA",
  alarm_sounder: "SEGNALAZIONE", tower_light: "SEGNALAZIONE",
  monitoring_relay: "MISURA", energy_meter: "MISURA", power_analyzer: "MISURA",
  ev_charger: "RICARICA"
};

function famigliaDaCategoria(cat) {
  return CATEGORIA_FAMIGLIA[String(cat || "").toLowerCase()] || "ALTRO";
}

// Famiglia dal tipo dichiarato nell'enciclopedia (RCD, MCB, caldaia…)
var TIPO_FAMIGLIA = {
  rcd: "RCCB", rcbo: "RCBO", mcb: "MCB", mccb: "MCCB",
  contattore: "CONTATTORE", rele: "RELE", motore: "MOTORE",
  inverter: "INVERTER", caldaia: "TERMICO", pompa: "TERMICO",
  termostato: "TERMICO", spd: "SPD", ups: "UPS", plc: "PLC",
  router: "RETE", switch: "RETE", "access point": "RETE",
  telecamera: "RETE", nvr: "RETE"
};

function famigliaDaTipo(tipo, categoria) {
  var t = String(tipo || "").toLowerCase();
  if (TIPO_FAMIGLIA[t]) return TIPO_FAMIGLIA[t];
  for (var k in TIPO_FAMIGLIA) {
    if (t.indexOf(k) >= 0) return TIPO_FAMIGLIA[k];
  }
  var c = String(categoria || "").toLowerCase();
  if (/protez/.test(c)) return "QUADRO";
  if (/riscald|idraul/.test(c)) return "TERMICO";
  if (/rete/.test(c)) return "RETE";
  if (/domot/.test(c)) return "DOMOTICA";
  return "ALTRO";
}

// ── 3. Il montaggio ───────────────────────────────────────────────────

function codice(prefisso, chiave) {
  return prefisso + "-" + String(chiave).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function costruisci() {
  var seed = leggiSeed();
  var componenti = leggiJson("knowledge/components.json").items;
  var enciclopedia = leggiJson("data/encyclopedia.json").components;
  var pattern = leggiJson("knowledge/failure_patterns.json");
  pattern = pattern.items || pattern.patterns || Object.values(pattern).find(Array.isArray) || [];
  var limiti = require("./limiti");
// La scuola di ROCCO: 22 livelli, e in 19 di essi i guasti che insegna.
var curriculum = require("../rocco_v2/neural/curriculum");

  var dispositivi = [];
  var guasti = [];
  var misure = [];

  // ── 3a. Dal seed SQL: apparecchi con targa, guasti con procedura ────
  seed.rocco_dispositivi.forEach(function (d) {
    dispositivi.push({
      codice: d.codice, famiglia: d.famiglia, sottofamiglia: d.sottofamiglia || null,
      nome: d.nome, marca: d.marca || null,
      tensione_nominale_V: numero(d.tensione_nominale_V),
      corrente_nominale_A: numero(d.corrente_nominale_A),
      potere_interruzione_kA: numero(d.potere_interruzione_kA),
      corrente_differenziale_mA: numero(d.corrente_differenziale_mA),
      tipo_differenziale: d.tipo_differenziale || null,
      applicazione: d.applicazione || null,
      note_normative: d.note_normative || null,
      fonte: "seed_sql"
    });
  });

  seed.rocco_guasti.forEach(function (g) {
    guasti.push({
      dispositivo_codice: g.dispositivo_codice || null,
      famiglia: g.famiglia, sintomo: g.sintomo,
      causa_probabile: g.causa_probabile,
      probabilita: g.probabilita || "Media",
      verifica: g.verifica, strumento: g.strumento,
      valore_atteso: g.valore_atteso,
      rischio: g.rischio || null,
      riferimento_norma: g.riferimento_norma || null,
      fonte: "seed_sql"
    });
  });

  seed.rocco_misure_attese.forEach(function (m) {
    misure.push({
      famiglia: m.famiglia, parametro: m.parametro,
      valore_minimo: numero(m.valore_minimo), valore_massimo: numero(m.valore_massimo),
      unita: m.unita || null, condizione: m.condizione || null,
      riferimento: m.riferimento_norma || m.riferimento || null,
      fonte: "seed_sql"
    });
  });

  // ── 3b. Dai 50 componenti locali: ogni guasto tipico con la sua
  //        verifica di campo. È la fonte più ampia per famiglia.
  componenti.forEach(function (c) {
    var fam = famigliaDaCategoria(c.category);
    var cod = codice("CMP", c.id);
    dispositivi.push({
      codice: cod, famiglia: fam, sottofamiglia: c.category || null,
      nome: c.id.replace(/-/g, " "), marca: c.brand || null,
      tensione_nominale_V: null, corrente_nominale_A: null,
      potere_interruzione_kA: null, corrente_differenziale_mA: null,
      tipo_differenziale: null,
      applicazione: (c.functions || [])[0] || null,
      note_normative: c.notes || null,
      parole_chiave: c.keywords || [],
      segni_visivi: c.visual_cues || [],
      fonte: "components"
    });

    var verifiche = c.field_checks || [];
    (c.typical_faults || []).forEach(function (f, i) {
      var parti = String(f).split(":");
      guasti.push({
        dispositivo_codice: cod, famiglia: fam,
        sintomo: parti.length > 1 ? parti[0].trim() : String(f).slice(0, 60),
        causa_probabile: parti.length > 1 ? parti.slice(1).join(":").trim() : String(f),
        probabilita: "Media",
        verifica: verifiche[i] || verifiche[0] || "verifica non specificata nella fonte",
        strumento: dedurreStrumento(verifiche[i] || verifiche[0] || ""),
        valore_atteso: "non specificato nella fonte",
        rischio: null, riferimento_norma: null,
        fonte: "components"
      });
    });
  });

  // ── 3c. Dall'enciclopedia: specifiche di targa e guasti con prove ───
  enciclopedia.forEach(function (e) {
    var fam = famigliaDaTipo(e.type, e.category);
    var cod = codice("ENC", (e.brand || "") + "-" + (e.model || e.name));
    var sp = e.technical_specs || {};
    dispositivi.push({
      codice: cod, famiglia: fam, sottofamiglia: e.type || null,
      nome: e.name, marca: e.brand || null,
      tensione_nominale_V: numero(String(sp.tensione || "").replace(/[^0-9.]/g, "")),
      corrente_nominale_A: numero(String(sp.In || "").replace(/[^0-9.]/g, "")),
      potere_interruzione_kA: numero(String(sp.Icu || "").replace(/[^0-9.]/g, "")),
      corrente_differenziale_mA: numero(String(sp.Idn || "").replace(/[^0-9.]/g, "")),
      tipo_differenziale: sp.tipo || null,
      applicazione: e.category || null,
      note_normative: null,
      specifiche: sp,
      fonte: "encyclopedia"
    });

    (e.issues || []).forEach(function (is) {
      guasti.push({
        dispositivo_codice: cod, famiglia: fam,
        sintomo: (is.symptoms || [])[0] || is.title,
        causa_probabile: (is.probable_causes || []).join("; ") || is.title,
        probabilita: probabilitaDaCertezza(is.certainty_logic),
        verifica: (is.tests || []).join(" · ") || "verifica non specificata nella fonte",
        strumento: dedurreStrumento((is.tests || []).join(" ")),
        valore_atteso: estraiAtteso((is.tests || []).join(" ")) || "non specificato nella fonte",
        rischio: null,
        riferimento_norma: null,
        rimedi: is.fixes || [],
        fonte: "encyclopedia"
      });
    });
  });

  // ── 3d. Dai 40 pattern: guasti che non appartengono a un apparecchio
  //        ma a un impianto. Famiglia IMPIANTO, così restano trovabili.
  pattern.forEach(function (p) {
    guasti.push({
      dispositivo_codice: null, famiglia: "IMPIANTO",
      sintomo: p.symptom, causa_probabile: (p.likely_causes || []).join("; "),
      probabilita: probabilitaDaCertezza(p.confidence_logic),
      verifica: (p.checks || []).join(" · ") || "verifica non specificata nella fonte",
      strumento: dedurreStrumento((p.checks || []).join(" ")),
      valore_atteso: estraiAtteso((p.checks || []).join(" ")) || "non specificato nella fonte",
      rischio: (p.common_mistakes || [])[0] || null,
      riferimento_norma: null,
      pattern_id: p.id,
      fonte: "failure_patterns"
    });
  });

  // ── 3f. Dal CURRICULUM: i 44 guasti che la scuola insegna ──────────
  //
  // Diciannove dei ventidue livelli insegnano guasti, e ognuno ha già la
  // forma di un'ipotesi: `nome`, `causa`, `sintomo`, `verifica`,
  // `componenti_coinvolti`. **Nessuno nel percorso diagnostico li leggeva.**
  // Il curriculum serviva alla scuola (nodi del grafo, vocabolario, formule,
  // norme) e non arrivava a chi risponde — la sesta volta che in questo
  // codice si trova conoscenza presente e mai letta.
  //
  // Non serviva una strada nuova: la banca dispositivi è già la fonte da cui
  // il passo 5c-bis dell'orchestratore ricava ipotesi con verifica,
  // strumento e valore atteso. Mancava l'innesto.
  //
  // Il caso che l'ha fatto vedere è FORUM-SPEC-003 — "il fotovoltaico
  // produce il 30% in meno, i pannelli sembrano ok, nessun errore
  // sull'inverter", causa reale **hot spot con diodo bypass in
  // cortocircuito più sporcizia**. Il livello L21 insegna esattamente
  // questo: *"produzione FV calata drasticamente → uno o più diodi bypass
  // in cortocircuito, verifica: misurare la tensione di ogni pannello
  // separatamente, o termografia per hot-spot"*. ROCCO lo sapeva e non lo
  // diceva.
  var FAMIGLIA_DEL_LIVELLO = {
    L10: "MOTORE", L11: "TRASFORMATORE", L14: "ALIMENTATORE",
    L17: "SENSORE", L21: "FOTOVOLTAICO"
  };
  // Gli altri livelli restano IMPIANTO, come i 40 pattern: un guasto che non
  // appartiene a un apparecchio appartiene all'impianto, e lì resta
  // trovabile. Mettere un guasto nella famiglia sbagliata lo nasconde,
  // perché la ricerca filtra per famiglia.
  (curriculum.LIVELLI || []).forEach(function (liv) {
    var fam = FAMIGLIA_DEL_LIVELLO[liv.id] || "IMPIANTO";
    var norma = (liv.norme || []).map(function (n) {
      return typeof n === "string" ? n : (n && (n.codice || n.norma || n.nome));
    }).filter(Boolean)[0] || null;

    (liv.guasti || []).forEach(function (g) {
      if (!g || !g.nome) return;
      guasti.push({
        dispositivo_codice: null, famiglia: fam,
        // Il sintomo è come il guasto si manifesta; il nome del guasto da
        // solo non basta a trovarlo per sintomo.
        sintomo: [g.sintomo, g.nome].filter(Boolean).join(" — "),
        causa_probabile: g.causa || g.nome,
        // La scuola non dichiara una probabilità: non se ne inventa una.
        probabilita: null,
        verifica: g.verifica || "verifica non specificata nella fonte",
        strumento: dedurreStrumento(String(g.verifica || "")),
        valore_atteso: estraiAtteso(String(g.verifica || "")) ||
          "non specificato nella fonte",
        rischio: null,
        riferimento_norma: norma,
        livello_curriculum: liv.id,
        fonte: "curriculum"
      });
    });
  });

  // ── 3e. Dai limiti normativi: i valori di riferimento, con la norma ─
  limiti.tutti().forEach(function (l) {
    misure.push({
      famiglia: "IMPIANTO",
      parametro: l.grandezza + (l.id.indexOf("_") > 0 ? " (" + l.id + ")" : ""),
      valore_minimo: l.confronto === "min" ? l.valore : null,
      valore_massimo: l.confronto === "max" ? l.valore : null,
      valore_nominale: l.confronto === "nominale" ? l.valore : null,
      unita: l.unita, condizione: l.nota || null,
      riferimento: l.norma || (l.livello ? "curriculum " + l.livello : null),
      provenienza_limite: l.fonte,
      fonte: "limiti"
    });
  });

  // ── 4. Le lacune: cosa manca, dichiarato ───────────────────────────
  var famiglie = {};
  dispositivi.forEach(function (d) {
    famiglie[d.famiglia] = famiglie[d.famiglia] || { dispositivi: 0, guasti: 0, misure: 0 };
    famiglie[d.famiglia].dispositivi++;
  });
  guasti.forEach(function (g) {
    famiglie[g.famiglia] = famiglie[g.famiglia] || { dispositivi: 0, guasti: 0, misure: 0 };
    famiglie[g.famiglia].guasti++;
  });
  misure.forEach(function (m) {
    famiglie[m.famiglia] = famiglie[m.famiglia] || { dispositivi: 0, guasti: 0, misure: 0 };
    famiglie[m.famiglia].misure++;
  });

  var lacune = [];
  Object.keys(famiglie).sort().forEach(function (f) {
    var v = famiglie[f];
    if (!v.guasti) lacune.push({ famiglia: f, manca: "guasti noti", dispositivi: v.dispositivi });
    if (!v.misure) lacune.push({ famiglia: f, manca: "valori di riferimento", dispositivi: v.dispositivi });
  });
  var senzaAtteso = guasti.filter(function (g) {
    return /non specificato/.test(g.valore_atteso);
  }).length;
  var senzaVerifica = guasti.filter(function (g) {
    return /non specificata/.test(g.verifica);
  }).length;

  return {
    version: 1,
    generato_il: new Date().toISOString().slice(0, 10),
    generato_da: "knowledge/build_dispositivi.js",
    avvertenza: "File generato: non modificarlo a mano. Si corregge la fonte e si rigenera.",
    fonti: {
      seed_sql: "db/rocco_dispositivi_seed.sql",
      components: "knowledge/components.json",
      encyclopedia: "data/encyclopedia.json",
      failure_patterns: "knowledge/failure_patterns.json",
      limiti: "knowledge/limiti.js"
    },
    dispositivi: dispositivi,
    guasti: guasti,
    misure_attese: misure,
    copertura: {
      dispositivi: dispositivi.length,
      guasti: guasti.length,
      misure_attese: misure.length,
      famiglie: Object.keys(famiglie).length,
      per_famiglia: famiglie,
      guasti_senza_valore_atteso: senzaAtteso,
      guasti_senza_verifica: senzaVerifica
    },
    lacune: lacune
  };
}

// ── Utilità: dedurre, non inventare ───────────────────────────────────
//
// Lo strumento e il valore atteso si LEGGONO dal testo della verifica che
// la fonte scrive. Se il testo non lo dice, resta scritto che non lo dice:
// meglio "non specificato nella fonte" che un numero messo lì da me.

var STRUMENTI = [
  [/megger|megohmetro|isolament/i, "megaohmetro 500V"],
  [/pinza amperometric|pinza in ma|pinza/i, "pinza amperometrica"],
  [/termocamera|termografi|infrarossi|temperatur/i, "termometro a infrarossi"],
  [/tester|multimetro|tensione|continuit/i, "multimetro"],
  [/terrametro|resistenza di terra/i, "terrametro"],
  [/oscilloscopio/i, "oscilloscopio"],
  [/ispezione visiv|a vista|guardare|osservare/i, "ispezione visiva"]
];

function dedurreStrumento(testo) {
  for (var i = 0; i < STRUMENTI.length; i++) {
    if (STRUMENTI[i][0].test(testo)) return STRUMENTI[i][1];
  }
  return "non specificato nella fonte";
}

/**
 * Il valore atteso, solo se la fonte lo scrive **con un'unità**.
 *
 * La prima versione di questa funzione aveva `m??` nell'elenco delle unità:
 * un "m" opzionale e pigro, cioè un'alternativa che matcha **la stringa
 * vuota**. Il risultato era che estraeva ">1" e "<50" senza unità — 35
 * valori attesi su 51. "Maggiore di 1" di che cosa? A un elettricista non
 * serve: meglio dire che la fonte non lo specifica.
 */
var UNITA = "mohm|megaohm|kohm|ohm|mω|kω|ω|mv|kv|\\bv\\b|\\bma\\b|\\ba\\b|khz|hz|°c|gradi|%|ms|\\bs\\b|kw|\\bw\\b|mm|bar";

function estraiAtteso(testo) {
  var re = new RegExp("[<>≤≥]\\s*\\d+[.,]?\\d*\\s*(" + UNITA + ")", "i");
  var m = String(testo).match(re);
  return m ? m[0].trim() : null;
}

function probabilitaDaCertezza(logica) {
  var t = String(logica == null ? "" : JSON.stringify(logica)).toLowerCase();
  if (/confermat|alta|certa/.test(t)) return "Alta";
  if (/improbabil|bassa/.test(t)) return "Bassa";
  return "Media";
}

// ── Esecuzione ────────────────────────────────────────────────────────

if (require.main === module) {
  var banca = costruisci();
  fs.writeFileSync(USCITA, JSON.stringify(banca, null, 1) + "\n", "utf8");

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  BANCA DISPOSITIVI DI ROCCO — generata                   ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
  console.log("  dispositivi      " + String(banca.copertura.dispositivi).padStart(4));
  console.log("  guasti noti      " + String(banca.copertura.guasti).padStart(4));
  console.log("  misure attese    " + String(banca.copertura.misure_attese).padStart(4));
  console.log("  famiglie         " + String(banca.copertura.famiglie).padStart(4));

  console.log("\n  per fonte:");
  ["seed_sql", "components", "encyclopedia", "failure_patterns", "limiti", "curriculum"].forEach(function (f) {
    var d = banca.dispositivi.filter(function (x) { return x.fonte === f; }).length;
    var g = banca.guasti.filter(function (x) { return x.fonte === f; }).length;
    var m = banca.misure_attese.filter(function (x) { return x.fonte === f; }).length;
    console.log("    " + f.padEnd(18) + " dispositivi " + String(d).padStart(3) +
      " · guasti " + String(g).padStart(3) + " · misure " + String(m).padStart(3));
  });

  console.log("\n  per famiglia:");
  Object.keys(banca.copertura.per_famiglia).sort().forEach(function (f) {
    var v = banca.copertura.per_famiglia[f];
    console.log("    " + f.padEnd(16) + " disp " + String(v.dispositivi).padStart(3) +
      " · guasti " + String(v.guasti).padStart(3) + " · misure " + String(v.misure).padStart(3));
  });

  console.log("\n  LACUNE DICHIARATE (" + banca.lacune.length + "):");
  if (!banca.lacune.length) console.log("    nessuna");
  banca.lacune.forEach(function (l) {
    console.log("    · " + l.famiglia.padEnd(16) + " manca: " + l.manca +
      " (" + l.dispositivi + " dispositivi)");
  });
  console.log("    · " + banca.copertura.guasti_senza_valore_atteso +
    " guasti senza un valore atteso nella fonte");
  console.log("    · " + banca.copertura.guasti_senza_verifica +
    " guasti senza una verifica nella fonte");

  console.log("\n  scritto in knowledge/dispositivi.json\n");
}

module.exports = { costruisci: costruisci, leggiSeed: leggiSeed, dividiTupla: dividiTupla };
