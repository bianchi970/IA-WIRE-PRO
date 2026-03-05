"use strict";
/**
 * componentCatalog.js — SSOT catalogo componenti elettrici per ROCCO.
 * Schema per entry: { id, name_it, aliases[], markings[], context_terms[], function_short }
 *
 * Regola d'oro: nessun componente inventato. Solo da catalogo elettrico reale.
 * Questo file è l'unica fonte di verità per id, nomi e metadati componenti.
 * Usato da: recognitionEngine.js, patternLibrary.js, visionFusion.js
 */

const CATALOG = [
  /* ── 1. MAGNETOTERMICO ──────────────────────────────────────────────── */
  {
    id: "magnetotermico",
    name_it: "Magnetotermico",
    aliases: [
      "magnetotermico", "mcb", "interruttore automatico",
      "interruttore magnetotermico", "breaker", "mccb", "salvamotore"
    ],
    markings: [
      "C\\d+", "B\\d+", "D\\d+", "K\\d+",
      "curva [CBD]\\d*", "In\\s*=?\\s*\\d+\\s*A"
    ],
    context_terms: [
      "quadro", "bipolare", "tetrapolare", "scatta", "apre",
      "cortocircuito", "sovraccarico", "guida din", "protezione linea"
    ],
    function_short: "Protezione da sovraccarico e cortocircuito"
  },

  /* ── 2. DIFFERENZIALE ───────────────────────────────────────────────── */
  {
    id: "differenziale",
    name_it: "Differenziale",
    aliases: [
      "differenziale", "rcd", "rccb", "salvavita",
      "interruttore differenziale", "differenziale puro"
    ],
    markings: [
      "\\d+\\s*mA", "0\\.0?3\\s*A", "tipo [ABFHI]",
      "Idn", "I\\s*dn"
    ],
    context_terms: [
      "dispersione", "terra", "contatto indiretto", "tasto test",
      "falso scatto", "corrente di guasto", "salvavita scatta"
    ],
    function_short: "Protezione da contatti indiretti (corrente di dispersione verso terra)"
  },

  /* ── 3. MAGNETOTERMICO DIFFERENZIALE (RCBO) ─────────────────────────── */
  {
    id: "magnetotermico_differenziale",
    name_it: "Magnetotermico Differenziale",
    aliases: [
      "rcbo", "magnetotermico differenziale",
      "interruttore differenziale magnetotermico",
      "salvavita magnetotermico", "combinato"
    ],
    markings: [
      "[CBD]\\d+\\/\\d+\\s*mA", "\\d+\\s*mA", "tipo [ABFHI]"
    ],
    context_terms: [
      "bipolare", "dispersione", "cortocircuito",
      "singolo circuito", "protezione combinata"
    ],
    function_short: "Protezione combinata da sovraccarico, cortocircuito e dispersione"
  },

  /* ── 4. CONTATTORE ──────────────────────────────────────────────────── */
  {
    id: "contattore",
    name_it: "Contattore",
    aliases: [
      "contattore", "teleruttore", "contactor", "kmf"
    ],
    markings: [
      "KM\\d+", "LC1[-\\s]?[A-Z0-9]+", "3RT\\d+",
      "A1[-\\s]?A2", "\\bKM\\b"
    ],
    context_terms: [
      "bobina", "comando", "avvio", "arresto", "potenza",
      "click del contattore", "non chiude", "non tira"
    ],
    function_short: "Commutazione di carichi elettrici tramite segnale di comando sulla bobina"
  },

  /* ── 5. RELÈ ────────────────────────────────────────────────────────── */
  {
    id: "rele",
    name_it: "Relè",
    aliases: [
      "relè", "rele", "relé", "relay",
      "relè ausiliario", "rele ausiliario",
      "relè intermedio", "rele intermedio",
      "relè termico", "rele termico",
      "mtr", "overload relay"
    ],
    markings: [
      "K\\d+", "RU\\d+", "LRD\\d+",
      "\\b11[-\\s]?14\\b", "\\b21[-\\s]?24\\b"
    ],
    context_terms: [
      "protezione termica", "scatto termico", "reset relè",
      "contatto nc", "contatto no", "bobina relè", "ausiliario"
    ],
    function_short: "Amplificazione segnali, protezione termica motori, isolamento circuiti"
  },

  /* ── 6. TIMER / OROLOGIO ─────────────────────────────────────────────── */
  {
    id: "timer",
    name_it: "Timer / Orologio",
    aliases: [
      "timer", "temporizzatore", "orologio digitale",
      "programmatore orario", "crono", "time relay",
      "orologio astro", "orologio"
    ],
    markings: [
      "on delay", "off delay", "24h", "7d",
      "\\d+[smh]\\s*(ritardo|delay)"
    ],
    context_terms: [
      "fascia oraria", "ritardo avvio", "ciclo",
      "programma orario", "accensione programmata", "bypass timer"
    ],
    function_short: "Gestione temporizzata di cicli, ritardi o programmi orari"
  },

  /* ── 7. PRESSOSTATO ─────────────────────────────────────────────────── */
  {
    id: "pressostato",
    name_it: "Pressostato",
    aliases: [
      "pressostato", "pressure switch",
      "presscontrol", "pressostato differenziale"
    ],
    markings: [
      "\\d+(\\.\\d+)?\\s*bar", "PS\\d+", "IP6[5-8]"
    ],
    context_terms: [
      "pressione impianto", "taratura pressione",
      "soglia di pressione", "acqua", "aria compressa",
      "compressore", "circuito idraulico"
    ],
    function_short: "Chiude/apre un contatto al raggiungimento di valori di pressione impostati"
  },

  /* ── 8. GALLEGGIANTE ─────────────────────────────────────────────────── */
  {
    id: "galleggiante",
    name_it: "Galleggiante",
    aliases: [
      "galleggiante", "livellostato", "sonda di livello",
      "float switch", "sensore livello"
    ],
    markings: [
      "LS\\d+", "IP6[78]", "NC float", "NO float"
    ],
    context_terms: [
      "vasca", "serbatoio", "pozzo", "cisterna",
      "livello acqua", "livello alto", "livello basso",
      "sommerso", "consenso pompa"
    ],
    function_short: "Rilevamento livello liquido per consenso avvio/arresto pompa o allarme"
  },

  /* ── 9. ALIMENTATORE ─────────────────────────────────────────────────── */
  {
    id: "alimentatore",
    name_it: "Alimentatore",
    aliases: [
      "alimentatore", "alimentatore switching",
      "power supply", "smps", "psu",
      "alimentatore din", "regolatore di tensione"
    ],
    markings: [
      "24\\s*VDC", "24\\s*V\\s*DC", "12\\s*VDC",
      "12\\s*V\\s*DC", "48\\s*VDC",
      "MEAN\\s*WELL", "PHOENIX\\s*CONTACT", "PULS",
      "\\d+\\s*VDC"
    ],
    context_terms: [
      "corrente continua", "tensione dc",
      "alimentazione dc", "circuito ausiliario",
      "stabilizzato", "ausiliari quadro", "24v controllo"
    ],
    function_short: "Conversione AC→DC stabilizzata per circuiti di controllo e automazione"
  },

  /* ── 10. SCHEDA DI CONTROLLO ─────────────────────────────────────────── */
  {
    id: "scheda_controllo",
    name_it: "Scheda di Controllo",
    aliases: [
      "scheda controllo", "scheda elettronica",
      "control board", "pcb",
      "scheda di controllo", "scheda di comando",
      "scheda inverter", "scheda pompa", "scheda caldaia"
    ],
    markings: [
      "\\bPCB\\b", "REV\\.\\s*\\d+", "SW\\s*ver", "HW\\s*ver",
      "FAULT\\s*LED", "J\\d+", "CN\\d+"
    ],
    context_terms: [
      "scheda bruciata", "scheda guasta",
      "aggiornamento firmware", "errore comunicazione",
      "avaria scheda", "sostituire scheda", "reset scheda"
    ],
    function_short: "Gestione elettronica dei parametri di funzionamento dell'apparecchiatura"
  },

  /* ── 11. FUSIBILE (extra) ──────────────────────────────────────────── */
  {
    id: "fusibile",
    name_it: "Fusibile",
    aliases: [
      "fusibile", "nh", "portafusibile",
      "valvola", "fuse", "cartuccia fusibile", "fusibil"
    ],
    markings: [
      "NH00", "NH1", "NH2", "NH3",
      "\\bGG\\b", "\\bGM\\b",
      "10\\s*x\\s*38", "14\\s*x\\s*51"
    ],
    context_terms: [
      "cambiare fusibile", "sostituire fusibile",
      "continuità fusibile", "sezionatore fusibile", "fusione"
    ],
    function_short: "Protezione da cortocircuito tramite fusione del filamento conduttore"
  },

  /* ── 12. INVERTER (extra) ──────────────────────────────────────────── */
  {
    id: "inverter",
    name_it: "Inverter / Variatore",
    aliases: [
      "inverter", "variatore", "variatore di velocità",
      "vfd", "azionamento", "variatore di frequenza",
      "convertitore di frequenza", "drive"
    ],
    markings: [
      "\\bVFD\\b", "\\bABB\\b", "SIEMENS\\s*G?\\d*",
      "DANFOSS", "SCHNEIDER", "LENZE", "ALTIVAR",
      "G120", "FR-[EA]"
    ],
    context_terms: [
      "velocità motore", "frequenza uscita",
      "rampa accelerazione", "allarme inverter",
      "fault inverter", "codice errore inverter"
    ],
    function_short: "Controllo velocità motori AC tramite variazione di frequenza e tensione"
  },

  /* ── 13. PLC (extra) ───────────────────────────────────────────────── */
  {
    id: "plc",
    name_it: "PLC",
    aliases: [
      "plc", "controllore logico", "simatic",
      "s7-1200", "s7-300", "s7-1500",
      "logo!", "logo plc", "zelio", "controllore programmabile"
    ],
    markings: [
      "\\bCPU\\b", "PROFIBUS", "PROFINET",
      "ETHERNET\\/IP", "RUN\\s*LED", "STOP\\s*LED"
    ],
    context_terms: [
      "programma plc", "ingresso digitale", "uscita digitale",
      "espansione plc", "errore plc", "plc in stop"
    ],
    function_short: "Controllo logico programmabile di processi industriali e automazione"
  }
];

module.exports = { CATALOG };
