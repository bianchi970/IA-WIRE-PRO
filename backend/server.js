require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const multer = require("multer");
const { pool } = require("./db");

const app = express();

/* =========================
   CONFIG
========================= */
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, "../frontend");

const JSON_LIMIT = "12mb";
const MULTIPART_FILE_MAX = 5 * 1024 * 1024; // 5MB
const HISTORY_MAX = 6;

// ✅ TRIM anti-newline (Anthropic + OpenAI)
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const MODEL = (process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307").trim();

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

console.log("ANTHROPIC CONFIG:", ANTHROPIC_API_KEY ? "✅ Configurata" : "❌ Mancante");
console.log("OPENAI CONFIG:", OPENAI_API_KEY ? "✅ Configurata" : "❌ Mancante");

/* =========================
   CLIENTS
========================= */
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));
app.use(express.static(FRONTEND_DIR));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MULTIPART_FILE_MAX },
});

app.use((req, res, next) => {
  console.log(`➡ ${req.method} ${req.url}`);
  next();
});

/* =========================
   HELPERS
========================= */
function normalizeHistory(history) {
  const safe = Array.isArray(history) ? history.slice(-HISTORY_MAX) : [];
  return safe
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
    }));
}

function extractReplyText(result) {
  if (!result || !Array.isArray(result.content)) return "Nessuna risposta";
  return result.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function toIntOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Per log sicuro (evita oggetti enormi)
function shortErr(err) {
  return {
    name: err?.name,
    message: err?.message || String(err),
    status: err?.status,
    code: err?.code,
    type: err?.type,
  };
}

/* =========================
   ROUTING (C)
========================= */
function choosePrimaryProvider(message, hasImage) {
  if (hasImage) return "anthropic";

  const m = (message || "").toLowerCase();
  const longText = m.length > 600;

  const keywords = [
    "calcola", "calcolare", "formula", "passaggi", "risultato",
    "caduta di tensione", "cei", "norma", "dimensionamento",
    "selettività", "corrente", "potenza", "kw", "mm2", "mm²",
    "magnetotermico", "differenziale", "sezione", "cavo", "v", "a"
  ];

  const isTechnical = keywords.some(k => m.includes(k));
  return (longText || isTechnical) ? "openai" : "anthropic";
}

/* =========================
   ROUTES
========================= */
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    anthropicConfigured: !!ANTHROPIC_API_KEY,
    openaiConfigured: !!OPENAI_API_KEY,
    anthropicModel: MODEL,
    openaiModel: OPENAI_MODEL,
    jsonLimit: JSON_LIMIT,
    multipartMaxBytes: MULTIPART_FILE_MAX,
  });
});

