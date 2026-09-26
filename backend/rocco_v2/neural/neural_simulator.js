"use strict";

// ============================================================================
// SIMULATORE CAUSALE — Il ragionamento del tecnico esperto
//
// Quando un tecnico con 25 anni di esperienza arriva su un impianto,
// nella sua testa succedono queste cose:
//
// 1. "OK, cosa vedo?" → raccoglie i sintomi
// 2. "Cosa potrebbe essere?" → genera ipotesi partendo da esperienza
// 3. "Se fosse X, cosa dovrei trovare?" → simula in avanti
// 4. "Quello che vedo combacia con X?" → confronta
// 5. "Quale misura mi toglie il dubbio?" → sceglie il test migliore
// 6. "Adesso so cos'è" → diagnosi
//
// Questo modulo fa esattamente quello. In puro JavaScript.
// Zero dipendenze esterne. Zero AI. Solo ragionamento tecnico.
// ============================================================================

var WorldModel = require("./world_model");

// ============================================================================
// TABELLA ESPERIENZA — Cosa causa cosa, con che probabilità
//
// Non è statistica astratta: è l'esperienza di migliaia di interventi.
// "8 volte su 10, quando il differenziale scatta a ripetizione,
//  è dispersione su un carico. Le altre 2 sono umidità o RCD vecchio."
// ============================================================================

