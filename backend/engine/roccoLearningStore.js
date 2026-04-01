"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var STORE_PATH = path.join(__dirname, "..", "data", "rocco-learning.json");
var STORE_VERSION = 1;
var MAX_LEARNING_RECORDS = 500;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits) {
  var safeDigits = typeof digits === "number" ? digits : 4;
  var factor = Math.pow(10, safeDigits);
  return Math.round(Number(value || 0) * factor) / factor;
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function flattenValues(values, out) {
  var target = out || [];

  toArray(values).forEach(function (value) {
    if (Array.isArray(value)) {
      flattenValues(value, target);
    } else if (value !== undefined && value !== null) {
      target.push(value);
    }
  });

  return target;
}

function normalizeText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function displayText(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function uniqueStrings(values) {
  var seen = {};
  var out = [];

  flattenValues(values).forEach(function (value) {
    var normalized = normalizeText(value);
    if (!normalized || seen[normalized]) return;
    seen[normalized] = true;
    out.push(displayText(value));
  });

  return out;
}

function stableSerialize(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return "[" + value.map(function (item) { return stableSerialize(item); }).join(",") + "]";
  }

  return "{" + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ":" + stableSerialize(value[key]);
  }).join(",") + "}";
}

function sha1(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest("hex");
}

function firstText() {
  var values = flattenValues(Array.prototype.slice.call(arguments));
  var i;

  for (i = 0; i < values.length; i += 1) {
    if (typeof values[i] === "string" && values[i].trim()) return displayText(values[i]);
  }

  return "";
}

function tokenize(text) {
  return normalizeText(text).split(" ").map(function (token) {
    return token.trim();
  }).filter(function (token) {
    return token && token.length > 1;
  });
}

function textSimilarity(a, b) {
  var left = normalizeText(a);
  var right = normalizeText(b);
  var leftTokens;
  var rightTokens;
  var union = {};
  var unionSize = 0;
  var intersection = 0;

  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.indexOf(right) >= 0 || right.indexOf(left) >= 0) return 0.92;

  leftTokens = tokenize(left);
  rightTokens = tokenize(right);

  leftTokens.forEach(function (token) {
    if (!union[token]) {
      union[token] = { left: false, right: false };
      unionSize += 1;
    }
    union[token].left = true;
  });

  rightTokens.forEach(function (token) {
    if (!union[token]) {
      union[token] = { left: false, right: false };
      unionSize += 1;
    }
    union[token].right = true;
  });

  if (!unionSize) return 0;

  Object.keys(union).forEach(function (token) {
    if (union[token].left && union[token].right) intersection += 1;
  });

  return intersection / unionSize;
}

function readJsonSafe(filePath) {
  var raw;

  try {
    raw = fs.readFileSync(filePath, "utf8");
    if (!String(raw || "").trim()) return null;
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function createEmptyStore() {
  return {
    version: STORE_VERSION,
    records: []
  };
}

function ensureStoreFile() {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });

  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(createEmptyStore(), null, 2), "utf8");
  }
}

function normalizeLearningRecord(record) {
  var safeRecord = isObject(record) ? record : {};

  return {
    id: safeRecord.id || null,
    timestamp: firstText(safeRecord.timestamp) || new Date().toISOString(),
    caseFingerprint: isObject(safeRecord.caseFingerprint) ? safeRecord.caseFingerprint : {},
    observedDomains: uniqueStrings(safeRecord.observedDomains).slice(0, 8),
    dominantRisk: firstText(safeRecord.dominantRisk),
    dominantCauseFamily: firstText(safeRecord.dominantCauseFamily),
    initialTopHypotheses: uniqueStrings(safeRecord.initialTopHypotheses).slice(0, 6),
    confirmedCause: firstText(safeRecord.confirmedCause),
    rejectedCauses: uniqueStrings(safeRecord.rejectedCauses).slice(0, 8),
    decisiveChecks: uniqueStrings(safeRecord.decisiveChecks).slice(0, 10),
    correctedErrors: uniqueStrings(safeRecord.correctedErrors).slice(0, 10),
    reusableSignals: uniqueStrings(safeRecord.reusableSignals).slice(0, 12),
    reusableThresholds: Array.isArray(safeRecord.reusableThresholds) ? safeRecord.reusableThresholds.slice(0, 8) : [],
    notes: firstText(safeRecord.notes)
  };
}

function normalizeStore(rawStore) {
  var store = isObject(rawStore) ? rawStore : {};

  return {
    version: STORE_VERSION,
    records: Array.isArray(store.records) ? store.records.filter(isObject).map(normalizeLearningRecord) : []
  };
}

