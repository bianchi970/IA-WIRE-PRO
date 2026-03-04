"use strict";

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
  "wallbox", "ricarica", "auto elettrica"
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
function extractNumericValues(text) {
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
  "non chiude":      "eccita"
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
  ["contattore",    "eccita"]
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
  if (s.indexOf("non verificabile") >= 0) return "non_verificabile";
  if (s.indexOf("confermato") >= 0)       return "confermato";
  return "probabile";
}

/**
 * Mappa likely_causes → ipotesi con livello.
 * confidence_logic[i] → livello per likely_causes[i] se disponibile, altrimenti default.
 * Per default tutte le cause sono "probabile" (senza misure non si può confermare).
 */
function buildIpotesiFromPattern(pattern) {
  var causes  = Array.isArray(pattern.likely_causes) ? pattern.likely_causes : [pattern.symptom];
  var logics  = Array.isArray(pattern.confidence_logic) ? pattern.confidence_logic : [];

  return causes.map(function (causa, idx) {
    var livello = "probabile"; // default: senza misure non si conferma nulla
    if (logics[idx]) {
      var parsed = parseLivello(logics[idx]);
      // "confermato" nel confidence_logic descrive la condizione di conferma, NON lo stato attuale.
      // Quindi lo usiamo solo se è "non_verificabile" (indica un limite reale).
      if (parsed === "non_verificabile") livello = "non_verificabile";
    }
    return { causa: String(causa), livello: livello };
  });
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
  var lower    = normalize(message);
  var tokens   = tokenize(message);

  // --- Estrazione numerica ---
  var extractedValues = extractNumericValues(message);
  var hasIsolationFault = extractedValues.some(function (v) {
    return v.type === "isolamento" && v.value < 1;
  });
  var hasAbnormalTemp = extractedValues.some(function (v) {
    return v.type === "temperatura" && v.value > 80;
  });
  var hasAbnormalVoltage = extractedValues.some(function (v) {
    return v.type === "tensione" && v.warning;
  });

  // --- Rilevazione dominio ---
  var isTechnical    = containsAny(lower, TECH_KEYWORDS) || extractedValues.length > 0;
  var isDangerous    = containsAny(lower, DANGER_KEYWORDS) || hasAbnormalTemp;
  var mentionsVoltage  = containsAny(lower, VOLTAGE_KEYWORDS) || extractedValues.some(function(v){ return v.type==="tensione"; });
  var mentionsRCD      = containsAny(lower, RCD_KEYWORDS) || hasIsolationFault;
  var mentionsOutdoor  = containsAny(lower, OUTDOOR_KEYWORDS);
  var mentionsMeasure  = containsAny(lower, MEASUREMENT_WORDS) || extractedValues.length > 0;

  var matchedKeywords = findMatches(message, TECH_KEYWORDS);

  // --- Score boost da valori anomali ---
  // Se isolamento < 1MΩ → boost pattern dispersione/isolamento
  // Se temperatura > 80°C → boost pattern surriscaldamento
  // (i boost vengono sommati in scorePatternMatch via PAIR_BOOSTS già esistenti;
  //  qui estendiamo i token query con tag sintetici per far scattare quei boost)
  if (hasIsolationFault) tokens.push("dispersione", "isolamento", "guasto");
  if (hasAbnormalTemp)   tokens.push("surriscaldamento", "termico", "caldo");

  // --- A) Pattern matching completo sui JSON ---
  var patterns = (knowledge && Array.isArray(knowledge.failurePatterns)) ? knowledge.failurePatterns : [];
  var scoredPatterns = patterns
    .map(function (p) { return { pattern: p, score: scorePatternMatch(p, lower, tokens) }; })
    .filter(function (x) { return x.score >= MATCH_THRESHOLD; })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 3);

  // --- A2) Component matching dai components.json ---
  var components = (knowledge && Array.isArray(knowledge.components)) ? knowledge.components : [];
  var matchedComponents = components
    .map(function (c) { return { component: c, score: scoreComponentMatch(c, lower, tokens) }; })
    .filter(function (x) { return x.score >= 2; })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 3);

  // --- B) Rule matching ---
  var rules = (knowledge && Array.isArray(knowledge.protectionRules)) ? knowledge.protectionRules : [];
  var scoredRules = rules
    .map(function (r) { return { rule: r, score: scoreRuleMatch(r, lower, tokens) }; })
    .filter(function (x) { return x.score >= MATCH_THRESHOLD; })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 3);

  // Regole LOTO obbligatorie se outdoor/RCD menzionati (sempre high-risk)
  if (mentionsOutdoor || mentionsRCD || isDangerous) {
    var lotoRule = rules.filter(function (r) { return r.id === "PR-02" || r.id === "SP-01"; });
    lotoRule.forEach(function (r) {
      if (!scoredRules.find(function (x) { return x.rule.id === r.id; })) {
        scoredRules.push({ rule: r, score: MATCH_THRESHOLD });
      }
    });
  }

  // --- Build output ---
  var osservazioni = [];
  var ipotesi      = [];
  var verifiche    = [];
  var rischi       = [];

  // Osservazioni
  if (matchedKeywords.length) {
    osservazioni.push("Keyword tecniche rilevate: " + matchedKeywords.slice(0, 6).join(", ") + ".");
  }
  if (hasImage)         osservazioni.push("Immagine allegata: analizzare i componenti visibili e il loro stato.");
  if (isDangerous)      osservazioni.push("ATTENZIONE: segnalati elementi pericolosi (bruciato/fumo/scintille).");
  if (mentionsRCD)      osservazioni.push("RCD/differenziale menzionato: richiesta verifica dispersione e isolamento.");
  if (mentionsOutdoor)  osservazioni.push("Cassetta/quadro esterno menzionato: richiesta valutazione IP e sigillatura.");
  if (mentionsMeasure)  osservazioni.push("Richiesta di misura elettrica: indicare strumenti e punti di misura.");

  // Valori numerici estratti dal testo
  if (extractedValues.length) {
    var valStr = extractedValues.map(function (v) {
      return v.value + v.unit + " (" + v.type + ")";
    }).join(", ");
    osservazioni.push("Valori misurati rilevati nel testo: " + valStr + ".");
  }
  // Warning anomalie nei rischi
  extractedValues.forEach(function (v) {
    if (v.warning) {
      rischi.unshift("⚠️ ANOMALIA RILEVATA: " + v.warning);
    }
  });

  // Componenti riconosciuti dalla knowledge base — con livello di certezza basato sul score
  matchedComponents.forEach(function (x) {
    var cert = x.score >= 8 ? "CONFERMATO" : x.score >= 4 ? "PROBABILE" : "POSSIBILE";
    osservazioni.push(
      "Componente riconosciuto [" + cert + "]: " + x.component.id.toUpperCase() +
      (x.component.category ? " (" + x.component.category + ")" : "") + "."
    );
  });

  // Pattern osservazioni + ipotesi
  scoredPatterns.forEach(function (x) {
    var p = x.pattern;
    console.log("ROCCO: JSON pattern matched ->", p.id, "(score=" + x.score + ")");
    osservazioni.push("Pattern identificato: " + p.symptom);
    buildIpotesiFromPattern(p).forEach(function (ip) { ipotesi.push(ip); });
  });

  // Field checks dai componenti riconosciuti (prime 2 per componente, max 2 componenti)
  matchedComponents.slice(0, 2).forEach(function (x) {
    var checks = Array.isArray(x.component.field_checks) ? x.component.field_checks : [];
    checks.slice(0, 2).forEach(function (c) {
      if (verifiche.indexOf(c) < 0) verifiche.push(c);
    });
  });

  // Verifiche mandatory da dominio
  if (mentionsVoltage) {
    verifiche.push("OBBLIGATORIA: misurare tensione IN e OUT di ogni protezione sotto carico (multimetro VAC).");
  }
  if (mentionsRCD) {
    verifiche.push("OBBLIGATORIA: misurare isolamento cavi con megohmetro 500V DC (>1MΩ richiesto).");
    verifiche.push("Verificare che N e PE non siano uniti a valle del nodo equipotenziale principale.");
  }
  if (mentionsOutdoor) {
    verifiche.push("Verificare integrità guarnizione perimetrale (elastica, continua, compressa).");
    verifiche.push("Verificare serraggio pressacavi e presenza coperchi ciechi su fori non usati.");
  }

  // Verifiche dai pattern (checks)
  scoredPatterns.forEach(function (x) {
    var checks = Array.isArray(x.pattern.checks) ? x.pattern.checks : [];
    checks.slice(0, 4).forEach(function (c) {
      if (verifiche.indexOf(c) < 0) verifiche.push(c);
    });
  });

  // Verifiche dalle regole (verification_steps)
  scoredRules.forEach(function (x) {
    var steps = Array.isArray(x.rule.verification_steps) ? x.rule.verification_steps : [];
    steps.slice(0, 2).forEach(function (s) {
      if (verifiche.indexOf(s) < 0) verifiche.push(s);
    });
  });

  // Rischi
  if (isDangerous) {
    rischi.push("PERICOLO IMMEDIATO: disalimentare prima di qualsiasi intervento. Attendere 5 minuti.");
    rischi.push("Non riaprire finché l'odore di bruciato non è scomparso.");
  }
  scoredRules.forEach(function (x) {
    if (x.rule.risk_level === "high") {
      rischi.push("RISCHIO ALTO — " + x.rule.title + ": " + String(x.rule.rule || "").slice(0, 130));
    }
  });
  // Safety protocols LOTO sempre per interventi tecnici
  if (isTechnical && !rischi.length) {
    rischi.push("Disalimentare e verificare assenza tensione con multimetro prima di aprire il quadro.");
  }

  // Conclusione
  var conclusione;
  if (!isTechnical) {
    conclusione = "Richiesta non tecnica: rispondere liberamente.";
  } else if (isDangerous) {
    conclusione = "STOP — condizione pericolosa. Sicurezza prima della diagnosi.";
  } else if (scoredPatterns.length) {
    conclusione = scoredPatterns.length + " pattern di guasto identificati (JSON). Guidare l'utente nelle verifiche sequenziali.";
  } else {
    conclusione = "Domanda tecnica generica. Richiedere dati specifici: marca/modello, misure, foto.";
  }

  return {
    isTechnical:        isTechnical,
    isDangerous:        isDangerous,
    matchedKeywords:    matchedKeywords,
    matchedPatterns:    scoredPatterns.map(function (x) { return x.pattern.id; }),
    matchedRules:       scoredRules.map(function (x) { return x.rule.id; }),
    matchedComponents:  matchedComponents.map(function (x) { return x.component.id; }),
    extractedValues:    extractedValues,
    osservazioni:       osservazioni,
    ipotesi:            ipotesi,
    verifiche:          verifiche.slice(0, 12),
    rischi:             rischi,
    conclusione:        conclusione
  };
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

// ============================================================
// Test case per /api/engine/test
// ============================================================
var TEST_CASE = {
  message: "Ogni volta che premo il pulsante per accendere le luci esterne il differenziale scatta. Ho un rele che pilota il contattore KM1. La linea e 230V. Come faccio a capire la causa?",
  hasImage: false
};

module.exports = {
  analyzeTechnicalRequest: analyzeTechnicalRequest,
  formatDiagnosticContext: formatDiagnosticContext,
  formatOfflineAnswer:     formatOfflineAnswer,
  TEST_CASE:               TEST_CASE
};
