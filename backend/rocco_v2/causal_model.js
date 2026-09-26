"use strict";

// ============================================================
// MODELLO CAUSALE DINAMICO + RAGIONAMENTO CONTROFATTUALE
// ============================================================
//
// IMMAGINAZIONE TECNICA: la capacità di costruire mentalmente
// possibilità non ancora osservate e verificarne le conseguenze.
//
// "Non ho mai visto questo problema, ma posso capire cosa
//  potrebbe produrlo."
//
// Il modello causale è un grafo: componente → relazione → componente.
// Ogni nodo ha uno stato. Ogni relazione propaga conseguenze.
// Il ragionamento controfattuale chiede:
//   "Se X fosse la causa, cosa dovrei osservare?"
// e confronta la previsione con la realtà.
//
// ============================================================

// ====== UTILITÀ ======

function s(v) { return String(v == null ? "" : v).trim(); }
function arr(v) { return Array.isArray(v) ? v : []; }

function normalize(text) {
  return s(text).toLowerCase()
    .replace(/[àáâã]/g, "a").replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i").replace(/[òóôõ]/g, "o").replace(/[ùúûü]/g, "u")
    .replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

// ============================================================
// A. CONCETTI ELEMENTARI — mattoni del ragionamento
// ============================================================
//
// Non sono pattern. Sono LEGGI che ROCCO combina per capire
// qualsiasi sistema, anche uno che non ha mai visto.

var CONCETTI = [
  { id: "energia",       legge: "Si conserva. Se non arriva al carico, va altrove: dispersione, calore, perdita." },
  { id: "tensione",      legge: "V = R × I. Differenza di potenziale causa flusso di corrente." },
  { id: "corrente",      legge: "I = V / R. Fluisce solo in circuito chiuso. Se circuito aperto: I = 0." },
  { id: "impedenza",     legge: "R si oppone al flusso. R alta = I bassa. R anomala = guasto." },
  { id: "continuita",    legge: "Circuito chiuso = corrente fluisce. Aperto = I = 0, carico morto." },
  { id: "isolamento",    legge: "R tra conduttore e terra. Se basso: corrente fugge verso terra." },
  { id: "effetto_joule", legge: "P = R × I². Calore proporzionale a R e a I². Contatto allentato = R alta = calore." },
  { id: "kirchhoff",     legge: "Somma correnti in un nodo = 0. Se Delta_I != 0: corrente dispersa." },
  { id: "protezione",    legge: "Dispositivo che interrompe il circuito in condizione anomala." },
  { id: "causa_effetto", legge: "Ogni fenomeno osservabile ha una causa fisica. La causa precede l'effetto." },
  { id: "conservazione", legge: "Energia e carica si conservano. Nulla sparisce: si trasforma o si disperde." },
  { id: "campo",         legge: "Corrente genera campo magnetico. Squilibrio = forza/vibrazione anomala." },
  { id: "retroazione",   legge: "L'uscita influenza l'ingresso. Feedback positivo = instabilita. Negativo = regolazione." }
];

// ============================================================
// B. GRAFO — struttura del sistema
// ============================================================

function creaNodo(id, tipo, nome, proprietà) {
  return {
    id: s(id),
    tipo: s(tipo),       // sorgente | protezione_diff | protezione_mcb | conduttore | carico | comando | sensore
    nome: s(nome),
    stato: "sconosciuto", // operativo | guasto | aperto | scattato | dispersione | cortocircuito | sovraccarico | senza_tensione | sconosciuto
    proprieta: proprietà || {}
  };
}

function creaArco(da, a, relazione) {
  return { da: s(da), a: s(a), relazione: s(relazione) };
  // relazioni: alimenta | protegge | comanda | trasforma | misura | dipende_da
}

function creaGrafo(nodi, archi) {
  return { nodi: nodi || {}, archi: arr(archi) };
}

// Trova nodi a valle di un nodo dato
function aValle(grafo, nodoId) {
  var risultato = [];
  arr(grafo.archi).forEach(function(a) {
    if (a.da === nodoId && grafo.nodi[a.a]) {
      risultato.push({ nodo: grafo.nodi[a.a], relazione: a.relazione });
    }
  });
  return risultato;
}

// Trova nodi a monte di un nodo dato
function aMonte(grafo, nodoId) {
  var risultato = [];
  arr(grafo.archi).forEach(function(a) {
    if (a.a === nodoId && grafo.nodi[a.da]) {
      risultato.push({ nodo: grafo.nodi[a.da], relazione: a.relazione });
    }
  });
  return risultato;
}

// Trova tutti i nodi di un certo tipo
function nodiPerTipo(grafo, tipoRegex) {
  var risultato = [];
  Object.keys(grafo.nodi).forEach(function(id) {
    if (tipoRegex.test(grafo.nodi[id].tipo)) risultato.push(grafo.nodi[id]);
  });
  return risultato;
}

// Trova tutti i nodi a valle ricorsivamente (discendenti)
function discendenti(grafo, nodoId, visitati) {
  var vis = visitati || {};
  if (vis[nodoId]) return [];
  vis[nodoId] = true;
  var risultato = [];
  aValle(grafo, nodoId).forEach(function(item) {
    risultato.push(item.nodo);
    risultato = risultato.concat(discendenti(grafo, item.nodo.id, vis));
  });
  return risultato;
}

// Trova tutti i nodi a monte ricorsivamente (antenati)
function antenati(grafo, nodoId, visitati) {
  var vis = visitati || {};
  if (vis[nodoId]) return [];
  vis[nodoId] = true;
  var risultato = [];
  aMonte(grafo, nodoId).forEach(function(item) {
    risultato.push(item.nodo);
    risultato = risultato.concat(antenati(grafo, item.nodo.id, vis));
  });
  return risultato;
}

// ============================================================
// C. TEMPLATE — topologie di impianto standard
// ============================================================

function templateCivileMonofase() {
  var nodi = {};
  nodi.rete = creaNodo("rete", "sorgente", "Rete 230V 50Hz");
  nodi.generale = creaNodo("generale", "protezione_mcb", "Interruttore generale");
  nodi.rcd = creaNodo("rcd", "protezione_diff", "Differenziale 30mA");
  nodi.mcb_luci = creaNodo("mcb_luci", "protezione_mcb", "MCB luci 10A");
  nodi.mcb_prese = creaNodo("mcb_prese", "protezione_mcb", "MCB prese 16A");
  nodi.mcb_cucina = creaNodo("mcb_cucina", "protezione_mcb", "MCB cucina 16A");
  nodi.mcb_bagno = creaNodo("mcb_bagno", "protezione_mcb", "MCB bagno 16A");
  nodi.luci = creaNodo("luci", "carico", "Circuito luci");
  nodi.prese = creaNodo("prese", "carico", "Circuito prese");
  nodi.cucina = creaNodo("cucina", "carico", "Circuito cucina");
  nodi.bagno = creaNodo("bagno", "carico", "Circuito bagno");
  var archi = [
    creaArco("rete", "generale", "alimenta"),
    creaArco("generale", "rcd", "alimenta"),
    creaArco("rcd", "mcb_luci", "protegge"),
    creaArco("rcd", "mcb_prese", "protegge"),
    creaArco("rcd", "mcb_cucina", "protegge"),
    creaArco("rcd", "mcb_bagno", "protegge"),
    creaArco("mcb_luci", "luci", "alimenta"),
    creaArco("mcb_prese", "prese", "alimenta"),
    creaArco("mcb_cucina", "cucina", "alimenta"),
    creaArco("mcb_bagno", "bagno", "alimenta")
  ];
  return creaGrafo(nodi, archi);
}

function templateMotoreTrifase() {
  var nodi = {};
  nodi.rete3f = creaNodo("rete3f", "sorgente", "Rete trifase 400V");
  nodi.sezionatore = creaNodo("sezionatore", "protezione_mcb", "Sezionatore generale");
  nodi.mcb_motore = creaNodo("mcb_motore", "protezione_mcb", "MCB motore");
  nodi.rele_termico = creaNodo("rele_termico", "protezione_termica", "Rele termico");
  nodi.contattore = creaNodo("contattore", "comando", "Contattore di potenza");
  nodi.cavo_motore = creaNodo("cavo_motore", "conduttore", "Cavo motore");
  nodi.motore = creaNodo("motore", "carico", "Motore trifase");
  nodi.comando = creaNodo("comando", "comando", "Circuito di comando");
  var archi = [
    creaArco("rete3f", "sezionatore", "alimenta"),
    creaArco("sezionatore", "mcb_motore", "alimenta"),
    creaArco("mcb_motore", "rele_termico", "protegge"),
    creaArco("rele_termico", "contattore", "alimenta"),
    creaArco("contattore", "cavo_motore", "alimenta"),
    creaArco("cavo_motore", "motore", "alimenta"),
    creaArco("comando", "contattore", "comanda")
  ];
  return creaGrafo(nodi, archi);
}

function templateCaldaia() {
  var nodi = {};
  nodi.alimentazione = creaNodo("alimentazione", "sorgente", "Alimentazione caldaia 230V");
  nodi.scheda = creaNodo("scheda", "comando", "Scheda elettronica caldaia");
  nodi.termostato = creaNodo("termostato", "sensore", "Termostato ambiente");
  nodi.sonda_ntc = creaNodo("sonda_ntc", "sensore", "Sonda NTC temperatura");
  nodi.valvola_gas = creaNodo("valvola_gas", "carico", "Valvola gas");
  nodi.elettrodo = creaNodo("elettrodo", "carico", "Elettrodo accensione");
  nodi.ventilatore = creaNodo("ventilatore", "carico", "Ventilatore caldaia");
  nodi.pompa = creaNodo("pompa", "carico", "Pompa circolazione");
  var archi = [
    creaArco("alimentazione", "scheda", "alimenta"),
    creaArco("termostato", "scheda", "misura"),
    creaArco("sonda_ntc", "scheda", "misura"),
    creaArco("scheda", "valvola_gas", "comanda"),
    creaArco("scheda", "elettrodo", "comanda"),
    creaArco("scheda", "ventilatore", "comanda"),
    creaArco("scheda", "pompa", "comanda")
  ];
  return creaGrafo(nodi, archi);
}

function templateGenerico() {
  var nodi = {};
  nodi.sorgente = creaNodo("sorgente", "sorgente", "Alimentazione");
  nodi.protezione = creaNodo("protezione", "protezione_mcb", "Protezione");
  nodi.conduttore = creaNodo("conduttore", "conduttore", "Conduttore");
  nodi.carico = creaNodo("carico", "carico", "Carico");
  var archi = [
    creaArco("sorgente", "protezione", "alimenta"),
    creaArco("protezione", "conduttore", "alimenta"),
    creaArco("conduttore", "carico", "alimenta")
  ];
  return creaGrafo(nodi, archi);
}

// ============================================================
// D. COSTRUZIONE DINAMICA — dal testo al grafo
// ============================================================

// Mappa componenti menzionati → nodi nel template
var MAPPA_COMPONENTI = {
  "differenziale": "rcd", "rcd": "rcd", "salvavita": "rcd", "rcbo": "rcd",
  "magnetotermico": "mcb_*", "mcb": "mcb_*", "automatico": "mcb_*",
  "generale": "generale", "interruttore generale": "generale", "sezionatore": "sezionatore",
  "forno": "cucina", "lavatrice": "bagno", "lavastoviglie": "cucina",
  "scaldabagno": "bagno", "boiler": "bagno",
  "condizionatore": "prese", "frigorifero": "cucina",
  "motore": "motore", "contattore": "contattore",
  "caldaia": "scheda", "termostato": "termostato",
  "lampada": "luci", "lampadario": "luci", "faretto": "luci", "luce": "luci",
  "presa": "prese", "ciabatta": "prese"
};

function scegliTemplate(tipoSistema, text) {
  if (/motore|trifas|contattore|inverter|vfd/.test(text)) return templateMotoreTrifase();
  if (/caldaia|riscaldamento|boiler|scaldabagno/.test(text)) return templateCaldaia();
  if (/differenziale|rcd|magnetotermico|mcb|quadro|presa|luce|cucina|bagno/.test(text)) return templateCivileMonofase();
  return templateGenerico();
}

function costruisciGrafo(cs) {
  var text = normalize(s(cs.problem_summary));
  var tipoSistema = cs.system_model ? cs.system_model.type : "generico";
  var grafo = scegliTemplate(tipoSistema, text);

  // Segna come "menzionato" i nodi che corrispondono ai componenti rilevati
  arr(cs.components_detected).forEach(function(comp) {
    var mapped = MAPPA_COMPONENTI[normalize(comp)];
    if (mapped && grafo.nodi[mapped]) {
      grafo.nodi[mapped].menzionato = true;
    }
  });

  // Cerca di identificare il nodo problema dal testo
  var problemaId = null;
  Object.keys(grafo.nodi).forEach(function(id) {
    var nodo = grafo.nodi[id];
    var nomeNorm = normalize(nodo.nome);
    if (text.indexOf(nomeNorm.split(" ")[0]) >= 0 && nodo.tipo === "carico") {
      problemaId = id;
    }
  });

  // Segna stato dai fatti noti
  arr(cs.facts_confirmed).forEach(function(fatto) {
    var fn = normalize(fatto);
    Object.keys(grafo.nodi).forEach(function(id) {
      var nodo = grafo.nodi[id];
      var nomeCorto = normalize(nodo.nome).split(" ")[0];
      if (nomeCorto.length < 3) return;
      if (fn.indexOf(nomeCorto) >= 0) {
        if (/scatta|trip|intervi/.test(fn)) nodo.stato = "scattato";
        else if (/ok|funzion|operativ/.test(fn)) nodo.stato = "operativo";
        else if (/guasto|rotto|brucia/.test(fn)) nodo.stato = "guasto";
      }
    });
  });

  grafo.nodo_problema = problemaId;
  return grafo;
}

// ============================================================
// E. PROPAGAZIONE — conseguenze di un guasto
// ============================================================
//
// Se un nodo cambia stato, cosa succede al resto del sistema?
// Queste regole codificano la FISICA, non pattern.

var REGOLE_PROPAGAZIONE = [
  // Dispersione su carico → RCD a monte scatta
  { condizione_tipo: /carico|conduttore/, condizione_stato: "dispersione",
    direzione: "monte", filtro: /protezione_diff/,
    effetto: "scattato", confidenza: 0.9,
    osservabile: "il differenziale scatta" },

  // Dispersione su carico → MCB a monte NON scatta (previsione negativa)
  { condizione_tipo: /carico|conduttore/, condizione_stato: "dispersione",
    direzione: "monte", filtro: /protezione_mcb/,
    effetto: "invariato", confidenza: 0.7,
    osservabile: "il magnetotermico NON scatta" },

  // Cortocircuito su carico → MCB a monte scatta istantaneamente
  { condizione_tipo: /carico|conduttore/, condizione_stato: "cortocircuito",
    direzione: "monte", filtro: /protezione_mcb/,
    effetto: "scattato", confidenza: 0.95,
    osservabile: "il magnetotermico scatta istantaneamente" },

  // Cortocircuito fase-terra → anche RCD scatta
  { condizione_tipo: /carico|conduttore/, condizione_stato: "cortocircuito_terra",
    direzione: "monte", filtro: /protezione_diff/,
    effetto: "scattato", confidenza: 0.85,
    osservabile: "anche il differenziale scatta" },

  // Sovraccarico su carico → MCB a monte scatta con ritardo
  { condizione_tipo: /carico/, condizione_stato: "sovraccarico",
    direzione: "monte", filtro: /protezione_mcb/,
    effetto: "scattato_ritardato", confidenza: 0.85,
    osservabile: "il magnetotermico scatta dopo alcuni minuti" },

  // Protezione scattata → tutto a valle senza tensione
  { condizione_tipo: /protezione/, condizione_stato: "scattato",
    direzione: "valle", filtro: null,
    effetto: "senza_tensione", confidenza: 0.95,
    osservabile: "il circuito a valle non funziona" },

  // Protezione scattata → ciò che è a monte resta operativo
  { condizione_tipo: /protezione/, condizione_stato: "scattato",
    direzione: "monte", filtro: null,
    effetto: "operativo", confidenza: 0.85,
    osservabile: "i circuiti sulle altre linee funzionano" },

  // Sorgente guasta → tutto a valle senza tensione
  { condizione_tipo: /sorgente/, condizione_stato: "guasto",
    direzione: "valle", filtro: null,
    effetto: "senza_tensione", confidenza: 0.95,
    osservabile: "nessun circuito dell'impianto funziona" },

  // Conduttore interrotto → carico a valle senza tensione
  { condizione_tipo: /conduttore/, condizione_stato: "aperto",
    direzione: "valle", filtro: null,
    effetto: "senza_tensione", confidenza: 0.9,
    osservabile: "il carico non funziona ma le protezioni sono chiuse" },

  // Comando assente → carico non comandato
  { condizione_tipo: /comando|sensore/, condizione_stato: "guasto",
    direzione: "valle_comanda", filtro: null,
    effetto: "non_comandato", confidenza: 0.8,
    osservabile: "il carico non risponde al comando" },

  // Surriscaldamento su contatto → possibile interruzione imminente
  { condizione_tipo: /conduttore|carico/, condizione_stato: "surriscaldamento",
    direzione: "locale", filtro: null,
    effetto: "degrado_isolamento", confidenza: 0.7,
    osservabile: "odore di bruciato o calore localizzato" },

  // Sezionamento carico → RCD non scatta più (discriminante!)
  { condizione_tipo: /carico/, condizione_stato: "sezionato",
    direzione: "monte", filtro: /protezione_diff/,
    effetto: "non_scatta_piu", confidenza: 0.85,
    osservabile: "sezionando questo carico il differenziale non scatta piu" },

  // Comando guasto → carico a valle senza alimentazione
  { condizione_tipo: /comando/, condizione_stato: "guasto",
    direzione: "valle", filtro: null,
    effetto: "senza_tensione", confidenza: 0.8,
    osservabile: "il circuito a valle non funziona" },

  // Comando aperto → carico a valle non si avvia
  { condizione_tipo: /comando/, condizione_stato: "aperto",
    direzione: "valle", filtro: null,
    effetto: "senza_tensione", confidenza: 0.85,
    osservabile: "il circuito a valle non si avvia" },

  // Sensore guasto → scheda non riceve dati → comportamento anomalo
  { condizione_tipo: /sensore/, condizione_stato: "guasto",
    direzione: "valle_comanda", filtro: null,
    effetto: "dato_errato", confidenza: 0.7,
    osservabile: "la scheda riceve dati errati dal sensore" }
];

// Propaga le conseguenze di un'ipotesi attraverso il grafo
function propaga(grafo, nodoId, stato) {
  var nodo = grafo.nodi[nodoId];
  if (!nodo) return [];
  var previsioni = [];

  REGOLE_PROPAGAZIONE.forEach(function(regola) {
    // La condizione corrisponde?
    if (!regola.condizione_tipo.test(nodo.tipo)) return;
    if (regola.condizione_stato !== stato) return;

    if (regola.direzione === "valle") {
      // Propaga a tutti i discendenti
      discendenti(grafo, nodoId).forEach(function(target) {
        if (regola.filtro && !regola.filtro.test(target.tipo)) return;
        previsioni.push({
          nodo_id: target.id, nodo_nome: target.nome,
          effetto: regola.effetto, confidenza: regola.confidenza,
          osservabile: regola.osservabile.replace("il circuito a valle", target.nome),
          tipo: "positiva"
        });
      });
    } else if (regola.direzione === "monte") {
      // Propaga agli antenati
      antenati(grafo, nodoId).forEach(function(target) {
        if (regola.filtro && !regola.filtro.test(target.tipo)) return;
        previsioni.push({
          nodo_id: target.id, nodo_nome: target.nome,
          effetto: regola.effetto, confidenza: regola.confidenza,
          osservabile: regola.osservabile,
          tipo: regola.effetto === "invariato" || regola.effetto === "operativo" ? "negativa" : "positiva"
        });
      });
    } else if (regola.direzione === "locale") {
      previsioni.push({
        nodo_id: nodoId, nodo_nome: nodo.nome,
        effetto: regola.effetto, confidenza: regola.confidenza,
        osservabile: regola.osservabile,
        tipo: "positiva"
      });
    } else if (regola.direzione === "valle_comanda") {
      aValle(grafo, nodoId).forEach(function(item) {
        if (item.relazione === "comanda") {
          previsioni.push({
            nodo_id: item.nodo.id, nodo_nome: item.nodo.nome,
            effetto: regola.effetto, confidenza: regola.confidenza,
            osservabile: regola.osservabile.replace("il carico", item.nodo.nome),
            tipo: "positiva"
          });
        }
      });
    }
  });

  return previsioni;
}

// ============================================================
// F. CONTROFATTUALE — "se X fosse la causa, cosa vedrei?"
// ============================================================
//
// Questa è l'IMMAGINAZIONE TECNICA:
// ROCCO ipotizza una causa, prevede le conseguenze,
// e confronta con ciò che l'utente ha descritto.

// Possibili stati di guasto per tipo di nodo
var STATI_GUASTO = {
  "carico":            ["dispersione", "cortocircuito", "sovraccarico", "aperto", "guasto"],
  "conduttore":        ["dispersione", "cortocircuito", "aperto", "surriscaldamento"],
  "protezione_diff":   ["guasto", "scattato"],
  "protezione_mcb":    ["guasto", "scattato", "aperto"],
  "protezione_termica":["guasto", "scattato"],
  "comando":           ["guasto", "aperto"],
  "sensore":           ["guasto"],
  "sorgente":          ["guasto"]
};

function controfattuale(grafo, nodoId, statoIpotizzato) {
  // ROCCO immagina: "se il nodo X fosse nello stato Y..."
  var previsioni = propaga(grafo, nodoId, statoIpotizzato);
  var nodo = grafo.nodi[nodoId];

  // Aggiungi previsione diretta sul nodo stesso
  if (nodo) {
    var ossDiretta = "";
    if (statoIpotizzato === "dispersione") ossDiretta = "isolamento basso su " + nodo.nome;
    else if (statoIpotizzato === "cortocircuito") ossDiretta = "R prossima a 0 su " + nodo.nome;
    else if (statoIpotizzato === "aperto") ossDiretta = "continuita assente su " + nodo.nome;
    else if (statoIpotizzato === "sovraccarico") ossDiretta = "corrente superiore al nominale su " + nodo.nome;
    else if (statoIpotizzato === "guasto") ossDiretta = nodo.nome + " non funziona anche se alimentato";
    else if (statoIpotizzato === "surriscaldamento") ossDiretta = "calore anomalo su " + nodo.nome;

    if (ossDiretta) {
      previsioni.unshift({
        nodo_id: nodoId, nodo_nome: nodo.nome,
        effetto: statoIpotizzato, confidenza: 0.95,
        osservabile: ossDiretta, tipo: "positiva"
      });
    }
  }

  return previsioni;
}

// Sinonimi tecnici per matching semantico
// Se la previsione dice "funziona", conta come match anche "parte", "accende", ecc.
var SINONIMI = {
  "funziona": ["parte", "avvia", "accende", "attiva", "opera", "gira", "eccita"],
  "scatta":   ["interviene", "salta", "apre", "sgancia"],
  "chiude":   ["eccita", "tira", "attiva", "chiuso"],
  "guasto":   ["rotto", "bruciato", "difettoso", "danneggiato"],
  "tensione": ["volt", "alimentazione", "corrente"],
  "calore":   ["caldo", "surriscaldato", "bollente", "brucia"]
};

// Conta match parole con sinonimi
function contaMatchConSinonimi(obsWords, fn) {
  var hits = 0;
  obsWords.forEach(function(w) {
    if (fn.indexOf(w) >= 0) { hits++; return; }
    // Prova sinonimi
    var sinList = SINONIMI[w];
    if (sinList) {
      for (var i = 0; i < sinList.length; i++) {
        if (fn.indexOf(sinList[i]) >= 0) { hits++; return; }
      }
    }
  });
  return hits;
}

// Confronta previsioni con fatti osservati
function valutaPrevisioni(previsioni, fatti) {
  var matching = 0;
  var contradicting = 0;
  var non_verificate = 0;
  var dettagli = [];

  previsioni.forEach(function(p) {
    var obsWords = normalize(p.osservabile).split(" ").filter(function(w) { return w.length > 3; });
    if (!obsWords.length) { non_verificate++; return; }

    var trovato = false;
    var contraddetto = false;

    // Per previsioni negative ("NON scatta"), servono PIÙ keyword per matchare
    // altrimenti "scatta" da solo matcha fatti di altri componenti
    var sogliaBase = p.tipo === "negativa" ? 0.7 : 0.4;

    fatti.forEach(function(fatto) {
      if (trovato || contraddetto) return; // già determinato
      var fn = normalize(fatto);
      var hits = contaMatchConSinonimi(obsWords, fn);
      var soglia = Math.ceil(obsWords.length * sogliaBase);
      // Minimo 2 parole devono matchare per evitare falsi positivi
      // (es. "scatta" da sola matcha sia "differenziale scatta" che "magnetotermico scatta")
      if (obsWords.length >= 2 && soglia < 2) soglia = 2;

      if (hits >= soglia) {
        if (p.tipo === "negativa") {
          // Previsione negativa: il fatto conferma SE contiene negazione
          // Il fatto contraddice SE afferma il contrario (senza negazione)
          var fattoNegato = /\bnon\b|\bsenza\b|\bassente\b|\bnessun/.test(fn);
          if (fattoNegato) trovato = true;
          else contraddetto = true;
        } else {
          // Previsione positiva: match diretto
          // Contraddizione solo se la negazione è ASIMMETRICA:
          // fatto ha "non" ma previsione no → contraddice
          // entrambi hanno "non" → concordano (es. "non funziona" = "non parte")
          var fattoConNon = /\bnon\b/.test(fn);
          var prevConNon = /\bnon\b/.test(normalize(p.osservabile));
          var prevPositiva = /funziona|scatta|opera|parte|avvia|accende/.test(normalize(p.osservabile));
          if (prevPositiva && (fattoConNon !== prevConNon)) {
            contraddetto = true;
          } else {
            trovato = true;
          }
        }
      }
    });

    if (trovato) {
      matching++;
      dettagli.push({ previsione: p.osservabile, esito: "confermata", confidenza: p.confidenza });
    } else if (contraddetto) {
      contradicting++;
      dettagli.push({ previsione: p.osservabile, esito: "contraddetta", confidenza: p.confidenza });
    } else {
      non_verificate++;
      dettagli.push({ previsione: p.osservabile, esito: "non_verificata", confidenza: p.confidenza });
    }
  });

  // Non verificate contano a peso ridotto: se prevedo 4 cose e solo 1 è confermata,
  // la plausibilità deve essere più bassa di 100% — non sappiamo se le altre 3 reggono.
  var totaleEffettivo = matching + contradicting + non_verificate * 0.5;
  var plausibilita = totaleEffettivo > 0 ? matching / totaleEffettivo : 0.3;

  return {
    plausibilita: Math.round(plausibilita * 100) / 100,
    matching: matching,
    contradicting: contradicting,
    non_verificate: non_verificate,
    dettagli: dettagli
  };
}

// ============================================================
// G. IMMAGINAZIONE — generare ipotesi per problemi mai visti
// ============================================================
//
// BACKWARD REASONING: dal sintomo alla causa.
// "Vedo che X succede. Quale componente in quale stato
//  potrebbe produrre esattamente questo?"
//
// ROCCO attraversa il grafo, ipotizza stati di guasto
// su ciascun nodo, propaga le conseguenze, e confronta
// con i sintomi. Le ipotesi che spiegano meglio → vengono
// restituite come nuove ipotesi mai viste prima.

function immagina(grafo, cs) {
  var fatti = [].concat(
    arr(cs.facts_confirmed),
    arr(cs.visual_findings),
    arr(cs.measurements).map(function(m) { return typeof m === "string" ? m : JSON.stringify(m); })
  );
  // Aggiungi il problema come fatto (spesso contiene i sintomi)
  fatti.push(s(cs.problem_summary));

  var candidati = [];

  Object.keys(grafo.nodi).forEach(function(nodoId) {
    var nodo = grafo.nodi[nodoId];
    var statiPossibili = STATI_GUASTO[nodo.tipo] || ["guasto"];

    statiPossibili.forEach(function(stato) {
      // Non ipotizzare "scattato" su una protezione se è il sintomo
      // (sarebbe circolare: "il RCD scatta perché è scattato")
      if (nodo.stato === stato) return;

      // Prevedi le conseguenze
      var previsioni = controfattuale(grafo, nodoId, stato);
      if (previsioni.length === 0) return;

      // Confronta con i fatti
      var valutazione = valutaPrevisioni(previsioni, fatti);

      // Solo se almeno una previsione corrisponde e nessuna contraddice
      if (valutazione.matching > 0 && valutazione.contradicting === 0) {
        // Costruisci la catena logica
        var catena = [
          "Immagino: " + nodo.nome + " in stato " + stato
        ];
        valutazione.dettagli.forEach(function(d) {
          if (d.esito === "confermata") {
            catena.push("Prevedo: " + d.previsione + " → confermato dai fatti");
          }
        });
        catena.push("Plausibilita: " + (valutazione.plausibilita * 100).toFixed(0) + "%");

        // Test di conferma e esclusione generati dal controfattuale
        var conferma = [];
        var esclude = [];
        valutazione.dettagli.forEach(function(d) {
          if (d.esito === "non_verificata") {
            conferma.push("Verificare: " + d.previsione);
          }
        });
        // Il test escludente è il contrario dell'ipotesi
        if (stato === "dispersione") esclude.push("isolamento > 1 MOhm su " + nodo.nome);
        else if (stato === "cortocircuito") esclude.push("R > 0 su " + nodo.nome);
        else if (stato === "aperto") esclude.push("continuita presente su " + nodo.nome);
        else if (stato === "sovraccarico") esclude.push("corrente sotto il nominale su " + nodo.nome);

        // Costruisci il principio fisico che giustifica
        var principio = "";
        if (stato === "dispersione") principio = "Kirchhoff: corrente fugge verso terra → RCD interviene";
        else if (stato === "cortocircuito") principio = "I = V/R con R→0 → corrente altissima → MCB interviene";
        else if (stato === "aperto") principio = "Circuito aperto → I = 0 → carico senza alimentazione";
        else if (stato === "sovraccarico") principio = "Effetto Joule: P = R×I² → calore eccessivo → protezione termica";
        else if (stato === "guasto") principio = "Componente non funziona: causa interna o alimentazione assente";
        else if (stato === "surriscaldamento") principio = "Effetto Joule: R_contatto alta o I eccessiva → calore";
        else if (stato === "scattato") principio = "Protezione ha rilevato condizione anomala a valle e ha interrotto il circuito";

        candidati.push({
          nodo_id: nodoId,
          nodo_nome: nodo.nome,
          stato: stato,
          plausibilita: valutazione.plausibilita,
          matching: valutazione.matching,
          label: nodo.nome + " — " + stato,
          catena: catena,
          principio: principio,
          conferma: conferma,
          esclude: esclude,
          previsioni_totali: previsioni.length,
          previsioni_confermate: valutazione.matching,
          source: "immaginazione_tecnica"
        });
      }
    });
  });

  // Ordina per plausibilità × matching (preferisci chi spiega di più)
  candidati.sort(function(a, b) {
    var scoreA = a.plausibilita * 10 + a.matching * 5;
    var scoreB = b.plausibilita * 10 + b.matching * 5;
    return scoreB - scoreA;
  });

  return candidati.slice(0, 5); // max 5 ipotesi immaginative
}

// ============================================================
// H. CONTROFATTUALE SU IPOTESI ESISTENTI
// ============================================================
//
// Per le ipotesi già generate dal ragionamento tradizionale,
// il controfattuale aggiunge profondità: prevede cosa DOVREMMO
// osservare se l'ipotesi fosse vera, e verifica.

function valutaIpotesiConControfattuale(grafo, ipotesi, cs) {
  // Mappa l'ipotesi a un nodo e uno stato del grafo
  var nodoTarget = null;
  var statoTarget = null;
  var lab = normalize(ipotesi.label);

  // Cerca il nodo più rilevante — controlla sia ID sia TUTTE le parole del nome
  var bestNodoScore = 0;
  Object.keys(grafo.nodi).forEach(function(id) {
    var nodo = grafo.nodi[id];
    var score = 0;
    // Controlla ID del nodo nell'ipotesi
    if (id.length > 2 && lab.indexOf(normalize(id)) >= 0) score += 3;
    // Controlla ogni parola del nome del nodo
    var nomeWords = normalize(nodo.nome).split(" ").filter(function(w) { return w.length > 3; });
    nomeWords.forEach(function(w) { if (lab.indexOf(w) >= 0) score += 2; });
    // Controlla componenti mappati
    Object.keys(MAPPA_COMPONENTI).forEach(function(key) {
      if (MAPPA_COMPONENTI[key] === id && lab.indexOf(normalize(key)) >= 0) score += 3;
    });
    if (score > bestNodoScore) { bestNodoScore = score; nodoTarget = id; }
  });

  // Determina lo stato dall'ipotesi
  if (/dispersione|terra|isolament/.test(lab)) statoTarget = "dispersione";
  else if (/cortocircuito|corto/.test(lab)) statoTarget = "cortocircuito";
  else if (/sovraccarico|corrente.*alta/.test(lab)) statoTarget = "sovraccarico";
  else if (/interruzione|aperto|interrotto|assenza/.test(lab)) statoTarget = "aperto";
  else if (/surriscald|caldo|morsetto/.test(lab)) statoTarget = "surriscaldamento";
  else if (/guasto|difettoso|rotto/.test(lab)) statoTarget = "guasto";

  // Se non riesco a mappare, non posso fare controfattuale
  if (!nodoTarget || !statoTarget) return null;

  // Genera previsioni
  var previsioni = controfattuale(grafo, nodoTarget, statoTarget);
  if (previsioni.length === 0) return null;

  // Valuta contro i fatti
  var fatti = [].concat(
    arr(cs.facts_confirmed),
    arr(cs.visual_findings),
    [s(cs.problem_summary)]
  );

  var valutazione = valutaPrevisioni(previsioni, fatti);

  return {
    nodo: nodoTarget,
    stato: statoTarget,
    previsioni: previsioni,
    valutazione: valutazione,
    // Previsioni non verificate → diventano suggerimenti di verifica
    verifiche_suggerite: valutazione.dettagli
      .filter(function(d) { return d.esito === "non_verificata"; })
      .map(function(d) { return d.previsione; })
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Costruzione
  creaNodo: creaNodo,
  creaArco: creaArco,
  creaGrafo: creaGrafo,
  costruisciGrafo: costruisciGrafo,

  // Template
  templateCivileMonofase: templateCivileMonofase,
  templateMotoreTrifase: templateMotoreTrifase,
  templateCaldaia: templateCaldaia,
  templateGenerico: templateGenerico,

  // Navigazione grafo
  aValle: aValle,
  aMonte: aMonte,
  discendenti: discendenti,
  antenati: antenati,

  // Ragionamento
  propaga: propaga,
  controfattuale: controfattuale,
  valutaPrevisioni: valutaPrevisioni,
  immagina: immagina,
  valutaIpotesiConControfattuale: valutaIpotesiConControfattuale,

  // Conoscenza
  CONCETTI: CONCETTI,
  REGOLE_PROPAGAZIONE: REGOLE_PROPAGAZIONE,
  STATI_GUASTO: STATI_GUASTO,
  MAPPA_COMPONENTI: MAPPA_COMPONENTI
};
