"use strict";
/**
 * narrator.js — la "bocca" di ROCCO v2.
 *
 * Il motore deterministico (orchestrator) RAGIONA: produce fatti, ipotesi con
 * catena causale, certezza, azione discriminante. Il narratore non ragiona:
 * REDIGE. Prende il case_state già concluso e lo riscrive in italiano tecnico,
 * nel formato TECH_REPORT_V1.
 *
 * Regola non negoziabile: il narratore non può aggiungere fatti, ipotesi,
 * misure o norme. Può solo riformulare, ordinare per pertinenza e scartare.
 * Ogni violazione rilevata → si torna alla bozza deterministica.
 *
 * Se l'LLM non è raggiungibile, la bozza deterministica è già una risposta
 * valida: il narratore è un miglioramento, non una dipendenza.
 */

var lexicon = require("./lexicon");
var reasoner = require("./reasoner");

var REQUIRED_SECTIONS = [
  "OSSERVAZIONI",
  "COMPONENTI COINVOLTI",
  "IPOTESI",
  "LIVELLO DI CERTEZZA",
  "VERIFICHE OPERATIVE",
  "RISCHI REALI",
  "PROSSIMO PASSO"
];

var MAX_HYPOTHESES = 4;
var DEFAULT_TIMEOUT_MS = 25000;
var MIN_ANSWER_LEN = 200;

/**
 * Costanti normative di mestiere: valori che un elettricista cita per norma,
 * non per invenzione. Ammessi anche se non presenti nei dati del caso.
 */
var NORMATIVE_NUMBERS = [
  6, 10, 12, 16, 20, 24, 25, 30, 32, 40, 50, 63,     // In MCB, I_dn mA, V, Hz
  100, 230, 250, 300, 400, 500, 1000,                 // V, I_dn mA, tensioni di prova megger
  0.5, 1, 2                                           // MOhm soglie isolamento, moduli
];

function s(v) { return String(v == null ? "" : v).trim(); }
function arr(v) { return Array.isArray(v) ? v : []; }

