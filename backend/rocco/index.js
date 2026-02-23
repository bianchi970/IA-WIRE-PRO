"use strict";

const policies = require("./policies");
const { postcheck } = require("./postcheck");

function plan(input) {
  const message = (input && input.message ? String(input.message) : "").trim();
  const hasImage = !!(input && input.hasImage);
  const history = Array.isArray(input && input.history) ? input.history : [];

  const lower = message.toLowerCase();

  // Classificazione V1 (semplice ma utile)
  let domain = "altro";
  if (/(quadro|differenziale|magnetoterm|rcd|mt|fase|neutro|terra|230|400|plc|contattore|teleruttore|trasformatore|24v)/.test(lower)) {
    domain = "elettrico";
  } else if (/(caldaia|termosif|acs|pompa|valvola|pressostato|circolatore)/.test(lower)) {
    domain = "termico";
  } else if (/(lan|router|switch|poe|ip|ethernet|cavo rete)/.test(lower)) {
    domain = "rete";
  } else if (/(shelly|zigbee|z-wave|alexa|tapo|domot)/.test(lower)) {
    domain = "domotica";
  } else if (/(perdita|rubinetto|scarico|tubo|sifone)/.test(lower)) {
    domain = "idraulico";
  }

  const ragEnabled = domain !== "altro";
  const visionNeeded = hasImage;

  const openaiModel = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

  return {
    domain: domain,
    intent: "assistenza_tecnica",
    vision: { needed: visionNeeded, why: visionNeeded ? "foto allegata" : "" },
    rag: { enabled: ragEnabled, collections: [domain], topK: 5 },
    provider: { name: "openai", model: openaiModel, reason: visionNeeded ? "vision" : "testo tecnico" },
    response_style: { format: "TECH_REPORT_V1", language: "it", max_steps: 10 },
    safety: { strict: true, notes: policies.HARD_SAFETY_RULES.slice(0) }
  };
}

function buildSystemPrompt(plan, ragContext) {
  const rules = []
    .concat(policies.HARD_SAFETY_RULES)
    .concat(policies.GOLDEN_RULES);

  const sections = policies.TECH_REPORT_SECTIONS;

  return (
    "Sei ROCCO, tecnico sul campo. Rispondi SOLO in italiano.\n" +
    "Protocollo affidabilità: mai diagnosi certa con dati incompleti. Usa livelli di certezza.\n" +
    "Formato OBBLIGATORIO: TECH_REPORT_V1 con queste sezioni (titolo + due punti):\n" +
    sections.map((s) => "- " + s + ":").join("\n") +
    "\n\nRegole dure:\n" +
    rules.map((r) => "- " + r).join("\n") +
    "\n\nContesto (RAG) se presente:\n" +
    (ragContext ? ragContext : "(nessuno)") +
    "\n"
  );
}

function buildUserPayload(message, history) {
  return (
    "Richiesta utente:\n" +
    (message || "(nessun testo)") +
    "\n\nStorico (ultimi messaggi):\n" +
    JSON.stringify(history || [], null, 2)
  );
}

module.exports = {
  plan: plan,
  buildSystemPrompt: buildSystemPrompt,
  buildUserPayload: buildUserPayload,
  postcheck: postcheck
};