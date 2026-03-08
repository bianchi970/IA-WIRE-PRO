/**
 * ROCCO UNIVERSITY — Formula Engine
 * Archivio formule con calcolo numerico integrato
 */

const FORMULE = {
  legge_ohm: {
    id: 'legge_ohm',
    materia: 'elettrotecnica',
    nome: 'Legge di Ohm',
    formula: 'V = R × I',
    variabili: {
      V: { nome: 'Tensione', unita: 'V', descrizione: 'Differenza di potenziale ai capi del resistore' },
      R: { nome: 'Resistenza', unita: 'Ω', descrizione: 'Resistenza elettrica del componente' },
      I: { nome: 'Corrente', unita: 'A', descrizione: 'Corrente che scorre nel circuito' }
    },
    significato: 'La tensione ai capi di un resistore è proporzionale alla corrente che lo attraversa',
    esempio: 'R=100Ω, I=0.5A → V = 100 × 0.5 = 50V',
    applicazione_pratica: 'Calcolo caduta di tensione su un conduttore o componente resistivo',
    calcola: (dati) => {
      if (dati.R !== undefined && dati.I !== undefined) return { V: dati.R * dati.I };
      if (dati.V !== undefined && dati.I !== undefined) return { R: dati.V / dati.I };
      if (dati.V !== undefined && dati.R !== undefined) return { I: dati.V / dati.R };
      return null;
    }
  },

  potenza_monofase: {
    id: 'potenza_monofase',
    materia: 'elettrotecnica',
    nome: 'Potenza Attiva Monofase',
    formula: 'P = V × I × cos(φ)',
    variabili: {
      P: { nome: 'Potenza attiva', unita: 'W', descrizione: 'Potenza realmente consumata' },
      V: { nome: 'Tensione', unita: 'V', descrizione: 'Tensione di fase' },
      I: { nome: 'Corrente', unita: 'A', descrizione: 'Corrente di linea' },
      cosphi: { nome: 'Fattore di potenza', unita: '-', descrizione: 'cos(φ), tra 0 e 1' }
    },
    significato: 'Potenza attiva in un circuito CA monofase con carico non puramente resistivo',
    esempio: 'V=230V, I=10A, cosφ=0.9 → P = 230 × 10 × 0.9 = 2070W',
    applicazione_pratica: 'Dimensionamento cavi, protezioni, calcolo consumi',
    calcola: (dati) => {
      if (dati.V !== undefined && dati.I !== undefined && dati.cosphi !== undefined)
        return { P: dati.V * dati.I * dati.cosphi };
      if (dati.P !== undefined && dati.V !== undefined && dati.cosphi !== undefined)
        return { I: dati.P / (dati.V * dati.cosphi) };
      return null;
    }
  },

  potenza_trifase: {
    id: 'potenza_trifase',
    materia: 'elettrotecnica',
    nome: 'Potenza Attiva Trifase',
    formula: 'P = √3 × V_L × I_L × cos(φ)',
    variabili: {
      P: { nome: 'Potenza attiva', unita: 'W', descrizione: 'Potenza totale trifase' },
      V_L: { nome: 'Tensione di linea', unita: 'V', descrizione: 'Tensione concatenata (es. 400V)' },
      I_L: { nome: 'Corrente di linea', unita: 'A', descrizione: 'Corrente per fase' },
      cosphi: { nome: 'Fattore di potenza', unita: '-', descrizione: 'cos(φ)' }
    },
    significato: 'Potenza attiva totale in sistema trifase bilanciato',
    esempio: 'V_L=400V, I_L=15A, cosφ=0.85 → P = 1.732 × 400 × 15 × 0.85 = 8816W ≈ 8.8kW',
    applicazione_pratica: 'Calcolo potenza motori, dimensionamento impianti industriali',
    calcola: (dati) => {
      const sqrt3 = Math.sqrt(3);
      if (dati.V_L !== undefined && dati.I_L !== undefined && dati.cosphi !== undefined)
        return { P: sqrt3 * dati.V_L * dati.I_L * dati.cosphi };
      if (dati.P !== undefined && dati.V_L !== undefined && dati.cosphi !== undefined)
        return { I_L: dati.P / (sqrt3 * dati.V_L * dati.cosphi) };
      return null;
    }
  },

  resistenza_serie: {
    id: 'resistenza_serie',
    materia: 'elettrotecnica',
    nome: 'Resistenza Equivalente in Serie',
    formula: 'R_eq = R1 + R2 + ... + Rn',
    variabili: {
      R_eq: { nome: 'Resistenza equivalente', unita: 'Ω', descrizione: 'Resistenza totale del circuito serie' },
      Rn: { nome: 'Resistenze singole', unita: 'Ω', descrizione: 'Valore di ciascuna resistenza' }
    },
    significato: 'In un circuito serie le resistenze si sommano',
    esempio: 'R1=10Ω, R2=22Ω, R3=4.7Ω → R_eq = 36.7Ω',
    applicazione_pratica: 'Calcolo resistenza totale conduttori in serie, caduta tensione cumulativa',
    calcola: (dati) => {
      if (Array.isArray(dati.resistenze))
        return { R_eq: dati.resistenze.reduce((a, b) => a + b, 0) };
      return null;
    }
  },

  resistenza_parallelo: {
    id: 'resistenza_parallelo',
    materia: 'elettrotecnica',
    nome: 'Resistenza Equivalente in Parallelo',
    formula: '1/R_eq = 1/R1 + 1/R2 + ... + 1/Rn',
    variabili: {
      R_eq: { nome: 'Resistenza equivalente', unita: 'Ω', descrizione: 'Resistenza totale del circuito parallelo' },
      Rn: { nome: 'Resistenze singole', unita: 'Ω', descrizione: 'Valore di ciascuna resistenza' }
    },
    significato: 'In parallelo la resistenza equivalente è sempre minore della minima resistenza presente',
    esempio: 'R1=100Ω, R2=100Ω → R_eq = 50Ω',
    applicazione_pratica: 'Calcolo resistenza di messa a terra, conduttori in parallelo',
    calcola: (dati) => {
      if (Array.isArray(dati.resistenze) && dati.resistenze.every(r => r > 0)) {
        const inv_sum = dati.resistenze.reduce((a, b) => a + 1/b, 0);
        return { R_eq: 1 / inv_sum };
      }
      return null;
    }
  },

  impedenza_base: {
    id: 'impedenza_base',
    materia: 'elettrotecnica',
    nome: 'Impedenza RL',
    formula: 'Z = √(R² + X_L²)',
    variabili: {
      Z: { nome: 'Impedenza', unita: 'Ω', descrizione: 'Impedenza totale del circuito RL' },
      R: { nome: 'Resistenza', unita: 'Ω', descrizione: 'Componente resistiva' },
      X_L: { nome: 'Reattanza induttiva', unita: 'Ω', descrizione: 'X_L = 2π × f × L' }
    },
    significato: 'Opposizione totale al flusso di corrente in un circuito con resistenza e induttanza',
    esempio: 'R=30Ω, X_L=40Ω → Z = √(900+1600) = √2500 = 50Ω',
    applicazione_pratica: 'Calcolo corrente assorbita da motori, bobine, trasformatori',
    calcola: (dati) => {
      if (dati.R !== undefined && dati.X_L !== undefined)
        return { Z: Math.sqrt(dati.R ** 2 + dati.X_L ** 2) };
      if (dati.R !== undefined && dati.f !== undefined && dati.L !== undefined) {
        const X_L = 2 * Math.PI * dati.f * dati.L;
        return { Z: Math.sqrt(dati.R ** 2 + X_L ** 2), X_L };
      }
      return null;
    }
  },

  caduta_tensione: {
    id: 'caduta_tensione',
    materia: 'impianti_elettrici',
    nome: 'Caduta di Tensione su Cavo',
    formula: 'ΔV = (2 × ρ × L × I) / S  [monofase]  |  ΔV = (√3 × ρ × L × I) / S  [trifase]',
    variabili: {
      delta_V: { nome: 'Caduta di tensione', unita: 'V', descrizione: 'Perdita di tensione sul conduttore' },
      rho: { nome: 'Resistività', unita: 'Ω·mm²/m', descrizione: 'Cu=0.0175, Al=0.028 a 20°C' },
      L: { nome: 'Lunghezza cavo', unita: 'm', descrizione: 'Lunghezza del tratto (andata)' },
      I: { nome: 'Corrente', unita: 'A', descrizione: 'Corrente di carico' },
      S: { nome: 'Sezione conduttore', unita: 'mm²', descrizione: 'Sezione trasversale del cavo' }
    },
    significato: 'Perdita di tensione lungo il conduttore per effetto della resistenza interna',
    esempio: 'Cu, monofase, L=50m, I=20A, S=4mm² → ΔV = (2×0.0175×50×20)/4 = 8.75V',
    applicazione_pratica: 'Verifica rispetto limite CEI 64-8: ≤4% per impianti BT (≤3% consigliato)',
    calcola: (dati) => {
      const rho = dati.materiale === 'Al' ? 0.028 : 0.0175;
      const { L, I, S, sistema } = dati;
      if (L && I && S) {
        const coeff = sistema === 'trifase' ? Math.sqrt(3) : 2;
        const delta_V = (coeff * rho * L * I) / S;
        return { delta_V, delta_V_percent: null }; // percent richiede V nominale
      }
      return null;
    }
  },

  energia_elettrica: {
    id: 'energia_elettrica',
    materia: 'elettrotecnica',
    nome: 'Energia Elettrica',
    formula: 'E = P × t',
    variabili: {
      E: { nome: 'Energia', unita: 'Wh / kWh / J', descrizione: 'Energia consumata nel tempo t' },
      P: { nome: 'Potenza', unita: 'W', descrizione: 'Potenza attiva del carico' },
      t: { nome: 'Tempo', unita: 'h (per Wh)', descrizione: 'Durata del funzionamento' }
    },
    significato: 'Energia consumata da un carico elettrico nel tempo',
    esempio: 'P=2000W, t=3h → E = 2000×3 = 6000Wh = 6kWh',
    applicazione_pratica: 'Calcolo consumo elettrico, dimensionamento accumuli, costo energetico',
    calcola: (dati) => {
      if (dati.P !== undefined && dati.t !== undefined) return { E_Wh: dati.P * dati.t, E_kWh: (dati.P * dati.t) / 1000 };
      if (dati.E_Wh !== undefined && dati.t !== undefined) return { P: dati.E_Wh / dati.t };
      return null;
    }
  },

  corrente_corto_circuito: {
    id: 'corrente_corto_circuito',
    materia: 'impianti_elettrici',
    nome: 'Corrente di Corto Circuito (stima)',
    formula: 'Icc = V / (√3 × Z_tot)',
    variabili: {
      Icc: { nome: 'Corrente di cortocircuito', unita: 'A (o kA)', descrizione: 'Corrente trifase simmetrica' },
      V: { nome: 'Tensione nominale', unita: 'V', descrizione: 'Tensione concatenata (es. 400V)' },
      Z_tot: { nome: 'Impedenza totale', unita: 'Ω', descrizione: 'Impedenza rete + trasformatore + cavi fino al punto di guasto' }
    },
    significato: 'Stima corrente massima in caso di cortocircuito trifase simmetrico',
    esempio: 'V=400V, Z_tot=0.04Ω → Icc = 400/(1.732×0.04) = 5773A ≈ 5.8kA',
    applicazione_pratica: 'Verifica potere di interruzione interruttori, dimensionamento protezioni',
    calcola: (dati) => {
      if (dati.V !== undefined && dati.Z_tot !== undefined)
        return { Icc: dati.V / (Math.sqrt(3) * dati.Z_tot) };
      return null;
    }
  }
};

/**
 * Esegui calcolo per una formula dato il suo ID e i valori noti
 * @param {string} formulaId - ID della formula
 * @param {object} dati - Valori noti delle variabili
 * @returns {object|null} - Valori calcolati o null
 */
function calcolaFormula(formulaId, dati) {
  const formula = FORMULE[formulaId];
  if (!formula) return { errore: `Formula '${formulaId}' non trovata` };
  try {
    const risultato = formula.calcola(dati);
    if (!risultato) return { errore: 'Dati insufficienti per il calcolo' };
    return {
      formula: formula.nome,
      formula_str: formula.formula,
      input: dati,
      output: risultato,
      unita: formula.variabili
    };
  } catch (e) {
    return { errore: e.message };
  }
}

/**
 * Recupera formule per materia
 */
function formulePerMateria(materiaId) {
  return Object.values(FORMULE).filter(f => f.materia === materiaId);
}

module.exports = { FORMULE, calcolaFormula, formulePerMateria };
