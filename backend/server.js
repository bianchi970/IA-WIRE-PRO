/**
 * IA WIRE PRO - server.js (NASA Stable + DB Encyclopedia RAG)
 * Node + Express + (Anthropic / OpenAI) + Multer + Static Frontend + Postgres (Enciclopedia)
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const multer = require("multer");

const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const rocco = require("./rocco");
const { fetchKnowledgeContext, getLoadedKnowledge } = require("./knowledge");
const { analyzeTechnicalRequest, formatDiagnosticContext, formatOfflineAnswer, TEST_CASE } = require("./engine/diagnosticEngine");
// ✅ DB pool (protetto: non deve mai far crashare il server)
let pool = null;
try {
  ({ pool } = require("./db"));
} catch (e) {
  console.warn("⚠️ DB non disponibile, RAG DB disattivato:", e?.message || e);
}

// ✅ Knowledge base locale (lazy-loaded al primo uso in fetchKnowledgeContext)
// Pre-caricamento a startup per validazione
let _knowledgeCounts = { components: 0, patterns: 0, rules: 0, protocols: 0 };
try {
  const fs = require("fs");
  const path = require("path");
  const kDir = path.join(__dirname, "knowledge");
  function _countItems(file, key) {
    try { var d = JSON.parse(fs.readFileSync(path.join(kDir, file), "utf8")); return (d[key] || []).length; } catch (_) { return 0; }
  }
  _knowledgeCounts.components = _countItems("components.json", "items");
  _knowledgeCounts.patterns   = _countItems("failure_patterns.json", "patterns");
  _knowledgeCounts.rules      = _countItems("protection_rules.json", "rules");
  _knowledgeCounts.protocols  = _countItems("safety_protocols.json", "protocols");
} catch (_) {}

// =========================
// CONFIG
// =========================
const app = express();
console.log("✅ RUNNING FILE: backend/server.js - BUILD:", new Date().toISOString());

const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, "../frontend");

// Limiti prudenziali
const JSON_LIMIT = process.env.JSON_LIMIT || "12mb";
const MULTIPART_FILE_MAX = 5 * 1024 * 1024; // 5MB
const HISTORY_MAX = Number(process.env.HISTORY_MAX || 10);
const SUMMARY_THRESHOLD = Number(process.env.SUMMARY_THRESHOLD || 14);
const PREFERRED_PROVIDER = (process.env.PREFERRED_PROVIDER || "openai").toLowerCase().trim();

// Provider keys + modelli (trim anti newline)
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const ANTHROPIC_MODEL = (process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307").trim();

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

// Modalità formato (sempre consigliata)
const STRICT_FORMAT = String(process.env.STRICT_FORMAT || "1").trim() !== "0";

// =========================
// MIDDLEWARE
// =========================
// ✅ CORS robusto (compatibilità totale)
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));

// Multer (upload file binari) - ✅ compatibile totale sui fieldname
const uploadAny = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MULTIPART_FILE_MAX },
}).any(); // <-- prende qualunque field file

// =========================
// CLIENTS
// =========================
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// =========================
// UTILS
// =========================
/**
 * Ritorna la coda ordinata dei provider da tentare.
 * Il primo ha priorità; il secondo è il fallback automatico.
 */
function buildProviderQueue(requested) {
  const req = String(requested || "").toLowerCase().trim();
  const available = [];
  if (openai)    available.push("openai");
  if (anthropic) available.push("anthropic");
  if (!available.length) return [];
  if (req === "openai"    || req === "gpt")    return reorder(available, "openai");
  if (req === "anthropic" || req === "claude") return reorder(available, "anthropic");
  return reorder(available, PREFERRED_PROVIDER);
}

function reorder(arr, first) {
  if (!arr.includes(first)) return arr.slice();
  return [first].concat(arr.filter(function (p) { return p !== first; }));
}

function safeSliceHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-HISTORY_MAX).map((m) => ({
    role: m && m.role === "assistant" ? "assistant" : "user",
    content: String((m && m.content) || ""),
  }));
}

// Accetta immagine come base64 dataURL o base64 puro
function normalizeBase64Image(imageBase64) {
  if (!imageBase64) return null;
  const s = String(imageBase64 || "");
  const m = s.match(/^data:(image\/\w+);base64,(.+)$/i);
  if (m) return { mime: m[1], b64: m[2] };
  return { mime: "image/png", b64: s };
}

