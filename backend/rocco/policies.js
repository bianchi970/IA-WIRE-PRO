"use strict";

module.exports = {
  TECH_REPORT_SECTIONS: [
    "OSSERVAZIONI",
    "COMPONENTI RICONOSCIUTI",
    "IPOTESI",
    "VERIFICHE SUL CAMPO",
    "RISCHI / SICUREZZA",
    "NEXT STEP"
  ],

  CONFIDENCE_LEVELS: ["Confermato", "Probabile", "Non verificabile"],

  HARD_SAFETY_RULES: [
    "Non suggerire mai di bypassare, ponticellare o rimuovere protezioni (RCD/MT/fusibili).",
    "Non suggerire mai di scollegare la terra o neutralizzare il differenziale.",
    "Se mancano dati critici, dichiarare 'Non verificabile' e chiedere misure o foto.",
    "Per lavori elettrici: togliere alimentazione e verificare assenza tensione prima di aprire quadri.",
    "Se rischio imminente (odore bruciato, scintille, cavi anneriti, acqua vicino a tensione): fermare e chiamare tecnico sul posto."
  ],

  GOLDEN_RULES: [
    "Regola d’oro: misurare sempre IN e OUT di ogni protezione e verificare sotto carico.",
    "Se leggi tensione ma il circuito non si eccita: sospetta tensione di ritorno o flottante e verifica con carico."
  ]
};