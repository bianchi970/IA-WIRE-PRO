"use strict";

// ============================================================================
// NEURAL VISION — Gli occhi del tecnico
//
// Quando un elettricista guarda un quadro elettrico, non vede pixel.
// Vede: "quel morsetto è annerito", "quel cavo è sottodimensionato",
// "quella protezione è vecchia", "c'è condensa nella cassetta".
//
// neural_vision.js NON è l'occhio (quello è la fotocamera + un modello
// di riconoscimento). È il CERVELLO VISIVO: prende quello che l'occhio
// vede e lo interpreta come farebbe un tecnico esperto.
//
// Formato ingresso: VISUAL_SCHEMA — standard, provider-agnostico.
// Domani cambi occhio (OpenAI, Anthropic, locale, YOLO) senza toccare
// il cervello. L'occhio descrive, il cervello interpreta.
// ============================================================================

var WorldModel = require("./world_model");

// ============================================================================
// VISUAL_SCHEMA — Formato standard che l'occhio deve produrre
//
// Qualsiasi provider (OpenAI Vision, Anthropic, modello locale) deve
// convertire la sua risposta in questo formato. Il cervello visivo
// accetta SOLO questo.
// ============================================================================

var VISUAL_SCHEMA = {
  // Cosa deve contenere ogni osservazione visiva
  campi_obbligatori: ["tipo", "descrizione"],
  campi_opzionali: ["componente", "stato", "posizione", "colore", "materiale",
                     "sezione_stimata", "marca", "modello", "anno_stimato",
                     "temperatura_stimata", "confidenza"],

  // Tipi di osservazione che il cervello visivo sa interpretare
  tipi: [
    "componente",          // ho visto un componente (MCB, RCD, cavo, morsetto...)
    "anomalia",            // qualcosa non va (annerimento, fusione, ossidazione...)
    "misura_visiva",       // valore letto su display, targhetta, multimetro
    "installazione",       // come è montato (posa cavi, serraggio, ordine...)
    "ambiente",            // condizioni ambientali (umidità, polvere, calore...)
    "targhetta",           // dati di targa letti (potenza, tensione, corrente...)
    "confronto"            // differenza tra due immagini successive
  ]
};

// ============================================================================
// VOCABOLARIO VISIVO — Cosa sa riconoscere un tecnico guardando
//
// Non serve deep learning per questo. Un tecnico esperto sa che:
// - morsetto nero = ha scaldato
// - rame verde = ossidazione da umidità
// - cavo giallo/verde = terra (PE)
// - isolante screpolato = vecchiaia o calore
// ============================================================================

