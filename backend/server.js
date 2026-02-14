require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const multer = require("multer");

const app = express();

/* =========================
   CONFIG
========================= */

const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, "../frontend");

const JSON_LIMIT = "12mb";
const MULTIPART_FILE_MAX = 5 * 1024 * 1024; // 5MB
const HISTORY_MAX = 6;

// 🔥 HARD CODE MODEL (niente env, niente newline)
const MODEL = "claude-3-haiku-20240307";

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
      content: typeof m.content === "string"
        ? m.content
        : String(m.content ?? "")
    }));
}

function extractReplyText(result) {
  if (!result || !Array.isArray(result.content)) return "Nessuna risposta";

  return result.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();
}

function bytesToMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

/* =========================
   ROUTES
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
    model: MODEL,
    jsonLimit: JSON_LIMIT,
    multipartMaxMB: bytesToMB(MULTIPART_FILE_MAX)
  });
});

app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY mancante" });
    }

    const message = (req.body?.message || "").toString();
    if (!message) {
      return res.status(400).json({ error: "Campo 'message' obbligatorio" });
    }

    let history = [];
    if (req.body?.history) {
      try {
        history = JSON.parse(req.body.history);
      } catch {}
    }

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

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const result = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [
        ...normalizeHistory(history),
        { role: "user", content: userContent },
      ],
    });

    return res.json({ reply: extractReplyText(result) });

  } catch (err) {
    console.error("❌ Errore /api/chat:", err);
    return res.status(500).json({
      error: "Errore interno del server",
      details: err.message || String(err),
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

/* =========================
   START
========================= */

app.listen(PORT, () => {
  console.log("🚀 IA Wire Pro avviato");
  console.log("Modello:", MODEL);
});
