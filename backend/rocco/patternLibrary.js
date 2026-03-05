"use strict";
/**
 * patternLibrary.js — Pattern di riconoscimento componenti >= 30, organizzati per famiglia.
 * Ogni pattern: { id, family, component_id, type, pattern, weight? }
 *   type "alias"   → corrisponde a un nome/sigla del componente (peso base)
 *   type "marking" → corrisponde a una marcatura tecnica stampata (peso forte)
 *   type "context" → corrisponde a un termine contestuale (peso medio)
 *
 * Usato da recognitionEngine.js per calcolare confidence 0..1.
 * I pesi specifici per tipo sono definiti in recognitionEngine.js (TYPE_WEIGHTS).
 */

const PATTERNS = [

  /* ═══════════════════════════════════════════════════════════════════
     FAMIGLIA: PROTEZIONI — Magnetotermico (MT / MCB)
     ═══════════════════════════════════════════════════════════════════ */
  {
    id: "MT-01", family: "protezioni", component_id: "magnetotermico",
    type: "alias", pattern: /magnetotermico/i
  },
  {
    id: "MT-02", family: "protezioni", component_id: "magnetotermico",
    type: "alias", pattern: /\bmcb\b/i
  },
  {
    id: "MT-03", family: "protezioni", component_id: "magnetotermico",
    type: "alias", pattern: /interruttore automatico/i
  },
  {
    id: "MT-04", family: "protezioni", component_id: "magnetotermico",
    type: "alias", pattern: /\bmccb\b/i
  },
  {
    id: "MT-05", family: "protezioni", component_id: "magnetotermico",
    type: "alias", pattern: /\bbreaker\b/i
  },
  {
    id: "MT-06", family: "protezioni", component_id: "magnetotermico",
    type: "alias", pattern: /\bsalvamotore\b/i
  },
  {
    id: "MT-07", family: "protezioni", component_id: "magnetotermico",
    type: "marking", pattern: /\b[CBD]\d+\b/
  },
  {
    id: "MT-08", family: "protezioni", component_id: "magnetotermico",
    type: "marking", pattern: /curva\s+[CBD]/i
  },
  {
    id: "MT-09", family: "protezioni", component_id: "magnetotermico",
    type: "context", pattern: /\bscatt(a|ato|ava)\b/i
  },
  {
    id: "MT-10", family: "protezioni", component_id: "magnetotermico",
    type: "context", pattern: /\b(bipolare|tetrapolare)\b/i
  },
  {
    id: "MT-11", family: "protezioni", component_id: "magnetotermico",
    type: "context", pattern: /\b(sovraccarico|cortocircuito)\b/i
  },

  /* ═══════════════════════════════════════════════════════════════════
     FAMIGLIA: PROTEZIONI — Differenziale (RCD / RCCB)
     ═══════════════════════════════════════════════════════════════════ */
  {
    id: "RCD-01", family: "protezioni", component_id: "differenziale",
    type: "alias", pattern: /differenziale/i
  },
  {
    id: "RCD-02", family: "protezioni", component_id: "differenziale",
    type: "alias", pattern: /\brcd\b/i
  },
  {
    id: "RCD-03", family: "protezioni", component_id: "differenziale",
    type: "alias", pattern: /\brccb\b/i
  },
  {
    id: "RCD-04", family: "protezioni", component_id: "differenziale",
    type: "alias", pattern: /salvavita/i
  },
  {
    id: "RCD-05", family: "protezioni", component_id: "differenziale",
    type: "marking", pattern: /\b\d+\s*mA\b/i
  },
  {
    id: "RCD-06", family: "protezioni", component_id: "differenziale",
    type: "marking", pattern: /\btipo\s+[ABFHI]\b/i
  },
  {
    id: "RCD-07", family: "protezioni", component_id: "differenziale",
    type: "marking", pattern: /0\.0?3\s*A\b/
  },
  {
    id: "RCD-08", family: "protezioni", component_id: "differenziale",
    type: "context", pattern: /\bdispersion[ei]\b/i
  },
  {
    id: "RCD-09", family: "protezioni", component_id: "differenziale",
    type: "context", pattern: /tasto\s+test/i
  },
  {
    id: "RCD-10", family: "protezioni", component_id: "differenziale",
    type: "context", pattern: /contatto\s+indiretto/i
  },
  {
    id: "RCD-11", family: "protezioni", component_id: "differenziale",
    type: "context", pattern: /falso\s+scatto/i
  },

  /* ═══════════════════════════════════════════════════════════════════
     FAMIGLIA: PROTEZIONI — Magnetotermico Differenziale (RCBO)
     ═══════════════════════════════════════════════════════════════════ */
  {
    id: "RCBO-01", family: "protezioni", component_id: "magnetotermico_differenziale",
    type: "alias", pattern: /\brcbo\b/i
  },
  {
    id: "RCBO-02", family: "protezioni", component_id: "magnetotermico_differenziale",
    type: "alias", pattern: /magnetotermico\s+differenziale/i
  },
  {
    id: "RCBO-03", family: "protezioni", component_id: "magnetotermico_differenziale",
    type: "alias", pattern: /interruttore\s+differenziale\s+magnetotermico/i
  },
  {
    id: "RCBO-04", family: "protezioni", component_id: "magnetotermico_differenziale",
    type: "marking", pattern: /[CBD]\d+\/\d+\s*mA/i
  },
  {
    id: "RCBO-05", family: "protezioni", component_id: "magnetotermico_differenziale",
    type: "context", pattern: /protezione\s+combinata/i
  },

  /* ═══════════════════════════════════════════════════════════════════
     FAMIGLIA: COMANDO — Contattore
     ═══════════════════════════════════════════════════════════════════ */
  {
    id: "KM-01", family: "comando", component_id: "contattore",
    type: "alias", pattern: /contattore/i
  },
  {
    id: "KM-02", family: "comando", component_id: "contattore",
    type: "alias", pattern: /teleruttore/i
  },
  {
    id: "KM-03", family: "comando", component_id: "contattore",
    type: "alias", pattern: /\bcontactor\b/i
  },
  {
    id: "KM-04", family: "comando", component_id: "contattore",
    type: "marking", pattern: /\bKM\d+\b/
  },
  {
    id: "KM-05", family: "comando", component_id: "contattore",
    type: "marking", pattern: /\bLC1[-\s]?[A-Z0-9]+/i
  },
  {
    id: "KM-06", family: "comando", component_id: "contattore",
    type: "marking", pattern: /\bA1[-\s]?A2\b/i
  },
  {
    id: "KM-07", family: "comando", component_id: "contattore",
    type: "context", pattern: /bobina\s*(del\s+contattore)?/i
  },
  {
    id: "KM-08", family: "comando", component_id: "contattore",
    type: "context", pattern: /non\s+(tira|chiude|si\s+eccita)/i
  },
  {
    id: "KM-09", family: "comando", component_id: "contattore",
    type: "context", pattern: /click\s*(del)?\s*contattore/i
  },

  /* ═══════════════════════════════════════════════════════════════════
     FAMIGLIA: COMANDO — Relè
     ═══════════════════════════════════════════════════════════════════ */
  {
    id: "KR-01", family: "comando", component_id: "rele",
    type: "alias", pattern: /rel[eèé]\b/i
  },
  {
    id: "KR-02", family: "comando", component_id: "rele",
    type: "alias", pattern: /\bMTR\b/
  },
  {
    id: "KR-03", family: "comando", component_id: "rele",
    type: "alias", pattern: /overload\s*relay/i
  },
  {
    id: "KR-04", family: "comando", component_id: "rele",
    type: "alias", pattern: /rel[eèé]\s*termico/i
  },
  {
    id: "KR-05", family: "comando", component_id: "rele",
    type: "marking", pattern: /\bLRD\d+/i
  },
  {
    id: "KR-06", family: "comando", component_id: "rele",
    type: "marking", pattern: /\bRU\d+\b/i
  },
  {
    id: "KR-07", family: "comando", component_id: "rele",
    type: "context", pattern: /protezione\s+termica/i
  },
  {
    id: "KR-08", family: "comando", component_id: "rele",
    type: "context", pattern: /scatto\s+termico/i
  },
  {
    id: "KR-09", family: "comando", component_id: "rele",
    type: "context", pattern: /\bscattato\b/i
  },

  /* ═══════════════════════════════════════════════════════════════════
     FAMIGLIA: TEMPORIZZAZIONI — Timer / Orologio
     ═══════════════════════════════════════════════════════════════════ */
  {
    id: "TM-01", family: "temporizzazioni", component_id: "timer",
    type: "alias", pattern: /\btimer\b/i
  },
  {
    id: "TM-02", family: "temporizzazioni", component_id: "timer",
    type: "alias", pattern: /temporizzatore/i
  },
  {
    id: "TM-03", family: "temporizzazioni", component_id: "timer",
    type: "alias", pattern: /programmator[ei]\s+orar[io]/i
  },
  {
    id: "TM-04", family: "temporizzazioni", component_id: "timer",
    type: "alias", pattern: /orologio\s+digitale/i
  },
  {
    id: "TM-05", family: "temporizzazioni", component_id: "timer",
    type: "alias", pattern: /\bcrono\b/i
  },
  {
    id: "TM-06", family: "temporizzazioni", component_id: "timer",
    type: "marking", pattern: /on\s+delay/i
  },
  {
    id: "TM-07", family: "temporizzazioni", component_id: "timer",
    type: "marking", pattern: /off\s+delay/i
  },
  {
    id: "TM-08", family: "temporizzazioni", component_id: "timer",
    type: "context", pattern: /fascia\s+orar[ia]/i
  },
  {
    id: "TM-09", family: "temporizzazioni", component_id: "timer",
    type: "context", pattern: /ritardo\s+(d[i']|avvio|inserzione)/i
  },
  {
    id: "TM-10", family: "temporizzazioni", component_id: "timer",
    type: "context", pattern: /programma\s+orario/i
  },

  /* ═══════════════════════════════════════════════════════════════════
     FAMIGLIA: SENSORI — Pressostato
     ═══════════════════════════════════════════════════════════════════ */
  {
    id: "PS-01", family: "sensori", component_id: "pressostato",
    type: "alias", pattern: /pressostato/i
  },
  {
    id: "PS-02", family: "sensori", component_id: "pressostato",
    type: "alias", pattern: /pressure\s+switch/i
  },
  {
    id: "PS-03", family: "sensori", component_id: "pressostato",
    type: "alias", pattern: /presscontrol/i
  },
  {
    id: "PS-04", family: "sensori", component_id: "pressostato",
    type: "marking", pattern: /\b\d+(\.\d+)?\s*bar\b/i
  },
  {
    id: "PS-05", family: "sensori", component_id: "pressostato",
    type: "context", pattern: /pressione\s+(impianto|circuito|acqua)/i
  },
  {
    id: "PS-06", family: "sensori", component_id: "pressostato",
    type: "context", pattern: /taratura\s+(di\s+)?pressione/i
  },
  {
    id: "PS-07", family: "sensori", component_id: "pressostato",
    type: "context", pattern: /soglia\s+di\s+pressione/i
  },

  /* ═══════════════════════════════════════════════════════════════════
     FAMIGLIA: SENSORI — Galleggiante
     ═══════════════════════════════════════════════════════════════════ */
  {
    id: "LS-01", family: "sensori", component_id: "galleggiante",
    type: "alias", pattern: /galleggiante/i
  },
  {
    id: "LS-02", family: "sensori", component_id: "galleggiante",
    type: "alias", pattern: /livellostato/i
  },
  {
    id: "LS-03", family: "sensori", component_id: "galleggiante",
    type: "alias", pattern: /float\s+switch/i
  },
  {
    id: "LS-04", family: "sensori", component_id: "galleggiante",
    type: "alias", pattern: /sonda\s+di\s+livello/i
  },
  {
    id: "LS-05", family: "sensori", component_id: "galleggiante",
    type: "context", pattern: /\blivello\b/i
  },
  {
    id: "LS-06", family: "sensori", component_id: "galleggiante",
    type: "context", pattern: /\b(serbatoio|vasca|pozzo|cisterna)\b/i
  },
  {
    id: "LS-07", family: "sensori", component_id: "galleggiante",
    type: "context", pattern: /consenso\s+(pompa|avvio)/i
  },
  {
    id: "LS-08", family: "sensori", component_id: "galleggiante",
    type: "context", pattern: /livello\s+(alto|basso|acqua)/i
  },

  /* ═══════════════════════════════════════════════════════════════════
     FAMIGLIA: ALIMENTAZIONE — Alimentatore DC
     ═══════════════════════════════════════════════════════════════════ */
  {
    id: "PSU-01", family: "alimentazione", component_id: "alimentatore",
    type: "alias", pattern: /\balimentatore\b/i
  },
  {
    id: "PSU-02", family: "alimentazione", component_id: "alimentatore",
    type: "alias", pattern: /\bsmps\b/i
  },
  {
    id: "PSU-03", family: "alimentazione", component_id: "alimentatore",
    type: "alias", pattern: /power\s+supply/i
  },
  {
    id: "PSU-04", family: "alimentazione", component_id: "alimentatore",
    type: "alias", pattern: /\bpsu\b/i
  },
  {
    id: "PSU-05", family: "alimentazione", component_id: "alimentatore",
    type: "marking", pattern: /24\s*VDC\b/i
  },
  {
    id: "PSU-06", family: "alimentazione", component_id: "alimentatore",
    type: "marking", pattern: /\d+\s*V\s*DC\b/i
  },
  {
    id: "PSU-07", family: "alimentazione", component_id: "alimentatore",
    type: "marking", pattern: /MEAN\s*WELL/i
  },
  {
    id: "PSU-08", family: "alimentazione", component_id: "alimentatore",
    type: "marking", pattern: /PHOENIX\s*CONTACT/i
  },
  {
    id: "PSU-09", family: "alimentazione", component_id: "alimentatore",
    type: "context", pattern: /alimentazione\s*(dc|ausiliari|controllo)/i
  },
  {
    id: "PSU-10", family: "alimentazione", component_id: "alimentatore",
    type: "context", pattern: /24\s*v\s*(controllo|plc|ausiliari)/i
  },

  /* ═══════════════════════════════════════════════════════════════════
     FAMIGLIA: CONTROLLO — Scheda di Controllo
     ═══════════════════════════════════════════════════════════════════ */
  {
    id: "PCB-01", family: "controllo", component_id: "scheda_controllo",
    type: "alias", pattern: /scheda\s+(di\s+)?(controllo|comando|elettronica)/i
  },
  {
    id: "PCB-02", family: "controllo", component_id: "scheda_controllo",
    type: "alias", pattern: /\bpcb\b/i
  },
  {
    id: "PCB-03", family: "controllo", component_id: "scheda_controllo",
    type: "alias", pattern: /control\s+board/i
  },
  {
    id: "PCB-04", family: "controllo", component_id: "scheda_controllo",
    type: "alias", pattern: /scheda\s+(pompa|caldaia|inverter)/i
  },
  {
    id: "PCB-05", family: "controllo", component_id: "scheda_controllo",
    type: "context", pattern: /\b(bruciata|guasta|avaria)\b/i
  },
  {
    id: "PCB-06", family: "controllo", component_id: "scheda_controllo",
    type: "context", pattern: /(aggiornamento|errore)\s+firmware/i
  },
  {
    id: "PCB-07", family: "controllo", component_id: "scheda_controllo",
    type: "context", pattern: /\b(sostituire|riparare)\b/i
  },
  {
    id: "PCB-08", family: "controllo", component_id: "scheda_controllo",
    type: "context", pattern: /errore\s+comunicazione/i
  },

  /* ═══════════════════════════════════════════════════════════════════
     FAMIGLIA: PROTEZIONI — Fusibile
     ═══════════════════════════════════════════════════════════════════ */
  {
    id: "FU-01", family: "protezioni", component_id: "fusibile",
    type: "alias", pattern: /\bfusibile\b/i
  },
  {
    id: "FU-02", family: "protezioni", component_id: "fusibile",
    type: "alias", pattern: /portafusibile/i
  },
  {
    id: "FU-03", family: "protezioni", component_id: "fusibile",
    type: "alias", pattern: /\b(nh00|nh1|nh2|nh3)\b/i
  },
  {
    id: "FU-04", family: "protezioni", component_id: "fusibile",
    type: "marking", pattern: /\bNH\d?\b/
  },
  {
    id: "FU-05", family: "protezioni", component_id: "fusibile",
    type: "context", pattern: /(sostituire|cambiare)\s+fusibile/i
  },

  /* ═══════════════════════════════════════════════════════════════════
     FAMIGLIA: AZIONAMENTO — Inverter / Variatore
     ═══════════════════════════════════════════════════════════════════ */
  {
    id: "INV-01", family: "azionamento", component_id: "inverter",
    type: "alias", pattern: /\binverter\b/i
  },
  {
    id: "INV-02", family: "azionamento", component_id: "inverter",
    type: "alias", pattern: /variatore\s+di\s+(velocit[àa]|frequenza)/i
  },
  {
    id: "INV-03", family: "azionamento", component_id: "inverter",
    type: "alias", pattern: /\bvfd\b/i
  },
  {
    id: "INV-04", family: "azionamento", component_id: "inverter",
    type: "alias", pattern: /\bazionamento\b/i
  },
  {
    id: "INV-05", family: "azionamento", component_id: "inverter",
    type: "marking", pattern: /\bALTIVAR\b/i
  },
  {
    id: "INV-06", family: "azionamento", component_id: "inverter",
    type: "context", pattern: /allarme\s+inverter/i
  },
  {
    id: "INV-07", family: "azionamento", component_id: "inverter",
    type: "context", pattern: /codice\s+errore\s+inverter/i
  },

  /* ═══════════════════════════════════════════════════════════════════
     FAMIGLIA: AUTOMAZIONE — PLC
     ═══════════════════════════════════════════════════════════════════ */
  {
    id: "PLC-01", family: "automazione", component_id: "plc",
    type: "alias", pattern: /\bplc\b/i
  },
  {
    id: "PLC-02", family: "automazione", component_id: "plc",
    type: "alias", pattern: /controllore\s+logico/i
  },
  {
    id: "PLC-03", family: "automazione", component_id: "plc",
    type: "alias", pattern: /\bsimatic\b/i
  },
  {
    id: "PLC-04", family: "automazione", component_id: "plc",
    type: "alias", pattern: /\bs7-\d+/i
  },
  {
    id: "PLC-05", family: "automazione", component_id: "plc",
    type: "context", pattern: /plc\s+in\s+(stop|fault|errore)/i
  },
  {
    id: "PLC-06", family: "automazione", component_id: "plc",
    type: "context", pattern: /(ingresso|uscita)\s+digitale/i
  }

];

module.exports = { PATTERNS };
