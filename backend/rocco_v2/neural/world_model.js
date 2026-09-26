"use strict";

// ============================================================================
// WORLD MODEL ELETTRICO — Rappresentazione interna dell'impianto
//
// ROCCO si costruisce mentalmente l'impianto che sta diagnosticando.
// Non è un disegno: è un modello funzionale con tensioni, correnti,
// protezioni, stati e la capacità di simulare cosa succede.
//
// Ogni nodo sa:
//   - che tensione dovrebbe avere
//   - che corrente lo attraversa
//   - che protezione lo copre
//   - in che stato è (alimentato, aperto, guasto, sconosciuto)
//
// Il modello può:
//   - costruirsi dal testo dell'utente
//   - prevedere misure in ogni punto
//   - simulare l'apertura/chiusura di un dispositivo
//   - confrontare atteso vs reale
//   - localizzare dove nasce il problema
// ============================================================================

var nl = require("./neural_language");
var nk = require("./neural_knowledge");

// ============================================================================
// COSTANTI ELETTRICHE
// ============================================================================

var TENSIONI = {
  MONOFASE: 230,
  TRIFASE_FASE: 230,
  TRIFASE_CONCAT: 400,
  SICUREZZA: 50,   // SELV/PELV
  BT_MAX: 1000,
  DC_FV: 600       // tipico stringa FV
};

var FREQUENZA = 50; // Hz Italia

// ============================================================================
// TIPI NODO DEL WORLD MODEL
// ============================================================================

var TIPI_NODO = {
  SORGENTE: "sorgente",               // rete, generatore, UPS, FV
  QUADRO: "quadro",                   // quadro generale, secondario
  PROTEZIONE_DIFF: "protezione_diff", // RCD, RCBO
  PROTEZIONE_MCB: "protezione_mcb",   // magnetotermico
  PROTEZIONE_FUSIBILE: "protezione_fusibile",
  PROTEZIONE_TERMICA: "protezione_termica", // relè termico
  SEZIONATORE: "sezionatore",
  CONTATTORE: "contattore",
  CONDUTTORE: "conduttore",           // cavo, sbarra
  GIUNZIONE: "giunzione",            // morsetto, cassetta derivazione
  CARICO: "carico",                   // presa, luce, motore, caldaia
  COMANDO: "comando",                // pulsante, selettore, PLC
  SENSORE: "sensore",                // sonda, TA, sensore
  TRASFORMATORE: "trasformatore",
  INVERTER: "inverter",              // inverter FV o motore
  ACCUMULO: "accumulo"               // batteria
};

// ============================================================================
// STATI POSSIBILI PER OGNI NODO
// ============================================================================

var STATI = {
  ALIMENTATO: "alimentato",
  NON_ALIMENTATO: "non_alimentato",
  APERTO: "aperto",             // dispositivo di manovra aperto
  CHIUSO: "chiuso",             // dispositivo di manovra chiuso
  SCATTATO: "scattato",         // protezione intervenuta
  GUASTO: "guasto",
  DISPERSIONE: "dispersione",
  CORTOCIRCUITO: "cortocircuito",
  SOVRACCARICO: "sovraccarico",
  SURRISCALDAMENTO: "surriscaldamento",
  SCONOSCIUTO: "sconosciuto"
};

// ============================================================================
// NODO DEL WORLD MODEL
// ============================================================================

function NodoImpianto(id, tipo, nome, parametri) {
  this.id = id;
  this.tipo = tipo;
  this.nome = nome;
  this.stato = STATI.SCONOSCIUTO;

  // Parametri elettrici attesi
  this.elettrici = {
    tensione_attesa: (parametri && parametri.tensione) || null,     // V
    corrente_nominale: (parametri && parametri.corrente) || null,   // A
    corrente_attuale: null,                                         // A (misurata)
    tensione_misurata: null,                                        // V (misurata)
    impedenza: (parametri && parametri.impedenza) || null,          // Ω
    potenza: (parametri && parametri.potenza) || null,              // W
    cos_phi: (parametri && parametri.cos_phi) || null,
    frequenza: FREQUENZA
  };

  // Parametri protezione (solo per protezioni)
  this.protezione = null;
  if (tipo === TIPI_NODO.PROTEZIONE_DIFF || tipo === TIPI_NODO.PROTEZIONE_MCB ||
      tipo === TIPI_NODO.PROTEZIONE_FUSIBILE || tipo === TIPI_NODO.PROTEZIONE_TERMICA) {
    this.protezione = {
      In: (parametri && parametri.In) || null,          // corrente nominale
      Idn: (parametri && parametri.Idn) || null,        // corrente differenziale nominale (mA)
      curva: (parametri && parametri.curva) || null,     // B, C, D
      potere_interruzione: (parametri && parametri.Icu) || null,
      selettivo: (parametri && parametri.selettivo) || false
    };
  }

  // Parametri conduttore
  this.conduttore = null;
  if (tipo === TIPI_NODO.CONDUTTORE) {
    this.conduttore = {
      sezione: (parametri && parametri.sezione) || null,   // mm²
      lunghezza: (parametri && parametri.lunghezza) || null, // m
      materiale: (parametri && parametri.materiale) || "rame",
      portata: (parametri && parametri.portata) || null,     // A
      tipo_posa: (parametri && parametri.posa) || null
    };
  }

  // Metadata diagnostica
  this.diagnostica = {
    anomalie: [],         // anomalie rilevate
    ultima_misura: null,  // timestamp
    storia_stati: [],     // [{stato, timestamp}]
    affidabilita: 1.0     // 0-1, degrada con problemi ricorrenti
  };

  // Posizione fisica
  this.posizione = (parametri && parametri.posizione) || null;

  // Flag
  this.menzionato = false;      // citato dall'utente
  this.verificato = false;      // stato confermato da misura
  this.sospetto = false;        // candidato per il guasto
}

// ============================================================================
// ARCO DEL WORLD MODEL
// ============================================================================

function ArcoImpianto(da, a, relazione, parametri) {
  this.da = da;
  this.a = a;
  this.relazione = relazione;   // alimenta, protegge, comanda, misura, terra
  this.stato = "integro";       // integro, interrotto, degradato
  this.resistenza_contatto = 0; // mΩ (0 = perfetto)
}

// ============================================================================
// WORLD MODEL — Il modello completo dell'impianto
// ============================================================================

function WorldModel() {
  this.nodi = {};      // id → NodoImpianto
  this.archi = [];     // ArcoImpianto[]
  this.tipo_impianto = null;  // civile, industriale, fotovoltaico, caldaia
  this.sistema = null;        // monofase, trifase
  this.tensione_rete = TENSIONI.MONOFASE;
  this.neutro = null;         // id del nodo neutro se presente
  this.terra = null;          // id del nodo terra
  this.timestamp_creazione = Date.now();
  this.misure_registrate = [];  // [{punto, grandezza, valore, unita, timestamp}]
}

