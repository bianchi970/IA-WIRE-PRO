"use strict";

module.exports = {
  // Sezioni obbligatorie nell’ordine esatto
  TECH_REPORT_SECTIONS: [
    "OSSERVAZIONI",
    "COMPONENTI COINVOLTI",
    "IPOTESI",
    "VERIFICHE OPERATIVE",
    "RISCHI REALI",
    "PROSSIMO PASSO"
  ],

  // Prefissi livello certezza da usare dentro IPOTESI
  CONFIDENCE_LEVELS: ["CONFERMATO", "PROBABILE", "DA_VERIFICARE"],

  HARD_SAFETY_RULES: [
    "Non suggerire mai di bypassare, ponticellare o rimuovere protezioni (RCD/MT/fusibili).",
    "Non suggerire mai di scollegare la terra o neutralizzare il differenziale.",
    "Se mancano dati critici, scrivere esattamente: ‘DATI INSUFFICIENTI — servono: ...’ e chiedere massimo 2 informazioni precise.",
    "Per lavori elettrici: togliere alimentazione e verificare assenza tensione prima di aprire quadri.",
    "Se rischio imminente (odore bruciato, scintille, cavi anneriti, acqua vicino a tensione): fermare e chiamare tecnico sul posto."
  ],

  GOLDEN_RULES: [
    "Regola d’oro: misurare sempre IN e OUT di ogni protezione e verificare sotto carico.",
    "Se leggi tensione ma il circuito non si eccita: sospetta tensione di ritorno o flottante e verifica con carico.",
    "VERIFICHE OPERATIVE: ogni passo deve indicare strumento (es. multimetro, pinza amperometrica, megohmetro), punto di misura esatto e valore atteso.",
    "OSSERVAZIONI: solo fatti presenti nel testo o visibili nella foto. Zero inferenze.",
    "COMPONENTI COINVOLTI: solo quelli citati dall’utente o visibili nell’immagine.",
    "RISCHI REALI: massimo 3 righe, solo rischi concreti per questo caso specifico.",
    "PROSSIMO PASSO: una sola azione concreta da fare adesso, non una lista."
  ],

  // Frasi vietate — la risposta non deve mai contenerle
  BANNED_PHRASES: [
    "potrebbe essere qualsiasi cosa",
    "consiglio di far controllare da un tecnico",
    "potrebbe esserci un problema generico",
    "difficile dirlo senza vedere",
    "potrebbe dipendere da molti fattori",
    "è impossibile dirlo a distanza",
    "non posso saperlo senza ulteriori informazioni"
  ]
};