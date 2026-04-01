"use strict";

var buildCaseFingerprint = require("./roccoLearningStore").buildCaseFingerprint;
var getClosedCaseLearningSignal = require("./roccoLearningStore").getClosedCaseLearningSignal;
var applyClosedCaseLearningToHypotheses = require("./roccoLearningStore").applyClosedCaseLearningToHypotheses;
var applyClosedCaseLearningToDiagnosticChecks = require("./roccoLearningStore").applyClosedCaseLearningToDiagnosticChecks;
var appendClosedCaseLearning = require("./roccoLearningStore").appendClosedCaseLearning;
var LEARNING_HALF_LIFE_DAYS = 120;
var MIN_LEARNING_FRESHNESS_WEIGHT = 0.25;
var UNKNOWN_TIMESTAMP_FRESHNESS_WEIGHT = 0.20;
var MAX_RELEVANT_LEARNINGS = 12;

/**
 * IA Wire Pro — diagnosticEngine.js (ROCCO CORE v2)
 * Full JSON pattern matching + protection rules + safety protocols.
 * Produce output strutturato PRIMA del LLM e risposta offline se la rete cade.
 */

// ============================================================
// Keyword trigger interni (rilevazione dominio)
// ============================================================
var TECH_KEYWORDS = [
  // tensioni e misure
  "tensione", "volt", "230v", "400v", "24v", "12v", "vac", "vdc",
  "corrente", "amper", "misura", "multimetro", "pinza", "megohmetro", "tester", "ohmmetro",
  // protezioni
  "differenziale", "rcd", "rcbo", "magnetoterm", "mcb", "fusibile", "sezionatore", "spd", "scaricatore",
  // componenti automazione
  "contattore", "rele", "relay", "bobina", "teleruttore",
  "plc", "automazione", "ingresso", "uscita", "cpu", "siemens", "omron",
  // motori e azionamenti
  "motore", "motori", "trifase", "monofase", "avvolgiment", "statore", "rotore", "cuscinett",
  "inverter", "variatore", "frequenza", "vfd", "drive", "rpm", "giri",
  "rampa", "accelerazione", "decelerazione",
  // sensori e attuatori
  "sensore", "finecorsa", "prossimita", "induttivo", "ottico", "reed",
  "npn", "pnp", "attuatore", "valvola",
  // temporizzatori e morsettiere
  "temporizzator", "timer", "ritardo", "morsettiera", "morsett", "ferrula", "capicorda",
  // quadri e cablaggio
  "quadro", "impianto", "cavo", "conduttore", "sezione",
  "terra", "neutro", "fase", "dispersione", "isolamento",
  "cortocircuito", "sovraccarico", "sovratensione",
  "ip44", "ip65", "ip67", "guarnizione", "pressacavi", "cassetta",
  // segnali di pericolo
  "bruciato", "fuma", "scintille", "odore", "caldo",
  // caldaia e idraulica
  "caldaia", "termostato", "circolatore", "pompa", "pressostato",
  // domotica e FV
  "shelly", "zigbee", "domotica", "fotovoltaico", "pannello", "inverter",
  "wallbox", "ricarica", "auto elettrica",
  // civile (FP-31..FP-40)
  "led", "lampada", "lampadina", "faretto", "dimmer", "sfarfalla",
  "presa", "schuko", "interruttore",
  "ups", "batteria", "blackout",
  "citofono", "videocitofono", "campanello", "pulsantiera",
  "knx", "dali", "bus",
  "arco", "formicolio", "scossa",
  "sottotensione", "sovratensione", "surriscaldato"
];

var DANGER_KEYWORDS = [
  "bruciato", "fuma", "fumo", "scintille", "scintilla",
  "odore bruciato", "cavo annerito", "incendio", "fiamma",
  "bus dc carico", "condensatori non scarichi", "scosse", "folgorazione"
];

var VOLTAGE_KEYWORDS   = ["tensione", "volt", "230v", "400v", "24v", "vac", "vdc"];
var RCD_KEYWORDS       = ["differenziale", "rcd", "rcbo", "salvavita", "scatta"];
var OUTDOOR_KEYWORDS   = ["esterno", "ip44", "ip65", "ip67", "cassetta", "guarnizione", "pressacavi"];
var MEASUREMENT_WORDS  = ["misura", "multimetro", "pinza", "megohmetro", "tester"];

// Score minimo perché un pattern sia considerato rilevante
var MATCH_THRESHOLD = 3;

// ============================================================
// Rilevazione anomalia tensione BT (riferimento nominale 230V)
// ============================================================
var NOMINAL_VOLTAGE = 230;       // V — rete BT monofase Italia
var VOLTAGE_TOLERANCE = 0.10;    // ±10% CEI EN 50160
var VOLTAGE_MIN = NOMINAL_VOLTAGE * (1 - VOLTAGE_TOLERANCE); // 207V
var VOLTAGE_MAX = NOMINAL_VOLTAGE * (1 + VOLTAGE_TOLERANCE); // 253V

/**
 * Analizza i valori di tensione estratti dal testo e determina se c'è
 * una deviazione dal nominale 230V.
 * @returns {Object|null} { measured, nominal, deviation, direction, anomaly, context }
 */
function _deriveVoltageFact(measuredValues) {
  // Cerca valori di tensione nel range BT monofase plausibile (100-300V)
  var voltages = measuredValues.filter(function (v) {
    return v.type === "tensione" && v.value >= 100 && v.value <= 300;
  });
  if (voltages.length === 0) return null;

  // Prendi la tensione più anomala rispetto al nominale
  var worst = null;
  var worstDev = 0;
  voltages.forEach(function (v) {
    var dev = Math.abs(v.value - NOMINAL_VOLTAGE);
    if (dev > worstDev) { worstDev = dev; worst = v; }
  });
  if (!worst) return null;

  var measured = worst.value;
  var deviation = ((measured - NOMINAL_VOLTAGE) / NOMINAL_VOLTAGE * 100).toFixed(1);
  var direction = measured > NOMINAL_VOLTAGE ? "sopra" : measured < NOMINAL_VOLTAGE ? "sotto" : "nominale";
  var anomaly = measured < VOLTAGE_MIN || measured > VOLTAGE_MAX;

  return {
    measured: measured,
    nominal: NOMINAL_VOLTAGE,
    deviation: deviation,
    direction: direction,
    anomaly: anomaly,
    context: "BT monofase " + NOMINAL_VOLTAGE + "V"
  };
}

// ============================================================
// Estrazione numerica — misure da testo di cantiere
// Cattura valori tecnici scritti in modo approssimativo
// Es: "230v", "16A", "1.5kW", "1mohm", "50hz", "80gradi"
// ============================================================

// Ogni pattern: re (RegExp), type (stringa), unit (unità canonica)
// NB: i pattern più specifici (kW, Mohm, kohm) devono stare PRIMA di quelli generici (W, ohm)
// Il testo viene pre-processato: Ω/ω → "ohm", °/gradi → gestiti nel pattern
var NUMERIC_PATTERNS = [
  // Tensione: 230V, 400v, 24vdc, 48VAC, "230 volt"
  { re: /(\d+(?:[.,]\d+)?)\s*(?:v(?:ac|dc)?|volt(?:i)?)\b/gi,          type: "tensione",    unit: "V"   },
  // Corrente: 16A, 6.3A, 500mA, "10 ampere"
  // Per "ma" (milliampere) richiediamo attacco diretto al numero (30ma, 500ma)
  // per evitare "L1 ma" (congiunzione italiana) e "30 ma anche" (ambiguo)
  { re: /(\d+(?:[.,]\d+)?)ma\b/gi,                                                           type: "corrente_ma", unit: "mA" },
  { re: /(?<![a-z])(\d+(?:[.,]\d+)?)\s*milliamp(?:ere)?\b/gi,                               type: "corrente_ma", unit: "mA" },
  { re: /(?<![a-z])(\d+(?:[.,]\d+)?)\s*(?:ampere|amper[ei]?|a(?=\s|[,;.\)]|$))/gi,         type: "corrente",    unit: "A"  },
  // Potenza: 1.5kW, 500W, "2,2 kilowatt"
  { re: /(\d+(?:[.,]\d+)?)\s*(?:kw|kilowatt)\b/gi,                      type: "potenza",     unit: "kW"  },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:watt|w(?=\s|[,;.\)]|$))/gi,            type: "potenza",     unit: "W"   },
  // Isolamento/resistenza — lavora su testo già con Ω→ohm
  { re: /(\d+(?:[.,]\d+)?)\s*(?:m(?:ega)?ohms?|mohm)\b/gi,             type: "isolamento",  unit: "MΩ"  },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:k(?:ilo)?ohms?|kohm)\b/gi,             type: "resistenza",  unit: "kΩ"  },
  { re: /(\d+(?:[.,]\d+)?)\s*ohms?\b/gi,                                type: "resistenza",  unit: "Ω"   },
  // Frequenza: 50Hz, 60hz
  { re: /(\d+(?:[.,]\d+)?)\s*(?:hz|hertz)\b/gi,                        type: "frequenza",   unit: "Hz"  },
  // Temperatura: 80°C, 65 gradi, 80C
  { re: /(\d+(?:[.,]\d+)?)\s*(?:gradi(?:\s*celsius)?|celsius|°c)\b/gi, type: "temperatura", unit: "°C"  },
  // Tempo: 100ms, 5s, 2min
  { re: /(\d+(?:[.,]\d+)?)\s*(?:ms|millisecondi)\b/gi,                  type: "tempo",       unit: "ms"  },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:min(?:ut[oi]?)?)\b/gi,                  type: "tempo",       unit: "min" },
  { re: /(\d+(?:[.,]\d+)?)\s*(?:secondi|sec)\b/gi,                      type: "tempo",       unit: "s"   },
  // Velocità: 1500rpm, 3000 giri/min
  { re: /(\d+(?:[.,]\d+)?)\s*(?:rpm|giri\/min|giri al minuto)\b/gi,    type: "velocita",    unit: "rpm" }
];

// Range attesi per rilevare valori anomali
var EXPECTED_RANGES = {
  "tensione": [
    { min: 10,  max: 30,  label: "LVDC (12/24V)" },
    { min: 100, max: 130, label: "110VAC" },
    { min: 195, max: 265, label: "monofase 230V" },
    { min: 360, max: 440, label: "trifase 400V" },
    { min: 44,  max: 56,  label: "48V sistemi UPS/FV" }
  ],
  "isolamento": [
    { min: 1, max: 999, label: "isolamento OK (>1MΩ)" }
  ],
  "frequenza": [
    { min: 49, max: 51, label: "rete 50Hz" },
    { min: 59, max: 61, label: "rete 60Hz" }
  ],
  "temperatura": [
    { min: -20, max: 40, label: "ambiente normale" },
    { min: 40,  max: 80, label: "elevated — monitorare" }
  ]
};

function _parseNum(s) {
  return parseFloat(String(s).replace(",", "."));
}

/**
 * Pre-processa il testo per matching numerico affidabile:
 * - normalizza accenti e maiuscole
 * - Ω/ω → ohm (evita problemi con Unicode case-folding)
 * - ° → mantiene per matching gradi
 */
function _prepareForNumeric(text) {
  return normalize(text)
    .replace(/\u03A9/g, "ohm")   // Ω uppercase
    .replace(/\u03C9/g, "ohm")   // ω lowercase
    .replace(/°\s*c\b/gi, "°c"); // normalizza °C
}

/**
 * Estrae valori numerici tecnici dal testo.
 * Ritorna array di { type, value, unit, raw, warning? }
 */
function _collectMeasuredValues(text) {
  var results = [];
  var seen = {};
  var t = _prepareForNumeric(text);

  NUMERIC_PATTERNS.forEach(function (pat) {
    var re = new RegExp(pat.re.source, "gi");
    var m;
    while ((m = re.exec(t)) !== null) {
      var val = _parseNum(m[1]);
      if (isNaN(val)) continue;
      var key = pat.type + ":" + val;
      if (seen[key]) continue;
      seen[key] = true;

      var item = { type: pat.type, value: val, unit: pat.unit, raw: m[0].trim() };

      // Anomalie rilevate automaticamente
      if (pat.type === "isolamento" && val < 1) {
        item.warning = "isolamento " + val + "MΩ SOTTO SOGLIA (min 1MΩ) — guasto isolamento probabile";
      }
      if (pat.type === "tensione") {
        var ranges = EXPECTED_RANGES["tensione"];
        var inRange = ranges.some(function (r) { return val >= r.min && val <= r.max; });
        if (!inRange && val > 5) {
          item.warning = "tensione " + val + "V non corrisponde a nessun range standard (24/48/110/230/400V)";
        }
      }
      if (pat.type === "temperatura" && val > 80) {
        item.warning = "temperatura " + val + "\u00b0C eccessiva — rischio surriscaldamento componenti";
      }
      if (pat.type === "frequenza") {
        var fRanges = EXPECTED_RANGES["frequenza"];
        var fOk = fRanges.some(function (r) { return val >= r.min && val <= r.max; });
        if (!fOk) {
          item.warning = "frequenza " + val + "Hz fuori range rete (50/60Hz) — verificare parametri inverter";
        }
      }

      results.push(item);
    }
  });

  return results;
}

// ============================================================
// Normalizzazione testo (lowercase + rimozione accenti semplice)
// ============================================================
var ACCENT_MAP = { "à":"a","è":"e","é":"e","ì":"i","ò":"o","ù":"u","ä":"a","ö":"o","ü":"u" };

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[àèéìòùäöü]/g, function (c) { return ACCENT_MAP[c] || c; });
}

// ============================================================
// Stemmer italiano leggero (rule-based, suffissi elettrici)
// Rimuove suffissi comuni per aumentare il recall del matching.
// Es: "differenziali" → "differenzial", "avvolgimenti" → "avvolg"
// ============================================================
var STEM_SUFFIXES = [
  "zzazione", "izzazione", "azione", "zioni",
  "imento", "imenti", "mento", "menti",
  "atore", "atori", "atrice",
  "zione", "sione",
  "istica", "istici", "istico",
  "abile", "ibili",
  "mente",
  "uale", "uali",
  "iale", "iali",
  "ale", "ali",
  "ico", "ica", "ici", "iche",
  "ivo", "iva", "ivi", "ive",
  "ato", "ata", "ati", "ate",
  "ito", "ita", "iti", "ite",
  "ore", "ori",
  "nte", "nti",
  "eta", "ete",
  "nza", "nze"
];
var STEM_MIN_ROOT = 4; // lunghezza minima della radice dopo stripping

function stem(word) {
  var w = String(word || "");
  if (w.length <= STEM_MIN_ROOT + 2) return w; // parola troppo corta, non stemmare
  for (var i = 0; i < STEM_SUFFIXES.length; i++) {
    var suf = STEM_SUFFIXES[i];
    if (w.length > suf.length + STEM_MIN_ROOT && w.slice(-suf.length) === suf) {
      return w.slice(0, -suf.length);
    }
  }
  return w;
}

// ============================================================
// Mappa sinonimi elettrici italiani
// Ogni entry: alias → termine canonico usato nelle keyword/JSON
// ============================================================
var SYNONYM_MAP = {
  // protezioni
  "salvavita":       "differenziale",
  "differenziali":   "differenziale",
  "magneto":         "magnetoterm",
  "magnetotermica":  "magnetoterm",
  "magnetotermico":  "magnetoterm",
  "interruttore":    "magnetoterm",
  "interruttori":    "magnetoterm",
  "disgiuntore":     "magnetoterm",
  "protezione":      "differenziale",
  // contattori/relè
  "rele":            "rele",
  "relè":            "rele",
  "relay":           "rele",
  "bobine":          "bobina",
  "contattori":      "contattore",
  "teleruttori":     "teleruttore",
  // motori
  "motori":          "motore",
  "monofase":        "monofase",
  "trifase":         "trifase",
  "elettromotore":   "motore",
  "avvolgimento":    "avvolg",
  "avvolgimenti":    "avvolg",
  // inverter/drive
  "variatore":       "inverter",
  "variatori":       "inverter",
  "drive":           "inverter",
  "azionamento":     "inverter",
  "vfd":             "inverter",
  "convertitore":    "inverter",
  // sensori
  "sensori":         "sensore",
  "finecorse":       "finecorsa",
  "prossimita":      "prossimita",
  "reedswitch":      "reed",
  // cavi/impianto
  "conduttore":      "cavo",
  "conduttori":      "cavo",
  "cavi":            "cavo",
  "linea":           "cavo",
  // quadri
  "pannello":        "quadro",
  "armadio":         "quadro",
  "scompartimento":  "quadro",
  // tensione
  "tensioni":        "tensione",
  "voltaggio":       "volt",
  "alimentazione":   "tensione",
  "alimentazioni":   "tensione",
  // misure
  "misurazione":     "misura",
  "misurare":        "misura",
  "verificare":      "misura",
  "tester":          "multimetro",
  "voltmetro":       "multimetro",
  // fusibili
  "fusibili":        "fusibile",
  // terra/neutro
  "messa a terra":   "terra",
  "equipotenziale":  "terra",
  "pe":              "terra",
  "neutri":          "neutro",
  // corto/sovra
  "corto":           "cortocircuito",
  "curtocircuito":   "cortocircuito",
  "sovraccarichi":   "sovraccarico",
  // caldaia
  "caldaie":         "caldaia",
  "riscaldamento":   "caldaia",
  "boiler":          "caldaia",
  // FV/domotica
  "fotovoltaico":    "fotovoltaico",
  "solare":          "fotovoltaico",
  "pv":              "fotovoltaico",
  "domotica":        "domotica",
  "zigbee":          "zigbee",
  "zwave":           "z-wave",
  // MCCB / interruttore di potenza
  "mccb":            "interruttore scatolato",
  "scatolato":       "interruttore scatolato",
  "ns100":           "interruttore scatolato",
  "ns160":           "interruttore scatolato",
  "tmax":            "interruttore scatolato",
  // Fusibili
  "fusibili":        "fusibile",
  "cartuccia":       "fusibile",
  "nh00":            "fusibile",
  "nh1":             "fusibile",
  "nh2":             "fusibile",
  "portafusibile":   "fusibile",
  // Salvamotore
  "salvamotore":     "salvamotore",
  "pkz":             "salvamotore",
  "protettore":      "salvamotore",
  // Relè termico
  "termico":         "rele termico",
  "bimetallico":     "rele termico",
  "overload":        "rele termico",
  // ATS / commutatore
  "ats":             "commutatore automatico",
  "commutatore":     "commutatore automatico",
  "transfer":        "commutatore automatico",
  "bypass":          "commutatore automatico",
  // Alimentatore 24VDC
  "smps":            "alimentatore switching",
  "psu":             "alimentatore switching",
  "meanwell":        "alimentatore switching",
  "sitop":           "alimentatore switching",
  "alimentatori":    "alimentatore switching",
  // Trasformatore di corrente TA
  "ta":              "trasformatore corrente",
  "toroide":         "trasformatore corrente",
  "rapporto":        "trasformatore corrente",
  // Contatore energia
  "kwh":             "contatore",
  "contatori":       "contatore",
  // Pulsante
  "pulsanti":        "pulsante",
  "avvio":           "pulsante",
  "arresto":         "pulsante",
  // Lampada spia
  "spia":            "lampada spia",
  "spie":            "lampada spia",
  "pilota":          "lampada spia",
  // Sirena / cicalino
  "sirena":          "sirena",
  "cicalino":        "sirena",
  "buzzer":          "sirena",
  "allarme acustico":"sirena",
  // Colonna luminosa
  "colonna":         "colonna luminosa",
  "tower":           "colonna luminosa",
  // Pulsante emergenza
  "emergenza":       "pulsante emergenza",
  "estop":           "pulsante emergenza",
  "fungo":           "pulsante emergenza",
  // Relè di sicurezza
  "pilz":            "rele sicurezza",
  "pnoz":            "rele sicurezza",
  "sil":             "rele sicurezza",
  "safety":          "rele sicurezza",
  // Pompa di calore
  "pdc":             "pompa calore",
  "calorifero":      "pompa calore",
  "climatizzatore":  "pompa calore",
  // Batteria accumulo
  "storage":         "batteria accumulo",
  "accumulatore":    "batteria accumulo",
  "bess":            "batteria accumulo",
  "lifepo4":         "batteria accumulo",
  "powerwall":       "batteria accumulo",
  // Analizzatore rete
  "powerquality":    "analizzatore rete",
  "powermeter":      "analizzatore rete",
  "cosphi":          "analizzatore rete",
  "armoniche":       "analizzatore rete",
  "thd":             "analizzatore rete",
  // Busbar / pettine
  "pettine":         "pettine",
  "busbar":          "pettine",
  "barra omnibus":   "pettine",
  // LOTO / sezionatori
  "loto":            "sezionatore",
  "lockout":         "sezionatore",
  // PIR
  "pir":             "rilevatore presenza",
  "rilevatore":      "rilevatore presenza",
  "presenza":        "rilevatore presenza",
  // Dimmer
  "dimmer":          "dimmer",
  "regolatore luce": "dimmer",
  "variatore luce":  "dimmer",
  // Crepuscolare
  "crepuscolare":    "crepuscolare",
  "fotocellula":     "crepuscolare",
  // Relè monitoraggio fasi
  "mancanza fase":   "mancanza fase",
  "asimmetria":      "mancanza fase",
  "sequenza fasi":   "mancanza fase",
  "fasimetro":       "mancanza fase",
  // PLC / CPU
  "cpu":             "plc",
  "controllore":     "plc",
  "simatic":         "plc",
  "tia":             "plc",
  "step7":           "plc",
  "unity":           "plc",
  "zelio":           "plc",
  "logo":            "plc",
  "watchdog":        "watchdog",
  // Cortocircuito
  "corto circuito":  "cortocircuito",
  "cc":              "cortocircuito",
  "guasto franco":   "cortocircuito",
  // Condensatore
  "condensator":     "condensatore",
  "cond":            "condensatore",
  "capacitor":       "condensatore",
  // Soft starter
  "soft starter":    "soft starter",
  "avviatore":       "soft starter",
  "avviatore progressivo": "soft starter",
  // Umidità/condensa
  "condensa":        "umidita",
  "umido":           "umidita",
  "umidita":         "umidita",
  "igrometro":       "umidita",
  "anticondensa":    "umidita",
  // Ronzio motore monofase
  "ronza":           "ronzio",
  "ronzio":          "ronzio",
  "vibra":           "ronzio",
  // Isolamento
  "megohm":          "isolamento",
  "megaohm":         "isolamento",
  "isolamento":      "isolamento",
  "megohmetro":      "isolamento",
  // Wallbox / EV
  "wallbox":         "wallbox",
  "colonnina":       "wallbox",
  "ev":              "wallbox",
  "auto elettrica":  "wallbox",
  "ricarica":        "wallbox",
  // Eccitazione relè/contattore
  "eccitare":        "eccita",
  "eccita":          "eccita",
  "eccitazione":     "eccita",
  "non scatta":      "eccita",
  "non chiude":      "eccita",
  // Fusibile (FP-24)
  "nh00":            "fusibile",
  "nh1":             "fusibile",
  "nh2":             "fusibile",
  "nh3":             "fusibile",
  "cilindrico":      "fusibile",
  "gg":              "fusibile",
  "am":              "fusibile",
  "portafusibile":   "fusibile",
  "fuso":            "fusibile",
  // Relè termico MTR (FP-25)
  "mtr":             "rele termico",
  "bimetallico":     "rele termico",
  "overload":        "rele termico",
  "termico":         "rele termico",
  "reset termico":   "rele termico",
  // Isolamento/megger (FP-26)
  "megger":          "isolamento",
  "megohmetro":      "isolamento",
  "rigidita":        "isolamento",
  "dispersione":     "isolamento",
  "resistenza isolamento": "isolamento",
  // Timer/programmatore (FP-27)
  "orologio":        "timer",
  "programmatore":   "timer",
  "fasce":           "timer",
  "fascia oraria":   "timer",
  "temporizzatore":  "timer",
  // SPD/scaricatore (FP-28)
  "scaricatore":     "spd",
  "limitatore":      "spd",
  "surge":           "spd",
  "fulmine":         "spd",
  "mov":             "spd",
  "varistori":       "spd",
  "protezione fulmini": "spd",
  // Trasformatore (FP-29)
  "trafo":           "trasformatore",
  "autotrasformatore": "trasformatore",
  "zumbante":        "ronzio",
  "zumba":           "ronzio",
  "vibrazione":      "ronzio",
  // Sensore temperatura (FP-30)
  "pt100":           "sensore temperatura",
  "ntc":             "sensore temperatura",
  "ptc":             "sensore temperatura",
  "termistore":      "sensore temperatura",
  "sonda":           "sensore temperatura",
  "off-range":       "sensore temperatura",
  "open sensor":     "sensore temperatura",
  // FP-31: sovratensione/sottotensione rete (lessico BT realistico)
  "sovratensione":   "sovratensione",
  "sottotensione":   "sottotensione",
  "sbalzo tensione": "sovratensione",
  "picco tensione":  "sovratensione",
  "neutro interrotto": "neutro interrotto",
  "corrente alta":   "sovratensione",
  "corrente bassa":  "sottotensione",
  "rete instabile":  "sovratensione",
  "danneggiato":     "danneggiat",
  "danneggiati":     "danneggiat",
  // FP-32: terra assente/degradata
  "formicolio":      "terra degradata",
  "scossa":          "terra degradata",
  "scosse":          "terra degradata",
  "dispersore":      "terra degradata",
  "picchetto":       "terra degradata",
  "resistenza terra":"terra degradata",
  "carcassa":        "terra degradata",
  "terra assente":   "terra degradata",
  // FP-33: LED sfarfalla
  "led":             "lampada led",
  "sfarfalla":       "sfarfallio",
  "sfarfallio":      "sfarfallio",
  "flickering":      "sfarfallio",
  "lampada":         "lampada led",
  "lampadina":       "lampada led",
  "faretto":         "lampada led",
  "faretti":         "lampada led",
  "gu10":            "lampada led",
  "driver led":      "lampada led",
  "reattore":        "lampada led",
  // FP-34: presa/interruttore caldo
  "presa":           "presa",
  "prese":           "presa",
  "schuko":          "presa",
  "bipasso":         "presa",
  "annerito":        "annerito",
  "annerita":        "annerito",
  "brucia":          "bruciato",
  // FP-35: cavo surriscaldato
  "surriscaldato":   "surriscaldamento",
  "surriscalda":     "surriscaldamento",
  "surriscaldamento":"surriscaldamento",
  "guaina":          "cavo surriscaldato",
  "guaina morbida":  "cavo surriscaldato",
  "canalina":        "cavo surriscaldato",
  // FP-36: UPS
  "ups":             "ups",
  "gruppo continuita":"ups",
  "batteria":        "ups batteria",
  "batterie":        "ups batteria",
  "blackout":        "ups",
  "autonomia":       "ups batteria",
  // FP-37: squilibrio trifase
  "squilibrio":      "squilibrio fasi",
  "squilibrato":     "squilibrio fasi",
  "sbilanciato":     "squilibrio fasi",
  "neutro caldo":    "squilibrio fasi",
  "armoniche":       "squilibrio fasi",
  // FP-38: bus KNX/DALI
  "knx":             "bus domotico",
  "dali":            "bus domotico",
  "bus":             "bus domotico",
  "ets":             "bus domotico",
  "attuatore knx":   "bus domotico",
  "offline":         "bus domotico",
  // FP-39: citofono/videocitofono
  "citofono":        "citofono",
  "citofoni":        "citofono",
  "videocitofono":   "citofono",
  "pulsantiera":     "citofono",
  "cornetta":        "citofono",
  "campanello":      "citofono",
  // FP-40: arco elettrico nel quadro
  "arco":            "arco elettrico",
  "arco elettrico":  "arco elettrico",
  "scintille":       "arco elettrico",
  "buzzing":         "arco elettrico",
  "sfrigolio":       "arco elettrico",
  "scoppiettio":     "arco elettrico"
};

