"use strict";

// ============================================================================
// STUDY ENGINE — Motore di studio per ROCCO
// Processa il curriculum progressivo e inietta conoscenza nei moduli neurali:
//   - Knowledge Graph: concetti, componenti, guasti, relazioni
//   - Language: vocabolario tecnico, formule, definizioni
//   - Patterns: features sintetiche da casi e misure
//   - Memory: episodi da casi reali del curriculum
// ============================================================================

var curriculum = require("./curriculum");
var nk = require("./neural_knowledge");
var nl = require("./neural_language");
var np = require("./neural_patterns");
var nm = require("./neural_memory");
var nc = require("./neural_core");

// ============================================================================
// Statistiche di studio
// ============================================================================

var studyStats = {
  livelli_studiati: 0,
  concetti_appresi: 0,
  componenti_appresi: 0,
  formule_apprese: 0,
  guasti_appresi: 0,
  norme_apprese: 0,
  casi_studiati: 0,
  relazioni_create: 0,
  parole_vocabolario: 0,
  episodi_memorizzati: 0,
  tempo_ms: 0
};

// ============================================================================
// FASE 1: Inietta concetti nel Knowledge Graph
// ============================================================================

function studiaConcetti(livello) {
  var concetti = livello.concetti || [];
  var count = 0;

  for (var i = 0; i < concetti.length; i++) {
    var c = concetti[i];
    var tipo = "concetto";
    if (c.nome.indexOf("legge_") === 0 || c.nome.indexOf("effetto_") === 0) {
      tipo = "principio";
    }

    // Aggiungi nodo al knowledge graph
    var nodoId = nk.aggiungiNodo(tipo, c.nome);

    // Aggiungi metadata
    var nodo = nk.trovaNodo(nodoId);
    if (nodo) {
      nodo.metadata.definizione = c.definizione;
      if (c.formula) nodo.metadata.formula = c.formula;
      if (c.unita) nodo.metadata.unita = c.unita;
      nodo.metadata.livello = livello.id;
    }

    // Inietta nel vocabolario
    var parole = estraiParoleTecniche(c.nome + " " + c.definizione);
    for (var j = 0; j < parole.length; j++) {
      nl.aggiungiAlVocabolario(parole[j]);
      studyStats.parole_vocabolario++;
    }

    // Crea relazioni dichiarate
    if (c.relazioni) {
      for (var r = 0; r < c.relazioni.length; r++) {
        var target = c.relazioni[r];
        var targetNodo = nk.trovaNodoPerNome(target);
        if (targetNodo) {
          nk.aggiungiArco(nodoId, targetNodo.id, "simile_a", 0.6);
          studyStats.relazioni_create++;
        }
      }
    }

    count++;
  }

  return count;
}

// ============================================================================
// FASE 2: Inietta componenti
// ============================================================================

function studiaComponenti(livello) {
  var componenti = livello.componenti || [];
  var count = 0;

  for (var i = 0; i < componenti.length; i++) {
    var comp = componenti[i];

    // Nodo componente nel KG — se già esiste come concetto, arricchisci
    var esistente = nk.trovaNodoPerNome(comp.nome);
    var nodoId;
    if (esistente) {
      nodoId = esistente.id;
      esistente.tipo = "componente"; // promuovi a componente
    } else {
      nodoId = nk.aggiungiNodo("componente", comp.nome);
    }
    var nodo = nk.trovaNodo(nodoId);
    if (nodo) {
      nodo.metadata.tipo_componente = comp.tipo;
      nodo.metadata.funzione = comp.funzione;
      nodo.metadata.guasti_tipici = comp.guasti_tipici;
      nodo.metadata.misure = comp.misure;
      nodo.metadata.livello = livello.id;
    }

    // Vocabolario
    var parole = estraiParoleTecniche(comp.nome + " " + comp.funzione);
    for (var j = 0; j < parole.length; j++) {
      nl.aggiungiAlVocabolario(parole[j]);
      studyStats.parole_vocabolario++;
    }

    // Guasti tipici → nodi guasto + relazione
    if (comp.guasti_tipici) {
      for (var g = 0; g < comp.guasti_tipici.length; g++) {
        var guastoNome = comp.guasti_tipici[g];
        var guastoId = nk.aggiungiNodo("causa", guastoNome);
        nk.aggiungiArco(guastoId, nodoId, "manifesta", 0.7);
        studyStats.relazioni_create++;

        // Vocabolario guasto
        var pg = estraiParoleTecniche(guastoNome);
        for (var k = 0; k < pg.length; k++) {
          nl.aggiungiAlVocabolario(pg[k]);
          studyStats.parole_vocabolario++;
        }
      }
    }

    count++;
  }

  return count;
}