// Parse history robusto: accetta array oppure stringa JSON
function parseHistory(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

// ✅ Trova un file immagine tra tanti fieldname (compatibilità totale)
function pickFirstImageFile(files) {
  const arr = Array.isArray(files) ? files : [];
  if (!arr.length) return null;

  // Priorità: field più comuni
  const preferredNames = new Set(["image", "file", "photo", "picture", "img"]);
  const byPreferred = arr.find((f) => preferredNames.has(String(f.fieldname || "").toLowerCase()));
  if (byPreferred) return byPreferred;

  // Poi: primo con mimetype immagine
  const byMime = arr.find((f) => String(f.mimetype || "").startsWith("image/"));
  if (byMime) return byMime;

  // Fallback: primo file disponibile
  return arr[0] || null;
}

// =========================
// DB HELPERS (Enciclopedia "RAG" keyword → FULL TEXT)
// =========================
async function fetchEncyclopediaContext(queryText) {
  const q = String(queryText || "").trim();
  if (!q) return { components: [], issues: [] };
  if (!pool) return { components: [], issues: [] };

  const compSql = `
    SELECT
      id, category, name, type, brand, model, technical_specs,
      ts_rank(
        to_tsvector('italian',
          coalesce(category,'') || ' ' ||
          coalesce(name,'') || ' ' ||
          coalesce(type,'') || ' ' ||
          coalesce(brand,'') || ' ' ||
          coalesce(model,'') || ' ' ||
          coalesce(technical_specs::text,'')
        ),
        plainto_tsquery('italian', $1)
      ) AS rank
    FROM components
    WHERE to_tsvector('italian',
      coalesce(category,'') || ' ' ||
      coalesce(name,'') || ' ' ||
      coalesce(type,'') || ' ' ||
      coalesce(brand,'') || ' ' ||
      coalesce(model,'') || ' ' ||
      coalesce(technical_specs::text,'')
    ) @@ plainto_tsquery('italian', $1)
    ORDER BY rank DESC, id DESC
    LIMIT 5
  `;

  let comps;
  try {
    comps = await pool.query(compSql, [q]);
  } catch (e) {
    console.warn("⚠️ FTS components query failed:", e?.message || e);
    return { components: [], issues: [] };
  }

  const componentIds = (comps.rows || [])
    .map((r) => parseInt(r.id, 10))
    .filter(Number.isFinite);

  if (!componentIds.length) return { components: comps.rows || [], issues: [] };

  const issuesSql = `
    SELECT id, component_id, title, symptoms, probable_causes, tests, fixes, certainty_logic
    FROM issues
    WHERE component_id = ANY($1::int[])
    ORDER BY id DESC
    LIMIT 10
  `;

  const iss = await pool.query(issuesSql, [componentIds]);
  return { components: comps.rows || [], issues: iss.rows || [] };
}

function formatEncyclopediaContext(ctx) {
  const components = Array.isArray(ctx?.components) ? ctx.components : [];
  const issues = Array.isArray(ctx?.issues) ? ctx.issues : [];

  if (components.length === 0 && issues.length === 0) return "";

  const lines = [];
  lines.push("CONTESTO TECNICO (DAL DB INTERNO IA WIRE PRO):");

  if (components.length) {
    lines.push("");
    lines.push("COMPONENTI TROVATI:");
    for (const c of components) {
      lines.push(
        `- [component_id=${c.id}] ${c.category} | ${c.type} | ${(c.brand || "").trim()} ${(c.model || "").trim()} | ${c.name}`
      );
      if (c.technical_specs) lines.push(`  specs: ${JSON.stringify(c.technical_specs)}`);
    }
  }

  if (issues.length) {
    lines.push("");
    lines.push("GUASTI / CASI ASSOCIATI:");
    for (const i of issues) {
      lines.push(`- [issue_id=${i.id}] (component_id=${i.component_id}) ${i.title}`);
      if (i.symptoms) lines.push(`  symptoms: ${JSON.stringify(i.symptoms)}`);
      if (i.probable_causes) lines.push(`  probable_causes: ${JSON.stringify(i.probable_causes)}`);
      if (i.tests) lines.push(`  tests: ${JSON.stringify(i.tests)}`);
      if (i.fixes) lines.push(`  fixes: ${JSON.stringify(i.fixes)}`);
      if (i.certainty_logic) lines.push(`  certainty_logic: ${String(i.certainty_logic)}`);
    }
  }

  lines.push("");
  lines.push("ISTRUZIONI: usa questo contesto SOLO se pertinente. Se non basta, chiedi misure/foto.");
  return lines.join("\n");
}

// =========================
// DB HELPERS — Doc Chunks RAG (FASE 4)
// =========================

/**
 * Cerca i top 3 chunk più pertinenti in doc_chunks.
 * Strategia: FTS italiano → fallback ILIKE su singole parole chiave.
 */
async function fetchDocChunks(queryText) {
  const q = String(queryText || "").trim().slice(0, 200);
  if (!q || !pool) return [];
  try {
    // Tentativo 1: FTS italiano (plainto_tsquery)
    const ftsRes = await pool.query(
      `SELECT id, source, chunk_text FROM doc_chunks
       WHERE to_tsvector('italian', chunk_text) @@ plainto_tsquery('italian', $1)
       ORDER BY id DESC LIMIT 3`,
      [q]
    );
    if (ftsRes.rows.length > 0) return ftsRes.rows;

    // Tentativo 2: ILIKE su singole parole chiave (fallback per query brevi/straniere)
    const words = q.split(/\s+/).filter(function (w) { return w.length > 3; }).slice(0, 3);
    if (!words.length) return [];
    const conditions = words.map(function (_, i) { return "chunk_text ILIKE $" + (i + 1); });
    const params = words.map(function (w) { return "%" + w + "%"; });
    const likeRes = await pool.query(
      "SELECT id, source, chunk_text FROM doc_chunks WHERE " + conditions.join(" OR ") + " LIMIT 3",
      params
    );
    return likeRes.rows || [];
  } catch (e) {
    console.warn("⚠️ fetchDocChunks failed:", (e && e.message) || e);
    return [];
  }
}

function formatDocChunks(chunks) {
  if (!Array.isArray(chunks) || !chunks.length) return "";
  const lines = ["CONTESTO TECNICO DA MANUALE:"];
  for (var i = 0; i < chunks.length; i++) {
    var c = chunks[i];
    lines.push("");
    lines.push("[fonte: " + (c.source || "manuale") + "]");
    lines.push(String(c.chunk_text || "").trim());
  }
  lines.push("");
  lines.push("ISTRUZIONE: usa questo contesto SOLO se pertinente alla domanda.");
  return lines.join("\n");
}

// =========================
// DB HELPERS — Conversations & Messages
// =========================

/**
 * Crea una nuova conversation e restituisce il suo id.
 * Restituisce null se il DB non è disponibile o in caso di errore.
 */
async function convCreate({ title = null, user_id = null } = {}) {
  if (!pool) return null;
  try {
    const r = await pool.query(
      `INSERT INTO conversations (title, user_id) VALUES ($1, $2) RETURNING id`,
      [title || null, user_id || null]
    );
    return r.rows[0]?.id || null;
  } catch (e) {
    console.warn("⚠️ convCreate failed:", e?.message || e);
    return null;
  }
}

/**
 * Inserisce un messaggio nella tabella messages.
 * Restituisce l'id del messaggio inserito o null.
 */
async function msgInsert({ conversation_id, role, content, content_format = "text", provider = null, model = null, certainty = null, meta_json = null } = {}) {
  if (!pool || !conversation_id) return null;
  try {
    const r = await pool.query(
      `INSERT INTO messages
         (conversation_id, role, content, content_format, provider, model, certainty, meta_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        conversation_id,
        role,
        content,
        content_format,
        provider || null,
        model || null,
        certainty || null,
        meta_json != null ? JSON.stringify(meta_json) : null,
      ]
    );
    return r.rows[0]?.id || null;
  } catch (e) {
    console.warn("⚠️ msgInsert failed:", e?.message || e);
    return null;
  }
}

/**
 * Estrae il valore di "LIVELLO DI CERTEZZA" dal testo della risposta.
 * Accetta solo: Confermato | Probabile | Non verificabile
 * Restituisce null se non trovato o non riconosciuto.
 */
const CERTAINTY_VALID = new Set(["Confermato", "Probabile", "Non verificabile"]);

function extractCertainty(text) {
  const m = String(text || "").match(/LIVELLO DI CERTEZZA\s*:\s*-?\s*([^\n]+)/i);
  if (!m) return null;
  const raw = m[1].trim();
  for (const v of CERTAINTY_VALID) {
    if (raw.toLowerCase().includes(v.toLowerCase())) return v;
  }
  return null;
}

/**
 * Aggiorna updated_at della conversation (fire-and-forget, non blocca la risposta).
 */
async function convTouch(id) {
  if (!pool || !id) return;
  try {
    await pool.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [id]);
  } catch (e) {
    console.warn("⚠️ convTouch failed:", e?.message || e);
  }
}

/**
 * Genera un riassunto contestuale della conversazione (fire-and-forget).
 * Si attiva solo quando il numero di messaggi supera SUMMARY_THRESHOLD.
 */
async function generateContextSummary(convId, provider) {
  if (!pool || !convId) return;
  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) AS cnt FROM messages WHERE conversation_id = $1 AND role IN ('user','assistant')`,
      [convId]
    );
    const cnt = parseInt(((countRes.rows[0] && countRes.rows[0].cnt) || "0"), 10);
    if (cnt < SUMMARY_THRESHOLD) return;

    const r = await pool.query(
      `SELECT role, content FROM messages
       WHERE conversation_id = $1 AND role IN ('user','assistant')
       ORDER BY created_at ASC`,
      [convId]
    );
    const msgs = r.rows || [];
    if (!msgs.length) return;

    const convText = msgs
      .map(function (m) { return m.role.toUpperCase() + ": " + String(m.content || "").slice(0, 400); })
      .join("\n");

    const summaryPrompt =
      "Sei un assistente tecnico. Riassumi in 5-8 punti le informazioni tecniche chiave di questa conversazione " +
      "(componenti, problemi, diagnosi, misure, contesto). Sii conciso e tecnico. Non aggiungere premesse.\n\n" +
      "CONVERSAZIONE:\n" + convText;

    let summary = null;
    const chosen = provider || (openai ? "openai" : anthropic ? "anthropic" : null);

    if (chosen === "openai" && openai) {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: summaryPrompt }],
        temperature: 0.1,
        max_tokens: 400,
      });
      summary = (completion && completion.choices && completion.choices[0] &&
                 completion.choices[0].message && completion.choices[0].message.content) || null;
    } else if (chosen === "anthropic" && anthropic) {
      const resp = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        temperature: 0.1,
        messages: [{ role: "user", content: summaryPrompt }],
      });
      const blocks = Array.isArray(resp && resp.content ? resp.content : null) ? resp.content : [];
      summary = blocks
        .filter(function (b) { return b && b.type === "text"; })
        .map(function (b) { return b.text; })
        .join("\n").trim() || null;
    }

    if (summary) {
      await pool.query(`UPDATE conversations SET summary = $1 WHERE id = $2`, [summary, convId]);
      console.log("  \uD83D\uDCDD Summary aggiornato per conversation " + convId + " (" + cnt + " msg)");
    }
  } catch (e) {
    console.warn("\u26A0\uFE0F generateContextSummary failed:", (e && e.message) || e);
  }
}

