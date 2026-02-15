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
   CHAT (Claude) + fallback OpenAI + optional DB save
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

    if (req.file?.buffer) {
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

    // -------------------------
    // 1) PROVA CLAUDE
    // -------------------------
    let replyText = null;
    let providerUsed = null;

    if (anthropic) {
      try {
        console.log("MODEL_USED (Claude):", JSON.stringify(MODEL));

        const result = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 1000,
          messages: [...normalizedHistory, { role: "user", content: userContent }],
        });

        replyText = extractReplyText(result);
        providerUsed = "anthropic";
      } catch (claudeErr) {
        console.warn("⚠ Claude failed, trying OpenAI fallback:", shortErr(claudeErr));
      }
    } else {
      console.warn("⚠ Anthropic non configurato, provo OpenAI direttamente.");
    }

    // -------------------------
    // 2) FALLBACK OPENAI
    // -------------------------
    if (!replyText) {
      if (!openai) {
        return res.status(500).json({
          error: "Nessun provider disponibile (manca ANTHROPIC_API_KEY e/o OPENAI_API_KEY)",
        });
      }

      console.log("MODEL_USED (OpenAI):", JSON.stringify(OPENAI_MODEL));

      // OpenAI: niente immagine in questo fallback (per ora).
      // Se vuoi anche vision su OpenAI lo facciamo dopo, ma intanto fallback sicuro.
      const oaMessages = [
        ...normalizedHistory.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ];

      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: oaMessages,
      });

      replyText = completion?.choices?.[0]?.message?.content?.trim() || "Nessuna risposta";
      providerUsed = "openai";
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

    return res.json({ reply: replyText, provider: providerUsed });
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
