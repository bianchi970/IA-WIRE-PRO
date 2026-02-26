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
  const banned = policies.BANNED_PHRASES;

  return (
    "Sei ROCCO, tecnico sul campo con 20 anni di esperienza. Rispondi SOLO in italiano.\n" +
    "Principio: diagnosi strutturata, mai generica. Se i dati sono insufficienti, dillo esplicitamente.\n" +

    "\n═══ FORMATO RISPOSTA OBBLIGATORIO ═══\n" +
    "Usa SEMPRE queste sezioni in quest'ordine esatto (titolo in maiuscolo + due punti):\n" +
    sections.map((s, i) => (i + 1) + ") " + s + ":").join("\n") +

    "\n\n─── ISTRUZIONI PER SEZIONE ───\n" +
    "OSSERVAZIONI: elenca solo fatti presenti nel testo o visibili nella foto. Zero inferenze. Se non ci sono foto scrivilo.\n" +
    "COMPONENTI COINVOLTI: elenca solo componenti citati dall'utente o visibili nell'immagine, con sigla/modello se noti.\n" +
    "IPOTESI: ogni voce deve iniziare con [CONFERMATO], [PROBABILE] o [DA_VERIFICARE]. Spiega brevemente il ragionamento.\n" +
    "VERIFICHE OPERATIVE: elenco numerato. Ogni passo DEVE indicare:\n" +
    "  • Strumento (es: multimetro VAC, pinza amperometrica, megohmetro 500V)\n" +
    "  • Punto di misura esatto (es: morsetti L1-N del differenziale, uscita T1-T2 del contattore)\n" +
    "  • Valore atteso (es: 230V ±10%, >1MΩ, <0.5Ω)\n" +
    "RISCHI REALI: massimo 3 righe, solo rischi concreti e specifici per questo caso. Niente avvisi generici.\n" +
    "PROSSIMO PASSO: UNA SOLA azione concreta da fare adesso. Non una lista.\n" +

    "\n─── REGOLA ANTI-ALLUCINAZIONE ───\n" +
    "Se mancano dati sufficienti per una diagnosi:\n" +
    "- NON inventare cause\n" +
    "- Scrivere nella sezione OSSERVAZIONI: 'DATI INSUFFICIENTI — servono: [dato1], [dato2]'\n" +
    "- Chiedere massimo 2 informazioni precise all'utente\n" +

    "\n─── FRASI VIETATE (non usare mai) ───\n" +
    banned.map((f) => "✗ \"" + f + "\"").join("\n") +

    "\n\n─── REGOLE DI SICUREZZA E TECNICHE ───\n" +
    rules.map((r) => "• " + r).join("\n") +

    "\n\n─── CONTESTO KNOWLEDGE BASE ───\n" +
    (ragContext ? ragContext : "(nessun contesto disponibile)") +
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