// --- Aggiungi nodo ---
WorldModel.prototype.aggiungiNodo = function(id, tipo, nome, parametri) {
  var nodo = new NodoImpianto(id, tipo, nome, parametri);
  this.nodi[id] = nodo;
  return nodo;
};

// --- Aggiungi arco ---
WorldModel.prototype.aggiungiArco = function(da, a, relazione, parametri) {
  var arco = new ArcoImpianto(da, a, relazione, parametri);
  this.archi.push(arco);
  return arco;
};

// --- Trova nodo ---
WorldModel.prototype.trovaNodo = function(id) {
  return this.nodi[id] || null;
};

// --- Trova nodo per nome (matching parziale) ---
WorldModel.prototype.trovaNodoPerNome = function(nome) {
  var nomeLower = nome.toLowerCase();
  for (var id in this.nodi) {
    if (this.nodi[id].nome.toLowerCase().indexOf(nomeLower) >= 0 ||
        nomeLower.indexOf(this.nodi[id].nome.toLowerCase()) >= 0) {
      return this.nodi[id];
    }
  }
  return null;
};

// --- Nodi a valle (alimentati da questo) ---
WorldModel.prototype.aValle = function(nodoId) {
  var risultati = [];
  for (var i = 0; i < this.archi.length; i++) {
    var a = this.archi[i];
    if (a.da === nodoId && (a.relazione === "alimenta" || a.relazione === "protegge")) {
      if (this.nodi[a.a]) risultati.push(this.nodi[a.a]);
    }
  }
  return risultati;
};

// --- Nodi a monte (che alimentano questo) ---
WorldModel.prototype.aMonte = function(nodoId) {
  var risultati = [];
  for (var i = 0; i < this.archi.length; i++) {
    var a = this.archi[i];
    if (a.a === nodoId && (a.relazione === "alimenta" || a.relazione === "protegge")) {
      if (this.nodi[a.da]) risultati.push(this.nodi[a.da]);
    }
  }
  return risultati;
};

// --- Tutti i discendenti ricorsivi ---
WorldModel.prototype.discendenti = function(nodoId) {
  var visited = {};
  var result = [];
  var self = this;

  function dfs(id) {
    if (visited[id]) return;
    visited[id] = true;
    var figli = self.aValle(id);
    for (var i = 0; i < figli.length; i++) {
      result.push(figli[i]);
      dfs(figli[i].id);
    }
  }

  dfs(nodoId);
  return result;
};

// --- Tutti gli antenati ricorsivi ---
WorldModel.prototype.antenati = function(nodoId) {
  var visited = {};
  var result = [];
  var self = this;

  function dfs(id) {
    if (visited[id]) return;
    visited[id] = true;
    var padri = self.aMonte(id);
    for (var i = 0; i < padri.length; i++) {
      result.push(padri[i]);
      dfs(padri[i].id);
    }
  }

  dfs(nodoId);
  return result;
};

// --- Trova nodi per tipo ---
WorldModel.prototype.nodiPerTipo = function(tipo) {
  var risultati = [];
  for (var id in this.nodi) {
    if (this.nodi[id].tipo === tipo) risultati.push(this.nodi[id]);
  }
  return risultati;
};

// --- Conta nodi ---
WorldModel.prototype.contaNodi = function() {
  return Object.keys(this.nodi).length;
};

// --- Conta archi ---
WorldModel.prototype.contaArchi = function() {
  return this.archi.length;
};

// ============================================================================
// TEMPLATE IMPIANTI DETTAGLIATI
// ============================================================================

function templateCivileMonofase() {
  var wm = new WorldModel();
  wm.tipo_impianto = "civile";
  wm.sistema = "monofase";
  wm.tensione_rete = TENSIONI.MONOFASE;

  // Sorgente
  wm.aggiungiNodo("rete", TIPI_NODO.SORGENTE, "Rete 230V 50Hz", {
    tensione: 230, posizione: "contatore"
  });
  wm.aggiungiNodo("terra", TIPI_NODO.CONDUTTORE, "Impianto di terra", {
    posizione: "dispersore"
  });
  wm.terra = "terra";

  // Quadro generale
  wm.aggiungiNodo("qg", TIPI_NODO.QUADRO, "Quadro generale", {
    tensione: 230, posizione: "ingresso"
  });

  // Protezione generale
  wm.aggiungiNodo("gen", TIPI_NODO.PROTEZIONE_MCB, "Interruttore generale", {
    tensione: 230, In: 32, curva: "C"
  });

  // Differenziale
  wm.aggiungiNodo("rcd", TIPI_NODO.PROTEZIONE_DIFF, "Differenziale 30mA", {
    tensione: 230, In: 40, Idn: 30
  });

  // Linee con MCB + conduttore + carico
  var linee = [
    { id: "luci", mcb: "mcb_luci", cavo: "cavo_luci", nome: "Luci", In: 10, curva: "B", sezione: 1.5, carico: "Circuito luci" },
    { id: "prese", mcb: "mcb_prese", cavo: "cavo_prese", nome: "Prese", In: 16, curva: "C", sezione: 2.5, carico: "Circuito prese" },
    { id: "cucina", mcb: "mcb_cucina", cavo: "cavo_cucina", nome: "Cucina", In: 16, curva: "C", sezione: 2.5, carico: "Prese cucina (forno, lavastoviglie)" },
    { id: "bagno", mcb: "mcb_bagno", cavo: "cavo_bagno", nome: "Bagno", In: 16, curva: "C", sezione: 2.5, carico: "Circuito bagno" },
    { id: "lavatrice", mcb: "mcb_lavatrice", cavo: "cavo_lavatrice", nome: "Lavatrice", In: 16, curva: "C", sezione: 2.5, carico: "Presa lavatrice dedicata" },
    { id: "clima", mcb: "mcb_clima", cavo: "cavo_clima", nome: "Climatizzatore", In: 16, curva: "C", sezione: 2.5, carico: "Climatizzatore split" }
  ];

  for (var i = 0; i < linee.length; i++) {
    var l = linee[i];
    wm.aggiungiNodo(l.mcb, TIPI_NODO.PROTEZIONE_MCB, "MCB " + l.nome + " " + l.In + "A", {
      tensione: 230, In: l.In, curva: l.curva
    });
    wm.aggiungiNodo(l.cavo, TIPI_NODO.CONDUTTORE, "Cavo " + l.nome, {
      tensione: 230, sezione: l.sezione
    });
    wm.aggiungiNodo(l.id, TIPI_NODO.CARICO, l.carico, {
      tensione: 230, posizione: l.nome.toLowerCase()
    });
  }

  // Archi: topologia dell'impianto
  wm.aggiungiArco("rete", "qg", "alimenta");
  wm.aggiungiArco("qg", "gen", "alimenta");
  wm.aggiungiArco("gen", "rcd", "alimenta");

  for (var j = 0; j < linee.length; j++) {
    var ll = linee[j];
    wm.aggiungiArco("rcd", ll.mcb, "protegge");
    wm.aggiungiArco(ll.mcb, ll.cavo, "alimenta");
    wm.aggiungiArco(ll.cavo, ll.id, "alimenta");
  }

  // Terra collegata al differenziale
  wm.aggiungiArco("terra", "rcd", "terra");

  return wm;
}