// Forza struttura IA Wire Pro se il modello non la rispetta
function ensureWireFormat(text) {
  const t = String(text || "").trim();
  if (!t) {
    return [
      "OSSERVAZIONI:",
      "- (risposta vuota)",
      "",
      "IPOTESI:",
      "- Non verificabile",
      "",
      "LIVELLO DI CERTEZZA:",
      "- Non verificabile",
      "",
      "RISCHI / SICUREZZA:",
      "- Verifica alimentazioni e isolamento prima di intervenire.",
      "",
      "VERIFICHE CONSIGLIATE:",
      "1) Invia una foto più ravvicinata e nitida.",
      "2) Indica marca/modello e cosa hai già verificato.",
      "",
      "PROSSIMO PASSO:",
      "- Inviami un dettaglio del componente principale.",
    ].join("\n");
  }

  const hasObs = /OSSERVAZIONI\s*:/i.test(t);
  const hasHyp = /IPOTESI\s*:/i.test(t);
  const hasCert = /LIVELLO DI CERTEZZA\s*:/i.test(t);
  const hasChecks = /VERIFICHE CONSIGLIATE\s*:/i.test(t);

  if (hasObs && hasHyp && hasCert && hasChecks) return t;

  // ✅ neutro (non "termico" fisso)
  return [
    "OSSERVAZIONI:",
    "- " + t.replace(/\n+/g, "\n- "),
    "",
    "IPOTESI:",
    "- Probabile: servono conferme con misure/foto aggiuntive.",
    "",
    "LIVELLO DI CERTEZZA:",
    "- Probabile (dati incompleti).",
    "",
    "RISCHI / SICUREZZA:",
    "- Prima di intervenire: disalimenta, verifica assenza tensione/pressione dove applicabile, usa DPI adeguati.",
    "",
    "VERIFICHE CONSIGLIATE:",
    "1) Invia un dettaglio ravvicinato del componente/collegamenti (foto nitida).",
    "2) Indica marca/modello e cosa hai già misurato o verificato.",
    "3) Se possibile, fornisci valori misurati (es. tensione, continuità, pressione, temperatura) e condizioni di prova.",
    "",
    "PROSSIMO PASSO:",
    "- Inviami il dettaglio più ravvicinato del componente principale (o i valori misurati).",
  ].join("\n");
}

