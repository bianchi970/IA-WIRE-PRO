"use strict";
/**
 * lexicon.js — traduzione degli identificatori interni in italiano tecnico.
 *
 * Il motore deterministico lavora con slug (rcd_trip, voltage_nominal, rcd-ac-2p).
 * Questi slug NON devono mai arrivare all'utente. Qui stanno le etichette umane.
 *
 * Usato da: response_formatter.js, narrator.js, orchestrator.js (formatResponse)
 */

// ── Componenti (id da knowledge/components.json — 50 voci, 1 per categoria) ──
var COMPONENT_LABELS = {
  "mcb-curva-c": "magnetotermico curva C",
  "mccb-potenza": "interruttore scatolato di potenza",
  "rcd-ac-2p": "differenziale bipolare tipo AC",
  "rcbo-combinato": "magnetotermico differenziale (RCBO)",
  "fusibile-cilindrico": "fusibile cilindrico",
  "sezionatore-portafusibile": "sezionatore portafusibile",
  "interruttore-sezionatore": "interruttore sezionatore",
  "spd-scaricatore": "scaricatore di sovratensione (SPD)",
  "contactor-ac": "contattore",
  "rele-termico": "relè termico di sovraccarico",
  "salvamotore": "salvamotore",
  "relay-24vdc": "relè 24 Vdc",
  "timer-relay": "relè temporizzatore",
  "rele-monitoraggio": "relè di monitoraggio",
  "rele-sicurezza": "relè di sicurezza",
  "motor-3phase": "motore trifase",
  "inverter-vfd": "inverter (VFD)",
  "soft-starter": "soft starter",
  "pompa-circolatore": "pompa di circolazione",
  "pompa-calore": "pompa di calore",
  "caldaia-riscaldamento": "caldaia",
  "valvola-motorizzata": "valvola motorizzata",
  "pressostato": "pressostato",
  "sonda-temperatura": "sonda di temperatura",
  "limit-switch": "finecorsa",
  "sensore-pir": "sensore di movimento PIR",
  "interruttore-crepuscolare": "interruttore crepuscolare",
  "dimmer": "dimmer",
  "quadro-distribuzione": "quadro di distribuzione",
  "busbar-pettine": "barra di distribuzione (pettine)",
  "terminal-block": "morsettiera",
  "enclosure-ip": "cassetta/custodia IP",
  "alimentatore-24vdc": "alimentatore 24 Vdc",
  "trasformatore-24v": "trasformatore 24 V",
  "trasformatore-corrente": "trasformatore di corrente (TA)",
  "contatore-energia": "contatore di energia",
  "analizzatore-rete": "analizzatore di rete",
  "inverter-fotovoltaico": "inverter fotovoltaico",
  "batteria-accumulo": "batteria di accumulo",
  "ups-batteria": "UPS",
  "gruppo-elettrogeno": "gruppo elettrogeno",
  "ats-commutatore": "commutatore automatico (ATS)",
  "wallbox-ev": "wallbox per veicoli elettrici",
  "plc-generica": "PLC",
  "pulsante-comando": "pulsante di comando",
  "pulsante-emergenza": "pulsante di emergenza",
  "selettore-rotativo": "selettore rotativo",
  "lampada-spia": "lampada spia",
  "sirena-cicalino": "sirena/cicalino",
  "colonna-luminosa": "colonna luminosa"
};