function templateTrifaseIndustriale() {
  var wm = new WorldModel();
  wm.tipo_impianto = "industriale";
  wm.sistema = "trifase";
  wm.tensione_rete = TENSIONI.TRIFASE_CONCAT;

  wm.aggiungiNodo("rete3f", TIPI_NODO.SORGENTE, "Rete trifase 400V", { tensione: 400 });
  wm.aggiungiNodo("terra_ind", TIPI_NODO.CONDUTTORE, "Impianto di terra", {});
  wm.terra = "terra_ind";

  // Quadro generale
  wm.aggiungiNodo("qg_ind", TIPI_NODO.QUADRO, "Quadro generale industriale", { tensione: 400 });
  wm.aggiungiNodo("sez", TIPI_NODO.SEZIONATORE, "Sezionatore generale", { tensione: 400, In: 63 });

  // Linea motore
  wm.aggiungiNodo("mcb_mot", TIPI_NODO.PROTEZIONE_MCB, "MCB motore 25A curva D", {
    tensione: 400, In: 25, curva: "D"
  });
  wm.aggiungiNodo("rt_mot", TIPI_NODO.PROTEZIONE_TERMICA, "Relè termico 18-25A", {
    In: 25
  });
  wm.aggiungiNodo("cont_mot", TIPI_NODO.CONTATTORE, "Contattore motore", { tensione: 400 });
  wm.aggiungiNodo("cavo_mot", TIPI_NODO.CONDUTTORE, "Cavo motore 4G4", {
    sezione: 4, tensione: 400
  });
  wm.aggiungiNodo("motore", TIPI_NODO.CARICO, "Motore trifase", {
    tensione: 400, potenza: 5500, cos_phi: 0.85
  });

  // Linea prese industriali
  wm.aggiungiNodo("rcd_ind", TIPI_NODO.PROTEZIONE_DIFF, "Differenziale industriale 30mA", {
    tensione: 400, In: 40, Idn: 30
  });
  wm.aggiungiNodo("mcb_prese_ind", TIPI_NODO.PROTEZIONE_MCB, "MCB prese 16A", {
    tensione: 400, In: 16, curva: "C"
  });
  wm.aggiungiNodo("prese_ind", TIPI_NODO.CARICO, "Prese industriali", { tensione: 400 });

  // Linea illuminazione
  wm.aggiungiNodo("mcb_luci_ind", TIPI_NODO.PROTEZIONE_MCB, "MCB luci 10A", {
    tensione: 230, In: 10, curva: "B"
  });
  wm.aggiungiNodo("luci_ind", TIPI_NODO.CARICO, "Illuminazione capannone", { tensione: 230 });

  // Comando motore
  wm.aggiungiNodo("cmd_mot", TIPI_NODO.COMANDO, "Pulsantiera marcia/arresto", {});

  // Topologia
  wm.aggiungiArco("rete3f", "qg_ind", "alimenta");
  wm.aggiungiArco("qg_ind", "sez", "alimenta");

  // Ramo motore
  wm.aggiungiArco("sez", "mcb_mot", "alimenta");
  wm.aggiungiArco("mcb_mot", "rt_mot", "alimenta");
  wm.aggiungiArco("rt_mot", "cont_mot", "alimenta");
  wm.aggiungiArco("cont_mot", "cavo_mot", "alimenta");
  wm.aggiungiArco("cavo_mot", "motore", "alimenta");
  wm.aggiungiArco("cmd_mot", "cont_mot", "comanda");

  // Ramo prese
  wm.aggiungiArco("sez", "rcd_ind", "alimenta");
  wm.aggiungiArco("rcd_ind", "mcb_prese_ind", "protegge");
  wm.aggiungiArco("mcb_prese_ind", "prese_ind", "alimenta");

  // Ramo luci
  wm.aggiungiArco("sez", "mcb_luci_ind", "alimenta");
  wm.aggiungiArco("mcb_luci_ind", "luci_ind", "alimenta");

  wm.aggiungiArco("terra_ind", "rcd_ind", "terra");

  return wm;
}

function templateFotovoltaico() {
  var wm = new WorldModel();
  wm.tipo_impianto = "fotovoltaico";
  wm.sistema = "monofase";
  wm.tensione_rete = TENSIONI.MONOFASE;

  wm.aggiungiNodo("pannelli", TIPI_NODO.SORGENTE, "Stringhe FV", { tensione: 450 });
  wm.aggiungiNodo("sez_dc", TIPI_NODO.SEZIONATORE, "Sezionatore DC", { tensione: 600 });
  wm.aggiungiNodo("spd_dc", TIPI_NODO.PROTEZIONE_MCB, "SPD lato DC", { tensione: 600 });
  wm.aggiungiNodo("inverter_fv", TIPI_NODO.INVERTER, "Inverter FV", {
    tensione: 230, potenza: 6000
  });
  wm.aggiungiNodo("mcb_fv", TIPI_NODO.PROTEZIONE_MCB, "MCB uscita inverter 32A", {
    tensione: 230, In: 32, curva: "C"
  });
  wm.aggiungiNodo("contatore_prod", TIPI_NODO.SENSORE, "Contatore produzione", { tensione: 230 });
  wm.aggiungiNodo("rete_fv", TIPI_NODO.SORGENTE, "Rete 230V", { tensione: 230 });

  // Accumulo opzionale
  wm.aggiungiNodo("batteria", TIPI_NODO.ACCUMULO, "Batteria LFP", { tensione: 48 });
  wm.aggiungiNodo("bms", TIPI_NODO.COMANDO, "BMS", {});

  wm.aggiungiArco("pannelli", "sez_dc", "alimenta");
  wm.aggiungiArco("sez_dc", "spd_dc", "alimenta");
  wm.aggiungiArco("spd_dc", "inverter_fv", "alimenta");
  wm.aggiungiArco("inverter_fv", "mcb_fv", "alimenta");
  wm.aggiungiArco("mcb_fv", "contatore_prod", "alimenta");
  wm.aggiungiArco("contatore_prod", "rete_fv", "alimenta");
  wm.aggiungiArco("batteria", "inverter_fv", "alimenta");
  wm.aggiungiArco("bms", "batteria", "comanda");

  return wm;
}

