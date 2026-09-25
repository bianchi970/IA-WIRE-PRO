"use strict";

var fs = require("fs");
var path = require("path");
var contracts = require("./contracts");

var STORE_PATH = path.join(__dirname, "..", "data", "rocco-v2-memory.json");

function safeText(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function normalizeText(value) {
  return safeText(value).toLowerCase().replace(/\s+/g, " ");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStore(store) {
  var source = store && typeof store === "object" ? store : {};
  var version = typeof source.version === "number" && isFinite(source.version) ? source.version : 1;
  var closedCases = safeArray(source.closed_cases).filter(function (item) {
    return item && typeof item === "object";
  });

  return {
    version: version,
    closed_cases: closedCases
  };
}

function ensureStore() {
  var dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ version: 1, closed_cases: [] }, null, 2), "utf8");
  }
}

function readStore() {
  try {
    ensureStore();
    return normalizeStore(JSON.parse(fs.readFileSync(STORE_PATH, "utf8")));
  } catch (_error) {
    return normalizeStore(null);
  }
}

function writeStore(store) {
  var normalized = normalizeStore(store);
  var tempPath = STORE_PATH + ".tmp";

  try {
    fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), "utf8");
    fs.renameSync(tempPath, STORE_PATH);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (_cleanupError) {
      // ignore cleanup errors
    }
    throw error;
  }
}

function tokenize(value) {
  return normalizeText(value).split(" ").filter(function (item) {
    return item && item.length > 2;
  });
}

function similarity(left, right) {
  var leftTokens = tokenize(left);
  var rightTokens = tokenize(right);
  var map = {};
  var intersection = 0;
  var union = 0;
  var i;

  for (i = 0; i < leftTokens.length; i += 1) {
    if (!map[leftTokens[i]]) {
      map[leftTokens[i]] = { left: false, right: false };
      union += 1;
    }
    map[leftTokens[i]].left = true;
  }

  for (i = 0; i < rightTokens.length; i += 1) {
    if (!map[rightTokens[i]]) {
      map[rightTokens[i]] = { left: false, right: false };
      union += 1;
    }
    map[rightTokens[i]].right = true;
  }

  Object.keys(map).forEach(function (key) {
    if (map[key].left && map[key].right) intersection += 1;
  });

  if (!union) return 0;
  return intersection / union;
}

function isValidatedClosedCase(feedback) {
  var data = feedback || {};
  var status = normalizeText(data.status || data.outcome || data.caseStatus);
  var validated = data.validated === true || data.closed === true || status === "closed" || status === "validated";
  return validated && safeText(data.confirmedCause);
}

function buildCaseRecord(caseState, feedback) {
  var state = caseState && typeof caseState === "object" ? caseState : {};
  var safety = state.safety && typeof state.safety === "object" ? state.safety : {};

  return {
    id: safeText(feedback && feedback.caseId) || ("rocco-v2-" + Date.now()),
    saved_at: new Date().toISOString(),
    problem_summary: safeText(state.problem_summary),
    domain: safeText(state.domain),
    safety_level: safeText(safety.level),
    confirmed_cause: safeText(feedback && feedback.confirmedCause),
    decisive_checks: safeArray(feedback && feedback.decisiveChecks).slice(0, 6),
    rejected_causes: safeArray(feedback && feedback.rejectedCauses).slice(0, 8),
    facts_confirmed: safeArray(state.facts_confirmed).slice(0, 12),
    components_detected: safeArray(state.components_detected).slice(0, 8),
    hypotheses_active: contracts.safeClone(safeArray(state.hypotheses_active).slice(0, 6)),
    final_diagnosis: safeText(state.final_diagnosis),
    final_confidence: safeText(state.final_confidence)
  };
}

function saveValidatedClosedCase(caseState, feedback) {
  var store;
  var record;
  var duplicate = false;

  if (!isValidatedClosedCase(feedback)) {
    return { recorded: false, reason: "case_not_validated" };
  }

  store = readStore();
  record = buildCaseRecord(caseState, feedback);

  store.closed_cases.forEach(function (item) {
    if (item.id === record.id) duplicate = true;
  });

  if (duplicate) {
    return { recorded: false, reason: "duplicate_case", id: record.id };
  }

  store.closed_cases.push(record);
  writeStore(store);
  return { recorded: true, reason: null, id: record.id };
}

function findRelevantClosedCases(caseState, limit) {
  var store = readStore();
  var matches = [];
  var query = safeText(caseState && caseState.problem_summary);
  var max = typeof limit === "number" ? limit : 3;
  var domain = safeText(caseState && caseState.domain);

  store.closed_cases.forEach(function (item) {
    var itemSummary = safeText(item && item.problem_summary);
    var itemDomain = safeText(item && item.domain);
    var score = similarity(query, itemSummary);

    if (domain && itemDomain && domain === itemDomain) {
      score += 0.15;
    }

    if (score > 0.15) {
      matches.push({
        id: safeText(item && item.id),
        match_score: Math.round(score * 1000) / 1000,
        confirmed_cause: safeText(item && item.confirmed_cause),
        decisive_checks: safeArray(item && item.decisive_checks),
        summary: itemSummary
      });
    }
  });

  matches.sort(function (left, right) {
    return right.match_score - left.match_score;
  });

  return matches.slice(0, max);
}

module.exports = {
  STORE_PATH: STORE_PATH,
  readStore: readStore,
  saveValidatedClosedCase: saveValidatedClosedCase,
  findRelevantClosedCases: findRelevantClosedCases,
  isValidatedClosedCase: isValidatedClosedCase
};