var ESPERIENZA = {
  // Chiave: sintomo osservato
  // Valore: array di {causa, probabilita, come_verifico, cosa_esclude}

  "differenziale_scatta": [
    {
      causa: "dispersione su carico",
      probabilita: 0.45,
      come_verifico: "seziona i carichi uno alla volta e riarma — quando non scatta più hai trovato il colpevole",
      cosa_esclude: "isolamento > 1 MOhm su tutti i circuiti",
      tempo_tipico: "immediato o dopo qualche minuto",
      componenti: ["RCD", "carico"]
    },
    {
      causa: "cavo danneggiato con dispersione verso terra",
      probabilita: 0.25,
      come_verifico: "misura isolamento con megger circuito per circuito — quello sotto 1 MOhm è il problema",
      cosa_esclude: "tutti i circuiti sopra 1 MOhm",
      tempo_tipico: "scatta appena riarmi",
      componenti: ["RCD", "conduttore"]
    },
    {
      causa: "umidità in cassetta di derivazione o morsettiera",
      probabilita: 0.15,
      come_verifico: "apri le cassette — cerchi acqua, condensa, ossidazione verde sui morsetti",
      cosa_esclude: "cassette tutte asciutte, morsetti puliti",
      tempo_tipico: "peggiora con pioggia o umidità alta",
      componenti: ["RCD", "giunzione"]
    },
    {
      causa: "RCD difettoso o a fine vita",
      probabilita: 0.10,
      come_verifico: "scollega TUTTO a valle e riarma — se scatta ancora a vuoto è lui",
      cosa_esclude: "a vuoto tiene, il problema è a valle",
      tempo_tipico: "scatta anche senza carichi",
      componenti: ["RCD"]
    },
    {
      causa: "corrente di spunto troppo alta per RCD sensibile",
      probabilita: 0.05,
      come_verifico: "misura corrente di spunto con pinza — se > 5x Idn al momento dell'accensione",
      cosa_esclude: "scatta anche a regime, non solo all'accensione",
      tempo_tipico: "solo all'accensione del carico",
      componenti: ["RCD", "carico"]
    }
  ],

  "magnetotermico_scatta_subito": [
    {
      causa: "cortocircuito a valle",
      probabilita: 0.60,
      come_verifico: "misura resistenza tra fase e neutro a valle del MCB — se vicina a zero è corto",
      cosa_esclude: "resistenza > 10 Ohm tra fase e neutro",
      tempo_tipico: "scatta istantaneamente appena riarmi",
      componenti: ["MCB", "conduttore", "carico"]
    },
    {
      causa: "carico in cortocircuito interno",
      probabilita: 0.25,
      come_verifico: "scollega il carico e prova a riarmare — se tiene, il carico è il problema",
      cosa_esclude: "scatta anche senza carichi collegati",
      tempo_tipico: "scatta quando colleghi il carico",
      componenti: ["MCB", "carico"]
    },
    {
      causa: "MCB difettoso",
      probabilita: 0.10,
      come_verifico: "scollega tutto a valle e prova a riarmare — se scatta a vuoto è il MCB",
      cosa_esclude: "a vuoto tiene",
      tempo_tipico: "scatta anche a vuoto",
      componenti: ["MCB"]
    },
    {
      causa: "contatto fase-neutro in cassetta derivazione",
      probabilita: 0.05,
      come_verifico: "ispezione visiva nelle cassette — cerchi fili scoperti che si toccano",
      cosa_esclude: "cassette tutte in ordine, nessun filo scoperto",
      tempo_tipico: "dopo lavori recenti",
      componenti: ["MCB", "giunzione"]
    }
  ],

  "magnetotermico_scatta_dopo_tempo": [
    {
      causa: "sovraccarico — troppi apparecchi sullo stesso circuito",
      probabilita: 0.50,
      come_verifico: "misura corrente totale con pinza amperometrica — se supera In del MCB è sovraccarico",
      cosa_esclude: "corrente totale ben sotto In",
      tempo_tipico: "dopo 10-30 minuti di funzionamento",
      componenti: ["MCB", "carico"]
    },
    {
      causa: "carico con assorbimento anomalo",
      probabilita: 0.25,
      come_verifico: "misura corrente del singolo carico sospetto — se assorbe più del nominale è guasto",
      cosa_esclude: "tutti i carichi assorbono il nominale",
      tempo_tipico: "peggiora nel tempo",
      componenti: ["MCB", "carico"]
    },
    {
      causa: "MCB declassato per temperatura ambiente alta",
      probabilita: 0.15,
      come_verifico: "verifica temperatura nel quadro — sopra 40°C il MCB interviene prima",
      cosa_esclude: "quadro ventilato, temperatura sotto 35°C",
      tempo_tipico: "peggiora in estate",
      componenti: ["MCB"]
    },
    {
      causa: "sezione cavo insufficiente per la distanza",
      probabilita: 0.10,
      come_verifico: "misura caduta di tensione a pieno carico — se > 4% la sezione è sottodimensionata",
      cosa_esclude: "caduta di tensione < 3%",
      tempo_tipico: "sempre stato così, peggiora con carichi nuovi",
      componenti: ["conduttore"]
    }
  ],

  "niente_tensione": [
    {
      causa: "protezione a monte scattata",
      probabilita: 0.35,
      come_verifico: "controlla tutti gli interruttori nel quadro — cerca quello abbassato",
      cosa_esclude: "tutti gli interruttori sono su",
      tempo_tipico: "improvviso",
      componenti: ["MCB", "RCD"]
    },
    {
      causa: "conduttore interrotto",
      probabilita: 0.25,
      come_verifico: "misura continuità del cavo da quadro a punto — se non c'è, il cavo è rotto",
      cosa_esclude: "continuità OK su tutti i conduttori",
      tempo_tipico: "dopo lavori, chiodi, tasselli",
      componenti: ["conduttore"]
    },
    {
      causa: "morsetto aperto o ossidato",
      probabilita: 0.20,
      come_verifico: "apri le cassette e controlla i morsetti — stringa e pulisci",
      cosa_esclude: "morsetti tutti serrati e puliti",
      tempo_tipico: "intermittente o dopo vibrazione",
      componenti: ["giunzione"]
    },
    {
      causa: "assenza di rete (blackout o distacco)",
      probabilita: 0.15,
      come_verifico: "misura tensione al contatore — se non c'è, è il distributore",
      cosa_esclude: "tensione al contatore presente e normale",
      tempo_tipico: "tutto spento, non solo un circuito",
      componenti: ["sorgente"]
    },
    {
      causa: "neutro interrotto",
      probabilita: 0.05,
      come_verifico: "misura tensione fase-terra — se c'è 230V ma fase-neutro è zero, il neutro è rotto",
      cosa_esclude: "tensione fase-neutro normale",
      tempo_tipico: "luci deboli o che lampeggiano",
      componenti: ["conduttore"]
    }
  ],

  "surriscaldamento": [
    {
      causa: "morsetto allentato — connessione ad alta resistenza",
      probabilita: 0.40,
      come_verifico: "termocamera o tatto (con attenzione!) — il punto caldo è dove il morsetto è lento",
      cosa_esclude: "tutti i morsetti serrati a coppia, nessun punto caldo",
      tempo_tipico: "peggiora sotto carico",
      componenti: ["giunzione"]
    },
    {
      causa: "sovraccarico del circuito",
      probabilita: 0.30,
      come_verifico: "misura corrente — se supera la portata del cavo hai trovato il problema",
      cosa_esclude: "corrente ben sotto la portata",
      tempo_tipico: "cavo caldo lungo tutto il percorso",
      componenti: ["conduttore", "carico"]
    },
    {
      causa: "sezione cavo sottodimensionata",
      probabilita: 0.15,
      come_verifico: "verifica sezione vs corrente di impiego vs portata tabella CEI UNEL",
      cosa_esclude: "sezione adeguata per la corrente di impiego",
      tempo_tipico: "da sempre, peggiora con carichi nuovi",
      componenti: ["conduttore"]
    },
    {
      causa: "arco elettrico su contatto degradato",
      probabilita: 0.15,
      come_verifico: "ispezione contatti — cerchi annerimento, pitting, segni di arco",
      cosa_esclude: "contatti puliti e lisci",
      tempo_tipico: "odore di bruciato, ronzio",
      componenti: ["contattore", "giunzione"]
    }
  ],

  "intermittente": [
    {
      causa: "contatto allentato che fa e perde contatto",
      probabilita: 0.45,
      come_verifico: "muovi i cavi nelle cassette mentre misuri — quando il contatto si apre lo vedi",
      cosa_esclude: "tutti i morsetti serrati, nessuna variazione muovendo i cavi",
      tempo_tipico: "va e viene, peggiora con vibrazioni",
      componenti: ["giunzione"]
    },
    {
      causa: "componente sensibile alla temperatura",
      probabilita: 0.25,
      come_verifico: "scalda il componente sospetto con phon — se il guasto si manifesta è termico",
      cosa_esclude: "funziona uguale a freddo e a caldo",
      tempo_tipico: "funziona a freddo, smette quando si scalda",
      componenti: ["carico"]
    },
    {
      causa: "cavo con isolamento degradato che disperde a intermittenza",
      probabilita: 0.20,
      come_verifico: "misura isolamento — se borderline (0.3-1 MOhm) disperde solo con umidità o calore",
      cosa_esclude: "isolamento > 2 MOhm stabile",
      tempo_tipico: "peggiora con umidità o calore",
      componenti: ["conduttore"]
    },
    {
      causa: "interferenza elettromagnetica",
      probabilita: 0.10,
      come_verifico: "verifica prossimità a inverter, motori con variatore, saldatrici",
      cosa_esclude: "nessuna fonte di disturbo nelle vicinanze",
      tempo_tipico: "quando si accende un'altra macchina",
      componenti: ["carico"]
    }
  ],

  "motore_non_parte": [
    {
      causa: "mancanza di una fase (trifase)",
      probabilita: 0.30,
      come_verifico: "misura tensione sulle 3 fasi ai morsetti del motore — tutte devono essere 400V",
      cosa_esclude: "tutte e 3 le fasi presenti e bilanciate",
      tempo_tipico: "ronza ma non gira",
      componenti: ["conduttore", "contattore"]
    },
    {
      causa: "carico meccanico bloccato",
      probabilita: 0.20,
      come_verifico: "prova a girare l'albero a mano — se è bloccato il problema è meccanico",
      cosa_esclude: "albero gira libero a mano",
      tempo_tipico: "motore ronza forte e si scalda",
      componenti: ["carico"]
    },
    {
      causa: "contattore non tira o contatti bruciati",
      probabilita: 0.20,
      come_verifico: "misura tensione alla bobina del contattore — se c'è tensione e non tira, è guasto",
      cosa_esclude: "contattore tira e i contatti sono puliti",
      tempo_tipico: "non si sente il click del contattore",
      componenti: ["contattore"]
    },
    {
      causa: "relè termico scattato",
      probabilita: 0.15,
      come_verifico: "controlla il relè termico — deve essere in posizione di riarmo",
      cosa_esclude: "relè termico OK, non è scattato",
      tempo_tipico: "dopo un sovraccarico precedente",
      componenti: ["protezione_termica"]
    },
    {
      causa: "avvolgimento motore interrotto o in cortocircuito",
      probabilita: 0.15,
      come_verifico: "misura resistenza dei 3 avvolgimenti — devono essere uguali e tipicamente 2-20 Ohm",
      cosa_esclude: "resistenze bilanciate e nel range",
      tempo_tipico: "odore di bruciato dal motore",
      componenti: ["carico"]
    }
  ],

  "caldaia_non_accende": [
    {
      causa: "fiamma non rilevata — elettrodo sporco o degradato",
      probabilita: 0.30,
      come_verifico: "pulisci l'elettrodo di rilevazione con carta vetrata fine — se riparte era quello",
      cosa_esclude: "elettrodo pulito e fiamma rilevata correttamente",
      tempo_tipico: "va in blocco dopo qualche secondo",
      componenti: ["sensore"]
    },
    {
      causa: "valvola gas bloccata o bobina bruciata",
      probabilita: 0.20,
      come_verifico: "misura tensione sulla bobina della valvola durante tentativo accensione — deve esserci 230V",
      cosa_esclude: "tensione presente e valvola apre correttamente",
      tempo_tipico: "non si sente il gas che arriva",
      componenti: ["carico"]
    },
    {
      causa: "pressione acqua bassa",
      probabilita: 0.20,
      come_verifico: "controlla il manometro — deve essere tra 1 e 1.5 bar",
      cosa_esclude: "pressione nel range corretto",
      tempo_tipico: "errore sul display, pressostato aperto",
      componenti: ["sensore"]
    },
    {
      causa: "scheda elettronica guasta",
      probabilita: 0.15,
      come_verifico: "se alimentazione OK ma la scheda non comanda nulla — è lei",
      cosa_esclude: "scheda comanda ventilatore, valvola, pompa correttamente",
      tempo_tipico: "nessuna reazione o errore strano sul display",
      componenti: ["comando"]
    },
    {
      causa: "ventilatore tiraggio forzato bloccato",
      probabilita: 0.15,
      come_verifico: "controlla che il ventilatore giri — se è bloccato la caldaia non parte per sicurezza",
      cosa_esclude: "ventilatore gira correttamente",
      tempo_tipico: "non si sente il ventilatore partire",
      componenti: ["carico"]
    }
  ],

  "fotovoltaico_non_produce": [
    {
      causa: "inverter in errore o spento",
      probabilita: 0.30,
      come_verifico: "controlla il display dell'inverter — leggi il codice errore",
      cosa_esclude: "inverter acceso e funzionante senza errori",
      tempo_tipico: "produzione zero di colpo",
      componenti: ["inverter"]
    },
    {
      causa: "sezionatore DC aperto",
      probabilita: 0.20,
      come_verifico: "controlla che il sezionatore DC sotto i pannelli sia chiuso",
      cosa_esclude: "sezionatore chiuso, tensione DC presente",
      tempo_tipico: "dopo manutenzione o temporale",
      componenti: ["sezionatore"]
    },
    {
      causa: "stringa con diodo bypass in cortocircuito",
      probabilita: 0.15,
      come_verifico: "misura tensione di ogni stringa — quella bassa ha il problema",
      cosa_esclude: "tutte le stringhe con tensione nel range",
      tempo_tipico: "produzione calata, non azzerata",
      componenti: ["sorgente"]
    },
    {
      causa: "ombreggiamento parziale",
      probabilita: 0.20,
      come_verifico: "ispezione visiva — alberi cresciuti, antenna nuova, sporcizia sui pannelli",
      cosa_esclude: "pannelli puliti e senza ombre",
      tempo_tipico: "produzione calata progressivamente",
      componenti: ["sorgente"]
    },
    {
      causa: "guasto di isolamento lato DC",
      probabilita: 0.15,
      come_verifico: "misura isolamento DC delle stringhe — deve essere > 1 MOhm per stringa",
      cosa_esclude: "isolamento DC OK su tutte le stringhe",
      tempo_tipico: "inverter segnala errore isolamento",
      componenti: ["conduttore", "sorgente"]
    }
  ]
};

