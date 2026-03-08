/**
 * ROCCO UNIVERSITY — Formula Engine v2
 * 30 formule tecniche con calcolo numerico integrato
 * Materie: elettrotecnica, impianti_elettrici, macchine_elettriche,
 *          misure_elettriche, normative_sicurezza, fisica, automazioni
 */

const FORMULE = {

  // ══════════════════════════════════════════════════════════
  // ELETTROTECNICA BASE
  // ══════════════════════════════════════════════════════════

  legge_ohm: {
    id: 'legge_ohm', materia: 'elettrotecnica',
    nome: 'Legge di Ohm',
    formula: 'V = R × I',
    variabili: {
      V: { nome: 'Tensione', unita: 'V', descrizione: 'Differenza di potenziale' },
      R: { nome: 'Resistenza', unita: 'Ω', descrizione: 'Resistenza del componente' },
      I: { nome: 'Corrente', unita: 'A', descrizione: 'Corrente nel circuito' }
    },
    significato: 'La tensione ai capi di un resistore è proporzionale alla corrente',
    esempio: 'R=100Ω, I=0.5A → V = 100 × 0.5 = 50V',
    applicazione_pratica: 'Calcolo caduta di tensione su conduttori e componenti resistivi',
    calcola: (d) => {
      if (d.R !== undefined && d.I !== undefined) return { V: d.R * d.I };
      if (d.V !== undefined && d.I !== undefined) return { R: d.V / d.I };
      if (d.V !== undefined && d.R !== undefined) return { I: d.V / d.R };
      return null;
    }
  },

  potenza_monofase: {
    id: 'potenza_monofase', materia: 'elettrotecnica',
    nome: 'Potenza Attiva Monofase',
    formula: 'P = V × I × cos(φ)',
    variabili: {
      P: { nome: 'Potenza attiva', unita: 'W', descrizione: 'Potenza realmente consumata' },
      V: { nome: 'Tensione', unita: 'V', descrizione: 'Tensione di fase (es. 230V)' },
      I: { nome: 'Corrente', unita: 'A', descrizione: 'Corrente di linea' },
      cosphi: { nome: 'cos(φ)', unita: '-', descrizione: 'Fattore di potenza (0÷1)' }
    },
    significato: 'Potenza attiva in circuito CA monofase',
    esempio: 'V=230V, I=10A, cosφ=0.9 → P = 230×10×0.9 = 2070W',
    applicazione_pratica: 'Dimensionamento cavi, protezioni, calcolo consumi',
    calcola: (d) => {
      if (d.V !== undefined && d.I !== undefined && d.cosphi !== undefined)
        return { P: d.V * d.I * d.cosphi };
      if (d.P !== undefined && d.V !== undefined && d.cosphi !== undefined)
        return { I: d.P / (d.V * d.cosphi) };
      if (d.P !== undefined && d.I !== undefined && d.cosphi !== undefined)
        return { V: d.P / (d.I * d.cosphi) };
      return null;
    }
  },

  potenza_trifase: {
    id: 'potenza_trifase', materia: 'elettrotecnica',
    nome: 'Potenza Attiva Trifase',
    formula: 'P = √3 × V_L × I_L × cos(φ)',
    variabili: {
      P: { nome: 'Potenza attiva', unita: 'W', descrizione: 'Potenza totale trifase' },
      V_L: { nome: 'Tensione di linea', unita: 'V', descrizione: 'Tensione concatenata (es. 400V)' },
      I_L: { nome: 'Corrente di linea', unita: 'A', descrizione: 'Corrente per fase' },
      cosphi: { nome: 'cos(φ)', unita: '-', descrizione: 'Fattore di potenza' }
    },
    significato: 'Potenza attiva in sistema trifase bilanciato',
    esempio: 'V_L=400V, I_L=15A, cosφ=0.85 → P = 1.732×400×15×0.85 = 8816W',
    applicazione_pratica: 'Calcolo potenza motori trifase, dimensionamento industriale',
    calcola: (d) => {
      const s3 = Math.sqrt(3);
      if (d.V_L !== undefined && d.I_L !== undefined && d.cosphi !== undefined)
        return { P: s3 * d.V_L * d.I_L * d.cosphi };
      if (d.P !== undefined && d.V_L !== undefined && d.cosphi !== undefined)
        return { I_L: d.P / (s3 * d.V_L * d.cosphi) };
      if (d.P !== undefined && d.I_L !== undefined && d.cosphi !== undefined)
        return { V_L: d.P / (s3 * d.I_L * d.cosphi) };
      return null;
    }
  },

  potenza_apparente: {
    id: 'potenza_apparente', materia: 'elettrotecnica',
    nome: 'Potenza Apparente e Reattiva',
    formula: 'S = V × I  |  Q = S × sin(φ)  |  P = S × cos(φ)',
    variabili: {
      S: { nome: 'Potenza apparente', unita: 'VA', descrizione: 'S = √(P²+Q²)' },
      P: { nome: 'Potenza attiva', unita: 'W', descrizione: 'Potenza utile' },
      Q: { nome: 'Potenza reattiva', unita: 'VAR', descrizione: 'Potenza reattiva' },
      cosphi: { nome: 'cos(φ)', unita: '-', descrizione: 'Fattore di potenza' }
    },
    significato: 'Triangolo delle potenze: S² = P² + Q²',
    esempio: 'P=3kW, cosφ=0.8 → S=3.75kVA, Q=2250VAR',
    applicazione_pratica: 'Dimensionamento trasformatori, calcolo rifasamento',
    calcola: (d) => {
      if (d.P !== undefined && d.cosphi !== undefined && d.cosphi > 0) {
        const S = d.P / d.cosphi;
        const sinphi = Math.sqrt(1 - d.cosphi * d.cosphi);
        return { S: Math.round(S), Q: Math.round(S * sinphi), tanphi: Math.round(sinphi / d.cosphi * 1000) / 1000 };
      }
      if (d.P !== undefined && d.Q !== undefined) {
        const S = Math.sqrt(d.P * d.P + d.Q * d.Q);
        return { S: Math.round(S), cosphi: Math.round(d.P / S * 1000) / 1000 };
      }
      return null;
    }
  },

  resistenza_serie: {
    id: 'resistenza_serie', materia: 'elettrotecnica',
    nome: 'Resistenza in Serie',
    formula: 'R_eq = R1 + R2 + ... + Rn',
    variabili: {
      R_eq: { nome: 'R equivalente', unita: 'Ω', descrizione: 'Resistenza totale serie' },
      Rn: { nome: 'Resistenze', unita: 'Ω', descrizione: 'Valore di ciascuna resistenza' }
    },
    significato: 'In serie le resistenze si sommano',
    esempio: 'R1=10Ω, R2=22Ω, R3=4.7Ω → R_eq = 36.7Ω',
    applicazione_pratica: 'Calcolo resistenza cavi in serie, caduta tensione cumulativa',
    calcola: (d) => {
      if (Array.isArray(d.resistenze)) return { R_eq: d.resistenze.reduce((a, b) => a + b, 0) };
      return null;
    }
  },

  resistenza_parallelo: {
    id: 'resistenza_parallelo', materia: 'elettrotecnica',
    nome: 'Resistenza in Parallelo',
    formula: '1/R_eq = 1/R1 + 1/R2 + ... + 1/Rn',
    variabili: {
      R_eq: { nome: 'R equivalente', unita: 'Ω', descrizione: 'Sempre < R minima' },
      Rn: { nome: 'Resistenze', unita: 'Ω', descrizione: 'Valore di ciascuna resistenza' }
    },
    significato: 'In parallelo la resistenza diminuisce',
    esempio: 'R1=100Ω, R2=100Ω → R_eq = 50Ω',
    applicazione_pratica: 'Resistenza di dispersione a terra, conduttori in parallelo',
    calcola: (d) => {
      if (Array.isArray(d.resistenze) && d.resistenze.every(r => r > 0))
        return { R_eq: Math.round(1 / d.resistenze.reduce((a, b) => a + 1/b, 0) * 10000) / 10000 };
      return null;
    }
  },

  impedenza_rl: {
    id: 'impedenza_rl', materia: 'elettrotecnica',
    nome: 'Impedenza RL',
    formula: 'Z = √(R² + X_L²)   X_L = 2π·f·L',
    variabili: {
      Z: { nome: 'Impedenza', unita: 'Ω', descrizione: 'Opposizione totale in CA' },
      R: { nome: 'Resistenza', unita: 'Ω', descrizione: 'Componente resistiva' },
      X_L: { nome: 'Reattanza induttiva', unita: 'Ω', descrizione: 'X_L = 2π·f·L' },
      L: { nome: 'Induttanza', unita: 'H', descrizione: 'Henry' }
    },
    significato: 'Impedenza di un circuito con resistenza e induttanza',
    esempio: 'R=30Ω, X_L=40Ω → Z=50Ω, cosφ=0.6',
    applicazione_pratica: 'Corrente assorbita da motori, bobine, trasformatori',
    calcola: (d) => {
      let XL = d.X_L;
      if (XL === undefined && d.f !== undefined && d.L !== undefined)
        XL = 2 * Math.PI * d.f * d.L;
      if (d.R !== undefined && XL !== undefined) {
        const Z = Math.sqrt(d.R * d.R + XL * XL);
        return { Z: Math.round(Z * 100) / 100, X_L: Math.round(XL * 100) / 100, cosphi: Math.round(d.R / Z * 1000) / 1000 };
      }
      return null;
    }
  },

  rifasamento: {
    id: 'rifasamento', materia: 'elettrotecnica',
    nome: 'Rifasamento — Batteria Condensatori',
    formula: 'Q_C = P × (tan(φ1) - tan(φ2))',
    variabili: {
      Q_C: { nome: 'Potenza condensatori', unita: 'kVAR', descrizione: 'Potenza batteria necessaria' },
      P: { nome: 'Potenza attiva', unita: 'kW', descrizione: 'Potenza utile del carico' },
      cosphi1: { nome: 'cos(φ1) attuale', unita: '-', descrizione: 'Es. 0.70 → penale ENEL' },
      cosphi2: { nome: 'cos(φ2) target', unita: '-', descrizione: 'Es. 0.95 → nessuna penale' }
    },
    significato: 'kVAR necessari per migliorare il fattore di potenza',
    esempio: 'P=50kW, cosφ1=0.70, cosφ2=0.95 → Q_C=50×(1.020-0.329)=34.55kVAR',
    applicazione_pratica: 'Evita penali ENEL per cosφ < 0.90 in media tensione',
    calcola: (d) => {
      if (d.P !== undefined && d.cosphi1 !== undefined && d.cosphi2 !== undefined) {
        const tan1 = Math.tan(Math.acos(d.cosphi1));
        const tan2 = Math.tan(Math.acos(d.cosphi2));
        return {
          Q_C_kVAR: Math.round(d.P * (tan1 - tan2) * 100) / 100,
          tan_phi1: Math.round(tan1 * 1000) / 1000,
          tan_phi2: Math.round(tan2 * 1000) / 1000
        };
      }
      return null;
    }
  },

  energia_elettrica: {
    id: 'energia_elettrica', materia: 'elettrotecnica',
    nome: 'Energia Elettrica',
    formula: 'E = P × t',
    variabili: {
      E: { nome: 'Energia', unita: 'Wh / kWh', descrizione: 'Energia consumata' },
      P: { nome: 'Potenza', unita: 'W', descrizione: 'Potenza attiva del carico' },
      t: { nome: 'Tempo', unita: 'h', descrizione: 'Ore di funzionamento' }
    },
    significato: 'Energia = Potenza × Tempo',
    esempio: 'P=2000W, t=3h → E=6000Wh=6kWh',
    applicazione_pratica: 'Calcolo consumi, costi energetici, dimensionamento batterie',
    calcola: (d) => {
      if (d.P !== undefined && d.t !== undefined) return { E_Wh: d.P * d.t, E_kWh: Math.round(d.P * d.t / 1000 * 100) / 100 };
      if (d.E_Wh !== undefined && d.t !== undefined) return { P: d.E_Wh / d.t };
      return null;
    }
  },

  // ══════════════════════════════════════════════════════════
  // IMPIANTI ELETTRICI
  // ══════════════════════════════════════════════════════════

  corrente_impiego: {
    id: 'corrente_impiego', materia: 'impianti_elettrici',
    nome: 'Corrente di Impiego Ib',
    formula: 'Ib = P / (V × cosφ)  [mono]  |  Ib = P / (√3 × V × cosφ)  [trifase]',
    variabili: {
      Ib: { nome: 'Corrente di impiego', unita: 'A', descrizione: 'Base per selezione cavo CEI 64-8' },
      P: { nome: 'Potenza', unita: 'W', descrizione: 'Potenza attiva del carico' },
      V: { nome: 'Tensione', unita: 'V', descrizione: '230V (mono) o 400V (trifase)' },
      cosphi: { nome: 'cos(φ)', unita: '-', descrizione: 'Fattore di potenza carico' }
    },
    significato: 'Corrente massima prevedibile nel normale funzionamento (CEI 64-8 art.433)',
    esempio: 'P=3680W, V=230V, cosφ=0.9 → Ib=3680/(230×0.9)=17.8A → cavo ≥20A',
    applicazione_pratica: 'Base per selezione sezione cavo e calibro interruttore. Ib ≤ In ≤ Iz',
    calcola: (d) => {
      if (d.P !== undefined && d.V !== undefined && d.cosphi !== undefined) {
        const Ib = d.sistema === 'trifase'
          ? d.P / (Math.sqrt(3) * d.V * d.cosphi)
          : d.P / (d.V * d.cosphi);
        return { Ib: Math.round(Ib * 100) / 100 };
      }
      return null;
    }
  },

  caduta_tensione: {
    id: 'caduta_tensione', materia: 'impianti_elettrici',
    nome: 'Caduta di Tensione ΔV',
    formula: 'ΔV = (2·ρ·L·I)/S [mono]  |  ΔV = (√3·ρ·L·I)/S [trifase]',
    variabili: {
      delta_V: { nome: 'Caduta tensione', unita: 'V', descrizione: 'Perdita lungo il cavo' },
      rho: { nome: 'ρ', unita: 'Ω·mm²/m', descrizione: 'Cu=0.0175, Al=0.028' },
      L: { nome: 'Lunghezza', unita: 'm', descrizione: 'Lunghezza andata' },
      I: { nome: 'Corrente', unita: 'A', descrizione: 'Corrente di carico' },
      S: { nome: 'Sezione', unita: 'mm²', descrizione: 'Sezione conduttore' }
    },
    significato: 'Perdita di tensione sul cavo. CEI 64-8 art.525: ≤4% (≤3% consigliato)',
    esempio: 'Cu mono, L=50m, I=20A, S=4mm² → ΔV=8.75V=3.8%@230V',
    applicazione_pratica: 'Verificare sempre: ΔV% = ΔV/V_nom × 100 ≤ 4%',
    calcola: (d) => {
      const rho = d.materiale === 'Al' ? 0.028 : 0.0175;
      const { L, I, S, sistema, V_nominale } = d;
      if (L && I && S) {
        const coeff = sistema === 'trifase' ? Math.sqrt(3) : 2;
        const dV = (coeff * rho * L * I) / S;
        const Vn = V_nominale || (sistema === 'trifase' ? 400 : 230);
        return {
          delta_V: Math.round(dV * 1000) / 1000,
          delta_V_perc: Math.round(dV / Vn * 10000) / 100
        };
      }
      return null;
    }
  },

  sezione_da_dv: {
    id: 'sezione_da_dv', materia: 'impianti_elettrici',
    nome: 'Sezione minima da ΔV%',
    formula: 'S_min = (2·ρ·L·I) / ΔV_max',
    variabili: {
      S_min: { nome: 'Sezione minima', unita: 'mm²', descrizione: 'Per rispettare ΔV limite' },
      dV_max: { nome: 'ΔV massima', unita: 'V', descrizione: 'Es. 4%×230V=9.2V' },
      L: { nome: 'Lunghezza', unita: 'm', descrizione: 'Distanza dal quadro' },
      I: { nome: 'Corrente Ib', unita: 'A', descrizione: 'Corrente di impiego' }
    },
    significato: 'Sezione minima per rispettare il limite di caduta tensione',
    esempio: 'Cu mono, L=80m, I=16A, ΔVmax=9.2V → S=4.87mm² → scegli 6mm²',
    applicazione_pratica: 'Cavi lunghi: verificare sia sezione termica che sezione da ΔV, prendere il maggiore',
    calcola: (d) => {
      const rho = d.materiale === 'Al' ? 0.028 : 0.0175;
      const { L, I, dV_max, sistema } = d;
      if (L && I && dV_max) {
        const coeff = sistema === 'trifase' ? Math.sqrt(3) : 2;
        return { S_min: Math.round(coeff * rho * L * I / dV_max * 100) / 100 };
      }
      return null;
    }
  },

  corrente_corto_circuito: {
    id: 'corrente_corto_circuito', materia: 'impianti_elettrici',
    nome: 'Corrente di Cortocircuito Icc',
    formula: 'Icc = V / (√3 × Z_tot)',
    variabili: {
      Icc: { nome: 'Corrente di cc', unita: 'kA', descrizione: 'Corrente trifase simmetrica' },
      V: { nome: 'Tensione', unita: 'V', descrizione: 'Tensione concatenata (400V)' },
      Z_tot: { nome: 'Impedenza totale', unita: 'Ω', descrizione: 'Rete + trasf. + cavi' }
    },
    significato: 'Corrente massima di cortocircuito trifase',
    esempio: 'V=400V, Z_tot=0.04Ω → Icc=5773A≈5.8kA',
    applicazione_pratica: 'Verifica potere di interruzione interruttori (CEI 64-8 art.434)',
    calcola: (d) => {
      if (d.V !== undefined && d.Z_tot !== undefined) {
        const Icc = d.V / (Math.sqrt(3) * d.Z_tot);
        return { Icc_A: Math.round(Icc), Icc_kA: Math.round(Icc / 1000 * 100) / 100 };
      }
      return null;
    }
  },

  resistenza_terra: {
    id: 'resistenza_terra', materia: 'impianti_elettrici',
    nome: 'Resistenza di Terra — Sistema TT',
    formula: 'RE ≤ 50V / Idn  (CEI 64-8 art.413)',
    variabili: {
      RE: { nome: 'Resistenza di terra', unita: 'Ω', descrizione: 'Resistenza impianto di terra' },
      Idn: { nome: 'Corrente differenziale', unita: 'A', descrizione: 'Es. 0.03A = 30mA' }
    },
    significato: 'In sistema TT: RE × Idn ≤ 50V per sicurezza contatti indiretti',
    esempio: 'Idn=30mA → RE_max = 50/0.03 = 1667Ω',
    applicazione_pratica: 'Verifica impianto di terra civile. Con 30mA il limite è 1667Ω — facilmente rispettato',
    calcola: (d) => {
      if (d.Idn !== undefined && !d.RE) return { RE_max: Math.round(50 / d.Idn) };
      if (d.RE !== undefined && d.Idn !== undefined) return { Uc: Math.round(d.RE * d.Idn * 100) / 100, ok: d.RE * d.Idn <= 50 };
      return null;
    }
  },

  temperatura_cavo: {
    id: 'temperatura_cavo', materia: 'impianti_elettrici',
    nome: 'Verifica Termica Cavo in c.c. — I²t',
    formula: 'I²·t ≤ (k·S)²  →  k=115 PVC, k=143 XLPE',
    variabili: {
      S: { nome: 'Sezione', unita: 'mm²', descrizione: 'Sezione conduttore' },
      I: { nome: 'Corrente cc', unita: 'A', descrizione: 'Corrente di cortocircuito' },
      t: { nome: 'Tempo', unita: 's', descrizione: 'Tempo intervento protezione' }
    },
    significato: 'Verifica che il cavo non superi la temperatura max in c.c. (CEI 64-8 art.434)',
    esempio: 'S=4mm², PVC: limite=(115×4)²=211600. Se I=3kA, t=0.1s: I²t=900000 → INSUFFICIENTE, usa 6mm²',
    applicazione_pratica: 'Coordinamento protezioni: I²t_protezione ≤ I²t_cavo = (k·S)²',
    calcola: (d) => {
      const k = d.isolante === 'XLPE' ? 143 : 115;
      if (d.S !== undefined && d.I !== undefined && d.t !== undefined) {
        const It2 = d.I * d.I * d.t;
        const kS2 = k * d.S * k * d.S;
        return { I2t: Math.round(It2), limite_kS2: Math.round(kS2), ok: It2 <= kS2, k };
      }
      if (d.I !== undefined && d.t !== undefined) {
        const S_min = Math.sqrt(d.I * d.I * d.t) / k;
        return { S_min_mm2: Math.round(S_min * 100) / 100 };
      }
      return null;
    }
  },

  potenza_fv: {
    id: 'potenza_fv', materia: 'impianti_elettrici',
    nome: 'Produzione Annua Impianto FV',
    formula: 'E_anno = P_picco × H_pic × PR × 365',
    variabili: {
      E_anno: { nome: 'Energia annua', unita: 'kWh/anno', descrizione: 'Produzione stimata' },
      P_picco: { nome: 'Potenza picco', unita: 'kWp', descrizione: 'Potenza nominale moduli STC' },
      H_pic: { nome: 'Ore picco/gg', unita: 'h/gg', descrizione: 'Italia: 3.5÷5.5 h/gg' },
      PR: { nome: 'Performance Ratio', unita: '-', descrizione: 'Tipico 0.75÷0.85' }
    },
    significato: 'Stima produzione FV annua — dipende da orientamento, inclinazione, ombreggiature',
    esempio: 'P=6kWp, H=4.5h/gg, PR=0.80 → E=6×4.5×0.80×365=7884 kWh/anno',
    applicazione_pratica: 'Dimensionamento FV residenziale, calcolo payback e autoconsumo',
    calcola: (d) => {
      if (d.P_picco !== undefined && d.H_pic !== undefined && d.PR !== undefined)
        return {
          E_anno_kWh: Math.round(d.P_picco * d.H_pic * d.PR * 365),
          E_giorno_kWh: Math.round(d.P_picco * d.H_pic * d.PR * 10) / 10
        };
      return null;
    }
  },

  // ══════════════════════════════════════════════════════════
  // MACCHINE ELETTRICHE
  // ══════════════════════════════════════════════════════════

  corrente_motore: {
    id: 'corrente_motore', materia: 'macchine_elettriche',
    nome: 'Corrente Nominale Motore Trifase',
    formula: 'In = P_n / (√3 × V × η × cos(φ))',
    variabili: {
      In: { nome: 'Corrente nominale', unita: 'A', descrizione: 'Corrente a pieno carico' },
      P_n: { nome: 'Potenza nominale', unita: 'W', descrizione: 'Potenza meccanica di targa' },
      V: { nome: 'Tensione', unita: 'V', descrizione: '400V trifase standard' },
      eta: { nome: 'η rendimento', unita: '-', descrizione: 'IE2: 0.88÷0.93, IE3: 0.91÷0.96' },
      cosphi: { nome: 'cos(φ)', unita: '-', descrizione: 'Da targa: tipico 0.80÷0.88' }
    },
    significato: 'Corrente assorbita dalla rete dal motore a pieno carico',
    esempio: 'P=4kW, V=400V, η=0.9, cosφ=0.84 → In=4000/(1.732×400×0.9×0.84)=7.66A',
    applicazione_pratica: 'Base per selezione cavo, interruttore e relè termico di protezione',
    calcola: (d) => {
      if (d.P_n !== undefined && d.V !== undefined && d.eta !== undefined && d.cosphi !== undefined)
        return { In: Math.round(d.P_n / (Math.sqrt(3) * d.V * d.eta * d.cosphi) * 100) / 100 };
      return null;
    }
  },

  corrente_avviamento: {
    id: 'corrente_avviamento', materia: 'macchine_elettriche',
    nome: 'Corrente di Avviamento DOL',
    formula: 'Ia = (Ia/In) × In  —  tipico Ia/In = 5÷7',
    variabili: {
      Ia: { nome: 'Corrente avviamento', unita: 'A', descrizione: 'Picco all\'avviamento diretto' },
      In: { nome: 'Corrente nominale', unita: 'A', descrizione: 'Da targa motore' },
      rapporto: { nome: 'Ia/In', unita: '-', descrizione: 'Tipico 5÷7 per asincroni BT' }
    },
    significato: 'Avviamento DOL: picco corrente 5÷7× la nominale per 0.5÷5 secondi',
    esempio: 'In=10A, Ia/In=6 → Ia=60A → usa curva D o soft-starter',
    applicazione_pratica: 'Scelta curva: B(3÷5×), C(5÷10×), D(10÷20×). DOL → curva D',
    calcola: (d) => {
      const r = d.rapporto || 6;
      if (d.In !== undefined) return { Ia: Math.round(d.In * r), nota: 'Ia/In=' + r + ' → interruttore curva D' };
      return null;
    }
  },

  rendimento_motore: {
    id: 'rendimento_motore', materia: 'macchine_elettriche',
    nome: 'Rendimento Motore',
    formula: 'η = P_mec / P_el × 100%',
    variabili: {
      eta: { nome: 'η rendimento', unita: '%', descrizione: 'IE2: 88÷93%, IE3: 91÷96%' },
      P_mec: { nome: 'Potenza meccanica', unita: 'W', descrizione: 'Potenza utile all\'albero' },
      P_el: { nome: 'Potenza elettrica', unita: 'W', descrizione: 'Potenza assorbita dalla rete' }
    },
    significato: 'Percentuale di energia elettrica convertita in energia meccanica utile',
    esempio: 'P_mec=3700W (5HP), P_el=4200W → η=88.1%',
    applicazione_pratica: 'Calcolo costi esercizio, confronto classi energetiche IE1/IE2/IE3/IE4',
    calcola: (d) => {
      if (d.P_mec !== undefined && d.P_el !== undefined)
        return { eta_perc: Math.round(d.P_mec / d.P_el * 1000) / 10, perdite_W: Math.round(d.P_el - d.P_mec) };
      if (d.P_mec !== undefined && d.eta !== undefined)
        return { P_el: Math.round(d.P_mec / (d.eta / 100)) };
      return null;
    }
  },

  coppia_motore: {
    id: 'coppia_motore', materia: 'macchine_elettriche',
    nome: 'Coppia Motore',
    formula: 'T = P / ω  dove  ω = 2π × n / 60',
    variabili: {
      T: { nome: 'Coppia', unita: 'N·m', descrizione: 'Coppia meccanica all\'albero' },
      P: { nome: 'Potenza meccanica', unita: 'W', descrizione: 'Potenza all\'albero' },
      n: { nome: 'Velocità', unita: 'rpm', descrizione: 'Giri al minuto' }
    },
    significato: 'Coppia = Potenza / velocità angolare',
    esempio: 'P=4000W, n=1450rpm → ω=151.8 rad/s → T=26.4 N·m',
    applicazione_pratica: 'Selezione riduttori, dimensionamento attrezzature mosse dal motore',
    calcola: (d) => {
      if (d.P !== undefined && d.n !== undefined) {
        const omega = 2 * Math.PI * d.n / 60;
        return { T_Nm: Math.round(d.P / omega * 100) / 100, omega_rad_s: Math.round(omega * 10) / 10 };
      }
      return null;
    }
  },

  scorrimento_motore: {
    id: 'scorrimento_motore', materia: 'macchine_elettriche',
    nome: 'Scorrimento Motore Asincrono',
    formula: 's = (n_s - n) / n_s   |   n_s = 120 × f / p',
    variabili: {
      s: { nome: 'Scorrimento', unita: '%', descrizione: 'Tipico 2÷8% a pieno carico' },
      n_s: { nome: 'Velocità sincrona', unita: 'rpm', descrizione: '4 poli 50Hz: 1500rpm' },
      n: { nome: 'Velocità rotore', unita: 'rpm', descrizione: 'Da targa: es. 1450rpm' },
      p: { nome: 'Numero poli', unita: '-', descrizione: '2, 4, 6, 8...' }
    },
    significato: 'Il rotore gira più lento del campo. Scorrimento alto (>8%) = sovraccarico o guasto',
    esempio: 'f=50Hz, p=4 → ns=1500rpm. n=1450rpm → s=3.33%',
    applicazione_pratica: 'Diagnosi: scorrimento elevato indica sovraccarico meccanico o guasto avvolgimento',
    calcola: (d) => {
      const f = d.f || 50;
      if (d.p !== undefined) {
        const ns = 120 * f / d.p;
        if (d.n !== undefined) return { s_perc: Math.round((ns - d.n) / ns * 1000) / 10, n_s: ns };
        return { n_s: ns };
      }
      return null;
    }
  },

  trasformatore: {
    id: 'trasformatore', materia: 'macchine_elettriche',
    nome: 'Trasformatore — Rapporto di Trasformazione',
    formula: 'a = V1/V2 = N1/N2 = I2/I1',
    variabili: {
      a: { nome: 'Rapporto', unita: '-', descrizione: 'V1/V2' },
      V1: { nome: 'Tensione primario', unita: 'V', descrizione: 'Lato AT' },
      V2: { nome: 'Tensione secondario', unita: 'V', descrizione: 'Lato BT' },
      I2: { nome: 'Corrente secondario', unita: 'A', descrizione: 'Corrente lato BT' }
    },
    significato: 'Trasformatore ideale: V1×I1 = V2×I2 (potenze uguali)',
    esempio: 'V1=20000V, V2=400V → a=50. I2=100A → I1=2A',
    applicazione_pratica: 'Calcolo correnti nei quadri MT/BT, dimensionamento protezioni',
    calcola: (d) => {
      if (d.V1 !== undefined && d.V2 !== undefined) {
        const a = d.V1 / d.V2;
        if (d.I2 !== undefined) return { a: Math.round(a * 100) / 100, I1: Math.round(d.I2 / a * 100) / 100 };
        if (d.I1 !== undefined) return { a: Math.round(a * 100) / 100, I2: Math.round(d.I1 * a * 100) / 100 };
        return { a: Math.round(a * 100) / 100 };
      }
      return null;
    }
  },

  // ══════════════════════════════════════════════════════════
  // MISURE ELETTRICHE
  // ══════════════════════════════════════════════════════════

  resistenza_isolamento: {
    id: 'resistenza_isolamento', materia: 'misure_elettriche',
    nome: 'Resistenza di Isolamento — Limiti CEI 64-8',
    formula: 'R_iso ≥ 0.5MΩ (BT 500V)  |  Limite operativo: >1MΩ',
    variabili: {
      R_iso: { nome: 'R isolamento', unita: 'MΩ', descrizione: 'Misurata con Megger a 500V' },
      V_nom: { nome: 'Tensione nominale', unita: 'V', descrizione: 'Tensione del circuito testato' }
    },
    significato: 'CEI 64-8 sez.61: nuovi impianti ≥ 0.5MΩ. Operativo: > 1MΩ, ottimo: > 100MΩ',
    esempio: 'Impianto 230V → Megger 500V. R=0.3MΩ → INSUFFICIENTE. R=50MΩ → BUONO',
    applicazione_pratica: 'Verifica periodica CEI 64-8, collaudo impianti. Misura con circuito de-energizzato',
    calcola: (d) => {
      const V_test = (d.V_nom || 230) <= 500 ? 500 : 1000;
      const R_min = 0.5;
      if (d.R_iso !== undefined)
        return {
          V_test_V: V_test,
          R_min_MOhm: R_min,
          stato: d.R_iso >= 100 ? 'OTTIMO' : d.R_iso >= 1 ? 'OK' : d.R_iso >= R_min ? 'ACCETTABILE' : 'INSUFFICIENTE'
        };
      return { V_test_V: V_test, R_min_MOhm: R_min };
    }
  },

  potenza_da_misure: {
    id: 'potenza_da_misure', materia: 'misure_elettriche',
    nome: 'Potenza da Misure (V, I, φ)',
    formula: 'P = V×I×cos(φ)  |  Q = V×I×sin(φ)  |  S = V×I',
    variabili: {
      V: { nome: 'Tensione', unita: 'V', descrizione: 'Misurata con voltmetro' },
      I: { nome: 'Corrente', unita: 'A', descrizione: 'Con pinza amperometrica' },
      phi: { nome: 'φ (gradi)', unita: '°', descrizione: 'Angolo di sfasamento' }
    },
    significato: 'Triangolo delle potenze da misure strumentali dirette',
    esempio: 'V=230V, I=12A, φ=25° → P=2504W, Q=1168VAR, S=2760VA, cosφ=0.906',
    applicazione_pratica: 'Analizzatore di rete: diagnosi basso fattore di potenza, carichi non lineari',
    calcola: (d) => {
      if (d.V !== undefined && d.I !== undefined && d.phi !== undefined) {
        const phi_rad = d.phi * Math.PI / 180;
        const S = d.V * d.I;
        return {
          S_VA: Math.round(S),
          P_W: Math.round(S * Math.cos(phi_rad)),
          Q_VAR: Math.round(S * Math.sin(phi_rad)),
          cosphi: Math.round(Math.cos(phi_rad) * 1000) / 1000
        };
      }
      return null;
    }
  },

  // ══════════════════════════════════════════════════════════
  // FISICA
  // ══════════════════════════════════════════════════════════

  calore_joule: {
    id: 'calore_joule', materia: 'fisica',
    nome: 'Effetto Joule — Calore Generato',
    formula: 'Q = R × I² × t',
    variabili: {
      Q: { nome: 'Calore', unita: 'J', descrizione: 'Energia termica dissipata' },
      R: { nome: 'Resistenza', unita: 'Ω', descrizione: 'Resistenza del conduttore' },
      I: { nome: 'Corrente', unita: 'A', descrizione: 'Corrente che scorre' },
      t: { nome: 'Tempo', unita: 's', descrizione: 'Durata in secondi' }
    },
    significato: 'Calore sviluppato proporzionale a R×I²×t — base del riscaldamento cavi',
    esempio: 'R=0.1Ω, I=100A, t=1s → Q=1000J=forte riscaldamento',
    applicazione_pratica: 'Dimensionamento termico, coordinamento I²t protezioni-cavo',
    calcola: (d) => {
      if (d.R !== undefined && d.I !== undefined && d.t !== undefined)
        return { Q_J: Math.round(d.R * d.I * d.I * d.t), P_W: Math.round(d.R * d.I * d.I) };
      return null;
    }
  },

  // ══════════════════════════════════════════════════════════
  // AUTOMAZIONI
  // ══════════════════════════════════════════════════════════

  tempo_ciclo_plc: {
    id: 'tempo_ciclo_plc', materia: 'automazioni',
    nome: 'Tempo di Ciclo PLC',
    formula: 't_ciclo = t_scan + t_I/O + t_comm',
    variabili: {
      t_ciclo: { nome: 'Tempo di ciclo', unita: 'ms', descrizione: 'Tempo totale di scansione' },
      t_scan: { nome: 't scansione', unita: 'ms', descrizione: 'Esecuzione programma ladder' },
      t_io: { nome: 't I/O', unita: 'ms', descrizione: 'Aggiornamento ingressi/uscite' },
      t_comm: { nome: 't comunicazione', unita: 'ms', descrizione: 'Bus di campo, Ethernet' }
    },
    significato: 'Tempo di ciclo PLC determina la reattività del sistema',
    esempio: 't_scan=5ms, t_I/O=2ms, t_comm=3ms → t_ciclo=10ms, freq_max=100Hz',
    applicazione_pratica: 'Se t_ciclo > 20ms → possibili problemi su processi veloci',
    calcola: (d) => {
      if (d.t_scan !== undefined && d.t_io !== undefined) {
        const tc = d.t_scan + d.t_io + (d.t_comm || 0);
        return { t_ciclo_ms: tc, freq_max_Hz: Math.round(1000 / tc) };
      }
      return null;
    }
  }
};

/**
 * Esegue calcolo per formulaId con i dati forniti
 */
function calcolaFormula(formulaId, dati) {
  const f = FORMULE[formulaId];
  if (!f) return { errore: "Formula '" + formulaId + "' non trovata" };
  try {
    const risultato = f.calcola(dati);
    if (!risultato) return { errore: 'Dati insufficienti per il calcolo' };
    return { formula: f.nome, formula_str: f.formula, input: dati, output: risultato, unita: f.variabili };
  } catch (e) {
    return { errore: e.message };
  }
}

function formulePerMateria(materiaId) {
  return Object.values(FORMULE).filter(f => f.materia === materiaId);
}

module.exports = { FORMULE, calcolaFormula, formulePerMateria };