function normalize(text) {
  return s(text).toLowerCase()
    .replace(/[àáâä]/g, "a").replace(/[èéêë]/g, "e").replace(/[ìíîï]/g, "i")
    .replace(/[òóôö]/g, "o").replace(/[ùúûü]/g, "u")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// ============================================================
// A. PROMPT — cosa il narratore ha il permesso di scrivere
// ============================================================

function buildSystemPrompt() {
  return [
    "Sei ROCCO, elettricista con 25 anni di cantiere. Scrivi la relazione tecnica di una diagnosi GIA' FATTA.",
    "",
    "Il tuo compito e' SOLO redigere: trasformi dati strutturati in italiano tecnico asciutto, da collega a collega.",
    "",
    "VIETATO IN MODO ASSOLUTO:",
    "- aggiungere ipotesi non presenti nell'elenco fornito",
    "- aggiungere fatti, sintomi o condizioni non presenti nei dati",
    "- inventare valori numerici, misure o soglie non presenti nei dati",
    "- citare articoli di norma o tabelle con numeri non forniti",
    "- cambiare il LIVELLO DI CERTEZZA: lo riporti esattamente come te lo passo",
    "- dare per confermato cio' che non e' stato misurato",
    "",
    "PERMESSO:",
    "- riformulare in italiano corretto e scorrevole",
    "- ordinare le ipotesi dalla piu' pertinente al sintomo descritto alla meno pertinente",
    "- SCARTARE le ipotesi che non hanno niente a che fare col sintomo descritto",
    "- unire ipotesi che dicono la stessa cosa con parole diverse",
    "- spiegare il perche' tecnico usando la catena di ragionamento fornita",
    "",
    "FORMATO — esattamente queste sezioni, in questo ordine, intestazione in MAIUSCOLO seguita da due punti:",
    REQUIRED_SECTIONS.join("\n"),
    "",
    "Ogni voce di elenco inizia con '- '. Mai numerazione, mai markdown, mai grassetto.",
    "La motivazione tecnica va nella stessa riga della causa, dopo ' — '. Non scrivere mai",
    "le etichette interne che trovi nei dati (\"motivo tecnico:\", \"perche':\").",
    "",
    "Esempio di sezione IPOTESI ben scritta:",
    "IPOTESI:",
    "- Dispersione verso terra sulla resistenza di riscaldamento — scalda, l'isolamento",
    "  degradato cede a caldo e la corrente di dispersione supera la soglia di sgancio",
    "- Differenziale a fine vita — sgancia anche senza dispersione reale",
    "",
    "Regole di stile:",
    "- massimo " + MAX_HYPOTHESES + " ipotesi, la piu' probabile per prima, ognuna con il suo perche' tecnico",
    "- VERIFICHE OPERATIVE: misure concrete e ordinate, quella piu' discriminante per prima",
    "- PROSSIMO PASSO: una sola azione, quella che restringe di piu' il campo",
    "- niente frasi di cortesia, niente 'spero di essere stato utile', niente disclaimer generici",
    "- parli a un tecnico: termini corretti, nessun giro di parole"
  ].join("\n");
}

function buildUserPrompt(data) {
  var parts = [];

  parts.push("PROBLEMA RIFERITO DAL CLIENTE:");
  parts.push(data.problem || "non specificato");

  if (data.system) {
    parts.push("");
    parts.push("SISTEMA INTERESSATO: " + data.system.type +
      (data.system.funzionamento ? " — funzione: " + data.system.funzionamento : "") +
      (data.system.discrepancy ? " — anomalia: " + data.system.discrepancy : ""));
  }

  parts.push("");
  parts.push("FATTI ACCERTATI (non aggiungerne altri):");
  parts.push(data.facts.length ? data.facts.map(function (f) { return "- " + f; }).join("\n")
    : "- nessun fatto tecnico confermato oltre a quanto riferito");

  if (data.measurements.length) {
    parts.push("");
    parts.push("MISURE DISPONIBILI (gli unici valori numerici che puoi citare come rilevati):");
    parts.push(data.measurements.map(function (m) { return "- " + m; }).join("\n"));
  }

  parts.push("");
  parts.push("COMPONENTI RICONOSCIUTI:");
  parts.push(data.components.length ? data.components.map(function (c) { return "- " + c; }).join("\n")
    : "- nessuno identificato con certezza");

  parts.push("");
  parts.push("IPOTESI DEL MOTORE DIAGNOSTICO (puoi riordinarle e scartarne, non aggiungerne):");
  if (data.hypotheses.length) {
    data.hypotheses.forEach(function (h, i) {
      parts.push((i + 1) + ". " + h.label);
      arr(h.catena).forEach(function (step) { parts.push("   motivo tecnico: " + step); });
      if (!arr(h.catena).length && h.reason) parts.push("   motivo tecnico: " + h.reason);
    });
  } else {
    parts.push("nessuna — i dati non bastano a formulare un'ipotesi");
  }

  if (data.rejected.length) {
    parts.push("");
    parts.push("IPOTESI GIA' ESCLUSE (non riproporle):");
    data.rejected.forEach(function (h) { parts.push("- " + h.label + " — " + h.reason); });
  }

  parts.push("");
  parts.push("LIVELLO DI CERTEZZA DA RIPORTARE ESATTAMENTE: " + data.certainty);

  parts.push("");
  parts.push("VERIFICA PIU' DISCRIMINANTE INDIVIDUATA DAL MOTORE:");
  parts.push("- " + (data.nextAction || "raccogliere il dato tecnico mancante"));
  if (data.alternatives.length) {
    parts.push("Verifiche alternative: " + data.alternatives.join(" / "));
  }
  if (data.allowedNextStep) {
    parts.push("Passo consentito dalla sicurezza: " + data.allowedNextStep);
  }

  parts.push("");
  parts.push("RISCHI E VINCOLI DI SICUREZZA RILEVATI:");
  if (data.risks.length || data.blocked.length) {
    data.risks.forEach(function (r) { parts.push("- " + r); });
    data.blocked.forEach(function (b) { parts.push("- vietato finche' non verificato: " + b); });
  } else {
    parts.push("- nessun rischio oltre alla prudenza operativa standard");
  }

  if (data.missing.length) {
    parts.push("");
    parts.push("DATI CRITICI MANCANTI: " + data.missing.join(", "));
  }

  if (data.sequenza) {
    parts.push("");
    parts.push("EVOLUZIONE NOTA DEL GUASTO (da citare in chiusura se pertinente): " + data.sequenza);
  }

  if (data.esperienza) {
    parts.push("");
    parts.push("ESPERIENZA DA CASI CHIUSI (da citare come verifica suggerita): " + data.esperienza);
  }

  if (data.priorContext) {
    parts.push("");
    parts.push("SCAMBIO PRECEDENTE CON IL CLIENTE (per continuita', non ripetere le domande gia' fatte):");
    parts.push(data.priorContext);
  }

  parts.push("");
  parts.push("Scrivi ora la relazione nelle sezioni richieste. Solo la relazione, nient'altro.");

  return parts.join("\n");
}

// ============================================================
// B. ESTRAZIONE DATI — tutto in italiano, zero slug
// ============================================================

function extractData(cs, priorContext) {
  var active = arr(cs.hypotheses).filter(function (h) { return h.status === "active"; });
  var rejected = arr(cs.hypotheses).filter(function (h) { return h.status === "rejected"; });
  var next = cs.next_action || {};
  var safety = cs.safety || {};

  return {
    problem: s(cs.problem_summary),
    system: cs.system_model && cs.system_model.discrepancy ? {
      type: s(cs.system_model.type).replace(/_/g, " "),
      funzionamento: s(cs.system_model.funzionamento),
      discrepancy: s(cs.system_model.discrepancy)
    } : null,
    facts: lexicon.cleanFacts(cs.facts_confirmed, 12),
    measurements: arr(cs.measurements).map(function (m) {
      var label = lexicon.humanize(m.type || m.key || "");
      return s(m.value) + s(m.unit) + (label ? " (" + label + ")" : "");
    }).filter(Boolean),
    components: lexicon.humanizeComponents(cs.components_detected),
    hypotheses: active.slice(0, 8).map(function (h) {
      return { label: s(h.label), reason: s(h.reason), catena: arr(h.catena).map(s).filter(Boolean) };
    }),
    rejected: rejected.slice(0, 3).map(function (h) {
      return { label: s(h.label), reason: s(h.rejection_reason || h.reason) || "esclusa dai dati" };
    }),
    certainty: lexicon.certaintyLabel(cs.final_confidence),
    nextAction: s(next.expected_discriminator || next.action),
    alternatives: arr(next.alternatives).map(s).filter(Boolean).slice(0, 2),
    allowedNextStep: s(safety.allowed_next_step),
    risks: arr(safety.reasons).map(s).filter(Boolean).slice(0, 3),
    blocked: arr(safety.blocked_actions).map(s).filter(Boolean).slice(0, 2),
    missing: arr(cs.missing_critical_data).map(s).filter(Boolean).slice(0, 4),
    sequenza: cs.sequenza_causale && arr(cs.sequenza_causale.catena).length > 1
      ? arr(cs.sequenza_causale.catena).join(" → ") +
        (cs.sequenza_causale.avviso ? " — " + cs.sequenza_causale.avviso : "")
      : "",
    esperienza: cs.distiller_verifica && cs.distiller_verifica.verifica
      ? cs.distiller_verifica.verifica + " (da " + (cs.distiller_verifica.casi_base || 0) + " casi chiusi)"
      : "",
    priorContext: s(priorContext).slice(0, 1200)
  };
}

// ============================================================
// C. VALIDAZIONE — il narratore ha rispettato il mandato?
// ============================================================

/**
 * Estrae i numeri che costituiscono un'AFFERMAZIONE TECNICA, cioè quelli
 * seguiti da un'unità di misura (230V, 30mA, 1 MOhm, 2 min).
 *
 * I numeri nudi (numerazioni di elenco, conteggi, "3 ipotesi") non sono
 * affermazioni e non vanno validati: bloccarli faceva scartare redazioni
 * corrette solo perché l'elenco era numerato.
 */
var UNIT_NUMBER = /(\d+(?:[.,]\d+)?)\s*(m?ohm|kohm|megaohm|[mkμ]?Ω|Ω|ma|a|m?v|kv|kw|w|va|kva|hz|°\s*c|°c|mm2|mm²|mm|min|minuti|sec|secondi|ore|%)\b/gi;

function extractMeasuredNumbers(text) {
  var found = [];
  var re = new RegExp(UNIT_NUMBER.source, "gi");
  var m;
  while ((m = re.exec(s(text))) !== null) {
    found.push(parseFloat(m[1].replace(",", ".")));
  }
  return found;
}

/** Tutti i numeri, con o senza unità — serve a costruire il corpus permesso. */
function extractNumbers(text) {
  var found = [];
  var re = /(\d+(?:[.,]\d+)?)/g;
  var m;
  while ((m = re.exec(s(text))) !== null) {
    found.push(parseFloat(m[1].replace(",", ".")));
  }
  return found;
}

function buildAllowedNumbers(data) {
  var corpus = [data.problem, data.nextAction, data.allowedNextStep, data.sequenza, data.esperienza, data.priorContext]
    .concat(data.facts, data.measurements, data.components, data.missing, data.risks, data.blocked, data.alternatives)
    .concat(data.hypotheses.map(function (h) { return h.label + " " + h.reason + " " + h.catena.join(" "); }))
    .concat(data.rejected.map(function (h) { return h.label + " " + h.reason; }))
    .join(" ");

  var allowed = {};
  NORMATIVE_NUMBERS.concat(extractNumbers(corpus)).forEach(function (n) { allowed[n] = true; });
  return allowed;
}

function tokenSet(text) {
  var set = {};
  normalize(text).split(" ").forEach(function (w) { if (w.length > 3) set[w] = true; });
  return set;
}

/**
 * Un'ipotesi scritta dal narratore è ammessa solo se ricalca una di quelle
 * fornite: almeno metà delle parole significative in comune.
 */
/**
 * Riga-etichetta di un'ipotesi: elenco non indentato ("- causa", "1. causa").
 * Le righe di spiegazione sono indentate o introdotte da "perche'/motivo".
 */
function isHypothesisLabelLine(line) {
  var raw = String(line == null ? "" : line);
  if (/^\s{2,}/.test(raw)) return false;
  if (!/^\s?(?:[-*•]|\d+[.)])\s+\S/.test(raw)) return false;
  return !/^\s?(?:[-*•]|\d+[.)])\s+(perche|perché|motivo|nota|causa tecnica)\b/i.test(raw);
}