function templateCaldaia() {
  var wm = new WorldModel();
  wm.tipo_impianto = "caldaia";
  wm.sistema = "monofase";
  wm.tensione_rete = TENSIONI.MONOFASE;

  wm.aggiungiNodo("alim_cald", TIPI_NODO.SORGENTE, "Alimentazione caldaia 230V", { tensione: 230 });
  wm.aggiungiNodo("scheda", TIPI_NODO.COMANDO, "Scheda elettronica caldaia", { tensione: 230 });
  wm.aggiungiNodo("termostato", TIPI_NODO.SENSORE, "Termostato ambiente", {});
  wm.aggiungiNodo("sonda_ntc", TIPI_NODO.SENSORE, "Sonda NTC mandata", {});
  wm.aggiungiNodo("sonda_ritorno", TIPI_NODO.SENSORE, "Sonda NTC ritorno", {});
  wm.aggiungiNodo("valvola_gas", TIPI_NODO.CARICO, "Valvola gas", { tensione: 230 });
  wm.aggiungiNodo("elettrodo", TIPI_NODO.CARICO, "Elettrodo accensione/rilevazione", {});
  wm.aggiungiNodo("ventilatore", TIPI_NODO.CARICO, "Ventilatore tiraggio forzato", { tensione: 230 });
  wm.aggiungiNodo("pompa", TIPI_NODO.CARICO, "Pompa circolatore", { tensione: 230 });
  wm.aggiungiNodo("pressostato", TIPI_NODO.SENSORE, "Pressostato acqua", {});

  wm.aggiungiArco("alim_cald", "scheda", "alimenta");
  wm.aggiungiArco("scheda", "valvola_gas", "comanda");
  wm.aggiungiArco("scheda", "elettrodo", "comanda");
  wm.aggiungiArco("scheda", "ventilatore", "comanda");
  wm.aggiungiArco("scheda", "pompa", "comanda");
  wm.aggiungiArco("termostato", "scheda", "misura");
  wm.aggiungiArco("sonda_ntc", "scheda", "misura");
  wm.aggiungiArco("sonda_ritorno", "scheda", "misura");
  wm.aggiungiArco("pressostato", "scheda", "misura");

  return wm;
}

// ============================================================================
// COSTRUZIONE DINAMICA DAL TESTO
// ============================================================================

// Mappa parole chiave → tipo impianto
var KEYWORD_IMPIANTO = {
  civile: ["casa", "appartamento", "condominio", "domestico", "civile", "abitazione", "villetta", "residenziale"],
  industriale: ["capannone", "fabbrica", "industriale", "officina", "laboratorio", "trifase", "motore"],
  fotovoltaico: ["fotovoltaico", "pannelli", "solare", "inverter solare", "stringa", "mppt", "accumulo", "batteria"],
  caldaia: ["caldaia", "boiler", "scaldabagno", "riscaldamento", "termostato", "fiamma", "gas"]
};

// Mappa componenti menzionati → nodi del world model
var MAPPA_COMPONENTI = {
  "differenziale": { nodoId: "rcd", tipo: TIPI_NODO.PROTEZIONE_DIFF },
  "salvavita": { nodoId: "rcd", tipo: TIPI_NODO.PROTEZIONE_DIFF },
  "rcd": { nodoId: "rcd", tipo: TIPI_NODO.PROTEZIONE_DIFF },
  "magnetotermico": { nodoId: "mcb", tipo: TIPI_NODO.PROTEZIONE_MCB },
  "interruttore": { nodoId: "gen", tipo: TIPI_NODO.PROTEZIONE_MCB },
  "generale": { nodoId: "gen", tipo: TIPI_NODO.PROTEZIONE_MCB },
  "quadro": { nodoId: "qg", tipo: TIPI_NODO.QUADRO },
  "lavatrice": { nodoId: "lavatrice", tipo: TIPI_NODO.CARICO },
  "forno": { nodoId: "cucina", tipo: TIPI_NODO.CARICO },
  "lavastoviglie": { nodoId: "cucina", tipo: TIPI_NODO.CARICO },
  "condizionatore": { nodoId: "clima", tipo: TIPI_NODO.CARICO },
  "climatizzatore": { nodoId: "clima", tipo: TIPI_NODO.CARICO },
  "luce": { nodoId: "luci", tipo: TIPI_NODO.CARICO },
  "luci": { nodoId: "luci", tipo: TIPI_NODO.CARICO },
  "lampada": { nodoId: "luci", tipo: TIPI_NODO.CARICO },
  "presa": { nodoId: "prese", tipo: TIPI_NODO.CARICO },
  "prese": { nodoId: "prese", tipo: TIPI_NODO.CARICO },
  "motore": { nodoId: "motore", tipo: TIPI_NODO.CARICO },
  "contattore": { nodoId: "cont_mot", tipo: TIPI_NODO.CONTATTORE },
  "caldaia": { nodoId: "scheda", tipo: TIPI_NODO.COMANDO },
  "boiler": { nodoId: "scheda", tipo: TIPI_NODO.COMANDO },
  "inverter": { nodoId: "inverter_fv", tipo: TIPI_NODO.INVERTER },
  "pannelli": { nodoId: "pannelli", tipo: TIPI_NODO.SORGENTE },
  "fotovoltaico": { nodoId: "pannelli", tipo: TIPI_NODO.SORGENTE },
  "batteria": { nodoId: "batteria", tipo: TIPI_NODO.ACCUMULO },
  "ups": { nodoId: "ups", tipo: TIPI_NODO.SORGENTE },
  "cavo": { nodoId: null, tipo: TIPI_NODO.CONDUTTORE },
  "morsetto": { nodoId: null, tipo: TIPI_NODO.GIUNZIONE },
  "terra": { nodoId: "terra", tipo: TIPI_NODO.CONDUTTORE },
  "neutro": { nodoId: null, tipo: TIPI_NODO.CONDUTTORE },
  "fusibile": { nodoId: null, tipo: TIPI_NODO.PROTEZIONE_FUSIBILE },
  "sezionatore": { nodoId: "sez", tipo: TIPI_NODO.SEZIONATORE },
  "trasformatore": { nodoId: null, tipo: TIPI_NODO.TRASFORMATORE },
  "rele": { nodoId: "rt_mot", tipo: TIPI_NODO.PROTEZIONE_TERMICA }
};

// Mappa keyword stato → stato nodo
var KEYWORD_STATO = {
  "scatta": STATI.SCATTATO,
  "scattato": STATI.SCATTATO,
  "interviene": STATI.SCATTATO,
  "intervenuto": STATI.SCATTATO,
  "aperto": STATI.APERTO,
  "ok": STATI.ALIMENTATO,
  "funziona": STATI.ALIMENTATO,
  "guasto": STATI.GUASTO,
  "rotto": STATI.GUASTO,
  "bruciato": STATI.GUASTO,
  "non funziona": STATI.GUASTO,
  "non parte": STATI.NON_ALIMENTATO,
  "spento": STATI.NON_ALIMENTATO,
  "buio": STATI.NON_ALIMENTATO,
  "senza tensione": STATI.NON_ALIMENTATO,
  "caldo": STATI.SURRISCALDAMENTO,
  "scalda": STATI.SURRISCALDAMENTO,
  "surriscaldamento": STATI.SURRISCALDAMENTO,
  "dispersione": STATI.DISPERSIONE,
  "cortocircuito": STATI.CORTOCIRCUITO,
  "sovraccarico": STATI.SOVRACCARICO
};