function loadLearningStore() {
  ensureStoreFile();
  return normalizeStore(readJsonSafe(STORE_PATH));
}

function saveLearningStore(store) {
  var normalized = normalizeStore(store);
  var tempPath = STORE_PATH + ".tmp";

  try {
    ensureStoreFile();
    fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), "utf8");
    fs.renameSync(tempPath, STORE_PATH);
    return normalized;
  } catch (_error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (_cleanupError) {}
    return null;
  }
}

function pickHypothesisLabel(hypothesis) {
  if (!isObject(hypothesis)) return "";
  return firstText(
    hypothesis.causa,
    hypothesis.cause,
    hypothesis.label,
    hypothesis.title,
    hypothesis.name,
    hypothesis.id,
    hypothesis.code
  );
}

function pickHypothesisSymptom(hypothesis) {
  if (!isObject(hypothesis)) return "";
  return firstText(
    hypothesis.symptom,
    hypothesis.signal,
    hypothesis.observable,
    hypothesis.trigger,
    hypothesis.patternId
  );
}

function pickFactLabel(fact) {
  if (!isObject(fact)) return "";
  return firstText(
    fact.normalizedName,
    fact.name,
    fact.key,
    fact.signal,
    fact.label,
    fact.type,
    fact.metric
  );
}

function pickCheckLabel(check) {
  if (!isObject(check)) return "";
  return firstText(
    check.title,
    check.name,
    check.label,
    check.id,
    check.code,
    check.type,
    check.check,
    check.reason
  );
}

function pickStrongSignals(normalizedFacts) {
  return uniqueStrings((Array.isArray(normalizedFacts) ? normalizedFacts : []).filter(function (fact) {
    return fact && fact.type && fact.certainty !== "non_verifiable";
  }).map(function (fact) {
    if (fact.unit && typeof fact.value === "number") {
      return fact.type + ":" + round(fact.value, 2) + String(fact.unit || "");
    }
    return fact.type;
  })).slice(0, 8);
}

function pickKeyMeasurements(normalizedFacts) {
  return (Array.isArray(normalizedFacts) ? normalizedFacts : []).filter(function (fact) {
    return fact && fact.unit && typeof fact.value === "number";
  }).slice(0, 6).map(function (fact) {
    return {
      type: fact.type,
      value: round(fact.value, 2),
      unit: fact.unit
    };
  });
}

function buildCaseFingerprint(payload) {
  var safePayload = isObject(payload) ? payload : {};
  var caseState = isObject(safePayload.caseState) ? safePayload.caseState : {};
  var safetyDecision = isObject(safePayload.safetyDecision) ? safePayload.safetyDecision : {};
  var hypotheses = Array.isArray(safePayload.hypotheses) ? safePayload.hypotheses : [];
  var normalizedFacts = Array.isArray(safePayload.normalizedFacts) ? safePayload.normalizedFacts : [];
  var fingerprint = {
    observedDomains: uniqueStrings(caseState.observedDomains).slice(0, 6),
    dominantRisk: firstText(caseState.dominantRisk) || "unknown",
    dominantCauseFamily: firstText(caseState.dominantCauseFamily) || "unknown",
    strongSignals: pickStrongSignals(normalizedFacts),
    keyMeasurements: pickKeyMeasurements(normalizedFacts),
    contradictions: uniqueStrings(caseState.contradictions).slice(0, 4),
    safetyLevel: firstText(safetyDecision.level) || "unknown",
    topSymptoms: uniqueStrings(hypotheses.map(pickHypothesisSymptom)).slice(0, 4),
    topFacts: uniqueStrings(normalizedFacts.map(pickFactLabel)).slice(0, 6)
  };

  fingerprint.key = sha1(stableSerialize(fingerprint)).slice(0, 16);
  return fingerprint;
}

function validateClosedCaseLearningRecord(record) {
  if (!isObject(record)) return { valid: false, reason: "invalid_record" };
  if (!isObject(record.caseFingerprint)) return { valid: false, reason: "missing_case_fingerprint" };
  if (!firstText(record.confirmedCause)) return { valid: false, reason: "missing_confirmed_cause" };
  if (!firstText(record.timestamp)) return { valid: false, reason: "missing_timestamp" };
  if (!firstText(record.dominantRisk)) return { valid: false, reason: "missing_dominant_risk" };
  if (!firstText(record.dominantCauseFamily)) return { valid: false, reason: "missing_dominant_cause_family" };
  if (!Array.isArray(record.decisiveChecks)) return { valid: false, reason: "invalid_decisive_checks" };
  if (!Array.isArray(record.correctedErrors)) return { valid: false, reason: "invalid_corrected_errors" };
  return { valid: true, reason: null };
}

