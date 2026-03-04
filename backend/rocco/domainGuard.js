"use strict";
/**
 * domainGuard.js — blocca richieste fuori dominio BT civile/industriale.
 * IA Wire Pro gestisce SOLO impianti BT (230/400V).
 * MT/AT (cabine, trasformatori di potenza) → fuori scope.
 */

var OUT_OF_SCOPE_KEYWORDS = [
  "media tensione",
  "alta tensione",
  "cabina elettrica",
  "cabina mt",
  "cabina at",
  "20kv",
  "15kv",
  "10kv",
  "132kv",
  "380kv",
  "trasformatore di potenza",
  "trasformatore mt",
  "trasformatore at",
  "impianto mt",
  "impianto at",
  "linea aerea mt",
  "linea aerea at",
  "cella mt",
  "interruttore mt",
  "sezionatore mt"
];

/**
 * Controlla se il testo richiede competenze MT/AT fuori dal dominio BT.
 * @param {string} text
 * @returns {boolean} true se fuori scope
 */
function isOutOfScope(text) {
  var t = String(text || "").toLowerCase();
  for (var i = 0; i < OUT_OF_SCOPE_KEYWORDS.length; i++) {
    if (t.indexOf(OUT_OF_SCOPE_KEYWORDS[i]) >= 0) return true;
  }
  return false;
}

/**
 * Risposta standard per richieste fuori dominio.
 * @returns {object}
 */
function outOfScopeResponse() {
  return {
    observations: ["Richiesta relativa a impianti MT/AT — fuori dal dominio BT di IA Wire Pro"],
    hypotheses: [
      { text: "Caso relativo a Media Tensione o Alta Tensione — non gestito da IA Wire Pro BT", certainty: "ALTA" }
    ],
    checks: ["Richiedere un tecnico abilitato ai lavori sotto tensione MT/AT (CEI 11-27, PES/PAV)"],
    risks: [
      "Rischio elettrico elevato: MT/AT richiedono misure di sicurezza specialistiche e dispositivi di protezione specifici"
    ],
    questions: []
  };
}

module.exports = { isOutOfScope: isOutOfScope, outOfScopeResponse: outOfScopeResponse };
