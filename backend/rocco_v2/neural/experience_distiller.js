"use strict";

// ============================================================================
// DISTILLATORE DI ESPERIENZA — Il tecnico che ricorda il PERCHÉ
//
// Ogni caso chiuso è un'esperienza. Ma un tecnico con 25 anni
// non ricorda 10.000 cantieri — ricorda 50 regole d'oro:
//
//   "quando piove e l'impianto è vecchio, guarda le cassette"
//   "seziona i carichi uno alla volta, risolvi il 60% dei casi diff"
//   "morsetto allentato oggi, arco domani"
//   "lo scaldabagno con calcare si disperde dopo 4-5 anni"
//
// PRINCIPIO: le soglie tecniche e normative (CEI 64-8, EN 60034, ecc.)
// sono già nella University/curriculum. Il distillatore NON inventa valori.
// Dai casi reali impara: correlazioni, sequenze, verifiche efficaci,
// firme misura (intervalli osservati), e condizioni ambientali/operative.
//
// Zero dati per impianto. Solo regole.
// 100 casi diventano 50 regole, non 100 file.
// ============================================================================

// --- Stato interno ---
var regole = [];        // regole condizionali
var sequenze = [];      // sequenze di guasto
var firme = [];         // firme misura
var efficienze = [];    // efficienza verifiche
var correlazioni = [];  // correlazioni componente-causa

var nextId = { REG: 1, SEQ: 1, FIR: 1, EFF: 1, COR: 1 };

// --- Soglie ---
var CONFIDENZA_MIN = 0.15;        // sotto questa, la regola muore
var CONFIDENZA_INIT = 0.5;        // confidenza iniziale nuova regola
var RINFORZO_DELTA = 0.03;        // quanto cresce per caso confermato
var DECADIMENTO_DELTA = 0.01;     // quanto cala per caso non-matching
var MAX_REGOLE_PER_TIPO = 200;    // limite per evitare crescita infinita
var CONSOLIDAMENTO_SOGLIA = 0.85; // similarità per fondere regole

// ============================================================================
// NORMALIZZAZIONE
// ============================================================================

function norm(s) {
  if (!s) return "";
  return s.toLowerCase().replace(/[àáâãä]/g, "a").replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i").replace(/[òóôõö]/g, "o").replace(/[ùúûü]/g, "u")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function normChiave(s) {
  return norm(s).replace(/\s/g, "_").substring(0, 60);
}

// ============================================================================
// ESTRAZIONE MISURE DAL CASESTATE
// ============================================================================

function estraiMisure(caseState) {
  if (!caseState) return [];
  var misure = [];

  // Misure strutturate
  var ms = caseState.measurements || [];
  for (var i = 0; i < ms.length; i++) {
    var m = ms[i];
    if (typeof m === "object" && m.grandezza && m.valore !== undefined && m.valore !== null) {
      misure.push({ grandezza: norm(m.grandezza), valore: m.valore, unita: m.unita || "" });
    } else if (typeof m === "string") {
      // Tenta parsing da stringa
      var parsed = parseMisuraStringa(m);
      if (parsed) misure.push(parsed);
    }
  }

  // Misure nei fatti
  var fatti = caseState.facts_confirmed || [];
  for (var j = 0; j < fatti.length; j++) {
    var p = parseMisuraStringa(fatti[j]);
    if (p) misure.push(p);
  }

  return misure;
}

function parseMisuraStringa(testo) {
  if (!testo) return null;
  var t = testo.toLowerCase();

  // Pattern: "isolamento 0.3 MOhm" o "tensione: 230V"
  var match = t.match(/(isolamento|tensione|corrente|resistenza|temperatura|potenza)[:\s]+([0-9.,]+)\s*(mohm|ohm|v|a|ma|w|kw|°c|c)?/);
  if (match) {
    return {
      grandezza: match[1],
      valore: parseFloat(match[2].replace(",", ".")),
      unita: match[3] || ""
    };
  }

  // Pattern: "0.3 MOhm"
  var match2 = t.match(/([0-9.,]+)\s*(mohm|ohm|v|a|ma|w|kw)/);
  if (match2) {
    var unita = match2[2];
    var grandezza = "sconosciuta";
    if (unita === "mohm" || unita === "ohm") grandezza = "isolamento";
    else if (unita === "v") grandezza = "tensione";
    else if (unita === "a" || unita === "ma") grandezza = "corrente";
    else if (unita === "w" || unita === "kw") grandezza = "potenza";
    return { grandezza: grandezza, valore: parseFloat(match2[1].replace(",", ".")), unita: unita };
  }

  return null;
}