function applysynonyms(word) {
  return SYNONYM_MAP[word] || word;
}

function tokenize(text) {
  return normalize(text)
    .split(/[\s,;.()\/\-\[\]:"'!?]+/)
    .filter(function (w) { return w.length > 2; })
    .map(function (w) { return applysynonyms(stem(w)); });
}

// tokenize senza stemming/sinonimi — per matching substring su testo grezzo
function tokenizeRaw(text) {
  return normalize(text).split(/[\s,;.()\/\-\[\]:"'!?]+/).filter(function (w) { return w.length > 2; });
}

function containsAny(text, keywords) {
  var n = normalize(text);
  var tokens = tokenize(text);
  for (var i = 0; i < keywords.length; i++) {
    var kn = normalize(keywords[i]);
    // 1) substring diretto (cattura "24v", sigle, prefissi del JSON)
    if (n.indexOf(kn) >= 0) return true;
    // 2) token stemmed/sinonimo batte contro keyword stemmed/sinonimo
    var ks = applysynonyms(stem(kn));
    for (var j = 0; j < tokens.length; j++) {
      if (tokens[j] === ks || tokens[j].indexOf(ks) === 0 || ks.indexOf(tokens[j]) === 0) return true;
    }
  }
  return false;
}

function findMatches(text, keywords) {
  var n = normalize(text);
  var tokens = tokenize(text);
  var found = [];
  for (var i = 0; i < keywords.length; i++) {
    var kn = normalize(keywords[i]);
    var ks = applysynonyms_stem(kn);
    var matched = false;
    if (n.indexOf(kn) >= 0) matched = true;
    if (!matched) {
      for (var j = 0; j < tokens.length; j++) {
        if (tokens[j] === ks || tokens[j].indexOf(ks) === 0 || ks.indexOf(tokens[j]) === 0) {
          matched = true; break;
        }
      }
    }
    if (matched) found.push(keywords[i]);
  }
  return found;
}

// Helper: applica sinonimi + stem su stringa normalizzata
function applysynonyms_stem(word) {
  return applysynonyms(stem(normalize(word)));
}

// ============================================================
// Scoring pattern (A)
// Pesa: symptom × 3, likely_causes × 2, checks × 1
// Boost per coppie chiave italiane
// ============================================================
var PAIR_BOOSTS = [
  // pattern esistenti
  ["differenziale", "scatta"],
  ["rcd",           "scatta"],
  ["rele",          "contattore"],
  ["relay",         "luce"],
  ["24v",           "plc"],
  ["tensione",      "flottante"],
  ["ghost",         "voltage"],
  ["ip",            "guarnizione"],
  ["esterno",       "pressacavi"],
  ["magnetoterm",   "caldo"],
  ["morsett",       "allentato"],
  // nuovi pattern FP-07..FP-11
  ["motore",        "parte"],
  ["motore",        "bloccat"],
  ["motore",        "avvolgiment"],
  ["inverter",      "allarme"],
  ["inverter",      "errore"],
  ["vfd",           "fault"],
  ["differenziale", "notte"],
  ["differenziale", "riposo"],
  ["perdita",       "fase"],
  ["mancanza",      "fase"],
  ["corrente",      "sbilanc"],
  ["guasto",        "intermittente"],
  ["guasto",        "casuale"],
  ["termico",       "scatta"],
  ["fusibile",      "bruciato"],
  ["contattore",    "chiuso"],
  // componenti nuovi
  ["bus",           "scarico"],
  ["condensatori",  "scarichi"],
  ["fotovoltaico",  "isola"],
  ["pannello",      "tensione"],
  ["sensore",       "npn"],
  ["sensore",       "pnp"],
  ["finecorsa",     "attivo"],
  // FP-17: cortocircuito
  ["magnetoterm",   "scatta"],
  ["cortocircuito", "linea"],
  ["resistenza",    "zero"],
  // FP-18: alimentatore switching
  ["alimentatore",  "instabil"],
  ["alimentatore",  "spento"],
  ["alimentatore",  "oscilla"],
  ["condensatori",  "degradati"],
  // FP-19: PLC fault
  ["plc",           "stop"],
  ["plc",           "fault"],
  ["plc",           "bloccat"],
  ["watchdog",      "scaduto"],
  ["cpu",           "errore"],
  // FP-20: condensa
  ["quadro",        "umido"],
  ["quadro",        "condensa"],
  ["pressacavi",    "aperto"],
  ["guarnizione",   "rotta"],
  // FP-21: motore monofase
  ["motore",        "ronza"],
  ["condensatore",  "guasto"],
  ["avvolgimento",  "rotto"],
  ["monofase",      "parte"],
  // FP-22: RCD tipo errato
  ["rcd",           "tipo"],
  ["differenziale", "tipo"],
  ["inverter",      "dispersione"],
  ["wallbox",       "differenziale"],
  // FP-23: relè 24V non eccita
  ["rele",          "eccita"],
  ["bobina",        "tensione"],
  ["24v",           "bobina"],
  ["contattore",    "eccita"],
  // FP-24: fusibile fuso
  ["fusibile",      "fuso"],
  ["fusibile",      "calibro"],
  ["cartuccia",     "guasto"],
  ["portafusibile", "sostituire"],
  ["nh",            "fuso"],
  // FP-25: relè termico scattato
  ["mtr",           "scatto"],
  ["termico",       "reset"],
  ["motore",        "termico"],
  ["bimetallico",   "scattato"],
  // FP-26: isolamento basso
  ["isolamento",    "basso"],
  ["megger",        "misura"],
  ["dispersione",   "terra"],
  ["isolamento",    "megaohm"],
  // FP-27: timer non comanda
  ["timer",         "comando"],
  ["programmatore", "uscita"],
  ["orologio",      "fascia"],
  ["timer",         "reset"],
  // FP-28: SPD guasto
  ["spd",           "rosso"],
  ["scaricatore",   "guasto"],
  ["fulmine",       "protezione"],
  ["mov",           "sostituire"],
  // FP-29: trasformatore
  ["trasformatore", "zumba"],
  ["trafo",         "caldo"],
  ["trafo",         "surriscalda"],
  ["trasformatore", "ronzio"],
  // FP-30: sensore PT100/NTC
  ["pt100",         "fuori"],
  ["sensore",       "errore"],
  ["temperatura",   "blocco"],
  ["ntc",           "guasto"],
  ["sonda",         "open"],
  // FP-31: sovratensione/sottotensione BT
  ["sovratensione",  "rete"],
  ["sottotensione",  "rete"],
  ["sovratensione",  "apparecchi"],
  ["sovratensione",  "spengono"],
  ["sovratensione",  "danneggiat"],
  ["sovratensione",  "tensione"],
  ["sottotensione",  "apparecchi"],
  ["sottotensione",  "tensione"],
  ["sottotensione",  "corrente"],
  ["neutro",         "interrotto"],
  ["apparecchi",     "danneggiat"],
  // FP-32: terra assente/degradata
  ["terra",          "assente"],
  ["terra",          "degradata"],
  ["formicolio",     "carcassa"],
  ["dispersore",     "resistenza"],
  ["scossa",         "toccando"],
  ["terra",          "formicolio"],
  // FP-33: LED sfarfalla
  ["led",            "sfarfalla"],
  ["lampada",        "sfarfalla"],
  ["led",            "dimmer"],
  ["faretto",        "sfarfalla"],
  ["lampada",        "spenta"],
  ["led",            "debolmente"],
  // FP-34: presa/interruttore caldo
  ["presa",          "calda"],
  ["presa",          "annerit"],
  ["interruttore",   "caldo"],
  ["presa",          "scintille"],
  ["presa",          "bruciato"],
  ["interruttore",   "annerit"],
  // FP-35: cavo surriscaldato
  ["cavo",           "surriscaldat"],
  ["cavo",           "bruciato"],
  ["guaina",         "morbida"],
  ["canalina",       "odore"],
  ["cavo",           "caldo"],
  // FP-36: UPS
  ["ups",            "batteria"],
  ["ups",            "allarme"],
  ["ups",            "spegne"],
  ["ups",            "blackout"],
  ["batteria",       "autonomia"],
  // FP-37: squilibrio trifase
  ["neutro",         "caldo"],
  ["carichi",        "squilibrat"],
  ["fasi",           "sbilanciat"],
  ["trifase",        "asimmetric"],
  ["neutro",         "corrente"],
  // FP-38: bus KNX/DALI
  ["knx",            "comunica"],
  ["dali",           "comunica"],
  ["bus",            "offline"],
  ["knx",            "alimentatore"],
  ["dali",           "indirizzo"],
  ["attuatore",      "risponde"],
  // FP-39: citofono
  ["citofono",       "funziona"],
  ["citofono",       "suona"],
  ["videocitofono",  "video"],
  ["pulsantiera",    "morta"],
  ["cornetta",       "muta"],
  ["campanello",     "suona"],
  // FP-40: arco elettrico quadro
  ["quadro",         "scintille"],
  ["quadro",         "arco"],
  ["quadro",         "ronzio"],
  ["morsetto",       "arco"],
  ["quadro",         "buzzing"],
  ["contattore",     "scintille"]
];

// Matching avanzato: stem+sinonimi + prefix matching bidirezionale
// textTokens e queryTokens sono già normalizzati/stemmed/sinonimizzati
function tokensMatch(a, b) {
  if (a === b) return true;
  // prefix matching bidirezionale (es. "differenzial" vs "differenziale")
  if (a.length >= 4 && b.length >= 4) {
    if (a.indexOf(b) === 0 || b.indexOf(a) === 0) return true;
  }
  return false;
}

function scoreText(text, queryTokens) {
  var textTokens = tokenize(text);
  var score = 0;
  for (var i = 0; i < textTokens.length; i++) {
    for (var j = 0; j < queryTokens.length; j++) {
      if (tokensMatch(textTokens[i], queryTokens[j])) { score++; break; }
    }
  }
  return score;
}

function scorePatternMatch(pattern, queryNorm, queryTokens) {
  var score = 0;

  // symptom × 3
  score += scoreText(pattern.symptom || "", queryTokens) * 3;

  // likely_causes × 2
  var causes = Array.isArray(pattern.likely_causes) ? pattern.likely_causes : [];
  for (var i = 0; i < causes.length; i++) {
    score += scoreText(causes[i], queryTokens) * 2;
  }

  // checks × 1
  var checks = Array.isArray(pattern.checks) ? pattern.checks : [];
  for (var j = 0; j < checks.length; j++) {
    score += scoreText(checks[j], queryTokens);
  }

  // Pair boosts: se entrambe le parole della coppia sono nel query
  for (var b = 0; b < PAIR_BOOSTS.length; b++) {
    var w0 = PAIR_BOOSTS[b][0], w1 = PAIR_BOOSTS[b][1];
    var symNorm = normalize(pattern.symptom || "");
    // boost solo se la coppia è rilevante per il pattern
    if ((symNorm.indexOf(w0) >= 0 || symNorm.indexOf(w1) >= 0) &&
        queryNorm.indexOf(w0) >= 0 && queryNorm.indexOf(w1) >= 0) {
      score += 4;
    }
  }

  return score;
}

// ============================================================
// Scoring componenti (C)
// Confronta le keywords del componente con i token della query
// ============================================================
function scoreComponentMatch(component, queryNorm, queryTokens) {
  var keywords = Array.isArray(component.keywords) ? component.keywords : [];
  var score = 0;
  for (var i = 0; i < keywords.length; i++) {
    var kn = normalize(keywords[i]);
    // 1) substring diretto (sigle, codici brevi)
    if (queryNorm.indexOf(kn) >= 0) { score += 2; continue; }
    // 2) stem+sinonimi + prefix matching
    var ks = applysynonyms_stem(kn);
    for (var j = 0; j < queryTokens.length; j++) {
      if (tokensMatch(queryTokens[j], ks)) { score += 2; break; }
    }
  }
  return score;
}

// ============================================================
// Scoring rules (B)
// Pesa: when_to_apply × 3, if_seen_in_photo × 2, rule text × 1
// ============================================================
function scoreRuleMatch(rule, queryNorm, queryTokens) {
  var score = 0;
  score += scoreText(rule.when_to_apply || "", queryTokens) * 3;
  var seen = Array.isArray(rule.if_seen_in_photo) ? rule.if_seen_in_photo : [];
  for (var i = 0; i < seen.length; i++) {
    if (queryNorm.indexOf(normalize(seen[i])) >= 0) score += 2;
  }
  score += scoreText(rule.rule || "", queryTokens);
  return score;
}

// ============================================================
// Parsing confidence_logic
// Ogni entry ha prefisso: "CONFERMATO ...", "PROBABILE ...", "NON VERIFICABILE ..."
// ============================================================
function parseLivello(logicEntry) {
  var s = normalize(String(logicEntry || ""));
  if (s.indexOf("non verificabile") >= 0) return "non_verifiable";
  if (s.indexOf("confermato") >= 0)       return "confirmed";
  return "probable";
}

/**
 * Mappa likely_causes → ipotesi con livello.
 * confidence_logic[i] → livello per likely_causes[i] se disponibile, altrimenti default.
 * Per default tutte le cause sono "probabile" (senza misure non si può confermare).
 */
function buildIpotesiFromPattern(pattern) {
  var causes  = Array.isArray(pattern.likely_causes) ? pattern.likely_causes : [pattern.symptom];
  var logics  = Array.isArray(pattern.confidence_logic) ? pattern.confidence_logic : [];
  var pid     = pattern.id || "";
  var sym     = pattern.symptom || "";

  return causes.map(function (causa, idx) {
    var livello = "probable"; // default: senza misure non si conferma nulla
    if (logics[idx]) {
      var parsed = parseLivello(logics[idx]);
      // "confermato" nel confidence_logic descrive la condizione di conferma, NON lo stato attuale.
      // Quindi lo usiamo solo se è "non_verificabile" (indica un limite reale).
      if (parsed === "non_verifiable") livello = "non_verifiable";
    }
    return { causa: String(causa), livello: livello, patternId: pid, symptom: sym, deductionScore: 0, boostedByRuleIds: [], supportingMeasurements: [], contradictingMeasurements: [], source: "pattern_match" };
  });
}

// ============================================================
// ROCCO NUCLEO DEDUTTIVO — FASE 1
// Regole fisico-tecniche statiche applicate dopo il pattern matching.
// Azioni: boost | penalize | missing | raise_priority
// ============================================================
var CAUSE_HYPOTHESES = [
  // --- famiglia: dispersione ---
  {
    id: "H-DISP-01", family: "dispersione",
    causa: "Guasto isolamento su carico specifico (resistenza, motore, elettrodomestico)",
    baseScore: 3,
    pro: [
      { test: function (f) { return f.isoLow; },          weight: 8, label: "isolamento basso misurato" },
      { test: function (f) { return f.rcdTrips; },         weight: 4, label: "RCD scatta" },
      { test: function (f) { return f.applianceMentioned; }, weight: 3, label: "apparecchio specifico citato" },
      { test: function (f) { return f.underLoad; },        weight: 3, label: "scatta sotto carico" }
    ],
    contra: [
      { test: function (f) { return f.tripsNoLoad; },     weight: 6, label: "scatta anche a vuoto → non è un carico" },
      { test: function (f) { return f.isoHigh; },          weight: 8, label: "isolamento >10MΩ → no dispersione" }
    ],
    bestCheck: "Scollegare i carichi uno alla volta e rilanciare il differenziale dopo ogni distacco",
    missingEvidence: "Quale carico collegato provoca lo scatto"
  },
  {
    id: "H-DISP-02", family: "dispersione",
    causa: "Cavo danneggiato o isolamento degradato sulla linea",
    baseScore: 3,
    pro: [
      { test: function (f) { return f.isoLow; },      weight: 8, label: "isolamento basso misurato" },
      { test: function (f) { return f.rcdTrips; },     weight: 4, label: "RCD scatta" },
      { test: function (f) { return f.tripsNoLoad; },  weight: 5, label: "scatta a vuoto → probabile linea" },
      { test: function (f) { return f.oldInstall; },   weight: 2, label: "impianto vecchio" }
    ],
    contra: [
      { test: function (f) { return f.newInstall; },  weight: 3, label: "impianto nuovo/recente" },
      { test: function (f) { return f.isoHigh; },      weight: 8, label: "isolamento >10MΩ → no dispersione" }
    ],
    bestCheck: "Misura isolamento circuito per circuito con tutti i carichi scollegati",
    missingEvidence: "Isolamento per singolo circuito a vuoto"
  },
  {
    id: "H-DISP-03", family: "dispersione",
    causa: "Umidità o infiltrazione in punto di giunzione",
    baseScore: 1,
    pro: [
      { test: function (f) { return f.isoLow; },     weight: 6, label: "isolamento basso misurato" },
      { test: function (f) { return f.rcdTrips; },    weight: 3, label: "RCD scatta" },
      { test: function (f) { return f.moisture; },     weight: 3, label: "contesto umido dichiarato" },
      { test: function (f) { return f.outdoor; },      weight: 2, label: "installazione esterna" }
    ],
    contra: [
      { test: function (f) { return f.dry; },         weight: 4, label: "ambiente secco" },
      { test: function (f) { return f.isoHigh; },      weight: 8, label: "isolamento >10MΩ → no dispersione" }
    ],
    bestCheck: "Ispezione visiva cassette e morsettiere — cercare ossidazione o condensa",
    missingEvidence: "Condizioni ambientali e stato visivo giunzioni"
  },
  // --- famiglia: surriscaldamento ---
  {
    id: "H-SURR-01", family: "surriscaldamento",
    causa: "Connessione lenta o morsetto non serrato — resistenza di contatto elevata",
    baseScore: 3,
    pro: [
      { test: function (f) { return f.tempHigh; },      weight: 8, label: "temperatura >80°C misurata" },
      { test: function (f) { return f.burnSigns; },     weight: 5, label: "segni bruciatura/fumo" },
      { test: function (f) { return f.terminalRef; },    weight: 3, label: "morsetto/connessione citata" },
      { test: function (f) { return f.darkened; },       weight: 3, label: "annerimento/deformazione visibile" }
    ],
    contra: [
      { test: function (f) { return f.newInstall; },   weight: 3, label: "impianto nuovo/rifatto" }
    ],
    bestCheck: "Ispezione termica con termometro IR sui morsetti sotto carico",
    missingEvidence: "Punto esatto del surriscaldamento"
  },
  {
    id: "H-SURR-02", family: "surriscaldamento",
    causa: "Sovraccarico — corrente superiore alla portata del cavo o della protezione",
    baseScore: 3,
    pro: [
      { test: function (f) { return f.tempHigh; },      weight: 6, label: "temperatura >80°C misurata" },
      { test: function (f) { return f.burnSigns; },     weight: 4, label: "segni bruciatura/fumo" },
      { test: function (f) { return f.highCurrent; },   weight: 7, label: "corrente alta misurata" },
      { test: function (f) { return f.heavyLoad; },     weight: 3, label: "carico pesante dichiarato" }
    ],
    contra: [
      { test: function (f) { return f.lightLoad; },    weight: 4, label: "carico leggero" }
    ],
    bestCheck: "Misura corrente con pinza amperometrica e confronto con In della protezione",
    missingEvidence: "Corrente effettiva e taglia protezione"
  },
  {
    id: "H-SURR-03", family: "surriscaldamento",
    causa: "Sezione cavo insufficiente per la tratta",
    baseScore: 1,
    pro: [
      { test: function (f) { return f.tempHigh; },    weight: 5, label: "temperatura >80°C misurata" },
      { test: function (f) { return f.longRun; },      weight: 3, label: "tratta lunga dichiarata" },
      { test: function (f) { return f.highCurrent; },  weight: 4, label: "corrente alta misurata" }
    ],
    contra: [],
    bestCheck: "Verifica sezione cavo vs tabella CEI-UNEL per lunghezza e corrente",
    missingEvidence: "Sezione cavo, lunghezza tratta, corrente di impiego"
  },
  // --- famiglia: anomalia_rete ---
  {
    id: "H-RETE-01", family: "anomalia_rete",
    causa: "Neutro interrotto o allentato — squilibrio tensioni",
    baseScore: 3,
    pro: [
      { test: function (f) { return f.voltAnomaly; },   weight: 8, label: "tensione anomala misurata" },
      { test: function (f) { return f.voltHigh; },      weight: 5, label: "sovratensione" },
      { test: function (f) { return f.neutralRef; },    weight: 3, label: "neutro citato" },
      { test: function (f) { return f.flickering; },    weight: 3, label: "sfarfallio/sbalzi" }
    ],
    contra: [
      { test: function (f) { return f.voltStable; },   weight: 6, label: "tensione stabile misurata" }
    ],
    bestCheck: "Misura tensione F-N e F-F al quadro — se F-N varia e F-F stabile → neutro",
    missingEvidence: "Tensione fase-neutro e fase-fase contemporanee"
  },
  {
    id: "H-RETE-02", family: "anomalia_rete",
    causa: "Contatto ossidato o allentato su arrivo/partenza quadro",
    baseScore: 2,
    pro: [
      { test: function (f) { return f.voltAnomaly; },   weight: 6, label: "tensione anomala misurata" },
      { test: function (f) { return f.flickering; },    weight: 3, label: "sfarfallio/sbalzi" },
      { test: function (f) { return f.oldInstall; },    weight: 2, label: "impianto vecchio" },
      { test: function (f) { return f.terminalRef; },   weight: 2, label: "morsetto citato" }
    ],
    contra: [
      { test: function (f) { return f.newInstall; },   weight: 3, label: "impianto nuovo" },
      { test: function (f) { return f.voltStable; },    weight: 5, label: "tensione stabile misurata" }
    ],
    bestCheck: "Ispezione e ristretto morsetti arrivo contatore e interruttore generale",
    missingEvidence: "Stato morsetti arrivo e generale"
  },
  {
    id: "H-RETE-03", family: "anomalia_rete",
    causa: "Problema rete distribuzione o fornitore",
    baseScore: 1,
    pro: [
      { test: function (f) { return f.voltAnomaly; },  weight: 5, label: "tensione anomala misurata" },
      { test: function (f) { return f.zoneWide; },      weight: 5, label: "problema esteso a zona/palazzo" }
    ],
    contra: [
      { test: function (f) { return f.onlyMe; },       weight: 5, label: "solo casa mia → non è il fornitore" },
      { test: function (f) { return f.voltStable; },    weight: 5, label: "tensione stabile misurata" }
    ],
    bestCheck: "Misura tensione al contatore — se anomala a monte del generale → distributore",
    missingEvidence: "Tensione a monte del generale e conferma da vicini"
  }
];

function pushNormalizedFact(facts, type, value, unit, source, certainty, relatedTo) {
  facts.push({
    type: type,
    value: value,
    unit: unit || null,
    source: source || "unknown",
    certainty: certainty || "non_verifiable",
    relatedTo: relatedTo || null
  });
}

function getFactsByType(facts, type) {
  return facts.filter(function (fact) { return fact.type === type; });
}

function getFirstFact(facts, type, predicate) {
  for (var i = 0; i < facts.length; i++) {
    if (facts[i].type !== type) continue;
    if (!predicate || predicate(facts[i])) return facts[i];
  }
  return null;
}

function hasFact(facts, type, predicate) {
  for (var i = 0; i < facts.length; i++) {
    if (facts[i].type !== type) continue;
    if (!predicate || predicate(facts[i])) return true;
  }
  return false;
}

function pushDiagnosticCheck(checks, id, reason, priority, basedOnFacts) {
  if (!reason) return;
  for (var i = 0; i < checks.length; i++) {
    if (checks[i].reason === reason) return;
  }
  checks.push({
    id: id,
    reason: reason,
    priority: priority,
    basedOnFacts: Array.isArray(basedOnFacts) ? basedOnFacts.slice(0, 4) : []
  });
}

function getMeasuredValuesFromFacts(facts) {
  return facts.filter(function (fact) {
    return fact.source === "numeric_parser" &&
      fact.relatedTo &&
      typeof fact.relatedTo === "object" &&
      Object.prototype.hasOwnProperty.call(fact.relatedTo, "raw");
  }).map(function (fact) {
    var meta = fact.relatedTo || {};
    var item = {
      type: fact.type,
      value: fact.value,
      unit: fact.unit,
      raw: meta.raw || null
    };
    if (meta.warning) item.warning = meta.warning;
    return item;
  });
}

function getVoltageSignalFromFacts(facts) {
  var fact = getFirstFact(facts, "voltage_anomaly") || getFirstFact(facts, "voltage_reference");
  if (!fact) return null;

  return {
    measured: fact.value,
    nominal: NOMINAL_VOLTAGE,
    deviation: fact.relatedTo && fact.relatedTo.deviation,
    direction: fact.relatedTo && fact.relatedTo.direction,
    anomaly: fact.type === "voltage_anomaly",
    context: "BT monofase " + NOMINAL_VOLTAGE + "V"
  };
}

function createEmptyNormalizedInput(rawInput) {
  return {
    rawText: String((rawInput && rawInput.message) || "").trim(),
    isTechnical: false,
    symptoms: [],
    technicalKeywords: [],
    measurements: [],
    observedStates: [],
    recognizedComponents: [],
    environmentContext: {
      domains: [],
      plantType: null,
      voltageContext: [],
      hazardHints: []
    },
    userClaims: [],
    missingData: [],
    contradictions: [],
    meta: {
      hasImage: !!(rawInput && rawInput.hasImage),
      hasVisionData: !!(rawInput && (rawInput.visionData || rawInput.visionResult || rawInput.visionText || rawInput.visionOutput)),
      hasHistory: !!(rawInput && (rawInput.history || rawInput.chatHistory || rawInput.caseHistory))
    }
  };
}

function dedupeNormalizedEntries(entries, mode) {
  var result = [];
  var indexByKey = {};

  function normalizeKey(value) {
    return normalize(String(value || "")).replace(/\s+/g, " ").trim();
  }

  function measurementKey(entry) {
    var valueKey = entry && entry.value !== null && entry.value !== undefined
      ? String(entry.value)
      : "raw:" + normalizeKey(entry && entry.raw);
    return [
      normalizeKey(entry && entry.key),
      normalizeKey(entry && entry.unit),
      valueKey
    ].join("|");
  }

  function measurementCompleteness(entry) {
    var score = 0;
    if (entry && typeof entry.value === "number") score += 4;
    if (entry && entry.unit) score += 2;
    if (entry && entry.raw) score += 2;
    if (entry && entry.label) score += 1;
    if (entry && entry.source && entry.source !== "derived") score += 1;
    if (entry && typeof entry.confidence === "number") score += entry.confidence;
    return score;
  }

  function componentKey(entry) {
    return [
      normalizeKey(entry && entry.key),
      normalizeKey(entry && entry.type)
    ].join("|");
  }

  (Array.isArray(entries) ? entries : []).forEach(function (entry) {
    var key;
    var existingIndex;
    var existing;

    if (mode === "measurement") {
      key = measurementKey(entry);
    } else if (mode === "component") {
      key = componentKey(entry);
    } else if (typeof entry === "string") {
      key = normalizeKey(entry);
    } else {
      key = normalizeKey(entry && (entry.key || entry.id || entry.label || entry.rawLabel || entry.type));
    }

    if (!key) return;
    existingIndex = indexByKey[key];

    if (existingIndex === undefined) {
      indexByKey[key] = result.length;
      result.push(entry);
      return;
    }

    existing = result[existingIndex];
    if (mode === "measurement") {
      if (measurementCompleteness(entry) > measurementCompleteness(existing)) {
        result[existingIndex] = entry;
      }
      return;
    }

    if (mode === "component") {
      var currentConfidence = existing && typeof existing.confidence === "number" ? existing.confidence : 0;
      var nextConfidence = entry && typeof entry.confidence === "number" ? entry.confidence : 0;
      if (nextConfidence > currentConfidence) {
        result[existingIndex] = entry;
      }
    }
  });

  return result;
}

function normalizeTechnicalKeywords(rawText) {
  return dedupeNormalizedEntries(findMatches(rawText, TECH_KEYWORDS));
}

function normalizeMeasurements(rawInput) {
  var rawText = String((rawInput && rawInput.message) || "");
  var sourceMeasurements = [];

  if (Array.isArray(rawInput && rawInput.measuredValues)) {
    sourceMeasurements = sourceMeasurements.concat(rawInput.measuredValues);
  }
  sourceMeasurements = sourceMeasurements.concat(_collectMeasuredValues(rawText));

  return dedupeNormalizedEntries(sourceMeasurements.map(function (entry) {
    var value = typeof entry.value === "number" && !isNaN(entry.value) ? entry.value : null;
    var source = entry.source;

    if (source !== "vision" && source !== "context" && source !== "derived") {
      source = "text";
    }

    return {
      key: String(entry.type || entry.key || "misura"),
      label: String(entry.label || entry.type || entry.key || "misura"),
      value: value,
      unit: entry.unit || null,
      source: source || "text",
      raw: entry.raw ? String(entry.raw) : null,
      confidence: value === null ? 0.45 : source === "derived" ? 0.55 : source === "vision" ? 0.7 : 0.95
    };
  }), "measurement");
}

function normalizeObservedStates(rawText) {
  var lower = normalize(rawText);
  var states = [];
  var orderedMatchers = [
    { id: "danger_keyword", test: /fumo|fuma|scintill|incendio|fiamma|folgor|scossa/i },
    { id: "rcd_trip", test: /scatta|salta|interviene|sgancia/i },
    { id: "mcb_trip", test: /magnetoterm|mcb/i },
    { id: "burn_signs", test: /bruciat|fuma|odore|sciolto|scintill/i },
    { id: "darkened", test: /annerit|scurit|nero|deformat/i },
    { id: "trips_no_load", test: /a vuoto|senza carico|tutto staccato|niente collegato/i },
    { id: "under_load", test: /sotto carico|quando accendo|quando uso|con carico/i },
    { id: "appliance_mentioned", test: /lavatrice|forno|scaldabagno|asciugatrice|lavastoviglie|condizionatore|boiler|caricabatter/i },
    { id: "old_install", test: /vecchio|datato|anni|deteriorat|usurato/i },
    { id: "new_install", test: /nuovo|recente|appena|rifatto/i },
    { id: "moisture", test: /umid|acqua|piove|cantina|allagat|condensa|infiltra/i },
    { id: "outdoor", test: /esterno|giardino|terrazzo|balcone/i },
    { id: "dry", test: /secco|asciutto/i },
    { id: "terminal_reference", test: /morsett|allentat|serrat/i },
    { id: "heavy_load", test: /carico|potenza|kw|watt|troppi|contemporane/i },
    { id: "light_load", test: /poco carico|carico leggero|quasi niente/i },
    { id: "long_run", test: /lungo|distanza|prolunga|lontano/i },
    { id: "neutral_reference", test: /neutro|sbilanciat/i },
    { id: "zone_wide", test: /palazzo|vicini|zona|quartiere|condomini/i },
    { id: "only_me", test: /solo io|solo a me|solo casa mia/i },
    { id: "flickering", test: /sbalzi|flicker|intermittent|sfarfall/i }
  ];
  var hasNegatedDanger = /nessun(?:a|o)?\s+(?:odore|fumo|scintill\w*|segno di bruciato)|senza\s+(?:odore|fumo|scintill\w*)/i.test(lower);

  orderedMatchers.forEach(function (entry) {
    if (!entry.test.test(lower)) return;
    if ((entry.id === "danger_keyword" || entry.id === "burn_signs") && hasNegatedDanger) return;
    states.push(entry.id);
  });

  if (/magnetoterm|mcb/i.test(lower) && /scatta|salta|interviene/i.test(lower)) {
    states.push("mcb_trip");
  }

  return dedupeNormalizedEntries(states);
}

function normalizeRecognizedComponents(rawInput, catalog) {
  var rawText = String((rawInput && rawInput.message) || "");
  var queryNorm = normalize(rawText);
  var queryTokens = tokenize(rawText);
  var recognized = [];

  (Array.isArray(rawInput && rawInput.recognizedComponents) ? rawInput.recognizedComponents : []).forEach(function (entry) {
    recognized.push({
      key: String(entry.key || entry.id || entry.type || "component"),
      type: String(entry.type || entry.category || "component"),
      rawLabel: entry.rawLabel || entry.label || entry.id || null,
      source: entry.source === "vision" ? "vision" : entry.source === "catalog" ? "catalog" : "text",
      confidence: typeof entry.confidence === "number" ? entry.confidence : 0.6
    });
  });

  (Array.isArray(catalog) ? catalog : []).map(function (component) {
    return { component: component, score: scoreComponentMatch(component, queryNorm, queryTokens) };
  }).filter(function (entry) {
    return entry.score >= 2;
  }).sort(function (a, b) {
    return b.score - a.score;
  }).slice(0, 3).forEach(function (entry) {
    recognized.push({
      key: entry.component.id,
      type: entry.component.category || "component",
      rawLabel: entry.component.id,
      source: "catalog",
      confidence: Math.min(1, entry.score / 10)
    });
  });

  return dedupeNormalizedEntries(recognized, "component");
}

function normalizeEnvironmentContext(parts) {
  var rawText = String((parts && parts.rawText) || "");
  var lower = normalize(rawText);
  var technicalKeywords = Array.isArray(parts && parts.technicalKeywords) ? parts.technicalKeywords : [];
  var measurements = Array.isArray(parts && parts.measurements) ? parts.measurements : [];
  var observedStates = Array.isArray(parts && parts.observedStates) ? parts.observedStates : [];
  var environment = {
    domains: [],
    plantType: null,
    voltageContext: [],
    hazardHints: []
  };

  function pushUnique(list, value) {
    if (!value || list.indexOf(value) >= 0) return;
    list.push(value);
  }

  technicalKeywords.forEach(function (keyword) {
    var normalizedKeyword = normalize(keyword);

    if (/tensione|volt|vac|vdc|fase|neutro/.test(normalizedKeyword)) pushUnique(environment.domains, "tensione");
    if (/isolamento|terra|dispersione|megohmetro|ohmmetro/.test(normalizedKeyword)) pushUnique(environment.domains, "isolamento");
    if (/differenziale|rcd|rcbo|salvavita/.test(normalizedKeyword)) pushUnique(environment.domains, "differenziale");
    if (/caldo|bruciato|odore|scintille/.test(normalizedKeyword)) pushUnique(environment.domains, "bruciato_fumo_odore");
    if (/morsett|neutro|continuita/.test(normalizedKeyword)) pushUnique(environment.domains, "continuita");
  });

  measurements.forEach(function (measurement) {
    if (measurement.key === "tensione") pushUnique(environment.domains, "tensione");
    if (measurement.key === "isolamento" || measurement.key === "resistenza") pushUnique(environment.domains, "isolamento");
    if (measurement.key === "temperatura") pushUnique(environment.domains, "temperatura");
    if (measurement.key === "tensione" && measurement.value !== null) {
      pushUnique(environment.voltageContext, String(measurement.value) + (measurement.unit || ""));
    }
  });

  observedStates.forEach(function (state) {
    if (state === "rcd_trip") pushUnique(environment.domains, "differenziale");
    if (state === "neutral_reference" || state === "terminal_reference") pushUnique(environment.domains, "continuita");
    if (state === "danger_keyword" || state === "burn_signs" || state === "darkened") {
      pushUnique(environment.domains, "bruciato_fumo_odore");
      pushUnique(environment.hazardHints, state);
    }
    if (state === "outdoor") pushUnique(environment.hazardHints, "outdoor");
  });

  if (!environment.plantType) {
    if (/quadro/.test(lower)) environment.plantType = "quadro";
    else if (/impianto/.test(lower)) environment.plantType = "impianto";
    else if (/motore/.test(lower)) environment.plantType = "motore";
    else if (/inverter|fotovoltaico/.test(lower)) environment.plantType = "inverter";
  }

  if (containsAny(lower, VOLTAGE_KEYWORDS)) {
    if (/400v/.test(lower)) pushUnique(environment.voltageContext, "400V");
    if (/230v/.test(lower)) pushUnique(environment.voltageContext, "230V");
    if (/24v/.test(lower)) pushUnique(environment.voltageContext, "24V");
    if (!environment.voltageContext.length) pushUnique(environment.voltageContext, "tensione_menzionata");
  }

  return environment;
}

function normalizeUserClaims(rawText) {
  var lower = normalize(rawText);
  var claims = [];

  if (/non\s+c['â€™]?\s*e\s+tensione|non\s+ce\s+tensione|nessuna\s+tensione|senza\s+tensione|manca\s+tensione/i.test(lower)) {
    claims.push("nessuna tensione dichiarata");
  }
  if (/\b(?:dispositivo|carico|apparecchio|motore|impianto|quadro)\s+spento\b|\be\s+spento\b/i.test(lower)) {
    claims.push("dispositivo spento dichiarato");
  }
  if (/solo io|solo a me|solo casa mia/i.test(lower)) {
    claims.push("anomalia locale dichiarata");
  }
  if (/palazzo|vicini|zona|quartiere|condomini/i.test(lower)) {
    claims.push("anomalia di zona dichiarata");
  }

  return dedupeNormalizedEntries(claims);
}

function detectNormalizationContradictions(normalizedInput) {
  var contradictions = [];
  var measurements = Array.isArray(normalizedInput && normalizedInput.measurements) ? normalizedInput.measurements : [];
  var observedStates = Array.isArray(normalizedInput && normalizedInput.observedStates) ? normalizedInput.observedStates : [];
  var userClaims = Array.isArray(normalizedInput && normalizedInput.userClaims) ? normalizedInput.userClaims : [];
  var voltages = measurements.filter(function (measurement) { return measurement.key === "tensione" && typeof measurement.value === "number"; });
  var isolations = measurements.filter(function (measurement) { return measurement.key === "isolamento" && typeof measurement.value === "number"; });
  var currents = measurements.filter(function (measurement) {
    return (measurement.key === "corrente" || measurement.key === "corrente_ma") && typeof measurement.value === "number";
  });

  function pushUnique(text) {
    if (!text || contradictions.indexOf(text) >= 0) return;
    contradictions.push(text);
  }

  if (userClaims.indexOf("nessuna tensione dichiarata") >= 0) {
    voltages.forEach(function (measurement) {
      if (measurement.value >= 100) {
        pushUnique(measurement.value + (measurement.unit || "V") + " dichiarati assenti ma misura presente " + measurement.value + (measurement.unit || "V") + " fase-neutro");
      }
    });
  }

  if (userClaims.indexOf("dispositivo spento dichiarato") >= 0) {
    currents.forEach(function (measurement) {
      if (measurement.value > 0) {
        pushUnique("Dispositivo dichiarato spento ma assorbimento presente " + measurement.value + (measurement.unit || ""));
      }
    });
  }

  if (isolations.some(function (measurement) { return measurement.value < 1; }) &&
      isolations.some(function (measurement) { return measurement.value > 10; })) {
    pushUnique("Misure isolamento incompatibili tra basso e alto sullo stesso caso");
  }

  if (observedStates.indexOf("moisture") >= 0 && observedStates.indexOf("dry") >= 0) {
    pushUnique("Contesto dichiarato sia umido sia asciutto");
  }

  if (observedStates.indexOf("old_install") >= 0 && observedStates.indexOf("new_install") >= 0) {
    pushUnique("Impianto dichiarato sia vecchio sia recente");
  }

  if (observedStates.indexOf("under_load") >= 0 && observedStates.indexOf("trips_no_load") >= 0) {
    pushUnique("Difetto dichiarato sia sotto carico sia a vuoto");
  }

  return contradictions;
}

function buildNormalizedInput(rawInput, options) {
  var normalizedInput = createEmptyNormalizedInput(rawInput);
  var components = options && Array.isArray(options.components) ? options.components : [];
  var measurements;
  var criticalMissing = [];

  function pushUnique(list, value) {
    if (!value || list.indexOf(value) >= 0) return;
    list.push(value);
  }

  normalizedInput.technicalKeywords = normalizeTechnicalKeywords(normalizedInput.rawText);
  normalizedInput.observedStates = normalizeObservedStates(normalizedInput.rawText);
  normalizedInput.userClaims = normalizeUserClaims(normalizedInput.rawText);
  normalizedInput.measurements = normalizeMeasurements(rawInput);
  normalizedInput.recognizedComponents = normalizeRecognizedComponents(rawInput, components);
  normalizedInput.environmentContext = normalizeEnvironmentContext({
    rawText: normalizedInput.rawText,
    technicalKeywords: normalizedInput.technicalKeywords,
    measurements: normalizedInput.measurements,
    observedStates: normalizedInput.observedStates,
    recognizedComponents: normalizedInput.recognizedComponents
  });

  normalizedInput.symptoms = dedupeNormalizedEntries(normalizedInput.observedStates.map(function (state) {
    var labels = {
      rcd_trip: "differenziale scatta",
      mcb_trip: "magnetotermico scatta",
      burn_signs: "odore o segni di bruciato",
      darkened: "cavo annerito",
      under_load: "difetto sotto carico",
      trips_no_load: "difetto a vuoto",
      flickering: "sbalzi o sfarfallio",
      moisture: "presenza di umidita",
      neutral_reference: "riferimento neutro"
    };
    return labels[state] || null;
  }).concat(normalizedInput.userClaims));

  measurements = normalizedInput.measurements;
  normalizedInput.isTechnical = containsAny(normalizedInput.rawText, TECH_KEYWORDS) ||
    measurements.length > 0 ||
    normalizedInput.recognizedComponents.length > 0;

  if (normalizedInput.isTechnical && !measurements.length) {
    criticalMissing.push("mancano misure strumentali di base");
  }
  if ((normalizedInput.environmentContext.domains.indexOf("differenziale") >= 0 ||
       normalizedInput.observedStates.indexOf("rcd_trip") >= 0) &&
      !measurements.some(function (measurement) { return measurement.key === "isolamento"; })) {
    criticalMissing.push("manca misura isolamento verso terra");
  }
  if ((normalizedInput.environmentContext.domains.indexOf("tensione") >= 0 ||
       normalizedInput.userClaims.indexOf("nessuna tensione dichiarata") >= 0) &&
      !measurements.some(function (measurement) { return measurement.key === "tensione"; })) {
    criticalMissing.push("manca misura tensione fase-neutro");
  }
  if (normalizedInput.environmentContext.domains.indexOf("continuita") >= 0 &&
      !measurements.some(function (measurement) { return measurement.key === "resistenza"; })) {
    criticalMissing.push("manca verifica continuita o serraggio del neutro");
  }

  criticalMissing.forEach(function (item) {
    pushUnique(normalizedInput.missingData, item);
  });

  normalizedInput.contradictions = detectNormalizationContradictions(normalizedInput);
  normalizedInput.missingData = dedupeNormalizedEntries(normalizedInput.missingData);
  return normalizedInput;
}

function buildNormalizedInferenceQuery(normalizedInput) {
  var parts = [];

  function pushParts(values) {
    (Array.isArray(values) ? values : []).forEach(function (value) {
      if (!value) return;
      parts.push(String(value));
    });
  }

  if (!normalizedInput) return { text: "", lower: "", tokens: [] };

  pushParts(normalizedInput.technicalKeywords);
  pushParts(normalizedInput.symptoms);
  pushParts(normalizedInput.userClaims);
  pushParts(normalizedInput.observedStates);
  pushParts(normalizedInput.environmentContext && normalizedInput.environmentContext.domains);
  pushParts(normalizedInput.environmentContext && normalizedInput.environmentContext.voltageContext);
  pushParts((normalizedInput.measurements || []).map(function (measurement) {
    if (measurement.raw) return measurement.raw;
    if (measurement.value === null) return measurement.label || measurement.key;
    return String(measurement.value) + (measurement.unit || "") + " " + (measurement.label || measurement.key);
  }));
  pushParts((normalizedInput.recognizedComponents || []).map(function (component) {
    return component.rawLabel || component.key;
  }));

  parts = dedupeNormalizedEntries(parts);
  return {
    text: parts.join(" "),
    lower: normalize(parts.join(" ")),
    tokens: tokenize(parts.join(" "))
  };
}

function createEmptyEvidenceSet() {
  return {
    confirmedFacts: [],
    probableFacts: [],
    anomalies: [],
    contradictoryFacts: [],
    missingCriticalFacts: [],
    physicalConstraintsMatched: [],
    ruleTriggers: [],
    derivedSignals: [],
    evidenceScoreMap: {
      measurements: 0,
      components: 0,
      states: 0,
      consistency: 1,
      completeness: 1,
      total: 0
    }
  };
}

function createEvidenceFact(key, category, label, value, unit, source, confidence, support) {
  return {
    key: key || "unknown",
    category: category || "derived",
    label: label || key || "unknown",
    value: value === undefined ? null : value,
    unit: unit || null,
    source: source || "derived",
    confidence: typeof confidence === "number" ? Math.max(0, Math.min(1, confidence)) : 0,
    support: Array.isArray(support) ? support.slice(0, 6) : []
  };
}

function addConfirmedFact(evidenceSet, fact) {
  if (!evidenceSet || !fact) return;
  evidenceSet.confirmedFacts.push(fact);
}

function addProbableFact(evidenceSet, fact) {
  if (!evidenceSet || !fact) return;
  evidenceSet.probableFacts.push(fact);
}

function addAnomaly(evidenceSet, anomaly) {
  if (!evidenceSet || !anomaly || !anomaly.key) return;
  evidenceSet.anomalies.push({
    key: anomaly.key,
    severity: anomaly.severity || "low",
    label: anomaly.label || anomaly.key,
    details: anomaly.details || anomaly.label || anomaly.key,
    relatedMeasurements: Array.isArray(anomaly.relatedMeasurements) ? anomaly.relatedMeasurements.slice(0, 6) : [],
    support: Array.isArray(anomaly.support) ? anomaly.support.slice(0, 6) : []
  });
}

function addDerivedSignal(evidenceSet, signal) {
  if (!evidenceSet || !signal || !signal.key) return;
  evidenceSet.derivedSignals.push({
    key: signal.key,
    label: signal.label || signal.key,
    strength: typeof signal.strength === "number" ? Math.max(0, Math.min(1, signal.strength)) : 0,
    support: Array.isArray(signal.support) ? signal.support.slice(0, 6) : []
  });
}

function addMissingCriticalFact(evidenceSet, label) {
  if (!evidenceSet || !label) return;
  if (evidenceSet.missingCriticalFacts.indexOf(label) >= 0) return;
  evidenceSet.missingCriticalFacts.push(label);
}

function addContradictoryFact(evidenceSet, label) {
  if (!evidenceSet || !label) return;
  if (evidenceSet.contradictoryFacts.indexOf(label) >= 0) return;
  evidenceSet.contradictoryFacts.push(label);
}

function addPhysicalConstraintMatch(evidenceSet, label) {
  if (!evidenceSet || !label) return;
  if (evidenceSet.physicalConstraintsMatched.indexOf(label) >= 0) return;
  evidenceSet.physicalConstraintsMatched.push(label);
}

function addRuleTrigger(evidenceSet, label) {
  if (!evidenceSet || !label) return;
  if (evidenceSet.ruleTriggers.indexOf(label) >= 0) return;
  evidenceSet.ruleTriggers.push(label);
}

function dedupeEvidenceFacts(facts) {
  var seen = {};
  var output = [];

  (Array.isArray(facts) ? facts : []).forEach(function (fact) {
    var key = normalize(String((fact && fact.key) || "")) + "|" +
      normalize(String((fact && fact.label) || "")) + "|" +
      normalize(String((fact && fact.unit) || "")) + "|" +
      String(fact && fact.value);
    var currentIndex;
    var current;

    if (!key || key === "|||undefined") return;
    currentIndex = seen[key];
    if (currentIndex === undefined) {
      seen[key] = output.length;
      output.push(fact);
      return;
    }

    current = output[currentIndex];
    if ((fact.confidence || 0) > (current.confidence || 0)) {
      output[currentIndex] = fact;
    }
  });

  return output;
}

function buildMeasurementEvidence(normalizedInput, evidenceSet) {
  (normalizedInput.measurements || []).forEach(function (measurement) {
    var isStrongMeasurement = typeof measurement.value === "number" && measurement.value !== null;
    var support = [measurement.raw || measurement.label || measurement.key];
    var fact = createEvidenceFact(
      measurement.key,
      "measurement",
      measurement.label || measurement.key,
      measurement.value,
      measurement.unit,
      "normalized",
      measurement.confidence,
      support
    );

    if (isStrongMeasurement && measurement.confidence >= 0.75) addConfirmedFact(evidenceSet, fact);
    else addProbableFact(evidenceSet, fact);

    if (measurement.key === "isolamento" && typeof measurement.value === "number" && measurement.value < 1) {
      addConfirmedFact(evidenceSet, createEvidenceFact("isolation_low", "constraint", "isolamento sotto soglia", measurement.value, measurement.unit, "rule", 0.98, support));
      addAnomaly(evidenceSet, {
        key: "isolation_below_threshold",
        severity: "high",
        label: "isolamento sotto soglia",
        details: "Isolamento misurato sotto 1 MO",
        relatedMeasurements: [measurement.key],
        support: support
      });
      addPhysicalConstraintMatch(evidenceSet, "isolation_below_threshold");
      addDerivedSignal(evidenceSet, {
        key: "insulation_fault_signal",
        label: "segnale guasto isolamento",
        strength: 0.98,
        support: support
      });
      addDerivedSignal(evidenceSet, {
        key: "earth_leakage_signal",
        label: "segnale dispersione verso terra",
        strength: 0.92,
        support: support
      });
    } else if (measurement.key === "isolamento" && typeof measurement.value === "number" && measurement.value > 10) {
      addConfirmedFact(evidenceSet, createEvidenceFact("isolation_high", "constraint", "isolamento elevato", measurement.value, measurement.unit, "rule", 0.9, support));
      addPhysicalConstraintMatch(evidenceSet, "isolation_above_reference");
    }

    if (measurement.key === "tensione" && typeof measurement.value === "number") {
      if (measurement.value >= VOLTAGE_MIN && measurement.value <= VOLTAGE_MAX) {
        addConfirmedFact(evidenceSet, createEvidenceFact("voltage_nominal", "constraint", "tensione nel range nominale", measurement.value, measurement.unit, "rule", 0.9, support));
        addDerivedSignal(evidenceSet, {
          key: "supply_ok_signal",
          label: "segnale alimentazione coerente",
          strength: 0.7,
          support: support
        });
      } else {
        addConfirmedFact(evidenceSet, createEvidenceFact("voltage_anomaly", "constraint", "tensione fuori range", measurement.value, measurement.unit, "rule", 0.95, support));
        addAnomaly(evidenceSet, {
          key: "voltage_out_of_nominal_range",
          severity: "high",
          label: "tensione fuori range nominale",
          details: "Tensione misurata fuori dal range 207-253V",
          relatedMeasurements: [measurement.key],
          support: support
        });
        addPhysicalConstraintMatch(evidenceSet, "voltage_out_of_nominal_range");
        addDerivedSignal(evidenceSet, {
          key: "supply_anomaly_signal",
          label: "segnale anomalia alimentazione",
          strength: 0.9,
          support: support
        });
      }
    }

    if (measurement.key === "temperatura" && typeof measurement.value === "number" && measurement.value > 80) {
      addConfirmedFact(evidenceSet, createEvidenceFact("temperature_high", "constraint", "temperatura alta", measurement.value, measurement.unit, "rule", 0.95, support));
      addAnomaly(evidenceSet, {
        key: "temperature_above_safe_limit",
        severity: "high",
        label: "temperatura alta",
        details: "Temperatura oltre 80�C",
        relatedMeasurements: [measurement.key],
        support: support
      });
      addPhysicalConstraintMatch(evidenceSet, "temperature_above_safe_limit");
      addDerivedSignal(evidenceSet, {
        key: "thermal_damage_signal",
        label: "segnale surriscaldamento",
        strength: 0.9,
        support: support
      });
    }

    if ((measurement.key === "corrente" && typeof measurement.value === "number" && measurement.value > 16) ||
        (measurement.key === "corrente_ma" && typeof measurement.value === "number" && measurement.value > 16000)) {
      addConfirmedFact(evidenceSet, createEvidenceFact("high_current", "constraint", "corrente elevata", measurement.value, measurement.unit, "rule", 0.9, support));
      addAnomaly(evidenceSet, {
        key: "current_above_reference_limit",
        severity: "medium",
        label: "corrente elevata",
        details: "Corrente superiore al riferimento usato dal motore",
        relatedMeasurements: [measurement.key],
        support: support
      });
      addPhysicalConstraintMatch(evidenceSet, "current_above_reference_limit");
      addDerivedSignal(evidenceSet, {
        key: "overload_signal",
        label: "segnale sovraccarico",
        strength: 0.78,
        support: support
      });
    }
  });
}

function buildComponentEvidence(normalizedInput, evidenceSet) {
  (normalizedInput.recognizedComponents || []).forEach(function (component) {
    var fact = createEvidenceFact(
      component.key,
      "component",
      component.rawLabel || component.key,
      true,
      null,
      "normalized",
      component.confidence,
      [component.rawLabel || component.key]
    );

    if ((component.confidence || 0) >= 0.8) addConfirmedFact(evidenceSet, fact);
    else addProbableFact(evidenceSet, fact);
  });

  if ((normalizedInput.recognizedComponents || []).length) {
    addDerivedSignal(evidenceSet, {
      key: "component_presence_signal",
      label: "presenza componenti riconosciuti",
      strength: Math.min(1, (normalizedInput.recognizedComponents.length * 0.3) + 0.2),
      support: (normalizedInput.recognizedComponents || []).map(function (component) { return component.key; })
    });
  }
}

function buildObservedStateEvidence(normalizedInput, evidenceSet) {
  var strongStates = {
    rcd_trip: true,
    burn_signs: true,
    darkened: true,
    under_load: true,
    trips_no_load: true,
    moisture: true,
    outdoor: true,
    dry: true,
    terminal_reference: true,
    neutral_reference: true,
    flickering: true,
    no_voltage_claim: true,
    device_off_claim: true
  };

  (normalizedInput.observedStates || []).forEach(function (state) {
    var fact = createEvidenceFact(state, "state", state, true, null, "normalized", strongStates[state] ? 0.8 : 0.6, [state]);
    if (strongStates[state]) addConfirmedFact(evidenceSet, fact);
    else addProbableFact(evidenceSet, fact);
  });

  (normalizedInput.userClaims || []).forEach(function (claim) {
    if (claim === "nessuna tensione dichiarata") {
      addProbableFact(evidenceSet, createEvidenceFact("no_voltage_claim", "state", claim, true, null, "normalized", 0.65, [claim]));
    } else if (claim === "dispositivo spento dichiarato") {
      addProbableFact(evidenceSet, createEvidenceFact("device_off_claim", "state", claim, true, null, "normalized", 0.65, [claim]));
    }
  });
}

function buildContextEvidence(normalizedInput, evidenceSet) {
  var context = normalizedInput.environmentContext || {};

  if (normalizedInput.isTechnical) {
    addProbableFact(evidenceSet, createEvidenceFact("technical_request", "context", "richiesta tecnica", true, null, "normalized", 0.8, normalizedInput.technicalKeywords));
  }
  if (normalizedInput.meta && normalizedInput.meta.hasImage) {
    addProbableFact(evidenceSet, createEvidenceFact("has_image", "context", "immagine presente", true, null, "normalized", 1, ["hasImage"]));
  }
  if ((context.domains || []).indexOf("tensione") >= 0) {
    addProbableFact(evidenceSet, createEvidenceFact("mentions_voltage", "context", "dominio tensione osservato", true, null, "normalized", 0.75, context.domains));
  }
  if ((context.domains || []).indexOf("differenziale") >= 0) {
    addProbableFact(evidenceSet, createEvidenceFact("mentions_rcd", "context", "dominio differenziale osservato", true, null, "normalized", 0.75, context.domains));
  }
  if ((normalizedInput.observedStates || []).indexOf("outdoor") >= 0) {
    addProbableFact(evidenceSet, createEvidenceFact("mentions_outdoor", "context", "contesto esterno", true, null, "normalized", 0.75, context.hazardHints));
  }
  if ((normalizedInput.measurements || []).length) {
    addProbableFact(evidenceSet, createEvidenceFact("mentions_measure", "context", "misure disponibili", true, null, "normalized", 0.85, (normalizedInput.measurements || []).map(function (measurement) { return measurement.key; })));
  }

  (context.domains || []).forEach(function (domain) {
    addProbableFact(evidenceSet, createEvidenceFact("domain_" + domain, "context", domain, true, null, "normalized", 0.65, [domain]));
  });
  if (context.plantType) {
    addProbableFact(evidenceSet, createEvidenceFact("plant_type", "context", context.plantType, context.plantType, null, "normalized", 0.6, [context.plantType]));
  }
}

function buildConstraintEvidence(normalizedInput, evidenceSet) {
  (normalizedInput.contradictions || []).forEach(function (contradiction) {
    addContradictoryFact(evidenceSet, contradiction);
  });

  (normalizedInput.missingData || []).forEach(function (missingFact) {
    addMissingCriticalFact(evidenceSet, missingFact);
  });

  if ((normalizedInput.userClaims || []).indexOf("nessuna tensione dichiarata") >= 0 &&
      (normalizedInput.measurements || []).some(function (measurement) {
        return measurement.key === "tensione" && typeof measurement.value === "number" && measurement.value >= 100;
      })) {
    addPhysicalConstraintMatch(evidenceSet, "no_voltage_claim_with_measurement");
  }

  if ((normalizedInput.userClaims || []).indexOf("dispositivo spento dichiarato") >= 0 &&
      (normalizedInput.measurements || []).some(function (measurement) {
        return (measurement.key === "corrente" || measurement.key === "corrente_ma") && typeof measurement.value === "number" && measurement.value > 0;
      })) {
    addPhysicalConstraintMatch(evidenceSet, "device_off_claim_with_current");
  }
}

function buildDerivedEvidence(normalizedInput, evidenceSet) {
  var hasRcdTrip = evidenceSet.confirmedFacts.concat(evidenceSet.probableFacts).some(function (fact) {
    return fact.key === "rcd_trip";
  });
  var hasIsolationLow = evidenceSet.confirmedFacts.some(function (fact) { return fact.key === "isolation_low"; });

  if (hasRcdTrip && hasIsolationLow) {
    addDerivedSignal(evidenceSet, {
      key: "earth_leakage_signal",
      label: "segnale dispersione con intervento differenziale",
      strength: 0.97,
      support: ["rcd_trip", "isolation_low"]
    });
    addRuleTrigger(evidenceSet, "rcd_trip_with_low_isolation");
  }

  if (evidenceSet.missingCriticalFacts.length) {
    addDerivedSignal(evidenceSet, {
      key: "measurement_gap_signal",
      label: "gap di misura critica",
      strength: Math.min(1, evidenceSet.missingCriticalFacts.length * 0.2),
      support: evidenceSet.missingCriticalFacts
    });
  }
}

function computeEvidenceScoreMap(evidenceSet, normalizedInput) {
  var confirmedMeasurements = evidenceSet.confirmedFacts.filter(function (fact) { return fact.category === "measurement"; }).length;
  var probableMeasurements = evidenceSet.probableFacts.filter(function (fact) { return fact.category === "measurement"; }).length;
  var confirmedComponents = evidenceSet.confirmedFacts.filter(function (fact) { return fact.category === "component"; }).length;
  var probableComponents = evidenceSet.probableFacts.filter(function (fact) { return fact.category === "component"; }).length;
  var confirmedStates = evidenceSet.confirmedFacts.filter(function (fact) { return fact.category === "state"; }).length;
  var probableStates = evidenceSet.probableFacts.filter(function (fact) { return fact.category === "state"; }).length;
  var measurementsScore = Math.min(1, (confirmedMeasurements * 0.35) + (probableMeasurements * 0.15));
  var componentsScore = Math.min(1, (confirmedComponents * 0.4) + (probableComponents * 0.2));
  var statesScore = Math.min(1, (confirmedStates * 0.2) + (probableStates * 0.1));
  var consistencyScore = Math.max(0, 1 - (evidenceSet.contradictoryFacts.length * 0.25));
  var completenessScore = Math.max(0, 1 - (evidenceSet.missingCriticalFacts.length * 0.2));
  var totalScore = Math.max(0, Math.min(1,
    (measurementsScore * 0.3) +
    (componentsScore * 0.15) +
    (statesScore * 0.15) +
    (consistencyScore * 0.2) +
    (completenessScore * 0.2)
  ));

  return {
    measurements: Math.round(measurementsScore * 10000) / 10000,
    components: Math.round(componentsScore * 10000) / 10000,
    states: Math.round(statesScore * 10000) / 10000,
    consistency: Math.round(consistencyScore * 10000) / 10000,
    completeness: Math.round(completenessScore * 10000) / 10000,
    total: Math.round(totalScore * 10000) / 10000
  };
}

function buildEvidenceSet(normalizedInput) {
  var evidenceSet = createEmptyEvidenceSet();

  buildMeasurementEvidence(normalizedInput, evidenceSet);
  buildComponentEvidence(normalizedInput, evidenceSet);
  buildObservedStateEvidence(normalizedInput, evidenceSet);
  buildContextEvidence(normalizedInput, evidenceSet);
  buildConstraintEvidence(normalizedInput, evidenceSet);
  buildDerivedEvidence(normalizedInput, evidenceSet);

  evidenceSet.confirmedFacts = dedupeEvidenceFacts(evidenceSet.confirmedFacts);
  evidenceSet.probableFacts = dedupeEvidenceFacts(evidenceSet.probableFacts);
  evidenceSet.evidenceScoreMap = computeEvidenceScoreMap(evidenceSet, normalizedInput);
  return evidenceSet;
}

function getEvidenceFactsByKey(evidenceSet, key) {
  if (!evidenceSet) return [];
  return evidenceSet.confirmedFacts.concat(evidenceSet.probableFacts).filter(function (fact) {
    return fact.key === key;
  });
}

function hasEvidenceFact(evidenceSet, key) {
  return getEvidenceFactsByKey(evidenceSet, key).length > 0;
}

function getEvidenceSignalStrength(evidenceSet, key) {
  var signal = (evidenceSet && evidenceSet.derivedSignals || []).find(function (entry) {
    return entry.key === key;
  });
  return signal ? signal.strength : 0;
}

function buildFactsFromEvidenceSet(evidenceSet, rawInput) {
  var facts = [];

  evidenceSet.confirmedFacts.concat(evidenceSet.probableFacts).forEach(function (fact) {
    pushNormalizedFact(
      facts,
      fact.key,
      fact.value,
      fact.unit,
      fact.category === "measurement" ? "numeric_parser" : (fact.source || "evidence"),
      fact.confidence >= 0.8 ? "confirmed" : "probable",
      {
        label: fact.label,
        support: fact.support,
        raw: fact.category === "measurement" && fact.support.length ? fact.support[0] : null
      }
    );
  });

  evidenceSet.anomalies.forEach(function (anomaly) {
    pushNormalizedFact(facts, "measurement_warning", anomaly.details || anomaly.label, null, "evidence", "probable", anomaly.key);
  });

  (rawInput.matchedKeywords || []).forEach(function (keyword) {
    pushNormalizedFact(facts, "matched_keyword", keyword, null, "findMatches", "probable", keyword);
  });

  (rawInput.scoredPatterns || []).forEach(function (entry) {
    pushNormalizedFact(
      facts,
      "matched_pattern",
      entry.pattern.id,
      null,
      "failurePatterns",
      entry.score >= 6 ? "probable" : "non_verifiable",
      { score: entry.score, pattern: entry.pattern }
    );
  });

  (rawInput.matchedComponents || []).forEach(function (entry) {
    var certainty = entry.score >= 8 ? "confirmed" : entry.score >= 4 ? "probable" : "non_verifiable";
    pushNormalizedFact(
      facts,
      "matched_component",
      entry.component.id,
      null,
      "components",
      certainty,
      { score: entry.score, component: entry.component }
    );
  });

  (rawInput.scoredRules || []).forEach(function (entry) {
    pushNormalizedFact(
      facts,
      "matched_rule",
      entry.rule.id,
      null,
      "protectionRules",
      entry.score >= 6 ? "probable" : "non_verifiable",
      { score: entry.score, rule: entry.rule }
    );
  });

  return facts;
}

function getMeasuredValuesFromEvidenceSet(evidenceSet) {
  return evidenceSet.confirmedFacts.concat(evidenceSet.probableFacts).filter(function (fact) {
    return fact.category === "measurement";
  }).map(function (fact) {
    var anomaly = (evidenceSet.anomalies || []).find(function (entry) {
      return Array.isArray(entry.relatedMeasurements) && entry.relatedMeasurements.indexOf(fact.key) >= 0;
    });
    return {
      type: fact.key,
      value: fact.value,
      unit: fact.unit,
      raw: fact.support && fact.support[0] ? fact.support[0] : null,
      warning: anomaly ? anomaly.details : null
    };
  });
}

function getVoltageSignalFromEvidenceSet(evidenceSet) {
  var anomalyFact = getEvidenceFactsByKey(evidenceSet, "voltage_anomaly")[0];
  var nominalFact = getEvidenceFactsByKey(evidenceSet, "voltage_nominal")[0] || getEvidenceFactsByKey(evidenceSet, "tensione")[0];
  var selected = anomalyFact || nominalFact;

  if (!selected || typeof selected.value !== "number") return null;

  return {
    measured: selected.value,
    nominal: NOMINAL_VOLTAGE,
    deviation: (((selected.value - NOMINAL_VOLTAGE) / NOMINAL_VOLTAGE) * 100).toFixed(1),
    direction: selected.value > NOMINAL_VOLTAGE ? "sopra" : selected.value < NOMINAL_VOLTAGE ? "sotto" : "nominale",
    anomaly: !!anomalyFact,
    context: "BT monofase " + NOMINAL_VOLTAGE + "V"
  };
}

function normalizeFacts(rawInput) {
  var normalizedInput = rawInput && rawInput.normalizedInput
    ? rawInput.normalizedInput
    : buildNormalizedInput(rawInput || {}, { components: rawInput && rawInput.components });
  var evidenceSet = rawInput && rawInput.evidenceSet
    ? rawInput.evidenceSet
    : buildEvidenceSet(normalizedInput);

  return buildFactsFromEvidenceSet(evidenceSet, {
    matchedKeywords: rawInput.matchedKeywords || normalizedInput.technicalKeywords || [],
    scoredPatterns: rawInput.scoredPatterns || [],
    matchedComponents: rawInput.matchedComponents || [],
    scoredRules: rawInput.scoredRules || []
  });
}

function detectContradictions(facts, normalizedInput) {
  var contradictions = [];

  function pushContradiction(id, reason, basedOnFacts, relatedFamilies) {
    contradictions.push({
      id: id,
      reason: reason,
      basedOnFacts: basedOnFacts,
      relatedFamilies: relatedFamilies || []
    });
  }

  if (hasFact(facts, "isolation_low") && hasFact(facts, "isolation_high")) {
    pushContradiction("CTR-ISO-01", "Misure isolamento discordanti tra basso e alto.", ["isolation_low", "isolation_high"], ["dispersione"]);
  }
  if (hasFact(facts, "voltage_anomaly") && hasFact(facts, "voltage_nominal")) {
    pushContradiction("CTR-VOLT-01", "Misure tensione miste tra nominale e fuori range.", ["voltage_anomaly", "voltage_nominal"], ["anomalia_rete"]);
  }
  if (hasFact(facts, "no_voltage_claim") && hasFact(facts, "tensione", function (fact) { return typeof fact.value === "number" && fact.value >= 100; })) {
    pushContradiction("CTR-VOLT-02", "Dichiarata assenza tensione ma presente una misura significativa tra i conduttori.", ["no_voltage_claim", "tensione"], ["anomalia_rete"]);
  }
  if (hasFact(facts, "device_off_claim") &&
      (hasFact(facts, "corrente", function (fact) { return typeof fact.value === "number" && fact.value > 0; }) ||
       hasFact(facts, "corrente_ma", function (fact) { return typeof fact.value === "number" && fact.value > 0; }))) {
    pushContradiction("CTR-CURR-01", "Dispositivo dichiarato spento ma assorbimento misurato presente.", ["device_off_claim", "corrente"], ["sovracorrente"]);
  }
  if (hasFact(facts, "moisture") && hasFact(facts, "dry")) {
    pushContradiction("CTR-CTX-01", "Contesto dichiarato sia umido sia asciutto.", ["moisture", "dry"], ["dispersione"]);
  }
  if (hasFact(facts, "old_install") && hasFact(facts, "new_install")) {
    pushContradiction("CTR-CTX-02", "Impianto descritto sia vecchio sia recente.", ["old_install", "new_install"], []);
  }
  if (hasFact(facts, "under_load") && hasFact(facts, "trips_no_load")) {
    pushContradiction("CTR-LOAD-01", "Attivazione descritta sia sotto carico sia a vuoto.", ["under_load", "trips_no_load"], ["dispersione", "surriscaldamento"]);
  }
  (normalizedInput && Array.isArray(normalizedInput.contradictions) ? normalizedInput.contradictions : []).forEach(function (reason, index) {
    pushContradiction("CTR-NORM-" + index, reason, ["normalization_contradiction"], []);
  });

  return contradictions;
}

function computeSafetyDecision(facts, contradictions, evidenceSet) {
  var level = "safe";
  var reasons = [];
  var hasStopEvidence = hasEvidenceFact(evidenceSet, "burn_signs") ||
    hasEvidenceFact(evidenceSet, "danger_keyword") ||
    hasEvidenceFact(evidenceSet, "temperature_high") ||
    (evidenceSet && evidenceSet.anomalies || []).some(function (anomaly) {
      return anomaly.key === "temperature_above_safe_limit";
    });
  var hasDangerEvidence = hasEvidenceFact(evidenceSet, "voltage_anomaly") ||
    (evidenceSet && evidenceSet.anomalies || []).some(function (anomaly) {
      return anomaly.key === "voltage_out_of_nominal_range";
    });
  var hasAttentionEvidence = contradictions.length > 0 ||
    (evidenceSet && evidenceSet.contradictoryFacts || []).length > 0 ||
    (evidenceSet && evidenceSet.missingCriticalFacts || []).length > 0 ||
    hasEvidenceFact(evidenceSet, "mentions_rcd") ||
    hasEvidenceFact(evidenceSet, "mentions_outdoor") ||
    hasEvidenceFact(evidenceSet, "measurement_warning") ||
    getEvidenceSignalStrength(evidenceSet, "measurement_gap_signal") > 0 ||
    hasFact(facts, "matched_rule", function (fact) {
      return fact.relatedTo && fact.relatedTo.rule && fact.relatedTo.rule.risk_level === "high";
    });

  if (hasStopEvidence) {
    level = "stop";
    reasons.push("Presenza di segnali di danno o temperatura alta: mettere in sicurezza prima della diagnosi.");
  } else if (hasDangerEvidence) {
    level = "danger";
    reasons.push("Anomalia elettrica rilevata.");
  } else if (hasAttentionEvidence) {
    level = "attention";
    reasons.push("Richiesta tecnica con verifiche di sicurezza o dati incoerenti da chiarire.");
  } else {
    reasons.push("Nessun blocco safety critico emerso dalle evidenze normalizzate.");
  }

  if (contradictions.length > 0) {
    reasons.push("Sono presenti " + contradictions.length + " contraddizioni da risolvere prima di confermare la causa.");
  }

  return {
    level: level,
    reasons: reasons
  };
}

function buildDiagnosticChecks(facts, contradictions, safetyDecision, evidenceSet) {
  var checks = [];
  var patternFacts;
  var componentFacts;
  var ruleFacts;
  var anomalyKeys = {};
  var missingLabels = {};

  (evidenceSet && evidenceSet.anomalies || []).forEach(function (anomaly) {
    anomalyKeys[anomaly.key] = anomaly;
  });
  (evidenceSet && evidenceSet.missingCriticalFacts || []).forEach(function (label) {
    missingLabels[normalize(String(label || ""))] = label;
  });

  if (safetyDecision.level === "stop" || safetyDecision.level === "danger") {
    pushDiagnosticCheck(checks, "CHK-SAFE-01", "Disalimentare e verificare assenza tensione con multimetro prima di qualsiasi prova.", 100, ["burn_signs", "danger_keyword", "voltage_anomaly"]);
  }
  if ((hasEvidenceFact(evidenceSet, "mentions_rcd") || getEvidenceSignalStrength(evidenceSet, "earth_leakage_signal") > 0.5) &&
      (!hasEvidenceFact(evidenceSet, "isolamento") || missingLabels["manca misura isolamento verso terra"])) {
    pushDiagnosticCheck(checks, "CHK-RCD-01", "Misurare isolamento con megohmetro 500V DC tra ogni conduttore attivo e PE (>1MOhm atteso).", 95, ["mentions_rcd", "measurement_gap_signal"]);
  }
  if ((hasEvidenceFact(evidenceSet, "mentions_voltage") || missingLabels["manca misura tensione fase-neutro"]) &&
      !hasEvidenceFact(evidenceSet, "tensione")) {
    pushDiagnosticCheck(checks, "CHK-VOLT-01", "Misurare tensione L-N e L-PE ai morsetti del componente sotto carico.", 90, ["mentions_voltage", "measurement_gap_signal"]);
  }
  if (hasFact(facts, "matched_keyword", function (fact) {
    var keyword = normalize(String(fact.value || ""));
    return keyword.indexOf("motore") >= 0;
  }) && !hasFact(facts, "corrente") && !hasFact(facts, "corrente_ma")) {
    pushDiagnosticCheck(checks, "CHK-MOTOR-01", "Misurare corrente assorbita con pinza amperometrica durante il funzionamento.", 80, ["matched_keyword"]);
  }
  if (anomalyKeys.isolation_below_threshold) {
    pushDiagnosticCheck(checks, "CHK-EVD-ISO-LOW", "Confermare il guasto di isolamento ripetendo la misura circuito per circuito con carichi scollegati.", 94, ["isolation_below_threshold"]);
  }
  if (anomalyKeys.voltage_out_of_nominal_range) {
    pushDiagnosticCheck(checks, "CHK-EVD-VOLT-OUT", "Ripetere le misure L-N e L-PE nello stesso punto e verificare la stabilita della tensione a monte.", 92, ["voltage_out_of_nominal_range"]);
  }
  if (anomalyKeys.temperature_above_safe_limit) {
    pushDiagnosticCheck(checks, "CHK-EVD-TEMP", "Ispezionare subito il punto surriscaldato e verificare serraggi, sezione cavo e carico prima di riattivare.", 96, ["temperature_above_safe_limit"]);
  }
  if (getEvidenceSignalStrength(evidenceSet, "measurement_gap_signal") > 0.5) {
    pushDiagnosticCheck(checks, "CHK-EVD-GAP", "Raccogliere prima la misura critica mancante piu discriminante per evitare conferme premature.", 74, ["measurement_gap_signal"]);
  }

  contradictions.forEach(function (contradiction) {
    if (contradiction.id === "CTR-VOLT-01") {
      pushDiagnosticCheck(checks, "CHK-CTR-VOLT", "Ripetere le misure L-N e L-PE nello stesso punto e nello stesso istante per eliminare dati discordanti.", 88, contradiction.basedOnFacts);
    } else if (contradiction.id === "CTR-VOLT-02") {
      pushDiagnosticCheck(checks, "CHK-CTR-VOLT-ABS", "Verificare riferimento della misura e ripetere L-N, L-PE e continuita del neutro nello stesso punto dichiarato senza tensione.", 89, contradiction.basedOnFacts);
    } else if (contradiction.id === "CTR-CURR-01") {
      pushDiagnosticCheck(checks, "CHK-CTR-CURR", "Verificare stato reale del comando, eventuali alimentazioni residue e assorbimento a monte del dispositivo dichiarato spento.", 86, contradiction.basedOnFacts);
    } else if (contradiction.id === "CTR-ISO-01") {
      pushDiagnosticCheck(checks, "CHK-CTR-ISO", "Ripetere la misura di isolamento circuito per circuito con carichi scollegati.", 88, contradiction.basedOnFacts);
    } else if (contradiction.id === "CTR-LOAD-01") {
      pushDiagnosticCheck(checks, "CHK-CTR-LOAD", "Riprodurre il difetto separando la prova a vuoto da quella sotto carico.", 82, contradiction.basedOnFacts);
    } else {
      pushDiagnosticCheck(checks, contradiction.id, "Chiarire il dato contraddittorio: " + contradiction.reason, 70, contradiction.basedOnFacts);
    }
  });

  componentFacts = getFactsByType(facts, "matched_component").sort(function (a, b) {
    var scoreA = a.relatedTo && a.relatedTo.score ? a.relatedTo.score : 0;
    var scoreB = b.relatedTo && b.relatedTo.score ? b.relatedTo.score : 0;
    return scoreB - scoreA;
  });
  componentFacts.slice(0, 2).forEach(function (fact) {
    var checksFromComponent = fact.relatedTo && fact.relatedTo.component && Array.isArray(fact.relatedTo.component.field_checks)
      ? fact.relatedTo.component.field_checks
      : [];
    checksFromComponent.slice(0, 2).forEach(function (reason, idx) {
      pushDiagnosticCheck(checks, "CHK-CMP-" + fact.value + "-" + idx, reason, 60, ["matched_component"]);
    });
  });

  patternFacts = getFactsByType(facts, "matched_pattern").sort(function (a, b) {
    var scoreA = a.relatedTo && a.relatedTo.score ? a.relatedTo.score : 0;
    var scoreB = b.relatedTo && b.relatedTo.score ? b.relatedTo.score : 0;
    return scoreB - scoreA;
  });
  patternFacts.slice(0, 2).forEach(function (fact) {
    var patternChecks = fact.relatedTo && fact.relatedTo.pattern && Array.isArray(fact.relatedTo.pattern.checks)
      ? fact.relatedTo.pattern.checks
      : [];
    patternChecks.slice(0, 2).forEach(function (reason, idx) {
      pushDiagnosticCheck(checks, "CHK-PAT-" + fact.value + "-" + idx, reason, 55, ["matched_pattern"]);
    });
  });

  ruleFacts = getFactsByType(facts, "matched_rule").sort(function (a, b) {
    var scoreA = a.relatedTo && a.relatedTo.score ? a.relatedTo.score : 0;
    var scoreB = b.relatedTo && b.relatedTo.score ? b.relatedTo.score : 0;
    return scoreB - scoreA;
  });
  ruleFacts.slice(0, 2).forEach(function (fact) {
    var steps = fact.relatedTo && fact.relatedTo.rule && Array.isArray(fact.relatedTo.rule.verification_steps)
      ? fact.relatedTo.rule.verification_steps
      : [];
    steps.slice(0, 2).forEach(function (reason, idx) {
      pushDiagnosticCheck(checks, "CHK-RULE-" + fact.value + "-" + idx, reason, 50, ["matched_rule"]);
    });
  });

  if (!checks.length && hasFact(facts, "technical_request")) {
    pushDiagnosticCheck(checks, "CHK-GEN-01", "Raccogliere marca/modello, foto nitida e almeno una misura utile prima di confermare la diagnosi.", 40, ["technical_request"]);
  }

  checks.sort(function (a, b) { return b.priority - a.priority; });
  return checks;
}

function createEmptyCausalInferenceResult() {
  return {
    hypotheses: [],
    topHypothesisId: null,
    competingHypothesisIds: [],
    rejectedHypotheses: [],
    inferenceMeta: {
      totalCandidates: 0,
      rankedCandidates: 0,
      confirmedCount: 0,
      probableCount: 0,
      nonVerifiableCount: 0,
      contradictionsCount: 0
    }
  };
}

function resolveHypothesisFamily(text, fallback) {
  var normalized = normalize(String(text || ""));

  if (/isolament|dispersion|differenzial/.test(normalized)) return "dispersione";
  if (/surriscald|temperatur|bruciat|fumo|termic/.test(normalized)) return "surriscaldamento";
  if (/sovraccaric|corrente alta|magnetoterm|protezione/.test(normalized)) return "sovraccarico";
  if (/contatt|connession|morsett|neutro|continuita|interrott/.test(normalized)) return "contatto_interruzione";
  if (/tension|rete|sovratension|sottotension|assenza tensione/.test(normalized)) return "anomalia_rete";
  if (/umidit|infiltr|condensa|estern/.test(normalized)) return "environment";
  return fallback || "unknown";
}

function resolveHypothesisCategory(family, label) {
  var normalized = normalize(String(label || ""));

  if (family === "dispersione") return "insulation";
  if (family === "anomalia_rete") return "supply";
  if (family === "sovraccarico") return "protection";
  if (family === "contatto_interruzione") return "connection";
  if (family === "environment") return "environment";
  if (/morsett|connession|neutro|continuita/.test(normalized)) return "connection";
  if (/contattor|rele|bobina|motore|cavo/.test(normalized)) return "component";
  if (/comando|controll|start|pulsante/.test(normalized)) return "control";
  return family === "surriscaldamento" ? "component" : "unknown";
}

function createHypothesisCandidate(config) {
  var family = resolveHypothesisFamily(config && (config.family || config.causeLabel || config.symptom), config && config.family);
  var causeLabel = config && config.causeLabel ? config.causeLabel : "Ipotesi non classificata";
  var causeKey = config && config.causeKey ? config.causeKey : normalize(causeLabel).replace(/\s+/g, "_");
  var category = resolveHypothesisCategory(family, causeLabel);
  var id = config && config.id ? config.id : ("HYP-" + causeKey.toUpperCase().replace(/[^A-Z0-9_]/g, "_"));
  var sourceType = config && config.sourceType ? config.sourceType : "deduction";

  return {
    id: id,
    causeKey: causeKey,
    causeLabel: causeLabel,
    category: category,
    level: "non_verifiable",
    score: 0,
    confidence: 0,
    rank: 0,
    sourceType: sourceType,
    supportingFacts: [],
    supportingSignals: [],
    supportingConstraints: [],
    contradictoryFacts: [],
    missingCriticalFacts: [],
    recommendedChecks: [],
    blockedBySafety: false,
    learningBoost: 0,
    family: family,
    patternId: config && config.patternId ? config.patternId : null,
    symptom: config && config.symptom ? config.symptom : family.replace(/_/g, " "),
    bestCheck: config && config.bestCheck ? config.bestCheck : "",
    verificationNeeded: config && config.verificationNeeded ? config.verificationNeeded : "",
    source: config && config.source ? config.source : sourceType,
    excluded: false,
    _rawScore: Number(config && config.rawScore || 0),
    _sourceHints: Array.isArray(config && config.sourceHints) ? config.sourceHints.slice(0, 6) : [],
    causa: causeLabel,
    livello: "non_verifiable",
    deductionScore: 0,
    rankScore: 0,
    boostedByRuleIds: [],
    supportingMeasurements: [],
    contradictingMeasurements: [],
    supports: [],
    contradictions: [],
    missingEvidence: ""
  };
}

function addSupportingFact(hypothesis, value, weight) {
  if (!hypothesis || !value || hypothesis.supportingFacts.indexOf(value) >= 0) return;
  hypothesis.supportingFacts.push(value);
  hypothesis._rawScore += Number(weight || 0.6);
}

function addSupportingSignal(hypothesis, value, strength) {
  if (!hypothesis || !value || hypothesis.supportingSignals.indexOf(value) >= 0) return;
  hypothesis.supportingSignals.push(value);
  hypothesis._rawScore += Math.max(0, Math.min(1, Number(strength || 0.4))) * 2.2;
}

function addSupportingConstraint(hypothesis, value, weight) {
  if (!hypothesis || !value || hypothesis.supportingConstraints.indexOf(value) >= 0) return;
  hypothesis.supportingConstraints.push(value);
  hypothesis._rawScore += Number(weight || 0.8);
}

function addContradictoryFactToHypothesis(hypothesis, value, weight) {
  if (!hypothesis || !value || hypothesis.contradictoryFacts.indexOf(value) >= 0) return;
  hypothesis.contradictoryFacts.push(value);
  hypothesis._rawScore -= Number(weight || 1);
}

function addMissingCriticalFactToHypothesis(hypothesis, value) {
  if (!hypothesis || !value || hypothesis.missingCriticalFacts.indexOf(value) >= 0) return;
  hypothesis.missingCriticalFacts.push(value);
}

function addRecommendedCheckToHypothesis(hypothesis, value) {
  if (!hypothesis || !value || hypothesis.recommendedChecks.indexOf(value) >= 0) return;
  hypothesis.recommendedChecks.push(value);
}

function normalizeHypothesisCandidate(hypothesis) {
  if (!hypothesis) return hypothesis;
  hypothesis.supportingFacts = dedupeNormalizedEntries(hypothesis.supportingFacts || []);
  hypothesis.supportingSignals = dedupeNormalizedEntries(hypothesis.supportingSignals || []);
  hypothesis.supportingConstraints = dedupeNormalizedEntries(hypothesis.supportingConstraints || []);
  hypothesis.contradictoryFacts = dedupeNormalizedEntries(hypothesis.contradictoryFacts || []);
  hypothesis.missingCriticalFacts = dedupeNormalizedEntries(hypothesis.missingCriticalFacts || []);
  hypothesis.recommendedChecks = dedupeNormalizedEntries(hypothesis.recommendedChecks || []);
  hypothesis.score = Math.max(0, Math.min(1, Number(hypothesis.score || 0)));
  hypothesis.confidence = Math.max(0, Math.min(1, Number(hypothesis.confidence || 0)));
  hypothesis.rankScore = Math.max(0, Math.min(100, Math.round(hypothesis.score * 100)));
  hypothesis.deductionScore = hypothesis.rankScore;
  hypothesis.livello = hypothesis.level;
  hypothesis.causa = hypothesis.causeLabel;
  hypothesis.supportingMeasurements = hypothesis.supportingFacts.concat(hypothesis.supportingConstraints).slice(0, 8);
  hypothesis.contradictingMeasurements = hypothesis.contradictoryFacts.slice(0, 8);
  hypothesis.supports = hypothesis.supportingFacts.concat(hypothesis.supportingSignals, hypothesis.supportingConstraints).slice(0, 8);
  hypothesis.contradictions = hypothesis.contradictoryFacts.slice(0, 8);
  hypothesis.missingEvidence = hypothesis.missingCriticalFacts[0] || hypothesis.missingEvidence || "";
  hypothesis._missingFacts = hypothesis.missingCriticalFacts.slice(0);
  hypothesis._strongContradictionCount = hypothesis.contradictoryFacts.length;
  return hypothesis;
}

function buildEvidenceFlags(evidenceSet) {
  return {
    isoLow: hasEvidenceFact(evidenceSet, "isolation_low"),
    isoHigh: hasEvidenceFact(evidenceSet, "isolation_high"),
    tempHigh: hasEvidenceFact(evidenceSet, "temperature_high") || getEvidenceSignalStrength(evidenceSet, "thermal_damage_signal") > 0.6,
    voltAnomaly: hasEvidenceFact(evidenceSet, "voltage_anomaly") || getEvidenceSignalStrength(evidenceSet, "supply_anomaly_signal") > 0.6,
    voltHigh: getEvidenceFactsByKey(evidenceSet, "voltage_anomaly").some(function (fact) {
      return typeof fact.value === "number" && fact.value > NOMINAL_VOLTAGE;
    }),
    voltStable: hasEvidenceFact(evidenceSet, "voltage_nominal") || getEvidenceSignalStrength(evidenceSet, "supply_ok_signal") > 0.5,
    highCurrent: hasEvidenceFact(evidenceSet, "high_current") || getEvidenceSignalStrength(evidenceSet, "overload_signal") > 0.5,
    rcdTrips: hasEvidenceFact(evidenceSet, "rcd_trip") || getEvidenceSignalStrength(evidenceSet, "earth_leakage_signal") > 0.5,
    mcbTrips: hasEvidenceFact(evidenceSet, "mcb_trip"),
    burnSigns: hasEvidenceFact(evidenceSet, "burn_signs"),
    darkened: hasEvidenceFact(evidenceSet, "darkened"),
    tripsNoLoad: hasEvidenceFact(evidenceSet, "trips_no_load"),
    underLoad: hasEvidenceFact(evidenceSet, "under_load"),
    applianceMentioned: hasEvidenceFact(evidenceSet, "appliance_mentioned"),
    oldInstall: hasEvidenceFact(evidenceSet, "old_install"),
    newInstall: hasEvidenceFact(evidenceSet, "new_install"),
    moisture: hasEvidenceFact(evidenceSet, "moisture"),
    outdoor: hasEvidenceFact(evidenceSet, "outdoor"),
    dry: hasEvidenceFact(evidenceSet, "dry"),
    terminalRef: hasEvidenceFact(evidenceSet, "terminal_reference"),
    heavyLoad: hasEvidenceFact(evidenceSet, "heavy_load"),
    lightLoad: hasEvidenceFact(evidenceSet, "light_load"),
    longRun: hasEvidenceFact(evidenceSet, "long_run"),
    neutralRef: hasEvidenceFact(evidenceSet, "neutral_reference"),
    zoneWide: hasEvidenceFact(evidenceSet, "zone_wide"),
    onlyMe: hasEvidenceFact(evidenceSet, "only_me"),
    flickering: hasEvidenceFact(evidenceSet, "flickering")
  };
}

function scoreHypothesisCandidate(hypothesis, evidenceSet) {
  var rawScore = Number(hypothesis && hypothesis._rawScore || 0);
  var measurementsFactor = Number(evidenceSet && evidenceSet.evidenceScoreMap && evidenceSet.evidenceScoreMap.measurements || 0);
  var completenessFactor = Number(evidenceSet && evidenceSet.evidenceScoreMap && evidenceSet.evidenceScoreMap.completeness || 0);
  var consistencyFactor = Number(evidenceSet && evidenceSet.evidenceScoreMap && evidenceSet.evidenceScoreMap.consistency || 0);
  var supportWeight = (hypothesis.supportingFacts.length * 0.8) +
    (hypothesis.supportingSignals.length * 0.75) +
    (hypothesis.supportingConstraints.length * 0.95);
  var contradictionPenalty = hypothesis.contradictoryFacts.length * 1.45;
  var missingPenalty = hypothesis.missingCriticalFacts.length * 0.35;
  var normalizedScore;
  var confidence;

  rawScore = rawScore + supportWeight + (measurementsFactor * 2.6) - contradictionPenalty - missingPenalty;
  if (hypothesis.sourceType === "pattern" &&
      hypothesis.supportingFacts.length === 0 &&
      hypothesis.supportingSignals.length === 0 &&
      hypothesis.supportingConstraints.length === 0) {
    rawScore -= 1.2;
  }
  rawScore = Math.max(0, rawScore);
  normalizedScore = Math.max(0, Math.min(1, rawScore / 16));
  confidence = normalizedScore * (0.55 + (consistencyFactor * 0.25) + (completenessFactor * 0.2));
  confidence -= Math.min(0.35, hypothesis.contradictoryFacts.length * 0.12);
  confidence = Math.max(0, Math.min(1, confidence));
  hypothesis.score = Math.round(normalizedScore * 10000) / 10000;
  hypothesis.confidence = Math.round(confidence * 10000) / 10000;
  return hypothesis;
}

function classifyHypothesisLevel(hypothesis) {
  var strongSupportCount = hypothesis.supportingFacts.length + hypothesis.supportingSignals.length + hypothesis.supportingConstraints.length;
  var hasConcreteSupport = hypothesis.supportingFacts.some(function (label) {
    return /misurat|isolamento|temperatura|tensione|corrente|megger|230v|229v|v$/i.test(String(label || ""));
  }) || hypothesis.supportingConstraints.length > 0;
  var contradictionsCount = hypothesis.contradictoryFacts.length;
  var blockingMissing = hypothesis.missingCriticalFacts.length > 2;

  if (hypothesis.score >= 0.82 &&
      hypothesis.confidence >= 0.72 &&
      contradictionsCount === 0 &&
      !blockingMissing &&
      strongSupportCount >= 3 &&
      hasConcreteSupport) {
    return "confirmed";
  }
  if (hypothesis.score >= 0.42 &&
      contradictionsCount <= 1 &&
      strongSupportCount >= 1) {
    return "probable";
  }
  return "non_verifiable";
}

function collectHypothesisChecks(hypothesis, evidenceSet) {
  if (!hypothesis) return hypothesis;

  if (hypothesis.bestCheck) addRecommendedCheckToHypothesis(hypothesis, hypothesis.bestCheck);
  if (hypothesis.verificationNeeded) addRecommendedCheckToHypothesis(hypothesis, hypothesis.verificationNeeded);

  if (hypothesis.category === "insulation" || hypothesis.family === "dispersione") {
    if (hasEvidenceFact(evidenceSet, "isolation_low") || !hasEvidenceFact(evidenceSet, "isolamento")) {
      addRecommendedCheckToHypothesis(hypothesis, "Misurare isolamento con megohmetro 500V DC tra ogni conduttore attivo e PE (>1MOhm atteso).");
    }
  }
  if (hypothesis.category === "supply" || hypothesis.family === "anomalia_rete") {
    addRecommendedCheckToHypothesis(hypothesis, "Misurare tensione L-N e L-PE nello stesso punto e nello stesso istante.");
    if (hasEvidenceFact(evidenceSet, "no_voltage_claim")) {
      addRecommendedCheckToHypothesis(hypothesis, "Verificare continuita del neutro e riferimento della misura sul punto dichiarato senza tensione.");
    }
  }
  if (hypothesis.category === "connection" || hypothesis.family === "contatto_interruzione") {
    addRecommendedCheckToHypothesis(hypothesis, "Verificare serraggio morsetti e continuita del neutro/ritorno sul circuito interessato.");
  }
  if (hypothesis.category === "protection" || hypothesis.family === "sovraccarico") {
    addRecommendedCheckToHypothesis(hypothesis, "Misurare corrente assorbita con pinza amperometrica e confrontarla con la protezione installata.");
  }
  if (hypothesis.category === "component" && getEvidenceSignalStrength(evidenceSet, "thermal_damage_signal") > 0.3) {
    addRecommendedCheckToHypothesis(hypothesis, "Ispezionare termicamente il componente e i morsetti associati prima della riattivazione.");
  }

  hypothesis.missingCriticalFacts.forEach(function (missingFact) {
    if (/isolamento/i.test(missingFact)) {
      addRecommendedCheckToHypothesis(hypothesis, "Misurare isolamento con megohmetro 500V DC tra ogni conduttore attivo e PE (>1MOhm atteso).");
    } else if (/tensione/i.test(missingFact)) {
      addRecommendedCheckToHypothesis(hypothesis, "Misurare tensione L-N e L-PE ai morsetti del componente sotto carico.");
    } else if (/neutro|continuita/i.test(missingFact)) {
      addRecommendedCheckToHypothesis(hypothesis, "Verificare continuita del neutro e serraggio dei morsetti interessati.");
    }
  });

  return hypothesis;
}

function mergeHypothesisCandidates(candidates) {
  var merged = {};
  var ordered = [];

  (Array.isArray(candidates) ? candidates : []).forEach(function (candidate) {
    var key = candidate && candidate.causeKey ? candidate.causeKey : null;
    var current;

    if (!key) return;
    if (!merged[key]) {
      merged[key] = candidate;
      ordered.push(candidate);
      return;
    }

    current = merged[key];
    current._rawScore += candidate._rawScore * 0.85;
    current.sourceType = current.sourceType === candidate.sourceType ? current.sourceType : "composed";
    candidate.supportingFacts.forEach(function (value) { addSupportingFact(current, value, 0); });
    candidate.supportingSignals.forEach(function (value) { addSupportingSignal(current, value, 0); });
    candidate.supportingConstraints.forEach(function (value) { addSupportingConstraint(current, value, 0); });
    candidate.contradictoryFacts.forEach(function (value) { addContradictoryFactToHypothesis(current, value, 0); });
    candidate.missingCriticalFacts.forEach(function (value) { addMissingCriticalFactToHypothesis(current, value); });
    candidate.recommendedChecks.forEach(function (value) { addRecommendedCheckToHypothesis(current, value); });
    current._sourceHints = dedupeNormalizedEntries((current._sourceHints || []).concat(candidate._sourceHints || []));
  });

  return ordered;
}

function dedupeHypotheses(hypotheses) {
  return mergeHypothesisCandidates(hypotheses).map(normalizeHypothesisCandidate);
}

function sortRankedHypotheses(hypotheses) {
  var levelRank = { confirmed: 3, probable: 2, non_verifiable: 1 };
  var ordered = (Array.isArray(hypotheses) ? hypotheses : []).slice(0);

  ordered.sort(function (left, right) {
    var leftRank = levelRank[left.level] || 0;
    var rightRank = levelRank[right.level] || 0;

    if (rightRank !== leftRank) return rightRank - leftRank;
    if (right.score !== left.score) return right.score - left.score;
    if (right.confidence !== left.confidence) return right.confidence - left.confidence;
    return String(left.causeLabel || "").localeCompare(String(right.causeLabel || ""));
  });

  ordered.forEach(function (hypothesis, index) {
    hypothesis.rank = index + 1;
    hypothesis.rankScore = Math.max(0, Math.min(100, Math.round(hypothesis.score * 100)));
    hypothesis.deductionScore = hypothesis.rankScore;
    hypothesis.livello = hypothesis.level;
  });

  return ordered;
}

function rejectWeakOrBrokenHypotheses(hypotheses) {
  var accepted = [];
  var rejected = [];

  (Array.isArray(hypotheses) ? hypotheses : []).forEach(function (hypothesis) {
    if (!hypothesis) return;
    if (hypothesis.score < 0.18) {
      rejected.push({ causeKey: hypothesis.causeKey, reason: "supporto insufficiente" });
      return;
    }
    if (hypothesis.sourceType === "pattern" &&
        hypothesis.supportingFacts.length === 0 &&
        hypothesis.supportingSignals.length === 0 &&
        hypothesis.supportingConstraints.length === 0) {
      rejected.push({ causeKey: hypothesis.causeKey, reason: "pattern non sostenuto da evidenze attuali" });
      return;
    }
    if (hypothesis.contradictoryFacts.length >= 2 && hypothesis.score < 0.45) {
      rejected.push({ causeKey: hypothesis.causeKey, reason: "contraddetta da fatti forti" });
      return;
    }
    if (hypothesis.category === "unknown" && hypothesis.score < 0.28) {
      rejected.push({ causeKey: hypothesis.causeKey, reason: "fuori dominio o troppo generica" });
      return;
    }
    accepted.push(hypothesis);
  });

  return {
    accepted: accepted,
    rejected: rejected
  };
}

function buildHypothesesFromPatterns(evidenceSet, normalizedInput, facts, contradictions) {
  var candidates = [];
  var contradictionFamilies = {};

  (Array.isArray(contradictions) ? contradictions : []).forEach(function (contradiction) {
    (contradiction.relatedFamilies || []).forEach(function (family) {
      contradictionFamilies[family] = true;
    });
  });

  getFactsByType(facts || [], "matched_pattern").sort(function (a, b) {
    var scoreA = a.relatedTo && a.relatedTo.score ? a.relatedTo.score : 0;
    var scoreB = b.relatedTo && b.relatedTo.score ? b.relatedTo.score : 0;
    return scoreB - scoreA;
  }).slice(0, 4).forEach(function (fact) {
    var pattern = fact.relatedTo && fact.relatedTo.pattern;
    var baseScore = fact.relatedTo && fact.relatedTo.score ? fact.relatedTo.score : 0;

    if (!pattern) return;

    buildIpotesiFromPattern(pattern).forEach(function (entry, index) {
      var family = resolveHypothesisFamily(entry.symptom || entry.causa, null);
      var candidate = createHypothesisCandidate({
        id: entry.patternId + "-" + index,
        causeKey: normalize(entry.causa).replace(/\s+/g, "_"),
        causeLabel: entry.causa,
        family: family,
        patternId: entry.patternId,
        symptom: entry.symptom,
        sourceType: "pattern",
        source: "pattern_pipeline",
        bestCheck: pattern.checks && pattern.checks[0],
        verificationNeeded: pattern.checks && pattern.checks[0],
        rawScore: Math.min(4, baseScore / 2),
        sourceHints: [pattern.id]
      });

      addSupportingSignal(candidate, "pattern:" + pattern.id, Math.min(0.45, baseScore / 20));
      if (family === "dispersione" && hasEvidenceFact(evidenceSet, "isolation_low")) {
        addSupportingConstraint(candidate, "isolamento sotto soglia", 1.4);
        addSupportingFact(candidate, "isolamento basso misurato", 1.1);
      }
      if (family === "dispersione" && getEvidenceSignalStrength(evidenceSet, "earth_leakage_signal") > 0.4) {
        addSupportingSignal(candidate, "earth_leakage_signal", getEvidenceSignalStrength(evidenceSet, "earth_leakage_signal"));
      }
      if (family === "surriscaldamento" && hasEvidenceFact(evidenceSet, "temperature_high")) {
        addSupportingConstraint(candidate, "temperatura alta", 1.3);
      }
      if (family === "anomalia_rete" && hasEvidenceFact(evidenceSet, "voltage_anomaly")) {
        addSupportingConstraint(candidate, "tensione fuori range", 1.4);
      }
      if (family === "dispersione" && hasEvidenceFact(evidenceSet, "isolation_high")) {
        addContradictoryFactToHypothesis(candidate, "isolamento alto incompatibile con dispersione", 1.5);
      }
      if (family === "anomalia_rete" && hasEvidenceFact(evidenceSet, "voltage_nominal") && !hasEvidenceFact(evidenceSet, "voltage_anomaly")) {
        addContradictoryFactToHypothesis(candidate, "tensione nel range nominale", 1.2);
      }
      if (contradictionFamilies[family]) {
        addContradictoryFactToHypothesis(candidate, "contraddizione aperta sulla famiglia causale", 1.1);
      }
      candidates.push(normalizeHypothesisCandidate(candidate));
    });
  });

  return candidates;
}

function buildHypothesesFromRules(evidenceSet, normalizedInput, contradictions) {
  var candidates = [];
  var flags = buildEvidenceFlags(evidenceSet);
  var contradictionFamilies = {};

  (Array.isArray(contradictions) ? contradictions : []).forEach(function (contradiction) {
    (contradiction.relatedFamilies || []).forEach(function (family) {
      contradictionFamilies[family] = true;
    });
  });

  CAUSE_HYPOTHESES.forEach(function (definition) {
    var candidate = createHypothesisCandidate({
      id: definition.id,
      causeKey: normalize(definition.causa).replace(/\s+/g, "_"),
      causeLabel: definition.causa,
      family: definition.family,
      symptom: definition.family.replace(/_/g, " "),
      sourceType: "rule",
      source: "fact_pipeline",
      bestCheck: definition.bestCheck,
      verificationNeeded: definition.bestCheck,
      rawScore: definition.baseScore
    });

    definition.pro.forEach(function (rule) {
      if (!rule.test(flags)) return;
      addSupportingFact(candidate, rule.label, rule.weight / 4);
    });
    definition.contra.forEach(function (rule) {
      if (!rule.test(flags)) return;
      addContradictoryFactToHypothesis(candidate, rule.label, rule.weight / 4);
    });
    if (contradictionFamilies[definition.family]) {
      addContradictoryFactToHypothesis(candidate, "contraddizione interna sui fatti", 1.2);
    }
    if (definition.missingEvidence) {
      addMissingCriticalFactToHypothesis(candidate, definition.missingEvidence);
    }
    addRecommendedCheckToHypothesis(candidate, definition.bestCheck);
    candidates.push(normalizeHypothesisCandidate(candidate));
  });

  return candidates;
}

function buildHypothesesFromDerivedSignals(evidenceSet) {
  var candidates = [];

  if (getEvidenceSignalStrength(evidenceSet, "earth_leakage_signal") > 0.45 ||
      getEvidenceSignalStrength(evidenceSet, "insulation_fault_signal") > 0.45) {
    var insulationCandidate = createHypothesisCandidate({
      id: "SIG-INS-01",
      causeKey: "guasto_isolamento_dispersione",
      causeLabel: "Guasto isolamento o dispersione verso terra",
      family: "dispersione",
      symptom: "dispersione",
      sourceType: "composed",
      source: "derived_signal",
      bestCheck: "Misurare isolamento circuito per circuito con tutti i carichi scollegati",
      verificationNeeded: "Misurare isolamento circuito per circuito con tutti i carichi scollegati",
      rawScore: 4
    });
    addSupportingSignal(insulationCandidate, "insulation_fault_signal", getEvidenceSignalStrength(evidenceSet, "insulation_fault_signal"));
    addSupportingSignal(insulationCandidate, "earth_leakage_signal", getEvidenceSignalStrength(evidenceSet, "earth_leakage_signal"));
    if (hasEvidenceFact(evidenceSet, "isolation_low")) {
      addSupportingConstraint(insulationCandidate, "isolamento sotto soglia", 1.4);
    }
    candidates.push(normalizeHypothesisCandidate(insulationCandidate));
  }

  if (getEvidenceSignalStrength(evidenceSet, "thermal_damage_signal") > 0.45) {
    var thermalCandidate = createHypothesisCandidate({
      id: "SIG-THERM-01",
      causeKey: "surriscaldamento_o_contatto",
      causeLabel: "Surriscaldamento o resistenza di contatto elevata",
      family: "surriscaldamento",
      symptom: "surriscaldamento",
      sourceType: "composed",
      source: "derived_signal",
      bestCheck: "Ispezione termica con termometro IR sui morsetti sotto carico",
      verificationNeeded: "Ispezione termica con termometro IR sui morsetti sotto carico",
      rawScore: 4
    });
    addSupportingSignal(thermalCandidate, "thermal_damage_signal", getEvidenceSignalStrength(evidenceSet, "thermal_damage_signal"));
    if (hasEvidenceFact(evidenceSet, "temperature_high")) {
      addSupportingConstraint(thermalCandidate, "temperatura alta", 1.4);
    }
    candidates.push(normalizeHypothesisCandidate(thermalCandidate));
  }

  if (getEvidenceSignalStrength(evidenceSet, "supply_anomaly_signal") > 0.45 || hasEvidenceFact(evidenceSet, "no_voltage_claim")) {
    var supplyCandidate = createHypothesisCandidate({
      id: "SIG-SUP-01",
      causeKey: "anomalia_alimentazione_o_neutro",
      causeLabel: "Anomalia alimentazione o problema di neutro/riferimento",
      family: "anomalia_rete",
      symptom: "anomalia rete",
      sourceType: "composed",
      source: "derived_signal",
      bestCheck: "Misurare tensione L-N e L-PE nello stesso punto e verificare continuita del neutro",
      verificationNeeded: "Misurare tensione L-N e L-PE nello stesso punto e verificare continuita del neutro",
      rawScore: 3.6
    });
    addSupportingSignal(supplyCandidate, "supply_anomaly_signal", getEvidenceSignalStrength(evidenceSet, "supply_anomaly_signal"));
    if (hasEvidenceFact(evidenceSet, "no_voltage_claim")) {
      addSupportingFact(supplyCandidate, "assenza tensione dichiarata", 0.7);
    }
    if (hasEvidenceFact(evidenceSet, "voltage_nominal") && !hasEvidenceFact(evidenceSet, "voltage_anomaly")) {
      addContradictoryFactToHypothesis(supplyCandidate, "tensione nominale presente", 1.2);
    }
    candidates.push(normalizeHypothesisCandidate(supplyCandidate));
  }

  if (getEvidenceSignalStrength(evidenceSet, "overload_signal") > 0.45) {
    var overloadCandidate = createHypothesisCandidate({
      id: "SIG-OVL-01",
      causeKey: "sovraccarico_elettrico",
      causeLabel: "Sovraccarico elettrico sul circuito o sulla protezione",
      family: "sovraccarico",
      symptom: "sovraccarico",
      sourceType: "composed",
      source: "derived_signal",
      bestCheck: "Misurare corrente assorbita con pinza amperometrica e confrontarla con la protezione installata",
      verificationNeeded: "Misurare corrente assorbita con pinza amperometrica e confrontarla con la protezione installata",
      rawScore: 3.6
    });
    addSupportingSignal(overloadCandidate, "overload_signal", getEvidenceSignalStrength(evidenceSet, "overload_signal"));
    if (hasEvidenceFact(evidenceSet, "high_current")) {
      addSupportingConstraint(overloadCandidate, "corrente elevata", 1.3);
    }
    candidates.push(normalizeHypothesisCandidate(overloadCandidate));
  }

  return candidates;
}

function buildCausalInferenceResult(params) {
  var safeParams = params || {};
  var normalizedInput = safeParams.normalizedInput || createEmptyNormalizedInput({});
  var evidenceSet = safeParams.evidenceSet || createEmptyEvidenceSet();
  var facts = Array.isArray(safeParams.facts) ? safeParams.facts : [];
  var contradictions = Array.isArray(safeParams.contradictions) ? safeParams.contradictions : [];
  var result = createEmptyCausalInferenceResult();
  var candidates = [];
  var filtered;
  var competing;

  candidates = candidates
    .concat(buildHypothesesFromRules(evidenceSet, normalizedInput, contradictions))
    .concat(buildHypothesesFromPatterns(evidenceSet, normalizedInput, facts, contradictions))
    .concat(buildHypothesesFromDerivedSignals(evidenceSet));

  result.inferenceMeta.totalCandidates = candidates.length;
  candidates = dedupeHypotheses(candidates).map(function (candidate) {
    scoreHypothesisCandidate(candidate, evidenceSet);
    collectHypothesisChecks(candidate, evidenceSet);
    candidate.level = classifyHypothesisLevel(candidate);
    return normalizeHypothesisCandidate(candidate);
  });

  filtered = rejectWeakOrBrokenHypotheses(candidates);
  result.rejectedHypotheses = filtered.rejected;
  result.hypotheses = sortRankedHypotheses(filtered.accepted).slice(0, 8);
  result.inferenceMeta.rankedCandidates = result.hypotheses.length;
  result.inferenceMeta.confirmedCount = result.hypotheses.filter(function (hypothesis) { return hypothesis.level === "confirmed"; }).length;
  result.inferenceMeta.probableCount = result.hypotheses.filter(function (hypothesis) { return hypothesis.level === "probable"; }).length;
  result.inferenceMeta.nonVerifiableCount = result.hypotheses.filter(function (hypothesis) { return hypothesis.level === "non_verifiable"; }).length;
  result.inferenceMeta.contradictionsCount = result.hypotheses.reduce(function (sum, hypothesis) {
    return sum + hypothesis.contradictoryFacts.length;
  }, 0);
  result.topHypothesisId = result.hypotheses.length ? result.hypotheses[0].id : null;
  competing = result.hypotheses.slice(1).filter(function (hypothesis) {
    return result.hypotheses[0] && (result.hypotheses[0].score - hypothesis.score) <= 0.12;
  }).map(function (hypothesis) {
    return hypothesis.id;
  });
  result.competingHypothesisIds = competing.slice(0, 3);
  if (!normalizedInput.isTechnical) {
    result.hypotheses = result.hypotheses.filter(function (hypothesis) {
      return hypothesis.score >= 0.35;
    }).map(normalizeHypothesisCandidate);
    result.topHypothesisId = result.hypotheses.length ? result.hypotheses[0].id : null;
    result.competingHypothesisIds = [];
    result.rejectedHypotheses.push({ causeKey: "non_technical_context", reason: "contesto non tecnico o troppo povero" });
  }

  return result;
}

function buildChecksFromMissingEvidence(hypotheses, safetyDecision) {
  var checks = [];
  var basePriority = safetyDecision.level === "safe" ? 78 : 58;

  hypotheses.slice(0, 3).forEach(function (hypothesis, index) {
    var missingFacts = Array.isArray(hypothesis.missingCriticalFacts) ? hypothesis.missingCriticalFacts :
      (Array.isArray(hypothesis._missingFacts) ? hypothesis._missingFacts : []);
    var recommendedChecks = Array.isArray(hypothesis.recommendedChecks) ? hypothesis.recommendedChecks : [];
    var reason;

    if (!missingFacts.length && !recommendedChecks.length && !hypothesis.verificationNeeded) return;

    reason = recommendedChecks[0] || hypothesis.verificationNeeded || hypothesis.bestCheck;
    if (missingFacts[0] && missingFacts[0] !== reason) {
      reason += " (" + missingFacts[0] + ").";
    }

    pushDiagnosticCheck(
      checks,
      "CHK-EVD-" + index,
      reason,
      basePriority - (index * 4),
      [hypothesis.family || hypothesis.patternId || hypothesis.causa]
    );
  });

  return checks;
}

function buildCaseState(facts, contradictions, hypotheses, safetyDecision, evidenceSet, causalInferenceResult) {
  var observedDomains = [];
  var unresolvedGaps = [];
  var strongestHypothesis = null;
  var dominantRisk = safetyDecision.level !== "safe" ? safetyDecision.level : "general";

  function pushUnique(list, value) {
    if (!value || list.indexOf(value) >= 0) return;
    list.push(value);
  }

  function pushDomain(condition, domain) {
    if (condition) pushUnique(observedDomains, domain);
  }

  pushDomain(
    hasEvidenceFact(evidenceSet, "tensione") ||
    hasEvidenceFact(evidenceSet, "voltage_anomaly") ||
    hasEvidenceFact(evidenceSet, "voltage_nominal") ||
    hasEvidenceFact(evidenceSet, "no_voltage_claim") ||
    hasEvidenceFact(evidenceSet, "mentions_voltage"),
    "tensione"
  );
  pushDomain(
    hasEvidenceFact(evidenceSet, "isolamento") ||
    hasEvidenceFact(evidenceSet, "isolation_low") ||
    hasEvidenceFact(evidenceSet, "isolation_high") ||
    getEvidenceSignalStrength(evidenceSet, "insulation_fault_signal") > 0.4,
    "isolamento"
  );
  pushDomain(
    hasEvidenceFact(evidenceSet, "temperatura") ||
    hasEvidenceFact(evidenceSet, "temperature_high") ||
    getEvidenceSignalStrength(evidenceSet, "thermal_damage_signal") > 0.4,
    "temperatura"
  );
  pushDomain(
    hasEvidenceFact(evidenceSet, "rcd_trip") ||
    hasEvidenceFact(evidenceSet, "mentions_rcd") ||
    getEvidenceSignalStrength(evidenceSet, "earth_leakage_signal") > 0.4,
    "differenziale"
  );
  pushDomain(
    hasEvidenceFact(evidenceSet, "terminal_reference") ||
    hasEvidenceFact(evidenceSet, "neutral_reference"),
    "continuita"
  );
  pushDomain(
    hasEvidenceFact(evidenceSet, "burn_signs") ||
    hasEvidenceFact(evidenceSet, "danger_keyword") ||
    hasEvidenceFact(evidenceSet, "darkened") ||
    getEvidenceSignalStrength(evidenceSet, "thermal_damage_signal") > 0.6,
    "bruciato_fumo_odore"
  );

  hypotheses.forEach(function (hypothesis) {
    var missingFacts = Array.isArray(hypothesis._missingFacts) ? hypothesis._missingFacts : [];

    if (!strongestHypothesis) strongestHypothesis = hypothesis;
    if (causalInferenceResult &&
        causalInferenceResult.topHypothesisId &&
        hypothesis.id === causalInferenceResult.topHypothesisId) {
      strongestHypothesis = hypothesis;
    } else if (strongestHypothesis &&
        strongestHypothesis.livello === "non_verifiable" &&
        hypothesis.livello !== "non_verifiable") {
      strongestHypothesis = hypothesis;
    }

    missingFacts.forEach(function (missingFact) {
      pushUnique(unresolvedGaps, missingFact);
    });
  });

  (evidenceSet && evidenceSet.missingCriticalFacts || []).forEach(function (missingFact) {
    pushUnique(unresolvedGaps, missingFact);
  });
  (evidenceSet && evidenceSet.contradictoryFacts || []).forEach(function (reason) {
    pushUnique(unresolvedGaps, reason);
  });

  if (contradictions.length) {
    contradictions.forEach(function (contradiction) {
      pushUnique(unresolvedGaps, contradiction.reason);
    });
  }

  if (hasEvidenceFact(evidenceSet, "burn_signs") ||
      hasEvidenceFact(evidenceSet, "danger_keyword") ||
      hasEvidenceFact(evidenceSet, "temperature_high")) {
    dominantRisk = "bruciato_fumo_odore";
  } else if (hasEvidenceFact(evidenceSet, "isolation_low") || getEvidenceSignalStrength(evidenceSet, "earth_leakage_signal") > 0.5) {
    dominantRisk = "isolamento";
  } else if (hasEvidenceFact(evidenceSet, "rcd_trip") || hasEvidenceFact(evidenceSet, "mentions_rcd")) {
    dominantRisk = "differenziale";
  } else if (hasEvidenceFact(evidenceSet, "voltage_anomaly") || hasEvidenceFact(evidenceSet, "no_voltage_claim")) {
    dominantRisk = "tensione";
  } else if (hasEvidenceFact(evidenceSet, "terminal_reference") || hasEvidenceFact(evidenceSet, "neutral_reference")) {
    dominantRisk = "continuita";
  } else if (observedDomains[0]) {
    dominantRisk = observedDomains[0];
  }

  return {
    observedDomains: observedDomains,
    dominantRisk: dominantRisk,
    topHypothesisId: causalInferenceResult && causalInferenceResult.topHypothesisId ? causalInferenceResult.topHypothesisId : null,
    competingHypothesisIds: causalInferenceResult && Array.isArray(causalInferenceResult.competingHypothesisIds)
      ? causalInferenceResult.competingHypothesisIds.slice(0)
      : [],
    strongestHypothesis: strongestHypothesis ? {
      causa: strongestHypothesis.causa,
      family: strongestHypothesis.family || null,
      livello: strongestHypothesis.livello,
      deductionScore: strongestHypothesis.deductionScore
    } : null,
    unresolvedGaps: unresolvedGaps.slice(0, 6),
    contradictionIds: contradictions.map(function (contradiction) { return contradiction.id; }),
    contradictions: contradictions.map(function (contradiction) { return contradiction.reason; })
  };
}

function groupHypothesesByCauseFamily(hypotheses) {
  var groups = {};
  var orderedGroups = [];

  function resolveCauseFamily(hypothesis) {
    var text = normalize([
      hypothesis.family || "",
      hypothesis.causa || "",
      hypothesis.symptom || ""
    ].join(" "));

    if (/isolament|dispersion|differenzial|umidit|infiltr|guasto isolamento/.test(text)) return "isolamento";
    if (/sovraccaric|corrente superiore|alta corrente/.test(text)) return "sovraccarico";
    if (/contatt|connession|morsett|interrott|allentat|continuita|continuita|neutro/.test(text)) return "contatto_interruzione";
    if (/temperatur|surriscald|bruciat|fumo|termic|sezione cavo insufficiente/.test(text)) return "sovratemperatura";
    if (/tension|rete|sovratension|sottotension|assenza tensione/.test(text)) return "assenza_tensione";
    return hypothesis.family || "generic";
  }

  hypotheses.forEach(function (hypothesis) {
    var causeFamily = resolveCauseFamily(hypothesis);
    var group;

    hypothesis._causeFamily = causeFamily;
    group = groups[causeFamily];
    if (!group) {
      group = {
        id: causeFamily,
        hypotheses: [],
        maxScore: 0,
        totalScore: 0,
        confirmedCount: 0,
        probableCount: 0,
        supportCount: 0
      };
      groups[causeFamily] = group;
      orderedGroups.push(group);
    }

    group.hypotheses.push(hypothesis);
    group.maxScore = Math.max(group.maxScore, hypothesis.deductionScore || 0);
    group.totalScore += hypothesis.deductionScore || 0;
    group.supportCount += Array.isArray(hypothesis.supportingMeasurements) ? hypothesis.supportingMeasurements.length : 0;
    if (hypothesis.livello === "confirmed") group.confirmedCount += 1;
    if (hypothesis.livello === "probable") group.probableCount += 1;
  });

  orderedGroups.forEach(function (group) {
    group.hypotheses.sort(function (a, b) { return b.deductionScore - a.deductionScore; });
    group.topHypothesis = group.hypotheses[0] || null;
  });

  return orderedGroups;
}

function selectDominantCauseFamily(groups, caseState) {
  var orderedGroups = groups.slice(0);

  function selectorBonus(group) {
    if (!caseState) return 0;
    if (caseState.dominantRisk === "isolamento" && group.id === "isolamento") return 2;
    if (caseState.dominantRisk === "differenziale" && group.id === "isolamento") return 2;
    if (caseState.dominantRisk === "tensione" && group.id === "assenza_tensione") return 2;
    if (caseState.dominantRisk === "continuita" && group.id === "contatto_interruzione") return 2;
    if (caseState.dominantRisk === "bruciato_fumo_odore" &&
        (group.id === "sovratemperatura" || group.id === "contatto_interruzione")) return 2;
    return 0;
  }

  if (!orderedGroups.length) return null;

  orderedGroups.sort(function (a, b) {
    var scoreA = (a.maxScore * 2) + (a.confirmedCount * 4) + (a.probableCount * 2) + Math.min(a.supportCount, 4) + selectorBonus(a);
    var scoreB = (b.maxScore * 2) + (b.confirmedCount * 4) + (b.probableCount * 2) + Math.min(b.supportCount, 4) + selectorBonus(b);
    return scoreB - scoreA;
  });

  if (orderedGroups.length === 1) return orderedGroups[0].id;

  var topGroup = orderedGroups[0];
  var secondGroup = orderedGroups[1];
  var topSelectorScore = (topGroup.maxScore * 2) + (topGroup.confirmedCount * 4) + (topGroup.probableCount * 2) + Math.min(topGroup.supportCount, 4) + selectorBonus(topGroup);
  var secondSelectorScore = (secondGroup.maxScore * 2) + (secondGroup.confirmedCount * 4) + (secondGroup.probableCount * 2) + Math.min(secondGroup.supportCount, 4) + selectorBonus(secondGroup);
  var clearLead = topSelectorScore - secondSelectorScore >= 5;
  var clearEvidenceLead = topGroup.confirmedCount > secondGroup.confirmedCount && topGroup.maxScore >= secondGroup.maxScore + 1;
  var clearScoreLead = topGroup.maxScore >= secondGroup.maxScore + 4;

  if (clearLead || clearEvidenceLead || clearScoreLead) return topGroup.id;
  return null;
}

function downgradeSiblingHypotheses(hypotheses, dominantFamily) {
  var leader = null;

  if (!dominantFamily) return hypotheses;

  hypotheses.forEach(function (hypothesis) {
    if (hypothesis._causeFamily !== dominantFamily) return;
    if (!leader || hypothesis.deductionScore > leader.deductionScore) leader = hypothesis;
  });

  if (!leader) return hypotheses;

  return hypotheses.filter(function (hypothesis) {
    var scoreGap;
    var strongSibling;

    if (hypothesis._causeFamily !== dominantFamily || hypothesis === leader) return !hypothesis.excluded;

    scoreGap = (leader.deductionScore || 0) - (hypothesis.deductionScore || 0);
    strongSibling = hypothesis.livello !== "non_verifiable" && scoreGap <= 2;

    if (strongSibling) return true;

    if (hypothesis.livello === "confirmed" && scoreGap >= 3) {
      hypothesis.livello = "probable";
    } else if (hypothesis.livello === "probable" && scoreGap >= 4) {
      hypothesis.livello = "non_verifiable";
    }

    if (hypothesis.livello === "non_verifiable" && scoreGap >= 4) {
      return false;
    }

    return !hypothesis.excluded;
  });
}

function buildCausalSummary(dominantFamily, hypotheses, caseState) {
  var topFamilies = [];
  var labelMap = {
    isolamento: "isolamento/dispersione",
    sovratemperatura: "sovratemperatura",
    assenza_tensione: "tensione/alimentazione",
    sovraccarico: "sovraccarico",
    contatto_interruzione: "contatto/interruzione"
  };

  hypotheses.forEach(function (hypothesis) {
    if (!hypothesis._causeFamily || topFamilies.indexOf(hypothesis._causeFamily) >= 0) return;
    topFamilies.push(hypothesis._causeFamily);
  });

  if (!dominantFamily) {
    return topFamilies.length > 1
      ? "Nessuna famiglia causale dominante netta; mantenere prudenza tra " +
          topFamilies.slice(0, 2).map(function (family) { return labelMap[family] || family; }).join(" e ") + "."
      : "Nessuna famiglia causale dominante netta.";
  }

  return "Famiglia causale dominante: " + (labelMap[dominantFamily] || dominantFamily) + "." +
    (caseState && caseState.strongestHypothesis ? " Causa guida: " + caseState.strongestHypothesis.causa + "." : "");
}

function buildDecisionPolicy(caseState, safetyDecision, hypotheses, diagnosticChecks) {
  var topHypothesis = hypotheses[0] || null;
  var topCheck = diagnosticChecks[0] || null;
  function stripTrailingDot(text) {
    return String(text || "").replace(/[.\s]+$/, "");
  }
  var policy = {
    immediateAction: "",
    allowedNextStep: topCheck ? stripTrailingDot(topCheck.reason) : "",
    blockedActions: [],
    technicianPriority: caseState && caseState.dominantCauseFamily
      ? caseState.dominantCauseFamily
      : (topHypothesis ? (topHypothesis.causa || topHypothesis.family || "general") : "general")
  };

  function pushBlocked(action) {
    if (!action || policy.blockedActions.indexOf(action) >= 0) return;
    policy.blockedActions.push(action);
  }

  if (safetyDecision.level === "stop") {
    policy.immediateAction = "Mettere in sicurezza, disalimentare e verificare assenza tensione prima di qualsiasi altra attivita.";
    policy.allowedNextStep = "Solo verifica di sicurezza e ispezione a impianto in sicurezza.";
    pushBlocked("prove sotto carico");
    pushBlocked("riarmo o riattivazione del circuito");
    pushBlocked("apertura del quadro in tensione");
  } else if (safetyDecision.level === "danger") {
    policy.immediateAction = "Eseguire solo verifiche elettriche sicure e prioritarie con protezioni adeguate.";
    policy.allowedNextStep = topCheck ? stripTrailingDot(topCheck.reason) : "Verificare assenza tensione e poi misura mirata sul rischio dominante";
    pushBlocked("prove sotto carico non essenziali");
    pushBlocked("manovre ripetute senza isolamento del rischio");
  } else if (safetyDecision.level === "attention") {
    policy.immediateAction = "Procedere con verifiche guidate e una misura discriminante alla volta.";
    policy.allowedNextStep = topCheck ? stripTrailingDot(topCheck.reason) : "Eseguire la verifica discriminante piu coerente con il caso";
    pushBlocked("sostituzioni senza conferma strumentale");
  } else {
    policy.immediateAction = "Procedere con il prossimo passo tecnico coerente con la causa dominante.";
    policy.allowedNextStep = topCheck ? stripTrailingDot(topCheck.reason) : "Eseguire la prima verifica tecnica disponibile";
  }

  return policy;
}

function safeGetClosedCaseLearningSignal(payload) {
  try {
    var safePayload = payload || {};
    var baseSignal = getClosedCaseLearningSignal(safePayload);
    return applyRelevantLearnings(
      safePayload.hypotheses,
      safePayload.diagnosticChecks,
      baseSignal.relevantLearnings,
      safePayload.normalizedFacts,
      safePayload.caseState,
      safePayload.safetyDecision,
      baseSignal
    );
  } catch (_error) {
    return {
      applied: false,
      fingerprint: buildCaseFingerprint(payload || {}),
      totalMatchedClosedCases: 0,
      allowCheckReorder: false,
      relevantLearnings: [],
      learningMatches: [],
      learningWarnings: [],
      matchedCaseIds: [],
      contradictedLearningIds: [],
      boostedHypothesisIds: [],
      matchScore: 0,
      learningBoost: { hypotheses: 0, checks: 0 },
      learningMeta: {
        matchedLearnings: 0,
        recentLearnings: 0,
        staleLearnings: 0,
        contradictedLearnings: 0,
        weakLearnings: 0,
        hardSafetyNeutralized: false,
        freshestAgeDays: null,
        appliedTemporalDecay: true
      },
      hypothesisBoosts: {},
      checkBoosts: {}
    };
  }
}

function normalizeLearningTargetKey(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function safeParseLearningTimestamp(value) {
  var parsed;

  if (value === undefined || value === null || value === "") return null;
  parsed = new Date(value);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

function computeLearningAgeDays(timestamp, now) {
  var parsed = safeParseLearningTimestamp(timestamp);
  var reference = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
  var deltaMs;

  if (!parsed) return null;
  deltaMs = reference.getTime() - parsed.getTime();
  if (deltaMs < 0) return 0;
  return Math.floor(deltaMs / 86400000);
}

function classifyLearningRecency(ageDays) {
  if (ageDays === null || ageDays === undefined) return "unknown";
  if (ageDays <= 30) return "recent";
  if (ageDays <= 120) return "active";
  if (ageDays <= 240) return "aging";
  if (ageDays <= 365) return "stale";
  return "legacy";
}

function computeLearningFreshnessWeight(ageDays) {
  if (ageDays === null || ageDays === undefined) return Math.round(UNKNOWN_TIMESTAMP_FRESHNESS_WEIGHT * 10000) / 10000;
  return Math.round(Math.max(MIN_LEARNING_FRESHNESS_WEIGHT, Math.pow(0.5, ageDays / LEARNING_HALF_LIFE_DAYS)) * 10000) / 10000;
}

function computeLearningRecencyWeight(record, now) {
  var timestamp = record && record.timestamp ? record.timestamp : null;
  var ageDays = computeLearningAgeDays(timestamp, now);

  return {
    timestamp: timestamp,
    ageDays: ageDays,
    recencyBand: classifyLearningRecency(ageDays),
    freshnessWeight: computeLearningFreshnessWeight(ageDays)
  };
}

function isRecentEnoughLearning(wrapper) {
  return !!wrapper && Number(wrapper.freshnessWeight || 0) >= 0.5;
}

function toBoundedDelta(weight, maxDelta) {
  return Math.max(0, Math.min(maxDelta, Math.round(Number(weight || 0) * maxDelta)));
}

function uniqueLearningValues(values) {
  var seen = {};
  var out = [];

  (Array.isArray(values) ? values : values === undefined || values === null ? [] : [values]).forEach(function (value) {
    var normalizedValue = normalizeLearningTargetKey(value);
    if (!normalizedValue || seen[normalizedValue]) return;
    seen[normalizedValue] = true;
    out.push(normalizedValue);
  });

  return out;
}

function extractLearningComponentHintsFromText(text) {
  var normalizedText = normalizeLearningTargetKey(text);
  var hints = [];
  var componentPatterns = [
    ["differenziale", /differenzial|salvavita|rcd|rcbo/],
    ["magnetotermico", /magnetoterm|mcb|interruttor/],
    ["contattore", /contattor|teleruttor/],
    ["rele", /rele|relay/],
    ["bobina", /bobina/],
    ["motore", /motore/],
    ["inverter", /inverter/],
    ["wallbox", /wallbox|ricarica ev|auto elettric/],
    ["fusibile", /fusibil|portafusibil/],
    ["morsetto", /morsett/],
    ["neutro", /neutro/],
    ["cavo", /cavo|guaina|canalina/],
    ["trasformatore", /trasformat|trafo/],
    ["termico", /termic|salvamotor/],
    ["sensore", /sensore|sonda/]
  ];

  componentPatterns.forEach(function (entry) {
    if (entry[1].test(normalizedText)) hints.push(entry[0]);
  });

  return uniqueLearningValues(hints);
}

function extractLearningStateHintsFromText(text) {
  var normalizedText = normalizeLearningTargetKey(text);
  var states = [];
  var statePatterns = [
    ["rcd_trip", /differenzial.*scatta|rcd.*scatta|salvavita.*scatta|differenzial.*intervien/],
    ["mcb_trip", /magnetoterm.*scatta|mcb.*scatta|interruttor.*scatta/],
    ["burn_signs", /bruciat|fuma|odore|scintill|sciolto/],
    ["temperature_high", /temperatur|surriscald|caldo/],
    ["voltage_anomaly", /sovratension|sottotension|fuori range|anomalia rete/],
    ["no_voltage_claim", /assenza tensione|manca tensione|senza tensione/],
    ["high_current", /alta corrente|sovraccaric|assorbiment elevat/],
    ["under_load", /sotto carico|quando accendo|quando uso|con carico/],
    ["trips_no_load", /a vuoto|senza carico|tutto staccato/],
    ["terminal_reference", /morsett|serragg|connession allentat/],
    ["neutral_reference", /neutro|ritorno/],
    ["isolation_low", /isolament.*basso|dispersion|guasto isolamento/]
  ];

  statePatterns.forEach(function (entry) {
    if (entry[1].test(normalizedText)) states.push(entry[0]);
  });

  return uniqueLearningValues(states);
}

function scoreLearningSetOverlap(currentValues, storedValues) {
  var left = uniqueLearningValues(currentValues);
  var right = uniqueLearningValues(storedValues);
  var intersection = 0;

  if (!left.length || !right.length) return 0;

  left.forEach(function (value) {
    if (right.indexOf(value) >= 0) intersection += 1;
  });

  return Math.round((intersection / Math.max(left.length, right.length)) * 10000) / 10000;
}

function scoreLearningTextSimilarity(leftValue, rightValue) {
  var left = normalizeLearningTargetKey(leftValue);
  var right = normalizeLearningTargetKey(rightValue);
  var leftTokens;
  var rightTokens;
  var union = {};
  var unionSize = 0;
  var intersection = 0;

  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.indexOf(right) >= 0 || right.indexOf(left) >= 0) return 0.92;

  leftTokens = left.split(" ").filter(function (token) { return token.length > 1; });
  rightTokens = right.split(" ").filter(function (token) { return token.length > 1; });

  leftTokens.forEach(function (token) {
    if (!union[token]) {
      union[token] = { left: false, right: false };
      unionSize += 1;
    }
    union[token].left = true;
  });
  rightTokens.forEach(function (token) {
    if (!union[token]) {
      union[token] = { left: false, right: false };
      unionSize += 1;
    }
    union[token].right = true;
  });

  if (!unionSize) return 0;
  Object.keys(union).forEach(function (token) {
    if (union[token].left && union[token].right) intersection += 1;
  });

  return Math.round((intersection / unionSize) * 10000) / 10000;
}

function scoreLearningMeasurementAlignment(currentMeasurements, storedMeasurements) {
  var matched = 0;
  var agreement = 0;
  var conflict = 0;

  (Array.isArray(currentMeasurements) ? currentMeasurements : []).forEach(function (currentMeasurement) {
    (Array.isArray(storedMeasurements) ? storedMeasurements : []).forEach(function (storedMeasurement) {
      var currentType = normalizeLearningTargetKey(currentMeasurement && currentMeasurement.type);
      var storedType = normalizeLearningTargetKey(storedMeasurement && storedMeasurement.type);
      var currentUnit = normalizeLearningTargetKey(currentMeasurement && currentMeasurement.unit);
      var storedUnit = normalizeLearningTargetKey(storedMeasurement && storedMeasurement.unit);
      var currentValue = Number(currentMeasurement && currentMeasurement.value);
      var storedValue = Number(storedMeasurement && storedMeasurement.value);
      var relativeGap;

      if (!currentType || currentType !== storedType || currentUnit !== storedUnit) return;
      if (!Number.isFinite(currentValue) || !Number.isFinite(storedValue)) return;

      matched += 1;
      relativeGap = Math.abs(currentValue - storedValue) / Math.max(Math.abs(currentValue), Math.abs(storedValue), 1);
      if (relativeGap <= 0.25) {
        agreement += 1;
      } else if (relativeGap >= 0.55) {
        conflict += 1;
      }
    });
  });

  if (!matched) {
    return { agreement: 0, conflict: 0 };
  }

  return {
    agreement: Math.round((agreement / matched) * 10000) / 10000,
    conflict: Math.round((conflict / matched) * 10000) / 10000
  };
}

function collectCurrentLearningStates(facts, caseState) {
  var states = [];

  [
    "rcd_trip",
    "mcb_trip",
    "burn_signs",
    "temperature_high",
    "voltage_anomaly",
    "voltage_nominal",
    "no_voltage_claim",
    "high_current",
    "under_load",
    "trips_no_load",
    "terminal_reference",
    "neutral_reference",
    "isolation_low",
    "isolation_high"
  ].forEach(function (key) {
    if (hasFact(facts, key)) states.push(key);
  });

  if (caseState && caseState.dominantRisk) {
    states.push("risk:" + normalizeLearningTargetKey(caseState.dominantRisk));
  }

  return uniqueLearningValues(states);
}

function buildCurrentLearningProfile(hypotheses, facts, caseState) {
  var safeHypotheses = Array.isArray(hypotheses) ? hypotheses : [];
  var families = [];
  var categories = [];
  var components = [];
  var symptoms = [];

  safeHypotheses.slice(0, 4).forEach(function (hypothesis) {
    if (hypothesis && hypothesis.family) families.push(hypothesis.family);
    if (hypothesis && hypothesis.category) categories.push(hypothesis.category);
    if (hypothesis && hypothesis.causa) symptoms.push(hypothesis.causa);
    if (hypothesis && hypothesis.symptom) symptoms.push(hypothesis.symptom);
    components = components.concat(extractLearningComponentHintsFromText([
      hypothesis && hypothesis.causa,
      hypothesis && hypothesis.symptom
    ].join(" ")));
  });

  if (caseState && caseState.dominantCauseFamily) families.push(caseState.dominantCauseFamily);
  if (caseState && Array.isArray(caseState.observedDomains)) symptoms = symptoms.concat(caseState.observedDomains);
  if (caseState && caseState.strongestHypothesis && caseState.strongestHypothesis.causa) {
    symptoms.push(caseState.strongestHypothesis.causa);
  }

  getFactsByType(facts, "matched_component").forEach(function (fact) {
    components.push(fact.value);
  });
  getFactsByType(facts, "matched_keyword").forEach(function (fact) {
    components = components.concat(extractLearningComponentHintsFromText(fact.value));
  });

  return {
    families: uniqueLearningValues(families),
    categories: uniqueLearningValues(categories),
    components: uniqueLearningValues(components),
    symptoms: uniqueLearningValues(symptoms),
    states: collectCurrentLearningStates(facts, caseState),
    measurements: (Array.isArray(facts) ? facts : []).filter(function (fact) {
      return fact && fact.unit && typeof fact.value === "number";
    }).slice(0, 8).map(function (fact) {
      return {
        type: fact.type,
        value: fact.value,
        unit: fact.unit
      };
    }),
    dominantRisk: normalizeLearningTargetKey(caseState && caseState.dominantRisk)
  };
}

function buildStoredLearningProfile(record) {
  var safeRecord = record || {};
  var fingerprint = safeRecord.caseFingerprint || {};
  var family = normalizeLearningTargetKey(safeRecord.dominantCauseFamily || fingerprint.dominantCauseFamily);
  var confirmedCause = safeRecord.confirmedCause || "";
  var sourceText = [
    confirmedCause,
    (safeRecord.initialTopHypotheses || []).join(" "),
    (safeRecord.decisiveChecks || []).join(" "),
    (safeRecord.rejectedCauses || []).join(" "),
    (safeRecord.reusableSignals || []).join(" "),
    (fingerprint.topSymptoms || []).join(" "),
    (fingerprint.topFacts || []).join(" "),
    (fingerprint.strongSignals || []).join(" ")
  ].join(" ");

  return {
    caseId: safeRecord.id || (fingerprint && fingerprint.key) || null,
    family: family,
    category: normalizeLearningTargetKey(resolveHypothesisCategory(family, confirmedCause)),
    components: extractLearningComponentHintsFromText(sourceText),
    symptoms: uniqueLearningValues(
      []
        .concat(safeRecord.initialTopHypotheses || [])
        .concat([confirmedCause])
        .concat(fingerprint.topSymptoms || [])
        .concat(fingerprint.topFacts || [])
        .concat((safeRecord.reusableSignals || []).map(function (signal) {
          return String(signal || "").replace(/^(risk|family|top|check):/i, "");
        }))
    ),
    states: uniqueLearningValues(
      extractLearningStateHintsFromText(sourceText)
        .concat((fingerprint.strongSignals || []).map(function (signal) {
          return String(signal || "").split(":")[0];
        }))
    ),
    measurements: Array.isArray(safeRecord.reusableThresholds) && safeRecord.reusableThresholds.length
      ? safeRecord.reusableThresholds.slice(0, 8)
      : (Array.isArray(fingerprint.keyMeasurements) ? fingerprint.keyMeasurements.slice(0, 8) : []),
    dominantRisk: normalizeLearningTargetKey(safeRecord.dominantRisk || fingerprint.dominantRisk),
    confirmedCause: confirmedCause,
    decisiveChecks: Array.isArray(safeRecord.decisiveChecks) ? safeRecord.decisiveChecks.slice(0, 6) : []
  };
}

function computeLearningStateConflict(currentStates, storedStates) {
  var current = uniqueLearningValues(currentStates);
  var stored = uniqueLearningValues(storedStates);

  if (!current.length || !stored.length) return 0;
  if (stored.indexOf("trips_no_load") >= 0 && current.indexOf("under_load") >= 0 && current.indexOf("trips_no_load") < 0) return 0.8;
  if (stored.indexOf("no_voltage_claim") >= 0 && current.indexOf("voltage_nominal") >= 0 && current.indexOf("voltage_anomaly") < 0) return 0.8;
  if (stored.indexOf("isolation_low") >= 0 && current.indexOf("isolation_high") >= 0) return 0.9;
  if (stored.indexOf("high_current") >= 0 && current.indexOf("high_current") < 0 && current.indexOf("voltage_nominal") >= 0) return 0.5;

  return 0;
}

function isLearningContradictedByFacts(wrapper, facts) {
  var learning = wrapper && wrapper.record ? wrapper.record : {};
  var family = normalizeLearningTargetKey(learning.dominantCauseFamily);
  var cause = normalizeLearningTargetKey(learning.confirmedCause);

  if ((family === "dispersione" || /isolamento|dispersione/.test(cause)) && hasFact(facts, "isolation_high")) {
    return true;
  }
  if ((family === "anomalia_rete" || family === "assenza_tensione" || /assenza tensione|manca tensione/.test(cause)) &&
      hasFact(facts, "voltage_nominal") &&
      !hasFact(facts, "voltage_anomaly")) {
    return true;
  }
  if ((family === "sovraccarico" || /sovraccaric/.test(cause)) &&
      !hasFact(facts, "high_current") &&
      hasFact(facts, "voltage_nominal")) {
    return true;
  }

  return false;
}

function evaluateClosedCaseLearningMatch(wrapper, currentProfile, facts) {
  var storedProfile = buildStoredLearningProfile(wrapper && wrapper.record);
  var familyMatch = storedProfile.family && currentProfile.families.indexOf(storedProfile.family) >= 0 ? 1 : 0;
  var categoryMatch = storedProfile.category && currentProfile.categories.indexOf(storedProfile.category) >= 0 ? 1 : 0;
  var componentOverlap = scoreLearningSetOverlap(currentProfile.components, storedProfile.components);
  var symptomOverlap = scoreLearningSetOverlap(currentProfile.symptoms, storedProfile.symptoms);
  var stateOverlap = scoreLearningSetOverlap(currentProfile.states, storedProfile.states);
  var measurementAlignment = scoreLearningMeasurementAlignment(currentProfile.measurements, storedProfile.measurements);
  var stateConflict = computeLearningStateConflict(currentProfile.states, storedProfile.states);
  var explicitContradiction = isLearningContradictedByFacts(wrapper, facts);
  var priorScore = Math.max(0, Math.min(1, Number(wrapper && wrapper.weightedRelevance || 0)));
  var dominantRiskMatch = storedProfile.dominantRisk && storedProfile.dominantRisk === currentProfile.dominantRisk ? 1 : 0;
  var positiveScore =
    (familyMatch * 0.26) +
    (categoryMatch * 0.08) +
    (componentOverlap * 0.12) +
    (symptomOverlap * 0.18) +
    (stateOverlap * 0.14) +
    (measurementAlignment.agreement * 0.14) +
    (dominantRiskMatch * 0.08) +
    (priorScore * 0.12);
  var negativeScore =
    (measurementAlignment.conflict * 0.22) +
    (stateConflict * 0.18) +
    (explicitContradiction ? 0.42 : 0);
  var matchScore = Math.max(0, Math.min(1, Math.round((positiveScore - negativeScore) * 10000) / 10000));
  var warnings = [];
  var contradicted = explicitContradiction || measurementAlignment.conflict >= 0.5 || stateConflict >= 0.8;

  if (!familyMatch && symptomOverlap < 0.2 && componentOverlap < 0.2) {
    warnings.push("weak_context_alignment");
  }
  if (measurementAlignment.conflict >= 0.5) {
    warnings.push("measurement_conflict");
  }
  if (stateConflict >= 0.8) {
    warnings.push("state_conflict");
  }
  if (explicitContradiction) {
    warnings.push("contradicted_by_current_facts");
  }

  return {
    caseId: storedProfile.caseId,
    storedProfile: storedProfile,
    matchScore: matchScore,
    familyMatch: familyMatch,
    categoryMatch: categoryMatch,
    componentOverlap: componentOverlap,
    symptomOverlap: symptomOverlap,
    stateOverlap: stateOverlap,
    measurementAlignment: measurementAlignment,
    stateConflict: stateConflict,
    contradicted: contradicted,
    warnings: warnings,
    decisiveChecks: storedProfile.decisiveChecks
  };
}

function resolveLearningHypothesisTargets(matchEntry, hypotheses) {
  var rankedTargets = [];

  (Array.isArray(hypotheses) ? hypotheses : []).forEach(function (hypothesis) {
    var causeSimilarity = scoreLearningTextSimilarity(hypothesis && hypothesis.causa, matchEntry && matchEntry.storedProfile && matchEntry.storedProfile.confirmedCause);
    var familyMatch = matchEntry && matchEntry.storedProfile && hypothesis && hypothesis.family === matchEntry.storedProfile.family ? 1 : 0;
    var categoryMatch = matchEntry && matchEntry.storedProfile && hypothesis && normalizeLearningTargetKey(hypothesis.category) === matchEntry.storedProfile.category ? 1 : 0;
    var componentBonus = hypothesis && hypothesis.causa
      ? scoreLearningSetOverlap(
          extractLearningComponentHintsFromText(hypothesis.causa),
          matchEntry && matchEntry.storedProfile ? matchEntry.storedProfile.components : []
        )
      : 0;
    var targetScore = (causeSimilarity * 0.7) + (familyMatch * 0.2) + (categoryMatch * 0.05) + (componentBonus * 0.05);
    var hasDirectEvidence = causeSimilarity >= 0.38 || (familyMatch && componentBonus >= 0.5);

    if (!hasDirectEvidence || targetScore < 0.58) return;
    rankedTargets.push({
      hypothesis: hypothesis,
      targetScore: targetScore
    });
  });

  rankedTargets.sort(function (a, b) { return b.targetScore - a.targetScore; });
  return rankedTargets.slice(0, 2);
}

function resolveLearningCheckTargets(matchEntry, diagnosticChecks) {
  var rankedTargets = [];
  var decisiveChecks = matchEntry && Array.isArray(matchEntry.decisiveChecks) ? matchEntry.decisiveChecks : [];

  (Array.isArray(diagnosticChecks) ? diagnosticChecks : []).forEach(function (check) {
    var bestSimilarity = 0;
    var familyBonus = Array.isArray(check && check.basedOnFacts) &&
      matchEntry &&
      matchEntry.storedProfile &&
      check.basedOnFacts.indexOf(matchEntry.storedProfile.family) >= 0 ? 0.15 : 0;

    decisiveChecks.forEach(function (storedCheck) {
      bestSimilarity = Math.max(bestSimilarity, scoreLearningTextSimilarity(check && check.reason, storedCheck));
    });

    if ((bestSimilarity + familyBonus) < 0.58) return;
    rankedTargets.push({
      check: check,
      targetScore: bestSimilarity + familyBonus
    });
  });

  rankedTargets.sort(function (a, b) { return b.targetScore - a.targetScore; });
  return rankedTargets.slice(0, 3);
}

function buildLearningBoostEntry(boost, matchedClosedCases, matchedLabel, matchedCaseIds, matchScore, warnings) {
  return {
    boost: boost,
    matchedClosedCases: matchedClosedCases,
    matchedLabel: matchedLabel,
    matchedCaseIds: uniqueLearningValues(matchedCaseIds),
    matchScore: Math.round(Number(matchScore || 0) * 10000) / 10000,
    warnings: uniqueLearningValues(warnings)
  };
}

function applyRelevantLearnings(hypotheses, diagnosticChecks, relevantLearnings, facts, caseState, safetyDecision, baseSignal) {
  var safeHypotheses = Array.isArray(hypotheses) ? hypotheses : [];
  var safeChecks = Array.isArray(diagnosticChecks) ? diagnosticChecks : [];
  var wrappers = (Array.isArray(relevantLearnings) ? relevantLearnings : []).map(function (learning) {
    var temporal = computeLearningRecencyWeight(learning);
    var baseMatchScore = Number(learning && learning._matchScore || 0);

    return {
      record: learning,
      timestamp: temporal.timestamp,
      ageDays: temporal.ageDays,
      recencyBand: temporal.recencyBand,
      freshnessWeight: temporal.freshnessWeight,
      baseMatchScore: baseMatchScore,
      weightedRelevance: Math.round(baseMatchScore * temporal.freshnessWeight * 10000) / 10000
    };
  }).sort(function (a, b) {
    if (b.weightedRelevance !== a.weightedRelevance) return b.weightedRelevance - a.weightedRelevance;
    if (b.baseMatchScore !== a.baseMatchScore) return b.baseMatchScore - a.baseMatchScore;
    return String(b.timestamp || "").localeCompare(String(a.timestamp || ""));
  }).slice(0, MAX_RELEVANT_LEARNINGS);
  var safeSafetyDecision = safetyDecision || {};
  var hardSafety = safeSafetyDecision.level === "danger" || safeSafetyDecision.level === "stop";
  var currentProfile = buildCurrentLearningProfile(safeHypotheses, facts, caseState);
  var hypothesisBoosts = {};
  var checkBoosts = {};
  var learningMatches = [];
  var learningWarnings = [];
  var contradictedLearningIds = [];
  var matchedCaseIds = [];
  var boostedHypothesisIds = [];
  var learningMeta = {
    matchedLearnings: 0,
    recentLearnings: 0,
    staleLearnings: 0,
    freshestAgeDays: null,
    contradictedLearnings: 0,
    weakLearnings: 0,
    hardSafetyNeutralized: hardSafety,
    appliedTemporalDecay: true
  };

  wrappers.forEach(function (wrapper) {
    var matchEntry = evaluateClosedCaseLearningMatch(wrapper, currentProfile, facts);
    var caseId = matchEntry.caseId || ("learning-" + learningMatches.length);

    if (wrapper.ageDays !== null && wrapper.ageDays !== undefined) {
      learningMeta.freshestAgeDays = learningMeta.freshestAgeDays === null
        ? wrapper.ageDays
        : Math.min(learningMeta.freshestAgeDays, wrapper.ageDays);
    }

    if (matchEntry.contradicted) {
      contradictedLearningIds.push(caseId);
      learningMeta.contradictedLearnings += 1;
      learningWarnings = learningWarnings.concat(matchEntry.warnings);
      return;
    }

    if (matchEntry.matchScore < 0.56) {
      learningMeta.weakLearnings += 1;
      learningWarnings = learningWarnings.concat(matchEntry.warnings);
      return;
    }

    learningMeta.matchedLearnings += 1;
    if (isRecentEnoughLearning(wrapper)) learningMeta.recentLearnings += 1;
    else learningMeta.staleLearnings += 1;

    matchEntry.caseId = caseId;
    matchEntry.recencyBand = wrapper.recencyBand;
    matchEntry.freshnessWeight = wrapper.freshnessWeight;
    learningMatches.push(matchEntry);
    matchedCaseIds.push(caseId);
    learningWarnings = learningWarnings.concat(matchEntry.warnings);
  });

  if (!hardSafety) {
    learningMatches.forEach(function (matchEntry) {
      var targetHypotheses = resolveLearningHypothesisTargets(matchEntry, safeHypotheses);
      var hypothesisDelta = matchEntry.matchScore >= 0.82 && matchEntry.freshnessWeight >= 0.5 ? 2 : 1;
      var targetChecks;
      var checkDelta;

      targetHypotheses.forEach(function (target) {
        var hypothesis = target.hypothesis;
        var keys = uniqueLearningValues([hypothesis.id, hypothesis.causa]);
        var existing = hypothesisBoosts[hypothesis.id] || null;
        var nextBoost = Math.min(2, (existing ? existing.boost : 0) + hypothesisDelta);
        var entry = buildLearningBoostEntry(
          nextBoost,
          learningMeta.matchedLearnings,
          hypothesis.causa,
          (existing && existing.matchedCaseIds || []).concat([matchEntry.caseId]),
          Math.max(existing ? existing.matchScore : 0, matchEntry.matchScore),
          (existing && existing.warnings || []).concat(matchEntry.warnings || [])
        );

        keys.forEach(function (key) {
          if (!key) return;
          hypothesisBoosts[key] = entry;
        });
        boostedHypothesisIds.push(hypothesis.id);
      });

      targetChecks = resolveLearningCheckTargets(matchEntry, safeChecks);
      checkDelta = matchEntry.matchScore >= 0.84 && matchEntry.freshnessWeight >= 0.5 ? 2 : 1;
      targetChecks.forEach(function (target) {
        var check = target.check;
        var existing = checkBoosts[check.id] || null;
        var nextBoost = Math.min(2, (existing ? existing.boost : 0) + checkDelta);
        var entry = buildLearningBoostEntry(
          nextBoost,
          learningMeta.matchedLearnings,
          check.reason,
          (existing && existing.matchedCaseIds || []).concat([matchEntry.caseId]),
          Math.max(existing ? existing.matchScore : 0, matchEntry.matchScore),
          (existing && existing.warnings || []).concat(matchEntry.warnings || [])
        );

        checkBoosts[check.id] = entry;
        checkBoosts[normalizeLearningTargetKey(check.reason)] = entry;
      });
    });
  } else if (learningMatches.length) {
    learningWarnings.push("neutralized_by_hard_safety");
  }

  return {
    applied: !hardSafety && (Object.keys(hypothesisBoosts).length > 0 || Object.keys(checkBoosts).length > 0),
    fingerprint: baseSignal && baseSignal.fingerprint,
    totalMatchedClosedCases: !hardSafety ? learningMeta.matchedLearnings : 0,
    allowCheckReorder: !!(baseSignal && baseSignal.allowCheckReorder) && !hardSafety,
    relevantLearnings: learningMatches.slice(0),
    learningMeta: learningMeta,
    learningMatches: learningMatches.map(function (entry) {
      return {
        caseId: entry.caseId,
        matchScore: entry.matchScore,
        recencyBand: entry.recencyBand,
        freshnessWeight: entry.freshnessWeight,
        family: entry.storedProfile.family,
        category: entry.storedProfile.category,
        warnings: entry.warnings.slice(0)
      };
    }),
    learningWarnings: uniqueLearningValues(learningWarnings),
    matchedCaseIds: uniqueLearningValues(matchedCaseIds),
    contradictedLearningIds: uniqueLearningValues(contradictedLearningIds),
    boostedHypothesisIds: uniqueLearningValues(boostedHypothesisIds),
    matchScore: learningMatches.length ? Math.max.apply(null, learningMatches.map(function (entry) { return entry.matchScore; })) : 0,
    learningBoost: {
      hypotheses: Object.keys(hypothesisBoosts).filter(function (key) { return /^H[-_A-Z0-9]/i.test(key); }).length,
      checks: Object.keys(checkBoosts).filter(function (key) { return /^CHK/i.test(key); }).length
    },
    hypothesisBoosts: hypothesisBoosts,
    checkBoosts: checkBoosts
  };
}

function cleanClosedCaseText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function cleanClosedCaseTextArray(values) {
  var seen = {};
  var out = [];

  (Array.isArray(values) ? values : values === undefined || values === null ? [] : [values]).forEach(function (value) {
    var cleaned = cleanClosedCaseText(value);
    var key = cleaned.toLowerCase();

    if (!cleaned || seen[key]) return;
    seen[key] = true;
    out.push(cleaned);
  });

  return out;
}

function normalizeClosedCaseFeedback(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  return {
    validated: input.validated === true,
    status: cleanClosedCaseText(input.status || "").toLowerCase(),
    outcome: cleanClosedCaseText(input.outcome || "").toLowerCase(),
    confirmedCause: cleanClosedCaseText(input.confirmedCause || input.finalCause || input.rootCause || ""),
    decisiveChecks: cleanClosedCaseTextArray(input.decisiveChecks || input.helpfulChecks),
    rejectedCauses: cleanClosedCaseTextArray(input.rejectedCauses),
    notes: cleanClosedCaseText(input.notes || input.technicianNotes || ""),
    caseId: cleanClosedCaseText(input.caseId || input.id || "")
  };
}

function isClosableValidatedCase(feedback) {
  var closableOutcomes = {
    closed: true,
    resolved: true,
    fixed: true,
    stabilized: true,
    mitigated: true
  };

  if (!feedback) return false;
  return feedback.validated === true &&
    (!!closableOutcomes[feedback.status] || !!closableOutcomes[feedback.outcome]) &&
    !!feedback.confirmedCause;
}

function classifyDiagnosticError(diagnosticResult, validation) {
  var topHypothesis = diagnosticResult &&
    Array.isArray(diagnosticResult.ipotesi) &&
    diagnosticResult.ipotesi.length ? diagnosticResult.ipotesi[0].causa : "";
  var confirmedCause = validation && validation.confirmedCause;
  var correctedErrors = [];

  if (topHypothesis && confirmedCause && normalize(topHypothesis) !== normalize(confirmedCause)) {
    correctedErrors.push("top_hypothesis_mismatch");
  }
  cleanClosedCaseTextArray(validation && validation.rejectedCauses).forEach(function (cause) {
    correctedErrors.push("rejected:" + cause);
  });

  return correctedErrors;
}

function extractReusableSignals(facts, caseState, hypotheses, validation) {
  var signals = [];

  (Array.isArray(facts) ? facts : []).forEach(function (fact) {
    if (!fact || !fact.type || fact.certainty === "non_verifiable") return;
    signals.push(fact.type);
  });
  if (caseState && caseState.dominantRisk) signals.push("risk:" + caseState.dominantRisk);
  if (caseState && caseState.dominantCauseFamily) signals.push("family:" + caseState.dominantCauseFamily);
  if (Array.isArray(hypotheses) && hypotheses.length && hypotheses[0].causa) {
    signals.push("top:" + hypotheses[0].causa);
  }
  cleanClosedCaseTextArray(validation && validation.decisiveChecks).forEach(function (check) {
    signals.push("check:" + check);
  });

  return cleanClosedCaseTextArray(signals).slice(0, 12);
}

function buildClosedCaseLearning(params) {
  var safeParams = params && typeof params === "object" ? params : {};
  var internal = safeParams.internal && typeof safeParams.internal === "object" ? safeParams.internal : {};
  var feedback = safeParams.closedCase;
  var facts = Array.isArray(internal.facts) ? internal.facts : [];
  var caseState = internal.caseState || {};
  var hypotheses = Array.isArray(internal.hypotheses) ? internal.hypotheses : [];
  var caseFingerprint = internal.caseFingerprint || buildCaseFingerprint({
    caseState: caseState,
    safetyDecision: internal.safetyDecision,
    hypotheses: hypotheses,
    diagnosticChecks: internal.diagnosticChecks,
    normalizedFacts: facts
  });

  return {
    id: feedback.caseId || null,
    timestamp: new Date().toISOString(),
    caseFingerprint: caseFingerprint,
    observedDomains: Array.isArray(caseState.observedDomains) ? caseState.observedDomains.slice(0, 8) : [],
    dominantRisk: caseState.dominantRisk || "unknown",
    dominantCauseFamily: caseState.dominantCauseFamily || "unknown",
    initialTopHypotheses: hypotheses.slice(0, 3).map(function (hypothesis) {
      return hypothesis.causa;
    }).filter(Boolean),
    confirmedCause: feedback.confirmedCause,
    rejectedCauses: cleanClosedCaseTextArray(feedback.rejectedCauses),
    decisiveChecks: cleanClosedCaseTextArray(feedback.decisiveChecks),
    correctedErrors: classifyDiagnosticError(safeParams.diagnosticResult, feedback),
    reusableSignals: extractReusableSignals(facts, caseState, hypotheses, feedback),
    reusableThresholds: facts.filter(function (fact) {
      return fact && fact.unit && typeof fact.value === "number";
    }).slice(0, 6).map(function (fact) {
      return {
        type: fact.type,
        value: fact.value,
        unit: fact.unit
      };
    }),
    notes: feedback.notes || ""
  };
}

function recordClosedCaseLearning(params) {
  var safeParams = params && typeof params === "object" ? params : {};
  var diagnosticResult = safeParams.diagnosticResult;
  var feedback = normalizeClosedCaseFeedback(safeParams.closedCase);
  var internal;
  var record;

  if (!diagnosticResult) {
    return { recorded: false, reason: "missing_diagnostic_result" };
  }
  if (safeParams.closedCase === undefined) {
    return { recorded: false, reason: "missing_closed_case_feedback" };
  }
  if (!feedback) {
    return { recorded: false, reason: "missing_closed_case_feedback" };
  }
  if (!isClosableValidatedCase(feedback)) {
    return { recorded: false, reason: "case_not_validated_or_closed" };
  }
  if (!diagnosticResult._roccoInternal) {
    return { recorded: false, reason: "missing_internal_context" };
  }

  internal = diagnosticResult._roccoInternal;
  record = buildClosedCaseLearning({
    diagnosticResult: diagnosticResult,
    internal: internal,
    closedCase: feedback
  });

  return appendClosedCaseLearning(record);
}

// ============================================================
// Funzione principale
// ============================================================
/**
 * @param {Object} input   - { message: string, hasImage: boolean }
 * @param {Object} knowledge - { failurePatterns, protectionRules, safetyProtocols }
 * @returns {Object} output strutturato
 */
function analyzeTechnicalRequest(input, knowledge) {
  var message  = String((input && input.message) || "").trim();
  var hasImage = !!(input && input.hasImage);
  var normalizedInput;
  var evidenceSet;
  var structuredQuery;

  if (!message && !hasImage) {
    return validateDiagOutput({
      isTechnical: false, isDangerous: false,
      matchedKeywords: [], matchedPatterns: [], matchedRules: [], matchedComponents: [],
      extractedValues: [], osservazioni: ["Nessun messaggio ricevuto."],
      ipotesi: [], verifiche: [], rischi: [],
      conclusione: "Input vuoto. Inviare descrizione del problema o foto."
    });
  }
  if (message.length > 5000) {
    message = message.slice(0, 5000);
  }

  var patterns = (knowledge && Array.isArray(knowledge.failurePatterns)) ? knowledge.failurePatterns : [];
  var components = (knowledge && Array.isArray(knowledge.components)) ? knowledge.components : [];
  var rules = (knowledge && Array.isArray(knowledge.protectionRules)) ? knowledge.protectionRules : [];
  normalizedInput = buildNormalizedInput({
    message: message,
    hasImage: hasImage,
    history: input && (input.history || input.chatHistory || input.caseHistory),
    visionData: input && (input.visionData || input.visionResult || input.visionOutput)
  }, {
    components: components
  });
  evidenceSet = buildEvidenceSet(normalizedInput);
  structuredQuery = buildNormalizedInferenceQuery(normalizedInput);

  var lower = structuredQuery.lower;
  var extractedValues = getMeasuredValuesFromEvidenceSet(evidenceSet);
  var voltageAnomaly = getVoltageSignalFromEvidenceSet(evidenceSet);
  var isTechnical = normalizedInput.isTechnical;
  var mentionsVoltage = hasEvidenceFact(evidenceSet, "mentions_voltage");
  var mentionsRCD = hasEvidenceFact(evidenceSet, "mentions_rcd");
  var mentionsOutdoor = hasEvidenceFact(evidenceSet, "mentions_outdoor");
  var mentionsMeasure = hasEvidenceFact(evidenceSet, "mentions_measure");
  var matchedKeywords = normalizedInput.technicalKeywords.slice(0);
  var tokens = structuredQuery.tokens.slice(0);
  var scoredPatterns;
  var matchedComponents;
  var scoredRules;
  var facts;
  var contradictions;
  var causalInferenceResult;
  var safetyDecision;
  var diagnosticChecks;
  var ipotesi;
  var osservazioni = [];
  var verifiche;
  var rischi = [];
  var conclusione;
  var publicHypotheses;
  var caseState;
  var causalGroups;
  var dominantCauseFamily;
  var decisionPolicy;
  var caseFingerprint;
  var closedCaseLearning;
  var finalDiag;

  if (hasEvidenceFact(evidenceSet, "isolation_low")) tokens.push("dispersione", "isolamento", "guasto");
  if (hasEvidenceFact(evidenceSet, "temperature_high")) tokens.push("surriscaldamento", "termico", "caldo");
  if (voltageAnomaly && voltageAnomaly.anomaly) {
    if (voltageAnomaly.direction === "sopra") {
      tokens.push("sovratensione", "rete", "apparecchi", "danneggiat");
    } else if (voltageAnomaly.direction === "sotto") {
      tokens.push("sottotensione", "rete", "apparecchi");
    }
  }

  scoredPatterns = patterns
    .map(function (pattern) { return { pattern: pattern, score: scorePatternMatch(pattern, lower, tokens) }; })
    .filter(function (entry) { return entry.score >= MATCH_THRESHOLD; })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 3);

  matchedComponents = (normalizedInput.recognizedComponents || []).map(function (entry) {
    var component = components.find(function (candidate) {
      return candidate.id === entry.key;
    });

    if (!component) {
      component = {
        id: entry.key,
        category: entry.type,
        field_checks: []
      };
    }

    return {
      component: component,
      score: Math.max(2, Math.round((entry.confidence || 0.2) * 10))
    };
  }).slice(0, 3);

  scoredRules = rules
    .map(function (rule) { return { rule: rule, score: scoreRuleMatch(rule, lower, tokens) }; })
    .filter(function (entry) { return entry.score >= MATCH_THRESHOLD; })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 3);

  if (mentionsOutdoor || mentionsRCD || hasEvidenceFact(evidenceSet, "danger_keyword") || hasEvidenceFact(evidenceSet, "temperature_high")) {
    rules.filter(function (rule) {
      return rule.id === "PR-02" || rule.id === "SP-01";
    }).forEach(function (rule) {
      if (!scoredRules.find(function (entry) { return entry.rule.id === rule.id; })) {
        scoredRules.push({ rule: rule, score: MATCH_THRESHOLD });
      }
    });
  }

  facts = normalizeFacts({
    normalizedInput: normalizedInput,
    evidenceSet: evidenceSet,
    hasImage: hasImage,
    matchedKeywords: matchedKeywords,
    scoredPatterns: scoredPatterns,
    matchedComponents: matchedComponents,
    scoredRules: scoredRules,
    measuredValues: extractedValues,
    voltageFact: voltageAnomaly,
    components: components
  });

  contradictions = detectContradictions(facts, normalizedInput);
  causalInferenceResult = buildCausalInferenceResult({
    normalizedInput: normalizedInput,
    evidenceSet: evidenceSet,
    facts: facts,
    contradictions: contradictions
  });
  safetyDecision = computeSafetyDecision(facts, contradictions, evidenceSet);
  diagnosticChecks = buildDiagnosticChecks(facts, contradictions, safetyDecision, evidenceSet);
  ipotesi = Array.isArray(causalInferenceResult.hypotheses) ? causalInferenceResult.hypotheses.slice(0) : [];
  caseState = buildCaseState(facts, contradictions, ipotesi, safetyDecision, evidenceSet, causalInferenceResult);
  causalGroups = groupHypothesesByCauseFamily(ipotesi);
  dominantCauseFamily = selectDominantCauseFamily(causalGroups, caseState);
  caseState.dominantCauseFamily = dominantCauseFamily;
  buildChecksFromMissingEvidence(ipotesi, safetyDecision).forEach(function (check) {
    pushDiagnosticCheck(diagnosticChecks, check.id, check.reason, check.priority, check.basedOnFacts);
  });
  caseState.causalSummary = buildCausalSummary(dominantCauseFamily, ipotesi, caseState);
  if (ipotesi.some(function (hypothesis) { return hypothesis.livello !== "non_verifiable"; })) {
    diagnosticChecks = diagnosticChecks.filter(function (check) {
      return check.id !== "CHK-GEN-01";
    });
  }
  diagnosticChecks.sort(function (a, b) {
    function getCasePriority(check) {
      var score = check.priority || 0;
      var text = normalize(String(check.reason || ""));
      var factsList = Array.isArray(check.basedOnFacts) ? check.basedOnFacts.join(" ") : "";

      if ((safetyDecision.level === "stop" || safetyDecision.level === "danger") && /^CHK-SAFE/.test(String(check.id || ""))) {
        score += 50;
      }
      if (caseState.strongestHypothesis &&
          caseState.strongestHypothesis.family &&
          factsList.indexOf(caseState.strongestHypothesis.family) >= 0) {
        score += 16;
      }
      if (caseState.dominantRisk === "isolamento" && /isolamento|megohm|pe|differenziale/.test(text)) score += 12;
      if (caseState.dominantRisk === "differenziale" && /differenziale|isolamento|carichi/.test(text)) score += 12;
      if (caseState.dominantRisk === "tensione" && /tensione|l-n|l-pe|neutro/.test(text)) score += 12;
      if (caseState.dominantRisk === "continuita" && /continuita|neutro|morsett|serraggio/.test(text)) score += 12;
      if (caseState.dominantRisk === "bruciato_fumo_odore" && /termica|temperatura|morsetti|assenza tensione/.test(text)) score += 12;

      caseState.unresolvedGaps.forEach(function (gap) {
        var token = normalize(String(gap || "")).split(/\s+/).filter(function (part) { return part.length > 4; })[0];
        if (token && text.indexOf(token) >= 0) score += 8;
      });

      return score;
    }

    return getCasePriority(b) - getCasePriority(a);
  });
  var rankedHypotheses = Array.isArray(ipotesi) ? ipotesi.slice() : [];
  var rankedDiagnosticChecks = Array.isArray(diagnosticChecks) ? diagnosticChecks.slice() : [];

  closedCaseLearning = safeGetClosedCaseLearningSignal({
    caseState: caseState,
    safetyDecision: safetyDecision,
    hypotheses: rankedHypotheses,
    diagnosticChecks: rankedDiagnosticChecks,
    normalizedFacts: facts
  });

  if (closedCaseLearning.applied) {
    rankedHypotheses = applyClosedCaseLearningToHypotheses(
      rankedHypotheses,
      closedCaseLearning
    );
    rankedDiagnosticChecks = applyClosedCaseLearningToDiagnosticChecks(
      rankedDiagnosticChecks,
      closedCaseLearning,
      safetyDecision
    );
  }

  ipotesi = rankedHypotheses;
  diagnosticChecks = rankedDiagnosticChecks;
  caseFingerprint = closedCaseLearning && closedCaseLearning.fingerprint
    ? closedCaseLearning.fingerprint
    : buildCaseFingerprint({
      caseState: caseState,
      safetyDecision: safetyDecision,
      hypotheses: ipotesi,
      diagnosticChecks: diagnosticChecks,
      normalizedFacts: facts
    });

  if (closedCaseLearning.applied) {
    causalGroups = groupHypothesesByCauseFamily(ipotesi);
    dominantCauseFamily = selectDominantCauseFamily(causalGroups, caseState);
    ipotesi = downgradeSiblingHypotheses(ipotesi, dominantCauseFamily);
    ipotesi.sort(function (a, b) { return b.deductionScore - a.deductionScore; });
    if (ipotesi.length) {
      var seenCauses = {};
      var currentStrongest = ipotesi[0];
      ipotesi = ipotesi.filter(function (hypothesis) {
        var duplicateCause = seenCauses[hypothesis.causa];
        var sameFamilyAsStrongest = currentStrongest.family && hypothesis.family === currentStrongest.family;
        var clearlyWeaker = currentStrongest.deductionScore - hypothesis.deductionScore >= 4;

        if (duplicateCause) return false;
        seenCauses[hypothesis.causa] = true;

        if (sameFamilyAsStrongest &&
            hypothesis.causa !== currentStrongest.causa &&
            currentStrongest.livello !== "non_verifiable" &&
            hypothesis.livello === "non_verifiable" &&
            clearlyWeaker) {
          return false;
        }

        return true;
      });
    }
    caseState = buildCaseState(facts, contradictions, ipotesi, safetyDecision, evidenceSet, causalInferenceResult);
    caseState.dominantCauseFamily = dominantCauseFamily;
    caseState.causalSummary = buildCausalSummary(dominantCauseFamily, ipotesi, caseState);
  }
  decisionPolicy = buildDecisionPolicy(caseState, safetyDecision, ipotesi, diagnosticChecks);
  diagnosticChecks = diagnosticChecks.filter(function (check) {
    var text = normalize(String(check.reason || ""));

    if (decisionPolicy.blockedActions.indexOf("prove sotto carico") >= 0 &&
        /sotto carico|durante il funzionamento|rilanciare|riattivare|quando accendo|corrente assorbita|pinza amperometrica|misura corrente/.test(text)) {
      return false;
    }
    if (decisionPolicy.blockedActions.indexOf("riarmo o riattivazione del circuito") >= 0 &&
        /rilanciare|riarm|riattiv/i.test(text)) {
      return false;
    }
    if (decisionPolicy.blockedActions.indexOf("prove sotto carico non essenziali") >= 0 &&
        /sotto carico|durante il funzionamento/.test(text) &&
        !/^disalimentare/.test(text)) {
      return false;
    }

    return true;
  });
  if (decisionPolicy.allowedNextStep) {
    diagnosticChecks.sort(function (a, b) {
      var aIsNext = a.reason === decisionPolicy.allowedNextStep ? 1 : 0;
      var bIsNext = b.reason === decisionPolicy.allowedNextStep ? 1 : 0;
      if (aIsNext !== bIsNext) return bIsNext - aIsNext;
      return (b.priority || 0) - (a.priority || 0);
    });
  }
  verifiche = diagnosticChecks.map(function (check) { return check.reason; });
  publicHypotheses = ipotesi.map(function (hypothesis) {
    var clean = Object.assign({}, hypothesis);
    delete clean.id;
    delete clean.causeKey;
    delete clean.causeLabel;
    delete clean.category;
    delete clean.level;
    delete clean.score;
    delete clean.confidence;
    delete clean.rank;
    delete clean.sourceType;
    delete clean.supportingFacts;
    delete clean.supportingSignals;
    delete clean.supportingConstraints;
    delete clean.contradictoryFacts;
    delete clean.missingCriticalFacts;
    delete clean.recommendedChecks;
    delete clean.blockedBySafety;
    delete clean.learningBoost;
    delete clean.rankScore;
    delete clean._rawScore;
    delete clean._sourceHints;
    delete clean._missingFacts;
    delete clean._strongContradictionCount;
    delete clean._causeFamily;
    return clean;
  });

  if (matchedKeywords.length) {
    osservazioni.push("Keyword tecniche rilevate: " + matchedKeywords.slice(0, 6).join(", ") + ".");
  }
  if (hasImage) {
    osservazioni.push("Immagine allegata: integrare le verifiche con lo stato visivo dei componenti.");
  }
  if (extractedValues.length) {
    osservazioni.push("Valori misurati rilevati: " + extractedValues.map(function (value) {
      return value.value + value.unit + " (" + value.type + ")";
    }).join(", ") + ".");
  }
  if (voltageAnomaly && voltageAnomaly.anomaly) {
    osservazioni.push(
      "Tensione misurata " + voltageAnomaly.measured + "V, " +
      voltageAnomaly.direction + " nominale " + voltageAnomaly.nominal + "V (" +
      voltageAnomaly.deviation + "%)."
    );
  }
  matchedComponents.forEach(function (entry) {
    osservazioni.push(
      "Componente riconosciuto [" + entry.component.id.toUpperCase() + "]: " +
      (entry.component.category ? entry.component.category : "categoria non dichiarata") + "."
    );
  });
  contradictions.forEach(function (contradiction) {
    osservazioni.push("CONTRADDIZIONE: " + contradiction.reason);
  });
  if (caseState.observedDomains.length > 1 || caseState.contradictions.length) {
    osservazioni.push("CASO: domini osservati " + caseState.observedDomains.join(", ") + ".");
  }
  if (closedCaseLearning && closedCaseLearning.applied && closedCaseLearning.totalMatchedClosedCases) {
    osservazioni.push("MEMORIA TECNICA: trovati " + closedCaseLearning.totalMatchedClosedCases + " casi simili validati.");
  }
  osservazioni.push("SAFETY: " + safetyDecision.level + " - " + safetyDecision.reasons[0]);
  if (decisionPolicy.immediateAction) {
    osservazioni.push("AZIONE IMMEDIATA: " + decisionPolicy.immediateAction);
  }
  publicHypotheses.slice(0, 3).forEach(function (item) {
    osservazioni.push("IPOTESI: [" + String(item.livello || "probable").toUpperCase() + "] " + item.causa);
  });

  extractedValues.forEach(function (value) {
    if (value.warning) {
      rischi.push("ANOMALIA RILEVATA: " + value.warning);
    }
  });
  safetyDecision.reasons.forEach(function (reason) {
    if (safetyDecision.level !== "safe" && rischi.indexOf(reason) < 0) {
      rischi.push(reason);
    }
  });
  scoredRules.forEach(function (entry) {
    if (entry.rule.risk_level === "high") {
      rischi.push("RISCHIO ALTO - " + entry.rule.title + ": " + String(entry.rule.rule || "").slice(0, 130));
    }
  });
  decisionPolicy.blockedActions.forEach(function (blockedAction) {
    var line = "AZIONE BLOCCATA: " + blockedAction;
    if (rischi.indexOf(line) < 0 && safetyDecision.level !== "safe") rischi.push(line);
  });
  if (isTechnical && !rischi.length) {
    rischi.push("Disalimentare e verificare assenza tensione con multimetro prima di aprire il quadro.");
  }

  if (!isTechnical) {
    conclusione = "Richiesta non tecnica: rispondere liberamente.";
  } else if (safetyDecision.level === "stop") {
    conclusione = "STOP - condizione pericolosa. Mettere in sicurezza e poi procedere con la diagnosi." +
      (caseState.causalSummary ? " " + caseState.causalSummary : "") +
      (decisionPolicy.allowedNextStep ? " Prossimo passo consentito: " + decisionPolicy.allowedNextStep : "");
  } else if (publicHypotheses.length) {
    conclusione = "Diagnosi tecnica strutturata disponibile." +
      (caseState.causalSummary ? " " + caseState.causalSummary : "") +
      (decisionPolicy.allowedNextStep ? " Prossimo passo: " + decisionPolicy.allowedNextStep + "." : "") +
      " Eseguire le verifiche prioritarie per confermare l'ipotesi principale.";
  } else {
    conclusione = "Domanda tecnica generica. Servono misure, foto e contesto per derivare ipotesi affidabili.";
  }

  finalDiag = validateDiagOutput({
    isTechnical: isTechnical,
    isDangerous: safetyDecision.level === "danger" || safetyDecision.level === "stop",
    matchedKeywords: matchedKeywords,
    matchedPatterns: scoredPatterns.map(function (entry) { return entry.pattern.id; }),
    matchedRules: scoredRules.map(function (entry) { return entry.rule.id; }),
    matchedComponents: matchedComponents.map(function (entry) { return entry.component.id; }),
    extractedValues: extractedValues,
    osservazioni: osservazioni,
    ipotesi: publicHypotheses,
    verifiche: verifiche.slice(0, 12),
    rischi: rischi,
    conclusione: conclusione
  });
  var internalState = {
    facts: facts,
    caseState: caseState,
    causalSummary: caseState.causalSummary,
    safetyDecision: safetyDecision,
    hypotheses: ipotesi,
    diagnosticChecks: diagnosticChecks,
    caseFingerprint: caseFingerprint,
    closedCaseLearning: closedCaseLearning,
    learningMeta: closedCaseLearning && closedCaseLearning.learningMeta ? closedCaseLearning.learningMeta : null
  };
  Object.defineProperty(internalState, "normalizedInput", {
    value: normalizedInput,
    enumerable: false
  });
  Object.defineProperty(internalState, "evidenceSet", {
    value: evidenceSet,
    enumerable: false
  });
  Object.defineProperty(internalState, "causalInferenceResult", {
    value: causalInferenceResult,
    enumerable: false
  });
  Object.defineProperty(finalDiag, "_roccoInternal", {
    value: internalState,
    enumerable: false
  });
  return finalDiag;
}

// ============================================================
// Formattazione contesto per LLM
// ============================================================
function formatDiagnosticContext(diag) {
  if (!diag || !diag.isTechnical) return "";

  var lines = ["[ROCCO ENGINE — PRE-ANALISI AUTOMATICA]"];

  if (diag.isDangerous) {
    lines.push("");
    lines.push("⚠️⚠️ CONDIZIONE PERICOLOSA — SICUREZZA PRIORITARIA ⚠️⚠️");
  }

  if (diag.extractedValues && diag.extractedValues.length) {
    lines.push("");
    lines.push("VALORI NUMERICI ESTRATTI DAL TESTO:");
    diag.extractedValues.forEach(function (v) {
      var s = "- " + v.value + v.unit + " (" + v.type + ")";
      if (v.warning) s += " ⚠️ " + v.warning;
      lines.push(s);
    });
  }

  if (diag.osservazioni.length) {
    lines.push("");
    lines.push("OSSERVAZIONI PRELIMINARI:");
    diag.osservazioni.forEach(function (o) { lines.push("- " + o); });
  }

  if (diag.ipotesi.length) {
    lines.push("");
    lines.push("IPOTESI (da confermare con misure):");
    diag.ipotesi.slice(0, 6).forEach(function (ip) {
      lines.push("- [" + ip.livello.toUpperCase() + "] " + ip.causa);
    });
  }

  if (diag.verifiche.length) {
    lines.push("");
    lines.push("VERIFICHE DA PROPORRE:");
    diag.verifiche.slice(0, 6).forEach(function (v) { lines.push("- " + v); });
  }

  if (diag.rischi.length) {
    lines.push("");
    lines.push("RISCHI / SICUREZZA:");
    diag.rischi.forEach(function (r) { lines.push("- " + r); });
  }

  lines.push("");
  lines.push("CONCLUSIONE ENGINE: " + diag.conclusione);
  lines.push("ISTRUZIONE: usa questa pre-analisi come base strutturale. Il formato obbligatorio della risposta è: OSSERVAZIONI / COMPONENTI COINVOLTI / IPOTESI / LIVELLO DI CERTEZZA / VERIFICHE OPERATIVE / RISCHI REALI / PROSSIMO PASSO.");

  return lines.join("\n");
}

// ============================================================
// Risposta offline (C) — usata quando tutti i provider LLM falliscono per rete
// ============================================================
function formatOfflineAnswer(diag, message) {
  var lines = [];

  // --- OSSERVAZIONI ---
  lines.push("OSSERVAZIONI:");
  if (diag.osservazioni.length) {
    diag.osservazioni.forEach(function (o) { lines.push("- " + o); });
  } else {
    lines.push("- Richiesta tecnica ricevuta (analisi locale — LLM non raggiungibile).");
  }

  // --- COMPONENTI COINVOLTI ---
  lines.push("");
  lines.push("COMPONENTI COINVOLTI:");
  if (diag.matchedKeywords.length) {
    lines.push("- " + diag.matchedKeywords.slice(0, 6).join(", ") + " (da keyword).");
  } else {
    lines.push("- Nessun componente specifico identificato automaticamente.");
  }

  // --- IPOTESI ---
  lines.push("");
  lines.push("IPOTESI:");
  if (diag.ipotesi.length) {
    diag.ipotesi.slice(0, 5).forEach(function (ip) {
      var badge = ip.livello === "non_verificabile" ? "DA_VERIFICARE" :
                  ip.livello === "confermato"       ? "CONFERMATO" : "PROBABILE";
      lines.push("- [" + badge + "] " + ip.causa);
    });
  } else {
    lines.push("- [DA_VERIFICARE] Dati insufficienti per formulare un'ipotesi precisa.");
    lines.push("  Fornire marca/modello, misure effettuate e foto del componente.");
  }

  // --- LIVELLO DI CERTEZZA ---
  lines.push("");
  lines.push("LIVELLO DI CERTEZZA:");
  if (diag.isDangerous) {
    lines.push("Probabile — condizione pericolosa rilevata, richiede conferma strumentale");
  } else if (diag.matchedPatterns.length >= 2 && diag.ipotesi.length >= 2) {
    lines.push("Probabile — pattern multipli identificati, misure necessarie per conferma");
  } else if (diag.matchedPatterns.length >= 1) {
    lines.push("Non verificabile — singolo pattern identificato, servono dati aggiuntivi");
  } else {
    lines.push("Non verificabile — analisi locale senza dati sufficienti");
  }

  // --- VERIFICHE OPERATIVE ---
  lines.push("");
  lines.push("VERIFICHE OPERATIVE:");
  if (diag.verifiche.length) {
    diag.verifiche.slice(0, 5).forEach(function (v, i) { lines.push((i + 1) + ") " + v); });
  } else {
    lines.push("1) Strumento: multimetro VAC — misurare tensione IN e OUT del differenziale.");
    lines.push("2) Strumento: megohmetro 500V — misurare isolamento cavi (valore atteso >1MΩ).");
    lines.push("3) Indicare marca/modello e cosa è già stato verificato.");
  }

  // --- RISCHI REALI ---
  lines.push("");
  lines.push("RISCHI REALI:");
  if (diag.rischi.length) {
    diag.rischi.slice(0, 3).forEach(function (r) { lines.push("- " + r); });
  } else {
    lines.push("- Disalimentare e verificare assenza tensione prima di qualsiasi intervento.");
  }

  // --- PROSSIMO PASSO ---
  lines.push("");
  lines.push("PROSSIMO PASSO:");
  if (diag.verifiche.length) {
    lines.push("- " + diag.verifiche[0]);
  } else {
    lines.push("- Inviare foto nitida del componente e indicare marca/modello.");
  }

  lines.push("");
  lines.push("⚠️ Nota: risposta generata localmente (motore ROCCO offline) — LLM non raggiungibile.");

  return lines.join("\n");
}

/**
 * T3: Valida l'output diagnostico prima di restituirlo.
 * Corregge campi mancanti e impone limiti ragionevoli.
 */
function validateDiagOutput(diag) {
  if (!diag) return {
    isTechnical: false, isDangerous: false,
    matchedKeywords: [], matchedPatterns: [], matchedRules: [], matchedComponents: [],
    extractedValues: [], osservazioni: [], ipotesi: [], verifiche: [], rischi: [],
    conclusione: "Nessun dato diagnostico prodotto."
  };
  // Assicura che tutti i campi array esistano
  var fields = ["matchedKeywords", "matchedPatterns", "matchedRules", "matchedComponents",
                "extractedValues", "osservazioni", "ipotesi", "verifiche", "rischi"];
  fields.forEach(function (f) {
    if (!Array.isArray(diag[f])) diag[f] = [];
  });
  // Limita lunghezze per evitare prompt troppo grandi
  diag.ipotesi = diag.ipotesi.slice(0, 8);
  diag.verifiche = diag.verifiche.slice(0, 12);
  diag.osservazioni = diag.osservazioni.slice(0, 10);
  diag.rischi = diag.rischi.slice(0, 6);
  if (!diag.conclusione) diag.conclusione = "Diagnosi incompleta.";
  return diag;
}

// ============================================================
// Test case per /api/engine/test
// ============================================================
var TEST_CASE = {
  message: "Ogni volta che premo il pulsante per accendere le luci esterne il differenziale scatta. Ho un rele che pilota il contattore KM1. La linea e 230V. Come faccio a capire la causa?",
  hasImage: false
};

module.exports = {
  analyzeTechnicalRequest: analyzeTechnicalRequest,
  recordClosedCaseLearning: recordClosedCaseLearning,
  formatDiagnosticContext: formatDiagnosticContext,
  formatOfflineAnswer:     formatOfflineAnswer,
  validateDiagOutput:      validateDiagOutput,
  TEST_CASE:               TEST_CASE
};


