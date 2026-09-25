"use strict";

// roccoCheckPlanner.js — PATCH 22 — deterministic check planner v1
// Lavora solo su: diagnosticChecks, firstStep, allowedNextStep.
// Non genera testo utente, non crea ipotesi, non crea nuove pipeline.
// Viene chiamato da applyRoccoMethodGate (roccoMethodEngine.js).

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value === undefined || value === null ? "" : value).toLowerCase();
}

function stripDot(text) {
  return String(text || "").replace(/[.\s]+$/, "");
}

function normalizeCaseClassification(raw) {
  var safe = raw || {};
  return {
    caseType: safe.caseType || "generic_unknown",
    matchedSignals: ensureArray(safe.matchedSignals),
    confidence: safe.confidence || "low"
  };
}

function hasSignal(classification, signal) {
  return classification.matchedSignals.indexOf(signal) >= 0;
}

// ── Predicati su testo check ─────────────────────────────────────────────────

function isIsolationTest(text) {
  return /isolament|megohm|megger/.test(text);
}

function isCircuitIsolationTest(text) {
  return isIsolationTest(text) && /circuit|carichi scollegati|guasto di isolamento/.test(text);
}

function isLoadSeparation(text) {
  return (/scolleg|distacc|separ/.test(text) && /caric|circuit/.test(text)) ||
    /uno alla volta/.test(text);
}

function isOverloadFocus(text) {
  return /corrente assorbit|pinza amperometr|protezione installata|taglia.*protez|verific.*carico|simultaneit|sezione.*cavo|linea/.test(text);
}

function isSafeIsolation(text) {
  return /disalimentare|assenza tensione|messa in sicurezza|lockout|loto/.test(text);
}

function isSafeInspection(text) {
  return /ispezion|serragg|sezione cavo|punto surriscaldato/.test(text);
}

function isLiveMeasurement(text) {
  return /sotto carico|durante il funzionamento|misurare tensione|misure l-n|misure l-pe|ripetere le misure|pinza amperometr|rilanciare|riattivare/.test(text);
}

function isComponentCommand(text) {
  return /contatt|bobina|comando|consens|uscita|ingresso|commut|continuit|apert|chius|pressostat|rele/.test(text);
}

// ── Regole per caseType (una per tipo) ──────────────────────────────────────

function applyDifferentialTripRules(check, classification, notes) {
  var t = normalizeText(check.reason || "");
  var hasLow = hasSignal(classification, "fact:isolation_low");
  var next = check.priority;

  // Non mettere prova isolamento generica in testa se non c'è segnale di dispersione bassa
  if (!hasLow && isIsolationTest(t) && !isCircuitIsolationTest(t)) {
    next = Math.min(next, 40);
    notes.push("DIFF: isolation abbassato (max 40, no fact:isolation_low)");
  }
  // Load-separation prima in caso differenziale standard
  if (!hasLow && isLoadSeparation(t)) {
    next = Math.max(next, 98);
    notes.push("DIFF: load-separation alzato (min 98)");
  }
  if (hasLow && isLoadSeparation(t)) {
    next = Math.min(next, 60);
  }
  // Isolamento su circuiti separati: alta priorità in entrambi i casi
  if (isCircuitIsolationTest(t)) {
    next = Math.max(next, hasLow ? 99 : 97);
    notes.push("DIFF: circuit-isolation alzato (" + (hasLow ? "99" : "97") + ")");
  }
  return next;
}

function applyOverloadTripRules(check, classification, notes) {
  var t = normalizeText(check.reason || "");
  var next = check.priority;

  // Non spingere dispersione come primo percorso
  if (isIsolationTest(t)) {
    next = Math.min(next, 20);
    notes.push("OVL: isolation abbassato (max 20)");
  }
  // Priorità a verifica carico/protezione/linea
  if (isOverloadFocus(t)) {
    next = Math.max(next, 97);
    notes.push("OVL: overload-focus alzato (min 97)");
  }
  if (/differenzial|rcd|dispersion/.test(t)) {
    next = Math.min(next, 28);
  }
  return next;
}

function applyOverheatingRules(check, classification, notes) {
  var t = normalizeText(check.reason || "");
  var next = check.priority;

  // First step operativo: disalimentare / assenza tensione (safety prima di tutto)
  if (isSafeIsolation(t)) {
    next = Math.max(next, 110);
    notes.push("OVH: safe-isolation alzato (min 110)");
  } else if (isSafeInspection(t)) {
    next = Math.max(next, 98);
    notes.push("OVH: safe-inspection alzato (min 98)");
  }
  // Check invasivi sotto tensione non devono stare in testa
  if (isLiveMeasurement(t) && !isSafeIsolation(t)) {
    next = Math.min(next, 10);
    notes.push("OVH: live-measurement abbassato (max 10)");
  }
  return next;
}