// ============================================================
// OFFLINE FALLBACK HELPER
// Rileva errori di rete (DNS, timeout, connection reset)
// ============================================================
function isNetworkError(err) {
  if (!err) return false;
  var code = String(err.code || "");
  var msg  = String(err.message || "").toLowerCase();
  var NET_CODES = ["ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENETUNREACH"];
  if (NET_CODES.indexOf(code) >= 0) return true;
  return msg.indexOf("enotfound") >= 0 ||
         msg.indexOf("etimedout") >= 0 ||
         msg.indexOf("econnreset") >= 0 ||
         msg.indexOf("fetch failed") >= 0 ||
         msg.indexOf("network") >= 0;
}

// =========================
// STRATO 0: SICUREZZA
// =========================
const SAFETY_PROMPT = [
  "[IA WIRE PRO — STRATO 0: SICUREZZA INTEGRATA V1]",
  "",
  "PRINCIPIO ASSOLUTO:",
  "La sicurezza di persone e cose ha priorità assoluta. Non fornire mai istruzioni che aumentino il rischio o aggirino dispositivi/procedure di sicurezza.",
  "",
  "AZIONI VIETATE (NON SUGGERIRE MAI):",
  "- Rimuovere o disconnettere il conduttore di protezione (terra).",
  "- Bypassare/ponteggiare differenziali (RCD), magnetotermici o altri dispositivi di protezione.",
  "- Suggerire lavori su parti sotto tensione o su impianti attivi senza procedure e strumenti idonei.",
  "- Consigliare di aumentare il calibro di una protezione senza verifica tecnica completa.",
  "",
  "REGOLE OPERATIVE OBBLIGATORIE:",
  "- Se dai passi operativi: presumi impianto disalimentato e includi verifica assenza tensione/condizione di sicurezza prima di toccare parti interne.",
  "- Se l'intervento è ad alto rischio (odore di bruciato, componenti fusi, gas/pressione): fermati e indica intervento di tecnico qualificato.",
  "",
  "NO CERTEZZE SENZA VERIFICHE:",
  "Non dire \"\u00e8 sicuramente\u2026\" senza dati/misure/evidenza.",
  "",
  "PRUDENZA TECNICA:",
  "Se manca un parametro critico, inserisci:",
  "⚠ In assenza di dati certi, qualsiasi valutazione tecnica potrebbe risultare imprecisa ed errata.",
].join("\n");

function buildSystemPrompt() {
  return [
    SAFETY_PROMPT,
    "",
    "SEI: IA WIRE PRO (Assistente Tecnico Virtuale).",
    "OBIETTIVO: aiutare in modo tecnico, prudente e verificabile.",
    "",
    "REGOLE DI AFFIDABILITÀ (OBBLIGATORIE):",
    "1) Non dare mai una diagnosi certa con dati incompleti.",
    "2) Se mancano informazioni, fai domande mirate e proponi verifiche misurabili.",
    "3) Dichiara SEMPRE un livello di certezza tra: Confermato / Probabile / Non verificabile.",
    "4) Evidenzia SEMPRE rischi e sicurezza.",
    "",
    "FORMATO RISPOSTA (OBBLIGATORIO, SEMPRE):",
    "OSSERVAZIONI:",
    "- ...",
    "",
    "IPOTESI:",
    "- (Confermato/Probabile/Non verificabile) ...",
    "",
    "LIVELLO DI CERTEZZA:",
    "- Confermato | Probabile | Non verificabile",
    "",
    "RISCHI / SICUREZZA:",
    "- ...",
    "",
    "VERIFICHE CONSIGLIATE:",
    "1) ...",
    "2) ...",
    "3) ...",
    "",
    "PROSSIMO PASSO:",
    "- una sola azione concreta da fare adesso.",
  ].join("\n");
}

// =========================
// AI CALL HELPERS (FASE 6)
// =========================