var SEGNI_VISIVI = {
  // Colori anomali e cosa significano
  colori: {
    "nero": { significato: "surriscaldamento o arco elettrico", gravita: "alta", causa_probabile: "connessione lenta o cortocircuito" },
    "annerito": { significato: "ha preso calore", gravita: "alta", causa_probabile: "morsetto allentato o sovraccarico" },
    "bruciato": { significato: "danno termico grave", gravita: "critica", causa_probabile: "arco elettrico prolungato" },
    "verde": { significato: "ossidazione rame", gravita: "media", causa_probabile: "umidità prolungata" },
    "bianco": { significato: "ossidazione alluminio o deposito calcareo", gravita: "media", causa_probabile: "infiltrazione acqua" },
    "giallo_verde": { significato: "conduttore di protezione (PE)", gravita: "nessuna", causa_probabile: "normale — è la terra" },
    "blu": { significato: "neutro", gravita: "nessuna", causa_probabile: "normale — è il neutro" },
    "marrone": { significato: "fase o isolante invecchiato", gravita: "bassa", causa_probabile: "se è fase è normale, se è isolante sta invecchiando" },
    "fuso": { significato: "fusione del materiale", gravita: "critica", causa_probabile: "cortocircuito o arco prolungato" }
  },

  // Condizioni fisiche
  condizioni: {
    "screpolato": { significato: "isolamento degradato", gravita: "alta", azione: "sostituire il cavo — rischio dispersione" },
    "gonfio": { significato: "surriscaldamento interno", gravita: "alta", azione: "sostituire immediatamente il componente" },
    "deformato": { significato: "stress termico o meccanico", gravita: "alta", azione: "verificare e sostituire" },
    "allentato": { significato: "morsetto non serrato", gravita: "alta", azione: "serrare a coppia con cacciavite dinamometrico" },
    "ossidato": { significato: "contatto degradato", gravita: "media", azione: "pulire e serrare, o sostituire il morsetto" },
    "sporco": { significato: "manutenzione carente", gravita: "bassa", azione: "pulire e verificare" },
    "bagnato": { significato: "infiltrazione acqua", gravita: "alta", azione: "trovare la fonte e impermeabilizzare" },
    "condensa": { significato: "umidità eccessiva", gravita: "media", azione: "migliorare ventilazione, verificare isolamento" },
    "polvere": { significato: "accumulo conduttivo", gravita: "media", azione: "pulire — la polvere conduce quando umida" },
    "ruggine": { significato: "corrosione strutturale", gravita: "media", azione: "verificare integrità meccanica" }
  },

  // Problemi di installazione
  installazione: {
    "cavi_disordinati": { significato: "installazione non a regola d'arte", gravita: "bassa", nota: "può nascondere problemi" },
    "cavi_troppo_tesi": { significato: "stress meccanico sui morsetti", gravita: "media", nota: "può causare distacco" },
    "cavi_senza_guaina": { significato: "isolamento mancante", gravita: "alta", nota: "rischio cortocircuito o dispersione" },
    "sezione_sottile": { significato: "cavo sottodimensionato", gravita: "alta", nota: "rischio surriscaldamento" },
    "morsetto_doppio": { significato: "due cavi in un morsetto singolo", gravita: "media", nota: "contatto non garantito" },
    "nastro_isolante": { significato: "riparazione di fortuna", gravita: "alta", nota: "non è una soluzione definitiva" },
    "senza_coprimorsetti": { significato: "parti in tensione accessibili", gravita: "alta", nota: "rischio contatto accidentale" },
    "pe_non_collegato": { significato: "terra assente", gravita: "critica", nota: "rischio elettrocuzione — il differenziale potrebbe non intervenire" }
  }
};

// ============================================================================
// INTERPRETAZIONE — Il cervello visivo lavora
// ============================================================================

// --- Interpreta una singola osservazione visiva ---
function interpretaOsservazione(osservazione) {
  if (!osservazione || !osservazione.tipo || !osservazione.descrizione) {
    return { valida: false, errore: "osservazione incompleta" };
  }

  var risultato = {
    valida: true,
    originale: osservazione,
    interpretazioni: [],
    gravita: "nessuna",
    azioni: [],
    collegamento_diagnostico: null
  };

  var descLower = osservazione.descrizione.toLowerCase();

  // Cerca segni visivi nel testo
  for (var colore in SEGNI_VISIVI.colori) {
    if (descLower.indexOf(colore) >= 0) {
      var segno = SEGNI_VISIVI.colori[colore];
      risultato.interpretazioni.push({
        tipo: "colore",
        segno: colore,
        significato: segno.significato,
        causa_probabile: segno.causa_probabile
      });
      if (confrontaGravita(segno.gravita, risultato.gravita) > 0) {
        risultato.gravita = segno.gravita;
      }
    }
  }

  for (var cond in SEGNI_VISIVI.condizioni) {
    if (descLower.indexOf(cond) >= 0) {
      var condSegno = SEGNI_VISIVI.condizioni[cond];
      risultato.interpretazioni.push({
        tipo: "condizione",
        segno: cond,
        significato: condSegno.significato,
        azione: condSegno.azione
      });
      risultato.azioni.push(condSegno.azione);
      if (confrontaGravita(condSegno.gravita, risultato.gravita) > 0) {
        risultato.gravita = condSegno.gravita;
      }
    }
  }

  for (var inst in SEGNI_VISIVI.installazione) {
    var instNorm = inst.replace(/_/g, " ");
    if (descLower.indexOf(instNorm) >= 0 || descLower.indexOf(inst) >= 0) {
      var instSegno = SEGNI_VISIVI.installazione[inst];
      risultato.interpretazioni.push({
        tipo: "installazione",
        segno: inst,
        significato: instSegno.significato,
        nota: instSegno.nota
      });
      if (confrontaGravita(instSegno.gravita, risultato.gravita) > 0) {
        risultato.gravita = instSegno.gravita;
      }
    }
  }

  // Collegamento diagnostico: cosa significa per la diagnosi in corso
  if (osservazione.tipo === "anomalia") {
    risultato.collegamento_diagnostico = collegaADiagnosi(osservazione, risultato.interpretazioni);
  }

  if (osservazione.tipo === "misura_visiva") {
    risultato.collegamento_diagnostico = interpretaMisuraVisiva(osservazione);
  }

  if (osservazione.tipo === "targhetta") {
    risultato.collegamento_diagnostico = interpretaTarghetta(osservazione);
  }

  return risultato;
}