function buildLearningDedupKey(record) {
  return sha1(stableSerialize({
    caseFingerprint: isObject(record.caseFingerprint) ? record.caseFingerprint : {},
    confirmedCause: normalizeText(record.confirmedCause),
    dominantCauseFamily: normalizeText(record.dominantCauseFamily),
    decisiveChecks: uniqueStrings(record.decisiveChecks).map(normalizeText).sort(),
    correctedErrors: uniqueStrings(record.correctedErrors).map(normalizeText).sort()
  }));
}

function appendClosedCaseLearning(record, options) {
  var safeOptions = isObject(options) ? options : {};
  var normalizedRecord = normalizeLearningRecord(record);
  var validation = validateClosedCaseLearningRecord(normalizedRecord);
  var store;
  var dedupKey;
  var currentSize;
  var savedStore;

  if (!validation.valid) {
    return { recorded: false, reason: validation.reason, storeSize: 0 };
  }

  store = loadLearningStore();
  dedupKey = buildLearningDedupKey(normalizedRecord);
  currentSize = store.records.length;

  if (normalizedRecord.id && store.records.some(function (item) { return item.id && item.id === normalizedRecord.id; })) {
    return { recorded: false, reason: "duplicate_learning", storeSize: currentSize };
  }

  if (store.records.some(function (item) { return buildLearningDedupKey(item) === dedupKey; })) {
    return { recorded: false, reason: "duplicate_learning", storeSize: currentSize };
  }

  normalizedRecord.id = normalizedRecord.id || safeOptions.id || null;
  store.records.push(normalizedRecord);
  store.records.sort(function (a, b) {
    return String(a.timestamp || "").localeCompare(String(b.timestamp || ""));
  });
  if (store.records.length > MAX_LEARNING_RECORDS) {
    store.records = store.records.slice(-MAX_LEARNING_RECORDS);
  }

  savedStore = saveLearningStore(store);
  if (!savedStore) {
    return {
      recorded: false,
      reason: "learning_store_write_failed",
      storeSize: currentSize
    };
  }

  return {
    recorded: true,
    reason: null,
    storeSize: savedStore.records.length,
    id: normalizedRecord.id || null
  };
}

function scoreMeasurementSimilarity(leftMeasures, rightMeasures) {
  var currentMeasures = Array.isArray(rightMeasures) ? rightMeasures : [];
  var matches = 0;

  if (!Array.isArray(leftMeasures) || !leftMeasures.length || !currentMeasures.length) return 0;

  leftMeasures.forEach(function (leftMeasure) {
    currentMeasures.forEach(function (rightMeasure) {
      var leftType = normalizeText(leftMeasure && leftMeasure.type);
      var rightType = normalizeText(rightMeasure && rightMeasure.type);
      var leftUnit = normalizeText(leftMeasure && leftMeasure.unit);
      var rightUnit = normalizeText(rightMeasure && rightMeasure.unit);
      var leftValue = Number(leftMeasure && leftMeasure.value);
      var rightValue = Number(rightMeasure && rightMeasure.value);
      var relativeGap;

      if (!leftType || leftType !== rightType || leftUnit !== rightUnit) return;
      if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return;
      relativeGap = Math.abs(leftValue - rightValue) / Math.max(Math.abs(leftValue), Math.abs(rightValue), 1);
      if (relativeGap <= 0.25) matches += 1;
    });
  });

  return clamp(matches / Math.max(leftMeasures.length, currentMeasures.length), 0, 1);
}

