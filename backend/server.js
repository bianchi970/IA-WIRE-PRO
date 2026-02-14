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

// 🔥 MODEL pulito (elimina newline invisibili)
const MODEL = (process.env.ANTHROPIC_MODEL || "claude-3-haiku-latest").trim();

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
        : String(m.content ?? ""),
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

/* =========================
   ROUTES
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
    model: MODEL,
  });
});

app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: "ANTHROPIC_API_KEY mancante",
      });
    }

    const message = (req.body?.message || "").toString();
    if (!message) {
      return res.status(400).json({
        error: "Messaggio mancante",
      });
    }

    const history = normalizeHistory(req.body?.history);

    const userContent = [];

    // Se arriva immagine multipart
    if (req.file && req.file.buffer) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: req.file.mimetype || "image/jpeg",
          data: req.file.buffer.toString("base64"),
        },
      });
    }

    userContent.push({
      type: "text",
      text: message,
    });

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const result = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [
        ...history,
        { role: "user", content: userContent },
      ],
    });

    const reply = extractReplyText(result);

    return res.json({ reply });
  } catch (err) {
    console.error("Chat error:", err?.response?.data || err?.message || err);
    return res.status(500).json({
      error: "Errore interno",
      details: err?.message || "Unknown error",
    });
  }
});

/* =========================
   START
========================= */

app.listen(PORT, () => {
  console.log("IA Wire Pro backend attivo");
  console.log("Modello:", MODEL);
});