async function callOpenAI({ systemPrompt, shortHistory, imageBase64, message, dbContextText, docChunksText, knowledgeText, engineText }) {
  if (!openai) throw new Error("OpenAI non configurato");
  const messages = [{ role: "system", content: systemPrompt }].concat(shortHistory);
  if (dbContextText) messages.push({ role: "system", content: dbContextText });
  if (docChunksText) messages.push({ role: "system", content: docChunksText });
  if (knowledgeText) messages.push({ role: "system", content: knowledgeText });
  if (engineText) messages.push({ role: "system", content: engineText });

  if (imageBase64) {
    const img = normalizeBase64Image(imageBase64);
    messages.push({
      role: "user",
      content: [
        { type: "text", text: message },
        { type: "image_url", image_url: { url: "data:" + img.mime + ";base64," + img.b64 } },
      ],
    });
  } else {
    messages.push({ role: "user", content: message });
  }

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    temperature: 0.1,
  });
  const answer = (completion && completion.choices && completion.choices[0] &&
                  completion.choices[0].message && completion.choices[0].message.content) || "Nessuna risposta.";
  return { answer, model: OPENAI_MODEL };
}

async function callAnthropic({ systemPrompt, shortHistory, imageBase64, message, dbContextText, docChunksText, knowledgeText, engineText }) {
  if (!anthropic) throw new Error("Anthropic non configurato");
  const msgs = shortHistory.slice();

  if (imageBase64) {
    const img = normalizeBase64Image(imageBase64);
    msgs.push({
      role: "user",
      content: [
        { type: "text", text: message },
        { type: "image", source: { type: "base64", media_type: img.mime, data: img.b64 } },
      ],
    });
  } else {
    msgs.push({ role: "user", content: message });
  }

  const sysContent = [systemPrompt, dbContextText, docChunksText, knowledgeText, engineText].filter(Boolean).join("\n\n");
  const resp = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 900,
    temperature: 0.1,
    system: sysContent,
    messages: msgs,
  });

  const blocks = Array.isArray(resp && resp.content ? resp.content : null) ? resp.content : [];
  const answer = blocks
    .filter(function (b) { return b && b.type === "text"; })
    .map(function (b) { return b.text; })
    .join("\n").trim() || "Nessuna risposta.";
  return { answer, model: ANTHROPIC_MODEL };
}

// =========================
// ROUTES (API prima)
// =========================
app.get("/health", async (req, res) => {
  let dbOk = false;
  let dbTime = null;

  if (pool) {
    try {
      const r = await pool.query("select now() as now");
      dbOk = true;
      dbTime = r.rows?.[0]?.now || null;
    } catch (_) {}
  }

  res.json({
    ok: true,
    time: new Date().toISOString(),
    signature: "ROCCO-CHAT-V2",
    runningFile: "backend/server.js",
    strictFormat: STRICT_FORMAT,
    db: { connected: dbOk, now: dbTime },
    providers: {
      anthropicConfigured: Boolean(anthropic),
      openaiConfigured: Boolean(openai),
    },
    models: {
      anthropic: ANTHROPIC_MODEL,
      openai: OPENAI_MODEL,
    },
  });
});

// ENCICLOPEDIA: elenco componenti
app.get("/api/components", async (req, res) => {
  try {
    if (!pool) return res.json({ ok: true, count: 0, items: [], note: "DB non configurato" });

    const search = (req.query.search || "").toString().trim();
    const category = (req.query.category || "").toString().trim();
    const type = (req.query.type || "").toString().trim();
    const brand = (req.query.brand || "").toString().trim();
    const limit = Math.min(parseInt(req.query.limit || "20", 10) || 20, 100);

    const where = [];
    const params = [];

    if (search) {
      params.push(search);
      where.push(`
        to_tsvector('italian',
          coalesce(category,'') || ' ' ||
          coalesce(name,'') || ' ' ||
          coalesce(type,'') || ' ' ||
          coalesce(brand,'') || ' ' ||
          coalesce(model,'') || ' ' ||
          coalesce(technical_specs::text,'')
        ) @@ plainto_tsquery('italian', $${params.length})
      `);
    }
    if (category) {
      params.push(category);
      where.push(`category = $${params.length}`);
    }
    if (type) {
      params.push(type);
      where.push(`type = $${params.length}`);
    }
    if (brand) {
      params.push(brand);
      where.push(`brand = $${params.length}`);
    }

    params.push(limit);

    const sql = `
      SELECT id, category, name, type, brand, model, technical_specs, created_at, updated_at
      FROM components
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY id DESC
      LIMIT $${params.length}
    `;

    const r = await pool.query(sql, params);
    res.json({ ok: true, count: r.rowCount, items: r.rows });
  } catch (err) {
    console.error("❌ /api/components error:", err);
    res.status(500).json({ ok: false, error: "Errore lettura components" });
  }
});

// ENCICLOPEDIA: issues per componente
app.get("/api/components/:id/issues", async (req, res) => {
  try {
    if (!pool) return res.json({ ok: true, count: 0, items: [], note: "DB non configurato" });

    const componentId = parseInt(req.params.id, 10);
    if (!componentId) return res.status(400).json({ ok: false, error: "id non valido" });

    const sql = `
      SELECT id, component_id, title, symptoms, probable_causes, tests, fixes, certainty_logic, created_at, updated_at
      FROM issues
      WHERE component_id = $1
      ORDER BY id DESC
    `;
    const r = await pool.query(sql, [componentId]);
    res.json({ ok: true, count: r.rowCount, items: r.rows });
  } catch (err) {
    console.error("❌ /api/components/:id/issues error:", err);
    res.status(500).json({ ok: false, error: "Errore lettura issues" });
  }
});

// =========================
// ROUTES — Conversations
// =========================

