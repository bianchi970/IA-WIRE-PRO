"use strict";

/**
 * I LIMITI NORMATIVI DI ROCCO — un posto solo.
 *
 * Prima di questo file gli stessi numeri vivevano in sei posti diversi:
 * `NOMINAL_VOLTAGE = 230` nel motore, `iso < 1` scritto due volte in
 * `diagnosticEngine.js`, un'altra volta in `CONFIRM_RULES` e un'altra in
 * `KILL_RULES`, l'intero inviluppo di addestramento a mano in
 * `neural_patterns.js`, e un elenco di numeri ammessi in `narrator.js`.
 *
 * Non era un problema estetico: **erano già divergenti.** La temperatura
 * limite su una connessione valeva 70 °C nella regola che conferma un guasto
 * e 80 °C nel fatto che il motore deriva dalla misura. Due "normale"
 * diversi nello stesso sistema, e nessuno dei due insegnato dalla scuola.
 *
 * ── Il legame con la scuola ──────────────────────────────────────────
 *
 * ROCCO ha già una scuola: `rocco_v2/neural/curriculum.js`, 22 livelli, con
 * le norme citate (`norme[].codice`) e le grandezze insegnate
 * (`misure[].valore_tipico`, in prosa: "230V ±10%", ">1MΩ (nuovo >100MΩ)").
 * Il numero però era leggibile solo da un umano, mentre il motore aveva il
 * suo letterale: nulla li teneva insieme, e hanno divergito.
 *
 * Qui ogni limite dichiara da dove viene — `livello` e `misura` puntano al
 * punto del curriculum che lo insegna, `norma` al codice che quel livello
 * cita. `limiti.test.js` verifica che quel punto esista davvero e che il
 * numero compaia nel testo che la scuola insegna: se qualcuno cambia il
 * curriculum o questa tabella senza allineare l'altra, il test lo dice.
 *
 * ── Norma o pratica ─────────────────────────────────────────────────
 *
 * Tre provenienze, in ordine di forza:
 *
 *   `norma`    il numero viene da una norma che il curriculum cita
 *              (`norma` contiene il codice: CEI 64-8/6, CEI EN 50160…).
 *   `scuola`   il curriculum lo insegna come valore della materia, senza
 *              appoggiarlo a un codice. Vale, ma non è una prescrizione.
 *   `pratica`  riferimento di mestiere che la scuola **non** insegna.
 *              Resta usabile, ma è dichiarato per quello che è.
 *
 * `soloPratica()` li elenca: si vede a colpo d'occhio chi è nudo. Perché se
 * ROCCO non sa, non deve far finta di sapere.
 */

