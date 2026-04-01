"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var diagnosticEngine = require("../engine/diagnosticEngine");
var knowledgeLoader = require("../knowledge");
var learningStore = require("../engine/roccoLearningStore");

var analyzeTechnicalRequest = diagnosticEngine.analyzeTechnicalRequest;
var getLoadedKnowledge = knowledgeLoader.getLoadedKnowledge;
var saveLearningStore = learningStore.saveLearningStore;
var STORE_PATH = learningStore.STORE_PATH;
var STORE_VERSION = learningStore.STORE_VERSION;

var FIXTURE_PATH = path.join(__dirname, "fixtures", "rocco-real-case-regressions.json");
var fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
var knowledge = getLoadedKnowledge();

function normalizeText(value) {
  return String(value === undefined || value === null ? "" : value)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueByNormalized(values) {
  var seen = {};

  return ensureArray(values).filter(function (value) {
    var key = normalizeText(value);

    if (!key) return false;
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function hasDuplicates(values) {
  return uniqueByNormalized(values).length !== ensureArray(values).filter(function (value) {
    return normalizeText(value);
  }).length;
}

function matchesAny(text, candidates) {
  var normalized = normalizeText(text);

  return ensureArray(candidates).some(function (candidate) {
    return normalized.indexOf(normalizeText(candidate)) >= 0;
  });
}

function hypothesisMatches(hypothesis, expectedTokens) {
  if (!hypothesis) return false;

  return matchesAny(hypothesis.causa, expectedTokens) ||
    matchesAny(hypothesis.family, expectedTokens) ||
    matchesAny(hypothesis.patternId, expectedTokens);
}

function topHypothesisMatch(hypotheses, expectedTokens, within) {
  return ensureArray(hypotheses).slice(0, within || 1).some(function (hypothesis) {
    return hypothesisMatches(hypothesis, expectedTokens);
  });
}

function extractAllowedNextStep(conclusione) {
  var match = String(conclusione || "").match(/Prossimo passo(?: consentito)?:\s*([^.]*)/i);
  return match ? compactText(match[1]) : "";
}

function buildClosedCaseLearningRecord(sourceCase, sourceDiag) {
  var internal = sourceDiag._roccoInternal || {};
  var caseState = internal.caseState || {};
  var hypotheses = ensureArray(internal.hypotheses);
  var topHypothesis = hypotheses[0] || ensureArray(sourceDiag.ipotesi)[0] || {};

  return {
    id: "closed-from-" + sourceCase.id,
    timestamp: new Date("2026-03-20T10:00:00Z").toISOString(),
    caseFingerprint: internal.caseFingerprint || {},
    observedDomains: ensureArray(caseState.observedDomains),
    dominantRisk: caseState.dominantRisk || "",
    dominantCauseFamily: caseState.dominantCauseFamily || "",
    initialTopHypotheses: hypotheses.slice(0, 3).map(function (hypothesis) {
      return hypothesis.causa || hypothesis.family || hypothesis.id || "";
    }).filter(Boolean),
    confirmedCause: topHypothesis.causa || topHypothesis.family || "Causa non classificata",
    decisiveChecks: ensureArray(sourceDiag.verifiche).slice(0, 3),
    reusableSignals: [
      "family:" + (caseState.dominantCauseFamily || "unknown"),
      "risk:" + (caseState.dominantRisk || "unknown"),
      "top:" + (topHypothesis.causa || topHypothesis.family || "unknown")
    ],
    reusableThresholds: ensureArray(internal.caseFingerprint && internal.caseFingerprint.keyMeasurements).slice(0, 4),
    notes: "Regression pack seed from " + sourceCase.id
  };
}

function writeStoreForCase(fixtureMap, currentCase) {
  var sourceCase;
  var sourceDiag;
  var record;

  if (currentCase.storeMode === "learning_from_case") {
    sourceCase = fixtureMap[currentCase.learningSourceCaseId];
    assert(sourceCase, "Fixture sorgente mancante per " + currentCase.id);
    sourceDiag = analyzeTechnicalRequest({ message: sourceCase.message, hasImage: false }, knowledge);
    record = buildClosedCaseLearningRecord(sourceCase, sourceDiag);
    saveLearningStore({
      version: STORE_VERSION,
      records: [record]
    });
    return {
      type: "learning",
      seededRecordIds: [record.id]
    };
  }

  saveLearningStore({
    version: STORE_VERSION,
    records: []
  });
  return {
    type: "empty",
    seededRecordIds: []
  };
}

function collectFailure(failures, section, message, details) {
  failures.push({
    section: section,
    message: message,
    details: details || ""
  });
}

function runCase(testCase, fixtureMap) {
  var setupResult = writeStoreForCase(fixtureMap, testCase);
  var beforeStore = fs.readFileSync(STORE_PATH, "utf8");
  var diag = analyzeTechnicalRequest({ message: testCase.message, hasImage: false }, knowledge);
  var afterStore = fs.readFileSync(STORE_PATH, "utf8");
  var expectations = testCase.expectations || {};
  var failures = [];
  var internal = diag._roccoInternal || {};
  var safetyDecision = internal.safetyDecision || {};
  var decisionPolicy = internal.decisionPolicy || {};
  var learning = internal.closedCaseLearning || {};
  var allowedNextStep = compactText(decisionPolicy.allowedNextStep || extractAllowedNextStep(diag.conclusione));
  var hypotheses = ensureArray(diag.ipotesi);
  var checks = ensureArray(diag.verifiche);

  if (safetyDecision.level !== expectations.safetyLevel) {
    collectFailure(failures, "safety", "Safety attesa '" + expectations.safetyLevel + "' ma ottenuta '" + compactText(safetyDecision.level) + "'", compactText(JSON.stringify(safetyDecision)));
  }

  if (!topHypothesisMatch(hypotheses, expectations.topHypothesisAnyOf, expectations.topHypothesisWithin)) {
    collectFailure(failures, "hypothesis ranking", "Top hypothesis non coerente con le attese", compactText(JSON.stringify(hypotheses.slice(0, expectations.topHypothesisWithin || 1))));
  }

  if (!checks.some(function (check) { return matchesAny(check, expectations.requiredCheckAnyOf); })) {
    collectFailure(failures, "checks", "Verifica attesa non trovata", compactText(JSON.stringify(checks.slice(0, 6))));
  }

  if (!matchesAny(allowedNextStep, expectations.allowedNextStepAnyOf)) {
    collectFailure(failures, "next step", "Allowed next step non coerente", allowedNextStep);
  }

  if (Boolean(learning.applied) !== Boolean(expectations.learningApplied)) {
    collectFailure(failures, "learning", "Learning applied atteso '" + expectations.learningApplied + "' ma ottenuto '" + Boolean(learning.applied) + "'", compactText(JSON.stringify(learning)));
  }

  if (expectations.matchedCaseIdsInclude && !ensureArray(expectations.matchedCaseIdsInclude).every(function (expectedId) {
    return ensureArray(learning.matchedCaseIds).indexOf(expectedId) >= 0;
  })) {
    collectFailure(failures, "learning", "Matched case ids incompleti", compactText(JSON.stringify(learning.matchedCaseIds || [])));
  }

  if (beforeStore !== afterStore) {
    collectFailure(failures, "learning-store", "Lo store e stato modificato durante la diagnosi", "Differenza byte-level rilevata");
  }

  if (hasDuplicates(hypotheses.map(function (hypothesis) { return hypothesis && hypothesis.causa; }))) {
    collectFailure(failures, "hypothesis ranking", "Ipotesi duplicate nel risultato finale", compactText(JSON.stringify(hypotheses.map(function (hypothesis) { return hypothesis && hypothesis.causa; }))));
  }

  if (hasDuplicates(checks)) {
    collectFailure(failures, "checks", "Verifiche duplicate nel risultato finale", compactText(JSON.stringify(checks)));
  }

  return {
    id: testCase.id,
    title: testCase.title,
    ok: failures.length === 0,
    failures: failures,
    safetyLevel: safetyDecision.level || "",
    topHypothesis: hypotheses[0] ? compactText(hypotheses[0].causa || hypotheses[0].family || hypotheses[0].patternId) : "",
    firstCheck: checks[0] ? compactText(checks[0]) : "",
    allowedNextStep: allowedNextStep,
    learningApplied: Boolean(learning.applied),
    matchedCaseIds: ensureArray(learning.matchedCaseIds),
    storeMode: setupResult.type
  };
}

function printCaseResult(result) {
  if (result.ok) {
    console.log("PASS " + result.id + " | safety=" + result.safetyLevel + " | top=" + result.topHypothesis + " | next=" + result.allowedNextStep);
    return;
  }

  console.log("FAIL " + result.id + " | safety=" + result.safetyLevel + " | top=" + result.topHypothesis);
  result.failures.forEach(function (failure) {
    console.log("  - [" + failure.section + "] " + failure.message);
    if (failure.details) console.log("    " + failure.details);
  });
}

function main() {
  var fixtureMap = {};
  var originalStore = fs.readFileSync(STORE_PATH);
  var results;
  var failed;

  fixtures.forEach(function (fixture) {
    fixtureMap[fixture.id] = fixture;
  });

  try {
    results = fixtures.map(function (fixture) {
      return runCase(fixture, fixtureMap);
    });
  } finally {
    fs.writeFileSync(STORE_PATH, originalStore);
  }

  console.log("\nROCCO v1 real-case regression pack\n");
  results.forEach(printCaseResult);

  failed = results.filter(function (result) {
    return !result.ok;
  });

  console.log("\nSummary: " + (results.length - failed.length) + "/" + results.length + " passed");

  if (failed.length) {
    console.log("Failed blocks:");
    failed.forEach(function (result) {
      console.log("- " + result.id + ": " + result.failures.map(function (failure) {
        return failure.section;
      }).join(", "));
    });
    process.exit(1);
  }

  process.exit(0);
}

main();