function costruisciDaCaseState(caseState) {
  if (!caseState) return templateCivileMonofase();

  var testo = normalizza(caseState.problem_summary || "");
  var componenti = caseState.components_detected || [];
  var fatti = caseState.facts_confirmed || [];
  var misure = caseState.measurements || [];

  // 1. Scegli template
  var tipoImpianto = riconosciTipoImpianto(testo);
  var wm;
  switch(tipoImpianto) {
    case "industriale": wm = templateTrifaseIndustriale(); break;
    case "fotovoltaico": wm = templateFotovoltaico(); break;
    case "caldaia": wm = templateCaldaia(); break;
    default: wm = templateCivileMonofase(); break;
  }

  // 2. Marca nodi menzionati
  for (var i = 0; i < componenti.length; i++) {
    var comp = normalizza(componenti[i]);
    var mapping = MAPPA_COMPONENTI[comp];
    if (mapping && mapping.nodoId && wm.nodi[mapping.nodoId]) {
      wm.nodi[mapping.nodoId].menzionato = true;
    } else {
      // Cerca match parziale
      for (var id in wm.nodi) {
        if (normalizza(wm.nodi[id].nome).indexOf(comp) >= 0) {
          wm.nodi[id].menzionato = true;
          break;
        }
      }
    }
  }

  // 3. Applica stati dai fatti confermati
  for (var f = 0; f < fatti.length; f++) {
    var fatto = normalizza(fatti[f]);
    applicaStatoDaFatto(wm, fatto);
  }

  // 4. Registra misure
  for (var m = 0; m < misure.length; m++) {
    var misura = typeof misure[m] === "string" ? parseMisura(misure[m]) : misure[m];
    if (misura) {
      wm.misure_registrate.push(misura);
      applicaMisura(wm, misura);
    }
  }

  // 5. Propaga stati — se una protezione è scattata, tutto a valle è non alimentato
  propagaStati(wm);

  return wm;
}

// ============================================================================
// PROPAGAZIONE STATI — Il cuore fisico del world model
// ============================================================================

function propagaStati(wm) {
  // Parti dalla sorgente e propaga alimentazione
  var sorgenti = wm.nodiPerTipo(TIPI_NODO.SORGENTE);

  // Prima: tutte le sorgenti sono alimentate
  for (var s = 0; s < sorgenti.length; s++) {
    if (sorgenti[s].stato === STATI.SCONOSCIUTO) {
      sorgenti[s].stato = STATI.ALIMENTATO;
    }
  }

  // BFS dalla sorgente
  for (var si = 0; si < sorgenti.length; si++) {
    var coda = [sorgenti[si].id];
    var visitati = {};

    while (coda.length > 0) {
      var corrente = coda.shift();
      if (visitati[corrente]) continue;
      visitati[corrente] = true;

      var nodo = wm.nodi[corrente];
      if (!nodo) continue;

      var figli = wm.aValle(corrente);
      for (var c = 0; c < figli.length; c++) {
        var figlio = figli[c];

        // Se il nodo corrente è aperto/scattato → figlio non alimentato
        if (nodo.stato === STATI.SCATTATO || nodo.stato === STATI.APERTO) {
          if (figlio.stato === STATI.SCONOSCIUTO) {
            figlio.stato = STATI.NON_ALIMENTATO;
          }
        }
        // Se il nodo corrente è alimentato → figlio probabilmente alimentato
        else if (nodo.stato === STATI.ALIMENTATO || nodo.stato === STATI.CHIUSO) {
          if (figlio.stato === STATI.SCONOSCIUTO) {
            figlio.stato = STATI.ALIMENTATO;
          }
        }
        // Se il nodo corrente non è alimentato → figlio nemmeno
        else if (nodo.stato === STATI.NON_ALIMENTATO) {
          if (figlio.stato === STATI.SCONOSCIUTO) {
            figlio.stato = STATI.NON_ALIMENTATO;
          }
        }

        coda.push(figlio.id);
      }
    }
  }
}

// ============================================================================
// SIMULAZIONE — Cosa succede se cambio uno stato?
// ============================================================================

function simula(wm, nodoId, nuovoStato) {
  var nodo = wm.nodi[nodoId];
  if (!nodo) return { errore: "nodo non trovato", previsioni: [] };

  // Salva stato precedente
  var statoPrecedente = nodo.stato;

  // Applica il nuovo stato
  nodo.stato = nuovoStato;

  // Calcola conseguenze
  var previsioni = [];

  if (nuovoStato === STATI.SCATTATO || nuovoStato === STATI.APERTO) {
    // Tutto a valle perde tensione
    var disc = wm.discendenti(nodoId);
    for (var i = 0; i < disc.length; i++) {
      previsioni.push({
        nodo_id: disc[i].id,
        nodo_nome: disc[i].nome,
        stato_previsto: STATI.NON_ALIMENTATO,
        confidenza: 0.95,
        osservabile: disc[i].nome + " senza tensione",
        misura_attesa: { grandezza: "tensione", valore: 0, unita: "V" }
      });
    }
  }

  if (nuovoStato === STATI.DISPERSIONE) {
    // Cerca RCD a monte — deve scattare
    var antenati = wm.antenati(nodoId);
    for (var a = 0; a < antenati.length; a++) {
      if (antenati[a].tipo === TIPI_NODO.PROTEZIONE_DIFF) {
        previsioni.push({
          nodo_id: antenati[a].id,
          nodo_nome: antenati[a].nome,
          stato_previsto: STATI.SCATTATO,
          confidenza: 0.9,
          osservabile: antenati[a].nome + " scatta per corrente di dispersione",
          misura_attesa: { grandezza: "isolamento", valore_max: 0.5, unita: "MΩ" }
        });
        break;
      }
    }
  }

  if (nuovoStato === STATI.CORTOCIRCUITO) {
    // Cerca MCB a monte — deve scattare
    var antenati2 = wm.antenati(nodoId);
    for (var b = 0; b < antenati2.length; b++) {
      if (antenati2[b].tipo === TIPI_NODO.PROTEZIONE_MCB) {
        previsioni.push({
          nodo_id: antenati2[b].id,
          nodo_nome: antenati2[b].nome,
          stato_previsto: STATI.SCATTATO,
          confidenza: 0.95,
          osservabile: antenati2[b].nome + " interviene per cortocircuito",
          misura_attesa: { grandezza: "resistenza", valore_max: 1, unita: "Ω" }
        });
        break;
      }
    }
  }

  if (nuovoStato === STATI.SOVRACCARICO) {
    // Relè termico o MCB a monte
    var antenati3 = wm.antenati(nodoId);
    for (var c = 0; c < antenati3.length; c++) {
      if (antenati3[c].tipo === TIPI_NODO.PROTEZIONE_TERMICA ||
          antenati3[c].tipo === TIPI_NODO.PROTEZIONE_MCB) {
        previsioni.push({
          nodo_id: antenati3[c].id,
          nodo_nome: antenati3[c].nome,
          stato_previsto: STATI.SCATTATO,
          confidenza: 0.8,
          osservabile: antenati3[c].nome + " interviene per sovraccarico (dopo tempo)",
          misura_attesa: { grandezza: "corrente", valore_min: antenati3[c].protezione ? antenati3[c].protezione.In : 16, unita: "A" }
        });
        break;
      }
    }
  }

  if (nuovoStato === STATI.SURRISCALDAMENTO) {
    previsioni.push({
      nodo_id: nodoId,
      nodo_nome: nodo.nome,
      stato_previsto: STATI.SURRISCALDAMENTO,
      confidenza: 0.85,
      osservabile: "calore anomalo su " + nodo.nome + " — possibile connessione lenta o sovraccarico",
      misura_attesa: { grandezza: "temperatura", valore_min: 60, unita: "°C" }
    });
  }

  // Ripristina stato (la simulazione non deve modificare il modello permanentemente)
  nodo.stato = statoPrecedente;

  return {
    nodo: nodoId,
    stato_simulato: nuovoStato,
    previsioni: previsioni
  };
}