/* =========================
   CHAT (Routing C) + fallback + optional DB save
========================= */
app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    const message = (req.body?.message || "").toString().trim();
    if (!message) {
      return res.status(400).json({ error: "Campo 'message' obbligatorio" });
    }

    // history (opzionale)
    let history = [];
    if (req.body?.history) {
      try {
        history = JSON.parse(req.body.history);
      } catch {}
    }

    // conversation_id (opzionale, per salvare in DB)
    const conversation_id_raw =
      req.body?.conversation_id ?? req.body?.conversationId ?? null;
    const conversation_id = toIntOrNull(conversation_id_raw);

    // Prepara contenuto utente (testo + immagine opzionale) per Claude
    const userContent = [];
    const hasImage = !!req.file?.buffer;

    if (hasImage) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: req.file.mimetype || "image/jpeg",
          data: req.file.buffer.toString("base64"),
        },
      });
    }

    userContent.push({ type: "text", text: message });

    const normalizedHistory = normalizeHistory(history);

    // ✅ ROUTING C: scegli primario
    const primary = choosePrimaryProvider(message, hasImage);
    console.log("ROUTING_PRIMARY:", primary);

    let replyText = null;
    let providerUsed = null;

    async function callAnthropic() {
      if (!anthropic) throw new Error("Anthropic non configurato");
      console.log("MODEL_USED (Claude):", JSON.stringify(MODEL));
      const result = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1000,
        messages: [...normalizedHistory, { role: "user", content: userContent }],
      });
      return extractReplyText(result);
    }

    async function callOpenAI() {
      if (!openai) throw new Error("OpenAI non configurato");
      console.log("MODEL_USED (OpenAI):", JSON.stringify(OPENAI_MODEL));

      // OpenAI: testo-only (per ora). L'immagine resta su Claude.
      const oaMessages = [
        ...normalizedHistory.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ];

      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: oaMessages,
      });

      return completion?.choices?.[0]?.message?.content?.trim() || "Nessuna risposta";
    }

    // 1) PRIMARY
    try {
      if (primary === "openai") {
        replyText = await callOpenAI();
        providerUsed = "openai";
      } else {
        replyText = await callAnthropic();
        providerUsed = "anthropic";
      }
    } catch (primaryErr) {
      console.warn("⚠ Primary failed:", shortErr(primaryErr));
    }

    // 2) FALLBACK
    if (!replyText) {
      try {
        if (primary === "openai") {
          replyText = await callAnthropic();
          providerUsed = "anthropic";
        } else {
          replyText = await callOpenAI();
          providerUsed = "openai";
        }
      } catch (fallbackErr) {
        console.error("❌ Fallback failed:", shortErr(fallbackErr));
        return res.status(500).json({
          error: "Entrambi i provider falliscono",
          details: fallbackErr?.message || String(fallbackErr),
        });
      }
    }

    // ✅ Se conversation_id valido, salva user + assistant nel DB
    if (conversation_id) {
      const c = await pool.query("select id from conversations where id = $1", [conversation_id]);
      if (c.rowCount === 0) {
        console.warn("⚠ conversation_id non trovato, non salvo:", conversation_id);
      } else {
        await pool.query(
          `insert into messages (conversation_id, role, content, image_url)
           values ($1,$2,$3,$4)`,
          [conversation_id, "user", message, null]
        );

        await pool.query(
          `insert into messages (conversation_id, role, content, image_url)
           values ($1,$2,$3,$4)`,
          [conversation_id, "assistant", replyText, null]
        );
      }
    }

    return res.json({ reply: replyText, provider: providerUsed, primary });
  } catch (err) {
    console.error("❌ Errore /api/chat:", shortErr(err));
    return res.status(500).json({
      error: "Errore interno del server",
      details: err?.message || String(err),
    });
  }
});

/* =========================
   DB ROUTES
========================= */

// POST conversations
app.post("/api/conversations", async (req, res) => {
  try {
    const { user_id = null, title = "Nuova chat" } = req.body || {};
    const q = "insert into conversations (user_id, title) values ($1,$2) returning *";
    const r = await pool.query(q, [user_id, title]);
    res.json({ ok: true, conversation: r.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST messages (accetta snake_case e camelCase)
app.post("/api/messages", async (req, res) => {
  try {
    const conversation_id =
      req.body?.conversation_id ?? req.body?.conversationId ?? null;

    const { role, content, image_url = null } = req.body || {};

    if (!conversation_id || !role || !content) {
      return res.status(400).json({
        ok: false,
        error: "conversation_id (o conversationId), role, content obbligatori",
      });
    }

    const convIdNum = toIntOrNull(conversation_id);
    if (!convIdNum) {
      return res.status(400).json({ ok: false, error: "conversation_id non valido" });
    }

    const q = `
      insert into messages (conversation_id, role, content, image_url)
      values ($1,$2,$3,$4)
      returning *`;
    const r = await pool.query(q, [convIdNum, role, content, image_url]);
    res.json({ ok: true, message: r.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET messages di una conversazione
app.get("/api/conversations/:id/messages", async (req, res) => {
  try {
    const id = toIntOrNull(req.params.id);

    if (!id) {
      return res.status(400).json({ ok: false, error: "conversation id non valido" });
    }

    const c = await pool.query("select id from conversations where id = $1", [id]);
    if (c.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "conversation_not_found" });
    }

    const q = `
      select id, conversation_id, role, content, image_url, created_at
      from messages
      where conversation_id = $1
      order by id asc
    `;
    const r = await pool.query(q, [id]);

    res.json({
      ok: true,
      conversation_id: id,
      count: r.rows.length,
      messages: r.rows,
    });
  } catch (err) {
    console.error("❌ Errore GET /api/conversations/:id/messages:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* =========================
   FRONTEND
========================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log("🚀 IA Wire Pro avviato su porta", PORT);
  console.log("MODEL_USED (Anthropic):", JSON.stringify(MODEL));
  console.log("MODEL_USED (OpenAI):", JSON.stringify(OPENAI_MODEL));
});