/**
 * Isola la CAUSA dalla riga: il formato richiesto è "- causa — motivo tecnico",
 * e solo la causa deve provenire dal motore. Senza questo taglio la
 * motivazione (piu' lunga) diluiva il confronto e faceva scartare
 * redazioni corrette.
 */
function hypothesisCausePart(line) {
  var body = String(line == null ? "" : line).replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "");
  var cut = body.split(/\s+[—–]\s+| - /)[0];
  return s(cut) || s(body);
}

function matchesSomeHypothesis(line, hypotheses) {
  var lineTokens = Object.keys(tokenSet(hypothesisCausePart(line)));
  if (!lineTokens.length) return true;

  return hypotheses.some(function (h) {
    var hSet = tokenSet(h.label + " " + h.reason + " " + h.catena.join(" "));
    var hits = lineTokens.filter(function (w) { return hSet[w]; }).length;
    return hits >= Math.ceil(lineTokens.length / 2);
  });
}

function sectionBody(text, name, allNames) {
  var lines = s(text).split(/\r?\n/);
  var out = [];
  var inside = false;
  var i, head;

  for (i = 0; i < lines.length; i += 1) {
    head = lines[i].replace(/:+\s*$/, "").trim().toUpperCase();
    if (head === name) { inside = true; continue; }
    if (inside && allNames.indexOf(head) >= 0) break;
    if (inside) out.push(lines[i]);
  }
  return out.join("\n").trim();
}