// ============================================================================
// ESTRAZIONE CONDIZIONI DAL TESTO
// ============================================================================

function estraiCondizioni(caseState) {
  var condizioni = [];
  var testo = norm(caseState.problem_summary || "");
  var fatti = (caseState.facts_confirmed || []).map(norm);

  // Condizioni ambientali
  if (/piov|pioggia|umid|bagnato|acqua/.test(testo) || fatti.some(function(f) { return /piov|umid|bagnato/.test(f); })) {
    condizioni.push("umidita");
  }
  if (/caldo|estate|afa|temperatura alta/.test(testo)) condizioni.push("caldo");
  if (/freddo|inverno|gelo/.test(testo)) condizioni.push("freddo");
  if (/vecchio|anni 70|anni 80|datato|obsoleto/.test(testo)) condizioni.push("impianto_vecchio");
  if (/nuovo|appena installato|recente/.test(testo)) condizioni.push("impianto_nuovo");

  // Condizioni operative
  if (/accen|avvi|part|start/.test(testo)) condizioni.push("all_accensione");
  if (/dopo.*minut|dopo.*ore|dopo.*tempo/.test(testo)) condizioni.push("dopo_tempo");
  if (/sempre|continua|costant/.test(testo)) condizioni.push("permanente");
  if (/a volte|ogni tanto|intermit|saltuari/.test(testo)) condizioni.push("intermittente");

  // Componenti come condizioni
  var comps = caseState.components_detected || [];
  for (var i = 0; i < comps.length; i++) {
    condizioni.push("componente:" + normChiave(comps[i]));
  }

  return condizioni;
}

// ============================================================================
// 1. REGOLE CONDIZIONALI
// ============================================================================

function estraiRegolaCondizionale(caseState, feedback) {
  var causa = norm(feedback.confirmedCause || feedback.diagnosi || "");
  if (!causa) return null;

  var misure = estraiMisure(caseState);
  var condizioni = estraiCondizioni(caseState);

  // Costruisci le condizioni "se"
  // NOTA: NON interpretiamo i valori con soglie inventate.
  // Le soglie CEI sono nella University/curriculum.
  // Qui registriamo solo CHE misura è stata fatta (tipo di grandezza).
  // I valori reali vengono tracciati nelle firme misura.
  var se = [];
  var grandezzeViste = {};
  for (var i = 0; i < misure.length; i++) {
    var m = misure[i];
    if (m.grandezza && !grandezzeViste[m.grandezza]) {
      se.push("misura:" + m.grandezza);
      grandezzeViste[m.grandezza] = true;
    }
  }

  // Aggiungi condizioni ambientali/operative
  for (var j = 0; j < condizioni.length; j++) {
    if (condizioni[j].indexOf("componente:") !== 0) {
      se.push(condizioni[j]);
    }
  }

  if (se.length === 0) {
    // Almeno il sintomo come condizione
    var sintomo = estraiSintomo(caseState);
    if (sintomo) se.push("sintomo:" + sintomo);
  }

  // Cerca regola esistente con stesse condizioni e stessa causa
  var seKey = se.sort().join("+");
  var esistente = trovaRegola(seKey, causa);

  if (esistente) {
    rinforzaRegola(esistente);
    return esistente;
  }

  // Crea nuova
  var reg = {
    id: "REG-" + (nextId.REG++),
    tipo: "condizionale",
    se: se,
    se_key: seKey,
    allora: causa,
    confidenza: CONFIDENZA_INIT,
    casi_base: 1,
    ultimo_rinforzo: Date.now()
  };
  regole.push(reg);
  limitaArray(regole, MAX_REGOLE_PER_TIPO);
  return reg;
}

