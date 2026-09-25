"use strict";

var contracts = require("./contracts");
var runtimeTrace = require("./runtime_trace");

function buildHypothesisLine(item) {
  return "- " + String(item && item.label || "") +
    (item && item.reason ? " | " + item.reason : "");
}

function format(diagnosisSnapshot) {
  var snapshot = contracts.safeClone(diagnosisSnapshot || {});
  var lines = [];
  var components = snapshot.components_detected || [];
  var facts = snapshot.facts_confirmed || [];
  var active = snapshot.hypotheses_active || [];
  var risks = snapshot.safety && snapshot.safety.reasons ? snapshot.safety.reasons : [];
  var blocked = snapshot.safety && snapshot.safety.blocked_actions ? snapshot.safety.blocked_actions : [];
  var nextAction = snapshot.next_action || null;
  var runtimeMetadata = runtimeTrace.buildRuntimeMetadata({ runtime: snapshot.runtime, safety: snapshot.safety });

  lines.push("OSSERVAZIONI:");
  if (facts.length) {
    facts.slice(0, 6).forEach(function (item) {
      lines.push("- " + item);
    });
  } else {
    lines.push("- Nessun fatto tecnico confermato oltre ai dati iniziali.");
  }

  lines.push("");
  lines.push("COMPONENTI COINVOLTI:");
  lines.push(components.length ? "- " + components.join(", ") : "- Non identificati con certezza.");

  lines.push("");
  lines.push("IPOTESI:");
  if (active.length) {
    active.slice(0, 4).forEach(function (item) {
      lines.push(buildHypothesisLine(item));
    });
  } else {
    lines.push("- Nessuna ipotesi confermabile con i dati attuali.");
  }

  lines.push("");
  lines.push("LIVELLO DI CERTEZZA:");
  lines.push(String(snapshot.final_confidence || "non_verifiable"));

  lines.push("");
  lines.push("VERIFICHE OPERATIVE:");
  lines.push("- " + (nextAction && nextAction.reason ? nextAction.reason : "Nessuna verifica ulteriore definita."));

  lines.push("");
  lines.push("RISCHI REALI:");
  if (risks.length || blocked.length) {
    risks.slice(0, 3).forEach(function (item) {
      lines.push("- " + item);
    });
    blocked.slice(0, 2).forEach(function (item) {
      lines.push("- Azione bloccata: " + item);
    });
  } else {
    lines.push("- Nessun rischio aggiuntivo oltre alla prudenza operativa standard.");
  }

  lines.push("");
  lines.push("PROSSIMO PASSO:");
  lines.push("- " + (nextAction && nextAction.expected_discriminator ? nextAction.expected_discriminator :
    snapshot.safety && snapshot.safety.allowed_next_step ? snapshot.safety.allowed_next_step :
    "Raccogliere il dato tecnico minimo mancante."));

  return {
    answer: lines.join("\n"),
    diagnosis_snapshot: snapshot,
    runtime_metadata: runtimeMetadata
  };
}

module.exports = {
  format: format
};