// GET /api/conversations?user_id=&archived=0&limit=50
app.get("/api/conversations", async (req, res) => {
  try {
    if (!pool) return res.json({ ok: true, count: 0, items: [], note: "DB non configurato" });

    const user_id = (req.query.user_id || "").toString().trim() || null;
    const archived = req.query.archived === "1";
    const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 200);

    const where = ["is_archived = $1"];
    const params = [archived];

    if (user_id) {
      params.push(user_id);
      where.push(`user_id = $${params.length}`);
    }

    params.push(limit);

    const sql = `
      SELECT id, title, user_id, created_at, updated_at, is_archived
      FROM conversations
      WHERE ${where.join(" AND ")}
      ORDER BY updated_at DESC
      LIMIT $${params.length}
    `;

    const r = await pool.query(sql, params);
    res.json({ ok: true, count: r.rowCount, items: r.rows });
  } catch (err) {
    console.error("❌ GET /api/conversations error:", err);
    res.status(500).json({ ok: false, error: "Errore lettura conversations" });
  }
});

// POST /api/conversations
app.post("/api/conversations", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ ok: false, error: "DB non configurato" });

    const { title, user_id } = req.body || {};

    const r = await pool.query(
      `INSERT INTO conversations (title, user_id) VALUES ($1, $2) RETURNING *`,
      [title || null, user_id || null]
    );
    res.status(201).json({ ok: true, item: r.rows[0] });
  } catch (err) {
    console.error("❌ POST /api/conversations error:", err);
    res.status(500).json({ ok: false, error: "Errore creazione conversation" });
  }
});

// GET /api/conversations/:id  (con messaggi inclusi)
app.get("/api/conversations/:id", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ ok: false, error: "DB non configurato" });

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: "id non valido" });

    const conv = await pool.query(
      `SELECT id, title, user_id, created_at, updated_at, is_archived
       FROM conversations WHERE id = $1`,
      [id]
    );
    if (!conv.rows.length) return res.status(404).json({ ok: false, error: "Conversation non trovata" });

    const msgs = await pool.query(
      `SELECT id, role, content, content_format, provider, model, certainty, meta_json, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    res.json({ ok: true, item: conv.rows[0], messages: msgs.rows });
  } catch (err) {
    console.error("❌ GET /api/conversations/:id error:", err);
    res.status(500).json({ ok: false, error: "Errore lettura conversation" });
  }
});

// PATCH /api/conversations/:id  (title, is_archived)
app.patch("/api/conversations/:id", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ ok: false, error: "DB non configurato" });

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: "id non valido" });

    const fields = [];
    const params = [];

    if (req.body.title !== undefined) {
      params.push(req.body.title);
      fields.push(`title = $${params.length}`);
    }
    if (req.body.is_archived !== undefined) {
      params.push(Boolean(req.body.is_archived));
      fields.push(`is_archived = $${params.length}`);
    }

    if (!fields.length) return res.status(400).json({ ok: false, error: "Nessun campo da aggiornare" });

    params.push(id);
    const r = await pool.query(
      `UPDATE conversations
       SET ${fields.join(", ")}, updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING *`,
      params
    );
    if (!r.rowCount) return res.status(404).json({ ok: false, error: "Conversation non trovata" });

    res.json({ ok: true, item: r.rows[0] });
  } catch (err) {
    console.error("❌ PATCH /api/conversations/:id error:", err);
    res.status(500).json({ ok: false, error: "Errore aggiornamento conversation" });
  }
});

// DELETE /api/conversations/:id
app.delete("/api/conversations/:id", async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ ok: false, error: "DB non configurato" });

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: "id non valido" });

    const r = await pool.query(`DELETE FROM conversations WHERE id = $1`, [id]);
    if (!r.rowCount) return res.status(404).json({ ok: false, error: "Conversation non trovata" });

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ DELETE /api/conversations/:id error:", err);
    res.status(500).json({ ok: false, error: "Errore eliminazione conversation" });
  }
});

// GET /api/conversations/:id/messages
app.get("/api/conversations/:id/messages", async (req, res) => {
  try {
    if (!pool) return res.json({ ok: true, count: 0, items: [], note: "DB non configurato" });

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: "id non valido" });

    const limit = Math.min(parseInt(req.query.limit || "100", 10) || 100, 500);

    const r = await pool.query(
      `SELECT id, role, content, content_format, provider, model, certainty, meta_json, created_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [id, limit]
    );

    res.json({ ok: true, count: r.rowCount, items: r.rows });
  } catch (err) {
    console.error("❌ GET /api/conversations/:id/messages error:", err);
    res.status(500).json({ ok: false, error: "Errore lettura messages" });
  }
});

/**
 * POST /api/chat
 * Supporta:
 * - multipart/form-data con QUALSIASI field file (image/file/photo/picture/...)
 * - JSON con imageBase64/image_base64/image
 * - conversation_id (opzionale): se assente e DB disponibile, crea una nuova conversation
 * - user_id (opzionale): usato solo alla creazione della conversation
 */