function scoreFingerprintMatch(storedFingerprint, caseFingerprint) {
  var left = isObject(storedFingerprint) ? storedFingerprint : {};
  var right = isObject(caseFingerprint) ? caseFingerprint : {};
  var score = 0;

  if (left.key && right.key && left.key === right.key) score += 0.28;
  if (normalizeText(left.dominantRisk) && normalizeText(left.dominantRisk) === normalizeText(right.dominantRisk)) score += 0.16;
  if (normalizeText(left.dominantCauseFamily) && normalizeText(left.dominantCauseFamily) === normalizeText(right.dominantCauseFamily)) score += 0.18;
  score += 0.14 * textSimilarity(uniqueStrings(left.observedDomains).join(" "), uniqueStrings(right.observedDomains).join(" "));
  score += 0.16 * textSimilarity(uniqueStrings(left.strongSignals).join(" "), uniqueStrings(right.strongSignals).join(" "));
  score += 0.10 * textSimilarity(uniqueStrings(left.contradictions).join(" "), uniqueStrings(right.contradictions).join(" "));
  score += 0.08 * textSimilarity(uniqueStrings(left.topFacts).join(" "), uniqueStrings(right.topFacts).join(" "));
  score += 0.06 * textSimilarity(uniqueStrings(left.topSymptoms).join(" "), uniqueStrings(right.topSymptoms).join(" "));
  if (normalizeText(left.safetyLevel) && normalizeText(left.safetyLevel) === normalizeText(right.safetyLevel)) score += 0.08;
  score += 0.10 * scoreMeasurementSimilarity(left.keyMeasurements, right.keyMeasurements);

  return clamp(score, 0, 1);
}

function findRelevantLearnings(caseFingerprint) {
  var fingerprint = isObject(caseFingerprint) ? caseFingerprint : {};
  var store = loadLearningStore();

  return store.records.map(function (record) {
    return {
      record: normalizeLearningRecord(record),
      score: scoreFingerprintMatch(record.caseFingerprint, fingerprint)
    };
  }).filter(function (entry) {
    return entry.score >= 0.42;
  }).sort(function (a, b) {
    return b.score - a.score;
  }).slice(0, 20).map(function (entry) {
    var out = Object.assign({}, entry.record);
    out._matchScore = round(entry.score);
    return out;
  });
}

function isHardSafetyLevel(safetyDecision) {
  var level = normalizeText(
    isObject(safetyDecision)
      ? firstText(safetyDecision.level, safetyDecision.riskLevel, safetyDecision.status, safetyDecision.decision)
      : safetyDecision
  );

  return level === "danger" || level === "stop";
}

function getClosedCaseLearningSignal(payload) {
  var safePayload = isObject(payload) ? payload : {};
  var fingerprint = isObject(safePayload.fingerprint) ? safePayload.fingerprint : buildCaseFingerprint(safePayload);
  var relevantLearnings = findRelevantLearnings(fingerprint);
  var allowCheckReorder = !isHardSafetyLevel(safePayload.safetyDecision);

  if (!relevantLearnings.length) {
    return {
      applied: false,
      fingerprint: fingerprint,
      totalMatchedClosedCases: 0,
      allowCheckReorder: allowCheckReorder,
      relevantLearnings: [],
      hypothesisBoosts: {},
      checkBoosts: {}
    };
  }

  return {
    applied: true,
    fingerprint: fingerprint,
    totalMatchedClosedCases: relevantLearnings.length,
    allowCheckReorder: allowCheckReorder,
    relevantLearnings: relevantLearnings,
    hypothesisBoosts: {},
    checkBoosts: {}
  };
}

function getHypothesisBaseScore(hypothesis, index) {
  var candidates = [
    hypothesis && hypothesis.rankScore,
    hypothesis && hypothesis.score,
    hypothesis && hypothesis.deductionScore,
    hypothesis && hypothesis.confidenceScore,
    hypothesis && hypothesis.selectorScore,
    hypothesis && hypothesis.weight
  ];
  var i;

  for (i = 0; i < candidates.length; i += 1) {
    if (Number.isFinite(Number(candidates[i]))) return Number(candidates[i]);
  }

  return round(1 - Math.min(index, 100) * 0.001);
}

function getHypothesisCertaintyRank(hypothesis) {
  var certainty = normalizeText(
    firstText(
      hypothesis && hypothesis.livello,
      hypothesis && hypothesis.certainty,
      hypothesis && hypothesis.certaintyLevel,
      hypothesis && hypothesis.confidenceLevel,
      hypothesis && hypothesis.status
    )
  );

  if (certainty === "confirmed" || certainty === "confermato") return 3;
  if (certainty === "probable" || certainty === "probabile") return 2;
  if (certainty === "non_verifiable" || certainty === "non-verifiable" || certainty === "non verificabile") return 1;
  return 0;
}