function validate(answer, data) {
  var text = s(answer);
  var upper = text.toUpperCase();
  var i, missing, hypBody, numbers, allowed, bad, lines;

  if (text.length < MIN_ANSWER_LEN) return { ok: false, reason: "risposta troppo corta" };

  // 1. Tutte le sezioni obbligatorie presenti
  missing = REQUIRED_SECTIONS.filter(function (name) { return upper.indexOf(name) < 0; });
  if (missing.length) return { ok: false, reason: "sezioni mancanti: " + missing.join(", ") };

  // 2. Certezza riportata senza alterazioni
  if (upper.indexOf(data.certainty) < 0) {
    return { ok: false, reason: "livello di certezza alterato" };
  }

  // 3. Nessuno slug interno trapelato.
  //    Si cerca snake_case tutto minuscolo (rcd_trip, rcd_ac_2p). La notazione
  //    tecnica legittima contiene maiuscole (I_dn, Delta_I, U_0) e resta ammessa.
  if (/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/.test(text)) {
    return { ok: false, reason: "slug interno nel testo" };
  }

  // 4. Nessuna ipotesi inventata.
  //    Si controllano le righe-ETICHETTA (la causa), non le righe di
  //    spiegazione: la causa deve venire dal motore, la motivazione tecnica
  //    il narratore può riformularla ed estenderla con elettrotecnica corretta.
  if (data.hypotheses.length) {
    hypBody = sectionBody(text, "IPOTESI", REQUIRED_SECTIONS.concat(["IPOTESI ESCLUSE", "ANALISI", "ATTENZIONE", "NOTA"]));
    lines = hypBody.split(/\r?\n/).filter(isHypothesisLabelLine);
    for (i = 0; i < lines.length; i += 1) {
      if (!matchesSomeHypothesis(lines[i], data.hypotheses)) {
        return { ok: false, reason: "ipotesi non presente nei dati: " + lines[i].trim().slice(0, 60) };
      }
    }
  }

  // 5. Nessuna misura inventata (solo numeri con unità: sono affermazioni tecniche)
  allowed = buildAllowedNumbers(data);
  numbers = extractMeasuredNumbers(text);
  bad = numbers.filter(function (n) { return !allowed[n]; });
  if (bad.length) return { ok: false, reason: "misure non nei dati: " + bad.slice(0, 3).join(", ") };

  return { ok: true, reason: null };
}