app.post("/api/chat", uploadAny, async (req, res) => {
  try {
    const body = req.body || {};

    let message = String(body.message || body.text || "").trim();
    const history = parseHistory(body.history);
    const provider = body.provider || null;
    const user_id = body.user_id || null;
    let convId = body.conversation_id ? parseInt(body.conversation_id, 10) || null : null;

    // ✅ immagini: prende il primo file immagine tra qualsiasi field
    let imageBase64 = null;
    const file = pickFirstImageFile(req.files);

    if (file?.buffer) {
      const base64 = file.buffer.toString("base64");
      imageBase64 = "data:" + (file.mimetype || "image/png") + ";base64," + base64;
    }

    if (!imageBase64) {
      const rawB64 = body.imageBase64 || body.image_base64 || body.image || null;
      if (rawB64) imageBase64 = String(rawB64);
    }

    if (!message && imageBase64) message = "Analizza l'immagine e descrivi cosa vedi in modo tecnico.";

    if (!message && !imageBase64) {
      return res.status(400).json({
        error: "Manca 'message' o immagine.",
        signature: "ROCCO-CHAT-V2",
        debug: {
          contentType: req.headers["content-type"],
          bodyKeys: Object.keys(req.body || {}),
          files: (req.files || []).map((f) => ({ field: f.fieldname, type: f.mimetype, size: f.size })),
        },
      });
    }

    // ===== CONVERSATION PERSISTENCE — utente =====
    if (pool) {
      try {
        if (!convId) {
          convId = await convCreate({
            title: message.slice(0, 80) || null,
            user_id,
          });
        }
        await msgInsert({
          conversation_id: convId,
          role: "user",
          content: message,
          content_format: "text",
          meta_json: imageBase64 ? { has_image: true } : null,
        });
      } catch (e) {
        console.warn("⚠️ Errore persistenza messaggio utente:", e?.message || e);
      }
    }

    // ===== LOAD HISTORY + SUMMARY FROM DB =====
    let dbHistory = null;
    let convSummary = null;
    if (pool && convId) {
      try {
        const hRes = await pool.query(
          `SELECT role, content FROM messages
           WHERE conversation_id = $1 AND role IN ('user','assistant')
           ORDER BY created_at DESC LIMIT $2`,
          [convId, HISTORY_MAX]
        );
        dbHistory = (hRes.rows || []).reverse();

        const sRes = await pool.query(
          `SELECT summary FROM conversations WHERE id = $1`,
          [convId]
        );
        convSummary = (sRes.rows[0] && sRes.rows[0].summary) || null;
      } catch (e) {
        console.warn("\u26A0\uFE0F Caricamento history/summary DB fallito:", (e && e.message) || e);
      }
    }

    // ===== ROCCO PLAN =====
    const plan = rocco.plan({
      message,
      hasImage: !!imageBase64,
      history
    });

    const ragContext = "";

    let systemPrompt = rocco.buildSystemPrompt(plan, ragContext);
    if (convSummary) {
      systemPrompt = "CONTESTO CONVERSAZIONE PRECEDENTE:\n" + convSummary + "\n\n" + systemPrompt;
    }
    const userPayload = rocco.buildUserPayload(message, history);

    const shortHistory = dbHistory
      ? dbHistory.map(function (m) { return { role: m.role, content: String(m.content || "") }; })
      : safeSliceHistory(history);

    // DB Context (encyclopedia RAG)
    let dbContextText = "";
    try {
      const ctx = await fetchEncyclopediaContext(message);
      dbContextText = formatEncyclopediaContext(ctx);
    } catch (e) {
      console.warn("⚠️ DB context non disponibile:", e?.message || e);
    }

    // Doc Chunks RAG (FASE 4)
    let docChunksText = "";
    try {
      const chunks = await fetchDocChunks(message);
      docChunksText = formatDocChunks(chunks);
    } catch (e) {
      console.warn("⚠️ Doc chunks non disponibili:", (e && e.message) || e);
    }

    // ===== KNOWLEDGE BASE LOCALE + ROCCO ENGINE (FASE 7) =====
    let knowledgeText = "";
    let engineText = "";
    let engineDiag = null;
    try {
      knowledgeText = fetchKnowledgeContext(message);
    } catch (e) {
      console.warn("⚠️ Knowledge context non disponibile:", (e && e.message) || e);
    }
    try {
      const _kb = getLoadedKnowledge();
      engineDiag = analyzeTechnicalRequest({ message, hasImage: !!imageBase64 }, {
        failurePatterns: _kb.failurePatterns,
        protectionRules: _kb.protectionRules,
      });
      engineText = formatDiagnosticContext(engineDiag);
      // FASE 5 — Safety Lock: se condizione pericolosa, forza avviso in testa al system prompt
      if (engineDiag && engineDiag.isDangerous && engineText) {
        systemPrompt = "⚠️ SAFETY LOCK ATTIVATO: condizione pericolosa rilevata dal motore di pre-analisi.\n" +
          "Priorità assoluta alla sicurezza. Indicare disconnessione immediata prima di qualsiasi test.\n\n" +
          systemPrompt;
      }
    } catch (e) {
      console.warn("⚠️ Diagnostic engine non disponibile:", (e && e.message) || e);
    }

    // ===== ROUTING MULTI-IA + FALLBACK (FASE 6) =====
    const queue = buildProviderQueue(provider);
    if (!queue.length) {
      return res.status(500).json({
        error: "Nessun provider configurato: manca OPENAI_API_KEY e/o ANTHROPIC_API_KEY in .env",
      });
    }

    const callParams = { systemPrompt, shortHistory, imageBase64, message, dbContextText, docChunksText, knowledgeText, engineText };

    let answer = null;
    let usedProvider = null;
    let usedModel = null;
    let fallbackUsed = false;
    let lastErr = null;

    for (var qi = 0; qi < queue.length; qi++) {
      var p = queue[qi];
      if (qi > 0) {
        fallbackUsed = true;
        console.warn("  \u26A1 Fallback \u2192 " + p + " (primario fallito: " + ((lastErr && lastErr.message) || lastErr) + ")");
      }
      try {
        var result = p === "openai"
          ? await callOpenAI(callParams)
          : await callAnthropic(callParams);
        answer = result.answer;
        usedProvider = p;
        usedModel = result.model;
        break;
      } catch (err) {
        lastErr = err;
        console.warn("  \u26A0\uFE0F Provider " + p + " fallito:", (err && err.message) || err);
      }
    }

    // ===== OFFLINE FALLBACK (C) =====
    if (!answer) {
      // Se il fallimento è di rete E abbiamo un'analisi engine → risposta locale
      if (isNetworkError(lastErr) && engineDiag && engineDiag.isTechnical) {
        console.warn("  🔌 LLM irraggiungibile — risposta offline da ROCCO engine.");
        answer = formatOfflineAnswer(engineDiag, message);
        usedProvider = "offline_engine";
        usedModel    = "rocco-local-v2";
      } else {
        throw lastErr || new Error("Tutti i provider falliti");
      }
    }

    if (STRICT_FORMAT && usedProvider !== "offline_engine") answer = ensureWireFormat(answer);

    // Persistenza + summary
    await msgInsert({
      conversation_id: convId,
      role: "assistant",
      content: answer,
      content_format: "text",
      provider: usedProvider,
      model: usedModel,
      certainty: extractCertainty(answer),
    });
    await convTouch(convId);
    generateContextSummary(convId, usedProvider).catch(function () {});

    return res.json({
      ok: true,
      provider: usedProvider,
      model: usedModel,
      fallback_used: fallbackUsed,
      answer,
      conversation_id: convId,
      signature: "ROCCO-CHAT-V2",
      rag: { usedDbContext: Boolean(dbContextText), usedDocChunks: Boolean(docChunksText), usedKnowledge: Boolean(knowledgeText) },
      engine: engineDiag ? {
        active: true,
        isTechnical: engineDiag.isTechnical,
        isDangerous: engineDiag.isDangerous,
        matchedPatterns: engineDiag.matchedPatterns,
        matchedRules: engineDiag.matchedRules,
      } : { active: false },
    });
  } catch (err) {
    console.error("❌ /api/chat error:", err);
    return res.status(500).json({
      error: "Errore interno /api/chat",
      details: err?.message ? err.message : String(err),
      signature: "ROCCO-CHAT-V2",
    });
  }
});