// ── La tabella ────────────────────────────────────────────────────────
//
// valore      il numero su cui si decide
// unita       l'unità in cui il valore è espresso
// confronto   "min" = sano se ≥ valore · "max" = sano se ≤ valore
//             "nominale" = valore atteso, con `tolleranza` · "riferimento"
// etichetta   come si scrive in italiano quando finisce in una risposta
// norma       il codice citato dal livello di curriculum
// livello     il livello che lo insegna (curriculum.LIVELLI[].id)
// misura      la grandezza dentro quel livello (misure[].grandezza)
// fonte       "norma" (codice citato) · "scuola" (il curriculum lo insegna)
//             · "pratica" (riferimento di mestiere, non insegnato)
var LIMITI = {

  // ── Isolamento ──────────────────────────────────────────────────────
  isolamento_minimo: {
    grandezza: "isolamento", valore: 1, unita: "MOhm", confronto: "min",
    etichetta: "1 MOhm",
    norma: "CEI 64-8/6", livello: "L05", misura: "isolamento", fonte: "norma",
    nota: "sotto questa soglia l'isolamento è guasto; un impianto nuovo sta sopra 100 MOhm"
  },
  isolamento_nuovo: {
    grandezza: "isolamento", valore: 100, unita: "MOhm", confronto: "min",
    etichetta: "100 MOhm",
    norma: "CEI 64-8/6", livello: "L05", misura: "isolamento", fonte: "norma",
    nota: "valore atteso su impianto o avvolgimento nuovo"
  },

  // ── Tensione ────────────────────────────────────────────────────────
  tensione_fase_neutro: {
    grandezza: "tensione", valore: 230, unita: "V", confronto: "nominale",
    tolleranza: 0.10, etichetta: "230V ±10%",
    norma: "CEI 64-8/1", livello: "L03", misura: "tensione_fase_neutro", fonte: "norma",
    nota: "rete BT monofase italiana; la tolleranza del ±10% è di CEI EN 50160"
  },
  tensione_fase_fase: {
    grandezza: "tensione", valore: 400, unita: "V", confronto: "nominale",
    tolleranza: 0.10, etichetta: "400V ±10%",
    norma: "CEI 64-8/1", livello: "L03", misura: "tensione_fase_fase", fonte: "norma"
  },
  tensione_neutro_terra: {
    grandezza: "tensione", valore: 10, unita: "V", confronto: "max",
    etichetta: "10V",
    norma: "CEI 64-8/1", livello: "L03", misura: "tensione_neutro_terra", fonte: "norma",
    nota: "oltre questo valore il neutro ha una caduta anomala"
  },
  tensione_contatto_limite: {
    grandezza: "tensione", valore: 50, unita: "V", confronto: "max",
    etichetta: "50V",
    norma: "CEI 64-8/4", livello: "L06", misura: null, fonte: "norma",
    nota: "tensione di contatto limite convenzionale in alternata: entra nella condizione R_t x I_dn <= 50V"
  },

  // ── Frequenza ───────────────────────────────────────────────────────
  frequenza_nominale: {
    grandezza: "frequenza", valore: 50, unita: "Hz", confronto: "nominale",
    tolleranza: 0.01, etichetta: "50Hz ±0.5Hz",
    norma: null, livello: "L02", misura: "frequenza", fonte: "scuola",
    nota: "±0.5 Hz, cioè l'1% del nominale"
  },

  // ── Continuità e terra ──────────────────────────────────────────────
  continuita_conduttore: {
    grandezza: "resistenza", valore: 1, unita: "Ohm", confronto: "max",
    etichetta: "1 Ohm",
    norma: "CEI 64-8/6", livello: "L05", misura: "continuita_PE", fonte: "norma",
    nota: "un conduttore sano sta sotto 1 Ohm; sopra, cercare la giunzione"
  },
  resistenza_terra: {
    grandezza: "resistenza", valore: 200, unita: "Ohm", confronto: "max",
    etichetta: "200 Ohm",
    norma: "CEI 64-8/6", livello: "L05", misura: "resistenza_terra", fonte: "norma",
    nota: "con differenziale da 30 mA; deriva da R_t x I_dn <= 50V"
  },
  corrente_differenziale_civile: {
    grandezza: "corrente_ma", valore: 30, unita: "mA", confronto: "riferimento",
    etichetta: "30mA",
    norma: "CEI 64-8/4", livello: "L06", misura: null, fonte: "norma",
    nota: "I_dn del differenziale per la protezione delle persone negli impianti civili"
  },

  // ── Qualità della tensione ──────────────────────────────────────────
  squilibrio_tensioni: {
    grandezza: "squilibrio", valore: 2, unita: "%", confronto: "max",
    etichetta: "2%",
    norma: "CEI 64-8/1", livello: "L03", misura: "squilibrio_tensioni", fonte: "norma"
  },
  thd_tensione: {
    grandezza: "thd", valore: 8, unita: "%", confronto: "max",
    etichetta: "8%",
    norma: "CEI EN 50160", livello: "L04", misura: "THD", fonte: "norma",
    nota: "THD_V; sulla corrente il limite è 20%"
  },
  caduta_tensione: {
    grandezza: "caduta", valore: 4, unita: "%", confronto: "max",
    etichetta: "4%",
    norma: null, livello: "L01", misura: "caduta_tensione", fonte: "scuola",
    nota: "circuiti terminali"
  },

  // ── Termico ─────────────────────────────────────────────────────────
  //
  // Qui la scuola NON insegna una temperatura assoluta: insegna il
  // confronto fra le fasi (CEI 11-27, livello L20) e le classi di
  // isolamento degli avvolgimenti (B=130, F=155, H=180 °C).
  // La soglia assoluta su una connessione resta utile quando c'è una sola
  // lettura, ma è dichiarata `pratica`: valeva 70 in una regola e 80 in
  // un'altra, e nessuno dei due numeri veniva da una norma.
  delta_t_fasi_ok: {
    grandezza: "temperatura", valore: 10, unita: "°C", confronto: "max",
    etichetta: "10 °C",
    norma: "CEI 11-27", livello: "L20", misura: "profilo termico", fonte: "norma",
    nota: "differenza fra le fasi: sotto 10 °C il profilo termico è regolare"
  },
  delta_t_fasi_critico: {
    grandezza: "temperatura", valore: 30, unita: "°C", confronto: "max",
    etichetta: "30 °C",
    norma: "CEI 11-27", livello: "L20", misura: "profilo termico", fonte: "norma",
    nota: "differenza fra le fasi oltre la quale la situazione è critica"
  },
  temperatura_connessione: {
    grandezza: "temperatura", valore: 80, unita: "°C", confronto: "max",
    etichetta: "80 °C",
    norma: null, livello: null, misura: null, fonte: "pratica",
    nota: "riferimento di mestiere su un morsetto, da usare quando non c'è il confronto fra fasi. NON è una norma: la norma è il delta_t"
  },

  // ── Correnti ────────────────────────────────────────────────────────
  corrente_circuito_domestico: {
    grandezza: "corrente", valore: 16, unita: "A", confronto: "riferimento",
    etichetta: "16A",
    norma: "CEI EN 60898", livello: "L06", misura: null, fonte: "norma",
    nota: "calibro tipico di un circuito prese civile; i calibri normalizzati sono 6/10/16/20/25/32/40/63 A"
  },
  spunto_motore: {
    grandezza: "corrente", valore: 6, unita: "x In", confronto: "riferimento",
    etichetta: "6-8 volte la corrente nominale",
    norma: null, livello: "L18", misura: "corrente spunto motore", fonte: "scuola",
    nota: "per 1-3 secondi all'avviamento"
  },

  // ── Resistenze di contatto ──────────────────────────────────────────
  contatto_sano: {
    grandezza: "resistenza", valore: 1, unita: "mOhm", confronto: "max",
    etichetta: "1 mOhm",
    norma: null, livello: "L19", misura: "resistenza di contatto", fonte: "scuola"
  },
  contatto_compromesso: {
    grandezza: "resistenza", valore: 100, unita: "mOhm", confronto: "min",
    etichetta: "100 mOhm",
    norma: null, livello: "L19", misura: "resistenza di contatto", fonte: "scuola"
  },

  // ── Tempi di intervento ─────────────────────────────────────────────
  tempo_rcd_idn: {
    grandezza: "tempo", valore: 300, unita: "ms", confronto: "max",
    etichetta: "300ms",
    norma: "CEI 64-8/6", livello: "L05", misura: "tempo_intervento_RCD", fonte: "norma",
    nota: "a I_dn, tipo AC/A; a 5 x I_dn il limite è 40 ms"
  },
  tempo_rcd_5idn: {
    grandezza: "tempo", valore: 40, unita: "ms", confronto: "max",
    etichetta: "40ms",
    norma: "CEI 64-8/6", livello: "L05", misura: "tempo_intervento_RCD", fonte: "norma"
  }
};

