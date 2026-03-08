/**
 * ROCCO UNIVERSITY — Sistema Esami v2
 * Banca domande completa per tutte le 10 materie
 * ~60 domande numeriche + aperte
 */

const DOMANDE_ESAMI = {

  // ══════════════════════════════════════════════════════════
  // MATEMATICA TECNICA
  // ══════════════════════════════════════════════════════════
  matematica_tecnica: [
    {
      id: 'MT001',
      domanda: 'Converti 60° in radianti. (π ≈ 3.14159)',
      formula_id: null,
      soluzione: 'rad = 60 × π/180 = 60 × 0.01745 = 1.047 rad',
      risposta_attesa: 1.047, unita: 'rad', tolleranza_percent: 1
    },
    {
      id: 'MT002',
      domanda: 'Calcola il modulo del fasore: parte reale = 3, parte immaginaria = 4',
      formula_id: null,
      soluzione: '|Z| = √(3² + 4²) = √(9+16) = √25 = 5',
      risposta_attesa: 5, unita: '-', tolleranza_percent: 1
    },
    {
      id: 'MT003',
      domanda: 'Calcola log10(1000)',
      formula_id: null,
      soluzione: 'log10(1000) = log10(10³) = 3',
      risposta_attesa: 3, unita: '-', tolleranza_percent: 0.5
    },
    {
      id: 'MT004',
      domanda: 'Un fasore ha modulo 5 e fase 53.13°. Quanto vale la parte reale? (cos(53.13°)=0.6)',
      formula_id: null,
      soluzione: 'Parte reale = 5 × cos(53.13°) = 5 × 0.6 = 3',
      risposta_attesa: 3, unita: '-', tolleranza_percent: 2
    },
    {
      id: 'MT005',
      domanda: 'Calcola √(50² + 120²) (utile per calcolo impedenza)',
      formula_id: null,
      soluzione: '√(2500 + 14400) = √16900 = 130',
      risposta_attesa: 130, unita: '-', tolleranza_percent: 1
    }
  ],

  // ══════════════════════════════════════════════════════════
  // FISICA
  // ══════════════════════════════════════════════════════════
  fisica: [
    {
      id: 'FI001',
      domanda: 'Un cavo con R=0.05Ω è percorso da I=200A per t=2s. Quanti Joule sviluppa per effetto Joule?',
      formula_id: 'calore_joule',
      soluzione: 'Q = R×I²×t = 0.05 × 40000 × 2 = 4000J',
      risposta_attesa: 4000, unita: 'J', tolleranza_percent: 2
    },
    {
      id: 'FI002',
      domanda: 'Cavo R=0.5Ω, I=16A. Quanti Watt sviluppa per effetto Joule?',
      formula_id: 'calore_joule',
      soluzione: 'P = R×I² = 0.5 × 256 = 128W',
      risposta_attesa: 128, unita: 'W', tolleranza_percent: 2
    },
    {
      id: 'FI003',
      domanda: 'Qual è la frequenza della rete italiana (Hz)?',
      formula_id: null,
      soluzione: 'La rete italiana è a 50 Hz',
      risposta_attesa: 50, unita: 'Hz', tolleranza_percent: 0.1
    },
    {
      id: 'FI004',
      domanda: 'Un condensatore da C=470μF è carico a V=400V. Quanta energia immagazzina? E=½CV² (in Joule)',
      formula_id: null,
      soluzione: 'E = 0.5 × 470×10⁻⁶ × 400² = 0.5 × 470×10⁻⁶ × 160000 = 37.6J',
      risposta_attesa: 37.6, unita: 'J', tolleranza_percent: 3
    },
    {
      id: 'FI005',
      domanda: 'La resistività del rame a 20°C vale 0.0175 Ω·mm²/m. Qual è la resistenza di un cavo Cu da S=6mm², L=100m?  R = ρ×L/S',
      formula_id: null,
      soluzione: 'R = 0.0175 × 100 / 6 = 0.292Ω',
      risposta_attesa: 0.292, unita: 'Ω', tolleranza_percent: 3
    }
  ],

  // ══════════════════════════════════════════════════════════
  // ELETTROTECNICA
  // ══════════════════════════════════════════════════════════
  elettrotecnica: [
    {
      id: 'EL001',
      domanda: 'R=470Ω alimentato a V=12V. Quale corrente circola?',
      formula_id: 'legge_ohm',
      soluzione: 'I = V/R = 12/470 = 0.02553A = 25.5mA',
      risposta_attesa: 0.02553, unita: 'A', tolleranza_percent: 2
    },
    {
      id: 'EL002',
      domanda: 'Potenza monofase: V=230V, I=8A, cosφ=0.85. Calcola P (W)',
      formula_id: 'potenza_monofase',
      soluzione: 'P = 230 × 8 × 0.85 = 1564W',
      risposta_attesa: 1564, unita: 'W', tolleranza_percent: 2
    },
    {
      id: 'EL003',
      domanda: 'R1=10Ω, R2=20Ω, R3=30Ω in serie. Resistenza totale?',
      formula_id: 'resistenza_serie',
      soluzione: 'R_eq = 10+20+30 = 60Ω',
      risposta_attesa: 60, unita: 'Ω', tolleranza_percent: 1
    },
    {
      id: 'EL004',
      domanda: 'Motore trifase: V=400V, I=12A, cosφ=0.82. Calcola la potenza attiva (W)',
      formula_id: 'potenza_trifase',
      soluzione: 'P = √3 × 400 × 12 × 0.82 = 6818W',
      risposta_attesa: 6818, unita: 'W', tolleranza_percent: 2
    },
    {
      id: 'EL005',
      domanda: 'Motore da P=4kW con cosφ=0.8. Calcola la potenza apparente S (VA)',
      formula_id: 'potenza_apparente',
      soluzione: 'S = P/cosφ = 4000/0.8 = 5000VA',
      risposta_attesa: 5000, unita: 'VA', tolleranza_percent: 2
    },
    {
      id: 'EL006',
      domanda: 'R=30Ω, X_L=40Ω in serie. Calcola l\'impedenza Z (Ω)',
      formula_id: 'impedenza_rl',
      soluzione: 'Z = √(30²+40²) = √(900+1600) = √2500 = 50Ω',
      risposta_attesa: 50, unita: 'Ω', tolleranza_percent: 1
    },
    {
      id: 'EL007',
      domanda: 'R1=100Ω, R2=100Ω in parallelo. Resistenza equivalente?',
      formula_id: 'resistenza_parallelo',
      soluzione: '1/R_eq = 1/100+1/100 = 2/100 → R_eq = 50Ω',
      risposta_attesa: 50, unita: 'Ω', tolleranza_percent: 1
    },
    {
      id: 'EL008',
      domanda: 'P=50kW, cosφ1=0.70, cosφ2=0.95. Quanti kVAR di rifasamento servono?',
      formula_id: 'rifasamento',
      soluzione: 'Q_C = 50×(tan(45.57°)-tan(18.19°)) = 50×(1.020-0.329) = 34.55kVAR',
      risposta_attesa: 34.55, unita: 'kVAR', tolleranza_percent: 3
    }
  ],

  // ══════════════════════════════════════════════════════════
  // IMPIANTI ELETTRICI
  // ══════════════════════════════════════════════════════════
  impianti_elettrici: [
    {
      id: 'IMP001',
      domanda: 'Cavo Cu monofase: L=30m, I=16A, S=2.5mm². Calcola ΔV (V)  [ρ_Cu=0.0175]',
      formula_id: 'caduta_tensione',
      soluzione: 'ΔV = (2×0.0175×30×16)/2.5 = 6.72V',
      risposta_attesa: 6.72, unita: 'V', tolleranza_percent: 3
    },
    {
      id: 'IMP002',
      domanda: 'P=3680W, V=230V, cosφ=0.9 monofase. Calcola la corrente di impiego Ib (A)',
      formula_id: 'corrente_impiego',
      soluzione: 'Ib = 3680/(230×0.9) = 17.77A',
      risposta_attesa: 17.77, unita: 'A', tolleranza_percent: 2
    },
    {
      id: 'IMP003',
      domanda: 'V=400V, Z_tot=0.05Ω. Calcola la corrente di cortocircuito trifase Icc (A)',
      formula_id: 'corrente_corto_circuito',
      soluzione: 'Icc = 400/(1.732×0.05) = 4619A ≈ 4.6kA',
      risposta_attesa: 4619, unita: 'A', tolleranza_percent: 3
    },
    {
      id: 'IMP004',
      domanda: 'Differenziale Idn=30mA (0.030A). Qual è la resistenza di terra massima consentita (sistema TT)?',
      formula_id: 'resistenza_terra',
      soluzione: 'RE_max = 50/0.030 = 1667Ω',
      risposta_attesa: 1667, unita: 'Ω', tolleranza_percent: 2
    },
    {
      id: 'IMP005',
      domanda: 'Impianto FV: P=6kWp, H=4.5h/gg, PR=0.80. Quanti kWh produce in un anno?',
      formula_id: 'potenza_fv',
      soluzione: 'E = 6 × 4.5 × 0.80 × 365 = 7884 kWh/anno',
      risposta_attesa: 7884, unita: 'kWh/anno', tolleranza_percent: 2
    },
    {
      id: 'IMP006',
      domanda: 'Cavo Cu mono: L=80m, I=16A, ΔVmax=9.2V. Sezione minima? S = 2×ρ×L×I / ΔV',
      formula_id: 'sezione_da_dv',
      soluzione: 'S = 2×0.0175×80×16/9.2 = 4.87mm² → scegliere 6mm²',
      risposta_attesa: 4.87, unita: 'mm²', tolleranza_percent: 3
    }
  ],

  // ══════════════════════════════════════════════════════════
  // MACCHINE ELETTRICHE
  // ══════════════════════════════════════════════════════════
  macchine_elettriche: [
    {
      id: 'ME001',
      domanda: 'Motore 4kW, V=400V, η=0.90, cosφ=0.84. Calcola In (A)',
      formula_id: 'corrente_motore',
      soluzione: 'In = 4000/(1.732×400×0.9×0.84) = 7.66A',
      risposta_attesa: 7.66, unita: 'A', tolleranza_percent: 3
    },
    {
      id: 'ME002',
      domanda: 'Motore: In=10A, Ia/In=6. Qual è la corrente di avviamento DOL?',
      formula_id: 'corrente_avviamento',
      soluzione: 'Ia = 6 × 10 = 60A → interruttore curva D',
      risposta_attesa: 60, unita: 'A', tolleranza_percent: 2
    },
    {
      id: 'ME003',
      domanda: 'P_mec=3700W, P_el=4200W. Calcola il rendimento η (%)',
      formula_id: 'rendimento_motore',
      soluzione: 'η = 3700/4200 × 100 = 88.1%',
      risposta_attesa: 88.1, unita: '%', tolleranza_percent: 2
    },
    {
      id: 'ME004',
      domanda: 'Motore P=4000W, n=1450rpm. Calcola la coppia T (N·m)',
      formula_id: 'coppia_motore',
      soluzione: 'ω = 2π×1450/60 = 151.84 rad/s → T = 4000/151.84 = 26.3 N·m',
      risposta_attesa: 26.3, unita: 'N·m', tolleranza_percent: 3
    },
    {
      id: 'ME005',
      domanda: 'Motore asincrono 4 poli, f=50Hz, n=1450rpm. Calcola lo scorrimento s (%)',
      formula_id: 'scorrimento_motore',
      soluzione: 'ns = 120×50/4 = 1500rpm → s = (1500-1450)/1500 × 100 = 3.33%',
      risposta_attesa: 3.33, unita: '%', tolleranza_percent: 3
    },
    {
      id: 'ME006',
      domanda: 'Trasformatore: V1=20000V, V2=400V, I2=100A. Calcola I1 (A)',
      formula_id: 'trasformatore',
      soluzione: 'a = 20000/400 = 50 → I1 = I2/a = 100/50 = 2A',
      risposta_attesa: 2, unita: 'A', tolleranza_percent: 2
    }
  ],

  // ══════════════════════════════════════════════════════════
  // MISURE ELETTRICHE
  // ══════════════════════════════════════════════════════════
  misure_elettriche: [
    {
      id: 'MS001',
      domanda: 'V=230V, I=12A, φ=25°. Calcola la potenza attiva P (W)  [cos(25°)=0.906]',
      formula_id: 'potenza_da_misure',
      soluzione: 'P = 230×12×cos(25°) = 2760×0.906 = 2500W',
      risposta_attesa: 2500, unita: 'W', tolleranza_percent: 3
    },
    {
      id: 'MS002',
      domanda: 'Misuri con Megger: R_iso=0.35MΩ su impianto 230V. Il valore è sufficiente?  (min CEI 64-8: 0.5MΩ). Rispondi: 1=SI, 0=NO',
      formula_id: 'resistenza_isolamento',
      soluzione: 'NO: 0.35MΩ < 0.5MΩ (limite CEI 64-8). Occorre trovare il guasto',
      risposta_attesa: 0, unita: 'SI/NO', tolleranza_percent: 0.1
    },
    {
      id: 'MS003',
      domanda: 'V=400V, I=15A, φ=30°. Calcola la potenza apparente S (VA)',
      formula_id: 'potenza_da_misure',
      soluzione: 'S = V×I = 400×15 = 6000VA',
      risposta_attesa: 6000, unita: 'VA', tolleranza_percent: 2
    },
    {
      id: 'MS004',
      domanda: 'Con una pinza amperometrica misuri I=18A su un circuito trifase da 400V. Il cavo è da 2.5mm² (Iz=26A, posa B1). Il carico è entro i limiti? Rispondi: 1=SI, 0=NO',
      tipo: 'aperta',
      soluzione: 'SI: 18A < Iz=26A — il cavo è entro la portata termica. Ma verificare anche ΔV e Icc.',
      risposta_attesa: 1, unita: 'SI/NO', tolleranza_percent: 0.1
    },
    {
      id: 'MS005',
      domanda: 'V=230V, I=8A, cosφ=0.85 monofase. Calcola la potenza reattiva Q (VAR)  [sinφ=√(1-cosφ²)=0.527]',
      formula_id: 'potenza_da_misure',
      soluzione: 'S = 230×8 = 1840VA. Q = S×sinφ = 1840×0.527 = 970VAR',
      risposta_attesa: 970, unita: 'VAR', tolleranza_percent: 5
    }
  ],

  // ══════════════════════════════════════════════════════════
  // ELETTRONICA DI BASE
  // ══════════════════════════════════════════════════════════
  elettronica_base: [
    {
      id: 'EB001',
      domanda: 'Un diodo ha V_soglia=0.7V. Se è in serie a R=1kΩ alimentata a V=5V, che corrente circola? I=(V-Vd)/R',
      formula_id: null,
      soluzione: 'I = (5-0.7)/1000 = 4.3/1000 = 4.3mA',
      risposta_attesa: 0.0043, unita: 'A', tolleranza_percent: 3
    },
    {
      id: 'EB002',
      domanda: 'Transistor BJT: Ic=100mA, hfe=100. Calcola la corrente di base Ib (mA)',
      formula_id: null,
      soluzione: 'Ib = Ic/hfe = 100/100 = 1mA',
      risposta_attesa: 0.001, unita: 'A', tolleranza_percent: 2
    },
    {
      id: 'EB003',
      domanda: 'Partitore resistivo: R1=10kΩ, R2=10kΩ, Vin=12V. Calcola Vout (V)',
      formula_id: null,
      soluzione: 'Vout = Vin × R2/(R1+R2) = 12 × 10/(10+10) = 6V',
      risposta_attesa: 6, unita: 'V', tolleranza_percent: 2
    },
    {
      id: 'EB004',
      domanda: 'Amplificatore operazionale invertente: Rf=100kΩ, R_in=10kΩ. Calcola il guadagno |Av|',
      formula_id: null,
      soluzione: '|Av| = Rf/R_in = 100/10 = 10',
      risposta_attesa: 10, unita: '-', tolleranza_percent: 1
    },
    {
      id: 'EB005',
      domanda: 'Un condensatore C=100μF si carica attraverso R=10kΩ. Calcola la costante di tempo τ (s)',
      formula_id: null,
      soluzione: 'τ = R×C = 10000 × 100×10⁻⁶ = 1s',
      risposta_attesa: 1, unita: 's', tolleranza_percent: 2
    }
  ],

  // ══════════════════════════════════════════════════════════
  // DIAGNOSI GUASTI
  // ══════════════════════════════════════════════════════════
  diagnosi_guasti: [
    {
      id: 'DG001',
      domanda: 'Motore trifase da 400V assorbe 18A invece dei 12A nominali a pieno carico. Lo scarto è (%) = (18-12)/12 × 100 = ?',
      formula_id: null,
      soluzione: 'Scarto = (18-12)/12 × 100 = 50% → anomalia grave. Ipotesi: sovraccarico meccanico, squilibrio tensioni, guasto parziale avvolgimento',
      risposta_attesa: 50, unita: '%', tolleranza_percent: 2
    },
    {
      id: 'DG002',
      domanda: 'Differenziale 30mA scatta appena armato. Quale azione fare PER PRIMA?',
      tipo: 'aperta',
      soluzione: 'Scollegare TUTTI i carichi dalla linea, poi riarmare. Se non scatta → problema su un carico (ricollegare uno alla volta). Se scatta ancora → guasto sul cavo o connessioni.',
      punti: 2
    },
    {
      id: 'DG003',
      domanda: 'Tensione ai morsetti di un motore = 195V (nominale 230V). Calcola ΔV% = (230-195)/230 × 100',
      formula_id: null,
      soluzione: 'ΔV% = (230-195)/230 × 100 = 15.2% → ben oltre il 4% CEI! Causa: cavo sottodimensionato o connessioni allentate',
      risposta_attesa: 15.2, unita: '%', tolleranza_percent: 2
    },
    {
      id: 'DG004',
      domanda: 'Isolamento cavo misurato con Megger = 0.2MΩ (limite min 0.5MΩ). Scarto in % rispetto al minimo: (0.5-0.2)/0.5 × 100 = ?',
      formula_id: null,
      soluzione: 'Scarto = (0.5-0.2)/0.5 × 100 = 60% → INSUFFICIENTE. Ricercare il guasto di isolamento',
      risposta_attesa: 60, unita: '%', tolleranza_percent: 2
    },
    {
      id: 'DG005',
      domanda: 'Un interruttore da 16A scatta dopo 30 minuti di funzionamento a I=14A (87.5% del calibro). Cosa è più probabile?',
      tipo: 'aperta',
      soluzione: 'Sganciatore termico interviene per sovraccarico cumulativo. I=14A è all\'87.5% → la curva termica interviene con ritardo. Verificare se I effettiva supera i 16A con pinza amperometrica.',
      punti: 2
    }
  ],

  // ══════════════════════════════════════════════════════════
  // NORMATIVE E SICUREZZA
  // ══════════════════════════════════════════════════════════
  normative_sicurezza: [
    {
      id: 'NS001',
      domanda: 'CEI 64-8 art.525: qual è il limite massimo di caduta tensione per impianti BT? (%) Rispondi con il numero',
      formula_id: null,
      soluzione: '4% — CEI 64-8 art.525 prescrive ΔV ≤ 4% tra origine e utilizzatore più lontano',
      risposta_attesa: 4, unita: '%', tolleranza_percent: 0.5
    },
    {
      id: 'NS002',
      domanda: 'DM 37/2008: al di sotto di quanti kW di potenza impegnata si può fare autocertificazione invece della dichiarazione di conformità? (kW)',
      formula_id: null,
      soluzione: 'Non esiste autocertificazione — la dichiarazione di conformità è sempre obbligatoria. Ma per impianti fino a 3.5kW monofase/7kW trifase in locali adibiti ad uso civile si semplifica la documentazione.',
      tipo: 'aperta',
      punti: 2
    },
    {
      id: 'NS003',
      domanda: 'CEI 64-8 art.413 sistema TT: Idn=30mA. Qual è la RE_max consentita (Ω)?',
      formula_id: 'resistenza_terra',
      soluzione: 'RE_max = 50V / Idn = 50/0.03 = 1667Ω',
      risposta_attesa: 1667, unita: 'Ω', tolleranza_percent: 2
    },
    {
      id: 'NS004',
      domanda: 'Quante ore di minimo deve durare un impianto di illuminazione di sicurezza secondo CEI EN 60598-2-22? Rispondi in ore',
      formula_id: null,
      soluzione: 'Minimo 1 ora (autonomia minima). Per locali ad alto rischio (sale operatorie, ecc.) si richiede ≥3 ore.',
      risposta_attesa: 1, unita: 'h', tolleranza_percent: 1
    },
    {
      id: 'NS005',
      domanda: 'CEI 64-8: la tensione di contatto massima consentita in ambienti ordinari è 50V. Se RE=100Ω e Idn=0.5A, la tensione di contatto UC = RE × Idn = ? (V). È entro il limite?',
      formula_id: null,
      soluzione: 'UC = 100 × 0.5 = 50V → esattamente al limite. Con Idn=0.5A (interruttore differenziale 500mA magnetotermico) il coordinamento è al limite accettabile.',
      risposta_attesa: 50, unita: 'V', tolleranza_percent: 2
    }
  ],

  // ══════════════════════════════════════════════════════════
  // AUTOMAZIONI
  // ══════════════════════════════════════════════════════════
  automazioni: [
    {
      id: 'AU001',
      domanda: 'PLC: t_scan=5ms, t_I/O=2ms, t_comm=3ms. Calcola il tempo di ciclo totale (ms)',
      formula_id: 'tempo_ciclo_plc',
      soluzione: 't_ciclo = 5+2+3 = 10ms → frequenza risposta = 100Hz',
      risposta_attesa: 10, unita: 'ms', tolleranza_percent: 1
    },
    {
      id: 'AU002',
      domanda: 'Un inverter porta un motore da 0 a 1450rpm in 5 secondi. Rampa di accelerazione = Δn/Δt = ? (rpm/s)',
      formula_id: null,
      soluzione: 'Rampa = 1450/5 = 290 rpm/s',
      risposta_attesa: 290, unita: 'rpm/s', tolleranza_percent: 2
    },
    {
      id: 'AU003',
      domanda: 'Modbus RTU: baudrate=19200, 8 bit dati, 1 stop, 1 parity. Quanti bit per carattere? E quanto dura 1 byte? (ms)',
      formula_id: null,
      soluzione: '1 bit start + 8 dati + 1 parity + 1 stop = 11 bit/byte. Durata = 11/19200 × 1000 = 0.573ms/byte',
      risposta_attesa: 11, unita: 'bit', tolleranza_percent: 0.5
    },
    {
      id: 'AU004',
      domanda: 'Un sensore di temperatura PT100 misura 138.50Ω a 100°C (R0=100Ω, α=0.00385). Calcola la temperatura usando T = (R-R0)/(R0×α): quanto vale T se R=138.5Ω?',
      formula_id: null,
      soluzione: 'T = (138.5-100)/(100×0.00385) = 38.5/0.385 = 100°C ✓',
      risposta_attesa: 100, unita: '°C', tolleranza_percent: 2
    },
    {
      id: 'AU005',
      domanda: 'Segnale analogico 4-20mA, range 0-100°C. A I=12mA corrisponde T=? °C  Formula: T = (I-4)/(20-4) × 100',
      formula_id: null,
      soluzione: 'T = (12-4)/(20-4) × 100 = 8/16 × 100 = 50°C',
      risposta_attesa: 50, unita: '°C', tolleranza_percent: 2
    }
  ]
};