function trovaRegola(seKey, causa) {
  for (var i = 0; i < regole.length; i++) {
    if (regole[i].se_key === seKey && regole[i].allora === causa) return regole[i];
  }
  return null;
}

function rinforzaRegola(reg) {
  reg.confidenza = Math.min(0.98, reg.confidenza + RINFORZO_DELTA * (1 - reg.confidenza));
  reg.casi_base++;
  reg.ultimo_rinforzo = Date.now();
}

// ============================================================================
// 2. SEQUENZE DI GUASTO
// ============================================================================

function estraiSequenza(caseState, feedback) {
  var causa = norm(feedback.confirmedCause || feedback.diagnosi || "");
  if (!causa) return null;

  // Cerca se questa causa è collegata a catene note
  // Le catene vengono costruite vedendo lo STESSO componente guastarsi per cause diverse
  var comps = (caseState.components_detected || []).map(norm);
  if (comps.length === 0) return null;

  // Cerca correlazioni esistenti per questo componente con cause diverse
  var causeNote = [];
  for (var i = 0; i < correlazioni.length; i++) {
    var cor = correlazioni[i];
    for (var j = 0; j < comps.length; j++) {
      if (norm(cor.componente) === comps[j] && norm(cor.causa_frequente) !== causa) {
        causeNote.push(norm(cor.causa_frequente));
      }
    }
  }

  if (causeNote.length === 0) return null;

  // Cerca sequenza esistente che termina con questa causa
  for (var s = 0; s < sequenze.length; s++) {
    var seq = sequenze[s];
    var ultimoCatena = norm(seq.catena[seq.catena.length - 1]);
    if (causeNote.indexOf(ultimoCatena) >= 0 || ultimoCatena === causa) {
      // Questa causa potrebbe estendere o rinforzare la sequenza
      if (seq.catena.map(norm).indexOf(causa) < 0) {
        seq.catena.push(causa);
      }
      seq.confidenza = Math.min(0.95, seq.confidenza + RINFORZO_DELTA);
      seq.casi_base++;
      seq.ultimo_rinforzo = Date.now();
      return seq;
    }
  }

  // Crea nuova sequenza se c'è una causa precedente nota
  if (causeNote.length > 0) {
    var nuova = {
      id: "SEQ-" + (nextId.SEQ++),
      tipo: "sequenza",
      catena: [causeNote[0], causa],
      intervallo_tipico: "sconosciuto",
      confidenza: 0.3,
      casi_base: 1,
      ultimo_rinforzo: Date.now()
    };
    sequenze.push(nuova);
    limitaArray(sequenze, MAX_REGOLE_PER_TIPO);
    return nuova;
  }

  return null;
}

// ============================================================================
// 3. FIRME MISURA
// ============================================================================

function estraiFirmaMisura(caseState, feedback) {
  var causa = norm(feedback.confirmedCause || feedback.diagnosi || "");
  if (!causa) return null;

  var misure = estraiMisure(caseState);
  var risultati = [];

  for (var i = 0; i < misure.length; i++) {
    var m = misure[i];
    if (m.valore === undefined || m.valore === null) continue;

    var chiave = m.grandezza + "→" + causa;

    // Cerca firma esistente
    var esistente = null;
    for (var j = 0; j < firme.length; j++) {
      if (firme[j].chiave === chiave) { esistente = firme[j]; break; }
    }

    if (esistente) {
      // Aggiorna intervallo
      esistente.intervallo[0] = Math.min(esistente.intervallo[0], m.valore);
      esistente.intervallo[1] = Math.max(esistente.intervallo[1], m.valore);
      esistente.confidenza = Math.min(0.95, esistente.confidenza + RINFORZO_DELTA);
      esistente.casi_base++;
      esistente.ultimo_rinforzo = Date.now();
      risultati.push(esistente);
    } else {
      // Crea nuova firma
      var nuova = {
        id: "FIR-" + (nextId.FIR++),
        tipo: "firma",
        chiave: chiave,
        misura: m.grandezza,
        intervallo: [m.valore, m.valore],
        unita: m.unita,
        indica: causa,
        confidenza: 0.4,
        casi_base: 1,
        ultimo_rinforzo: Date.now()
      };
      firme.push(nuova);
      limitaArray(firme, MAX_REGOLE_PER_TIPO);
      risultati.push(nuova);
    }
  }

  return risultati.length > 0 ? risultati : null;
}

