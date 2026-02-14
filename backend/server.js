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

// Limiti prudenziali: Render + proxy + Anthropic
const JSON_LIMIT = "12mb";            // JSON base64 (meglio tenerlo più basso)
const MULTIPART_FILE_MAX = 5 * 1024 * 1024; // 5MB file reale
const HISTORY_MAX = 6;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307";

/* =========================
   MIDDLEWARE
========================= */

// CORS (se frontend è servito dallo stesso servizio, va bene anche wildcard)
app.use(cors());

// Body parser JSON
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: JSON_LIMIT }));

// Static frontend
app.use(express.static(FRONTEND_DIR));

// Multer (multipart/form-data)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MULTIPART_FILE_MAX },
});

// Log minimale per capire se la request ARRIVA
app.use((req, res, next) => {
  const ct = req.headers["content-type"] || "";
  console.log(`➡ ${req.method} ${req.url} | CT: ${ct} | Len: ${req.headers["content-length"] || "?"}`);
  next();
});

/* =========================
   HELPERS
========================= */

function normalizeHistory(history) {
  const safe = Array.isArray(history) ? history.slice(-HISTORY_MAX) : [];
  return safe
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => {
      let content = m.content;
      if (typeof content === "string") return { role: m.role, content };
      if (Array.isArray(content)) return { role: m.role, content };
      return { role: m.role, content: String(content ?? "") };
    });
}

function parseImageDataUrl(image) {
  if (!image || typeof image !== "string") return null;

  const m = image.match(/^data:(image\/(jpeg|jpg|png|gif|webp));base64,(.+)$/i);
  if (m) {
    const mediaType = m[1].toLowerCase().replace("image/jpg", "image/jpeg");
    const base64Data = m[3];
    return { mediaType, base64Data };
  }

  // base64 nudo: assumo jpeg
  return { mediaType: "image/jpeg", base64Data: image };
}

function bytesToMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function extractReplyText(result) {
  if (!result || !Array.isArray(result.content)) return "Nessuna risposta dall'AI";

  const text = result.content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return text || "Nessuna risposta dall'AI";
}

/* =========================
   ROUTES
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "IA Wire Pro backend attivo",
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
    model: MODEL,
    jsonLimit: JSON_LIMIT,
    multipartMaxMB: bytesToMB(MULTIPART_FILE_MAX),
  });
});

/**
 * CHAT: supporta:
 * A) application/json  -> { message, image(base64/dataURL), history }
 * B) multipart/form-data -> fields: message, history (json), file: image
 */

// B) MULTIPART (consigliato su Render)
app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "Configurazione mancante", details: "ANTHROPIC_API_KEY mancante" });
    }

    // message sempre
    const message = (req.body?.message ?? "").toString();

    // history può arrivare come stringa JSON
    let history = [];
    if (req.body?.history) {
      try {
        history = typeof req.body.history === "string" ? JSON.parse(req.body.history) : req.body.history;
      } catch {
        history = [];
      }
    }

    if (!message) {
      return res.status(400).json({ error: "Messaggio mancante", details: "Campo 'message' obbligatorio" });
    }

    const userContent = [];

    // immagine da multipart (file reale)
    if (req.file && req.file.buffer) {
      const mediaType = (req.file.mimetype || "image/jpeg").toLowerCase().replace("image/jpg", "image/jpeg");
      const base64Data = req.file.buffer.toString("base64");

      console.log(`🖼 multipart image: ${mediaType} | sizeMB: ${bytesToMB(req.file.size)}`);

      userContent.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: base64Data },
      });
    }

    // fallback: se NON c’è file, prova JSON base64 (nel caso frontend non è ancora aggiornato)
    if (!req.file && req.body?.image) {
      const parsed = parseImageDataUrl(req.body.image);
      if (parsed?.base64Data) {
        console.log(`🖼 json image: ${parsed.mediaType} | base64Len: ${parsed.base64Data.length}`);
        userContent.push({
          type: "image",
          source: { type: "base64", media_type: parsed.mediaType, data: parsed.base64Data },
        });
      }
    }

    userContent.push({ type: "text", text: message });

    const systemPrompt = `Sei IA Wire Pro, un assistente tecnico virtuale multi-settore.

# Regola Assoluta
NON fornire MAI diagnosi certe con informazioni incomplete.

# Metodo
1) Analizza ciò che è visibile/dichiarato
2) Evidenzia cosa NON è verificabile
3) Chiedi controlli aggiuntivi (max 2 domande)
4) Fornisci indicazioni graduali e sicure

# Livelli di Affidabilità
- ✅ Confermato
- ⚠️ Probabile
- ❓ Da verificare

# Immagini
- Descrivi SOLO ciò che vedi
- NON inventare componenti
- Segnala i limiti (angolo/qualità/parti non visibili)

# Stile
Tecnico, frasi brevi, pochi fronzoli. Prima la SICUREZZA.`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const result = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: systemPrompt,
      messages: [...normalizeHistory(history), { role: "user", content: userContent }],
    });

    const reply = extractReplyText(result);
    return res.json({ reply });
  } catch (err) {
    console.error("❌ /api/chat error:", err?.message || err);

    const details =
      err?.response?.data ||
      err?.message ||
      String(err);

    return res.status(500).json({
      error: "Errore interno del server",
      details: typeof details === "string" ? details : JSON.stringify(details),
    });
  }
});

// Root -> index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

/* =========================
   ERROR HANDLING
========================= */

// Gestione 413 Multer (file troppo grande) o body troppo grande
app.use((err, req, res, next) => {
  if (err) {
    const msg = err.message || "";
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "Immagine troppo grande",
        details: `Max ${bytesToMB(MULTIPART_FILE_MAX)}MB. Comprimi o riduci la foto.`,
      });
    }
    if (msg.includes("request entity too large") || msg.includes("PayloadTooLargeError")) {
      return res.status(413).json({
        error: "Payload troppo grande",
        details: `Riduci dimensione foto (meglio usare multipart). JSON limit: ${JSON_LIMIT}.`,
      });
    }
  }
  next(err);
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║   🔌 IA WIRE PRO - Backend Attivo   ║
╠══════════════════════════════════════╣
║  Porta: ${String(PORT).padEnd(29)}║
║  Modello: ${String(MODEL).padEnd(27)}║
║  JSON limit: ${String(JSON_LIMIT).padEnd(24)}║
║  Multipart max: ${String(bytesToMB(MULTIPART_FILE_MAX) + "MB").padEnd(22)}║
║  API Anthropic: ${(process.env.ANTHROPIC_API_KEY ? "✅ Configurata" : "❌ Mancante").padEnd(19)}║
╚══════════════════════════════════════╝
`);
});
