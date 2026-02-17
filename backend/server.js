/**
 * IA WIRE PRO - server.js (FIX "app is not defined")
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
const app = express(); // ✅ IMPORTANTISSIMO: prima di qualunque app.use/app.get/app.post
console.log("✅ RUNNING FILE: backend/server.js - BUILD:", new Date().toISOString());

const PORT = process.env.PORT || 3000;

// Se il frontend è in /frontend (cartella sorella di /backend)
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

// Multer (upload file binari, opzionale)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MULTIPART_FILE_MAX },
});

// Static frontend (se esiste)
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
  const p = (providerRequested || "").toLowerCase().trim();

  // Se l’utente chiede esplicitamente
  if (p === "anthropic" || p === "claude") return "anthropic";
  if (p === "openai" || p === "gpt") return "openai";

  // Default: preferisci OpenAI se presente, altrimenti Anthropic
  if (openai) return "openai";
  if (anthropic) return "anthropic";
  return "none";
}

function safeSliceHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-HISTORY_MAX).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));
}

// Accetta immagine come base64 dataURL o base64 puro
function normalizeBase64Image(imageBase64) {
  if (!imageBase64) return null;
  const s = String(imageBase64);
  const m = s.match(/^data:(image\/\w+);base64,(.+)$/i);
  if (m) return { mime: m[1], b64: m[2] };
  // se è base64 puro, assumo png (puoi cambiarlo)
  return { mime: "image/png", b64: s };
}

// =========================
// ROUTES
// =========================
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
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

// (Opzionale) Se vuoi che / apra sempre index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

/**
 * POST /api/chat
 * Body JSON:
 * {
 *   "message": "testo utente",
 *   "history": [{role:"user|assistant", content:"..."}],
 *   "provider": "openai|anthropic" (opzionale),
 *   "imageBase64": "data:image/jpeg;base64,...." (opzionale)
 * }
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history, provider, imageBase64 } = req.body || {};
    const userText = String(message || "").trim();

    if (!userText && !imageBase64) {
      return res.status(400).json({ error: "Manca 'message' (o 'imageBase64')." });
    }

    const chosen = pickProvider(provider);
    if (chosen === "none") {
      return res.status(500).json({
        error: "Nessun provider configurato: manca OPENAI_API_KEY e/o ANTHROPIC_API_KEY in .env",
      });
    }

    const shortHistory = safeSliceHistory(history);

    // Prompt “tecnico” base (poi lo raffiniamo con il protocollo affidabilità)
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

      // Costruiamo messages
      const messages = [
        { role: "system", content: systemPrompt },
        ...shortHistory,
      ];

      // Se c’è immagine, usiamo formato multimodale (supportato da modelli recenti)
      if (imageBase64) {
        const img = normalizeBase64Image(imageBase64);
        messages.push({
          role: "user",
          content: [
            { type: "text", text: userText || "Analizza l'immagine e dimmi cosa vedi." },
            { type: "image_url", image_url: { url: `data:${img.mime};base64,${img.b64}` } },
          ],
        });
      } else {
        messages.push({ role: "user", content: userText });
      }

      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.2,
      });

      const answer = completion?.choices?.[0]?.message?.content || "Nessuna risposta.";
      return res.json({ ok: true, provider: "openai", model: OPENAI_MODEL, answer });
    }

    // =========================
    // ANTHROPIC (Claude)
    // =========================
    if (chosen === "anthropic") {
      if (!anthropic) {
        return res.status(500).json({ error: "Anthropic non configurato (ANTHROPIC_API_KEY mancante)." });
      }

      // Anthropic usa system separato + messages
      const msgs = [...shortHistory];

      // Gestione immagine: Claude vuole blocchi content (text + image)
      if (imageBase64) {
        const img = normalizeBase64Image(imageBase64);
        msgs.push({
          role: "user",
          content: [
            { type: "text", text: userText || "Analizza l'immagine e dimmi cosa vedi." },
            {
              type: "image",
              source: { type: "base64", media_type: img.mime, data: img.b64 },
            },
          ],
        });
      } else {
        msgs.push({ role: "user", content: userText });
      }

      const resp = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 800,
        temperature: 0.2,
        system: systemPrompt,
        messages: msgs,
      });

      // Estrazione testo
      const blocks = Array.isArray(resp.content) ? resp.content : [];
      const answer = blocks
        .filter((b) => b && b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim() || "Nessuna risposta.";

      return res.json({ ok: true, provider: "anthropic", model: ANTHROPIC_MODEL, answer });
    }

    return res.status(500).json({ error: "Provider non gestito." });
  } catch (err) {
    console.error("❌ /api/chat error:", err);
    return res.status(500).json({
      error: "Errore interno /api/chat",
      details: err?.message || String(err),
    });
  }
});

// Upload binario opzionale (se vuoi inviare file invece di base64)
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
    res.status(500).json({ error: "Errore upload", details: err?.message || String(err) });
  }
});

// Fallback: se route non trovata ma stai usando SPA
app.use((req, res, next) => {
  // Se è una chiamata API, non fare fallback su index
  if (req.path.startsWith("/api/") || req.path === "/health") return next();
  return res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// Error handler
app.use((err, req, res, next) => {
  console.error("❌ Express error:", err);
  res.status(500).json({ error: "Errore server", details: err?.message || String(err) });
});

// =========================
// START
// =========================
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║   🔌 IA WIRE PRO - Backend Attivo    ║
╠══════════════════════════════════════╣
║  Porta: ${String(PORT).padEnd(29)}║
║  Frontend: ${FRONTEND_DIR.padEnd(26)}║
║  OpenAI: ${(OPENAI_API_KEY ? "✅ Configurata" : "❌ Mancante").padEnd(27)}║
║  Anthropic: ${(ANTHROPIC_API_KEY ? "✅ Configurata" : "❌ Mancante").padEnd(24)}║
╚══════════════════════════════════════╝
`);
});
