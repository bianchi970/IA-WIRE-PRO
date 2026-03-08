/**
 * IA WIRE PRO - server.js (NASA Stable + DB Encyclopedia RAG)
 * Node + Express + (Anthropic / OpenAI) + Multer + Static Frontend + Postgres (Enciclopedia)
 */

const path   = require("path");
const logger = require("./logger");
require("dotenv").config({ path: path.join(__dirname, ".env") });
if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  logger.warn("no AI API key configured");
}

const express = require("express");
const cors = require("cors");
const multer = require("multer");

const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const { Ollama } = require("ollama");
const rocco = require("./rocco");
const { fetchKnowledgeContext, getLoadedKnowledge } = require("./knowledge");
const { analyzeTechnicalRequest, formatDiagnosticContext, formatOfflineAnswer, TEST_CASE } = require("./engine/diagnosticEngine");
const { normalizeCertainty } = require("./utils/certainty");
const { extractComponents, formatComponents } = require("./rocco/componentRecognizer");
const { extractElectricalValues, formatElectricalValues, checkAnomalies } = require("./rocco/numericRecognizer");
const { runFoundationEngine } = require("./rocco/engine");
const { runCalcEngine,
        calcola_ib, calcola_sezione, verifica_coordinamento,
        calcola_dv, calcola_icc, calcola_pe,
        seleziona_differenziale, seleziona_curva,
        calcola_terra, verifica_obbligo_progetto,
        calcola_sezione_da_dv } = require("./rocco/calcEngine");

// ROCCO MEMORIA v7 + ROCCO UNIVERSITY
let roccoMemoria = null;
try {
  roccoMemoria = require('./rocco/rocco_memoria');
} catch (e) {
  console.warn('[ROCCO MEMORIA] Non disponibile:', e && e.message);
}
let roccoUniversity = null;
try {
  roccoUniversity = require('./modules/rocco_university');
} catch (e) {
  console.warn('[ROCCO UNIVERSITY] Non disponibile:', e && e.message);
}

// ROCCO RUNNER — cervello deduttivo dinamico (wrappa callAnthropic con buildSystemPrompt)
let runRocco = null;
try {
  ({ runRocco } = require('./rocco/rocco_runner'));
  console.log('[ROCCO RUNNER] Cervello deduttivo caricato ✓');
} catch (e) {
  console.warn('[ROCCO RUNNER] Non disponibile:', e && e.message);
}

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
const SUMMARY_THRESHOLD = Number(process.env.SUMMARY_THRESHOLD || 10);
const PREFERRED_PROVIDER = (process.env.PREFERRED_PROVIDER || "openai").toLowerCase().trim();

// Provider keys + modelli (trim anti newline)
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const ANTHROPIC_MODEL = (process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001").trim();

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

// Modalità formato (sempre consigliata)
const STRICT_FORMAT = String(process.env.STRICT_FORMAT || "1").trim() !== "0";

// Admin token (opzionale — se non configurato l'admin è disabilitato)
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || "").trim();

// Ollama (motore LLM gratuito locale — FASE 5)
const OLLAMA_URL   = (process.env.OLLAMA_URL   || "http://localhost:11434").trim();
const OLLAMA_MODEL = (process.env.OLLAMA_MODEL || "mistral").trim();
let ollamaAvailable = false;

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
// MIDDLEWARE ADMIN AUTH
// =========================
function requireAdmin(req, res, next) {
  if (!ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: "ADMIN_TOKEN non configurato nel server" });
  }
  const auth = req.headers["authorization"] || "";
  const queryToken = (req.query && req.query.token) || "";
  const supplied = auth.startsWith("Bearer ") ? auth.slice(7).trim() : queryToken.trim();
  if (!supplied || supplied !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: "Token admin non valido" });
  }
  next();
}

// =========================
// CLIENTS
// =========================
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
const openai    = OPENAI_API_KEY    ? new OpenAI({ apiKey: OPENAI_API_KEY })    : null;

// Ollama client — ping asincrono all'avvio per rilevare disponibilità
const _ollamaClient = new Ollama({ host: OLLAMA_URL });
(async function pingOllama() {
  try {
    await _ollamaClient.list(); // risponde se Ollama è up
    ollamaAvailable = true;
    console.log("[OLLAMA] ✅ Disponibile su " + OLLAMA_URL + " — modello: " + OLLAMA_MODEL);
  } catch (_) {
    ollamaAvailable = false;
    console.log("[OLLAMA] ⚪ Non disponibile (" + OLLAMA_URL + ") — userò OpenAI/Anthropic");
  }
})();

// Init ROCCO MEMORIA schema + UNIVERSITY (non bloccante)
(async function initRoccoModules() {
  if (roccoMemoria) {
    roccoMemoria.init_schema().catch(function(e) {
      console.warn('[ROCCO MEMORIA] init_schema:', e && e.message);
    });
  }
  if (roccoUniversity) {
    roccoUniversity.init().catch(function(e) {
      console.warn('[ROCCO UNIVERSITY] init:', e && e.message);
    });
  }
})();

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
  // Ollama prima se disponibile (costo zero)
  if (ollamaAvailable)  available.push("ollama");
  if (openai)           available.push("openai");
  if (anthropic)        available.push("anthropic");
  if (!available.length) return [];
  if (req === "ollama")                        return reorder(available, "ollama");
  if (req === "openai"    || req === "gpt")    return reorder(available, "openai");
  if (req === "anthropic" || req === "claude") return reorder(available, "anthropic");
  // Default: PREFERRED_PROVIDER. Se non impostato e Ollama è up → Ollama primo
  const pref = PREFERRED_PROVIDER === "openai" && ollamaAvailable ? "ollama" : PREFERRED_PROVIDER;
  return reorder(available, pref);
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