// ============================================================================
// 4. EFFICIENZA VERIFICHE
// ============================================================================

function estraiEfficienzaVerifica(caseState, feedback) {
  var verifiche = feedback.come_verificato || feedback.verifiche || "";
  if (typeof verifiche === "object" && Array.isArray(verifiche)) {
    verifiche = verifiche.join("; ");
  }
  if (!verifiche) return null;

  var sintomo = estraiSintomo(caseState);
  if (!sintomo) return null;

  var verificheLista = verifiche.split(/[;,]/).map(function(v) { return norm(v); }).filter(Boolean);
  var risultati = [];

  for (var i = 0; i < verificheLista.length; i++) {
    var v = verificheLista[i];
    if (v.length < 5) continue;

    var chiave = sintomo + "→" + v.substring(0, 40);

    // Cerca efficienza esistente
    var esistente = null;
    for (var j = 0; j < efficienze.length; j++) {
      if (efficienze[j].chiave === chiave) { esistente = efficienze[j]; break; }
    }

    if (esistente) {
      esistente.casi_base++;
      esistente.confidenza = Math.min(0.95, esistente.confidenza + RINFORZO_DELTA);
      esistente.ultimo_rinforzo = Date.now();
      risultati.push(esistente);
    } else {
      var nuova = {
        id: "EFF-" + (nextId.EFF++),
        tipo: "efficienza_verifica",
        chiave: chiave,
        verifica: v,
        sintomo: sintomo,
        confidenza: 0.4,
        casi_base: 1,
        ultimo_rinforzo: Date.now()
      };
      efficienze.push(nuova);
      limitaArray(efficienze, MAX_REGOLE_PER_TIPO);
      risultati.push(nuova);
    }
  }

  return risultati.length > 0 ? risultati : null;
}

// ============================================================================
// 5. CORRELAZIONI COMPONENTE-CAUSA
// ============================================================================

function estraiCorrelazione(caseState, feedback) {
  var causa = norm(feedback.confirmedCause || feedback.diagnosi || "");
  if (!causa) return null;

  var comps = (feedback.componenti || caseState.components_detected || []);
  var risultati = [];

  for (var i = 0; i < comps.length; i++) {
    var comp = norm(comps[i]);
    if (!comp) continue;

    var chiave = comp + "→" + causa;

    // Cerca correlazione esistente
    var esistente = null;
    for (var j = 0; j < correlazioni.length; j++) {
      if (correlazioni[j].chiave === chiave) { esistente = correlazioni[j]; break; }
    }

    if (esistente) {
      esistente.casi_base++;
      esistente.confidenza = Math.min(0.95, esistente.confidenza + RINFORZO_DELTA);
      esistente.ultimo_rinforzo = Date.now();
      risultati.push(esistente);
    } else {
      // Estrai condizione dal contesto
      var condizione = "";
      var testo = norm(caseState.problem_summary || "");
      if (/calcar/.test(testo)) condizione = "calcare";
      else if (/vecchi|datato|anni/.test(testo)) condizione = "usura";
      else if (/umid|pioggia|acqua/.test(testo)) condizione = "umidità";
      else if (/cald|surriscald/.test(testo)) condizione = "surriscaldamento";

      var nuova = {
        id: "COR-" + (nextId.COR++),
        tipo: "correlazione",
        chiave: chiave,
        componente: comp,
        causa_frequente: causa,
        condizione: condizione,
        confidenza: 0.4,
        casi_base: 1,
        ultimo_rinforzo: Date.now()
      };
      correlazioni.push(nuova);
      limitaArray(correlazioni, MAX_REGOLE_PER_TIPO);
      risultati.push(nuova);
    }
  }

  return risultati.length > 0 ? risultati : null;
}

// ============================================================================
// HELPER — Estrai sintomo dal caseState
// ============================================================================