// ── Stati osservati (normalizeObservedStates in engine/diagnosticEngine.js) ──
var STATE_LABELS = {
  danger_keyword: "segnalati fumo, scintille o scossa",
  rcd_trip: "il differenziale scatta",
  mcb_trip: "il magnetotermico scatta",
  mcb_trip_instant: "lo scatto è istantaneo",
  mcb_trip_delayed: "lo scatto avviene con ritardo",
  burn_signs: "odore o segni di bruciato",
  darkened: "conduttore o morsetto annerito",
  trips_no_load: "scatta anche a vuoto, senza carichi",
  under_load: "il difetto si presenta sotto carico",
  appliance_mentioned: "coinvolto un elettrodomestico",
  old_install: "impianto vecchio o deteriorato",
  new_install: "impianto nuovo o appena rifatto",
  moisture: "presenza di umidità o acqua",
  outdoor: "parte dell'impianto all'esterno",
  dry: "ambiente asciutto",
  terminal_reference: "morsetti citati come sospetti",
  heavy_load: "carico elevato o più utenze insieme",
  light_load: "carico leggero",
  long_run: "linea lunga o prolunga",
  neutral_reference: "neutro citato o sbilanciamento",
  zone_wide: "problema esteso a più utenze o alla zona",
  only_me: "problema limitato a questa utenza",
  flickering: "sbalzi o sfarfallio",
  sensitive_electronic_load: "presente un carico elettronico sensibile",
  load_circuit_mismatch: "carico non compatibile con la linea"
};

// ── Fatti di evidenza (createEvidenceFact in engine/diagnosticEngine.js) ──
var FACT_LABELS = {
  technical_request: "richiesta tecnica riconosciuta",
  has_image: "fornita una foto dell'impianto",
  mentions_measure: "citata una misura strumentale",
  mentions_voltage: "citata una tensione",
  mentions_rcd: "citato il differenziale",
  mentions_outdoor: "citata una parte esterna dell'impianto",
  voltage_nominal: "tensione nel range nominale",
  voltage_anomaly: "tensione fuori range",
  no_voltage_claim: "dichiarata assenza di tensione",
  device_off_claim: "dichiarato dispositivo spento",
  isolation_low: "isolamento verso terra basso",
  isolation_high: "isolamento verso terra regolare",
  high_current: "corrente elevata rilevata",
  temperature_high: "temperatura elevata rilevata",
  plant_type: "tipo di impianto identificato"
};

// ── Grandezze misurate (numericRecognizer + measurements del case_state) ──
var MEASURE_LABELS = {
  tensione: "tensione",
  voltage: "tensione",
  corrente: "corrente",
  current: "corrente",
  differential: "corrente differenziale",
  differenziale: "corrente differenziale",
  resistance: "resistenza",
  resistenza: "resistenza",
  isolamento: "resistenza di isolamento",
  power: "potenza",
  potenza: "potenza",
  temperature: "temperatura",
  temperatura: "temperatura",
  pressure: "pressione",
  pressione: "pressione",
  tempo: "tempo",
  ip: "grado di protezione IP"
};

// ── Livello di certezza ──
var CERT_LABELS = {
  confirmed: "CONFERMATO",
  probable: "PROBABILE",
  non_verifiable: "DA VERIFICARE"
};

// ── Livello di sicurezza ──
var SAFETY_LABELS = {
  stop: "STOP — intervento non sicuro senza messa fuori tensione",
  attention: "ATTENZIONE — procedere con cautela",
  normal: "normale"
};

var MACHINE_TOKEN = /^[a-z0-9]+([_\-][a-z0-9]+)*$/;

function s(v) { return String(v == null ? "" : v).trim(); }

/**
 * true se il token è uno slug interno (una sola parola, minuscola, con _ o -).
 * Non considera slug le frasi (contengono spazi) né il testo con maiuscole.
 */
function isMachineToken(value) {
  var t = s(value);
  if (!t || /\s/.test(t)) return false;
  return MACHINE_TOKEN.test(t);
}

/**
 * Traduce uno slug in italiano tecnico. Se non è uno slug lo restituisce intatto.
 * Fallback: separatori → spazi (mai lo slug grezzo).
 */
function humanize(value) {
  var t = s(value);
  if (!t) return "";
  var key = t.toLowerCase();

  if (COMPONENT_LABELS[key]) return COMPONENT_LABELS[key];
  if (STATE_LABELS[key]) return STATE_LABELS[key];
  if (FACT_LABELS[key]) return FACT_LABELS[key];
  if (MEASURE_LABELS[key]) return MEASURE_LABELS[key];

  // domain_<nome> → "dominio <nome>"
  if (key.indexOf("domain_") === 0) return "dominio " + key.slice(7).replace(/[_\-]+/g, " ");

  if (!isMachineToken(t)) return t;
  return key.replace(/[_\-]+/g, " ");
}

