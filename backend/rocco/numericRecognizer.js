"use strict";

/**
 * Numeric Validation Engine — T4
 * Estrae valori elettrici/tecnici dal testo dell'utente in forma strutturata.
 * Complementa extractNumericValues() nel diagnosticEngine (che produce warnings).
 * Questo modulo produce output strutturato per il contesto LLM.
 */

/**
 * Estrae valori elettrici/tecnici dal testo utente.
 * @param {string} text
 * @returns {{ voltage: string[], current: string[], differential: string[], resistance: string[], power: string[], ip: string[], temperature: string[], pressure: string[] }}
 */
function extractElectricalValues(text) {
  if (!text) return { voltage: [], current: [], differential: [], resistance: [], power: [], ip: [], temperature: [], pressure: [] };

  var values = {
    voltage:      [],
    current:      [],
    differential: [],
    resistance:   [],
    power:        [],
    ip:           [],
    temperature:  [],
    pressure:     []
  };

  var t = String(text);

  // Tensione: 230V, 400V, 24V, 48V, 12V, 380V + kV per MT/AT (6kV, 15kV, 20kV, 35kV)
  var vRe = /\b(\d{1,4})\s?k?[Vv]\b/g;
  var m;
  while ((m = vRe.exec(t)) !== null) { values.voltage.push(m[0].trim()); }

  // Corrente in Ampere: 16A, 25A, 6A, 100A, ecc. (no mA qui)
  var aRe = /\b(\d{1,4})\s?[Aa]\b(?!\s?[Cc])/g; // evita 'AC'
  while ((m = aRe.exec(t)) !== null) { values.current.push(m[0].trim()); }

  // Corrente differenziale: 30mA, 300mA, 10mA, 100mA
  var mARe = /\b(\d{1,4})\s?m[Aa]\b/g;
  while ((m = mARe.exec(t)) !== null) { values.differential.push(m[0].trim()); }

  // Resistenza/isolamento: MΩ, kΩ, Ω
  var rRe = /\b(\d+(?:[.,]\d+)?)\s?[MmKk]?[ΩΩ]|(\d+(?:[.,]\d+)?)\s?[Mm][Oo]hm|(\d+(?:[.,]\d+)?)\s?[Mm][Gg]ohm/g;
  while ((m = rRe.exec(t)) !== null) { values.resistance.push(m[0].trim()); }

  // Potenza: kW, W
  var pRe = /\b(\d+(?:[.,]\d+)?)\s?k?[Ww]\b/g;
  while ((m = pRe.exec(t)) !== null) { values.power.push(m[0].trim()); }

  // IP rating: IP44, IP65, IP67, IP20, ecc.
  var ipRe = /\bIP\s?(\d{2})\b/gi;
  while ((m = ipRe.exec(t)) !== null) { values.ip.push(m[0].toUpperCase().replace(/\s/, "")); }

  // Temperatura: 80°C, 40°C
  var tRe = /\b(\d{1,3})\s?°\s?[Cc]\b/g;
  while ((m = tRe.exec(t)) !== null) { values.temperature.push(m[0].trim()); }

  // Pressione: bar
  var pbarRe = /\b(\d+(?:[.,]\d+)?)\s?bar\b/gi;
  while ((m = pbarRe.exec(t)) !== null) { values.pressure.push(m[0].trim()); }

  // Deduplicazione
  for (var key in values) {
    var seen = {};
    values[key] = values[key].filter(function (v) {
      var k = v.toLowerCase();
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  return values;
}

/**
 * Formatta i valori estratti in una stringa leggibile per l'LLM.
 * @param {ReturnType<extractElectricalValues>} vals
 * @returns {string}
 */
function formatElectricalValues(vals) {
  var parts = [];
  if (vals.voltage.length)      parts.push("Tensioni: " + vals.voltage.join(", "));
  if (vals.current.length)      parts.push("Correnti: " + vals.current.join(", "));
  if (vals.differential.length) parts.push("Soglie diff.: " + vals.differential.join(", "));
  if (vals.resistance.length)   parts.push("Resistenze: " + vals.resistance.join(", "));
  if (vals.power.length)        parts.push("Potenze: " + vals.power.join(", "));
  if (vals.ip.length)           parts.push("IP rating: " + vals.ip.join(", "));
  if (vals.temperature.length)  parts.push("Temperature: " + vals.temperature.join(", "));
  if (vals.pressure.length)     parts.push("Pressioni: " + vals.pressure.join(", "));
  return parts.join(" | ");
}

/**
 * Verifica anomalie sui valori estratti (returns array di warning).
 * @param {ReturnType<extractElectricalValues>} vals
 * @returns {string[]}
 */
function checkAnomalies(vals) {
  var warnings = [];

  // Tensioni fuori range BT (120-500V)
  vals.voltage.forEach(function (v) {
    var isKV = /kv/i.test(v);
    var num = parseFloat(v.replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) {
      if (isKV) {
        warnings.push("Tensione MT/AT rilevata: " + v + " — intervento SOLO con abilitazione specifica (CEI 11-27 PES/PAV)");
      } else if (num > 0 && num < 12) {
        warnings.push("Tensione molto bassa: " + v + " (SELV/DC — verificare la tipologia)");
      } else if (num > 500) {
        warnings.push("Tensione elevata rilevata: " + v + " — verificare se BT o MT");
      }
    }
  });

  // Soglie differenziale fuori standard
  vals.differential.forEach(function (v) {
    var num = parseFloat(v.replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) {
      if (num < 10) warnings.push("Soglia differenziale " + v + " molto bassa — possibili scatti intempestivi");
      if (num > 300) warnings.push("Soglia differenziale " + v + " — non idonea per protezione personale (max 30mA)");
    }
  });

  return warnings;
}

module.exports = { extractElectricalValues, formatElectricalValues, checkAnomalies };