// --- Interpreta un set completo di osservazioni (una foto) ---
function interpretaImmagine(osservazioni) {
  if (!osservazioni || !Array.isArray(osservazioni) || osservazioni.length === 0) {
    return { valida: false, errore: "nessuna osservazione" };
  }

  var risultati = [];
  var gravitaMax = "nessuna";
  var azioniTutte = [];
  var anomalie = 0;
  var componentiVisti = [];
  var problemiTrovati = [];

  for (var i = 0; i < osservazioni.length; i++) {
    var ris = interpretaOsservazione(osservazioni[i]);
    risultati.push(ris);

    if (ris.valida) {
      if (confrontaGravita(ris.gravita, gravitaMax) > 0) {
        gravitaMax = ris.gravita;
      }
      for (var a = 0; a < ris.azioni.length; a++) {
        if (azioniTutte.indexOf(ris.azioni[a]) < 0) azioniTutte.push(ris.azioni[a]);
      }
      if (osservazioni[i].tipo === "anomalia") anomalie++;
      if (osservazioni[i].tipo === "componente" && osservazioni[i].componente) {
        componentiVisti.push(osservazioni[i].componente);
      }
      if (ris.interpretazioni.length > 0) {
        problemiTrovati.push({
          descrizione: osservazioni[i].descrizione,
          interpretazioni: ris.interpretazioni,
          gravita: ris.gravita
        });
      }
    }
  }

  return {
    valida: true,
    totale_osservazioni: osservazioni.length,
    anomalie_rilevate: anomalie,
    componenti_visti: componentiVisti,
    gravita_massima: gravitaMax,
    problemi: problemiTrovati,
    azioni_suggerite: azioniTutte,
    dettagli: risultati,
    prossima_foto: suggerisciProssimaFoto(risultati, osservazioni)
  };
}

// --- Confronta due immagini successive ---
function confrontaImmagini(prima, dopo) {
  if (!prima || !dopo) return { valida: false, errore: "servono due set di osservazioni" };

  var cambiamenti = [];

  // Cerca componenti presenti in entrambe con stato diverso
  for (var i = 0; i < dopo.length; i++) {
    if (!dopo[i].componente) continue;

    for (var j = 0; j < prima.length; j++) {
      if (!prima[j].componente) continue;

      if (dopo[i].componente === prima[j].componente) {
        // Stesso componente — cosa è cambiato?
        if (dopo[i].stato !== prima[j].stato) {
          cambiamenti.push({
            componente: dopo[i].componente,
            prima: prima[j].stato || prima[j].descrizione,
            dopo: dopo[i].stato || dopo[i].descrizione,
            tipo: "cambio_stato"
          });
        }
        if (dopo[i].descrizione !== prima[j].descrizione) {
          cambiamenti.push({
            componente: dopo[i].componente,
            prima: prima[j].descrizione,
            dopo: dopo[i].descrizione,
            tipo: "cambio_aspetto"
          });
        }
      }
    }
  }

  // Cerca cose nuove (presenti in dopo ma non in prima)
  for (var k = 0; k < dopo.length; k++) {
    if (!dopo[k].componente) continue;
    var trovato = false;
    for (var l = 0; l < prima.length; l++) {
      if (prima[l].componente === dopo[k].componente) { trovato = true; break; }
    }
    if (!trovato) {
      cambiamenti.push({
        componente: dopo[k].componente,
        prima: "non visibile",
        dopo: dopo[k].descrizione,
        tipo: "nuovo"
      });
    }
  }

  return {
    valida: true,
    cambiamenti: cambiamenti,
    peggiorato: cambiamenti.some(function(c) {
      return c.dopo && (c.dopo.indexOf("peggio") >= 0 || c.dopo.indexOf("annerit") >= 0 ||
             c.dopo.indexOf("fuso") >= 0 || c.dopo.indexOf("brucia") >= 0);
    }),
    migliorato: cambiamenti.some(function(c) {
      return c.dopo && (c.dopo.indexOf("pulito") >= 0 || c.dopo.indexOf("serrato") >= 0 ||
             c.dopo.indexOf("sostituito") >= 0 || c.dopo.indexOf("nuovo") >= 0);
    })
  };
}