// ============================================================================
// REGOLE DI ESCLUSIONE — Leggi fisiche che tagliano corto
//
// Quando un tecnico esperto ha una misura in mano, non sta a ragionare:
// se l'isolamento è buono, la dispersione è esclusa. Punto.
// ============================================================================

var ESCLUSIONI = [
  {
    misura: "isolamento",
    condizione: function(v) { return v > 1; }, // > 1 MOhm
    esclude: ["dispersione su carico", "cavo danneggiato con dispersione verso terra",
              "umidità in cassetta di derivazione o morsettiera",
              "cavo con isolamento degradato che disperde a intermittenza"],
    perche: "isolamento sopra 1 MOhm — la dispersione è fisicamente impossibile"
  },
  {
    misura: "resistenza_fase_neutro",
    condizione: function(v) { return v > 10; }, // > 10 Ohm
    esclude: ["cortocircuito a valle", "contatto fase-neutro in cassetta derivazione"],
    perche: "resistenza fase-neutro > 10 Ohm — non c'è cortocircuito"
  },
  {
    misura: "corrente",
    condizione: function(v, nominale) { return nominale && v < nominale * 0.8; },
    esclude: ["sovraccarico — troppi apparecchi sullo stesso circuito",
              "carico con assorbimento anomalo"],
    perche: "corrente sotto l'80% del nominale — non c'è sovraccarico"
  },
  {
    misura: "tensione_rete",
    condizione: function(v) { return v > 210 && v < 250; },
    esclude: ["assenza di rete (blackout o distacco)"],
    perche: "tensione di rete presente e normale"
  },
  {
    misura: "continuita",
    condizione: function(v) { return v < 1; }, // < 1 Ohm
    esclude: ["conduttore interrotto"],
    perche: "continuità OK — il conduttore non è interrotto"
  },
  {
    misura: "temperatura_quadro",
    condizione: function(v) { return v < 35; },
    esclude: ["MCB declassato per temperatura ambiente alta"],
    perche: "quadro sotto 35°C — nessun declassamento termico"
  }
];

