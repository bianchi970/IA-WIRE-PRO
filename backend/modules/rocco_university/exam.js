/**
 * ROCCO UNIVERSITY — Sistema Esami
 * Esami per materia, certificazione competenze, studio mai bloccato
 */

// Banca domande per materia (sample — espandibile via DB o AI)
const DOMANDE_ESAMI = {
  elettrotecnica: [
    {
      id: 'EL001',
      domanda: 'Un resistore da 470Ω è alimentato a 12V. Quale corrente circola?',
      dati: { V: 12, R: 470 },
      formula_id: 'legge_ohm',
      soluzione: 'I = V/R = 12/470 ≈ 0.0255A = 25.5mA',
      risposta_attesa: 0.0255,
      unita: 'A',
      tolleranza_percent: 5
    },
    {
      id: 'EL002',
      domanda: 'Calcola la potenza attiva di un carico monofase: V=230V, I=8A, cosφ=0.85',
      dati: { V: 230, I: 8, cosphi: 0.85 },
      formula_id: 'potenza_monofase',
      soluzione: 'P = V × I × cosφ = 230 × 8 × 0.85 = 1564W',
      risposta_attesa: 1564,
      unita: 'W',
      tolleranza_percent: 2
    },
    {
      id: 'EL003',
      domanda: 'Tre resistori da 10Ω, 20Ω e 30Ω sono collegati in serie. Qual è la resistenza totale?',
      dati: { resistenze: [10, 20, 30] },
      formula_id: 'resistenza_serie',
      soluzione: 'R_eq = 10+20+30 = 60Ω',
      risposta_attesa: 60,
      unita: 'Ω',
      tolleranza_percent: 1
    },
    {
      id: 'EL004',
      domanda: 'Un motore trifase assorbe I=12A dalla rete 400V con cosφ=0.82. Calcola la potenza attiva.',
      dati: { V_L: 400, I_L: 12, cosphi: 0.82 },
      formula_id: 'potenza_trifase',
      soluzione: 'P = √3 × 400 × 12 × 0.82 = 6818W ≈ 6.8kW',
      risposta_attesa: 6818,
      unita: 'W',
      tolleranza_percent: 2
    },
    {
      id: 'EL005',
      domanda: 'Quanto costa far funzionare un motore da 4kW per 8 ore al giorno per 22 giorni lavorativi? (0.25€/kWh)',
      dati: { P: 4000, t: 8 * 22, costo_kwh: 0.25 },
      formula_id: 'energia_elettrica',
      soluzione: 'E = 4kW × 176h = 704kWh → Costo = 704 × 0.25 = 176€',
      risposta_attesa: 176,
      unita: '€',
      tolleranza_percent: 1
    }
  ],
  impianti_elettrici: [
    {
      id: 'IMP001',
      domanda: 'Calcola la caduta di tensione su un cavo in Cu monofase: L=30m, I=16A, S=2.5mm²',
      dati: { L: 30, I: 16, S: 2.5, materiale: 'Cu', sistema: 'monofase' },
      formula_id: 'caduta_tensione',
      soluzione: 'ΔV = (2 × 0.0175 × 30 × 16) / 2.5 = 6.72V',
      risposta_attesa: 6.72,
      unita: 'V',
      tolleranza_percent: 5
    }
  ],
  diagnosi_guasti: [
    {
      id: 'DG001',
      domanda: 'Un motore asincrono trifase da 400V assorbe 18A invece dei 12A nominali a pieno carico. Quali sono le cause più probabili?',
      tipo: 'aperta',
      dati: { I_misurata: 18, I_nominale: 12, V: 400 },
      soluzione: 'Sovraccarico meccanico (attrito, bloccaggio parziale), cortocircuito parziale avvolgimenti, squilibrio tensioni rete, ventilazione insufficiente con surriscaldamento',
      punti: 3
    }
  ]
};

/**
 * Genera esame per materia
 * @param {string} materiaId - ID materia
 * @param {number} nDomande - Numero domande (default 5)
 * @returns {object} - Esame con domande selezionate
 */
function generaEsame(materiaId, nDomande = 5) {
  const pool_domande = DOMANDE_ESAMI[materiaId] || [];
  if (pool_domande.length === 0) {
    return { errore: `Nessuna domanda disponibile per la materia '${materiaId}'` };
  }
  // Seleziona domande in modo casuale
  const selezionate = [...pool_domande]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(nDomande, pool_domande.length));

  // Rimuovi le soluzioni per l'output all'utente
  const domande_senza_soluzione = selezionate.map(({ soluzione, risposta_attesa, ...d }) => d);

  return {
    materia: materiaId,
    n_domande: selezionate.length,
    domande: domande_senza_soluzione,
    _soluzioni: selezionate.map(d => ({ id: d.id, soluzione: d.soluzione, risposta_attesa: d.risposta_attesa, tolleranza: d.tolleranza_percent })),
    timestamp_inizio: new Date().toISOString()
  };
}

/**
 * Valuta risposta a domanda numerica
 * @param {object} domanda - Domanda con risposta_attesa
 * @param {number} risposta_utente - Risposta numerica dell'utente
 */
function valutaRisposta(domanda, risposta_utente) {
  if (!domanda.risposta_attesa) {
    return { tipo: 'manuale', messaggio: 'Risposta aperta — valutazione manuale richiesta' };
  }
  const scarto = Math.abs(risposta_utente - domanda.risposta_attesa) / domanda.risposta_attesa * 100;
  const corretto = scarto <= (domanda.tolleranza_percent || 5);
  return {
    corretto,
    risposta_data: risposta_utente,
    risposta_attesa: domanda.risposta_attesa,
    scarto_percent: parseFloat(scarto.toFixed(2)),
    soluzione: domanda.soluzione,
    messaggio: corretto
      ? `✅ Corretto! Scarto: ${scarto.toFixed(1)}%`
      : `❌ Errato. Risposta attesa: ${domanda.risposta_attesa} (scarto: ${scarto.toFixed(1)}%)\n📖 ${domanda.soluzione}`
  };
}

/**
 * REGOLA ESAMI: lo studio non viene mai bloccato
 * L'esame certifica le competenze già acquisite
 */
const REGOLE_ESAME = {
  soglia_superamento_percent: 60,
  tentativi_illimitati: true,
  studio_mai_bloccato: true,
  nota: 'L\'esame non blocca lo studio — serve solo a certificare le competenze superate'
};

module.exports = { DOMANDE_ESAMI, generaEsame, valutaRisposta, REGOLE_ESAME };