// --- Aggiorna il world model con quello che vedo ---
function aggiornaWorldModel(worldModel, osservazioni) {
  if (!worldModel || !osservazioni) return worldModel;

  for (var i = 0; i < osservazioni.length; i++) {
    var oss = osservazioni[i];

    // Se vedo un componente con uno stato, aggiorno il world model
    if (oss.componente && oss.stato) {
      WorldModel.aggiorna(worldModel, {
        fatto: oss.componente + " " + oss.stato
      });
    }

    // Se vedo una misura su un display/multimetro
    if (oss.tipo === "misura_visiva" && oss.valore) {
      WorldModel.aggiorna(worldModel, {
        misura: {
          punto: oss.componente || oss.posizione || "sconosciuto",
          grandezza: oss.grandezza || "tensione",
          valore: oss.valore,
          unita: oss.unita || "V"
        }
      });
    }

    // Se vedo un'anomalia su un componente
    if (oss.tipo === "anomalia" && oss.componente) {
      WorldModel.aggiorna(worldModel, {
        componente: oss.componente
      });
      // Marca come sospetto
      var nodo = worldModel.trovaNodoPerNome(oss.componente);
      if (nodo) {
        nodo.sospetto = true;
        nodo.diagnostica.anomalie.push(oss.descrizione);
      }
    }
  }

  return worldModel;
}

// ============================================================================
// MEMORIA VISIVA — Cosa ho già visto in questo caso
// ============================================================================

var memoriaVisiva = [];
var maxMemoria = 20; // massimo 20 immagini per caso

function registraImmagine(osservazioni, interpretazione) {
  if (memoriaVisiva.length >= maxMemoria) {
    memoriaVisiva.shift(); // FIFO
  }
  memoriaVisiva.push({
    timestamp: Date.now(),
    osservazioni: osservazioni,
    interpretazione: interpretazione
  });
}

function getMemoriaVisiva() {
  return memoriaVisiva.slice();
}

function resetMemoriaVisiva() {
  memoriaVisiva = [];
}

function getStoriaVisiva() {
  return memoriaVisiva.map(function(m, idx) {
    return {
      indice: idx,
      timestamp: m.timestamp,
      anomalie: m.interpretazione ? m.interpretazione.anomalie_rilevate : 0,
      gravita: m.interpretazione ? m.interpretazione.gravita_massima : "nessuna",
      componenti: m.interpretazione ? m.interpretazione.componenti_visti : []
    };
  });
}

// ============================================================================
// SUGGERISCI PROSSIMA FOTO — Cosa devo guardare adesso?
// ============================================================================