// ============================================================================
// CATENE CAUSALI — Se A causa B, e B causa C, allora A → B → C
//
// Un tecnico ragiona a catena: "la lavatrice disperde" → "il differenziale
// scatta" → "tutto il quadro è senza tensione" → "le luci si spengono".
// Ogni anello ha la sua probabilità. Più la catena è lunga, meno è certa.
// ============================================================================

var CATENE = [
  // Dispersione → RCD → tutto spento
  {
    partenza: "dispersione",
    catena: [
      { effetto: "RCD rileva corrente differenziale", probabilita: 0.95 },
      { effetto: "RCD sgancia", probabilita: 0.90 },
      { effetto: "tutto a valle senza tensione", probabilita: 0.95 }
    ],
    conclusione: "se c'è dispersione e il differenziale è a monte, tutto si spegne",
    condizione_necessaria: "differenziale installato a monte"
  },
  // Cortocircuito → MCB → linea spenta
  {
    partenza: "cortocircuito",
    catena: [
      { effetto: "corrente di guasto molto alta (kA)", probabilita: 0.98 },
      { effetto: "MCB sgancia magneticamente (istantaneo)", probabilita: 0.95 },
      { effetto: "circuito protetto senza tensione", probabilita: 0.95 }
    ],
    conclusione: "cortocircuito → MCB scatta subito → solo quel circuito si spegne",
    condizione_necessaria: "MCB dimensionato correttamente"
  },
  // Sovraccarico → calore → MCB termico
  {
    partenza: "sovraccarico",
    catena: [
      { effetto: "corrente sopra la nominale", probabilita: 0.90 },
      { effetto: "effetto Joule: R×I² → calore nei conduttori", probabilita: 0.95 },
      { effetto: "bimetallico MCB si deforma", probabilita: 0.80 },
      { effetto: "MCB sgancia termicamente (dopo minuti)", probabilita: 0.85 }
    ],
    conclusione: "sovraccarico → calore → MCB scatta dopo tempo — non istantaneo",
    condizione_necessaria: "corrente > In del MCB per tempo sufficiente"
  },
  // Morsetto allentato → resistenza → calore
  {
    partenza: "morsetto_allentato",
    catena: [
      { effetto: "resistenza di contatto aumenta", probabilita: 0.95 },
      { effetto: "P = R×I² → calore localizzato al morsetto", probabilita: 0.90 },
      { effetto: "ossidazione progressiva → peggioramento", probabilita: 0.85 },
      { effetto: "possibile arco elettrico o interruzione", probabilita: 0.60 }
    ],
    conclusione: "morsetto allentato → calore → degrado progressivo — pericoloso",
    condizione_necessaria: "corrente di carico presente"
  },
  // Neutro interrotto (trifase) → squilibrio tensioni
  {
    partenza: "neutro_interrotto_trifase",
    catena: [
      { effetto: "carichi sbilanciati tra le fasi", probabilita: 0.95 },
      { effetto: "tensione sale sulle fasi scariche, scende sulle cariche", probabilita: 0.90 },
      { effetto: "possibile sovratensione fino a 400V su utenza monofase", probabilita: 0.80 },
      { effetto: "danni a elettrodomestici e apparecchiature", probabilita: 0.70 }
    ],
    conclusione: "neutro interrotto in trifase → rischio grave per gli apparecchi monofase",
    condizione_necessaria: "sistema trifase con carichi monofase"
  },
  // Fase che tocca terra → tensione sul corpo macchina
  {
    partenza: "contatto_fase_terra",
    catena: [
      { effetto: "tensione pericolosa sulla massa metallica", probabilita: 0.95 },
      { effetto: "corrente verso terra attraverso PE", probabilita: 0.90 },
      { effetto: "RCD rileva e sgancia", probabilita: 0.90 },
      { effetto: "senza RCD o senza PE → rischio elettrocuzione", probabilita: 0.95 }
    ],
    conclusione: "contatto fase-terra → pericolo immediato — il differenziale DEVE intervenire",
    condizione_necessaria: "collegamento a terra (PE) presente"
  },
  // Condensatore motore guasto → monofase non parte
  {
    partenza: "condensatore_guasto",
    catena: [
      { effetto: "avvolgimento di avviamento non alimentato", probabilita: 0.90 },
      { effetto: "campo magnetico non rotante", probabilita: 0.95 },
      { effetto: "motore ronza ma non gira", probabilita: 0.85 },
      { effetto: "surriscaldamento rapido se alimentato", probabilita: 0.80 }
    ],
    conclusione: "condensatore guasto → motore monofase ronza e si scalda",
    condizione_necessaria: "motore monofase con condensatore"
  }
];