function estraiSintomo(caseState) {
  var testo = norm(caseState.problem_summary || "");
  if (!testo) return null;

  if (/differenziale|rcd|salvavita/.test(testo) && /scatt|salt|trip/.test(testo)) return "differenziale_scatta";
  if (/magnetotermico|mcb|interruttor/.test(testo) && /scatt.*subito|ricade|immediat/.test(testo)) return "magnetotermico_scatta_subito";
  if (/magnetotermico|mcb|interruttor/.test(testo) && /dopo.*minut|dopo.*tempo/.test(testo)) return "magnetotermico_scatta_dopo_tempo";
  if (/brucia|surriscald|cald.*morsett|odore|annerit/.test(testo)) return "surriscaldamento";
  if (/intermit|a volte|ogni tanto|va e viene/.test(testo)) return "intermittente";
  if (/non.*funzion|senza.*tension|buio|spento/.test(testo)) return "niente_tensione";
  if (/motore.*non.*part|motore.*fermo|ronza/.test(testo)) return "motore_non_parte";
  if (/caldaia.*non|blocco.*caldaia|errore.*fiamma/.test(testo)) return "caldaia_non_accende";
  if (/fotovoltaico|inverter.*errore|non.*produc/.test(testo)) return "fotovoltaico_non_produce";

  return null;
}

// ============================================================================
// DISTILLAZIONE PRINCIPALE
// ============================================================================

function distilla(caseState, feedback) {
  if (!caseState || !feedback) return { distillato: false };

  var risultati = {
    distillato: true,
    regola: null,
    sequenza: null,
    firme: null,
    efficienza: null,
    correlazione: null
  };

  try { risultati.regola = estraiRegolaCondizionale(caseState, feedback); } catch(e) {}
  try { risultati.sequenza = estraiSequenza(caseState, feedback); } catch(e) {}
  try { risultati.firme = estraiFirmaMisura(caseState, feedback); } catch(e) {}
  try { risultati.efficienza = estraiEfficienzaVerifica(caseState, feedback); } catch(e) {}
  try { risultati.correlazione = estraiCorrelazione(caseState, feedback); } catch(e) {}

  return risultati;
}

// ============================================================================
// QUERY — L'orchestrator chiede al distillatore
// ============================================================================

function cercaRegole(sintomo, misure, componenti, condizioni) {
  var risultati = [];
  var misureNorm = (misure || []).map(function(m) {
    if (typeof m === "object") return m;
    var p = parseMisuraStringa(m);
    return p || { grandezza: "", valore: 0 };
  });
  var compNorm = (componenti || []).map(norm);
  var condNorm = (condizioni || []).map(norm);

  // 1. Regole condizionali matching
  for (var i = 0; i < regole.length; i++) {
    var reg = regole[i];
    var match = 0;
    var totale = reg.se.length;

    for (var j = 0; j < reg.se.length; j++) {
      var cond = reg.se[j];

      // Sintomo
      if (cond === "sintomo:" + sintomo) { match++; continue; }

      // Misura presente (es: "misura:isolamento" → c'è una misura di isolamento?)
      if (cond.indexOf("misura:") === 0) {
        var grandezza = cond.substring(7);
        if (misureNorm.some(function(m) { return m.grandezza === grandezza; })) { match++; continue; }
      }

      // Condizioni ambientali/operative (umidita, impianto_vecchio, intermittente, ecc.)
      if (cond.indexOf(":") < 0) {
        if (condNorm.indexOf(cond) >= 0) { match++; continue; }
      }

      // Condizioni componente
      if (cond.indexOf("componente:") === 0) {
        var compCond = cond.substring(11);
        if (compNorm.indexOf(compCond) >= 0) { match++; continue; }
      }
    }

    if (totale > 0 && match / totale >= 0.5) {
      risultati.push({
        regola: reg,
        match_ratio: match / totale,
        boost: reg.confidenza * (match / totale)
      });
    }
  }

  // 2. Firme misura matching
  for (var k = 0; k < firme.length; k++) {
    var firma = firme[k];
    for (var m = 0; m < misureNorm.length; m++) {
      if (misureNorm[m].grandezza === firma.misura &&
          misureNorm[m].valore >= firma.intervallo[0] &&
          misureNorm[m].valore <= firma.intervallo[1]) {
        risultati.push({
          regola: firma,
          match_ratio: 1.0,
          boost: firma.confidenza
        });
      }
    }
  }

  // 3. Correlazioni matching
  for (var c = 0; c < correlazioni.length; c++) {
    var cor = correlazioni[c];
    if (compNorm.indexOf(norm(cor.componente)) >= 0) {
      risultati.push({
        regola: cor,
        match_ratio: 0.8,
        boost: cor.confidenza * 0.8
      });
    }
  }

  // Ordina per boost decrescente
  risultati.sort(function(a, b) { return b.boost - a.boost; });
  return risultati;
}