function suggerisciProssimaFoto(risultati, osservazioni) {
  var suggerimenti = [];

  // Se ho visto anomalie, chiedi dettaglio
  for (var i = 0; i < risultati.length; i++) {
    if (risultati[i].gravita === "alta" || risultati[i].gravita === "critica") {
      suggerimenti.push({
        cosa: "foto ravvicinata del punto con anomalia: " + (osservazioni[i].descrizione || ""),
        perche: "serve vedere meglio il danno per capire la causa",
        priorita: "alta"
      });
    }
  }

  // Se ho visto componenti ma non i morsetti
  var haComponenti = osservazioni.some(function(o) { return o.tipo === "componente"; });
  var haAnomalieMorsetti = osservazioni.some(function(o) {
    return o.descrizione && o.descrizione.toLowerCase().indexOf("morsett") >= 0;
  });
  if (haComponenti && !haAnomalieMorsetti) {
    suggerimenti.push({
      cosa: "foto dei morsetti di collegamento",
      perche: "i morsetti allentati sono la causa più comune di problemi — devo vederli",
      priorita: "media"
    });
  }

  // Se non ho visto il quadro generale
  var haQuadro = osservazioni.some(function(o) {
    return o.descrizione && (o.descrizione.toLowerCase().indexOf("quadro") >= 0 ||
           o.descrizione.toLowerCase().indexOf("centralino") >= 0);
  });
  if (!haQuadro) {
    suggerimenti.push({
      cosa: "foto del quadro elettrico aperto",
      perche: "dal quadro vedo le protezioni, i cavi, lo stato generale dell'impianto",
      priorita: "media"
    });
  }

  // Se ho visto cavi ma non la sezione
  var haCavi = osservazioni.some(function(o) {
    return o.descrizione && o.descrizione.toLowerCase().indexOf("cavo") >= 0;
  });
  if (haCavi) {
    suggerimenti.push({
      cosa: "foto della targhetta del cavo o della sezione visibile",
      perche: "la sezione mi dice se il cavo è adeguato per il carico",
      priorita: "bassa"
    });
  }

  // Ordina per priorità
  var ordine = { alta: 0, media: 1, bassa: 2 };
  suggerimenti.sort(function(a, b) {
    return (ordine[a.priorita] || 2) - (ordine[b.priorita] || 2);
  });

  return suggerimenti.length > 0 ? suggerimenti[0] : null;
}

// ============================================================================
// COLLEGAMENTO DIAGNOSTICO — Cosa significa per la diagnosi
// ============================================================================

function collegaADiagnosi(osservazione, interpretazioni) {
  if (!interpretazioni || interpretazioni.length === 0) return null;

  var ipotesi = [];

  for (var i = 0; i < interpretazioni.length; i++) {
    var int = interpretazioni[i];

    if (int.tipo === "colore") {
      if (int.segno === "nero" || int.segno === "annerito" || int.segno === "bruciato") {
        ipotesi.push({
          causa: "connessione ad alta resistenza o arco elettrico",
          confidenza: 0.8,
          verifica: "misura resistenza di contatto, controllare serraggio morsetto"
        });
      }
      if (int.segno === "verde") {
        ipotesi.push({
          causa: "umidità prolungata — possibile dispersione",
          confidenza: 0.7,
          verifica: "misura isolamento, cercare fonte di umidità"
        });
      }
      if (int.segno === "fuso") {
        ipotesi.push({
          causa: "cortocircuito o sovraccarico grave",
          confidenza: 0.9,
          verifica: "sostituire il componente, verificare il circuito a valle"
        });
      }
    }

    if (int.tipo === "condizione") {
      if (int.segno === "screpolato") {
        ipotesi.push({
          causa: "isolamento degradato — rischio dispersione",
          confidenza: 0.75,
          verifica: "misura isolamento del cavo, sostituire se < 1 MOhm"
        });
      }
      if (int.segno === "gonfio") {
        ipotesi.push({
          causa: "surriscaldamento interno — componente da sostituire",
          confidenza: 0.85,
          verifica: "togliere tensione e sostituire immediatamente"
        });
      }
      if (int.segno === "bagnato" || int.segno === "condensa") {
        ipotesi.push({
          causa: "umidità — causa di dispersione intermittente",
          confidenza: 0.7,
          verifica: "asciugare, misurare isolamento, trovare la fonte"
        });
      }
    }

    if (int.tipo === "installazione") {
      if (int.segno === "pe_non_collegato") {
        ipotesi.push({
          causa: "terra assente — pericolo elettrocuzione",
          confidenza: 0.95,
          verifica: "URGENTE: collegare il PE, verificare continuità terra"
        });
      }
      if (int.segno === "nastro_isolante") {
        ipotesi.push({
          causa: "giunta non a norma — possibile punto debole",
          confidenza: 0.6,
          verifica: "rifare la giunta con morsetto adeguato"
        });
      }
    }
  }

  return ipotesi.length > 0 ? ipotesi : null;
}