/**
 * Genera esame per materia
 */
function generaEsame(materiaId, nDomande) {
  nDomande = nDomande || 5;
  const pool_domande = DOMANDE_ESAMI[materiaId] || [];
  if (pool_domande.length === 0) {
    return { errore: "Nessuna domanda disponibile per '" + materiaId + "'" };
  }
  const selezionate = pool_domande.slice().sort(() => Math.random() - 0.5)
    .slice(0, Math.min(nDomande, pool_domande.length));

  const domande_senza_soluzione = selezionate.map(function(d) {
    var out = { id: d.id, domanda: d.domanda, tipo: d.tipo || 'numerica' };
    if (d.unita) out.unita = d.unita;
    if (d.dati) out.dati = d.dati;
    return out;
  });

  return {
    materia: materiaId,
    n_domande: selezionate.length,
    domande: domande_senza_soluzione,
    _soluzioni: selezionate.map(function(d) {
      return { id: d.id, soluzione: d.soluzione, risposta_attesa: d.risposta_attesa, tolleranza: d.tolleranza_percent };
    }),
    timestamp_inizio: new Date().toISOString()
  };
}

/**
 * Valuta risposta numerica
 */
function valutaRisposta(domanda, risposta_utente) {
  if (!domanda.risposta_attesa) {
    return { tipo: 'manuale', messaggio: 'Risposta aperta — valutazione manuale richiesta' };
  }
  const scarto = Math.abs(risposta_utente - domanda.risposta_attesa) / Math.abs(domanda.risposta_attesa) * 100;
  const corretto = scarto <= (domanda.tolleranza_percent || 5);
  return {
    corretto,
    risposta_data: risposta_utente,
    risposta_attesa: domanda.risposta_attesa,
    scarto_percent: parseFloat(scarto.toFixed(2)),
    soluzione: domanda.soluzione,
    messaggio: corretto
      ? '✅ Corretto! Scarto: ' + scarto.toFixed(1) + '%'
      : '❌ Errato. Atteso: ' + domanda.risposta_attesa + ' (scarto ' + scarto.toFixed(1) + '%)\n📖 ' + (domanda.soluzione || '')
  };
}

const REGOLE_ESAME = {
  soglia_superamento_percent: 60,
  tentativi_illimitati: true,
  studio_mai_bloccato: true,
  nota: "L'esame certifica competenze già acquisite — lo studio non viene mai bloccato"
};

module.exports = { DOMANDE_ESAMI, generaEsame, valutaRisposta, REGOLE_ESAME };