function applyNoOutputRules(check, classification, notes) {
  var t = normalizeText(check.reason || "");
  var next = check.priority;

  // Priorità a componente/comando/consenso/contatti
  if (isComponentCommand(t)) {
    next = Math.max(next, 96);
    notes.push("NOUT: component-command alzato (min 96)");
  }
  // Isolamento è secondario rispetto alla logica di comando
  if (isIsolationTest(t)) {
    next = Math.min(next, 30);
    notes.push("NOUT: isolation abbassato (max 30)");
  }
  return next;
}

function adjustOnePriority(check, caseType, classification, notes) {
  if (!check || typeof check.priority !== "number") return check;

  var nextPriority = check.priority;

  if (caseType === "differential_trip") {
    nextPriority = applyDifferentialTripRules(check, classification, notes);
  } else if (caseType === "overload_trip") {
    nextPriority = applyOverloadTripRules(check, classification, notes);
  } else if (caseType === "overheating_or_burnt_contact") {
    nextPriority = applyOverheatingRules(check, classification, notes);
  } else if (caseType === "no_output_with_input_present") {
    nextPriority = applyNoOutputRules(check, classification, notes);
  }
  // generic_unknown: comportamento prudente, nessuna modifica aggressiva

  if (nextPriority === check.priority) return check;

  return {
    id: check.id,
    reason: check.reason,
    priority: nextPriority,
    basedOnFacts: check.basedOnFacts
  };
}

// ── Ordinamento stabile per priorità ────────────────────────────────────────

function stableSortByPriority(checks) {
  return ensureArray(checks)
    .map(function (c, i) { return { c: c, i: i }; })
    .sort(function (a, b) {
      var pa = Number(a.c && a.c.priority || 0);
      var pb = Number(b.c && b.c.priority || 0);
      if (pb !== pa) return pb - pa;
      return a.i - b.i;
    })
    .map(function (entry) { return entry.c; });
}

// ── Selezione first actionable step coerente con il percorso tecnico ─────────

function findFirst(sortedChecks, predicate) {
  var list = ensureArray(sortedChecks);
  var i, t;
  for (i = 0; i < list.length; i++) {
    t = normalizeText(list[i] && list[i].reason);
    if (predicate(t)) return stripDot(list[i].reason);
  }
  return "";
}

function selectFirstStep(sortedChecks, caseType, classification, notes) {
  var hasLow = hasSignal(classification, "fact:isolation_low");
  var step = "";

  if (caseType === "overheating_or_burnt_contact") {
    step = findFirst(sortedChecks, isSafeIsolation) ||
      findFirst(sortedChecks, isSafeInspection);
    if (step) notes.push("FIRST: overheating → " + step);
  } else if (caseType === "differential_trip") {
    step = hasLow
      ? findFirst(sortedChecks, isCircuitIsolationTest)
      : (findFirst(sortedChecks, isLoadSeparation) ||
         findFirst(sortedChecks, isCircuitIsolationTest));
    if (step) notes.push("FIRST: differential → " + step);
  } else if (caseType === "overload_trip") {
    step = findFirst(sortedChecks, isOverloadFocus);
    if (step) notes.push("FIRST: overload → " + step);
  } else if (caseType === "no_output_with_input_present") {
    step = findFirst(sortedChecks, isComponentCommand);
    if (step) notes.push("FIRST: no-output → " + step);
  }

  return step || (sortedChecks[0] ? stripDot(sortedChecks[0].reason) : "");
}

// ── Entry point pubblico ─────────────────────────────────────────────────────

/**
 * planChecks(params) — planner deterministico v1
 *
 * Input:
 *   params.caseClassification  — output di roccoCaseClassifier.classifyCase()
 *   params.diagnosticChecks    — array di check con { id, reason, priority, basedOnFacts }
 *   params.hypotheses          — array ipotesi (opzionale, non modificato)
 *
 * Output:
 *   diagnosticChecks  — checks con priorità aggiustate e ordinati
 *   firstStep         — primo passo coerente col caso (stringa)
 *   allowedNextStep   — alias di firstStep (contratto pubblico)
 *   planningNotes     — note interne — NON nel payload pubblico
 */
function planChecks(params) {
  var safeParams = params || {};
  var classification = normalizeCaseClassification(safeParams.caseClassification);
  var caseType = classification.caseType;
  var rawChecks = ensureArray(safeParams.diagnosticChecks);
  var notes = [];

  notes.push("PLANNER v1 — caseType: " + caseType + " | checks in: " + rawChecks.length);

  // 1. Aggiusta priorità per ogni check in base alle regole deterministiche
  var adjusted = rawChecks.map(function (check) {
    return adjustOnePriority(check, caseType, classification, notes);
  });

  // 2. Ordina per priorità (stabile)
  var sorted = stableSortByPriority(adjusted);

  // 3. Seleziona first actionable step coerente con il caso
  var firstStep = selectFirstStep(sorted, caseType, classification, notes);

  notes.push("PLANNER v1 — firstStep: " + (firstStep || "(nessuno)"));

  return {
    diagnosticChecks: sorted,
    firstStep: firstStep,
    allowedNextStep: firstStep,
    planningNotes: notes
  };
}

module.exports = {
  planChecks: planChecks
};