// ── Lettura ───────────────────────────────────────────────────────────

function limite(id) {
  return LIMITI[id] || null;
}

/** Il numero su cui si decide. Lancia se l'id non esiste: un limite
 *  inesistente è un difetto, non un valore di ripiego. */
function valore(id) {
  var l = LIMITI[id];
  if (!l) throw new Error("limite normativo inesistente: " + id);
  return l.valore;
}

/** Come si scrive in italiano dentro una risposta. */
function etichetta(id) {
  var l = LIMITI[id];
  return l ? l.etichetta : "";
}

/** Estremi di un valore nominale con tolleranza: 230V ±10% → [207, 253]. */
function intervallo(id) {
  var l = LIMITI[id];
  if (!l || typeof l.tolleranza !== "number") return null;
  return [l.valore * (1 - l.tolleranza), l.valore * (1 + l.tolleranza)];
}

function tutti() {
  return Object.keys(LIMITI).map(function (id) {
    var l = LIMITI[id];
    return {
      id: id, grandezza: l.grandezza, valore: l.valore, unita: l.unita,
      confronto: l.confronto, tolleranza: l.tolleranza || null,
      etichetta: l.etichetta, norma: l.norma || null,
      livello: l.livello || null, misura: l.misura || null,
      fonte: l.fonte, nota: l.nota || null
    };
  });
}

/** Quelli che la scuola non insegna: si vedono a colpo d'occhio. */
function soloPratica() {
  return tutti().filter(function (l) { return l.fonte !== "norma"; });
}

/**
 * I numeri che il narratore può scrivere senza che siano nei dati del caso.
 *
 * Erano un elenco a mano in `narrator.js`. Ora i limiti vengono da qui, e
 * restano a mano solo i valori normalizzati che non sono limiti: i calibri
 * degli interruttori e le tensioni di prova del megger.
 */
var CALIBRI_E_TENSIONI_DI_PROVA = [
  6, 10, 12, 16, 20, 24, 25, 32, 40, 63,   // In MCB e tensioni ausiliarie
  100, 250, 300, 500, 1000,                 // tensioni di prova del megger
  0.5, 2                                     // soglie e moduli d'uso comune
];

function numeriNormativi() {
  var visti = {};
  var out = [];
  function aggiungi(n) {
    if (typeof n !== "number" || !isFinite(n)) return;
    // 230 * 1.10 fa 253.00000000000003: un numero che non comparirebbe mai
    // in una risposta e che il narratore vedrebbe come non ammesso.
    n = Math.round(n * 1000) / 1000;
    if (visti[n]) return;
    visti[n] = true;
    out.push(n);
  }
  Object.keys(LIMITI).forEach(function (id) {
    var l = LIMITI[id];
    aggiungi(l.valore);
    if (typeof l.tolleranza === "number") {
      aggiungi(l.valore * (1 - l.tolleranza));
      aggiungi(l.valore * (1 + l.tolleranza));
    }
  });
  CALIBRI_E_TENSIONI_DI_PROVA.forEach(aggiungi);
  return out;
}

module.exports = {
  LIMITI: LIMITI,
  limite: limite,
  valore: valore,
  etichetta: etichetta,
  intervallo: intervallo,
  tutti: tutti,
  soloPratica: soloPratica,
  numeriNormativi: numeriNormativi,
  CALIBRI_E_TENSIONI_DI_PROVA: CALIBRI_E_TENSIONI_DI_PROVA
};