function suggerisciVerifica(sintomo, ipotesi_attive) {
  if (!sintomo || !ipotesi_attive) return null;
  // estraiSintomo ritorna chiavi con underscore (es: "differenziale_scatta")
  // norm() convertirebbe _ in spazi — usiamo il valore così com'è
  var sintomoNorm = sintomo;

  // Trova le verifiche per questo sintomo, ordinate per efficienza
  var candidate = [];
  for (var i = 0; i < efficienze.length; i++) {
    var eff = efficienze[i];
    if (eff.sintomo === sintomoNorm) {
      candidate.push(eff);
    }
  }

  if (candidate.length === 0) return null;

  candidate.sort(function(a, b) {
    return (b.confidenza * b.casi_base) - (a.confidenza * a.casi_base);
  });

  return {
    verifica: candidate[0].verifica,
    confidenza: candidate[0].confidenza,
    casi_base: candidate[0].casi_base,
    alternative: candidate.slice(1, 3).map(function(c) { return c.verifica; })
  };
}

function cercaSequenza(causa) {
  if (!causa) return null;
  var causaNorm = norm(causa);
  var risultati = [];

  for (var i = 0; i < sequenze.length; i++) {
    var seq = sequenze[i];
    for (var j = 0; j < seq.catena.length; j++) {
      if (norm(seq.catena[j]) === causaNorm) {
        // Questa causa è in una sequenza nota
        var prossimi = seq.catena.slice(j + 1);
        if (prossimi.length > 0) {
          risultati.push({
            sequenza: seq,
            posizione: j,
            prossimi: prossimi,
            avviso: "Attenzione: '" + causa + "' spesso evolve in: " + prossimi.join(" → ")
          });
        }
        break;
      }
    }
  }

  return risultati.length > 0 ? risultati : null;
}

function previsione(componenti, misure) {
  if (!componenti || componenti.length === 0) return [];
  var compNorm = componenti.map(norm);
  var rischi = [];

  for (var i = 0; i < correlazioni.length; i++) {
    var cor = correlazioni[i];
    if (compNorm.indexOf(norm(cor.componente)) >= 0 && cor.casi_base >= 2) {
      rischi.push({
        componente: cor.componente,
        rischio: cor.causa_frequente,
        condizione: cor.condizione,
        confidenza: cor.confidenza,
        basato_su: cor.casi_base + " casi"
      });
    }
  }

  // Aggiungi firme misura se le misure indicano degradazione
  if (misure && misure.length > 0) {
    var misureNorm = misure.map(function(m) {
      return typeof m === "object" ? m : (parseMisuraStringa(m) || {});
    });

    for (var j = 0; j < firme.length; j++) {
      var f = firme[j];
      for (var k = 0; k < misureNorm.length; k++) {
        if (misureNorm[k].grandezza === f.misura &&
            misureNorm[k].valore >= f.intervallo[0] &&
            misureNorm[k].valore <= f.intervallo[1] * 1.2) { // margine 20%
          rischi.push({
            componente: "misura " + f.misura,
            rischio: f.indica,
            condizione: f.misura + " nel range " + f.intervallo[0] + "-" + f.intervallo[1] + " " + f.unita,
            confidenza: f.confidenza,
            basato_su: f.casi_base + " casi"
          });
        }
      }
    }
  }

  rischi.sort(function(a, b) { return b.confidenza - a.confidenza; });
  return rischi;
}

// ============================================================================
// CONSOLIDAMENTO — Mantieni le regole compatte
// ============================================================================