// ============================================================
// D. REDAZIONE
// ============================================================

/**
 * Ripulisce il testo del provider: recinti di codice, markdown residuo,
 * spazi a fine riga (i "due spazi" del markdown) e righe vuote in eccesso.
 */
function tidy(text) {
  return s(text)
    .replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "")
    .replace(/\*\*/g, "")
    .split(/\r?\n/).map(function (l) { return l.replace(/\s+$/, ""); }).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function withTimeout(promise, ms) {
  var timer = null;
  return Promise.race([
    promise.then(function (v) { if (timer) clearTimeout(timer); return v; },
      function (e) { if (timer) clearTimeout(timer); throw e; }),
    new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error("narrator_timeout")); }, ms);
    })
  ]);
}

function isEnabled() {
  return s(process.env.ROCCO_NARRATOR) !== "0";
}

/**
 * narrate(cs, draft, gateway, options) → Promise
 *
 * Risolve SEMPRE: in caso di qualunque problema restituisce la bozza
 * deterministica. Non può far fallire /api/chat/v2.
 *
 * @returns {Promise<{answer, narrated, reason, provider_used, model_used, fallback_used}>}
 */
function narrate(cs, draft, gateway, options) {
  var opts = options || {};
  var fallback = {
    answer: s(draft), narrated: false, reason: null,
    provider_used: null, model_used: null, fallback_used: false, fallback_reason: null
  };

  if (!isEnabled()) {
    fallback.reason = "narratore disattivato (ROCCO_NARRATOR=0)";
    return Promise.resolve(fallback);
  }
  if (!gateway || typeof gateway.runReasoner !== "function") {
    fallback.reason = "nessun provider disponibile";
    return Promise.resolve(fallback);
  }

  var data;
  try {
    data = extractData(cs, opts.prior_context);
  } catch (e) {
    fallback.reason = "estrazione dati fallita: " + s(e && e.message);
    return Promise.resolve(fallback);
  }

  var timeout = typeof opts.timeout_ms === "number" ? opts.timeout_ms : DEFAULT_TIMEOUT_MS;

  return withTimeout(reasoner.execute(gateway, {
    requested_provider: opts.provider_hint || null,
    system_prompt: buildSystemPrompt(),
    user_prompt: buildUserPrompt(data)
  }), timeout).then(function (r) {
    var text = tidy(r && r.text);
    var check = validate(text, data);

    if (!check.ok) {
      return {
        answer: fallback.answer, narrated: false, reason: check.reason,
        provider_used: s(r && r.provider_used) || null,
        model_used: s(r && r.model_used) || null,
        fallback_used: !!(r && r.fallback_used),
        fallback_reason: s(r && r.fallback_reason) || null
      };
    }

    return {
      answer: text, narrated: true, reason: null,
      provider_used: s(r.provider_used) || null,
      model_used: s(r.model_used) || null,
      fallback_used: !!r.fallback_used,
      fallback_reason: s(r.fallback_reason) || null
    };
  }).catch(function (err) {
    fallback.reason = s(err && err.message) || "errore provider";
    return fallback;
  });
}

module.exports = {
  narrate: narrate,
  REQUIRED_SECTIONS: REQUIRED_SECTIONS,
  NORMATIVE_NUMBERS: NORMATIVE_NUMBERS,

  // esposti per i test
  buildSystemPrompt: buildSystemPrompt,
  buildUserPrompt: buildUserPrompt,
  extractData: extractData,
  validate: validate,
  matchesSomeHypothesis: matchesSomeHypothesis,
  isHypothesisLabelLine: isHypothesisLabelLine,
  hypothesisCausePart: hypothesisCausePart,
  extractMeasuredNumbers: extractMeasuredNumbers,
  sectionBody: sectionBody,
  isEnabled: isEnabled
};