// ============================================================================
// CONFRONTO ATTESO VS REALE
// ============================================================================

function confrontaAttesoReale(wm) {
  var discrepanze = [];

  for (var id in wm.nodi) {
    var nodo = wm.nodi[id];

    // Controlla tensione
    if (nodo.elettrici.tensione_attesa !== null && nodo.elettrici.tensione_misurata !== null) {
      var attesa = nodo.elettrici.tensione_attesa;
      var misurata = nodo.elettrici.tensione_misurata;
      var tolleranza = attesa * 0.1; // ±10%

      if (nodo.stato === STATI.ALIMENTATO && misurata < attesa - tolleranza) {
        discrepanze.push({
          nodo_id: id,
          nodo_nome: nodo.nome,
          tipo: "sottotensione",
          atteso: attesa,
          misurato: misurata,
          delta: misurata - attesa,
          gravita: misurata < attesa * 0.5 ? "alta" : "media",
          possibili_cause: ["caduta di tensione su conduttore", "neutro degradato", "carico eccessivo a monte"]
        });
      }

      if (nodo.stato === STATI.NON_ALIMENTATO && misurata > 50) {
        discrepanze.push({
          nodo_id: id,
          nodo_nome: nodo.nome,
          tipo: "tensione_inattesa",
          atteso: 0,
          misurato: misurata,
          delta: misurata,
          gravita: misurata > 100 ? "alta" : "media",
          possibili_cause: ["ritorno di tensione da altro circuito", "tensione fantasma", "protezione non ha realmente aperto"]
        });
      }

      if (nodo.stato === STATI.ALIMENTATO && misurata > attesa + tolleranza) {
        discrepanze.push({
          nodo_id: id,
          nodo_nome: nodo.nome,
          tipo: "sovratensione",
          atteso: attesa,
          misurato: misurata,
          delta: misurata - attesa,
          gravita: misurata > attesa * 1.2 ? "alta" : "bassa",
          possibili_cause: ["neutro interrotto (trifase)", "sovratensione da rete", "errore misura"]
        });
      }
    }

    // Controlla corrente
    if (nodo.elettrici.corrente_nominale !== null && nodo.elettrici.corrente_attuale !== null) {
      var Inom = nodo.elettrici.corrente_nominale;
      var Iatt = nodo.elettrici.corrente_attuale;

      if (Iatt > Inom * 1.15) {
        discrepanze.push({
          nodo_id: id,
          nodo_nome: nodo.nome,
          tipo: "sovracorrente",
          atteso: Inom,
          misurato: Iatt,
          delta: Iatt - Inom,
          gravita: Iatt > Inom * 1.5 ? "alta" : "media",
          possibili_cause: ["carico eccessivo", "avvolgimento in cortocircuito parziale", "tensione bassa → corrente compensatoria"]
        });
      }
    }

    // Controlla coerenza stato
    if (nodo.stato === STATI.ALIMENTATO && nodo.verificato) {
      // Controlla che i figli siano coerenti
      var figli = wm.aValle(id);
      for (var f = 0; f < figli.length; f++) {
        if (figli[f].stato === STATI.NON_ALIMENTATO && figli[f].verificato) {
          discrepanze.push({
            nodo_id: figli[f].id,
            nodo_nome: figli[f].nome,
            tipo: "discontinuita",
            atteso: "alimentato (monte alimentato)",
            misurato: "non alimentato",
            gravita: "alta",
            possibili_cause: ["protezione scattata non rilevata", "conduttore interrotto", "morsetto aperto", "fusibile intervenuto"]
          });
        }
      }
    }
  }

  return discrepanze;
}

// ============================================================================
// LOCALIZZAZIONE GUASTO — Dove nasce il problema?
// ============================================================================

function localizzaGuasto(wm) {
  var candidati = [];

  // 1. Trova nodi non alimentati con monte alimentato
  for (var id in wm.nodi) {
    var nodo = wm.nodi[id];
    if (nodo.stato === STATI.NON_ALIMENTATO || nodo.stato === STATI.GUASTO) {
      var monteAlimentato = false;
      var padri = wm.aMonte(id);
      for (var p = 0; p < padri.length; p++) {
        if (padri[p].stato === STATI.ALIMENTATO || padri[p].stato === STATI.CHIUSO) {
          monteAlimentato = true;
          break;
        }
      }
      if (monteAlimentato) {
        candidati.push({
          nodo_id: id,
          nodo_nome: nodo.nome,
          tipo_nodo: nodo.tipo,
          ragione: "non alimentato con monte alimentato — il guasto è qui o tra monte e questo punto",
          confidenza: 0.85,
          verifiche: generaVerifiche(nodo)
        });
      }
    }
  }

  // 2. Trova protezioni scattate
  for (var id2 in wm.nodi) {
    var nodo2 = wm.nodi[id2];
    if (nodo2.stato === STATI.SCATTATO) {
      var valleGiusti = wm.discendenti(id2);
      candidati.push({
        nodo_id: id2,
        nodo_nome: nodo2.nome,
        tipo_nodo: nodo2.tipo,
        ragione: "protezione scattata — il guasto è a valle",
        confidenza: 0.9,
        zona_guasto: valleGiusti.map(function(n) { return n.nome; }),
        verifiche: generaVerifiche(nodo2)
      });
    }
  }

  // 3. Nodi con anomalie
  for (var id3 in wm.nodi) {
    var nodo3 = wm.nodi[id3];
    if (nodo3.stato === STATI.SURRISCALDAMENTO || nodo3.stato === STATI.DISPERSIONE ||
        nodo3.stato === STATI.CORTOCIRCUITO || nodo3.stato === STATI.SOVRACCARICO) {
      candidati.push({
        nodo_id: id3,
        nodo_nome: nodo3.nome,
        tipo_nodo: nodo3.tipo,
        ragione: "anomalia diretta: " + nodo3.stato,
        confidenza: 0.95,
        verifiche: generaVerifiche(nodo3)
      });
    }
  }

  // Ordina per confidenza
  candidati.sort(function(a, b) { return b.confidenza - a.confidenza; });

  return candidati;
}