// ============================================================================
// FASE 3: Inietta formule nel linguaggio e KG
// ============================================================================

function studiaFormule(livello) {
  var formule = livello.formule || [];
  var count = 0;

  for (var i = 0; i < formule.length; i++) {
    var f = formule[i];

    // Nodo principio nel KG
    var nodoId = nk.aggiungiNodo("principio", f.nome);
    var nodo = nk.trovaNodo(nodoId);
    if (nodo) {
      nodo.metadata.formula = f.formula;
      nodo.metadata.variabili = f.variabili;
      nodo.metadata.esempio = f.esempio;
      nodo.metadata.livello = livello.id;
    }

    // Vocabolario: nome formula + variabili
    var parole = estraiParoleTecniche(f.nome);
    for (var j = 0; j < parole.length; j++) {
      nl.aggiungiAlVocabolario(parole[j]);
      studyStats.parole_vocabolario++;
    }

    // Collega formula ai concetti delle variabili
    if (f.variabili) {
      var vars = Object.keys(f.variabili);
      for (var v = 0; v < vars.length; v++) {
        var varNome = vars[v].toLowerCase().replace(/[()]/g, "");
        var varNodo = nk.trovaNodoPerNome(varNome);
        if (varNodo) {
          nk.aggiungiArco(nodoId, varNodo.id, "richiede", 0.8);
          studyStats.relazioni_create++;
        }
      }
    }

    count++;
  }

  return count;
}

// ============================================================================
// FASE 4: Inietta guasti — causa/sintomo/verifica nel KG
// ============================================================================

function studiaGuasti(livello) {
  var guasti = livello.guasti || [];
  var count = 0;

  for (var i = 0; i < guasti.length; i++) {
    var g = guasti[i];

    // Nodo guasto
    var guastoId = nk.aggiungiNodo("causa", g.nome);
    var nodo = nk.trovaNodo(guastoId);
    if (nodo) {
      nodo.metadata.causa = g.causa;
      nodo.metadata.sintomo = g.sintomo;
      nodo.metadata.verifica = g.verifica;
      nodo.metadata.livello = livello.id;
    }

    // Nodo sintomo
    if (g.sintomo) {
      var sintomoId = nk.aggiungiNodo("sintomo", g.sintomo);
      nk.aggiungiArco(guastoId, sintomoId, "manifesta", 0.8);
      studyStats.relazioni_create++;

      // Vocabolario
      var ps = estraiParoleTecniche(g.sintomo);
      for (var s = 0; s < ps.length; s++) {
        nl.aggiungiAlVocabolario(ps[s]);
        studyStats.parole_vocabolario++;
      }
    }

    // Nodo verifica
    if (g.verifica) {
      var verificaId = nk.aggiungiNodo("verifica", g.verifica);
      nk.aggiungiArco(guastoId, verificaId, "verifica", 0.9);
      studyStats.relazioni_create++;

      var pv = estraiParoleTecniche(g.verifica);
      for (var v = 0; v < pv.length; v++) {
        nl.aggiungiAlVocabolario(pv[v]);
        studyStats.parole_vocabolario++;
      }
    }

    // Collega ai componenti coinvolti
    if (g.componenti_coinvolti) {
      for (var c = 0; c < g.componenti_coinvolti.length; c++) {
        var compNodo = nk.trovaNodoPerNome(g.componenti_coinvolti[c]);
        if (compNodo) {
          nk.aggiungiArco(guastoId, compNodo.id, "manifesta", 0.7);
          studyStats.relazioni_create++;
        }
      }
    }

    // Vocabolario guasto
    var pg = estraiParoleTecniche(g.nome + " " + g.causa);
    for (var j = 0; j < pg.length; j++) {
      nl.aggiungiAlVocabolario(pg[j]);
      studyStats.parole_vocabolario++;
    }

    count++;
  }

  return count;
}

