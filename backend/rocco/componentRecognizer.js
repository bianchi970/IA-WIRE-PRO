"use strict";

/**
 * Component Recognition Engine — ROCCO
 * Identifica componenti elettrici/impiantistici nel testo dell'utente.
 * Usato per arricchire il contesto prima della chiamata LLM.
 */

const componentsDB = {
  rcd:              ["differenziale", "salvavita", "rcd", "rcbo", "id", "interruttore differenziale"],
  magnetotermico:   ["magnetotermico", " mt ", "interruttore automatico", " mccb", " mcb", "curva c", "curva b", "curva d", "salvamotore"],
  fusibile:         ["fusibile", "fusibil", "valvola", "nh", "gg", "portafusibile"],
  contattore:       ["contattore", "teleruttore", "kmf", "km"],
  rele:             ["relè", "rele", "relé", "relè termico", "rele termico", "overload"],
  trasformatore:    ["trasformatore", "trafo", "separazione", "primario", "secondario"],
  inverter:         ["inverter", "variatore", "variatore di velocità", "vfd", "azionamento"],
  ups:              ["ups", "gruppo di continuità", "continuità", "no-break"],
  ats:              ["ats", "commutatore automatico", "commutazione rete"],
  plc:              ["plc", "controllore logico", "simatic", "s7-", "logo!", "logo plc", "zelio"],
  pressostato:      ["pressostato"],
  termostato:       ["termostato", "sonda temperatura", "cronotermostato", "termostato ambiente"],
  galleggiante:     ["galleggiante", "livellostato", "sonda di livello"],
  pompa:            ["pompa", "pompa sommersa", "elettropompa", "circolatore", "pompa di calore", "pompa di rilancio"],
  motore:           ["motore", "motore elettrico", "motore trifase", "monofase", "asincrono"],
  resistenza:       ["resistenza", "resistenza elettrica", "elemento riscaldante", "heater", "scaldaacqua"],
  luce:             ["luce", "lampada", "lampadina", "illuminazione", "led", "neon", "faretto", "plafoniera"],
  driver_led:       ["driver led", "alimentatore led", "driver", "dali"],
  presa:            ["presa", "presa di corrente", "schuko", "bipasso", "polivalente"],
  interruttore:     ["interruttore", "deviatore", "doppio deviatore", "pulsante", "comando"],
  timer:            ["timer", "orologio digitale", "temporizzatore", "programmatore orario", "crono"],
  sensore:          ["sensore", "rilevatore", "sensore di movimento", "pir", "crepuscolare", "fotocellula"],
  protezione_tensione: ["relè di tensione", "relè di minima", "relè di massima", "protezione tensione", "overvoltage", "undervoltage"],
  trasformatore_misura: [" ta ", " tv ", "trasformatore amperometrico", "trasformatore voltmetrico", "toroidale", "tc amperometrico"],
  morsettiera:      ["morsettiera", "morsetto", "pettine", "barra", "sbarra", "busbar"],
  cavo:             ["cavo", "conduttore", "filo", "fune", "fg7", "fror", "n07", "h07"],
  quadro:           ["quadro", "quadro elettrico", "pannello", "centralino", "armadio elettrico", "carpenteria"],
  misuratore:       ["multimetro", "tester", "pinza amperometrica", "megohmetro", "sequenzimetro", "oscilloscopio"],
};

/**
 * Estrae i componenti presenti nel testo.
 * @param {string} text
 * @returns {string[]} Array di ID componenti trovati (univoci, ordinati)
 */
function extractComponents(text) {
  if (!text) return [];
  const found = [];
  // Aggiunge spazi ai bordi per permettere matching di sigle tipo " ta " senza falsi positivi
  const lower = " " + String(text).toLowerCase() + " ";

  for (const comp in componentsDB) {
    const keywords = componentsDB[comp];
    for (var i = 0; i < keywords.length; i++) {
      if (lower.includes(keywords[i])) {
        found.push(comp);
        break;
      }
    }
  }

  return found;
}

/**
 * Restituisce i nomi leggibili dei componenti trovati.
 * @param {string[]} componentIds
 * @returns {string}
 */
const LABELS = {
  rcd:                 "Differenziale/RCD",
  magnetotermico:      "Magnetotermico/MT",
  fusibile:            "Fusibile/NH",
  contattore:          "Contattore/Teleruttore",
  rele:                "Relè",
  trasformatore:       "Trasformatore",
  inverter:            "Inverter/Variatore",
  ups:                 "UPS/Gruppo di continuità",
  ats:                 "ATS/Commutatore automatico",
  plc:                 "PLC/Controllore",
  pressostato:         "Pressostato",
  termostato:          "Termostato",
  galleggiante:        "Galleggiante/Livellostato",
  pompa:               "Pompa/Circolatore",
  motore:              "Motore elettrico",
  resistenza:          "Resistenza/Elemento riscaldante",
  luce:                "Illuminazione/Lampada",
  driver_led:          "Driver LED",
  presa:               "Presa di corrente",
  interruttore:        "Interruttore/Pulsante",
  timer:               "Timer/Temporizzatore",
  sensore:             "Sensore/Rilevatore",
  protezione_tensione: "Protezione di tensione",
  trasformatore_misura:"TA/TV (trasformatore di misura)",
  morsettiera:         "Morsettiera/Barra",
  cavo:                "Cavo/Conduttore",
  quadro:              "Quadro elettrico",
  misuratore:          "Strumento di misura",
};

function formatComponents(componentIds) {
  if (!componentIds || !componentIds.length) return "";
  return componentIds.map(function (id) { return LABELS[id] || id; }).join(", ");
}

module.exports = { componentsDB, extractComponents, formatComponents };