// ============================================================================
// MISURA PIÙ DISCRIMINANTE — Quale test riduce più incertezza?
// ============================================================================

function misuraPiuDiscriminante(wm) {
  var suggerimenti = [];
  var nodiSconosciuti = [];

  for (var id in wm.nodi) {
    if (wm.nodi[id].stato === STATI.SCONOSCIUTO && !wm.nodi[id].verificato) {
      nodiSconosciuti.push(wm.nodi[id]);
    }
  }

  // Priorità: nodi tra un monte alimentato e un valle non alimentato
  for (var i = 0; i < nodiSconosciuti.length; i++) {
    var nodo = nodiSconosciuti[i];
    var padri = wm.aMonte(nodo.id);
    var figli = wm.aValle(nodo.id);

    var monteAlimentato = false;
    var valleProblematico = false;

    for (var p = 0; p < padri.length; p++) {
      if (padri[p].stato === STATI.ALIMENTATO) monteAlimentato = true;
    }
    for (var f = 0; f < figli.length; f++) {
      if (figli[f].stato === STATI.NON_ALIMENTATO || figli[f].stato === STATI.GUASTO) {
        valleProblematico = true;
      }
    }

    if (monteAlimentato && valleProblematico) {
      suggerimenti.push({
        nodo_id: nodo.id,
        nodo_nome: nodo.nome,
        misura: "tensione",
        punto: nodo.nome,
        perche: "è tra un punto alimentato e un punto non alimentato — la misura qui localizza il guasto",
        discriminazione: 0.95
      });
    } else if (monteAlimentato) {
      suggerimenti.push({
        nodo_id: nodo.id,
        nodo_nome: nodo.nome,
        misura: "tensione",
        punto: nodo.nome,
        perche: "stato sconosciuto con monte alimentato — confermare se arriva tensione",
        discriminazione: 0.7
      });
    }
  }

  // Se ci sono protezioni scattate, suggerisci misura isolamento a valle
  var protScattate = [];
  for (var id2 in wm.nodi) {
    if (wm.nodi[id2].stato === STATI.SCATTATO) protScattate.push(wm.nodi[id2]);
  }

  for (var s = 0; s < protScattate.length; s++) {
    var prot = protScattate[s];
    if (prot.tipo === TIPI_NODO.PROTEZIONE_DIFF) {
      suggerimenti.push({
        nodo_id: prot.id,
        nodo_nome: prot.nome,
        misura: "isolamento",
        punto: "a valle del " + prot.nome,
        perche: "differenziale scattato — misurare isolamento per trovare la dispersione",
        discriminazione: 0.9
      });
    }
    if (prot.tipo === TIPI_NODO.PROTEZIONE_MCB) {
      suggerimenti.push({
        nodo_id: prot.id,
        nodo_nome: prot.nome,
        misura: "resistenza",
        punto: "tra le fasi a valle del " + prot.nome,
        perche: "magnetotermico scattato — misurare se c'è cortocircuito",
        discriminazione: 0.85
      });
    }
  }

  // Ordina per discriminazione
  suggerimenti.sort(function(a, b) { return b.discriminazione - a.discriminazione; });

  return suggerimenti;
}

// ============================================================================
// GENERA VERIFICHE PER UN NODO
// ============================================================================

function generaVerifiche(nodo) {
  var verifiche = [];

  switch(nodo.tipo) {
    case TIPI_NODO.PROTEZIONE_DIFF:
      verifiche.push("premere tasto test differenziale");
      verifiche.push("misurare isolamento a valle con megger");
      verifiche.push("misurare corrente dispersione con pinza differenziale");
      break;
    case TIPI_NODO.PROTEZIONE_MCB:
      verifiche.push("verificare se il magnetotermico si riarma");
      verifiche.push("misurare resistenza tra le fasi a valle");
      verifiche.push("misurare corrente assorbita dal circuito");
      break;
    case TIPI_NODO.CONDUTTORE:
      verifiche.push("misurare continuità del conduttore");
      verifiche.push("misurare isolamento verso terra");
      verifiche.push("ispezionare visivamente per danni");
      break;
    case TIPI_NODO.GIUNZIONE:
      verifiche.push("controllare serraggio morsetti");
      verifiche.push("misurare caduta di tensione sotto carico");
      verifiche.push("ispezionare per segni di surriscaldamento");
      break;
    case TIPI_NODO.CARICO:
      verifiche.push("misurare tensione ai morsetti del carico");
      verifiche.push("misurare corrente assorbita");
      verifiche.push("provare con altro carico funzionante noto");
      break;
    case TIPI_NODO.CONTATTORE:
      verifiche.push("misurare tensione sulla bobina");
      verifiche.push("misurare continuità dei contatti");
      verifiche.push("verificare comando (pulsante/PLC)");
      break;
    case TIPI_NODO.INVERTER:
      verifiche.push("leggere codice errore sul display");
      verifiche.push("misurare tensione stringa DC in ingresso");
      verifiche.push("misurare tensione AC in uscita");
      break;
    default:
      verifiche.push("misurare tensione");
      verifiche.push("ispezionare visivamente");
      break;
  }

  return verifiche;
}

// ============================================================================
// SNAPSHOT — Stato completo del world model per il brain
// ============================================================================

function snapshot(wm) {
  var stati = {};
  var problemi = [];
  var alimentati = 0;
  var nonAlimentati = 0;
  var sconosciuti = 0;

  for (var id in wm.nodi) {
    var n = wm.nodi[id];
    stati[id] = { nome: n.nome, tipo: n.tipo, stato: n.stato, menzionato: n.menzionato };
    if (n.stato === STATI.ALIMENTATO || n.stato === STATI.CHIUSO) alimentati++;
    else if (n.stato === STATI.NON_ALIMENTATO) nonAlimentati++;
    else if (n.stato === STATI.SCONOSCIUTO) sconosciuti++;
    if (n.stato === STATI.GUASTO || n.stato === STATI.SCATTATO ||
        n.stato === STATI.DISPERSIONE || n.stato === STATI.CORTOCIRCUITO ||
        n.stato === STATI.SOVRACCARICO || n.stato === STATI.SURRISCALDAMENTO) {
      problemi.push({ id: id, nome: n.nome, stato: n.stato });
    }
  }

  return {
    tipo_impianto: wm.tipo_impianto,
    sistema: wm.sistema,
    tensione_rete: wm.tensione_rete,
    totale_nodi: wm.contaNodi(),
    totale_archi: wm.contaArchi(),
    alimentati: alimentati,
    non_alimentati: nonAlimentati,
    sconosciuti: sconosciuti,
    problemi: problemi,
    discrepanze: confrontaAttesoReale(wm),
    candidati_guasto: localizzaGuasto(wm),
    misura_suggerita: misuraPiuDiscriminante(wm)[0] || null
  };
}