// ============================================================================
// FASE 5: Inietta norme nel KG
// ============================================================================

function studiaNorme(livello) {
  var norme = livello.norme || [];
  var count = 0;

  for (var i = 0; i < norme.length; i++) {
    var n = norme[i];

    // Nodo norma
    var normaId = nk.aggiungiNodo("principio", n.codice);
    var nodo = nk.trovaNodo(normaId);
    if (nodo) {
      nodo.metadata.titolo = n.titolo;
      nodo.metadata.applicazione = n.applicazione;
      nodo.metadata.tipo = "norma";
      nodo.metadata.livello = livello.id;
    }

    // Vocabolario
    var parole = estraiParoleTecniche(n.codice + " " + n.titolo + " " + n.applicazione);
    for (var j = 0; j < parole.length; j++) {
      nl.aggiungiAlVocabolario(parole[j]);
      studyStats.parole_vocabolario++;
    }

    count++;
  }

  return count;
}

// ============================================================================
// FASE 6: Inietta casi nella memoria episodica e nel KG
// ============================================================================

function studiaCasi(livello) {
  var casi = livello.casi || [];
  var count = 0;

  for (var i = 0; i < casi.length; i++) {
    var caso = casi[i];

    // Memorizza come episodio
    var caseState = {
      problem_summary: caso.scenario,
      domain: "elettrico",
      components_detected: [],
      facts_confirmed: [],
      measurements: caso.misure ? flattenMisure(caso.misure) : []
    };

    var feedback = {
      confirmedCause: caso.causa,
      decisiveChecks: caso.soluzione ? [caso.soluzione] : [],
      rejectedCauses: []
    };

    nm.store(caseState, feedback);
    studyStats.episodi_memorizzati++;

    // Nodo caso nel KG
    var casoId = nk.aggiungiNodo("causa", caso.causa);
    var casoNodo = nk.trovaNodo(casoId);
    if (casoNodo) {
      casoNodo.metadata.scenario = caso.scenario;
      casoNodo.metadata.ragionamento = caso.ragionamento;
      casoNodo.metadata.livello = livello.id;
    }

    // Vocabolario: scenario + ragionamento
    var parole = estraiParoleTecniche(caso.scenario + " " + caso.causa + " " + (caso.ragionamento || ""));
    for (var j = 0; j < parole.length; j++) {
      nl.aggiungiAlVocabolario(parole[j]);
      studyStats.parole_vocabolario++;
    }

    count++;
  }

  return count;
}

// ============================================================================
// FASE 7: Crea relazioni esplicite del curriculum
// ============================================================================

function studiaRelazioni(livello) {
  var relazioni = livello.relazioni || [];
  var count = 0;

  for (var i = 0; i < relazioni.length; i++) {
    var rel = relazioni[i];

    var daNodo = nk.trovaNodoPerNome(rel.da);
    var aNodo = nk.trovaNodoPerNome(rel.a);

    if (daNodo && aNodo) {
      // Mappa tipi relazione curriculum → tipi KG
      var tipoKG = mappaTipoRelazione(rel.tipo);
      nk.aggiungiArco(daNodo.id, aNodo.id, tipoKG, 0.8);
      count++;
    } else {
      // Se i nodi non esistono ancora, creali al volo
      if (!daNodo) {
        var daId = nk.aggiungiNodo("concetto", rel.da);
        daNodo = nk.trovaNodo(daId);
      }
      if (!aNodo) {
        var aId = nk.aggiungiNodo("concetto", rel.a);
        aNodo = nk.trovaNodo(aId);
      }
      var tipoKG2 = mappaTipoRelazione(rel.tipo);
      nk.aggiungiArco(daNodo.id, aNodo.id, tipoKG2, 0.7);
      count++;
    }
  }

  return count;
}

// ============================================================================
// FASE 8: Addestra pattern da misure e casi
// ============================================================================

function studiaPatterns(livello) {
  var casi = livello.casi || [];
  var misure = livello.misure || [];
  var trained = 0;

  // Addestra da casi con misure
  for (var i = 0; i < casi.length; i++) {
    var caso = casi[i];
    if (!caso.misure) continue;

    var caseState = {
      problem_summary: caso.scenario,
      domain: "elettrico",
      components_detected: [],
      facts_confirmed: [],
      measurements: flattenMisure(caso.misure)
    };

    var feedback = {
      confirmedCause: caso.causa
    };

    try {
      np.trainDaCasoChiuso(caseState, feedback);
      trained++;
    } catch(e) {
      // Caso senza features estraibili — ok, non tutti i casi hanno misure
    }
  }

  return trained;
}

