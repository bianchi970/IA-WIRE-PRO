require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();

/**
 * Middleware
 */
app.use(cors());

// Body più grande: immagini in base64 possono pesare
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Serve il frontend (cartella /frontend a fianco di /backend)
app.use(express.static(path.join(__dirname, "../frontend")));

/**
 * Health check
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "IA Wire Pro backend attivo",
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
  });
});

/**
 * Utils
 */

// Normalizza history in formato compatibile Anthropic
function normalizeHistory(history) {
  const safe = Array.isArray(history) ? history.slice(-6) : [];
  return safe
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => {
      // Anthropic accetta content string oppure array di blocchi
      let content = m.content;

      if (typeof content === "string") return { role: m.role, content };
      if (Array.isArray(content)) return { role: m.role, content };

      // fallback: converti qualsiasi cosa in stringa
      return { role: m.role, content: String(content ?? "") };
    });
}

// Estrae (mediaType, base64Data) da dataURL oppure base64 "nudo"
function parseImageInput(image) {
  if (!image || typeof image !== "string") return null;

  // Caso 1: dataURL completo
  const m = image.match(/^data:(image\/(jpeg|jpg|png|gif|webp));base64,(.+)$/i);
  if (m) {
    const mediaType = m[1].toLowerCase().replace("image/jpg", "image/jpeg");
    const base64Data = m[3];
    return { mediaType, base64Data };
  }

  // Caso 2: base64 "nudo" (senza prefisso)
  // Assumiamo jpeg se non specificato.
  return { mediaType: "image/jpeg", base64Data: image };
}

// Estrae testo da risposta Anthropic (può avere più blocchi)
function extractReplyText(result) {
  if (!result) return "Nessuna risposta dall'AI";

  const blocks = result.content;
  if (!Array.isArray(blocks)) return "Nessuna risposta dall'AI";

  const text = blocks
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return text || "Nessuna risposta dall'AI";
}

/**
 * Chat endpoint (testo + immagine)
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { message, image, history = [] } = req.body || {};

    // Log sentinella (puoi toglierli quando tutto va)
    console.log("REQ keys:", Object.keys(req.body || {}));
    console.log(
      "image typeof:",
      typeof image,
      "image head:",
      String(image || "").slice(0, 35)
    );

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Messaggio mancante",
        details: "Il campo 'message' è obbligatorio (string).",
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: "Configurazione mancante",
        details:
          "ANTHROPIC_API_KEY non trovata nelle variabili d'ambiente (Render o .env).",
      });
    }

    const systemPrompt = `Sei IA Wire Pro, un assistente tecnico virtuale multi-settore.

# Identità
NON sei un oracolo, sei un tecnico sul campo esperto in:
- Impianti elettrici
- Idraulica
- Termoidraulica e caldaie
- Domotica
- Impianti speciali

# Regola Assoluta
NON fornire MAI diagnosi certe con informazioni incomplete.

# Metodo di lavoro
1. Analizza ciò che è visibile o dichiarato
2. Evidenzia cosa NON è verificabile
3. Chiedi controlli aggiuntivi se necessari
4. Fornisci indicazioni graduali e sicure

# Livelli di Affidabilità
Ogni risposta deve indicare:
- ✅ Confermato
- ⚠️ Probabile
- ❓ Da verificare

# Uso delle immagini
- Descrivi SOLO ciò che vedi
- NON inventare componenti non visibili
- Segnala sempre i limiti (qualità, angolo, parti non visibili)

# Stile
- Tecnico ma comprensibile
- Frasi brevi
- Pochi fronzoli
- Max 2 domande per volta se servono
- Prima la SICUREZZA`;

    // Costruisci contenuto utente (immagine + testo)
    const userContent = [];

    const parsed = parseImageInput(image);
    if (parsed?.base64Data) {
      console.log(
        "IMG present: true",
        "len:",
        parsed.base64Data.length,
        "media:",
        parsed.mediaType
      );

      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: parsed.mediaType,
          data: parsed.base64Data,
        },
      });
    } else {
      console.log("IMG present: false");
    }

    userContent.push({
      type: "text",
      text: message,
    });

    const normalizedHistory = normalizeHistory(history);

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const result = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
      max_tokens: 1200,
      system: systemPrompt,
      messages: [...normalizedHistory, { role: "user", content: userContent }],
    });

    const reply = extractReplyText(result);
    return res.json({ reply });
  } catch (err) {
    console.error("❌ /api/chat error:", err);

    // Anthropic SDK spesso mette info utili in err.response / err.status ecc.
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

/**
 * Root -> serve index.html
 */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

/**
 * Start server
 */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║   🔌 IA WIRE PRO - Backend Attivo   ║
╠══════════════════════════════════════╣
║  Porta: ${String(PORT).padEnd(29)}║
║  Modello: ${String(process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest").padEnd(27)}║
║  API Anthropic: ${(process.env.ANTHROPIC_API_KEY ? "✅ Configurata" : "❌ Mancante").padEnd(19)}║
╚══════════════════════════════════════╝
`);
});