// ============================================================================
// AGGIORNA MODELLO CON NUOVA INFORMAZIONE
// ============================================================================

function aggiorna(wm, informazione) {
  if (!informazione) return wm;

  // Nuovo fatto
  if (informazione.fatto) {
    applicaStatoDaFatto(wm, normalizza(informazione.fatto));
    propagaStati(wm);
  }

  // Nuova misura
  if (informazione.misura) {
    var m = typeof informazione.misura === "string" ? parseMisura(informazione.misura) : informazione.misura;
    if (m) {
      wm.misure_registrate.push(m);
      applicaMisura(wm, m);
    }
  }

  // Nuovo componente scoperto
  if (informazione.componente) {
    var comp = normalizza(informazione.componente);
    var mapping = MAPPA_COMPONENTI[comp];
    if (mapping && mapping.nodoId && wm.nodi[mapping.nodoId]) {
      wm.nodi[mapping.nodoId].menzionato = true;
    }
  }

  return wm;
}

// ============================================================================
// UTILITY
// ============================================================================

function normalizza(testo) {
  if (!testo) return "";
  return testo.toLowerCase()
    .replace(/[àáâãä]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u");
}

function riconosciTipoImpianto(testo) {
  var keys = Object.keys(KEYWORD_IMPIANTO);
  var scores = {};
  for (var i = 0; i < keys.length; i++) {
    scores[keys[i]] = 0;
    var kw = KEYWORD_IMPIANTO[keys[i]];
    for (var j = 0; j < kw.length; j++) {
      if (testo.indexOf(kw[j]) >= 0) scores[keys[i]]++;
    }
  }
  var best = "civile";
  var bestScore = 0;
  for (var k in scores) {
    if (scores[k] > bestScore) { bestScore = scores[k]; best = k; }
  }
  return best;
}

function applicaStatoDaFatto(wm, fatto) {
  // Cerca componente + stato nel fatto
  var keys = Object.keys(KEYWORD_STATO);
  var statoTrovato = null;
  for (var s = 0; s < keys.length; s++) {
    if (fatto.indexOf(keys[s]) >= 0) {
      statoTrovato = KEYWORD_STATO[keys[s]];
      break;
    }
  }

  if (!statoTrovato) return;

  // Cerca a quale nodo applicare
  for (var id in wm.nodi) {
    var nomeNodo = normalizza(wm.nodi[id].nome);
    if (fatto.indexOf(normalizza(wm.nodi[id].id)) >= 0 || fatto.indexOf(nomeNodo) >= 0) {
      wm.nodi[id].stato = statoTrovato;
      wm.nodi[id].verificato = true;
      return;
    }
  }

  // Match per keyword componente
  var compKeys = Object.keys(MAPPA_COMPONENTI);
  for (var c = 0; c < compKeys.length; c++) {
    if (fatto.indexOf(compKeys[c]) >= 0) {
      var mapping = MAPPA_COMPONENTI[compKeys[c]];
      if (mapping.nodoId && wm.nodi[mapping.nodoId]) {
        wm.nodi[mapping.nodoId].stato = statoTrovato;
        wm.nodi[mapping.nodoId].verificato = true;
        return;
      }
    }
  }
}

function parseMisura(testo) {
  if (!testo) return null;
  var t = normalizza(testo);

  // Pattern: "230V", "tensione: 230V", "15.5A", "isolamento: 2MΩ"
  var match = t.match(/(\d+[\.,]?\d*)\s*(v|volt|a|ampere|amp|ma|mohm|mω|ohm|Ω|kω|kohm|w|kw|mΩ)/i);
  if (match) {
    var valore = parseFloat(match[1].replace(",", "."));
    var unita = match[2].toLowerCase();

    // Normalizza unità
    if (unita === "volt" || unita === "v") unita = "V";
    else if (unita === "ampere" || unita === "amp" || unita === "a") unita = "A";
    else if (unita === "ma") { unita = "A"; valore = valore / 1000; }
    else if (unita === "mohm" || unita === "mω") unita = "MΩ";
    else if (unita === "ohm" || unita === "Ω") unita = "Ω";

    var grandezza = "sconosciuta";
    if (unita === "V") grandezza = "tensione";
    else if (unita === "A") grandezza = "corrente";
    else if (unita === "MΩ" || unita === "Ω") grandezza = "resistenza";
    else if (unita === "W" || unita === "kW") grandezza = "potenza";

    return {
      grandezza: grandezza,
      valore: valore,
      unita: unita,
      timestamp: Date.now()
    };
  }

  return null;
}

function applicaMisura(wm, misura) {
  if (!misura || !misura.punto) return;

  var nodo = wm.nodi[misura.punto] || wm.trovaNodoPerNome(misura.punto);
  if (!nodo) return;

  if (misura.grandezza === "tensione") {
    nodo.elettrici.tensione_misurata = misura.valore;
    if (misura.valore > 50) {
      nodo.stato = STATI.ALIMENTATO;
    } else if (misura.valore < 1) {
      nodo.stato = STATI.NON_ALIMENTATO;
    }
    nodo.verificato = true;
  }

  if (misura.grandezza === "corrente") {
    nodo.elettrici.corrente_attuale = misura.valore;
    nodo.verificato = true;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Costruzione
  costruisciDaCaseState: costruisciDaCaseState,
  WorldModel: WorldModel,

  // Templates
  templateCivileMonofase: templateCivileMonofase,
  templateTrifaseIndustriale: templateTrifaseIndustriale,
  templateFotovoltaico: templateFotovoltaico,
  templateCaldaia: templateCaldaia,

  // Simulazione
  simula: simula,
  propagaStati: propagaStati,

  // Analisi
  confrontaAttesoReale: confrontaAttesoReale,
  localizzaGuasto: localizzaGuasto,
  misuraPiuDiscriminante: misuraPiuDiscriminante,
  snapshot: snapshot,

  // Aggiornamento
  aggiorna: aggiorna,

  // Utility
  parseMisura: parseMisura,
  generaVerifiche: generaVerifiche,

  // Costanti
  TIPI_NODO: TIPI_NODO,
  STATI: STATI,
  TENSIONI: TENSIONI
};
