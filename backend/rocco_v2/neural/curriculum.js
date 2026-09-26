"use strict";

// ============================================================================
// CURRICULUM TECNICO ROCCO — Percorso formativo completo
// Dal fondamentale all'avanzato, progressivo e interconnesso
// ============================================================================
//
// Ogni livello contiene:
//   concetti: [{nome, definizione, formula?, unita?, relazioni:[]}]
//   componenti: [{nome, tipo, funzione, guasti_tipici:[], misure:[]}]
//   formule: [{nome, formula, variabili:{}, esempio}]
//   misure: [{grandezza, strumento, procedura, valore_tipico, unita}]
//   guasti: [{nome, causa, sintomo, verifica, componenti_coinvolti:[]}]
//   norme: [{codice, titolo, applicazione}]
//   casi: [{scenario, misure:{}, causa, soluzione, ragionamento}]
//   relazioni: [{da, a, tipo}]  — collegamenti tra concetti
//
// I livelli sono PROGRESSIVI: ogni livello usa i concetti dei precedenti.
// ============================================================================

var LIVELLI = [

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 0 — ELETTROTECNICA FONDAMENTALE
  // ═══════════════════════════════════════════════════════════
  {
    id: "L00",
    nome: "Elettrotecnica fondamentale",
    prerequisiti: [],
    concetti: [
      { nome: "carica_elettrica", definizione: "quantità di elettricità posseduta da un corpo, misurata in Coulomb", unita: "C", relazioni: ["corrente", "tensione"] },
      { nome: "corrente", definizione: "flusso ordinato di cariche elettriche in un conduttore", formula: "I = Q / t", unita: "A", relazioni: ["carica_elettrica", "tensione", "resistenza"] },
      { nome: "tensione", definizione: "differenza di potenziale elettrico tra due punti, forza che spinge le cariche", formula: "V = W / Q", unita: "V", relazioni: ["corrente", "resistenza", "potenza"] },
      { nome: "resistenza", definizione: "opposizione di un materiale al passaggio di corrente", formula: "R = ρ × L / S", unita: "Ω", relazioni: ["corrente", "tensione", "resistivita"] },
      { nome: "resistivita", definizione: "proprietà intrinseca del materiale che determina la resistenza", unita: "Ω·m", relazioni: ["resistenza", "temperatura"] },
      { nome: "conduttore", definizione: "materiale con bassa resistività che permette il passaggio di corrente (rame, alluminio)", relazioni: ["resistenza", "isolante"] },
      { nome: "isolante", definizione: "materiale con alta resistività che impedisce il passaggio di corrente (PVC, gomma, ceramica)", relazioni: ["resistenza", "conduttore"] },
      { nome: "legge_di_ohm", definizione: "la corrente in un circuito è direttamente proporzionale alla tensione e inversamente proporzionale alla resistenza", formula: "V = R × I", relazioni: ["tensione", "corrente", "resistenza"] },
      { nome: "circuito_elettrico", definizione: "percorso chiuso in cui la corrente può fluire dalla sorgente al carico e ritorno", relazioni: ["corrente", "tensione", "generatore", "carico"] },
      { nome: "generatore", definizione: "sorgente di energia elettrica che mantiene una differenza di potenziale", relazioni: ["tensione", "corrente", "circuito_elettrico"] },
      { nome: "carico", definizione: "dispositivo che consuma energia elettrica trasformandola in altra forma", relazioni: ["potenza", "corrente", "resistenza"] },
      { nome: "massa_elettrica", definizione: "punto di riferimento a potenziale zero nel circuito, connesso alla terra nei sistemi reali", relazioni: ["tensione", "terra"] }
    ],
    formule: [
      { nome: "Legge di Ohm", formula: "V = R × I", variabili: { V: "tensione (V)", R: "resistenza (Ω)", I: "corrente (A)" }, esempio: "Se R=10Ω e I=2A → V=20V" },
      { nome: "Corrente da carica", formula: "I = Q / t", variabili: { I: "corrente (A)", Q: "carica (C)", t: "tempo (s)" }, esempio: "1A = 1C/s" },
      { nome: "Resistenza da resistività", formula: "R = ρ × L / S", variabili: { R: "resistenza (Ω)", "ρ": "resistività (Ω·m)", L: "lunghezza (m)", S: "sezione (m²)" }, esempio: "Cavo rame 10m, 2.5mm²: R = 1.72e-8 × 10 / 2.5e-6 = 0.069Ω" }
    ],
    misure: [
      { grandezza: "tensione", strumento: "voltmetro/multimetro", procedura: "collegare in parallelo tra i due punti", valore_tipico: "230V (monofase IT)", unita: "V" },
      { grandezza: "corrente", strumento: "amperometro/pinza amperometrica", procedura: "inserire in serie nel circuito o abbracciare il conduttore", valore_tipico: "dipende dal carico", unita: "A" },
      { grandezza: "resistenza", strumento: "ohmetro/multimetro", procedura: "circuito aperto e senza tensione, collegare ai capi del componente", valore_tipico: "dipende dal componente", unita: "Ω" }
    ],
    componenti: [],
    guasti: [],
    norme: [],
    casi: [],
    relazioni: [
      { da: "tensione", a: "corrente", tipo: "causa" },
      { da: "resistenza", a: "corrente", tipo: "limita" },
      { da: "corrente", a: "carica_elettrica", tipo: "deriva_da" },
      { da: "legge_di_ohm", a: "tensione", tipo: "definisce" },
      { da: "legge_di_ohm", a: "corrente", tipo: "definisce" },
      { da: "legge_di_ohm", a: "resistenza", tipo: "definisce" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 1 — CIRCUITI DC
  // ═══════════════════════════════════════════════════════════
  {
    id: "L01",
    nome: "Circuiti DC",
    prerequisiti: ["L00"],
    concetti: [
      { nome: "serie", definizione: "componenti collegati uno dopo l'altro, stessa corrente, tensioni si sommano", formula: "R_tot = R1 + R2 + ... Rn", relazioni: ["resistenza", "corrente", "tensione"] },
      { nome: "parallelo", definizione: "componenti collegati tra gli stessi nodi, stessa tensione, correnti si sommano", formula: "1/R_tot = 1/R1 + 1/R2 + ... 1/Rn", relazioni: ["resistenza", "corrente", "tensione"] },
      { nome: "kirchhoff_correnti", definizione: "la somma delle correnti entranti in un nodo è uguale alla somma delle uscenti (KCL)", formula: "ΣI_in = ΣI_out", relazioni: ["corrente", "nodo"] },
      { nome: "kirchhoff_tensioni", definizione: "la somma delle tensioni in un anello chiuso è zero (KVL)", formula: "ΣV = 0", relazioni: ["tensione", "circuito_elettrico"] },
      { nome: "potenza_dc", definizione: "energia consumata per unità di tempo", formula: "P = V × I = R × I² = V² / R", unita: "W", relazioni: ["tensione", "corrente", "resistenza", "energia"] },
      { nome: "energia", definizione: "lavoro compiuto dalla corrente nel tempo", formula: "E = P × t", unita: "Wh o J", relazioni: ["potenza_dc", "tempo"] },
      { nome: "effetto_joule", definizione: "conversione di energia elettrica in calore quando la corrente attraversa una resistenza", formula: "Q = R × I² × t", relazioni: ["resistenza", "corrente", "surriscaldamento"] },
      { nome: "partitore_tensione", definizione: "circuito serie che divide la tensione in rapporto alle resistenze", formula: "V_out = V_in × R2 / (R1 + R2)", relazioni: ["serie", "tensione", "resistenza"] },
      { nome: "partitore_corrente", definizione: "circuito parallelo che divide la corrente in rapporto inverso alle resistenze", formula: "I1 = I_tot × R2 / (R1 + R2)", relazioni: ["parallelo", "corrente", "resistenza"] },
      { nome: "cortocircuito", definizione: "collegamento a resistenza quasi nulla tra due punti a potenziale diverso, genera corrente molto elevata", relazioni: ["resistenza", "corrente", "protezione"] },
      { nome: "circuito_aperto", definizione: "interruzione del circuito, resistenza infinita, corrente zero", relazioni: ["resistenza", "corrente"] }
    ],
    formule: [
      { nome: "Resistenze in serie", formula: "R_tot = R1 + R2 + ... + Rn", variabili: { R_tot: "resistenza totale (Ω)" }, esempio: "R1=10Ω, R2=20Ω → R_tot=30Ω" },
      { nome: "Resistenze in parallelo (2)", formula: "R_tot = (R1 × R2) / (R1 + R2)", variabili: { R_tot: "resistenza totale (Ω)" }, esempio: "R1=10Ω, R2=10Ω → R_tot=5Ω" },
      { nome: "Potenza DC", formula: "P = V × I", variabili: { P: "potenza (W)", V: "tensione (V)", I: "corrente (A)" }, esempio: "230V × 10A = 2300W" },
      { nome: "Energia", formula: "E = P × t", variabili: { E: "energia (Wh)", P: "potenza (W)", t: "tempo (h)" }, esempio: "2000W × 3h = 6000Wh = 6kWh" },
      { nome: "Effetto Joule", formula: "Q = R × I² × t", variabili: { Q: "calore (J)", R: "resistenza (Ω)", I: "corrente (A)", t: "tempo (s)" }, esempio: "Cavo 0.1Ω con 20A per 1h: Q = 0.1 × 400 × 3600 = 144kJ" }
    ],
    misure: [
      { grandezza: "continuita", strumento: "multimetro (modalità buzzer)", procedura: "circuito aperto, collegare ai capi, buzzer se R<50Ω", valore_tipico: "<1Ω per conduttore sano", unita: "Ω" },
      { grandezza: "caduta_tensione", strumento: "voltmetro", procedura: "misurare tensione a monte e a valle del cavo sotto carico", valore_tipico: "<4% per circuiti terminali", unita: "V" }
    ],
    componenti: [
      { nome: "resistore", tipo: "passivo", funzione: "limitare la corrente, dividere tensione", guasti_tipici: ["aperto per surriscaldamento", "valore alterato"], misure: ["resistenza"] },
      { nome: "fusibile", tipo: "protezione", funzione: "interrompere il circuito quando la corrente supera il valore nominale", guasti_tipici: ["aperto (intervenuto)", "non interviene (sottodimensionato)"], misure: ["continuita"] }
    ],
    guasti: [
      { nome: "circuito aperto", causa: "conduttore interrotto, morsetto allentato, fusibile bruciato", sintomo: "nessuna corrente, carico non funziona", verifica: "prova di continuità", componenti_coinvolti: ["conduttore", "fusibile", "morsetto"] },
      { nome: "cortocircuito", causa: "isolamento danneggiato, errore di cablaggio, corpo estraneo conduttivo", sintomo: "corrente molto elevata, intervento protezione", verifica: "misura resistenza tra conduttori", componenti_coinvolti: ["conduttore", "isolante"] }
    ],
    norme: [],
    casi: [
      { scenario: "Una lampada non si accende, l'interruttore è inserito", misure: { tensione_ai_capi: "0V", continuita_cavo: ">1MΩ" }, causa: "conduttore interrotto nella giunzione", soluzione: "rifare la giunzione nel cassetta di derivazione", ragionamento: "Tensione 0V al carico + circuito aperto = interruzione. Verifica continuità localizza il punto di rottura." }
    ],
    relazioni: [
      { da: "serie", a: "kirchhoff_tensioni", tipo: "segue" },
      { da: "parallelo", a: "kirchhoff_correnti", tipo: "segue" },
      { da: "potenza_dc", a: "effetto_joule", tipo: "causa" },
      { da: "effetto_joule", a: "surriscaldamento", tipo: "causa" },
      { da: "cortocircuito", a: "corrente", tipo: "massimizza" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 2 — CIRCUITI AC
  // ═══════════════════════════════════════════════════════════
  {
    id: "L02",
    nome: "Circuiti AC",
    prerequisiti: ["L00", "L01"],
    concetti: [
      { nome: "corrente_alternata", definizione: "corrente il cui verso e intensità variano periodicamente nel tempo seguendo una sinusoide", formula: "i(t) = I_max × sin(2πft)", unita: "A", relazioni: ["frequenza", "periodo", "valore_efficace"] },
      { nome: "frequenza", definizione: "numero di cicli completi al secondo", formula: "f = 1/T", unita: "Hz", relazioni: ["periodo", "corrente_alternata"] },
      { nome: "periodo", definizione: "durata di un ciclo completo", formula: "T = 1/f", unita: "s", relazioni: ["frequenza"] },
      { nome: "valore_efficace", definizione: "valore DC equivalente che produce lo stesso effetto termico, RMS", formula: "V_eff = V_max / √2", relazioni: ["tensione", "corrente_alternata"] },
      { nome: "valore_picco", definizione: "ampiezza massima della sinusoide", formula: "V_max = V_eff × √2", relazioni: ["valore_efficace"] },
      { nome: "impedenza", definizione: "opposizione totale al passaggio di corrente alternata, combinazione di R, XL, XC", formula: "Z = √(R² + (XL - XC)²)", unita: "Ω", relazioni: ["resistenza", "reattanza_induttiva", "reattanza_capacitiva"] },
      { nome: "reattanza_induttiva", definizione: "opposizione al passaggio di corrente AC da parte di un induttore", formula: "XL = 2πfL", unita: "Ω", relazioni: ["frequenza", "induttanza", "impedenza"] },
      { nome: "reattanza_capacitiva", definizione: "opposizione al passaggio di corrente AC da parte di un condensatore", formula: "XC = 1 / (2πfC)", unita: "Ω", relazioni: ["frequenza", "capacita", "impedenza"] },
      { nome: "induttanza", definizione: "proprietà di un conduttore di opporsi alla variazione di corrente generando un campo magnetico", unita: "H", relazioni: ["reattanza_induttiva", "campo_magnetico"] },
      { nome: "capacita", definizione: "proprietà di accumulare carica elettrica tra due armature separate da un dielettrico", unita: "F", relazioni: ["reattanza_capacitiva", "carica_elettrica"] },
      { nome: "sfasamento", definizione: "differenza di fase tra tensione e corrente, causata da componenti reattivi", unita: "gradi o radianti", relazioni: ["impedenza", "fattore_potenza"] },
      { nome: "fattore_potenza", definizione: "coseno dell'angolo di sfasamento tra tensione e corrente, indica quanta potenza è effettivamente utilizzata", formula: "cosφ = P / S = R / Z", relazioni: ["sfasamento", "potenza_attiva", "potenza_apparente"] }
    ],
    formule: [
      { nome: "Impedenza", formula: "Z = √(R² + (XL - XC)²)", variabili: { Z: "impedenza (Ω)", R: "resistenza (Ω)", XL: "reattanza induttiva (Ω)", XC: "reattanza capacitiva (Ω)" }, esempio: "R=30Ω, XL=40Ω, XC=0 → Z=50Ω" },
      { nome: "Reattanza induttiva", formula: "XL = 2πfL", variabili: { XL: "Ω", f: "Hz", L: "H" }, esempio: "f=50Hz, L=0.1H → XL=31.4Ω" },
      { nome: "Reattanza capacitiva", formula: "XC = 1/(2πfC)", variabili: { XC: "Ω", f: "Hz", C: "F" }, esempio: "f=50Hz, C=100μF → XC=31.8Ω" },
      { nome: "Valore efficace", formula: "V_eff = V_max / √2 ≈ V_max × 0.707", variabili: { V_eff: "V RMS", V_max: "V picco" }, esempio: "V_max=325V → V_eff≈230V" }
    ],
    misure: [
      { grandezza: "tensione_ac", strumento: "multimetro AC (True RMS)", procedura: "selezionare AC, collegare in parallelo", valore_tipico: "230V monofase, 400V trifase", unita: "V" },
      { grandezza: "frequenza", strumento: "frequenzimetro o multimetro", procedura: "misurare sui morsetti della rete", valore_tipico: "50Hz ±0.5Hz", unita: "Hz" },
      { grandezza: "fattore_potenza", strumento: "wattmetro o analizzatore di rete", procedura: "misurare P e S, oppure angolo di fase", valore_tipico: "0.85-1.0 per carichi resistivi, 0.5-0.8 per motori", unita: "adimensionale" }
    ],
    componenti: [
      { nome: "condensatore", tipo: "passivo", funzione: "accumulare energia nel campo elettrico, filtrare, rifasare", guasti_tipici: ["cortocircuito interno", "capacità ridotta per invecchiamento", "aperto"], misure: ["capacita", "resistenza_isolamento"] },
      { nome: "induttore", tipo: "passivo", funzione: "accumulare energia nel campo magnetico, filtrare, limitare variazioni di corrente", guasti_tipici: ["cortocircuito tra spire", "nucleo saturato", "aperto"], misure: ["induttanza", "resistenza_dc"] }
    ],
    guasti: [
      { nome: "basso fattore di potenza", causa: "carichi fortemente induttivi (motori, trasformatori a vuoto) senza rifasamento", sintomo: "corrente elevata a parità di potenza utile, bolletta penalizzata, cavi sovraccarichi", verifica: "misura cosφ con analizzatore di rete", componenti_coinvolti: ["motore", "condensatore_rifasamento"] }
    ],
    norme: [],
    casi: [],
    relazioni: [
      { da: "corrente_alternata", a: "frequenza", tipo: "ha_proprieta" },
      { da: "impedenza", a: "resistenza", tipo: "contiene" },
      { da: "impedenza", a: "reattanza_induttiva", tipo: "contiene" },
      { da: "impedenza", a: "reattanza_capacitiva", tipo: "contiene" },
      { da: "fattore_potenza", a: "sfasamento", tipo: "deriva_da" },
      { da: "induttanza", a: "reattanza_induttiva", tipo: "determina" },
      { da: "capacita", a: "reattanza_capacitiva", tipo: "determina" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 3 — MONOFASE E TRIFASE
  // ═══════════════════════════════════════════════════════════
  {
    id: "L03",
    nome: "Sistemi monofase e trifase",
    prerequisiti: ["L00", "L01", "L02"],
    concetti: [
      { nome: "sistema_monofase", definizione: "alimentazione con una fase e un neutro, tensione 230V in Italia (tra fase e neutro)", relazioni: ["tensione", "neutro", "fase"] },
      { nome: "fase", definizione: "conduttore attivo che porta la tensione dal generatore al carico", relazioni: ["tensione", "corrente"] },
      { nome: "neutro", definizione: "conduttore di ritorno a potenziale circa zero, collegato al centro stella del trasformatore", relazioni: ["fase", "tensione", "terra"] },
      { nome: "terra", definizione: "collegamento al suolo per sicurezza, dispersione delle correnti di guasto", relazioni: ["neutro", "protezione", "messa_a_terra"] },
      { nome: "sistema_trifase", definizione: "tre fasi sfasate di 120° tra loro, consente trasmissione più efficiente della potenza", relazioni: ["fase", "stella", "triangolo"] },
      { nome: "stella", definizione: "collegamento trifase con punto comune (neutro), V_fase = V_concatenata / √3", formula: "V_fase = V_linea / √3", relazioni: ["sistema_trifase", "neutro"] },
      { nome: "triangolo", definizione: "collegamento trifase senza neutro, ogni carico riceve la tensione concatenata", formula: "I_linea = I_fase × √3", relazioni: ["sistema_trifase"] },
      { nome: "tensione_concatenata", definizione: "tensione tra due fasi", formula: "V_cc = V_fase × √3 = 400V", unita: "V", relazioni: ["sistema_trifase", "stella"] },
      { nome: "sistema_TT", definizione: "neutro del trasformatore a terra, masse dell'utente a terra indipendente — richiede differenziale", relazioni: ["terra", "protezione", "differenziale"] },
      { nome: "sistema_TN", definizione: "neutro a terra, masse collegate al neutro (TN-S: PE separato, TN-C: PEN comune)", relazioni: ["terra", "protezione", "neutro"] },
      { nome: "squilibrio_carichi", definizione: "carichi diversi sulle tre fasi causano corrente nel neutro e tensioni squilibrate", relazioni: ["sistema_trifase", "neutro", "corrente"] }
    ],
    formule: [
      { nome: "Tensione concatenata", formula: "V_cc = V_fase × √3", variabili: { V_cc: "tensione concatenata (V)", V_fase: "tensione di fase (V)" }, esempio: "V_fase=230V → V_cc=400V" },
      { nome: "Potenza trifase equilibrata", formula: "P = √3 × V_cc × I × cosφ", variabili: { P: "potenza (W)", V_cc: "V concatenata", I: "corrente di linea (A)" }, esempio: "400V, 10A, cosφ=0.85 → P=5.9kW" },
      { nome: "Corrente di linea stella", formula: "I_linea = I_fase", variabili: {}, esempio: "In stella la corrente di linea è uguale a quella di fase" },
      { nome: "Corrente di linea triangolo", formula: "I_linea = I_fase × √3", variabili: {}, esempio: "I_fase=10A → I_linea=17.3A" }
    ],
    misure: [
      { grandezza: "tensione_fase_neutro", strumento: "multimetro", procedura: "misurare tra fase e neutro", valore_tipico: "230V ±10%", unita: "V" },
      { grandezza: "tensione_fase_fase", strumento: "multimetro", procedura: "misurare tra due fasi", valore_tipico: "400V ±10%", unita: "V" },
      { grandezza: "tensione_neutro_terra", strumento: "multimetro", procedura: "misurare tra neutro e terra", valore_tipico: "<10V (ideale 0V)", unita: "V" },
      { grandezza: "squilibrio_tensioni", strumento: "analizzatore trifase", procedura: "misurare le 3 tensioni concatenate, calcolare la deviazione %", valore_tipico: "<2%", unita: "%" }
    ],
    componenti: [],
    guasti: [
      { nome: "neutro interrotto", causa: "morsetto allentato, conduttore rotto nel quadro o nel contatore", sintomo: "tensioni anomale tra fase e neutro (alcune salgono, altre scendono), apparecchi che si danneggiano", verifica: "misura tensione N-T (se alta, neutro interrotto), continuità del neutro", componenti_coinvolti: ["neutro", "morsetto", "quadro"] },
      { nome: "inversione fasi", causa: "errore di cablaggio nel collegamento trifase", sintomo: "motori girano al contrario, sequenza fasi errata", verifica: "indicatore di sequenza fasi", componenti_coinvolti: ["motore", "contattore"] },
      { nome: "squilibrio fasi", causa: "carichi monofase distribuiti male sulle tre fasi", sintomo: "corrente elevata nel neutro, tensioni squilibrate, surriscaldamento", verifica: "misura corrente su ogni fase e sul neutro", componenti_coinvolti: ["neutro", "quadro"] }
    ],
    norme: [
      { codice: "CEI 64-8/1", titolo: "Impianti elettrici utilizzatori BT — Principi fondamentali", applicazione: "definizioni, scopo, classificazione dei sistemi di distribuzione (TT, TN, IT)" }
    ],
    casi: [
      { scenario: "In un appartamento alcune prese hanno tensione 280V e altre 180V, una TV si è bruciata", misure: { V_L1_N: "280V", V_L2_N: "180V", V_N_T: "45V" }, causa: "neutro interrotto a monte del quadro", soluzione: "ripristinare la connessione del neutro, verificare morsettiere contatore e quadro", ragionamento: "Tensioni anomale complementari (280+180≈460) + tensione N-T elevata indicano neutro interrotto. I carichi si comportano come partitore: chi ha meno carico vede tensione più alta." }
    ],
    relazioni: [
      { da: "sistema_monofase", a: "fase", tipo: "usa" },
      { da: "sistema_monofase", a: "neutro", tipo: "usa" },
      { da: "sistema_trifase", a: "stella", tipo: "tipo" },
      { da: "sistema_trifase", a: "triangolo", tipo: "tipo" },
      { da: "sistema_TT", a: "terra", tipo: "richiede" },
      { da: "sistema_TT", a: "differenziale", tipo: "richiede" },
      { da: "neutro_interrotto", a: "squilibrio_carichi", tipo: "causa" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 4 — POTENZA, ENERGIA, RIFASAMENTO, ARMONICHE
  // ═══════════════════════════════════════════════════════════
  {
    id: "L04",
    nome: "Potenza, energia, rifasamento, armoniche",
    prerequisiti: ["L02", "L03"],
    concetti: [
      { nome: "potenza_attiva", definizione: "potenza effettivamente convertita in lavoro utile (calore, moto, luce)", formula: "P = V × I × cosφ", unita: "W", relazioni: ["potenza_reattiva", "potenza_apparente", "fattore_potenza"] },
      { nome: "potenza_reattiva", definizione: "potenza scambiata tra sorgente e componenti reattivi senza produrre lavoro utile", formula: "Q = V × I × sinφ", unita: "var", relazioni: ["potenza_attiva", "potenza_apparente"] },
      { nome: "potenza_apparente", definizione: "prodotto di tensione e corrente efficaci, potenza totale che la rete deve fornire", formula: "S = V × I = √(P² + Q²)", unita: "VA", relazioni: ["potenza_attiva", "potenza_reattiva"] },
      { nome: "triangolo_potenze", definizione: "relazione geometrica tra P, Q e S: P orizzontale, Q verticale, S ipotenusa", formula: "S² = P² + Q²", relazioni: ["potenza_attiva", "potenza_reattiva", "potenza_apparente"] },
      { nome: "rifasamento", definizione: "inserzione di condensatori per ridurre la potenza reattiva e portare cosφ verso 1", formula: "C = Q_c / (2πf × V²)", relazioni: ["fattore_potenza", "condensatore", "potenza_reattiva"] },
      { nome: "armoniche", definizione: "componenti sinusoidali a frequenza multipla della fondamentale (100Hz, 150Hz, 200Hz... per 50Hz)", relazioni: ["frequenza", "distorsione", "corrente_alternata"] },
      { nome: "THD", definizione: "Total Harmonic Distortion — misura della distorsione armonica totale in percentuale", formula: "THD = √(ΣV_n²) / V_1 × 100%", unita: "%", relazioni: ["armoniche", "qualita_energia"] },
      { nome: "contatore_energia", definizione: "misura l'energia consumata nel tempo, bidirezionale per fotovoltaico", unita: "kWh", relazioni: ["energia", "potenza_attiva"] }
    ],
    formule: [
      { nome: "Potenza attiva monofase", formula: "P = V × I × cosφ", variabili: { P: "W", V: "V", I: "A", "cosφ": "fattore di potenza" }, esempio: "230V, 10A, cosφ=0.85 → P=1955W" },
      { nome: "Potenza reattiva", formula: "Q = V × I × sinφ", variabili: { Q: "var" }, esempio: "230V, 10A, sinφ=0.53 → Q=1219var" },
      { nome: "Potenza apparente", formula: "S = V × I = √(P² + Q²)", variabili: { S: "VA" }, esempio: "S = √(1955² + 1219²) = 2300VA" },
      { nome: "Capacità rifasamento", formula: "C = (P × (tanφ1 - tanφ2)) / (2π × f × V²)", variabili: { C: "F", "φ1": "angolo iniziale", "φ2": "angolo desiderato" }, esempio: "Rifasare da cosφ=0.7 a cosφ=0.95" },
      { nome: "Energia", formula: "E = P × t", variabili: { E: "kWh" }, esempio: "3kW × 4h = 12kWh (≈ €2.40 a €0.20/kWh)" }
    ],
    misure: [
      { grandezza: "potenza_attiva", strumento: "wattmetro o analizzatore di rete", procedura: "collegare in serie (corrente) e parallelo (tensione)", valore_tipico: "da 100W (lampada) a 50kW+ (industriale)", unita: "W" },
      { grandezza: "THD", strumento: "analizzatore di rete o power quality analyzer", procedura: "misurare per almeno 10 minuti in condizioni normali di carico", valore_tipico: "THD_V <8%, THD_I <20% per LV", unita: "%" }
    ],
    componenti: [
      { nome: "condensatore_rifasamento", tipo: "rifasamento", funzione: "compensare la potenza reattiva induttiva, migliorare il cosφ", guasti_tipici: ["cortocircuito interno (rigonfiamento)", "perdita capacità", "scarica incompleta pericolosa"], misure: ["capacita", "resistenza_isolamento"] },
      { nome: "centralina_rifasamento", tipo: "rifasamento", funzione: "inserire/disinserire automaticamente batterie di condensatori per mantenere cosφ target", guasti_tipici: ["contattore bloccato", "regolatore guasto", "condensatori esauriti"], misure: ["cosfi", "corrente_inserzione"] }
    ],
    guasti: [
      { nome: "penale cosfi", causa: "impianto con molti motori/trasformatori non rifasato", sintomo: "bolletta con penale per energia reattiva, correnti elevate sui cavi", verifica: "misura cosφ con analizzatore di rete al quadro generale", componenti_coinvolti: ["condensatore_rifasamento", "centralina_rifasamento", "motore"] },
      { nome: "distorsione armonica", causa: "carichi non lineari (inverter, UPS, lampade LED, PC) che assorbono corrente non sinusoidale", sintomo: "surriscaldamento neutro, interferenze, malfunzionamenti RCD tipo AC", verifica: "misura THD con analizzatore, verifica corrente neutro", componenti_coinvolti: ["neutro", "differenziale", "trasformatore"] }
    ],
    norme: [
      { codice: "CEI EN 50160", titolo: "Caratteristiche della tensione fornita dalle reti pubbliche di distribuzione", applicazione: "limiti di THD, variazioni di tensione, frequenza" }
    ],
    casi: [],
    relazioni: [
      { da: "potenza_attiva", a: "potenza_reattiva", tipo: "complementa" },
      { da: "potenza_attiva", a: "potenza_apparente", tipo: "componente_di" },
      { da: "rifasamento", a: "condensatore_rifasamento", tipo: "usa" },
      { da: "armoniche", a: "THD", tipo: "misurato_da" },
      { da: "armoniche", a: "surriscaldamento", tipo: "causa" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 5 — MISURE ELETTRICHE E STRUMENTI
  // ═══════════════════════════════════════════════════════════
  {
    id: "L05",
    nome: "Misure elettriche e strumenti",
    prerequisiti: ["L00", "L01", "L02"],
    concetti: [
      { nome: "misura_isolamento", definizione: "verifica della resistenza di isolamento tra conduttori attivi e terra, indica integrità dell'isolamento", formula: "R_iso > 1MΩ (per circuiti <500V)", unita: "MΩ", relazioni: ["isolante", "dispersione", "megger"] },
      { nome: "misura_continuita", definizione: "verifica che un conduttore è integro e le connessioni sono buone", formula: "R < 1Ω per conduttori, R < 0.2Ω per PE", unita: "Ω", relazioni: ["conduttore", "morsetto", "circuito_aperto"] },
      { nome: "misura_terra", definizione: "verifica della resistenza dell'impianto di messa a terra", formula: "R_t × I_dn ≤ 50V (sistema TT)", unita: "Ω", relazioni: ["terra", "differenziale", "sistema_TT"] },
      { nome: "misura_impedenza_anello", definizione: "impedenza del percorso di guasto fase-PE o fase-neutro, determina se la protezione interviene in tempo", formula: "Zs × Ia ≤ Uo", unita: "Ω", relazioni: ["impedenza", "protezione", "cortocircuito"] },
      { nome: "misura_corrente_dispersione", definizione: "corrente che fluisce verso terra attraverso l'isolamento, normalmente piccola", formula: "I_disp = V / R_iso", unita: "mA", relazioni: ["dispersione", "differenziale", "isolamento"] },
      { nome: "prova_differenziale", definizione: "verifica del corretto funzionamento del dispositivo differenziale (RCD)", relazioni: ["differenziale", "tempo_intervento"] },
      { nome: "classe_precisione", definizione: "errore massimo percentuale di uno strumento di misura", relazioni: ["strumento"] }
    ],
    formule: [
      { nome: "Condizione protezione TT", formula: "R_t × I_dn ≤ 50V", variabili: { R_t: "resistenza terra (Ω)", I_dn: "corrente differenziale nominale (A)" }, esempio: "Diff 30mA: R_t ≤ 50/0.03 = 1667Ω" },
      { nome: "Condizione protezione TN", formula: "Zs × Ia ≤ Uo", variabili: { Zs: "impedenza anello (Ω)", Ia: "corrente intervento protezione (A)", Uo: "tensione fase-terra (V)" }, esempio: "MCB C16 (Ia=80A): Zs ≤ 230/80 = 2.88Ω" }
    ],
    misure: [
      { grandezza: "isolamento", strumento: "megger (misuratore di isolamento)", procedura: "circuito aperto, scollegare carichi sensibili, applicare 500V DC tra fase e terra per 1 minuto", valore_tipico: ">1MΩ (nuovo >100MΩ)", unita: "MΩ" },
      { grandezza: "continuita_PE", strumento: "misuratore a bassa tensione (<24V DC)", procedura: "tra PE al quadro e PE alla presa più lontana, con cavo di prova", valore_tipico: "<1Ω", unita: "Ω" },
      { grandezza: "resistenza_terra", strumento: "terrametro (metodo volt-amperometrico)", procedura: "due picchetti ausiliari a distanza, misura V e I", valore_tipico: "<200Ω con diff 30mA (CEI 64-8)", unita: "Ω" },
      { grandezza: "tempo_intervento_RCD", strumento: "provadifferenziali", procedura: "iniettare corrente di prova = I_dn, misurare tempo di intervento", valore_tipico: "<300ms a I_dn, <40ms a 5×I_dn (tipo AC/A)", unita: "ms" },
      { grandezza: "impedenza_anello_guasto", strumento: "misuratore impedenza anello", procedura: "tra fase e PE sulla presa più lontana, sotto tensione", valore_tipico: "dipende da MCB e lunghezza cavo", unita: "Ω" }
    ],
    componenti: [
      { nome: "multimetro", tipo: "strumento", funzione: "misurare tensione, corrente, resistenza, continuità, frequenza", guasti_tipici: ["batteria scarica", "fusibile interno bruciato", "puntali danneggiati"], misure: [] },
      { nome: "pinza_amperometrica", tipo: "strumento", funzione: "misurare corrente senza interrompere il circuito", guasti_tipici: ["calibrazione persa", "ganasce sporche"], misure: [] },
      { nome: "megger", tipo: "strumento", funzione: "misurare resistenza di isolamento applicando alta tensione DC", guasti_tipici: ["batteria insufficiente per generare tensione di prova"], misure: [] },
      { nome: "terrametro", tipo: "strumento", funzione: "misurare resistenza dell'impianto di terra", guasti_tipici: ["picchetti insufficienti", "terreno troppo secco"], misure: [] },
      { nome: "analizzatore_rete", tipo: "strumento", funzione: "misurare potenza, cosφ, armoniche, qualità dell'energia", guasti_tipici: [], misure: [] }
    ],
    guasti: [],
    norme: [
      { codice: "CEI 64-8/6", titolo: "Verifiche", applicazione: "verifiche iniziali e periodiche degli impianti elettrici: esame a vista, prove strumentali obbligatorie" }
    ],
    casi: [
      { scenario: "Il differenziale 30mA scatta appena si riarma, senza carichi collegati", misure: { isolamento_L_PE: "0.3MΩ", isolamento_N_PE: "15MΩ" }, causa: "dispersione sull'isolamento del cavo di fase, probabilmente in un punto umido o danneggiato", soluzione: "sezionare i circuiti uno per uno per localizzare il tratto con isolamento compromesso, sostituire il cavo", ragionamento: "Isolamento fase-PE a 0.3MΩ è sotto il minimo (1MΩ). Corrente dispersa: 230V/0.3MΩ = 0.77mA. Con isolamento reale inferiore sotto carico (riscaldamento), supera facilmente 30mA." }
    ],
    relazioni: [
      { da: "misura_isolamento", a: "dispersione", tipo: "rileva" },
      { da: "misura_continuita", a: "circuito_aperto", tipo: "rileva" },
      { da: "misura_terra", a: "sistema_TT", tipo: "verifica" },
      { da: "prova_differenziale", a: "differenziale", tipo: "verifica" },
      { da: "megger", a: "misura_isolamento", tipo: "esegue" },
      { da: "terrametro", a: "misura_terra", tipo: "esegue" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 6 — PROTEZIONI
  // ═══════════════════════════════════════════════════════════
  {
    id: "L06",
    nome: "Protezioni elettriche",
    prerequisiti: ["L01", "L02", "L03", "L05"],
    concetti: [
      { nome: "protezione_sovracorrente", definizione: "dispositivo che interrompe il circuito quando la corrente supera il valore ammesso", relazioni: ["magnetotermico", "fusibile", "corrente"] },
      { nome: "protezione_differenziale", definizione: "dispositivo che rileva la differenza tra corrente di fase e di ritorno (corrente di dispersione verso terra)", formula: "interviene quando I_fase - I_neutro > I_dn", relazioni: ["differenziale", "dispersione", "terra"] },
      { nome: "magnetotermico", definizione: "interruttore automatico con sgancio termico (sovraccarico lento) e magnetico (cortocircuito istantaneo)", relazioni: ["curva_intervento", "protezione_sovracorrente", "In"] },
      { nome: "differenziale", definizione: "RCD — Residual Current Device, rileva corrente di dispersione verso terra", relazioni: ["protezione_differenziale", "toroide", "I_dn"] },
      { nome: "In", definizione: "corrente nominale dell'interruttore, corrente massima ammessa in regime continuo", unita: "A", relazioni: ["magnetotermico"] },
      { nome: "I_dn", definizione: "corrente differenziale nominale, soglia di intervento del differenziale", unita: "mA", relazioni: ["differenziale"] },
      { nome: "curva_intervento", definizione: "caratteristica tempo-corrente dell'interruttore: B (3-5×In), C (5-10×In), D (10-20×In)", relazioni: ["magnetotermico"] },
      { nome: "potere_interruzione", definizione: "corrente di cortocircuito massima che l'interruttore può interrompere in sicurezza", unita: "kA", relazioni: ["magnetotermico", "cortocircuito"] },
      { nome: "selettivita", definizione: "coordinamento tra protezioni affinché intervenga solo quella più vicina al guasto", relazioni: ["protezione_sovracorrente", "magnetotermico"] },
      { nome: "backup", definizione: "protezione di riserva che interviene se la protezione principale non funziona", relazioni: ["selettivita"] },
      { nome: "tipo_differenziale", definizione: "AC (solo sinusoidale), A (sinusoidale+pulsante), B (tutte le forme d'onda), F (per inverter)", relazioni: ["differenziale", "armoniche"] },
      { nome: "coordinamento_protezioni", definizione: "le protezioni devono essere coordinate in corrente e tempo per garantire selettività e protezione completa", relazioni: ["selettivita", "backup"] }
    ],
    formule: [
      { nome: "Corrente convenzionale fusione", formula: "If = 1.45 × In (per MCB)", variabili: { If: "corrente di sicura fusione", In: "corrente nominale" }, esempio: "MCB C16: deve intervenire entro 1h a 1.45×16=23.2A" },
      { nome: "Coordinamento cavo-protezione", formula: "Ib ≤ In ≤ Iz, If ≤ 1.45 × Iz", variabili: { Ib: "corrente di impiego", In: "corrente nominale protezione", Iz: "portata cavo" }, esempio: "Ib=12A, cavo 2.5mm² Iz=21A → In=16A OK" },
      { nome: "Energia passante", formula: "I²t ≤ K²S²", variabili: { "I²t": "energia passante protezione (A²s)", K: "costante materiale (115 rame, 76 alluminio)", S: "sezione cavo (mm²)" }, esempio: "Cavo 2.5mm² rame: K²S²=115²×2.5²=82656 A²s" }
    ],
    misure: [],
    componenti: [
      { nome: "MCB", tipo: "protezione", funzione: "interruttore magnetotermico, protegge da sovraccarico e cortocircuito", guasti_tipici: ["non sgancia (meccanismo bloccato)", "sgancia intempestivo (termico tarato male)", "contatti bruciati"], misure: ["continuita", "resistenza_contatti"] },
      { nome: "RCD", tipo: "protezione", funzione: "interruttore differenziale puro, protegge da contatti indiretti e dispersioni", guasti_tipici: ["non sgancia al test", "sgancia intempestivo (umidità, armoniche)", "toroide saturato"], misure: ["tempo_intervento", "corrente_intervento"] },
      { nome: "RCBO", tipo: "protezione", funzione: "magnetotermico differenziale combinato, protegge da sovraccarico + cortocircuito + dispersione", guasti_tipici: ["come MCB + RCD"], misure: ["tempo_intervento", "continuita"] },
      { nome: "SPD", tipo: "protezione", funzione: "scaricatore di sovratensione, protegge da fulminazioni e transitori", guasti_tipici: ["esaurito (indicatore rosso)", "non collegato a terra"], misure: ["resistenza_isolamento"] }
    ],
    guasti: [
      { nome: "differenziale che scatta senza motivo apparente", causa: "dispersione di isolamento sotto soglia in condizioni normali ma che aumenta con umidità/calore, o accumulo di piccole dispersioni su più circuiti", sintomo: "RCD scatta a orari variabili o dopo pioggia", verifica: "misura isolamento circuito per circuito, misura corrente di dispersione con pinza", componenti_coinvolti: ["differenziale", "cavo", "presa", "elettrodomestico"] },
      { nome: "magnetotermico che scatta sotto carico nominale", causa: "morsetto allentato che genera sovratemperatura locale, o curva sbagliata per il tipo di carico", sintomo: "MCB scatta dopo minuti/ore sotto carico", verifica: "termografia al quadro, verifica coppia morsetti, verifica curva vs tipo carico", componenti_coinvolti: ["magnetotermico", "morsetto"] }
    ],
    norme: [
      { codice: "CEI 64-8/4", titolo: "Protezione per la sicurezza", applicazione: "protezione contro sovracorrenti, contatti diretti e indiretti, sovratensioni" },
      { codice: "CEI EN 61008", titolo: "Interruttori differenziali senza sganciatore di sovracorrente incorporato (RCCB)", applicazione: "requisiti e prove per RCD" },
      { codice: "CEI EN 60898", titolo: "Interruttori automatici per la protezione dalle sovracorrenti per impianti domestici e similari (MCB)", applicazione: "curve B, C, D, poteri di interruzione" }
    ],
    casi: [
      { scenario: "Il differenziale generale 300mA non scatta, ma il 30mA del bagno scatta ogni volta che si usa il phon", misure: { isolamento_phon: "0.8MΩ", isolamento_circuito_bagno: ">100MΩ", corrente_dispersione_phon: "35mA" }, causa: "dispersione interna al phon (isolamento degradato dalla resistenza riscaldante)", soluzione: "sostituire il phon, l'apparecchio ha isolamento sotto norma", ragionamento: "Il 30mA scatta perché il phon disperde 35mA > 30mA. Il 300mA non scatta perché 35mA < 300mA. Selettività corretta: interviene solo il differenziale più sensibile più vicino al guasto." }
    ],
    relazioni: [
      { da: "magnetotermico", a: "protezione_sovracorrente", tipo: "implementa" },
      { da: "differenziale", a: "protezione_differenziale", tipo: "implementa" },
      { da: "selettivita", a: "coordinamento_protezioni", tipo: "richiede" },
      { da: "curva_intervento", a: "magnetotermico", tipo: "caratterizza" },
      { da: "I_dn", a: "differenziale", tipo: "caratterizza" },
      { da: "tipo_differenziale", a: "armoniche", tipo: "dipende_da" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 7 — MESSA A TERRA
  // ═══════════════════════════════════════════════════════════
  {
    id: "L07",
    nome: "Messa a terra",
    prerequisiti: ["L03", "L05", "L06"],
    concetti: [
      { nome: "messa_a_terra", definizione: "collegamento delle masse metalliche al suolo per deviare le correnti di guasto e limitare le tensioni di contatto", relazioni: ["terra", "dispersore", "PE"] },
      { nome: "dispersore", definizione: "elemento metallico a contatto con il terreno che disperde la corrente di guasto", relazioni: ["messa_a_terra", "resistenza_terra"] },
      { nome: "PE", definizione: "conduttore di protezione che collega le masse al dispersore", relazioni: ["messa_a_terra", "conduttore"] },
      { nome: "equipotenziale", definizione: "collegamento che porta tutte le masse allo stesso potenziale eliminando tensioni di contatto pericolose", relazioni: ["messa_a_terra", "PE"] },
      { nome: "tensione_contatto", definizione: "tensione tra una massa in guasto e il suolo a cui è esposta una persona", formula: "V_c = R_t × I_guasto", unita: "V", relazioni: ["messa_a_terra", "resistenza_terra"] },
      { nome: "tensione_passo", definizione: "tensione tra i due piedi di una persona vicina a un dispersore durante un guasto a terra", unita: "V", relazioni: ["messa_a_terra", "dispersore"] },
      { nome: "EQP", definizione: "collegamento equipotenziale principale: collega terra, tubazioni metalliche acqua/gas, strutture", relazioni: ["equipotenziale"] },
      { nome: "EQS", definizione: "collegamento equipotenziale supplementare: nelle zone a rischio (bagni), collega masse estranee e PE", relazioni: ["equipotenziale"] }
    ],
    formule: [
      { nome: "Sezione minima PE", formula: "S_PE ≥ S_fase (se S≤16mm²), S_PE ≥ 16 (se S>35mm²)", variabili: { S_PE: "sezione PE (mm²)", S_fase: "sezione fase (mm²)" }, esempio: "Fase 2.5mm² → PE minimo 2.5mm² (giallo/verde)" },
      { nome: "Tensione contatto limite", formula: "V_L = 50V (ambienti normali), 25V (ambienti speciali)", variabili: { V_L: "V" }, esempio: "Sistema TT con diff 30mA: R_t ≤ 50/0.03 = 1667Ω" }
    ],
    misure: [],
    componenti: [
      { nome: "dispersore_picchetto", tipo: "terra", funzione: "picchetto in acciaio zincato o rame infisso nel terreno", guasti_tipici: ["corrosione", "contatto con terreno insufficiente (secco)"], misure: ["resistenza_terra"] },
      { nome: "dispersore_fondazione", tipo: "terra", funzione: "tondino o piattina nelle fondazioni dell'edificio", guasti_tipici: ["corrosione accelerata in terreni acidi"], misure: ["resistenza_terra"] },
      { nome: "nodo_terra", tipo: "terra", funzione: "punto di connessione tra dispersore, PE principale e EQP", guasti_tipici: ["ossidazione contatti", "serraggio insufficiente"], misure: ["continuita", "resistenza_contatti"] }
    ],
    guasti: [
      { nome: "terra inefficiente", causa: "dispersore corroso, terreno molto secco, collegamento interrotto", sintomo: "differenziale non interviene in tempo su guasto a terra, tensione di contatto pericolosa", verifica: "misura resistenza terra con terrametro, verifica continuità PE", componenti_coinvolti: ["dispersore", "nodo_terra", "PE"] },
      { nome: "EQP mancante", causa: "collegamento equipotenziale mai realizzato o interrotto", sintomo: "formicolio toccando rubinetto e apparecchio elettrico contemporaneamente", verifica: "continuità tra tubazioni metalliche e nodo terra", componenti_coinvolti: ["nodo_terra", "tubazioni"] }
    ],
    norme: [
      { codice: "CEI 64-8/5", titolo: "Scelta e installazione dei componenti elettrici — Messa a terra", applicazione: "dispersori, conduttori PE, EQP, EQS, dimensionamento" }
    ],
    casi: [
      { scenario: "In un bagno, toccando il rubinetto della vasca si avverte una scossa leggera", misure: { V_rubinetto_terra: "18V", continuita_EQS: ">10kΩ", R_terra: "15Ω" }, causa: "collegamento equipotenziale supplementare (EQS) del bagno interrotto o mai realizzato", soluzione: "realizzare/ripristinare il collegamento EQS tra tubazione acqua, scarico vasca, PE e radiatore", ragionamento: "18V tra rubinetto e terra indica potenziale sulla tubazione. EQS interrotto (>10kΩ) conferma. La tubazione ha un potenziale diverso dalla terra dell'impianto elettrico." }
    ],
    relazioni: [
      { da: "messa_a_terra", a: "dispersore", tipo: "usa" },
      { da: "messa_a_terra", a: "PE", tipo: "usa" },
      { da: "messa_a_terra", a: "equipotenziale", tipo: "complementa" },
      { da: "EQP", a: "equipotenziale", tipo: "tipo" },
      { da: "EQS", a: "equipotenziale", tipo: "tipo" },
      { da: "tensione_contatto", a: "messa_a_terra", tipo: "limitata_da" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 8 — IMPIANTI CIVILI
  // ═══════════════════════════════════════════════════════════
  {
    id: "L08",
    nome: "Impianti civili",
    prerequisiti: ["L03", "L06", "L07"],
    concetti: [
      { nome: "quadro_elettrico", definizione: "contenitore che ospita le protezioni e i dispositivi di manovra dell'impianto", relazioni: ["magnetotermico", "differenziale", "impianto_civile"] },
      { nome: "circuito_luce", definizione: "circuito dedicato all'illuminazione, solitamente 1.5mm² con MCB 10A", relazioni: ["illuminazione", "magnetotermico", "conduttore"] },
      { nome: "circuito_prese", definizione: "circuito dedicato alle prese, solitamente 2.5mm² con MCB 16A", relazioni: ["presa", "magnetotermico", "conduttore"] },
      { nome: "circuito_dedicato", definizione: "circuito riservato a un singolo utilizzatore di potenza (forno, lavatrice, condizionatore)", relazioni: ["carico", "magnetotermico"] },
      { nome: "sezione_cavo", definizione: "sezione del conduttore in mm², determina la portata di corrente e la caduta di tensione", unita: "mm²", relazioni: ["conduttore", "portata", "caduta_tensione"] },
      { nome: "portata", definizione: "corrente massima ammessa in regime continuo per un cavo in una data posa", unita: "A", relazioni: ["sezione_cavo", "temperatura"] },
      { nome: "caduta_tensione", definizione: "perdita di tensione lungo il cavo dal quadro alla presa, deve essere <4%", formula: "ΔV% = (ρ × L × I × 2 × cosφ) / (S × V) × 100", relazioni: ["sezione_cavo", "resistenza"] },
      { nome: "cassetta_derivazione", definizione: "punto di giunzione dei cavi protetto da un contenitore ispezionabile", relazioni: ["conduttore", "morsetto"] },
      { nome: "deviatore", definizione: "interruttore a tre morsetti che permette di comandare una luce da due punti", relazioni: ["illuminazione", "circuito_luce"] },
      { nome: "invertitore", definizione: "interruttore a quattro morsetti inserito tra due deviatori per comandare da tre o più punti", relazioni: ["deviatore", "illuminazione"] }
    ],
    formule: [
      { nome: "Caduta tensione monofase", formula: "ΔV = 2 × ρ × L × I / S", variabili: { "ΔV": "caduta (V)", "ρ": "resistività (Ω·mm²/m)", L: "lunghezza (m)", I: "corrente (A)", S: "sezione (mm²)" }, esempio: "Rame 1.5mm², 20m, 10A: ΔV = 2×0.0178×20×10/1.5 = 4.7V (2%)" },
      { nome: "Corrente di impiego", formula: "Ib = P / (V × cosφ)", variabili: { Ib: "corrente di impiego (A)" }, esempio: "Forno 3kW: Ib = 3000/(230×1) = 13A → MCB 16A, cavo 2.5mm²" },
      { nome: "Numero minimo circuiti", formula: "CEI 64-8: minimo 2 circuiti luce + 2 circuiti prese per appartamento", variabili: {}, esempio: "Appartamento 100m²: 2 circ. luce 10A + 2 circ. prese 16A + dedicati" }
    ],
    misure: [],
    componenti: [
      { nome: "interruttore_unipolare", tipo: "comando", funzione: "accendere/spegnere un circuito da un punto", guasti_tipici: ["contatto bruciato", "meccanismo rotto"], misure: ["continuita"] },
      { nome: "presa_2P_T", tipo: "presa", funzione: "presa bipolare con terra (Schuko o italiana)", guasti_tipici: ["morsetti allentati", "contatti consumati", "terra staccata"], misure: ["tensione", "continuita_PE"] },
      { nome: "cavo_unipolare", tipo: "conduttore", funzione: "conduttore singolo in tubo protettivo", guasti_tipici: ["isolamento danneggiato in curva stretta", "sovradimensionato/sottodimensionato"], misure: ["isolamento", "continuita"] }
    ],
    guasti: [
      { nome: "presa senza terra", causa: "PE non collegato o interrotto nella cassetta", sintomo: "nessuna protezione da contatto indiretto, tester PE negativo", verifica: "continuità PE dalla presa al quadro", componenti_coinvolti: ["presa_2P_T", "PE", "cassetta_derivazione"] },
      { nome: "caduta tensione eccessiva", causa: "cavo sottodimensionato o tratta troppo lunga", sintomo: "luci fioche, apparecchi che non funzionano bene sotto carico", verifica: "misura tensione a vuoto e sotto carico, calcolo ΔV%", componenti_coinvolti: ["cavo_unipolare", "sezione_cavo"] },
      { nome: "falso contatto in morsetto", causa: "serraggio insufficiente o ossidazione", sintomo: "funzionamento intermittente, surriscaldamento locale, annerimento morsetto", verifica: "termografia, riserraggio con coppia corretta", componenti_coinvolti: ["morsetto", "cassetta_derivazione"] }
    ],
    norme: [
      { codice: "CEI 64-8", titolo: "Impianti elettrici utilizzatori a tensione nominale non superiore a 1000V AC e 1500V DC", applicazione: "norma fondamentale per impianti civili e industriali BT" },
      { codice: "DM 37/2008", titolo: "Decreto Ministeriale sulla sicurezza degli impianti", applicazione: "obbligo di progetto, dichiarazione di conformità, abilitazione installatori" }
    ],
    casi: [
      { scenario: "Le luci del corridoio lampeggiano quando si accende la lavatrice", misure: { V_corridoio_a_vuoto: "232V", V_corridoio_con_lavatrice: "218V", V_quadro_con_lavatrice: "228V" }, causa: "caduta di tensione eccessiva sul circuito luci per sezione troppo piccola o connessione in derivazione da un circuito sovraccarico", soluzione: "verificare che luci e lavatrice siano su circuiti separati, se necessario dedicare un circuito alla lavatrice", ragionamento: "14V di caduta al corridoio ma solo 4V al quadro indica che il problema è tra quadro e corridoio. Se condividono un tratto di cavo, la corrente della lavatrice causa caduta di tensione sul tratto comune." }
    ],
    relazioni: [
      { da: "quadro_elettrico", a: "magnetotermico", tipo: "contiene" },
      { da: "quadro_elettrico", a: "differenziale", tipo: "contiene" },
      { da: "circuito_luce", a: "magnetotermico", tipo: "protetto_da" },
      { da: "circuito_prese", a: "magnetotermico", tipo: "protetto_da" },
      { da: "sezione_cavo", a: "portata", tipo: "determina" },
      { da: "sezione_cavo", a: "caduta_tensione", tipo: "influenza" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 9 — IMPIANTI INDUSTRIALI
  // ═══════════════════════════════════════════════════════════
  {
    id: "L09",
    nome: "Impianti industriali",
    prerequisiti: ["L03", "L04", "L06", "L08"],
    concetti: [
      { nome: "quadro_industriale", definizione: "quadro di distribuzione e comando per impianti industriali con sbarre, sezionatori e contattori", relazioni: ["quadro_elettrico", "sbarra"] },
      { nome: "sbarra", definizione: "conduttore rigido in rame o alluminio per distribuzione ad alta corrente nel quadro", relazioni: ["quadro_industriale", "corrente"] },
      { nome: "contattore", definizione: "interruttore elettromeccanico comandato da bobina, per inserire/disinserire carichi di potenza", relazioni: ["motore", "comando"] },
      { nome: "rele_termico", definizione: "protezione termica per motori basata su bimetallo, calibrata sulla corrente nominale del motore", relazioni: ["motore", "sovraccarico", "protezione"] },
      { nome: "avviamento_stella_triangolo", definizione: "tecnica per avviare motori trifase riducendo la corrente di spunto (Iavv ridotta a 1/3)", relazioni: ["motore", "contattore", "stella", "triangolo"] },
      { nome: "soft_starter", definizione: "dispositivo elettronico che limita la tensione in fase di avviamento del motore", relazioni: ["motore", "avviamento"] },
      { nome: "inverter_motore", definizione: "convertitore di frequenza che regola velocità e coppia del motore variando frequenza e tensione", relazioni: ["motore", "frequenza", "velocita"] },
      { nome: "PLC", definizione: "controllore logico programmabile per automazione industriale", relazioni: ["automazione", "sensore", "attuatore"] },
      { nome: "borchia_emergenza", definizione: "pulsante a fungo per arresto di emergenza, normalmente chiuso", relazioni: ["sicurezza", "arresto"] }
    ],
    formule: [
      { nome: "Corrente nominale motore trifase", formula: "In = P / (√3 × V × cosφ × η)", variabili: { In: "A", P: "potenza meccanica (W)", V: "tensione concatenata (V)", "cosφ": "fattore potenza", "η": "rendimento" }, esempio: "Motore 7.5kW, 400V, cosφ=0.85, η=0.88 → In = 7500/(1.732×400×0.85×0.88) = 14.5A" },
      { nome: "Corrente di spunto motore", formula: "I_avv = 5÷8 × In (avv. diretto), I_avv = (5÷8)/3 × In (Y-Δ)", variabili: {}, esempio: "Motore 14.5A → spunto diretto ~100A, Y-Δ ~33A" }
    ],
    misure: [],
    componenti: [
      { nome: "sezionatore", tipo: "manovra", funzione: "interruttore senza potere di interruzione, per isolamento a vuoto", guasti_tipici: ["contatti ossidati", "meccanismo bloccato"], misure: ["continuita"] },
      { nome: "contattore_potenza", tipo: "manovra", funzione: "inserzione e disinserzione sotto carico, comandato da PLC o pulsanti", guasti_tipici: ["bobina bruciata", "contatti saldati", "molle stanche"], misure: ["resistenza_contatti", "isolamento_bobina"] }
    ],
    guasti: [
      { nome: "contattore non chiude", causa: "bobina bruciata, tensione di comando insufficiente, interblocco meccanico", sintomo: "motore non parte, nessun click dal contattore", verifica: "misurare tensione ai capi della bobina, verificare resistenza bobina", componenti_coinvolti: ["contattore", "bobina", "PLC"] },
      { nome: "relè termico che scatta", causa: "sovraccarico meccanico, fase mancante, calibrazione errata", sintomo: "motore si ferma dopo minuti di funzionamento, relè in allarme", verifica: "misurare corrente su tutte e tre le fasi, verificare carico meccanico", componenti_coinvolti: ["rele_termico", "motore"] }
    ],
    norme: [
      { codice: "CEI EN 61439", titolo: "Apparecchiature assiemate di protezione e di manovra per bassa tensione (quadri)", applicazione: "progettazione, costruzione e verifica quadri elettrici industriali" }
    ],
    casi: [],
    relazioni: [
      { da: "contattore", a: "motore", tipo: "comanda" },
      { da: "rele_termico", a: "motore", tipo: "protegge" },
      { da: "inverter_motore", a: "motore", tipo: "controlla" },
      { da: "PLC", a: "contattore", tipo: "comanda" },
      { da: "avviamento_stella_triangolo", a: "contattore", tipo: "usa" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 10 — MOTORI ELETTRICI
  // ═══════════════════════════════════════════════════════════
  {
    id: "L10",
    nome: "Motori elettrici",
    prerequisiti: ["L02", "L03", "L09"],
    concetti: [
      { nome: "motore_asincrono", definizione: "motore AC il cui rotore gira a velocità inferiore al campo rotante (scorrimento)", relazioni: ["campo_rotante", "scorrimento", "coppia"] },
      { nome: "campo_rotante", definizione: "campo magnetico che ruota nello statore alimentato da corrente trifase", formula: "n_sincrono = 60 × f / p", relazioni: ["frequenza", "poli"] },
      { nome: "scorrimento", definizione: "differenza relativa tra velocità del campo e velocità del rotore", formula: "s = (n_s - n) / n_s", relazioni: ["motore_asincrono", "velocita"] },
      { nome: "coppia", definizione: "forza rotazionale prodotta dal motore", unita: "Nm", relazioni: ["potenza_meccanica", "velocita"] },
      { nome: "potenza_meccanica", definizione: "potenza effettiva all'albero del motore", formula: "P_mecc = C × ω = C × 2πn/60", unita: "W", relazioni: ["coppia", "velocita"] },
      { nome: "classe_isolamento", definizione: "temperatura massima ammessa per l'isolamento degli avvolgimenti (B=130°C, F=155°C, H=180°C)", relazioni: ["surriscaldamento", "motore_asincrono"] },
      { nome: "motore_monofase", definizione: "motore alimentato da una sola fase, necessita condensatore di avviamento", relazioni: ["condensatore", "sistema_monofase"] }
    ],
    formule: [
      { nome: "Velocità sincrona", formula: "n_s = 60 × f / p", variabili: { n_s: "giri/min", f: "frequenza (Hz)", p: "coppie polari" }, esempio: "f=50Hz, 2 poli (p=1): n_s=3000rpm; 4 poli (p=2): n_s=1500rpm" },
      { nome: "Scorrimento", formula: "s = (n_s - n) / n_s × 100%", variabili: {}, esempio: "n_s=1500rpm, n=1450rpm → s=3.3%" },
      { nome: "Potenza meccanica", formula: "P = C × 2π × n / 60", variabili: { P: "W", C: "coppia (Nm)", n: "giri/min" }, esempio: "C=50Nm, n=1450rpm → P=7592W ≈ 7.6kW" }
    ],
    misure: [
      { grandezza: "resistenza_avvolgimenti", strumento: "milliohmetro o ponte di Wheatstone", procedura: "misurare tra i morsetti U-V, V-W, W-U — devono essere uguali (±5%)", valore_tipico: "0.5-50Ω secondo taglia", unita: "Ω" },
      { grandezza: "isolamento_avvolgimenti", strumento: "megger 500V o 1000V", procedura: "misurare tra ogni avvolgimento e massa del motore", valore_tipico: ">1MΩ (nuovo >100MΩ)", unita: "MΩ" },
      { grandezza: "corrente_assorbita", strumento: "pinza amperometrica", procedura: "misurare sulle tre fasi durante il funzionamento", valore_tipico: "valore di targa ±10%", unita: "A" },
      { grandezza: "vibrazione", strumento: "vibrometro", procedura: "misurare su cuscinetti e corpo motore", valore_tipico: "<4.5mm/s RMS (ISO 10816)", unita: "mm/s" }
    ],
    componenti: [],
    guasti: [
      { nome: "cortocircuito tra spire", causa: "surriscaldamento, invecchiamento isolamento, umidità", sintomo: "corrente squilibrata sulle tre fasi, rumore anomalo, surriscaldamento localizzato", verifica: "misura resistenza avvolgimenti (uno più basso), megger, termografia", componenti_coinvolti: ["motore_asincrono", "avvolgimento"] },
      { nome: "cuscinetto usurato", causa: "lubrificazione insufficiente, sovraccarico assiale/radiale, invecchiamento", sintomo: "rumore meccanico, vibrazioni elevate, surriscaldamento cuscinetto", verifica: "vibrometro, ascolto con stetoscopio meccanico, gioco assiale", componenti_coinvolti: ["motore_asincrono", "cuscinetto"] },
      { nome: "fase mancante", causa: "fusibile bruciato, contatto aperto, cavo interrotto", sintomo: "motore ronza e non parte, o funziona con potenza ridotta e corrente elevata sulle fasi restanti", verifica: "tensione sulle tre fasi al morsetto motore, continuità cavi", componenti_coinvolti: ["motore_asincrono", "contattore", "fusibile"] },
      { nome: "condensatore avviamento guasto", causa: "invecchiamento, sovratensione, cortocircuito interno", sintomo: "motore monofase ronza ma non parte, si scalda fermo", verifica: "capacimetro sul condensatore, prova con condensatore nuovo", componenti_coinvolti: ["motore_monofase", "condensatore"] }
    ],
    norme: [],
    casi: [
      { scenario: "Un motore trifase da 5.5kW ronza forte ma non riesce a partire", misure: { V_L1_L2: "400V", V_L2_L3: "398V", V_L1_L3: "0V", I_L1: "45A", I_L2: "43A", I_L3: "0A" }, causa: "fase L3 mancante — fusibile bruciato o contatto aperto", soluzione: "verificare e sostituire il fusibile di L3, controllare i contatti del contattore", ragionamento: "Tensione 0V tra L1-L3 e corrente 0A su L3 indicano fase interrotta. Il motore tenta di partire come monofase con le due fasi restanti ma non ha coppia sufficiente." }
    ],
    relazioni: [
      { da: "motore_asincrono", a: "campo_rotante", tipo: "genera" },
      { da: "scorrimento", a: "coppia", tipo: "determina" },
      { da: "classe_isolamento", a: "surriscaldamento", tipo: "limita" },
      { da: "motore_monofase", a: "condensatore", tipo: "richiede" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 11 — TRASFORMATORI
  // ═══════════════════════════════════════════════════════════
  {
    id: "L11",
    nome: "Trasformatori",
    prerequisiti: ["L02", "L03"],
    concetti: [
      { nome: "trasformatore", definizione: "macchina statica che trasferisce energia tra due circuiti a tensioni diverse tramite induzione magnetica", formula: "V1/V2 = N1/N2", relazioni: ["induzione", "rapporto_spire"] },
      { nome: "rapporto_spire", definizione: "rapporto tra numero di spire primario e secondario, determina il rapporto di trasformazione", formula: "k = N1/N2 = V1/V2", relazioni: ["trasformatore"] },
      { nome: "trasformatore_MT_BT", definizione: "trasformatore di distribuzione che converte la media tensione (20kV) in bassa tensione (400V)", relazioni: ["trasformatore", "cabina"] },
      { nome: "trasformatore_isolamento", definizione: "trasformatore con rapporto 1:1 per isolare galvanicamente due circuiti", relazioni: ["trasformatore", "sicurezza"] },
      { nome: "perdite_ferro", definizione: "perdite nel nucleo magnetico per isteresi e correnti parassite, costanti indipendentemente dal carico", relazioni: ["trasformatore", "nucleo"] },
      { nome: "perdite_rame", definizione: "perdite negli avvolgimenti per effetto Joule, proporzionali al quadrato della corrente", formula: "P_cu = R × I²", relazioni: ["trasformatore", "effetto_joule"] },
      { nome: "rendimento_trasformatore", definizione: "rapporto tra potenza in uscita e potenza in ingresso", formula: "η = P2 / (P2 + P_fe + P_cu)", relazioni: ["perdite_ferro", "perdite_rame"] }
    ],
    formule: [
      { nome: "Rapporto trasformazione", formula: "V1/V2 = N1/N2 = I2/I1", variabili: { V1: "tensione primario", V2: "tensione secondario", N1: "spire primario", N2: "spire secondario" }, esempio: "20000V/400V → rapporto 50:1" }
    ],
    misure: [
      { grandezza: "rapporto_spire", strumento: "TTR (Transformer Turn Ratio)", procedura: "alimentare un lato e misurare la tensione sull'altro", valore_tipico: "corrispondente alla targa", unita: "adimensionale" },
      { grandezza: "isolamento_avvolgimenti", strumento: "megger 2.5kV o 5kV", procedura: "misurare tra HV-LV, HV-massa, LV-massa", valore_tipico: ">100MΩ", unita: "MΩ" }
    ],
    componenti: [],
    guasti: [
      { nome: "cortocircuito tra spire", causa: "surriscaldamento, invecchiamento isolamento, sovratensione", sintomo: "rapporto trasformazione alterato, corrente a vuoto elevata, surriscaldamento", verifica: "misura rapporto spire, corrente a vuoto, impedenza cortocircuito", componenti_coinvolti: ["trasformatore", "avvolgimento"] },
      { nome: "guasto isolamento", causa: "umidità nell'olio, scariche parziali, invecchiamento", sintomo: "trippaggio protezioni, rumore anomalo, analisi olio non conforme", verifica: "megger, analisi gas disciolti (DGA), analisi olio", componenti_coinvolti: ["trasformatore", "olio"] }
    ],
    norme: [],
    casi: [],
    relazioni: [
      { da: "trasformatore", a: "rapporto_spire", tipo: "ha" },
      { da: "perdite_ferro", a: "trasformatore", tipo: "degrada" },
      { da: "perdite_rame", a: "effetto_joule", tipo: "tipo_di" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 12 — ELETTRONICA ANALOGICA
  // ═══════════════════════════════════════════════════════════
  {
    id: "L12",
    nome: "Elettronica analogica",
    prerequisiti: ["L00", "L01", "L02"],
    concetti: [
      { nome: "semiconduttore", definizione: "materiale con conducibilità intermedia (silicio, germanio), base di tutti i componenti elettronici", relazioni: ["diodo", "transistor"] },
      { nome: "diodo", definizione: "componente a due terminali che conduce in un solo verso (anodo→catodo), caduta ~0.7V (Si)", formula: "V_soglia ≈ 0.7V (Si), 0.3V (Ge)", relazioni: ["semiconduttore", "raddrizzatore"] },
      { nome: "LED", definizione: "diodo che emette luce quando polarizzato direttamente", relazioni: ["diodo", "illuminazione"] },
      { nome: "diodo_zener", definizione: "diodo che in polarizzazione inversa mantiene tensione costante, usato come riferimento", relazioni: ["diodo", "regolatore_tensione"] },
      { nome: "transistor_BJT", definizione: "componente a tre terminali (B,C,E) che amplifica corrente: Ic = β × Ib", relazioni: ["semiconduttore", "amplificatore"] },
      { nome: "MOSFET", definizione: "transistor a effetto di campo comandato in tensione (gate), usato come interruttore veloce", relazioni: ["semiconduttore", "inverter_motore"] },
      { nome: "IGBT", definizione: "transistor ibrido BJT/MOSFET per alta potenza e alta frequenza, usato negli inverter", relazioni: ["MOSFET", "transistor_BJT", "inverter_motore"] },
      { nome: "amplificatore_operazionale", definizione: "circuito integrato ad alto guadagno con due ingressi (+ e -) e un'uscita", relazioni: ["amplificatore", "sensore"] },
      { nome: "raddrizzatore", definizione: "circuito a diodi che converte AC in DC pulsante", relazioni: ["diodo", "alimentatore"] },
      { nome: "filtro", definizione: "circuito che seleziona un intervallo di frequenze (passa-basso, passa-alto, passa-banda)", relazioni: ["condensatore", "induttore", "frequenza"] }
    ],
    formule: [
      { nome: "Resistenza LED", formula: "R = (V_alim - V_led) / I_led", variabili: { R: "resistenza limitatrice (Ω)", V_alim: "tensione alimentazione", V_led: "caduta LED (~2V)", I_led: "corrente LED (~20mA)" }, esempio: "12V alim: R = (12-2)/0.02 = 500Ω → 470Ω standard" },
      { nome: "Guadagno BJT", formula: "Ic = β × Ib", variabili: { Ic: "corrente collettore", "β": "guadagno (50-300)", Ib: "corrente base" }, esempio: "β=100, Ib=0.1mA → Ic=10mA" }
    ],
    misure: [
      { grandezza: "giunzione_diodo", strumento: "multimetro (modalità diodo)", procedura: "misurare in entrambi i versi, deve condurre in un verso (~0.5-0.7V) e bloccare nell'altro (OL)", valore_tipico: "0.5-0.7V diretto, OL inverso", unita: "V" }
    ],
    componenti: [
      { nome: "diodo_potenza", tipo: "semiconduttore", funzione: "raddrizzamento in alimentatori e inverter", guasti_tipici: ["cortocircuito (conduce in entrambi i versi)", "aperto (non conduce)"], misure: ["giunzione_diodo"] },
      { nome: "IGBT_modulo", tipo: "semiconduttore", funzione: "commutazione di potenza in inverter e convertitori", guasti_tipici: ["cortocircuito gate-emitter", "sovracorrente da cortocircuito carico"], misure: ["giunzione_diodo", "resistenza_gate"] }
    ],
    guasti: [
      { nome: "diodo in cortocircuito", causa: "sovratensione, sovracorrente, invecchiamento", sintomo: "alimentatore bruciato, fusibile che salta, tensione anomala in uscita", verifica: "prova diodo con multimetro — conduce in entrambi i versi", componenti_coinvolti: ["diodo", "raddrizzatore", "alimentatore"] }
    ],
    norme: [],
    casi: [],
    relazioni: [
      { da: "diodo", a: "raddrizzatore", tipo: "usato_in" },
      { da: "transistor_BJT", a: "amplificatore", tipo: "usato_come" },
      { da: "IGBT", a: "inverter_motore", tipo: "usato_in" },
      { da: "MOSFET", a: "inverter_motore", tipo: "usato_in" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 13 — ELETTRONICA DIGITALE + AUTOMAZIONE
  // ═══════════════════════════════════════════════════════════
  {
    id: "L13",
    nome: "Elettronica digitale e automazione",
    prerequisiti: ["L12"],
    concetti: [
      { nome: "segnale_digitale", definizione: "segnale con solo due stati (0/1, LOW/HIGH), base dell'elettronica digitale", relazioni: ["logica_booleana", "PLC"] },
      { nome: "logica_booleana", definizione: "algebra dei valori binari con operazioni AND, OR, NOT, XOR", relazioni: ["segnale_digitale", "PLC"] },
      { nome: "microcontrollore", definizione: "circuito integrato programmabile con CPU, memoria e I/O, cervello dei sistemi embedded", relazioni: ["PLC", "sensore", "attuatore"] },
      { nome: "sensore_industriale", definizione: "dispositivo che converte una grandezza fisica in segnale elettrico (4-20mA, 0-10V, digitale)", relazioni: ["sensore", "misura", "PLC"] },
      { nome: "attuatore", definizione: "dispositivo comandato che agisce sul processo (motore, valvola, riscaldatore)", relazioni: ["PLC", "contattore", "motore"] },
      { nome: "bus_campo", definizione: "rete di comunicazione industriale tra PLC, sensori e attuatori (Modbus, Profibus, EtherCAT)", relazioni: ["PLC", "automazione"] },
      { nome: "HMI", definizione: "interfaccia uomo-macchina, pannello touch per visualizzazione e comando del processo", relazioni: ["PLC", "automazione"] },
      { nome: "SCADA", definizione: "sistema di supervisione, controllo e acquisizione dati per impianti complessi", relazioni: ["PLC", "HMI", "automazione"] }
    ],
    formule: [],
    misure: [
      { grandezza: "segnale_4_20mA", strumento: "multimetro (modalità mA DC)", procedura: "inserire in serie nel loop di corrente, 4mA=0%, 20mA=100%", valore_tipico: "4-20mA", unita: "mA" },
      { grandezza: "segnale_0_10V", strumento: "multimetro (modalità V DC)", procedura: "misurare ai morsetti del sensore, 0V=0%, 10V=100%", valore_tipico: "0-10V", unita: "V" }
    ],
    componenti: [
      { nome: "PLC_compatto", tipo: "automazione", funzione: "controllore industriale per sequenze logiche, PID, comunicazione", guasti_tipici: ["alimentazione guasta", "modulo I/O guasto", "programma corrotto"], misure: ["tensione_alimentazione", "stato_LED"] },
      { nome: "sensore_temperatura_PT100", tipo: "sensore", funzione: "misura temperatura tramite variazione di resistenza del platino (100Ω a 0°C)", guasti_tipici: ["circuito aperto", "cortocircuito", "drift calibrazione"], misure: ["resistenza"] },
      { nome: "sensore_prossimita_induttivo", tipo: "sensore", funzione: "rileva oggetti metallici senza contatto", guasti_tipici: ["danneggiamento face", "cortocircuito uscita", "cavo rotto"], misure: ["tensione_uscita", "continuita"] }
    ],
    guasti: [
      { nome: "loop 4-20mA aperto", causa: "cavo rotto, morsetto staccato, trasmettitore guasto", sintomo: "PLC legge 0mA o valore fisso, allarme sensore", verifica: "misurare corrente nel loop, verificare continuità cavo, alimentazione trasmettitore", componenti_coinvolti: ["sensore_industriale", "PLC", "cavo"] }
    ],
    norme: [],
    casi: [],
    relazioni: [
      { da: "PLC", a: "sensore_industriale", tipo: "legge" },
      { da: "PLC", a: "attuatore", tipo: "comanda" },
      { da: "bus_campo", a: "PLC", tipo: "collega" },
      { da: "HMI", a: "PLC", tipo: "interfaccia" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 14 — ALIMENTATORI E CONVERSIONE
  // ═══════════════════════════════════════════════════════════
  {
    id: "L14",
    nome: "Alimentatori e conversione di potenza",
    prerequisiti: ["L02", "L12"],
    concetti: [
      { nome: "alimentatore_lineare", definizione: "converte AC in DC tramite trasformatore, raddrizzamento, filtro e regolatore", relazioni: ["trasformatore", "raddrizzatore", "regolatore_tensione"] },
      { nome: "alimentatore_switching", definizione: "converte AC in DC tramite commutazione ad alta frequenza, più efficiente e compatto", relazioni: ["MOSFET", "trasformatore", "PWM"] },
      { nome: "PWM", definizione: "modulazione a larghezza di impulso, controlla la potenza media variando il duty cycle", formula: "V_medio = V_max × D", relazioni: ["alimentatore_switching", "inverter_motore"] },
      { nome: "UPS", definizione: "gruppo di continuità, mantiene l'alimentazione durante blackout tramite batterie", relazioni: ["batteria", "inverter", "alimentatore"] },
      { nome: "inverter_fotovoltaico", definizione: "converte la corrente continua dei pannelli solari in corrente alternata per la rete", relazioni: ["fotovoltaico", "IGBT", "MPPT"] },
      { nome: "MPPT", definizione: "inseguimento del punto di massima potenza del pannello fotovoltaico", relazioni: ["fotovoltaico", "inverter_fotovoltaico"] }
    ],
    formule: [
      { nome: "Duty cycle", formula: "D = t_on / T", variabili: { D: "duty cycle (0-1)", t_on: "tempo ON", T: "periodo" }, esempio: "D=0.5 → tensione media = 50% di V_max" },
      { nome: "Tensione media PWM", formula: "V_medio = V_max × D", variabili: {}, esempio: "12V, D=0.75 → V_medio=9V" }
    ],
    misure: [
      { grandezza: "tensione_uscita_alimentatore", strumento: "multimetro DC + oscilloscopio", procedura: "misurare DC con multimetro, verificare ripple con oscilloscopio", valore_tipico: "±5% del valore nominale, ripple <1%", unita: "V" }
    ],
    componenti: [
      { nome: "alimentatore_24V", tipo: "alimentatore", funzione: "alimentare PLC, sensori e attuatori 24V DC industriali", guasti_tipici: ["uscita 0V", "tensione instabile", "surriscaldamento"], misure: ["tensione_uscita", "ripple"] },
      { nome: "UPS_online", tipo: "alimentatore", funzione: "alimentazione continua senza interruzione per carichi critici", guasti_tipici: ["batterie esaurite", "inverter guasto", "bypass bloccato"], misure: ["tensione_batteria", "autonomia", "tensione_uscita"] }
    ],
    guasti: [
      { nome: "alimentatore switching guasto", causa: "condensatore elettrolitico esaurito, MOSFET bruciato, sovratensione in ingresso", sintomo: "nessuna tensione in uscita, o tensione instabile, o ronzio anomalo", verifica: "multimetro DC in uscita, ispezione visiva condensatori (rigonfi), oscilloscopio per ripple", componenti_coinvolti: ["alimentatore_switching", "condensatore", "MOSFET"] }
    ],
    norme: [],
    casi: [],
    relazioni: [
      { da: "alimentatore_switching", a: "PWM", tipo: "usa" },
      { da: "UPS", a: "batteria", tipo: "usa" },
      { da: "inverter_fotovoltaico", a: "MPPT", tipo: "implementa" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 15 — DIAGNOSTICA E GUASTI
  // ═══════════════════════════════════════════════════════════
  {
    id: "L15",
    nome: "Diagnostica e metodologia guasti",
    prerequisiti: ["L05", "L06", "L08", "L09", "L10"],
    concetti: [
      { nome: "metodo_half_split", definizione: "dividere il circuito a metà e verificare quale metà contiene il guasto, poi ripetere — riduce il tempo di diagnosi da O(n) a O(log n)", relazioni: ["diagnostica", "circuito_aperto", "cortocircuito"] },
      { nome: "analisi_sintomo_causa", definizione: "dal sintomo osservato, risalire alle possibili cause usando la conoscenza del circuito e le leggi fisiche", relazioni: ["diagnostica"] },
      { nome: "diagnosi_differenziale", definizione: "confrontare le ipotesi con i fatti disponibili, eliminare quelle impossibili, confermare con misure mirate", relazioni: ["diagnostica", "misura"] },
      { nome: "termografia", definizione: "imaging infrarosso per rilevare punti caldi indicanti cattivi contatti, sovraccarichi o guasti imminenti", relazioni: ["surriscaldamento", "morsetto", "diagnostica"] },
      { nome: "trend_analysis", definizione: "analisi dell'andamento nel tempo di misure (isolamento, temperatura, vibrazioni) per prevedere guasti", relazioni: ["diagnostica", "manutenzione_predittiva"] },
      { nome: "guasto_intermittente", definizione: "guasto che si manifesta solo in certe condizioni (temperatura, umidità, vibrazione, carico)", relazioni: ["diagnostica"] },
      { nome: "guasto_latente", definizione: "condizione degradata che non ha ancora causato malfunzionamento ma lo farà (isolamento in calo, contatto deteriorato)", relazioni: ["diagnostica", "manutenzione_predittiva"] }
    ],
    formule: [],
    misure: [],
    componenti: [],
    guasti: [
      { nome: "cattivo contatto progressivo", causa: "ossidazione, allentamento termico ciclico, sottodimensionamento morsetto", sintomo: "inizialmente intermittente, poi surriscaldamento, annerimento, infine circuito aperto o incendio", verifica: "termografia, riserraggio, misura resistenza di contatto", componenti_coinvolti: ["morsetto", "quadro_elettrico"] },
      { nome: "invecchiamento isolamento", causa: "esposizione prolungata a calore, umidità, UV, agenti chimici", sintomo: "isolamento che cala nel tempo (misure periodiche), dispersioni crescenti", verifica: "trend isolamento megger nel tempo, ispezione visiva (crepe, scolorimento)", componenti_coinvolti: ["cavo", "motore_asincrono"] }
    ],
    norme: [],
    casi: [
      { scenario: "Un impianto industriale ha scatti intermittenti del differenziale generale, apparentemente casuali", misure: { isolamento_circuiti: "tutti >2MΩ", corrente_dispersione_totale: "22mA" }, causa: "somma delle piccole dispersioni di tutti i circuiti si avvicina alla soglia (30mA), e supera con variazioni termiche", soluzione: "suddividere i circuiti su più differenziali per ridurre la dispersione cumulativa su ciascuno", ragionamento: "Ogni circuito ha isolamento >2MΩ (sufficiente singolarmente), ma la somma delle correnti di dispersione (22mA) è vicina alla soglia 30mA. Con il riscaldamento dell'impianto a regime, l'isolamento cala leggermente e la dispersione supera 30mA." },
      { scenario: "Un motore da 15kW si ferma dopo 20 minuti di funzionamento, il relè termico scatta", misure: { I_L1: "28A", I_L2: "27A", I_L3: "12A", I_nominale: "27A" }, causa: "cattivo contatto sul cavo di fase L3 — resistenza aggiuntiva limita la corrente su L3, le altre fasi compensano assorbendo di più", soluzione: "verificare tutti i collegamenti di L3 dal quadro al motore, riserrare o sostituire il morsetto difettoso", ragionamento: "Corrente L3 è metà delle altre due fasi. Non è fase mancante (sarebbe 0A) ma cattivo contatto che aggiunge resistenza. Il motore funziona ma squilibrato, le fasi L1/L2 compensano → corrente totale supera la taratura del relè dopo 20 min." }
    ],
    relazioni: [
      { da: "metodo_half_split", a: "diagnostica", tipo: "strategia" },
      { da: "termografia", a: "surriscaldamento", tipo: "rileva" },
      { da: "trend_analysis", a: "manutenzione_predittiva", tipo: "abilita" },
      { da: "guasto_latente", a: "trend_analysis", tipo: "rilevato_da" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 16 — NORME CEI E LEGISLAZIONE
  // ═══════════════════════════════════════════════════════════
  {
    id: "L16",
    nome: "Norme CEI e legislazione",
    prerequisiti: ["L06", "L07", "L08"],
    concetti: [
      { nome: "CEI_64_8", definizione: "norma fondamentale per impianti elettrici utilizzatori BT (<1000V AC), 7 parti", relazioni: ["impianto_civile", "protezione", "messa_a_terra"] },
      { nome: "DM_37_2008", definizione: "decreto che regola progettazione, installazione e certificazione degli impianti", relazioni: ["dichiarazione_conformita", "abilitazione"] },
      { nome: "dichiarazione_conformita", definizione: "documento obbligatorio che attesta la conformità dell'impianto alle norme, rilasciato dall'installatore", relazioni: ["DM_37_2008"] },
      { nome: "progetto_impianto", definizione: "obbligatorio per impianti >6kW o in locali speciali (DM 37/2008 art.5)", relazioni: ["DM_37_2008"] },
      { nome: "verifiche_periodiche", definizione: "ispezioni obbligatorie degli impianti di terra (DPR 462/01): ogni 2 anni per ambienti a rischio, 5 anni per altri", relazioni: ["messa_a_terra", "CEI_64_8"] },
      { nome: "locali_medici", definizione: "ambienti con requisiti speciali (CEI 64-8/7 sez.710): IT medicale, EQS, alimentazione sicurezza", relazioni: ["CEI_64_8", "equipotenziale"] },
      { nome: "luoghi_MARCI", definizione: "ambienti a maggior rischio in caso di incendio (CEI 64-8/7 sez.751): protezione differenziale 300mA, cavi non propaganti fiamma", relazioni: ["CEI_64_8", "protezione"] }
    ],
    formule: [],
    misure: [],
    componenti: [],
    guasti: [],
    norme: [
      { codice: "CEI 64-8 (tutte le parti)", titolo: "Impianti elettrici utilizzatori BT", applicazione: "norma di base: dalla progettazione alla verifica" },
      { codice: "DM 37/2008", titolo: "Sicurezza impianti domestici e similari", applicazione: "obbligo dichiarazione conformità, progetto per >6kW" },
      { codice: "DPR 462/2001", titolo: "Verifiche periodiche impianti di terra e protezione scariche atmosferiche", applicazione: "ogni 2 o 5 anni secondo il tipo di ambiente" },
      { codice: "CEI 0-21", titolo: "Regola tecnica di connessione utenti attivi e passivi alle reti BT", applicazione: "connessione fotovoltaico e generatori distribuiti" },
      { codice: "CEI EN 62305", titolo: "Protezione contro i fulmini", applicazione: "valutazione rischio, LPS, SPD" },
      { codice: "CEI 11-27", titolo: "Lavori su impianti elettrici", applicazione: "procedure per lavori sotto tensione, in prossimità, fuori tensione — PES, PAV, PEI" }
    ],
    casi: [],
    relazioni: [
      { da: "CEI_64_8", a: "protezione", tipo: "norma" },
      { da: "CEI_64_8", a: "messa_a_terra", tipo: "norma" },
      { da: "DM_37_2008", a: "dichiarazione_conformita", tipo: "richiede" },
      { da: "verifiche_periodiche", a: "messa_a_terra", tipo: "verifica" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 17 — SENSORI E TRASDUTTORI
  // ═══════════════════════════════════════════════════════════
  {
    id: "L17",
    nome: "Sensori e trasduttori",
    prerequisiti: ["L00", "L02", "L05"],
    concetti: [
      { nome: "sensore", definizione: "dispositivo che converte una grandezza fisica in segnale elettrico misurabile", relazioni: ["trasduttore", "misura"] },
      { nome: "trasduttore", definizione: "dispositivo che trasforma energia da una forma a un'altra", relazioni: ["sensore", "attuatore"] },
      { nome: "termocoppia", definizione: "sensore di temperatura basato sull'effetto Seebeck: due metalli diversi generano tensione proporzionale alla temperatura", unita: "mV/°C", relazioni: ["temperatura", "tensione"] },
      { nome: "PT100", definizione: "termoresistenza al platino con resistenza 100Ω a 0°C, variazione lineare con temperatura", formula: "R(t) = R0 × (1 + α×t)", unita: "Ω", relazioni: ["temperatura", "resistenza"] },
      { nome: "NTC", definizione: "termistore a coefficiente negativo: resistenza diminuisce all'aumentare della temperatura", relazioni: ["temperatura", "resistenza"] },
      { nome: "PTC", definizione: "termistore a coefficiente positivo: resistenza aumenta con la temperatura, usato come protezione motori", relazioni: ["temperatura", "protezione_motore"] },
      { nome: "TA_toroidale", definizione: "trasformatore amperometrico: misura corrente AC per induzione senza interrompere il circuito", relazioni: ["corrente", "misura", "differenziale"] },
      { nome: "sensore_hall", definizione: "misura campo magnetico e corrente DC/AC tramite effetto Hall", relazioni: ["corrente", "campo_magnetico"] },
      { nome: "fotodiodo", definizione: "sensore di luce: genera corrente proporzionale all'illuminamento", relazioni: ["luce", "corrente"] },
      { nome: "encoder", definizione: "sensore di posizione/velocità rotativa: impulsi digitali proporzionali alla rotazione", relazioni: ["velocita", "posizione", "motore"] },
      { nome: "sensore_prossimita", definizione: "rileva presenza di oggetti senza contatto: induttivo (metalli), capacitivo (qualsiasi materiale)", relazioni: ["automazione", "PLC"] },
      { nome: "cella_di_carico", definizione: "trasduttore di forza/peso basato su estensimetri: variazione di resistenza proporzionale alla deformazione", relazioni: ["forza", "resistenza", "ponte_wheatstone"] },
      { nome: "ponte_wheatstone", definizione: "circuito a ponte per misure di precisione di resistenza, usato con estensimetri e sensori resistivi", formula: "Vout = Vexc × (R3/(R3+R4) - R2/(R1+R2))", relazioni: ["resistenza", "misura", "cella_di_carico"] }
    ],
    formule: [
      { nome: "PT100 resistenza vs temperatura", formula: "R(t) = 100 × (1 + 3.85e-3 × t)", variabili: { "R(t)": "resistenza (Ω)", t: "temperatura (°C)" }, esempio: "A 100°C: R = 100 × 1.385 = 138.5Ω" },
      { nome: "Ponte di Wheatstone", formula: "Vout = Vexc × (R3/(R3+R4) - R2/(R1+R2))", variabili: { Vout: "tensione uscita (V)", Vexc: "tensione eccitazione (V)" }, esempio: "Ponte bilanciato → Vout = 0V" }
    ],
    misure: [
      { grandezza: "temperatura", strumento: "multimetro + PT100 a 4 fili", procedura: "misurare resistenza e convertire con tabella o formula", valore_tipico: "100Ω a 0°C, 138.5Ω a 100°C", unita: "Ω" },
      { grandezza: "corrente AC indiretta", strumento: "pinza amperometrica TA", procedura: "abbracciare il singolo conduttore con la pinza", valore_tipico: "dipende dal carico", unita: "A" }
    ],
    componenti: [
      { nome: "PT100", tipo: "sensore_temperatura", funzione: "misura temperatura con alta precisione e linearità", guasti_tipici: ["circuito aperto (filo rotto)", "cortocircuito interno", "ossidazione connessioni"], misure: ["resistenza a temperatura nota"] },
      { nome: "termocoppia tipo K", tipo: "sensore_temperatura", funzione: "misura temperature elevate (fino a 1300°C)", guasti_tipici: ["giunzione fredda errata", "fili invertiti (lettura negativa)", "invecchiamento"], misure: ["tensione mV con compensazione"] },
      { nome: "TA toroidale", tipo: "trasduttore_corrente", funzione: "misura corrente AC per differenziale e strumenti", guasti_tipici: ["saturazione nucleo", "avvolgimento interrotto", "errore di rapporto"], misure: ["rapporto di trasformazione"] }
    ],
    guasti: [
      { nome: "lettura temperatura errata", causa: "PT100 con connessione ossidata o filo rotto", sintomo: "valore fuori scala o fisso", verifica: "misurare resistenza a temperatura ambiente (deve essere ~109Ω a 25°C)", componenti_coinvolti: ["PT100", "cablaggio"] },
      { nome: "differenziale non rileva dispersione", causa: "TA toroidale saturato o danneggiato", sintomo: "differenziale non scatta con dispersione reale", verifica: "test con tasto prova + misura corrente dispersione con pinza", componenti_coinvolti: ["TA_toroidale", "differenziale"] }
    ],
    norme: [],
    casi: [
      { scenario: "caldaia segnala errore sonda: display mostra temperatura -40°C", misure: { resistenza_sonda: "infinito" }, causa: "filo della PT100/NTC interrotto nel passaggio muro", soluzione: "ripassare il cavo sonda o sostituire", ragionamento: "resistenza infinita = circuito aperto → la centralina interpreta come temperatura minima" }
    ],
    relazioni: [
      { da: "PT100", a: "temperatura", tipo: "misura" },
      { da: "termocoppia", a: "temperatura", tipo: "misura" },
      { da: "TA_toroidale", a: "corrente", tipo: "misura" },
      { da: "TA_toroidale", a: "differenziale", tipo: "componente" },
      { da: "sensore_hall", a: "corrente_DC", tipo: "misura" },
      { da: "encoder", a: "motore", tipo: "misura" },
      { da: "ponte_wheatstone", a: "cella_di_carico", tipo: "alimenta" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 18 — COMPONENTISTICA AVANZATA
  // ═══════════════════════════════════════════════════════════
  {
    id: "L18",
    nome: "Componentistica avanzata",
    prerequisiti: ["L06", "L07", "L09"],
    concetti: [
      { nome: "contattore", definizione: "interruttore elettromagnetico per manovre frequenti di carichi di potenza, comandato da bobina a bassa tensione", relazioni: ["motore", "protezione", "avviamento"] },
      { nome: "rele_termico", definizione: "protezione motore da sovraccarico: bimetallici che scattano quando la corrente supera la soglia per tempo prolungato", relazioni: ["motore", "sovraccarico", "contattore"] },
      { nome: "fusibile_NH", definizione: "fusibile a coltello per protezione correnti elevate in quadri industriali, curva gG o aM", relazioni: ["protezione", "cortocircuito", "quadro_industriale"] },
      { nome: "sezionatore", definizione: "dispositivo di manovra senza potere di interruzione: apre il circuito solo a vuoto per manutenzione", relazioni: ["sicurezza", "manutenzione", "LOTO"] },
      { nome: "soft_starter", definizione: "avviatore graduale per motori: riduce corrente di spunto controllando la tensione con SCR/TRIAC", relazioni: ["motore", "avviamento", "corrente_spunto"] },
      { nome: "inverter", definizione: "convertitore di frequenza per controllo velocità motori AC: raddrizzatore + bus DC + IGBT + PWM", relazioni: ["motore", "frequenza", "velocita", "risparmio_energetico"] },
      { nome: "SPD", definizione: "scaricatore di sovratensione: protegge l'impianto da fulmini e transitori, devia la sovratensione verso terra", relazioni: ["protezione", "fulmine", "sovratensione"] },
      { nome: "gruppo_misura", definizione: "contatore energia + TA + TV per misura e fatturazione dell'energia elettrica", relazioni: ["energia", "misura", "contatore"] },
      { nome: "UPS", definizione: "gruppo di continuità: mantiene alimentazione durante blackout tramite batterie e inverter", relazioni: ["batteria", "continuita", "alimentazione"] },
      { nome: "banco_condensatori", definizione: "batteria di condensatori per rifasamento centralizzato: regolatore automatico inserisce step per mantenere cosφ ≥ 0.9", relazioni: ["rifasamento", "cos_phi", "potenza_reattiva"] },
      { nome: "relè_differenziale_elettronico", definizione: "modulo elettronico esterno che trasforma un magnetotermico in differenziale: TA + elettronica + bobina di sgancio", relazioni: ["differenziale", "TA_toroidale", "protezione"] }
    ],
    formule: [
      { nome: "Corrente di spunto motore", formula: "Ispunto = 6÷8 × In", variabili: { Ispunto: "corrente di spunto (A)", In: "corrente nominale (A)" }, esempio: "Motore 10A nominale → spunto 60-80A per 1-3s" },
      { nome: "Risparmio energetico inverter", formula: "P_ridotta ∝ n³ (legge di affinità ventilatori/pompe)", variabili: { P: "potenza assorbita", n: "velocità" }, esempio: "Ridurre velocità al 80% → potenza al 51%" }
    ],
    misure: [
      { grandezza: "corrente spunto motore", strumento: "pinza amperometrica con funzione INRUSH", procedura: "avviare il motore e catturare il picco", valore_tipico: "6-8× corrente nominale per 1-3s", unita: "A" },
      { grandezza: "tensione bus DC inverter", strumento: "multimetro DC", procedura: "misurare ai capi del bus DC (ATTENZIONE: 560V DC!)", valore_tipico: "560V DC (da 400V AC trifase)", unita: "V DC" }
    ],
    componenti: [
      { nome: "contattore", tipo: "manovra", funzione: "inserimento/disinserimento carichi di potenza con comando remoto", guasti_tipici: ["bobina bruciata", "contatti saldati (non apre)", "contatti consumati (arco)", "molla di ritorno rotta"], misure: ["resistenza bobina", "continuità contatti"] },
      { nome: "inverter", tipo: "controllo_motore", funzione: "regolazione velocità motore AC", guasti_tipici: ["IGBT in cortocircuito", "condensatori bus DC gonfi", "ventola interna ferma → surriscaldamento", "errore overcurrent", "errore undervoltage"], misure: ["tensione bus DC", "forme onda uscita con oscilloscopio"] },
      { nome: "SPD", tipo: "protezione_sovratensione", funzione: "protezione da fulmini e transitori", guasti_tipici: ["varistori degradati (indicatore rosso)", "fusibile SPD intervenuto", "SPD non collegato a terra"], misure: ["stato indicatore", "continuità verso terra"] },
      { nome: "UPS", tipo: "continuita", funzione: "alimentazione garantita durante blackout", guasti_tipici: ["batterie esaurite", "inverter interno guasto", "bypass statico bloccato", "ventola ferma"], misure: ["tensione batteria", "test autonomia sotto carico"] }
    ],
    guasti: [
      { nome: "motore non parte con contattore", causa: "bobina contattore bruciata o alimentazione ausiliaria assente", sintomo: "contattore non chiude, nessun rumore", verifica: "misurare tensione ai capi bobina + resistenza bobina (tipico 50-200Ω)", componenti_coinvolti: ["contattore", "circuito_ausiliario"] },
      { nome: "inverter in errore overcurrent", causa: "cortocircuito su cavo motore o IGBT danneggiato", sintomo: "inverter si blocca all'avvio mostrando OC", verifica: "scollegare motore e misurare isolamento cavi + resistenza fasi motore", componenti_coinvolti: ["inverter", "motore", "cablaggio"] },
      { nome: "SPD con indicatore rosso", causa: "sovratensione ha degradato i varistori", sintomo: "indicatore di stato su rosso, protezione non più attiva", verifica: "sostituire modulo SPD e verificare collegamento di terra", componenti_coinvolti: ["SPD", "terra"] }
    ],
    norme: [
      { codice: "CEI EN 62305-1/4", titolo: "Protezione contro i fulmini", applicazione: "dimensionamento SPD e sistema LPS" },
      { codice: "CEI EN 61800-5", titolo: "Sicurezza azionamenti a velocità variabile", applicazione: "requisiti sicurezza inverter e funzioni STO/SLS" }
    ],
    casi: [
      { scenario: "impianto industriale: motore pompa non parte, contattore 'canta' ma non chiude", misure: { tensione_bobina: "180V (invece di 230V)", resistenza_bobina: "120Ω" }, causa: "sottotensione sulla linea ausiliaria: trasformatore ausiliario sovraccarico", soluzione: "verificare carico sul trasformatore ausiliario, ridistribuire o sostituire", ragionamento: "la bobina necessita almeno 85% della tensione nominale per chiudere completamente il contattore" },
      { scenario: "inverter segnala errore 'UV' (undervoltage) random durante la giornata", misure: { tensione_rete: "variabile 380-415V", bus_DC: "cala sotto 450V" }, causa: "buchi di tensione dalla rete (voltage dips da carichi pesanti in zona)", soluzione: "installare stabilizzatore o UPS a monte dell'inverter", ragionamento: "UV = bus DC sotto soglia minima, causato da cali di tensione rete" }
    ],
    relazioni: [
      { da: "contattore", a: "motore", tipo: "alimenta" },
      { da: "rele_termico", a: "motore", tipo: "protegge" },
      { da: "soft_starter", a: "motore", tipo: "alimenta" },
      { da: "inverter", a: "motore", tipo: "alimenta" },
      { da: "SPD", a: "sovratensione", tipo: "protegge" },
      { da: "UPS", a: "carico_critico", tipo: "alimenta" },
      { da: "banco_condensatori", a: "rifasamento", tipo: "causa" },
      { da: "inverter", a: "IGBT", tipo: "componente" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 19 — CASI REALI COMPLESSI
  // ═══════════════════════════════════════════════════════════
  {
    id: "L19",
    nome: "Casi reali complessi",
    prerequisiti: ["L15", "L06", "L07", "L08"],
    concetti: [
      { nome: "guasto_intermittente", definizione: "difetto che si manifesta solo in certe condizioni (temperatura, umidità, carico, vibrazione)", relazioni: ["diagnostica", "termica", "connessione_lenta"] },
      { nome: "connessione_lenta", definizione: "morsetto o giunzione con resistenza di contatto elevata: funziona ma scalda, causa cadute di tensione variabili", relazioni: ["surriscaldamento", "resistenza_contatto", "arco"] },
      { nome: "neutro_interrotto", definizione: "interruzione del conduttore di neutro in impianto trifase: provoca sovratensioni sulle fasi meno caricate e sottotensioni sulle più caricate", relazioni: ["trifase", "sovratensione", "guasto_grave"] },
      { nome: "corrente_di_dispersione_capacitiva", definizione: "corrente che fluisce verso terra attraverso la capacità parassita dei cavi, specialmente lunghi: può far scattare il differenziale senza guasto reale", relazioni: ["differenziale", "cavo_lungo", "falso_scatto"] },
      { nome: "armoniche_e_neutro", definizione: "le armoniche dispari triple (3a, 9a, 15a) si sommano nel neutro invece di annullarsi: il neutro porta più corrente delle fasi", relazioni: ["armoniche", "neutro", "surriscaldamento"] },
      { nome: "selettivita_mancata", definizione: "scatta la protezione a monte invece di quella a valle: interruzione più ampia del necessario", relazioni: ["selettivita", "protezione", "coordinamento"] },
      { nome: "ritorno_di_tensione", definizione: "tensione presente su un circuito apparentemente scollegato, proveniente da altro circuito attraverso un carico o un accoppiamento", relazioni: ["sicurezza", "misura", "fantasma"] },
      { nome: "tensione_fantasma", definizione: "tensione indotta letta dal multimetro ad alta impedenza su fili scollegati vicini a conduttori sotto tensione", relazioni: ["misura", "multimetro", "accoppiamento_capacitivo"] }
    ],
    formule: [],
    misure: [
      { grandezza: "resistenza di contatto", strumento: "micro-ohmmetro o multimetro 4 fili", procedura: "misurare caduta di tensione sul morsetto con carico applicato", valore_tipico: "<1mΩ per connessione sana, >100mΩ per connessione degradata", unita: "mΩ" },
      { grandezza: "tensione neutro-terra", strumento: "multimetro AC", procedura: "misurare tra il neutro e la terra nel quadro", valore_tipico: "<2V con carichi attivi (normale), >10V sospetto", unita: "V" }
    ],
    componenti: [],
    guasti: [
      { nome: "quadro che scalda in un punto", causa: "morsetto con connessione lenta → resistenza di contatto → dissipazione I²R", sintomo: "calore localizzato, plastica annerita, odore di bruciato", verifica: "termografia IR o tatto (con impianto spento per sicurezza) + serraggio morsetti + misura resistenza di contatto", componenti_coinvolti: ["morsetto", "cavo", "interruttore"] },
      { nome: "differenziale scatta random senza carichi difettosi", causa: "dispersione capacitiva cavi lunghi o umidità in cassette di derivazione", sintomo: "scatto senza correlazione con inserzione carichi, più frequente con umidità alta", verifica: "misurare corrente dispersione con pinza differenziale (somma vettoriale L+N) a valle del differenziale", componenti_coinvolti: ["differenziale", "cablaggio", "cassette"] },
      { nome: "neutro interrotto in impianto trifase", causa: "morsetto neutro allentato o fuso nel quadro generale", sintomo: "tensioni sbilanciate tra le fasi: alcune utenze hanno tensione alta, altre bassa; lampadine che pulsano", verifica: "misurare tensione su tutte le fasi rispetto a terra e tra di loro + controllare morsetto neutro", componenti_coinvolti: ["neutro", "morsetto", "quadro"] },
      { nome: "corrente nel neutro superiore alle fasi", causa: "carichi non lineari (LED driver, PC, inverter) generano armoniche triple che si sommano nel neutro", sintomo: "neutro caldo, cavo neutro sottodimensionato si degrada", verifica: "misurare corrente su ogni fase e sul neutro con pinza + analisi armonica", componenti_coinvolti: ["neutro", "carichi_non_lineari", "cablaggio"] },
      { nome: "tensione fantasma su circuito aperto", causa: "accoppiamento capacitivo con cavi adiacenti sotto tensione", sintomo: "multimetro legge 40-80V su fili scollegati, ma tensione crolla collegando un carico (anche una lampadina)", verifica: "ripetere misura con carico resistivo 1kΩ collegato: se crolla a 0V è tensione fantasma", componenti_coinvolti: ["multimetro", "cablaggio"] },
      { nome: "selettività mancata: scatta il generale", causa: "corrente di guasto troppo alta per la protezione a valle o curve non coordinate", sintomo: "blackout totale per guasto su un singolo circuito", verifica: "confrontare curve I-t delle protezioni in serie: la valle deve essere più veloce della monte per ogni valore di corrente", componenti_coinvolti: ["magnetotermico", "generale", "coordinamento"] }
    ],
    norme: [],
    casi: [
      { scenario: "appartamento: il differenziale scatta ogni sera verso le 20, mai di giorno", misure: { isolamento_circuiti: "tutti >1MΩ", corrente_dispersione_totale: "25mA" }, causa: "dispersione cumulativa di troppi apparecchi moderni (LED driver, caricatori, TV) che singolarmente sono sotto soglia ma sommati superano i 30mA", soluzione: "suddividere i circuiti su 2 differenziali oppure passare a differenziale 300mA per la linea prese con protezione personale sui circuiti bagno/cucina", ragionamento: "ogni apparecchio moderno con filtro EMI ha 0.5-3mA di dispersione. Con 15+ apparecchi accesi la sera la somma supera i 30mA" },
      { scenario: "capannone: una presa trifase non funziona, multimetro mostra 400V tra le fasi ma solo 190V fase-neutro su una fase", misure: { V_L1N: "190V", V_L2N: "260V", V_L3N: "230V", V_L1L2: "400V" }, causa: "neutro interrotto a monte nel quadro di zona → le tensioni si ridistribuiscono in funzione del carico", soluzione: "controllare e riserrare il morsetto del neutro nel quadro di zona", ragionamento: "con neutro integro tutte le fase-neutro devono essere ~230V. Valori asimmetrici = neutro interrotto o degradato. La V concatenata è corretta perché non passa dal neutro" },
      { scenario: "ufficio: PC si riavviano random, UPS segnala 'sovraccarico' ma il carico è sotto il 50%", misure: { tensione_rete: "230V stabile", corrente_totale: "12A", THD_corrente: "42%" }, causa: "corrente armonica elevata: il fattore di cresta alto fa intervenire la protezione di picco dell'UPS anche con potenza media bassa", soluzione: "utilizzare UPS con filtro armonico attivo o sovradimensionare del 40% per carichi non lineari", ragionamento: "il THD alto significa che il valore di picco della corrente è molto maggiore del valore RMS: l'UPS protegge sul picco, non sulla potenza media" }
    ],
    relazioni: [
      { da: "connessione_lenta", a: "surriscaldamento", tipo: "causa" },
      { da: "connessione_lenta", a: "arco", tipo: "causa" },
      { da: "neutro_interrotto", a: "sovratensione", tipo: "causa" },
      { da: "dispersione_capacitiva", a: "differenziale", tipo: "causa" },
      { da: "armoniche", a: "neutro_sovraccarico", tipo: "causa" },
      { da: "tensione_fantasma", a: "accoppiamento_capacitivo", tipo: "causa" },
      { da: "selettivita_mancata", a: "blackout_totale", tipo: "causa" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 20 — COMPETENZA AVANZATA E METODOLOGIA DIAGNOSTICA
  // ═══════════════════════════════════════════════════════════
  {
    id: "L20",
    nome: "Competenza avanzata e metodologia diagnostica",
    prerequisiti: ["L15", "L19"],
    concetti: [
      { nome: "diagnosi_per_esclusione", definizione: "metodo sistematico: isolare sezioni dell'impianto progressivamente per localizzare il guasto per eliminazione", relazioni: ["diagnostica", "sezionamento"] },
      { nome: "diagnosi_per_sostituzione", definizione: "sostituire il componente sospetto con uno funzionante noto: se il problema scompare, il componente era guasto", relazioni: ["diagnostica", "componente"] },
      { nome: "diagnosi_comparativa", definizione: "confrontare le misure del circuito guasto con un circuito identico funzionante per evidenziare differenze", relazioni: ["diagnostica", "misura"] },
      { nome: "analisi_causa_radice", definizione: "non fermarsi al sintomo: risalire alla causa originale che ha provocato il guasto per evitare recidive", relazioni: ["diagnostica", "prevenzione"] },
      { nome: "albero_dei_guasti", definizione: "rappresentazione logica delle possibili cause di un malfunzionamento, strutturata ad albero con AND/OR", relazioni: ["diagnostica", "ragionamento"] },
      { nome: "manutenzione_predittiva", definizione: "monitoraggio continuo dei parametri per prevedere il guasto prima che avvenga (termografia, vibrazioni, analisi olio)", relazioni: ["manutenzione", "sensore", "affidabilita"] },
      { nome: "FMEA", definizione: "Failure Mode and Effects Analysis: analisi sistematica dei modi di guasto, effetti e priorità di intervento", relazioni: ["affidabilita", "prevenzione", "analisi_causa_radice"] },
      { nome: "curva_a_vasca", definizione: "andamento tipico dei guasti nel tempo: mortalità infantile (iniziale alta), vita utile (tasso costante basso), usura (tasso crescente)", relazioni: ["affidabilita", "manutenzione"] },
      { nome: "termografia", definizione: "rilevamento infrarosso delle temperature superficiali: evidenzia connessioni calde, componenti sovraccaricati, sbilanciamenti", relazioni: ["manutenzione_predittiva", "connessione_lenta", "sovraccarico"] },
      { nome: "registro_guasti", definizione: "documentazione sistematica di ogni guasto: data, sintomo, causa, soluzione, tempo — base per apprendimento e prevenzione", relazioni: ["diagnostica", "apprendimento", "FMEA"] }
    ],
    formule: [],
    misure: [
      { grandezza: "profilo termico", strumento: "termocamera IR", procedura: "scansionare quadri e connessioni sotto carico, confrontare punti simmetrici", valore_tipico: "ΔT <10°C tra fasi = OK, >30°C = critico", unita: "°C" },
      { grandezza: "trend isolamento", strumento: "megger a intervalli regolari", procedura: "misurare isolamento dello stesso circuito ogni 6-12 mesi e tracciare il trend", valore_tipico: "valore in calo costante = degradamento in corso", unita: "MΩ" }
    ],
    componenti: [],
    guasti: [
      { nome: "guasto ricorrente sullo stesso circuito", causa: "causa radice non risolta: si è riparato il sintomo ma non l'origine (es. vibrazione che allenta morsetto, umidità persistente)", sintomo: "lo stesso tipo di guasto si ripresenta periodicamente", verifica: "analisi storica guasti + ispezione ambientale + verifica cause meccaniche/ambientali", componenti_coinvolti: ["morsetto", "cablaggio", "ambiente"] },
      { nome: "degrado isolamento progressivo", causa: "invecchiamento accelerato da calore, umidità o agenti chimici", sintomo: "interventi sporadici del differenziale che diventano sempre più frequenti", verifica: "misurare isolamento (megger) e confrontare con valori precedenti — trend in calo conferma il degrado", componenti_coinvolti: ["cablaggio", "isolamento"] }
    ],
    norme: [
      { codice: "CEI 11-27", titolo: "Lavori su impianti elettrici", applicazione: "qualifiche PES/PAV/PEI, distanze di sicurezza, procedure lavoro in sicurezza" }
    ],
    casi: [
      { scenario: "condominio: un appartamento ha guasti elettrici ricorrenti ogni inverno (differenziale scatta, prese non funzionano)", misure: { isolamento_estate: "50MΩ", isolamento_inverno: "2MΩ", umidita_ambiente: "alta (condensa su muri)" }, causa: "infiltrazione d'acqua nel passaggio cavi nel muro esterno: d'inverno la condensa penetra nelle cassette di derivazione degradando l'isolamento", soluzione: "sigillare il passaggio cavi, sostituire morsetti ossidati, applicare gel idrorepellente nelle cassette", ragionamento: "correlazione stagionale + calo isolamento solo d'inverno + ispezione cassette (ossidazione) = infiltrazione" },
      { scenario: "fabbrica: motore pompa si ferma dopo 2-3 ore di funzionamento, riparte dopo 30 minuti di pausa", misure: { corrente_avvio: "nominale", temperatura_motore_dopo_2h: "95°C", resistenza_avvolgimenti_a_caldo: "sbilanciata tra fasi" }, causa: "cortocircuito interspira: a freddo funziona, scaldandosi l'isolamento tra le spire cedendo e provoca assorbimento anomalo → intervento relè termico", soluzione: "rebobinare o sostituire il motore", ragionamento: "guasto termico intermittente + sbilanciamento resistenze a caldo + temperatura eccessiva = difetto dell'avvolgimento che si manifesta con la dilatazione termica" }
    ],
    relazioni: [
      { da: "diagnosi_per_esclusione", a: "sezionamento", tipo: "richiede" },
      { da: "analisi_causa_radice", a: "registro_guasti", tipo: "richiede" },
      { da: "manutenzione_predittiva", a: "termografia", tipo: "richiede" },
      { da: "FMEA", a: "affidabilita", tipo: "causa" },
      { da: "curva_a_vasca", a: "manutenzione", tipo: "causa" },
      { da: "registro_guasti", a: "apprendimento", tipo: "causa" }
    ]
  },

  // ═══════════════════════════════════════════════════════════
  // LIVELLO 21 — FOTOVOLTAICO E ACCUMULO
  // ═══════════════════════════════════════════════════════════
  {
    id: "L21",
    nome: "Fotovoltaico e sistemi di accumulo",
    prerequisiti: ["L02", "L04", "L06", "L14"],
    concetti: [
      { nome: "cella_fotovoltaica", definizione: "giunzione PN in silicio che converte la luce solare in corrente continua per effetto fotovoltaico", relazioni: ["tensione_DC", "corrente", "irraggiamento"] },
      { nome: "stringa_FV", definizione: "pannelli collegati in serie per ottenere la tensione necessaria all'inverter (tipico 300-600V DC)", relazioni: ["cella_fotovoltaica", "tensione_DC", "inverter_FV"] },
      { nome: "inverter_FV", definizione: "convertitore DC/AC che trasforma la corrente continua dei pannelli in corrente alternata sincronizzata con la rete", relazioni: ["stringa_FV", "rete", "MPPT"] },
      { nome: "MPPT", definizione: "Maximum Power Point Tracking: algoritmo che regola il punto di lavoro dei pannelli per estrarre la massima potenza disponibile", relazioni: ["inverter_FV", "irraggiamento", "temperatura"] },
      { nome: "accumulo_batterie", definizione: "sistema di batterie (litio, LFP) che immagazzina l'energia prodotta in eccesso per usarla quando serve", relazioni: ["batteria_litio", "autoconsumo", "inverter_ibrido"] },
      { nome: "hot_spot", definizione: "cella ombreggiata o difettosa che dissipa la potenza delle altre celle come calore: rischio incendio", relazioni: ["cella_fotovoltaica", "diodo_bypass", "surriscaldamento"] },
      { nome: "PID", definizione: "Potential Induced Degradation: degrado delle celle per alta tensione rispetto a terra, specialmente con umidità", relazioni: ["stringa_FV", "tensione_DC", "degrado"] },
      { nome: "diodo_bypass", definizione: "diodo in antiparallelo a un gruppo di celle: attiva quando le celle sono ombreggiate evitando hot-spot", relazioni: ["hot_spot", "ombreggiamento"] },
      { nome: "BMS", definizione: "Battery Management System: controlla carica/scarica, bilanciamento celle, temperatura, protezione sovraccarica/scarica profonda", relazioni: ["batteria_litio", "sicurezza", "durata"] }
    ],
    formule: [
      { nome: "Potenza pannello", formula: "P = Irraggiamento × Area × η", variabili: { P: "potenza (W)", Irraggiamento: "irraggiamento solare (W/m²)", Area: "superficie pannello (m²)", "η": "efficienza (%)" }, esempio: "1000 W/m² × 1.7m² × 21% = 357W (pannello moderno)" },
      { nome: "Tensione stringa", formula: "Vstringa = N × Vmp", variabili: { Vstringa: "tensione stringa (V)", N: "numero pannelli in serie", Vmp: "tensione al punto di massima potenza (V)" }, esempio: "12 pannelli × 38V = 456V DC" },
      { nome: "Energia accumulabile", formula: "E = C × V × DoD × η_ciclo", variabili: { E: "energia utile (Wh)", C: "capacità (Ah)", V: "tensione (V)", DoD: "profondità di scarica (%)", "η_ciclo": "efficienza ciclo" }, esempio: "100Ah × 48V × 90% × 95% = 4104Wh = 4.1kWh utili" }
    ],
    misure: [
      { grandezza: "tensione stringa FV", strumento: "multimetro DC", procedura: "misurare tra positivo e negativo della stringa con pannelli al sole", valore_tipico: "300-600V DC secondo numero pannelli", unita: "V DC" },
      { grandezza: "corrente stringa FV", strumento: "pinza amperometrica DC", procedura: "misurare su un conduttore della stringa con sole pieno", valore_tipico: "8-12A per stringa (dipende dal pannello)", unita: "A DC" },
      { grandezza: "isolamento stringa", strumento: "megger 1000V DC", procedura: "scollegare stringa da inverter, misurare tra polo + e terra, poi polo - e terra", valore_tipico: ">1MΩ (CEI EN 62446 richiede >1MΩ per kV)", unita: "MΩ" }
    ],
    componenti: [
      { nome: "pannello FV", tipo: "generatore_DC", funzione: "conversione luce solare in elettricità DC", guasti_tipici: ["hot-spot", "microfratture celle", "delaminazione", "PID", "snail trails", "diodo bypass guasto"], misure: ["curva IV con tracciatore", "termografia", "isolamento"] },
      { nome: "inverter FV", tipo: "conversione_DC_AC", funzione: "conversione DC→AC e immissione in rete", guasti_tipici: ["errore isolamento", "errore rete (frequenza/tensione)", "MPPT non traccia", "ventola bloccata", "condensatori DC gonfi"], misure: ["tensione stringa", "potenza prodotta vs attesa", "log errori"] },
      { nome: "batteria LFP", tipo: "accumulo", funzione: "stoccaggio energia per autoconsumo", guasti_tipici: ["cella sbilanciata", "BMS in errore", "calo capacità", "temperatura fuori range"], misure: ["tensione celle singole", "SOC vs tensione", "test capacità"] }
    ],
    guasti: [
      { nome: "produzione FV calata drasticamente", causa: "uno o più diodi bypass in cortocircuito → bypassa permanentemente un gruppo di celle", sintomo: "tensione stringa inferiore al previsto, potenza calata del 30-50%", verifica: "misurare tensione di ogni pannello separatamente (o termografia per hot-spot)", componenti_coinvolti: ["pannello_FV", "diodo_bypass"] },
      { nome: "inverter FV in errore isolamento", causa: "umidità in connettore MC4 o guaina cavo deteriorata", sintomo: "inverter non si avvia, errore ISO/Earth Fault sul display", verifica: "misurare isolamento stringa (+/terra e -/terra) con megger, isolare sezioni per localizzare", componenti_coinvolti: ["cablaggio_DC", "connettori_MC4", "pannello_FV"] },
      { nome: "batteria non si carica al 100%", causa: "cella sbilanciata: una cella raggiunge la tensione massima prima delle altre, il BMS ferma la carica", sintomo: "SOC max raggiungibile cala nel tempo (es. 95% → 90% → 85%)", verifica: "leggere tensioni celle singole dal BMS: differenza >50mV = sbilanciamento", componenti_coinvolti: ["batteria_litio", "BMS"] }
    ],
    norme: [
      { codice: "CEI 0-21", titolo: "Regola tecnica connessione utenti attivi/passivi a reti BT", applicazione: "requisiti per connessione FV alla rete: protezioni di interfaccia SPI" },
      { codice: "CEI EN 62446", titolo: "Requisiti per prove e documentazione impianti FV", applicazione: "verifiche iniziali e periodiche: isolamento, continuità, curva IV" }
    ],
    casi: [
      { scenario: "impianto FV 6kWp: produceva 25kWh/giorno d'estate, ora ne fa 15 con stesso irraggiamento", misure: { tensione_stringa_1: "380V (OK)", tensione_stringa_2: "280V (bassa)", potenza_inverter: "3.8kW" }, causa: "2 pannelli nella stringa 2 con diodi bypass in cortocircuito (dopo fulmine indiretto)", soluzione: "sostituire i diodi bypass o i pannelli danneggiati, installare SPD DC", ragionamento: "tensione stringa 2 proporzionalmente ridotta = pannelli bypassati permanentemente. Timeline corrisponde a temporale recente" }
    ],
    relazioni: [
      { da: "cella_fotovoltaica", a: "stringa_FV", tipo: "componente" },
      { da: "stringa_FV", a: "inverter_FV", tipo: "alimenta" },
      { da: "MPPT", a: "inverter_FV", tipo: "componente" },
      { da: "hot_spot", a: "diodo_bypass", tipo: "protegge" },
      { da: "BMS", a: "batteria_litio", tipo: "protegge" },
      { da: "accumulo_batterie", a: "autoconsumo", tipo: "causa" }
    ]
  }

];

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  LIVELLI: LIVELLI,
  TOTALE_LIVELLI: LIVELLI.length
};