// ============================================================================
// MAPPA SINTOMI → ESPERIENZA
// Riconosce il sintomo dal testo e collega alla tabella esperienza
// ============================================================================

var RICONOSCIMENTO_SINTOMI = [
  // SPECIFICI PRIMA — motore, caldaia, FV hanno priorità sui pattern generici
  { pattern: /motore/, condizione: /non.*part|non.*gir|fermo|bloccato/, chiave: "motore_non_parte" },
  { pattern: /caldaia|boiler|riscald/, condizione: /non.*accend|blocco|errore|non.*part/, chiave: "caldaia_non_accende" },
  { pattern: /fotovoltaico|solare|pannell|inverter/, condizione: /non.*produc|zero|bassa|poco|niente/, chiave: "fotovoltaico_non_produce" },
  // Protezioni
  { pattern: /differenziale|rcd|salvavita|id\b|fi.schalter|disjoncteur|diferential/, condizione: /scatt|salt|trip|intervi|fliegt|saute|sare|dispar/, chiave: "differenziale_scatta" },
  { pattern: /magnetotermico|mcb|interruttor|breaker|sicherung|disyuntor|disjuntor/, condizione: /scatt.*subito|scatt.*istantan|subito|immediat|ricade|instantly|trips|fliegt|dispar|salta/, chiave: "magnetotermico_scatta_subito" },
  { pattern: /magnetotermico|mcb|interruttor|breaker|sicherung/, condizione: /scatt.*dopo|scatt.*tempo|dopo.*minut|dopo.*poco|after.*minut/, chiave: "magnetotermico_scatta_dopo_tempo" },
  // Surriscaldamento e intermittente prima del generico "niente tensione"
  { pattern: /cald|scald|surriscald|brucia|bruciato|fuma|odore|burning|smell|etincelle|funke/, condizione: /cavo|morsett|quadro|filo|connession|socket|prise|plug|stecker/, chiave: "surriscaldamento" },
  { pattern: /intermit|va.*e.*viene|a.*volte|saltuari|ogni.*tanto|sometimes|parfois/, condizione: null, chiave: "intermittente" },
  // GENERICO — cattura tutto il resto
  { pattern: /tensione|corrente|non.*funzion|non.*parte|spento|buio|senza|no.*power|kein.*strom|nicht.*funktionier/, condizione: /niente|zero|assente|non.*c.*e|manca|senza|non.*funzion|no.*power|half|kein/, chiave: "niente_tensione" }
];

// ============================================================================
// SIMULATORE — Il motore principale
// ============================================================================