/** Ritorna tutti i file immagine caricati (max 3) in ordine di fieldname. */
function pickAllImageFiles(files) {
  const arr = Array.isArray(files) ? files : [];
  const imgs = arr.filter((f) =>
    String(f.mimetype || "").startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.originalname || "")
  );
  return imgs.slice(0, 3);
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
 * Estrae il valore di "LIVELLO DI CERTEZZA" dal testo della risposta
 * e lo normalizza verso ALTA | MEDIA | BASSA tramite normalizeCertainty().
 * Restituisce null se la sezione non è trovata nel testo.
 */
function extractCertainty(text) {
  // Caso 1: valore sulla stessa riga
  var m = String(text || "").match(/LIVELLO DI CERTEZZA\s*:\s*-?\s*([^\n]+)/i);
  if (m && m[1].trim() && m[1].trim() !== "(dato non disponibile)") return normalizeCertainty(m[1]);
  // Caso 2: valore su riga successiva
  var m2 = String(text || "").match(/LIVELLO DI CERTEZZA\s*:\s*\n\s*([^\n]+)/i);
  if (m2) return normalizeCertainty(m2[1]);
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

    // Utenti: 500 chars — risposte AI: 1200 chars (catturano IPOTESI + VERIFICHE)
    const convText = msgs
      .map(function (m) {
        const limit = (m.role === "user") ? 500 : 1200;
        return m.role.toUpperCase() + ": " + String(m.content || "").slice(0, limit);
      })
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
        max_tokens: 600,
      });
      summary = (completion && completion.choices && completion.choices[0] &&
                 completion.choices[0].message && completion.choices[0].message.content) || null;
    } else if (chosen === "anthropic" && anthropic) {
      const resp = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 600,
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

// ─────────────────────────────────────────────────────────────────────────────
// MEMORIA ROCCO — FASE 4b
// RAG su casi passati + auto-save diagnosi + helpers DB
// ─────────────────────────────────────────────────────────────────────────────

/** FTS su rocco_knowledge_casi — ritorna contesto formattato (max 3 casi) */
async function fetchKnowledgeCasi(queryText) {
  if (!pool) return "";
  const q = String(queryText || "").trim().slice(0, 200);
  if (!q) return "";
  try {
    const r = await pool.query(
      `SELECT problema, soluzione, norma_riferimento, dominio,
              ts_rank(to_tsvector('italian', problema || ' ' || soluzione),
                      plainto_tsquery('italian', $1)) AS rank
       FROM rocco_knowledge_casi
       WHERE to_tsvector('italian', problema || ' ' || soluzione)
             @@ plainto_tsquery('italian', $1)
         AND verificato = TRUE
       ORDER BY rank DESC, n_utilizzi DESC
       LIMIT 3`,
      [q]
    );
    if (!r.rows || !r.rows.length) return "";
    const lines = r.rows.map(function (row, i) {
      return (i + 1) + ") PROBLEMA: " + row.problema + "\n   SOLUZIONE: " + row.soluzione +
        (row.norma_riferimento ? "\n   NORMA: " + row.norma_riferimento : "");
    });
    return "─── CASI SIMILI RISOLTI DA ROCCO ───\n" + lines.join("\n\n") + "\n";
  } catch (e) {
    console.warn("⚠️ fetchKnowledgeCasi failed:", (e && e.message) || e);
    return "";
  }
}

/**
 * Auto-salva diagnosi dopo ogni risposta ROCCO (fire-and-forget).
 * Se ROCCO ha trovato una diagnosi tecnica, la salva in rocco_diagnosi
 * e aggiorna/inserisce in rocco_knowledge_casi.
 */
async function autoSaveDiagnosi(opts) {
  if (!pool) return;
  const { convId, userId, message, answer, domain, certezza, engineDiag } = opts || {};
  if (!message || !answer) return;
  // Solo per richieste tecniche con una diagnosi reale
  if (!(engineDiag && engineDiag.isTechnical)) return;

  try {
    // 1) Salva in rocco_diagnosi
    const causa = (engineDiag.conclusione || "").slice(0, 500);
    const componentiJson = JSON.stringify(
      (engineDiag.matchedComponents || []).concat(engineDiag.matchedPatterns || [])
    );
    await pool.query(
      `INSERT INTO rocco_diagnosi
         (user_id, conversation_id, descrizione_problema, componenti_json,
          causa_trovata, certezza, dominio, risolto)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)`,
      [userId || null, convId || null,
       String(message).slice(0, 1000), componentiJson,
       causa, certezza || "MEDIA", domain || "elettrico"]
    );

    // 2) Aggiunge a knowledge_casi se la certezza è ALTA e c'è una causa chiara
    if (certezza === "ALTA" && causa) {
      await pool.query(
        `INSERT INTO rocco_knowledge_casi
           (problema, soluzione, norma_riferimento, dominio, verificato, n_utilizzi)
         VALUES ($1, $2, $3, $4, FALSE, 0)
         ON CONFLICT DO NOTHING`,
        [String(message).slice(0, 500), causa.slice(0, 500), null, domain || "elettrico"]
      );
    }
  } catch (e) {
    // Silent — non bloccare mai la risposta per un errore di memoria
    if (process.env.ROCCO_DEBUG === "1") console.warn("⚠️ autoSaveDiagnosi:", (e && e.message) || e);
  }
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
// AI CALL HELPERS (FASE 6)
// =========================

/**
 * T2: Assembla TUTTO il contesto tecnico in un unico blocco.
 * Ordine: encyclopedia DB → doc chunks → knowledge locale → engine diagnostico.
 * Ogni sezione è separata da doppio newline. Sezioni vuote sono omesse.
 */
function buildContextBlock({ dbContextText, docChunksText, knowledgeText, engineText }) {
  return [dbContextText, docChunksText, knowledgeText, engineText]
    .filter(Boolean)
    .join("\n\n");
}

async function callOpenAI({ systemPrompt, shortHistory, imageBase64, imagesBase64, message, contextBlock }) {
  if (!openai) throw new Error("OpenAI non configurato");
  const messages = [{ role: "system", content: systemPrompt }].concat(shortHistory);
  if (contextBlock) messages.push({ role: "system", content: contextBlock });

  // Usa imagesBase64 (array) se disponibile, altrimenti fallback su imageBase64 singolo
  const imgs = Array.isArray(imagesBase64) && imagesBase64.length > 0
    ? imagesBase64
    : (imageBase64 ? [imageBase64] : []);

  if (imgs.length > 0) {
    const content = [{ type: "text", text: message }];
    for (const raw of imgs) {
      const img = normalizeBase64Image(raw);
      if (img) content.push({ type: "image_url", image_url: { url: "data:" + img.mime + ";base64," + img.b64 } });
    }
    messages.push({ role: "user", content });
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

async function callAnthropic({ systemPrompt, shortHistory, imageBase64, imagesBase64, message, contextBlock }) {
  if (!anthropic) throw new Error("Anthropic non configurato");
  const msgs = shortHistory.slice();

  const imgs = Array.isArray(imagesBase64) && imagesBase64.length > 0
    ? imagesBase64
    : (imageBase64 ? [imageBase64] : []);

  if (imgs.length > 0) {
    const content = [{ type: "text", text: message }];
    for (const raw of imgs) {
      const img = normalizeBase64Image(raw);
      if (img) content.push({ type: "image", source: { type: "base64", media_type: img.mime, data: img.b64 } });
    }
    msgs.push({ role: "user", content });
  } else {
    msgs.push({ role: "user", content: message });
  }

  const sysContent = [systemPrompt, contextBlock].filter(Boolean).join("\n\n");
  const resp = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1800,
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

// ─────────────────────────────────────────────────────────────────────────────
// callRoccoRunner — usa il cervello deduttivo dinamico (ROCCO COMPLETO)
// Wrappa runRocco() adattando la firma al ciclo provider esistente
// ─────────────────────────────────────────────────────────────────────────────
async function callRoccoRunner({ shortHistory, imageBase64, imagesBase64, message }, userId) {
  if (!runRocco) throw new Error("ROCCO Runner non disponibile");
  const img    = (Array.isArray(imagesBase64) && imagesBase64.length > 0) ? imagesBase64[0] : imageBase64;
  const result = await runRocco({ message, history: shortHistory, userId: userId || 'default', imageBase64: img });
  return { answer: result.risposta, model: result.modello };
}

// ─────────────────────────────────────────────────────────────────────────────
// callOllama — provider locale gratuito (FASE 5)
// Usa prompt compatto per rispettare context window Mistral (~8K token)
// ─────────────────────────────────────────────────────────────────────────────
async function callOllama({ systemPrompt, shortHistory, message, contextBlock }) {
  if (!ollamaAvailable) throw new Error("Ollama non disponibile");

  // Prompt compatto: tronca la knowledge se troppo grande (Mistral 7B ha 8K token)
  const MAX_SYSTEM_CHARS = 6000;
  const sys = systemPrompt.length > MAX_SYSTEM_CHARS
    ? systemPrompt.slice(0, MAX_SYSTEM_CHARS) + "\n\n[Knowledge troncata per limite modello locale]"
    : systemPrompt;

  const messages = [{ role: "system", content: sys }];
  for (const m of shortHistory) messages.push({ role: m.role, content: String(m.content || "") });
  if (contextBlock) messages.push({ role: "system", content: contextBlock });
  messages.push({ role: "user", content: message });

  const resp = await _ollamaClient.chat({
    model:   OLLAMA_MODEL,
    messages: messages,
    stream:  false,
    options: { temperature: 0.1 }
  });

  const answer = (resp && resp.message && resp.message.content) || "Nessuna risposta.";
  return { answer, model: "ollama:" + OLLAMA_MODEL };
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

  const queue = buildProviderQueue();
  const activeProvider = queue.length ? queue[0] : null;
  const activeModel = activeProvider === "openai"    ? OPENAI_MODEL
                    : activeProvider === "anthropic"  ? ANTHROPIC_MODEL
                    : activeProvider === "ollama"      ? ("ollama:" + OLLAMA_MODEL)
                    : null;
  const aiConnected = queue.length > 0;

  // Conta knowledge base
  let kbCounts = { components: 0, patterns: 0, rules: 0, protocols: 0 };
  try {
    const kb = getLoadedKnowledge();
    kbCounts.components = (kb.components || []).length;
    kbCounts.patterns   = (kb.failurePatterns || []).length;
    kbCounts.rules      = (kb.protectionRules || []).length;
    kbCounts.protocols  = (kb.safetyProtocols || []).length;
  } catch (_) {}

  res.json({
    ok: true,
    time: new Date().toISOString(),
    version: "ROCCO-v4",
    signature: "ROCCO-CHAT-V2",
    runningFile: "backend/server.js",
    strictFormat: STRICT_FORMAT,
    db: { connected: dbOk, serverTime: dbTime },
    ai: {
      connected: aiConnected,
      activeProvider: activeProvider,
      activeModel: activeModel,
      preferredProvider: PREFERRED_PROVIDER,
    },
    providers: {
      anthropicConfigured: Boolean(anthropic),
      openaiConfigured: Boolean(openai),
    },
    models: {
      anthropic: ANTHROPIC_MODEL,
      openai: OPENAI_MODEL,
    },
    knowledge: kbCounts,
    modules: {
      componentRecognizer: true,
      numericRecognizer: true,
      certaintyNormalizer: true,
      postcheck: true,
      rag: Boolean(pool),
    },
  });
});

// Endpoint informativo ROCCO — stato completo del sistema
app.get("/api/info", (req, res) => {
  let kbCounts = { components: 0, patterns: 0, rules: 0, protocols: 0 };
  try {
    const kb = getLoadedKnowledge();
    kbCounts.components = (kb.components || []).length;
    kbCounts.patterns   = (kb.failurePatterns || []).length;
    kbCounts.rules      = (kb.protectionRules || []).length;
    kbCounts.protocols  = (kb.safetyProtocols || []).length;
  } catch (_) {}

  const { TECH_REPORT_SECTIONS, HARD_SAFETY_RULES, GOLDEN_RULES, BANNED_PHRASES } = require("./rocco/policies");

  res.json({
    system: "IA Wire Pro — ROCCO Diagnostic Engine",
    version: "4.0",
    build: new Date().toISOString().split("T")[0],
    engine: {
      name: "ROCCO",
      description: "Tecnico impiantistico AI — diagnosi strutturata pre-LLM + LLM",
      domains: ["elettrico", "termico", "rete", "domotica", "idraulico"],
      sections: TECH_REPORT_SECTIONS,
      safetyRules: HARD_SAFETY_RULES.length,
      goldenRules: GOLDEN_RULES.length,
      bannedPhrases: BANNED_PHRASES.length,
    },
    knowledge: {
      components: kbCounts.components,
      failurePatterns: kbCounts.patterns,
      protectionRules: kbCounts.rules,
      safetyProtocols: kbCounts.protocols,
    },
    modules: {
      componentRecognizer: "backend/rocco/componentRecognizer.js",
      numericRecognizer: "backend/rocco/numericRecognizer.js",
      certaintyNormalizer: "backend/utils/certainty.js",
      postcheck: "backend/rocco/postcheck.js",
      diagnosticEngine: "backend/engine/diagnosticEngine.js",
    },
    providers: {
      primary: PREFERRED_PROVIDER,
      openai: { configured: Boolean(openai), model: OPENAI_MODEL },
      anthropic: { configured: Boolean(anthropic), model: ANTHROPIC_MODEL },
    },
    certaintyLevels: ["ALTA", "MEDIA", "BASSA"],
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

    // ✅ immagini: raccoglie tutti i file immagine (max 3) — supporta upload multiplo
    let imagesBase64 = [];
    const imageFiles = pickAllImageFiles(req.files);
    for (const f of imageFiles) {
      if (f && f.buffer) {
        imagesBase64.push("data:" + (f.mimetype || "image/jpeg") + ";base64," + f.buffer.toString("base64"));
      }
    }

    // Fallback: immagine singola da JSON body (backward compat)
    if (imagesBase64.length === 0) {
      const rawB64 = body.imageBase64 || body.image_base64 || body.image || null;
      if (rawB64) imagesBase64 = [String(rawB64)];
    }

    // Alias singolo per compatibilità con codice esistente
    const imageBase64 = imagesBase64[0] || null;

    if (!message && imagesBase64.length > 0) message = "Analizza questa foto dell'impianto/quadro. Identifica tutti i componenti visibili, leggi le tarature e segnala qualsiasi anomalia o guasto visibile.";

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

    // ── CALC ENGINE (FASE 2) — calcoli autonomi pre-LLM ──────────────────
    let calcContext = "";
    try {
      const calcResult = runCalcEngine(message);
      if (calcResult.hasCalc) {
        calcContext = calcResult.context;
        if (process.env.ROCCO_DEBUG === "1") {
          console.log("[CALC ENGINE]", JSON.stringify(calcResult.params));
        }
      }
    } catch (e) {
      console.warn("⚠️ Calc Engine non disponibile:", (e && e.message) || e);
    }

    let systemPrompt = rocco.buildSystemPrompt(plan, ragContext, calcContext);
    // Inietta schema di ragionamento ROCCO UNIVERSITY
    if (roccoUniversity && roccoUniversity.getSystemPromptReasoning) {
      systemPrompt += roccoUniversity.getSystemPromptReasoning();
    }
    if (convSummary) {
      systemPrompt = "CONTESTO CONVERSAZIONE PRECEDENTE:\n" + convSummary + "\n\n" + systemPrompt;
    }
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

    // RAG su casi risolti da ROCCO (FASE 4b — Memoria)
    let knowledgeCasiText = "";
    try {
      knowledgeCasiText = await fetchKnowledgeCasi(message);
    } catch (e) {
      console.warn("⚠️ Knowledge casi non disponibili:", (e && e.message) || e);
    }

    // Device KB — banca dati dispositivi + guasti reali (ROCCO COMPLETO)
    let deviceKbText = "";
    try {
      if (roccoUniversity && roccoUniversity.getContestoTecnico) {
        const devCtx = await roccoUniversity.getContestoTecnico(message);
        deviceKbText = roccoUniversity.formattaContestoPerPrompt(devCtx);
      }
    } catch (e) {
      console.warn("⚠️ Device KB non disponibile:", (e && e.message) || e);
    }

    // RAG ROCCO MEMORIA v7 — casi simili dal DB + contesto progetto
    let memoriaContext = "";
    try {
      if (roccoMemoria) {
        const casiSimili = await roccoMemoria.cerca_casi_simili(message, 3);
        const progettoId = body.progetto_id ? parseInt(body.progetto_id, 10) || null : null;
        const contestoProgetto = await roccoMemoria.get_contesto_memoria(progettoId);
        if (casiSimili && casiSimili.length > 0) {
          memoriaContext += "\n[CASI SIMILI DAL DB ROCCO]\n";
          casiSimili.forEach(function(c, i) {
            memoriaContext += (i + 1) + ". PROBLEMA: " + c.problema + "\n   CAUSA: " + c.causa + "\n   SOLUZIONE: " + c.soluzione + "\n";
          });
        }
        if (contestoProgetto) memoriaContext += contestoProgetto;
      }
    } catch (e) {
      console.warn("⚠️ ROCCO MEMORIA RAG:", (e && e.message) || e);
    }

    // ===== KNOWLEDGE BASE LOCALE + ROCCO ENGINE (FASE 7) =====
    let knowledgeText = "";
    let engineText = "";
    let engineDiag = null;
    let foundResult = null;
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
        components:      _kb.components,
      });
      engineText = formatDiagnosticContext(engineDiag);

      // Component Recognition Engine — arricchisce engineText con componenti riconosciuti
      try {
        const recognizedIds = extractComponents(message);
        if (recognizedIds.length > 0) {
          const recognizedLabel = formatComponents(recognizedIds);
          engineText = (engineText ? engineText + "\n\n" : "") +
            "COMPONENTI RICONOSCIUTI NEL TESTO (pre-analisi automatica):\n" +
            recognizedLabel + "\n" +
            "Includi questi componenti nella sezione COMPONENTI COINVOLTI se rilevanti.";
        }
      } catch (e) {
        console.warn("⚠️ Component recognizer non disponibile:", (e && e.message) || e);
      }

      // Numeric Validation Engine (T4) — estrae valori tecnici per il contesto LLM
      try {
        const numVals = extractElectricalValues(message);
        const numFormatted = formatElectricalValues(numVals);
        const numWarnings = checkAnomalies(numVals);
        if (numFormatted) {
          engineText = (engineText ? engineText + "\n\n" : "") +
            "VALORI TECNICI ESTRATTI DAL TESTO:\n" + numFormatted;
        }
        if (numWarnings.length > 0) {
          engineText = (engineText ? engineText + "\n" : "") +
            "⚠️ ANOMALIE RILEVATE: " + numWarnings.join("; ");
          // Se c'è un'anomalia di tensione pericolosa, attiva safety lock
          const hasDangerousVoltage = numWarnings.some(function (w) { return w.includes("MT/AT"); });
          if (hasDangerousVoltage) {
            systemPrompt = "⚠️ SAFETY LOCK — TENSIONE MT/AT RILEVATA: intervento VIETATO senza abilitazione PES/PAV (CEI 11-27).\n" +
              "Indicare IMMEDIATAMENTE all'utente che si tratta di Media/Alta Tensione.\n\n" + systemPrompt;
          }
        }
      } catch (e) {
        console.warn("⚠️ Numeric recognizer non disponibile:", (e && e.message) || e);
      }

      // Foundation Engine (domainGuard + basicPatterns + scoreHypotheses + questionBuilder)
      try {
        foundResult = runFoundationEngine(message);
        if (foundResult.outOfScope) {
          // Richiesta MT/AT fuori dominio — aggiunge safety lock prominente
          systemPrompt = "⚠️ SAFETY LOCK — RICHIESTA FUORI DOMINIO BT: " +
            "La richiesta riguarda Media/Alta Tensione. IA Wire Pro gestisce SOLO impianti BT 230/400V.\n" +
            "Comunicare all'utente che è necessario un tecnico abilitato (CEI 11-27 PES/PAV).\n\n" + systemPrompt;
        } else if (foundResult.formattedContext) {
          // Aggiunge analisi Foundation Engine al contesto (basicPatterns + domande)
          engineText = (engineText ? engineText + "\n\n" : "") +
            "ANALISI FOUNDATION ENGINE:\n" + foundResult.formattedContext;
        }
      } catch (e) {
        console.warn("⚠️ Foundation Engine non disponibile:", (e && e.message) || e);
      }

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

    const contextBlock = buildContextBlock({ dbContextText, docChunksText, knowledgeText: knowledgeText + (knowledgeCasiText ? "\n\n" + knowledgeCasiText : "") + (memoriaContext ? "\n\n" + memoriaContext : "") + (deviceKbText ? "\n\n" + deviceKbText : ""), engineText });
    const callParams = { systemPrompt, shortHistory, imageBase64, imagesBase64, message, contextBlock };

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
        var result = p === "openai"    ? await callOpenAI(callParams)
                   : p === "ollama"    ? await callOllama(callParams)
                   : (p === "anthropic" && runRocco)
                                       ? await callRoccoRunner(callParams, user_id)
                   :                    await callAnthropic(callParams);
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

    if (STRICT_FORMAT && usedProvider !== "offline_engine") answer = rocco.postcheck(answer);

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
    autoSaveDiagnosi({ convId, userId: user_id, message, answer, domain: plan.domain, certezza: extractCertainty(answer), engineDiag }).catch(function () {});

    return res.json({
      ok: true,
      provider: usedProvider,
      model: usedModel,
      fallback_used: fallbackUsed,
      answer,
      conversation_id: convId,
      signature: "ROCCO-CHAT-V2",
      rag: { usedDbContext: Boolean(dbContextText), usedDocChunks: Boolean(docChunksText), usedKnowledge: Boolean(knowledgeText), contextBlockLen: contextBlock.length },
      engine: engineDiag ? {
        active: true,
        isTechnical: engineDiag.isTechnical,
        isDangerous: engineDiag.isDangerous,
        matchedPatterns: engineDiag.matchedPatterns,
        matchedRules: engineDiag.matchedRules,
        matchedComponents: engineDiag.matchedComponents,
        recognizedComponents: extractComponents(message),
      } : { active: false, recognizedComponents: extractComponents(message) },
      foundation: foundResult && !foundResult.outOfScope ? {
        patternId:    foundResult.patternId  || null,
        components:   foundResult.components || [],
        anomalies:    foundResult.anomalies  || [],
        topHypothesis: (foundResult.hypotheses && foundResult.hypotheses.length)
          ? foundResult.hypotheses[0].text || null
          : null,
        outOfScope: false,
      } : (foundResult && foundResult.outOfScope ? { outOfScope: true } : null),
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
    const diag = analyzeTechnicalRequest(input, { failurePatterns: _kb.failurePatterns, protectionRules: _kb.protectionRules, components: _kb.components });
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
// ROCCO CALC ENGINE — /api/calc
// Tool di calcolo autonomi (zero AI, zero API)
// =========================

/**
 * POST /api/calc
 * Body: { tool, params }
 *
 * tool: ib | sezione | dv | icc | pe | diff | curva | terra | coordinamento | progetto | auto
 *
 * Esempi:
 *   { tool: "ib",       params: { P: 3000, V: 230, cosphi: 0.9 } }
 *   { tool: "sezione",  params: { Ib: 13.5, metodo: "B1", temp: 30, fasi: 1 } }
 *   { tool: "dv",       params: { S: 2.5, L: 30, Ib: 13.5, V: 230 } }
 *   { tool: "pe",       params: { S: 6 } }
 *   { tool: "diff",     params: { carico: "pompa calore", locale: "garage" } }
 *   { tool: "auto",     params: { message: "circuito da 3kW, 20 metri, monofase" } }
 */
app.post("/api/calc", (req, res) => {
  try {
    const { tool, params } = req.body || {};
    const p = params || {};
    let result;

    switch (String(tool || "auto").toLowerCase()) {
      case "ib":
        result = calcola_ib(p.P || p.P_W, p.V, p.cosphi || p.cosfi, p.eta, p.fasi);
        break;
      case "sezione":
      case "section":
        result = calcola_sezione(p.Ib, p.metodo, p.temp, p.n_circuiti, p.fasi);
        break;
      case "dv":
      case "caduta":
        result = calcola_dv(p.S, p.L, p.Ib, p.cosphi || p.cosfi, p.V, p.fasi, p.mat);
        break;
      case "icc":
        result = calcola_icc(p.Sn_kVA || p.Sn, p.Vcc_perc || p.Vcc, p.L, p.S, p.Icc_BUS);
        break;
      case "pe":
        result = calcola_pe(p.S || p.S_fase);
        break;
      case "diff":
      case "differenziale":
        result = seleziona_differenziale(p.carico, p.locale);
        break;
      case "curva":
        result = seleziona_curva(p.carico);
        break;
      case "terra":
        result = calcola_terra(p.rho, p.tipo, p.L);
        break;
      case "coordinamento":
      case "coord":
        result = verifica_coordinamento(p.Ib, p.In, p.Iz, p.If);
        break;
      case "progetto":
      case "dm3708":
        result = verifica_obbligo_progetto(p.potenza_kW, p.superficie_m2, p.tipo);
        break;
      case "sezione_dv":
        result = calcola_sezione_da_dv(p.Ib, p.L, p.dv_max, p.V, p.fasi);
        break;
      case "auto":
      default: {
        const msg = String(p.message || p.query || "");
        if (!msg) { res.status(400).json({ ok: false, error: "Parametro message obbligatorio per tool=auto" }); return; }
        result = runCalcEngine(msg);
        break;
      }
    }

    res.json({ ok: true, tool: tool || "auto", result });
  } catch (err) {
    console.error("❌ /api/calc error:", err);
    res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
  }
});

// GET /api/calc/tools — lista tool disponibili
app.get("/api/calc/tools", (_req, res) => {
  res.json({
    ok: true,
    tools: [
      { id: "ib",          params: ["P (W)", "V", "cosphi", "eta", "fasi"],          desc: "Corrente di impiego Ib (A)" },
      { id: "sezione",     params: ["Ib", "metodo (B1/B2/C/E/D)", "temp", "fasi"],   desc: "Sezione minima cavo mm²" },
      { id: "dv",          params: ["S (mm²)", "L (m)", "Ib", "cosphi", "V", "fasi"],desc: "Caduta di tensione %" },
      { id: "icc",         params: ["Sn_kVA", "Vcc_perc", "L (m)", "S (mm²)"],       desc: "Corrente di cortocircuito" },
      { id: "pe",          params: ["S (mm²)"],                                       desc: "Sezione conduttore PE" },
      { id: "diff",        params: ["carico (testo)", "locale (testo)"],              desc: "Tipo differenziale + Idn" },
      { id: "curva",       params: ["carico (testo)"],                                desc: "Curva interruttore B/C/D/K/Z" },
      { id: "terra",       params: ["rho (Ω·m)", "tipo", "L (m)"],                   desc: "Resistenza dispersore RE" },
      { id: "coordinamento",params: ["Ib", "In", "Iz", "If"],                        desc: "Verifica coordinamento protezioni" },
      { id: "progetto",    params: ["potenza_kW", "superficie_m2", "tipo"],           desc: "Obbligo progetto DM 37/08" },
      { id: "sezione_dv",  params: ["Ib", "L (m)", "dv_max (%)", "V", "fasi"],       desc: "Sezione minima da vincolo ΔV%" },
      { id: "auto",        params: ["message (testo libero)"],                        desc: "Dispatcher automatico da testo" }
    ]
  });
});

// =========================
// ROUTES — Memoria ROCCO (FASE 4b)
// =========================

// POST /api/rocco/progetti — crea nuovo progetto
app.post("/api/rocco/progetti", async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: "DB non disponibile" });
  try {
    const { user_id, cliente, indirizzo, tipo_locale, potenza_kw, superficie_m2, sistema, tensione, note } = req.body || {};
    const r = await pool.query(
      `INSERT INTO rocco_progetti (user_id, cliente, indirizzo, tipo_locale, potenza_kw, superficie_m2, sistema, tensione, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [user_id || null, cliente || null, indirizzo || null, tipo_locale || null,
       potenza_kw || null, superficie_m2 || null, sistema || "TT", tensione || "230V", note || null]
    );
    res.json({ ok: true, progetto: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/rocco/progetti — lista progetti utente
app.get("/api/rocco/progetti", async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: "DB non disponibile" });
  try {
    const { user_id, limit } = req.query;
    const lim = Math.min(parseInt(limit || "50"), 200);
    const r = await pool.query(
      `SELECT id, cliente, indirizzo, tipo_locale, potenza_kw, superficie_m2, stato, created_at
       FROM rocco_progetti
       WHERE ($1::text IS NULL OR user_id = $1)
       ORDER BY created_at DESC LIMIT $2`,
      [user_id || null, lim]
    );
    res.json({ ok: true, count: r.rows.length, items: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/rocco/diagnosi — salva diagnosi manualmente
app.post("/api/rocco/diagnosi", async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: "DB non disponibile" });
  try {
    const { user_id, descrizione_problema, causa_trovata, soluzione_applicata, risolto, certezza, dominio, tempo_minuti } = req.body || {};
    if (!descrizione_problema) return res.status(400).json({ ok: false, error: "descrizione_problema obbligatoria" });
    const r = await pool.query(
      `INSERT INTO rocco_diagnosi
         (user_id, descrizione_problema, causa_trovata, soluzione_applicata, risolto, certezza, dominio, tempo_minuti)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at`,
      [user_id || null, descrizione_problema, causa_trovata || null,
       soluzione_applicata || null, risolto === true, certezza || "MEDIA",
       dominio || "elettrico", tempo_minuti || null]
    );
    // Se risolto con alta certezza → aggiungi a knowledge_casi
    if (risolto && certezza === "ALTA" && causa_trovata) {
      await pool.query(
        `INSERT INTO rocco_knowledge_casi (problema, soluzione, dominio, verificato)
         VALUES ($1,$2,$3,TRUE) ON CONFLICT DO NOTHING`,
        [descrizione_problema.slice(0, 500), causa_trovata.slice(0, 500), dominio || "elettrico"]
      );
    }
    res.json({ ok: true, diagnosi: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/rocco/diagnosi — lista diagnosi utente
app.get("/api/rocco/diagnosi", async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: "DB non disponibile" });
  try {
    const { user_id, limit, risolto } = req.query;
    const lim = Math.min(parseInt(limit || "50"), 200);
    const r = await pool.query(
      `SELECT id, descrizione_problema, causa_trovata, risolto, certezza, dominio, created_at
       FROM rocco_diagnosi
       WHERE ($1::text IS NULL OR user_id = $1)
         AND ($2::text IS NULL OR risolto = ($2 = 'true'))
       ORDER BY created_at DESC LIMIT $3`,
      [user_id || null, risolto !== undefined ? risolto : null, lim]
    );
    res.json({ ok: true, count: r.rows.length, items: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PATCH /api/rocco/diagnosi/:id — aggiorna diagnosi (segna come risolta)
app.patch("/api/rocco/diagnosi/:id", async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: "DB non disponibile" });
  try {
    const { id } = req.params;
    const { risolto, soluzione_applicata, causa_trovata, tempo_minuti } = req.body || {};
    await pool.query(
      `UPDATE rocco_diagnosi
       SET risolto = COALESCE($2, risolto),
           soluzione_applicata = COALESCE($3, soluzione_applicata),
           causa_trovata = COALESCE($4, causa_trovata),
           tempo_minuti = COALESCE($5, tempo_minuti)
       WHERE id = $1`,
      [id, risolto !== undefined ? risolto : null, soluzione_applicata || null,
       causa_trovata || null, tempo_minuti || null]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/admin/ollama/status — stato Ollama (admin)
app.get("/api/admin/ollama/status", requireAdmin, async (req, res) => {
  try {
    const models = await _ollamaClient.list();
    res.json({ ok: true, available: true, url: OLLAMA_URL, active_model: OLLAMA_MODEL, models: (models.models || []).map(function(m){ return m.name; }) });
  } catch (e) {
    res.json({ ok: true, available: false, url: OLLAMA_URL, error: e.message });
  }
});

// =========================
// ROUTES — Admin
// =========================

// GET /admin — serve la dashboard admin (HTML statico, non protetto)
app.get("/admin", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin.html"));
});

// GET /university — ROCCO UNIVERSITY (pagina studio formule + esami)
app.get("/university", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "university.html"));
});
app.get("/university.html", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "university.html"));
});

// GET /api/admin/stats — statistiche sistema (protetto)
app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  if (!pool) return res.json({ ok: false, error: "DB non disponibile" });
  try {
    const [convR, msgR, chunkR, compR] = await Promise.all([
      pool.query("SELECT COUNT(*) AS n FROM conversations"),
      pool.query("SELECT COUNT(*) AS n FROM messages"),
      pool.query("SELECT COUNT(*) AS n FROM doc_chunks"),
      pool.query("SELECT COUNT(*) AS n FROM components"),
    ]);
    res.json({
      ok: true,
      stats: {
        conversations: parseInt(convR.rows[0].n, 10),
        messages: parseInt(msgR.rows[0].n, 10),
        doc_chunks: parseInt(chunkR.rows[0].n, 10),
        components: parseInt(compR.rows[0].n, 10),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/conversations — lista completa (protetto)
app.get("/api/admin/conversations", requireAdmin, async (req, res) => {
  if (!pool) return res.json({ ok: false, error: "DB non disponibile" });
  try {
    const limit = Math.min(parseInt(req.query.limit || "100", 10) || 100, 500);
    const r = await pool.query(
      `SELECT id, title, user_id, is_archived, created_at, updated_at,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS msg_count
       FROM conversations c
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ ok: true, count: r.rowCount, items: r.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/admin/conversations/:id — elimina (protetto)
app.delete("/api/admin/conversations/:id", requireAdmin, async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: "DB non disponibile" });
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ ok: false, error: "id non valido" });
    await pool.query("DELETE FROM conversations WHERE id = $1", [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/admin/upload-pdf — carica un PDF e lo inserisce in doc_chunks (protetto)
app.post("/api/admin/upload-pdf", requireAdmin, uploadAny, async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: "DB non disponibile" });

  const file = Array.isArray(req.files) ? req.files.find((f) => f.mimetype === "application/pdf" || f.originalname.endsWith(".pdf")) : null;
  if (!file) return res.status(400).json({ ok: false, error: "Nessun file PDF ricevuto (campo: pdf)" });

  let pdfParse;
  try { pdfParse = require("pdf-parse"); } catch (e) {
    return res.status(500).json({ ok: false, error: "pdf-parse non installato sul server" });
  }

  try {
    const { chunkText } = require("./ingest_pdf");
    const data = await pdfParse(file.buffer);
    const sourceName = req.body.source || file.originalname;
    const chunks = chunkText(data.text, sourceName);

    let inserted = 0, skipped = 0;
    const client = await pool.connect();
    try {
      for (const chunk of chunks) {
        const ex = await client.query("SELECT id FROM doc_chunks WHERE source=$1 AND chunk_text=$2 LIMIT 1", [chunk.source, chunk.chunk_text]);
        if (ex.rowCount > 0) { skipped++; continue; }
        await client.query("INSERT INTO doc_chunks (source, chunk_text) VALUES ($1,$2)", [chunk.source, chunk.chunk_text]);
        inserted++;
      }
    } finally {
      client.release();
    }

    res.json({ ok: true, pages: data.numpages, chunks: chunks.length, inserted, skipped });
  } catch (err) {
    logger.error("/api/admin/upload-pdf error: " + err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ROCCO UNIVERSITY API routes
if (roccoUniversity && roccoUniversity.router) {
  app.use('/api/university', roccoUniversity.router);
  console.log('[ROCCO UNIVERSITY] Routes montate su /api/university');
}

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
  logger.error("SERVER ERROR: " + (err && err.message ? err.message : String(err)));
  res.status(500).json({ error: err.message || "Internal Server Error" });
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
  logger.info("ROCCO ENGINE: ACTIVE");
  logger.info(
    "KNOWLEDGE ITEMS: " +
    _knowledgeCounts.components + " components, " +
    _knowledgeCounts.patterns + " failure_patterns, " +
    _knowledgeCounts.rules + " protection_rules, " +
    _knowledgeCounts.protocols + " safety_protocols"
  );

  // Auto-ingest doc_chunks se DB disponibile e tabella vuota
  if (pool) {
    pool.query("SELECT COUNT(*) AS n FROM doc_chunks").then(function (res) {
      var n = parseInt((res.rows[0] && res.rows[0].n) || "0", 10);
      if (n === 0) {
        logger.info("doc_chunks vuoto — avvio ingest automatico...");
        var { execFile } = require("child_process");
        execFile("node", [path.join(__dirname, "ingest.js")], function (err, stdout) {
          if (err) {
            logger.warn("Auto-ingest fallito: " + err.message);
          } else {
            logger.info("Auto-ingest completato.\n" + (stdout || "").trim());
          }
        });
      } else {
        logger.info("DOC CHUNKS: " + n + " chunk disponibili nel RAG");
      }
    }).catch(function (e) {
      logger.warn("doc_chunks check fallito: " + e.message);
    });
  }
});