// Upload binario "universale"
app.post("/api/upload", uploadAny, async (req, res) => {
  try {
    const file = pickFirstImageFile(req.files) || (Array.isArray(req.files) ? req.files[0] : null);
    if (!file) return res.status(400).json({ error: "Nessun file caricato." });

    res.json({
      ok: true,
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      fieldname: file.fieldname,
    });
  } catch (err) {
    console.error("❌ /api/upload error:", err);
    res.status(500).json({ error: "Errore upload", details: err?.message ? err.message : String(err) });
  }
});

// =========================
// ROCCO ENGINE TEST ENDPOINT (FASE 6)
// =========================

// GET /api/engine/test — esegue una diagnosi di test con caso hardcoded
app.get("/api/engine/test", (req, res) => {
  try {
    const input = { message: TEST_CASE.message, hasImage: TEST_CASE.hasImage };
    const _kb = getLoadedKnowledge();
    const diag = analyzeTechnicalRequest(input, { failurePatterns: _kb.failurePatterns, protectionRules: _kb.protectionRules });
    const ctx = formatDiagnosticContext(diag);
    const knCtx = fetchKnowledgeContext(TEST_CASE.message);

    res.json({
      ok: true,
      test_input: TEST_CASE.message,
      diagnostic: diag,
      formatted_engine_context: ctx,
      formatted_knowledge_context: knCtx,
      counts: _knowledgeCounts,
    });
  } catch (err) {
    console.error("❌ /api/engine/test error:", err);
    res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
  }
});

// =========================
// STATIC FRONTEND + SPA FALLBACK (alla fine)
// =========================
app.use(express.static(FRONTEND_DIR));

app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// Fallback SPA
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path === "/health") return next();
  return res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// Error handler
app.use((err, req, res, next) => {
  console.error("❌ Express error:", err);
  res.status(500).json({ error: "Errore server", details: err?.message ? err.message : String(err) });
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log(
    "\n" +
      "╔══════════════════════════════════════╗\n" +
      "║   🔌 IA WIRE PRO - Backend Attivo    ║\n" +
      "╠══════════════════════════════════════╣\n" +
      "║  Porta: " +
      String(PORT).padEnd(29) +
      "║\n" +
      "║  Frontend: " +
      String(FRONTEND_DIR).padEnd(26) +
      "║\n" +
      "║  StrictFormat: " +
      String(STRICT_FORMAT ? "ON" : "OFF").padEnd(21) +
      "║\n" +
      "║  OpenAI: " +
      String(OPENAI_API_KEY ? "✅ Configurata" : "❌ Mancante").padEnd(27) +
      "║\n" +
      "║  Anthropic: " +
      String(ANTHROPIC_API_KEY ? "✅ Configurata" : "❌ Mancante").padEnd(24) +
      "║\n" +
      "║  DB: " +
      String(pool ? "✅ Agganciato" : "⚠️ Non disponibile").padEnd(30) +
      "║\n" +
      "╚══════════════════════════════════════╝\n"
  );
  // FASE 7 — Console Validation
  console.log("ROCCO ENGINE: ACTIVE");
  console.log(
    "KNOWLEDGE ITEMS: " +
    _knowledgeCounts.components + " components, " +
    _knowledgeCounts.patterns + " failure_patterns, " +
    _knowledgeCounts.rules + " protection_rules, " +
    _knowledgeCounts.protocols + " safety_protocols"
  );
});