// ============================================================================
// ORCHESTRATORE STUDIO — Processa un singolo livello
// ============================================================================

function studiaLivello(livello) {
  var risultato = {
    id: livello.id,
    nome: livello.nome,
    concetti: studiaConcetti(livello),
    componenti: studiaComponenti(livello),
    formule: studiaFormule(livello),
    guasti: studiaGuasti(livello),
    norme: studiaNorme(livello),
    casi: studiaCasi(livello),
    relazioni: studiaRelazioni(livello),
    patterns: studiaPatterns(livello)
  };

  return risultato;
}

// ============================================================================
// STUDIO COMPLETO — Tutti i livelli in ordine progressivo
// ============================================================================

function studiaCompleto() {
  var inizio = Date.now();
  var risultati = [];

  // Reset stats
  studyStats.livelli_studiati = 0;
  studyStats.concetti_appresi = 0;
  studyStats.componenti_appresi = 0;
  studyStats.formule_apprese = 0;
  studyStats.guasti_appresi = 0;
  studyStats.norme_apprese = 0;
  studyStats.casi_studiati = 0;
  studyStats.relazioni_create = 0;
  studyStats.parole_vocabolario = 0;
  studyStats.episodi_memorizzati = 0;

  var livelli = curriculum.LIVELLI;

  for (var i = 0; i < livelli.length; i++) {
    var r = studiaLivello(livelli[i]);
    risultati.push(r);

    studyStats.livelli_studiati++;
    studyStats.concetti_appresi += r.concetti;
    studyStats.componenti_appresi += r.componenti;
    studyStats.formule_apprese += r.formule;
    studyStats.guasti_appresi += r.guasti;
    studyStats.norme_apprese += r.norme;
    studyStats.casi_studiati += r.casi;
    studyStats.relazioni_create += r.relazioni;
  }

  // Consolida la conoscenza dopo lo studio
  nk.consolidaConoscenza();
  nm.consolida();

  studyStats.tempo_ms = Date.now() - inizio;

  return {
    success: true,
    stats: Object.assign({}, studyStats),
    dettaglio_livelli: risultati,
    kg_stats: nk.getStats(),
    lang_stats: nl.getStats(),
    memory_stats: nm.stats(),
    pattern_stats: np.getStats()
  };
}

// ============================================================================
// UTILITY
// ============================================================================

function estraiParoleTecniche(testo) {
  if (!testo) return [];
  // Normalizza e splitta
  var pulito = testo.toLowerCase()
    .replace(/[àáâãä]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[^a-z0-9_]/g, " ");

  var parole = pulito.split(/\s+/).filter(function(p) {
    return p.length >= 3;
  });

  // Filtra stopwords comuni
  var STOP = new Set(["che", "per", "con", "del", "della", "delle", "dei", "degli",
    "una", "uno", "non", "sono", "nel", "nel", "alla", "alle", "tra", "fra",
    "anche", "piu", "come", "molto", "poco", "ogni", "altro", "altri"]);

  return parole.filter(function(p) { return !STOP.has(p); });
}

function flattenMisure(misure) {
  if (!misure) return [];
  var result = [];
  var keys = Object.keys(misure);
  for (var i = 0; i < keys.length; i++) {
    result.push(keys[i] + ": " + misure[keys[i]]);
  }
  return result;
}

function mappaTipoRelazione(tipo) {
  var mappa = {
    "causa": "causa",
    "manifesta": "manifesta",
    "verifica": "verifica",
    "esclude": "esclude",
    "richiede": "richiede",
    "simile_a": "simile_a",
    "protegge": "protegge",
    "alimenta": "alimenta",
    "componente": "richiede",
    "misura": "verifica",
    "norma": "richiede"
  };
  return mappa[tipo] || "simile_a";
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  studiaCompleto: studiaCompleto,
  studiaLivello: studiaLivello,
  getStats: function() { return Object.assign({}, studyStats); }
};