function interpretaMisuraVisiva(osservazione) {
  if (osservazione.valore === undefined || osservazione.valore === null) return null;

  var v = parseFloat(osservazione.valore);
  if (isNaN(v)) return null;

  var risultato = { valore: v, interpretazione: null };

  var desc = (osservazione.descrizione || "").toLowerCase();

  // Tensione
  if (desc.indexOf("volt") >= 0 || desc.indexOf("tensione") >= 0 || desc.indexOf(" v") >= 0) {
    if (v < 1) risultato.interpretazione = "tensione assente — circuito aperto o senza alimentazione";
    else if (v > 0 && v < 50) risultato.interpretazione = "tensione residua — possibile ritorno capacitivo o induttivo";
    else if (v >= 210 && v <= 245) risultato.interpretazione = "tensione normale monofase";
    else if (v >= 380 && v <= 420) risultato.interpretazione = "tensione normale trifase concatenata";
    else if (v > 245 && v < 380) risultato.interpretazione = "tensione anomala — verificare neutro e carichi";
    else if (v > 420) risultato.interpretazione = "SOVRATENSIONE — pericolo per gli apparecchi";
    else if (v >= 50 && v < 210) risultato.interpretazione = "sottotensione — possibile caduta di tensione o neutro degradato";
  }

  // Corrente
  if (desc.indexOf("ampere") >= 0 || desc.indexOf("corrente") >= 0 || desc.indexOf(" a") >= 0) {
    if (v === 0) risultato.interpretazione = "nessuna corrente — circuito aperto o carico spento";
    else if (v > 0 && v <= 32) risultato.interpretazione = "corrente nel range domestico";
    else if (v > 32) risultato.interpretazione = "corrente elevata — verificare protezioni e sezione cavi";
  }

  return risultato;
}

function interpretaTarghetta(osservazione) {
  if (!osservazione.descrizione) return null;

  var desc = osservazione.descrizione.toLowerCase();
  var dati = {};

  // Estrai potenza
  var matchW = desc.match(/(\d+[\.,]?\d*)\s*(w|kw|watt)/);
  if (matchW) {
    dati.potenza = parseFloat(matchW[1].replace(",", "."));
    if (matchW[2] === "kw") dati.potenza *= 1000;
  }

  // Estrai tensione
  var matchV = desc.match(/(\d+)\s*(v|volt)/);
  if (matchV) dati.tensione = parseInt(matchV[1]);

  // Estrai corrente
  var matchA = desc.match(/(\d+[\.,]?\d*)\s*(a|ampere)/);
  if (matchA) dati.corrente = parseFloat(matchA[1].replace(",", "."));

  // Estrai IP
  var matchIP = desc.match(/ip\s*(\d{2})/);
  if (matchIP) dati.grado_protezione = "IP" + matchIP[1];

  return Object.keys(dati).length > 0 ? dati : null;
}

// ============================================================================
// UTILITY
// ============================================================================

function confrontaGravita(a, b) {
  var ordine = { nessuna: 0, bassa: 1, media: 2, alta: 3, critica: 4 };
  return (ordine[a] || 0) - (ordine[b] || 0);
}

// ============================================================================
// STATS
// ============================================================================

function getStats() {
  return {
    segni_colore: Object.keys(SEGNI_VISIVI.colori).length,
    segni_condizione: Object.keys(SEGNI_VISIVI.condizioni).length,
    segni_installazione: Object.keys(SEGNI_VISIVI.installazione).length,
    memoria_visiva: memoriaVisiva.length,
    tipi_osservazione: VISUAL_SCHEMA.tipi.length
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Interpretazione
  interpretaOsservazione: interpretaOsservazione,
  interpretaImmagine: interpretaImmagine,
  confrontaImmagini: confrontaImmagini,

  // World Model
  aggiornaWorldModel: aggiornaWorldModel,

  // Memoria visiva
  registraImmagine: registraImmagine,
  getMemoriaVisiva: getMemoriaVisiva,
  resetMemoriaVisiva: resetMemoriaVisiva,
  getStoriaVisiva: getStoriaVisiva,

  // Diagnostica
  suggerisciProssimaFoto: suggerisciProssimaFoto,

  // Stats
  getStats: getStats,

  // Costanti (esposte per test)
  VISUAL_SCHEMA: VISUAL_SCHEMA,
  SEGNI_VISIVI: SEGNI_VISIVI
};