function consolidaRegole() {
  var rimossi = 0;
  var fusi = 0;

  // 1. Rimuovi regole con confidenza troppo bassa e pochi casi
  function filtra(arr) {
    var prima = arr.length;
    for (var i = arr.length - 1; i >= 0; i--) {
      if (arr[i].confidenza < CONFIDENZA_MIN && arr[i].casi_base < 3) {
        arr.splice(i, 1);
        rimossi++;
      }
    }
    return arr;
  }

  regole = filtra(regole);
  firme = filtra(firme);
  efficienze = filtra(efficienze);
  correlazioni = filtra(correlazioni);
  sequenze = filtra(sequenze);

  // 2. Fondi regole condizionali con stessa causa e condizioni simili
  for (var i = 0; i < regole.length; i++) {
    for (var j = i + 1; j < regole.length; j++) {
      if (regole[i].allora === regole[j].allora) {
        // Calcola similarità condizioni
        var seI = regole[i].se;
        var seJ = regole[j].se;
        var comuni = 0;
        for (var k = 0; k < seI.length; k++) {
          if (seJ.indexOf(seI[k]) >= 0) comuni++;
        }
        var sim = comuni / Math.max(seI.length, seJ.length);
        if (sim >= CONSOLIDAMENTO_SOGLIA) {
          // Fondi: tieni la più forte, unisci condizioni
          regole[i].confidenza = Math.max(regole[i].confidenza, regole[j].confidenza);
          regole[i].casi_base += regole[j].casi_base;
          // Aggiungi condizioni mancanti
          for (var l = 0; l < seJ.length; l++) {
            if (seI.indexOf(seJ[l]) < 0) seI.push(seJ[l]);
          }
          regole[i].se_key = seI.sort().join("+");
          regole.splice(j, 1);
          j--;
          fusi++;
        }
      }
    }
  }

  return { rimossi: rimossi, fusi: fusi };
}

// ============================================================================
// HELPER
// ============================================================================

function limitaArray(arr, max) {
  if (arr.length <= max) return;
  // Rimuovi quelli con confidenza più bassa
  arr.sort(function(a, b) { return b.confidenza - a.confidenza; });
  arr.length = max;
}

// ============================================================================
// PERSISTENZA
// ============================================================================

function salva() {
  return {
    version: 1,
    regole: regole,
    sequenze: sequenze,
    firme: firme,
    efficienze: efficienze,
    correlazioni: correlazioni,
    nextId: nextId,
    savedAt: new Date().toISOString()
  };
}

function carica(data) {
  if (!data || data.version !== 1) return false;
  regole = data.regole || [];
  sequenze = data.sequenze || [];
  firme = data.firme || [];
  efficienze = data.efficienze || [];
  correlazioni = data.correlazioni || [];
  if (data.nextId) nextId = data.nextId;
  return true;
}

function getStats() {
  return {
    regole: regole.length,
    sequenze: sequenze.length,
    firme: firme.length,
    efficienze: efficienze.length,
    correlazioni: correlazioni.length,
    totale: regole.length + sequenze.length + firme.length + efficienze.length + correlazioni.length,
    confidenza_media: calcolaConfidenzaMedia()
  };
}

function calcolaConfidenzaMedia() {
  var tutti = [].concat(regole, sequenze, firme, efficienze, correlazioni);
  if (tutti.length === 0) return 0;
  var somma = 0;
  for (var i = 0; i < tutti.length; i++) somma += tutti[i].confidenza;
  return Math.round(somma / tutti.length * 100) / 100;
}

function reset() {
  regole = [];
  sequenze = [];
  firme = [];
  efficienze = [];
  correlazioni = [];
  nextId = { REG: 1, SEQ: 1, FIR: 1, EFF: 1, COR: 1 };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Distillazione
  distilla: distilla,

  // Query
  cercaRegole: cercaRegole,
  suggerisciVerifica: suggerisciVerifica,
  cercaSequenza: cercaSequenza,
  previsione: previsione,

  // Manutenzione
  consolidaRegole: consolidaRegole,
  getStats: getStats,
  reset: reset,

  // Persistenza
  salva: salva,
  carica: carica,

  // Esposti per test
  estraiSintomo: estraiSintomo,
  estraiMisure: estraiMisure,
  estraiCondizioni: estraiCondizioni,
  parseMisuraStringa: parseMisuraStringa
};
