"use strict";
/**
 * basicPatterns.js — pattern BT civili/industriali di base.
 * Complementano i failure_patterns.json del diagnosticEngine.
 * Format: { id, keywords[], observations[], hypotheses[], checks[], risks[] }
 * Certainty: ALTA | MEDIA | BASSA
 */

var patterns = [
  {
    id: "rcd_trip_light",
    keywords: ["differenziale", "luce", "luci", "lampada", "driver led"],
    observations: [
      "Il differenziale interviene quando viene alimentato il circuito luci",
      "Il guasto è associato al circuito illuminazione"
    ],
    hypotheses: [
      { text: "Dispersione verso terra nel cavo del circuito luci (isolamento degradato)", certainty: "ALTA" },
      { text: "Driver LED o ballast con corrente di dispersione eccessiva (>10mA totali)", certainty: "MEDIA" },
      { text: "Contatto fase-terra nel punto luce (connettore mal eseguito)", certainty: "MEDIA" }
    ],
    checks: [
      "Isolare completamente il circuito luci dal differenziale",
      "Misurare l'isolamento del cavo con megger 500V (atteso >1MΩ)",
      "Collegare le lampade/driver una alla volta per individuare il componente guasto",
      "Misurare la corrente di dispersione di ogni driver con pinza differenziale"
    ],
    risks: [
      "Rischio scossa elettrica se il guasto non viene eliminato prima del reset"
    ]
  },
  {
    id: "pump_not_start",
    keywords: ["pompa", "non parte", "non si avvia", "non parte"],
    observations: [
      "La pompa non si avvia quando viene richiesto il funzionamento",
      "Il circuito di comando risulta attivo ma la pompa non risponde"
    ],
    hypotheses: [
      { text: "Galleggiante o pressostato non chiude il contatto di consenso", certainty: "ALTA" },
      { text: "Il contattore non riceve il segnale di comando (tensione bobina assente)", certainty: "MEDIA" },
      { text: "Protezione magnetotermica o relè termico aperto", certainty: "BASSA" }
    ],
    checks: [
      "Verificare il contatto del galleggiante con multimetro (continuità in posizione di lavoro)",
      "Misurare la tensione sulla bobina del contattore durante il comando (deve essere 230/24VAC/VDC)",
      "Verificare che il relè termico (MTR) non sia scattato — premere il tasto di reset se necessario",
      "Misurare la tensione ai morsetti della pompa con contattore chiuso"
    ],
    risks: [
      "Blocco impianto idraulico o svuotamento serbatoio senza protezione"
    ]
  },
  {
    id: "motor_not_start_3ph",
    keywords: ["motore trifase", "non parte", "contattore chiuso", "non gira"],
    observations: [
      "Il motore trifase non si avvia nonostante il contattore sia chiuso",
      "Tensione presente a monte del contattore"
    ],
    hypotheses: [
      { text: "Perdita di una fase: motore non ha le 3 fasi (ronza o non si muove)", certainty: "ALTA" },
      { text: "Relè termico scattato: MTR non resettato dopo sovraccarico", certainty: "MEDIA" },
      { text: "Avvolgimento motore guasto: cortocircuito o interruzione", certainty: "BASSA" }
    ],
    checks: [
      "Misurare le 3 tensioni di uscita dal contattore: L1-L2, L2-L3, L3-L1 (attese ~400V)",
      "Verificare lo stato del relè termico (MTR) — tasto reset sporgente indica scatto",
      "Misurare la resistenza degli avvolgimenti con ohmetro (3 fasi devono essere bilanciate)"
    ],
    risks: [
      "Surriscaldamento motore se funziona con perdita di fase — spegnere immediatamente"
    ]
  },
  {
    id: "rcd_trip_random",
    keywords: ["differenziale", "scatta", "notte", "riposo", "senza motivo"],
    observations: [
      "Il differenziale scatta in modo apparentemente casuale, anche a riposo",
      "Non c'è correlazione diretta con l'inserimento di un carico specifico"
    ],
    hypotheses: [
      { text: "Dispersione di terra progressiva su cavo vecchio (humidità, UV, abrasione)", certainty: "ALTA" },
      { text: "Differenziale degradato con soglia effettiva scesa sotto 30mA", certainty: "MEDIA" },
      { text: "Somma delle correnti di dispersione dei carichi EMC supera la soglia", certainty: "MEDIA" }
    ],
    checks: [
      "Misurare l'isolamento di tutti i circuiti con megger 500V a riposo",
      "Sezionare i circuiti uno alla volta per individuare il tratto con dispersione",
      "Misurare la corrente di dispersione totale con pinza differenziale a riposo",
      "Testare il differenziale con il tasto TEST: deve scattare in <300ms"
    ],
    risks: [
      "Rischio scossa elettrica o incendio se il guasto non viene eliminato"
    ]
  },
  {
    id: "no_power_downstream",
    keywords: ["tensione assente", "non alimentato", "non arriva tensione", "muto"],
    observations: [
      "Tensione presente a monte del componente di protezione",
      "Tensione assente a valle: utenza non alimentata"
    ],
    hypotheses: [
      { text: "Interruttore magnetotermico aperto (scattato per sovraccarico/guasto)", certainty: "ALTA" },
      { text: "Fusibile fuso nel circuito a valle", certainty: "MEDIA" },
      { text: "Morsetto o connettore allentato nel percorso di alimentazione", certainty: "MEDIA" }
    ],
    checks: [
      "Verificare visivamente lo stato degli interruttori magnetotermici sul quadro",
      "Misurare la continuità di ogni fusibile (con circuito de-energizzato)",
      "Misurare la tensione a valle di ogni protezione con circuito energizzato",
      "Verificare i morsetti della morsettiera — un morsetto allentato può cadere senza segni visivi"
    ],
    risks: [
      "Non resettare un interruttore senza verificare la causa dello scatto"
    ]
  }
];

module.exports = { patterns: patterns };