function applyClosedCaseLearningToHypotheses(hypotheses, learningSignal) {
  if (!Array.isArray(hypotheses) || !hypotheses.length) return hypotheses;
  if (!learningSignal || !learningSignal.applied) return hypotheses;

  return hypotheses.map(function (hypothesis, index) {
    var label = normalizeText(pickHypothesisLabel(hypothesis));
    var hypothesisId = normalizeText(hypothesis && hypothesis.id);
    var learning = learningSignal.hypothesisBoosts && (
      learningSignal.hypothesisBoosts[hypothesisId] ||
      learningSignal.hypothesisBoosts[label]
    ) || null;
    var baseScore = getHypothesisBaseScore(hypothesis, index);
    var boost = Number(learning && learning.boost || 0);
    var adjustedScore = round(baseScore + boost);

    if (learning && boost) {
      hypothesis.learningBoost = boost;
      hypothesis.learningMatchScore = Number(learning.matchScore || 0);
      hypothesis.learningMatchedCaseIds = Array.isArray(learning.matchedCaseIds) ? learning.matchedCaseIds.slice(0, 4) : [];
      hypothesis.rankScore = adjustedScore;
      hypothesis.deductionScore = adjustedScore;
    }

    return {
      hypothesis: hypothesis,
      index: index,
      certaintyRank: getHypothesisCertaintyRank(hypothesis),
      sortScore: adjustedScore
    };
  }).sort(function (left, right) {
    if (right.certaintyRank !== left.certaintyRank) return right.certaintyRank - left.certaintyRank;
    if (right.sortScore !== left.sortScore) return right.sortScore - left.sortScore;
    return left.index - right.index;
  }).map(function (item) {
    return item.hypothesis;
  });
}

function priorityRank(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  switch (normalizeText(value)) {
    case "critical":
    case "critico":
    case "urgent":
    case "urgente":
    case "high":
    case "alta":
      return 100;
    case "medium":
    case "media":
      return 50;
    case "low":
    case "bassa":
      return 10;
    default:
      return 0;
  }
}

function isSafetyCriticalCheck(check) {
  var label;

  if (!isObject(check)) return false;
  if (check.isSafetyCritical === true || check.safetyCritical === true) return true;

  label = normalizeText(pickCheckLabel(check));
  return /assenza tensione|lockout|loto|messa in sicurezza|isolare|terra|differenziale|magnetotermico|safety/.test(label);
}

function applyClosedCaseLearningToDiagnosticChecks(diagnosticChecks, learningSignal, safetyDecision) {
  if (!Array.isArray(diagnosticChecks) || !diagnosticChecks.length) return diagnosticChecks;
  if (!learningSignal || !learningSignal.applied) return diagnosticChecks;
  if (!learningSignal.allowCheckReorder || isHardSafetyLevel(safetyDecision)) return diagnosticChecks;

  return diagnosticChecks.map(function (check, index) {
    var label = normalizeText(pickCheckLabel(check));
    var checkId = normalizeText(check && check.id);
    var learning = learningSignal.checkBoosts && (
      learningSignal.checkBoosts[checkId] ||
      learningSignal.checkBoosts[label]
    ) || null;
    var boost = Number(learning && learning.boost || 0);

    if (learning && boost) {
      check.learningBoost = boost;
      check.learningMatchScore = Number(learning.matchScore || 0);
      check.learningMatchedCaseIds = Array.isArray(learning.matchedCaseIds) ? learning.matchedCaseIds.slice(0, 4) : [];
    }

    return {
      check: check,
      index: index,
      safetyRank: isSafetyCriticalCheck(check) ? 1 : 0,
      explicitPriority: priorityRank(check && (check.priorityLevel || check.urgency || check.priority)),
      learningBoost: boost
    };
  }).sort(function (left, right) {
    if (right.safetyRank !== left.safetyRank) return right.safetyRank - left.safetyRank;
    if (right.explicitPriority !== left.explicitPriority) return right.explicitPriority - left.explicitPriority;
    if (right.learningBoost !== left.learningBoost) return right.learningBoost - left.learningBoost;
    return left.index - right.index;
  }).map(function (item) {
    return item.check;
  });
}

module.exports = {
  STORE_PATH: STORE_PATH,
  STORE_VERSION: STORE_VERSION,
  MAX_LEARNING_RECORDS: MAX_LEARNING_RECORDS,
  buildCaseFingerprint: buildCaseFingerprint,
  loadLearningStore: loadLearningStore,
  saveLearningStore: saveLearningStore,
  validateClosedCaseLearningRecord: validateClosedCaseLearningRecord,
  buildLearningDedupKey: buildLearningDedupKey,
  appendClosedCaseLearning: appendClosedCaseLearning,
  findRelevantLearnings: findRelevantLearnings,
  getClosedCaseLearningSignal: getClosedCaseLearningSignal,
  applyClosedCaseLearningToHypotheses: applyClosedCaseLearningToHypotheses,
  applyClosedCaseLearningToDiagnosticChecks: applyClosedCaseLearningToDiagnosticChecks
};
