/**
 * IA WIRE PRO - server.js (Stable)
 * Node + Express + (Anthropic / OpenAI) + Multer + Static Frontend
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const multer = require("multer");

const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");

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
const HISTORY_MAX = Number(process.env.HISTORY_MAX || 6);

// Provider keys + modelli (trim anti newline)
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || "").trim();
const ANTHROPIC_MODEL = (process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307").trim();

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

// =========================
// MIDDLEWARE
// =========================
app.use(cors());
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));

// Multer (upload file binari)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MULTIPART_FILE_MAX },
});

// Static frontend
app.use(express.static(FRONTEND_DIR));

// =========================
// CLIENTS
// =========================
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// =========================
// UTILS
// =========================
function pickProvider(providerRequested) {
  const p = String(providerRequested || "").toLowerCase().trim();

  if (p === "anthropic" || p === "claude") return "anthropic";
  if (p === "openai" || p === "gpt") return "openai";

  if (openai) return "openai";
  if (anthropic) return "anthropic";
  return "none";
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

// =========================
// ROUTES
// =========================
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    signature: "ROCCO-CHAT-V2",
    runningFile: "backend/server.js",
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



app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

/**
 * POST /api/chat
 * Supporta:
 * 1) multipart/form-data (FormData) con:
 *    - message
 *    - history (string JSON opzionale)
 *    - provider (opzionale)
 *    - image (file opzionale)
 *
 * 2) JSON con:
 *    - message
 *    - history (array o string JSON)
 *    - provider (opzionale)
 *    - imageBase64 (opzionale)
 */
app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    // LOG minimali: se non li vedi su Render, stai eseguendo un file diverso
    console.log("📥 /api/chat content-type:", req.headers["content-type"]);
    console.log("📥 /api/chat body keys:", Object.keys(req.body || {}));
    console.log("📥 /api/chat has file:", !!req.file, req.file ? req.file.fieldname : "(no-file)");

    const body = req.body || {};

    // Message: sempre stringa
    let message = String(body.message || "").trim();

    // History: robusto
    const history = parseHistory(body.history);

    // Provider: stringa/null
    const provider = body.provider || null;

    // Immagine: può arrivare da multer (file) oppure da JSON (imageBase64)
    let imageBase64 = null;

    // 1) file binario
    if (req.file && req.file.buffer) {
      const base64 = req.file.buffer.toString("base64");
      imageBase64 = "data:" + req.file.mimetype + ";base64," + base64;
    }

    // 2) base64 dal body (fallback)
    if (!imageBase64) {
      // accetta varianti nome campo
      const rawB64 = body.imageBase64 || body.image_base64 || body.image || null;
      if (rawB64) imageBase64 = String(rawB64);
    }

    // Se c'è immagine ma message vuoto, mettiamo un prompt minimo
    if (!message && imageBase64) message = "Analizza l'immagine e dimmi cosa vedi.";

    // Guardia 400: serve almeno testo o immagine
    if (!message && !imageBase64) {
      return res.status(400).json({ error: "Manca 'message' o immagine." });
    }

    const chosen = pickProvider(provider);
    if (chosen === "none") {
      return res.status(500).json({
        error: "Nessun provider configurato: manca OPENAI_API_KEY e/o ANTHROPIC_API_KEY in .env",
      });
    }

    const shortHistory = safeSliceHistory(history);

    const systemPrompt =
      "Sei IA WIRE PRO, un assistente tecnico. " +
      "Prima di concludere, fai verifiche e indica il livello di certezza (confermato/probabile/non verificabile). " +
      "Se mancano dati, fai domande mirate. Priorità assoluta: sicurezza.";

    // =========================
    // OPENAI
    // =========================
    if (chosen === "openai") {
      if (!openai) {
        return res.status(500).json({ error: "OPENAI non configurato (OPENAI_API_KEY mancante)." });
      }

      const messages = [{ role: "system", content: systemPrompt }].concat(shortHistory);

      if (imageBase64) {
        const img = normalizeBase64Image(imageBase64);
        // img potrebbe essere null se base64 invalido
        if (img && img.mime && img.b64) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: message },
              { type: "image_url", image_url: { url: "data:" + img.mime + ";base64," + img.b64 } },
            ],
          });
        } else {
          // fallback solo testo
          messages.push({ role: "user", content: message });
        }
      } else {
        messages.push({ role: "user", content: message });
      }

      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: messages,
        temperature: 0.2,
      });

      let answer = "Nessuna risposta.";
      try {
        if (completion && completion.choices && completion.choices[0] && completion.choices[0].message) {
          answer = completion.choices[0].message.content || answer;
        }
      } catch (_) {}

      return res.json({ ok: true, provider: "openai", model: OPENAI_MODEL, answer: answer });
    }

    // =========================
    // ANTHROPIC
    // =========================
    if (chosen === "anthropic") {
      if (!anthropic) {
        return res.status(500).json({ error: "Anthropic non configurato (ANTHROPIC_API_KEY mancante)." });
      }

      const msgs = shortHistory.slice();

      if (imageBase64) {
        const img = normalizeBase64Image(imageBase64);
        if (img && img.mime && img.b64) {
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
      } else {
        msgs.push({ role: "user", content: message });
      }

      const resp = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 800,
        temperature: 0.2,
        system: systemPrompt,
        messages: msgs,
      });

      const blocks = Array.isArray(resp && resp.content) ? resp.content : [];
      const answer = blocks
        .filter((b) => b && b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim() || "Nessuna risposta.";

      return res.json({ ok: true, provider: "anthropic", model: ANTHROPIC_MODEL, answer: answer });
    }

    return res.status(500).json({ error: "Provider non gestito." });
  } catch (err) {
    console.error("❌ /api/chat error:", err);
    return res.status(500).json({
      error: "Errore interno /api/chat",
      details: (err && err.message) ? err.message : String(err),
    });
  }
});

// Upload binario opzionale
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Nessun file caricato (field 'file')." });
    res.json({
      ok: true,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (err) {
    console.error("❌ /api/upload error:", err);
    res.status(500).json({ error: "Errore upload", details: (err && err.message) ? err.message : String(err) });
  }
});

// Fallback SPA
app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path === "/health") return next();
  return res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// Error handler
app.use((err, req, res, next) => {
  console.error("❌ Express error:", err);
  res.status(500).json({ error: "Errore server", details: (err && err.message) ? err.message : String(err) });
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
      "║  Porta: " + String(PORT).padEnd(29) + "║\n" +
      "║  Frontend: " + String(FRONTEND_DIR).padEnd(26) + "║\n" +
      "║  OpenAI: " + String(OPENAI_API_KEY ? "✅ Configurata" : "❌ Mancante").padEnd(27) + "║\n" +
      "║  Anthropic: " + String(ANTHROPIC_API_KEY ? "✅ Configurata" : "❌ Mancante").padEnd(24) + "║\n" +
      "╚══════════════════════════════════════╝\n"
  );
});