// --- Riconosci il sintomo dal testo ---
function riconosciSintomo(testo) {
  if (!testo) return null;
  var t = testo.toLowerCase()
    .replace(/[àáâãä]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u");

  for (var i = 0; i < RICONOSCIMENTO_SINTOMI.length; i++) {
    var r = RICONOSCIMENTO_SINTOMI[i];
    if (r.pattern.test(t)) {
      if (!r.condizione || r.condizione.test(t)) {
        return r.chiave;
      }
    }
  }
  return null;
}

// --- Genera ipotesi dal sintomo ---
function generaIpotesi(sintomo) {
  var esperienza = ESPERIENZA[sintomo];
  if (!esperienza) return [];

  return esperienza.map(function(e) {
    return {
      causa: e.causa,
      probabilita: e.probabilita,
      come_verifico: e.come_verifico,
      cosa_esclude: e.cosa_esclude,
      tempo_tipico: e.tempo_tipico,
      componenti: e.componenti,
      stato: "attiva" // attiva, esclusa, confermata
    };
  });
}

// --- Simula in avanti: "se fosse X, cosa dovrei trovare?" ---
function simulaInAvanti(causa, worldModel) {
  var previsioni = [];

  // Cerca la catena causale per questa causa
  var causaLower = causa.toLowerCase().replace(/_/g, " ");
  for (var i = 0; i < CATENE.length; i++) {
    var catena = CATENE[i];
    var partenzaNorm = catena.partenza.replace(/_/g, " ");
    if (causaLower.indexOf(partenzaNorm) >= 0 || causaLower.indexOf(catena.partenza) >= 0) {
      var probabilitaCumulata = 1.0;
      var passi = [];
      for (var j = 0; j < catena.catena.length; j++) {
        var passo = catena.catena[j];
        probabilitaCumulata *= passo.probabilita;
        passi.push({
          effetto: passo.effetto,
          probabilita_singola: passo.probabilita,
          probabilita_cumulata: probabilitaCumulata
        });
      }
      previsioni.push({
        catena: catena.partenza,
        passi: passi,
        conclusione: catena.conclusione,
        probabilita_totale: probabilitaCumulata,
        condizione: catena.condizione_necessaria
      });
    }
  }

  // Se c'è un world model, usa anche la simulazione fisica
  if (worldModel) {
    var nodoSospetto = trovaNodoPerCausa(worldModel, causa);
    if (nodoSospetto) {
      var statoSimulato = causaAStato(causa);
      if (statoSimulato) {
        var simFisica = WorldModel.simula(worldModel, nodoSospetto.id, statoSimulato);
        if (simFisica && simFisica.previsioni) {
          previsioni.push({
            catena: "simulazione_fisica",
            passi: simFisica.previsioni.map(function(p) {
              return {
                effetto: p.osservabile,
                probabilita_singola: p.confidenza,
                probabilita_cumulata: p.confidenza
              };
            }),
            conclusione: "simulazione diretta sul modello dell'impianto",
            probabilita_totale: simFisica.previsioni.length > 0 ? simFisica.previsioni[0].confidenza : 0
          });
        }
      }
    }
  }

  return previsioni;
}

// --- Confronta con i fatti: "quello che vedo combacia?" ---
function confrontaConFatti(ipotesi, fatti) {
  if (!fatti || fatti.length === 0) return ipotesi;

  var fattiStr = fatti.join(" ").toLowerCase();

  for (var i = 0; i < ipotesi.length; i++) {
    var ip = ipotesi[i];
    if (ip.stato !== "attiva") continue;

    // Controlla se l'esclusione è verificata
    if (ip.cosa_esclude && confrontaTesto(fattiStr, ip.cosa_esclude)) {
      ip.stato = "esclusa";
      ip.motivo_esclusione = ip.cosa_esclude;
      continue;
    }

    // Controlla se i fatti confermano questa ipotesi
    if (ip.come_verifico && confrontaTesto(fattiStr, ip.come_verifico)) {
      ip.probabilita = Math.min(1.0, ip.probabilita * 1.5);
      ip.rafforzata = true;
    }

    // Controlla il tempo tipico
    if (ip.tempo_tipico && confrontaTesto(fattiStr, ip.tempo_tipico)) {
      ip.probabilita = Math.min(1.0, ip.probabilita * 1.3);
      ip.tempo_confermato = true;
    }
  }

  // Ridistribuisci probabilità delle escluse
  var totaleEscluse = 0;
  var totaleAttive = 0;
  for (var j = 0; j < ipotesi.length; j++) {
    if (ipotesi[j].stato === "esclusa") totaleEscluse += ipotesi[j].probabilita;
    if (ipotesi[j].stato === "attiva") totaleAttive += ipotesi[j].probabilita;
  }
  if (totaleEscluse > 0 && totaleAttive > 0) {
    for (var k = 0; k < ipotesi.length; k++) {
      if (ipotesi[k].stato === "attiva") {
        ipotesi[k].probabilita += (totaleEscluse * ipotesi[k].probabilita / totaleAttive);
        ipotesi[k].probabilita = Math.min(1.0, ipotesi[k].probabilita);
      }
    }
  }

  return ipotesi;
}

// --- Applica esclusioni da misure ---
function applicaEsclusioni(ipotesi, misure) {
  if (!misure || misure.length === 0) return ipotesi;

  for (var m = 0; m < misure.length; m++) {
    var misura = misure[m];

    for (var e = 0; e < ESCLUSIONI.length; e++) {
      var escl = ESCLUSIONI[e];
      if (misura.grandezza === escl.misura || (misura.tipo && misura.tipo === escl.misura)) {
        if (escl.condizione(misura.valore, misura.nominale)) {
          // Questa misura esclude alcune ipotesi
          for (var i = 0; i < ipotesi.length; i++) {
            if (ipotesi[i].stato !== "attiva") continue;
            for (var x = 0; x < escl.esclude.length; x++) {
              if (ipotesi[i].causa === escl.esclude[x]) {
                ipotesi[i].stato = "esclusa";
                ipotesi[i].motivo_esclusione = escl.perche;
              }
            }
          }
        }
      }
    }
  }

  return ipotesi;
}

// --- Quale misura mi toglie il dubbio? ---
function miglioreMisura(ipotesi) {
  var attive = ipotesi.filter(function(ip) { return ip.stato === "attiva"; });
  if (attive.length <= 1) return null;

  // Per ogni verifica possibile, conta quante ipotesi separa
  var verifiche = {};
  for (var i = 0; i < attive.length; i++) {
    var v = attive[i].come_verifico;
    if (!v) continue;
    if (!verifiche[v]) {
      verifiche[v] = { testo: v, conferma: [], esclude: [] };
    }
    verifiche[v].conferma.push(attive[i].causa);
  }

  // Aggiungi le esclusioni
  for (var j = 0; j < attive.length; j++) {
    var e = attive[j].cosa_esclude;
    if (!e) continue;
    // Cerca se questa esclusione è la verifica di un'altra ipotesi
    for (var k in verifiche) {
      if (k !== attive[j].come_verifico) {
        verifiche[k].esclude.push(attive[j].causa);
      }
    }
  }

  // La migliore è quella che separa il maggior numero di ipotesi
  var migliore = null;
  var migliorScore = 0;

  for (var ver in verifiche) {
    var v2 = verifiche[ver];
    // Score: min(conferma, totale - conferma) → massima separazione
    var separazione = Math.min(v2.conferma.length, attive.length - v2.conferma.length);
    var score = separazione * 10 + v2.conferma.length;

    if (score > migliorScore) {
      migliorScore = score;
      migliore = v2;
    }
  }

  if (!migliore) {
    // Fallback: suggerisci la verifica della prima ipotesi più probabile
    attive.sort(function(a, b) { return b.probabilita - a.probabilita; });
    return {
      testo: attive[0].come_verifico,
      perche: "è la causa più probabile (" + Math.round(attive[0].probabilita * 100) + "%) — verifica prima questa",
      separa: 1
    };
  }

  return {
    testo: migliore.testo,
    perche: "questa misura separa " + migliore.conferma.length + " ipotesi su " + attive.length,
    conferma: migliore.conferma,
    separa: Math.min(migliore.conferma.length, attive.length - migliore.conferma.length)
  };
}

// --- Aggiorna ipotesi con nuovo fatto o misura ---
function aggiorna(stato, informazione) {
  if (!stato || !informazione) return stato;

  if (informazione.fatto) {
    stato.fatti.push(informazione.fatto);
    stato.ipotesi = confrontaConFatti(stato.ipotesi, [informazione.fatto]);
  }

  if (informazione.misura) {
    stato.misure.push(informazione.misura);
    stato.ipotesi = applicaEsclusioni(stato.ipotesi, [informazione.misura]);
  }

  // Ricalcola
  stato.ipotesi.sort(function(a, b) {
    if (a.stato !== b.stato) return a.stato === "attiva" ? -1 : 1;
    return b.probabilita - a.probabilita;
  });

  stato.attive = stato.ipotesi.filter(function(ip) { return ip.stato === "attiva"; }).length;
  stato.prossima_misura = miglioreMisura(stato.ipotesi);

  // Se resta una sola ipotesi attiva con probabilità alta → diagnosi
  var attive = stato.ipotesi.filter(function(ip) { return ip.stato === "attiva"; });
  if (attive.length === 1 && attive[0].probabilita > 0.5) {
    stato.diagnosi = {
      causa: attive[0].causa,
      probabilita: attive[0].probabilita,
      come_risolvere: attive[0].come_verifico,
      componenti: attive[0].componenti
    };
  } else if (attive.length === 0) {
    stato.diagnosi = {
      causa: "causa non identificata — serve indagine più approfondita",
      probabilita: 0,
      come_risolvere: "verifica sistematica partendo dalle alimentazioni"
    };
  }

  return stato;
}

// --- Simula: il ciclo completo del tecnico ---
function simula(caseState) {
  if (!caseState) return null;

  var testo = caseState.problem_summary || "";
  var fatti = caseState.facts_confirmed || [];
  var componenti = caseState.components_detected || [];
  var misure = caseState.measurements || [];

  // 1. Riconosci il sintomo
  var sintomo = riconosciSintomo(testo);

  // 2. Genera ipotesi dall'esperienza
  var ipotesi = sintomo ? generaIpotesi(sintomo) : [];

  // 3. Se non riconosce il sintomo, prova con i componenti
  if (ipotesi.length === 0) {
    // Prova combinazioni
    for (var c = 0; c < componenti.length; c++) {
      var compSintomo = riconosciSintomo(componenti[c] + " " + testo);
      if (compSintomo) {
        ipotesi = generaIpotesi(compSintomo);
        sintomo = compSintomo;
        break;
      }
    }
  }

  // 4. Confronta con i fatti noti
  ipotesi = confrontaConFatti(ipotesi, fatti);

  // 5. Applica esclusioni da misure
  var misureParsate = [];
  for (var m = 0; m < misure.length; m++) {
    var mp = typeof misure[m] === "string" ? WorldModel.parseMisura(misure[m]) : misure[m];
    if (mp) misureParsate.push(mp);
  }
  ipotesi = applicaEsclusioni(ipotesi, misureParsate);

  // 6. Ordina per probabilità
  ipotesi.sort(function(a, b) {
    if (a.stato !== b.stato) return a.stato === "attiva" ? -1 : 1;
    return b.probabilita - a.probabilita;
  });

  // 7. Trova la migliore misura discriminante
  var prossima = miglioreMisura(ipotesi);

  // 8. Simula in avanti per ogni ipotesi attiva (catene causali + world model)
  var simulazioni = {};
  var wm = caseState.world_model || null;
  var attive = ipotesi.filter(function(ip) { return ip.stato === "attiva"; });
  for (var s = 0; s < Math.min(attive.length, 3); s++) {
    var sim = simulaInAvanti(attive[s].causa, wm);
    if (sim.length > 0) {
      simulazioni[attive[s].causa] = sim;
    }
  }

  // 9. Costruisci lo stato della simulazione
  var stato = {
    sintomo: sintomo,
    ipotesi: ipotesi,
    attive: attive.length,
    escluse: ipotesi.length - attive.length,
    simulazioni: simulazioni,
    prossima_misura: prossima,
    fatti: fatti.slice(),
    misure: misureParsate,
    diagnosi: null
  };

  // Diagnosi se una sola ipotesi domina
  if (attive.length === 1 && attive[0].probabilita > 0.5) {
    stato.diagnosi = {
      causa: attive[0].causa,
      probabilita: attive[0].probabilita,
      come_risolvere: attive[0].come_verifico,
      componenti: attive[0].componenti
    };
  }

  return stato;
}

// --- Impara da un caso chiuso ---
function imparaDaCasoChiuso(caseState, esito) {
  if (!caseState || !esito || !esito.causa_reale) return null;

  var sintomo = riconosciSintomo(caseState.problem_summary || "");
  if (!sintomo || !ESPERIENZA[sintomo]) return null;

  var causaReale = esito.causa_reale.toLowerCase();
  var trovata = false;

  // Aggiorna probabilità: rinforza la causa corretta, indebolisci le altre
  for (var i = 0; i < ESPERIENZA[sintomo].length; i++) {
    var e = ESPERIENZA[sintomo][i];
    if (e.causa.toLowerCase().indexOf(causaReale) >= 0 ||
        causaReale.indexOf(e.causa.toLowerCase()) >= 0) {
      // Rinforza (learning rate 0.05)
      e.probabilita = Math.min(0.95, e.probabilita + 0.05 * (1 - e.probabilita));
      trovata = true;
    } else {
      // Indebolisci leggermente
      e.probabilita = Math.max(0.01, e.probabilita - 0.02 * e.probabilita);
    }
  }

  // Se la causa non era nella lista, aggiungila
  if (!trovata) {
    ESPERIENZA[sintomo].push({
      causa: esito.causa_reale,
      probabilita: 0.10,
      come_verifico: esito.come_verificato || "da definire in base all'esperienza",
      cosa_esclude: esito.cosa_escludeva || "",
      tempo_tipico: esito.tempo || "",
      componenti: esito.componenti || []
    });
  }

  // Normalizza le probabilità
  normalizzaProbabilita(ESPERIENZA[sintomo]);

  return { sintomo: sintomo, aggiornato: true, cause: ESPERIENZA[sintomo].length };
}

// --- Salva e carica stato ---
function salva() {
  // Copia deep dell'esperienza per serializzazione
  var stato = {};
  for (var k in ESPERIENZA) {
    stato[k] = ESPERIENZA[k].map(function(e) {
      return {
        causa: e.causa,
        probabilita: e.probabilita,
        come_verifico: e.come_verifico,
        cosa_esclude: e.cosa_esclude,
        tempo_tipico: e.tempo_tipico,
        componenti: e.componenti.slice()
      };
    });
  }
  return stato;
}

function carica(stato) {
  if (!stato) return false;
  for (var k in stato) {
    ESPERIENZA[k] = stato[k];
  }
  return true;
}

// --- Stats ---
function getStats() {
  var totSintomi = Object.keys(ESPERIENZA).length;
  var totCause = 0;
  for (var k in ESPERIENZA) totCause += ESPERIENZA[k].length;
  return {
    sintomi: totSintomi,
    cause_totali: totCause,
    catene: CATENE.length,
    esclusioni: ESCLUSIONI.length,
    riconoscimento: RICONOSCIMENTO_SINTOMI.length
  };
}

// ============================================================================
// UTILITY INTERNE
// ============================================================================

function normalizzaProbabilita(lista) {
  var totale = 0;
  for (var i = 0; i < lista.length; i++) totale += lista[i].probabilita;
  if (totale > 0 && totale !== 1) {
    for (var j = 0; j < lista.length; j++) lista[j].probabilita /= totale;
  }
}

function confrontaTesto(testo, riferimento) {
  if (!testo || !riferimento) return false;
  var rif = riferimento.toLowerCase();
  // Estrai parole significative (> 3 caratteri)
  var parole = rif.split(/\s+/).filter(function(p) { return p.length > 3; });
  var match = 0;
  for (var i = 0; i < parole.length; i++) {
    if (testo.indexOf(parole[i]) >= 0) match++;
  }
  // Almeno 30% delle parole significative matchano
  return parole.length > 0 && match / parole.length >= 0.3;
}

function trovaNodoPerCausa(wm, causa) {
  if (!wm || !causa) return null;
  var c = causa.toLowerCase();

  // Cerca componente menzionato nella causa
  var mappaCausa = {
    "dispersione su carico": "lavatrice",
    "cavo danneggiato": "cavo_luci",
    "cortocircuito a valle": "luci",
    "morsetto allentato": "cavo_prese",
    "motore": "motore"
  };

  for (var chiave in mappaCausa) {
    if (c.indexOf(chiave) >= 0) {
      var nodo = wm.trovaNodo(mappaCausa[chiave]);
      if (nodo) return nodo;
    }
  }

  // Cerca match generico
  return wm.trovaNodoPerNome(causa) || null;
}

function causaAStato(causa) {
  if (!causa) return null;
  var c = causa.toLowerCase();
  if (c.indexOf("dispersione") >= 0) return WorldModel.STATI.DISPERSIONE;
  if (c.indexOf("cortocircuito") >= 0) return WorldModel.STATI.CORTOCIRCUITO;
  if (c.indexOf("sovraccarico") >= 0) return WorldModel.STATI.SOVRACCARICO;
  if (c.indexOf("surriscaldamento") >= 0 || c.indexOf("morsetto") >= 0) return WorldModel.STATI.SURRISCALDAMENTO;
  if (c.indexOf("guast") >= 0 || c.indexOf("rott") >= 0) return WorldModel.STATI.GUASTO;
  if (c.indexOf("interrott") >= 0) return WorldModel.STATI.NON_ALIMENTATO;
  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Ciclo completo
  simula: simula,
  aggiorna: aggiorna,

  // Singoli passi
  riconosciSintomo: riconosciSintomo,
  generaIpotesi: generaIpotesi,
  simulaInAvanti: simulaInAvanti,
  confrontaConFatti: confrontaConFatti,
  applicaEsclusioni: applicaEsclusioni,
  miglioreMisura: miglioreMisura,

  // Apprendimento
  imparaDaCasoChiuso: imparaDaCasoChiuso,

  // Persistenza
  salva: salva,
  carica: carica,
  getStats: getStats,

  // Dati (esposti per test e debug)
  ESPERIENZA: ESPERIENZA,
  CATENE: CATENE,
  ESCLUSIONI: ESCLUSIONI
};