function humanizeComponent(value) {
  var t = s(value);
  if (!t) return "";
  return COMPONENT_LABELS[t.toLowerCase()] || humanize(t);
}

function humanizeComponents(list) {
  return (Array.isArray(list) ? list : []).map(humanizeComponent).filter(Boolean);
}

/**
 * Riordina e traduce facts_confirmed per l'utente.
 *
 * Il motore accoda prima gli slug grezzi e poi le frasi leggibili: con un
 * semplice slice(0,6) all'utente arrivavano SOLO gli slug. Qui le frasi
 * complete hanno priorità, gli slug tradotti riempiono lo spazio restante.
 */
// Righe che il motore diagnostico si scrive per sé.
//
// `facts_confirmed` riceve anche le `osservazioni` del motore
// (case_state.js: toolResult.evidence), e cleanFacts dà priorità alle frasi
// sugli slug: queste righe sono frasi, quindi occupavano tutti i posti di
// OSSERVAZIONI e spingevano fuori i fatti veri. L'elettricista leggeva
// "Keyword tecniche rilevate: misura, megohmetro", "SAFETY: safe",
// "AZIONE IMMEDIATA: procedere con il prossimo passo tecnico".
//
// Il criterio: si scarta la contabilità interna e ciò che duplica un'altra
// sezione del referto (SAFETY → RISCHI REALI, AZIONE IMMEDIATA → PROSSIMO
// PASSO, IPOTESI → IPOTESI). Resta quel che afferma un fatto sull'impianto,
// come "Valori misurati rilevati" o "CONTRADDIZIONE".
var ENGINE_INTERNAL_PREFIXES = [
  "keyword tecniche rilevate",
  "caso: domini osservati",
  "memoria tecnica:",
  "safety:",
  "azione immediata:",
  "ipotesi:"
];

function isEngineInternal(text) {
  var t = s(text).toLowerCase();
  return ENGINE_INTERNAL_PREFIXES.some(function (p) { return t.indexOf(p) === 0; });
}

function cleanFacts(facts, limit) {
  var max = typeof limit === "number" && limit > 0 ? limit : 6;
  var sentences = [];
  var tokens = [];
  var seen = {};

  (Array.isArray(facts) ? facts : []).forEach(function (item) {
    var t = s(item);
    if (!t) return;
    if (isEngineInternal(t)) return;
    if (isMachineToken(t)) tokens.push(t);
    else sentences.push(t);
  });

  return sentences.concat(tokens.map(humanize)).filter(function (t) {
    var k = t.toLowerCase();
    if (!t || seen[k]) return false;
    seen[k] = true;
    return true;
  }).slice(0, max);
}

function certaintyLabel(value) {
  return CERT_LABELS[s(value).toLowerCase()] || "DA VERIFICARE";
}

function safetyLabel(value) {
  return SAFETY_LABELS[s(value).toLowerCase()] || s(value);
}

module.exports = {
  COMPONENT_LABELS: COMPONENT_LABELS,
  STATE_LABELS: STATE_LABELS,
  FACT_LABELS: FACT_LABELS,
  MEASURE_LABELS: MEASURE_LABELS,
  CERT_LABELS: CERT_LABELS,
  SAFETY_LABELS: SAFETY_LABELS,
  isMachineToken: isMachineToken,
  humanize: humanize,
  humanizeComponent: humanizeComponent,
  humanizeComponents: humanizeComponents,
  cleanFacts: cleanFacts,
  isEngineInternal: isEngineInternal,
  ENGINE_INTERNAL_PREFIXES: ENGINE_INTERNAL_PREFIXES,
  certaintyLabel: certaintyLabel,
  safetyLabel: safetyLabel
};
