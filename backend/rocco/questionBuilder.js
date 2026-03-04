"use strict";
/**
 * questionBuilder.js — genera domande mirate basate sui componenti riconosciuti.
 * Le domande vengono iniettate nel contesto del motore per aiutare il LLM
 * a chiedere le informazioni mancanti nel caso siano necessarie.
 * Max 3 domande per non sovraccaricare la risposta.
 */

var COMPONENT_QUESTIONS = {
  "pompa": [
    "Il contattore della pompa si chiude quando viene dato il comando?",
    "Hai tensione ai morsetti della pompa durante il tentativo di avvio?"
  ],
  "elettropompa": [
    "Il contattore della pompa si chiude quando viene dato il comando?",
    "Hai tensione ai morsetti della pompa durante il tentativo di avvio?"
  ],
  "galleggiante": [
    "Il galleggiante chiude il contatto nella posizione attuale (misura continuità)?",
    "Il galleggiante è libero di muoversi o è bloccato/avvolto?"
  ],
  "pressostato": [
    "Il pressostato chiude il contatto quando c'è pressione nel circuito (testa con multimetro)?",
    "Qual è la pressione di taratura del pressostato e qual è la pressione attuale?"
  ],
  "rcd": [
    "Il differenziale scatta immediatamente o dopo qualche secondo?",
    "Scatta sotto carico o anche a vuoto (nessun apparecchio collegato)?"
  ],
  "magnetotermico": [
    "Il magnetotermico scatta immediatamente (cortocircuito) o dopo qualche minuto (sovraccarico)?",
    "Quanti ampere ha il magnetotermico e qual è il carico collegato?"
  ],
  "contattore": [
    "Il contattore riceve il segnale di comando (misura tensione bobina A1-A2)?",
    "Senti il click del contattore quando dai il comando?"
  ],
  "inverter": [
    "Qual è esattamente il codice di errore visualizzato sull'inverter?",
    "Marca e modello dell'inverter/VFD?"
  ],
  "plc": [
    "Il PLC è in RUN o in STOP/FAULT?",
    "Ci sono LED di errore accesi sul PLC? Quali?"
  ],
  "motore": [
    "Quanto tempo fa ha funzionato normalmente l'ultima volta?",
    "Il motore ronza senza girare o è completamente silenzioso?"
  ],
  "timer": [
    "L'ora e il giorno visualizzati sul timer sono corretti?",
    "Forzando manualmente l'uscita (tasto bypass), l'utenza si accende?"
  ],
  "rele termico": [
    "Il relè termico (MTR) è scattato? (tasto di reset sporgente?)",
    "Qual è la taratura attuale del relè termico e la corrente nominale del motore?"
  ],
  "caldaia": [
    "Qual è il codice di errore sul display della caldaia?",
    "Marca e modello della caldaia?"
  ]
};

/**
 * Genera domande mirate in base ai componenti riconosciuti.
 * @param {string[]} components — array di ID componenti (da componentRecognizer)
 * @returns {string[]} — max 3 domande
 */
function buildQuestions(components) {
  if (!Array.isArray(components) || !components.length) return [];
  var seen = {};
  var result = [];

  for (var i = 0; i < components.length && result.length < 3; i++) {
    var comp = String(components[i] || "").toLowerCase();
    var questions = COMPONENT_QUESTIONS[comp];
    if (!questions) continue;
    // Prendi la prima domanda non ancora inserita per questo componente
    for (var j = 0; j < questions.length && result.length < 3; j++) {
      var q = questions[j];
      if (!seen[q]) {
        seen[q] = true;
        result.push(q);
        break; // una domanda per componente per non ripetere
      }
    }
  }

  return result;
}

module.exports = { buildQuestions: buildQuestions };
