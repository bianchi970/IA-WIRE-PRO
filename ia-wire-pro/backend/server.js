require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();

app.use(cors());
app.use(express.json({ limit: "12mb" }));
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "IA Wire Pro backend attivo",
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY,
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, image, history = [] } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Messaggio mancante",
        details: "Il campo 'message' è obbligatorio",
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: "Configurazione mancante",
        details: "ANTHROPIC_API_KEY non trovata nelle variabili d'ambiente di Render.",
      });
    }

    const systemPrompt = `Sei IA Wire Pro, un assistente tecnico virtuale.
- Non dare diagnosi certe con dati incompleti.
- Indica sempre livelli: ✅ Confermato / ⚠️ Probabile / ❓ Da verificare.
- Con immagini: descrivi solo ciò che vedi, non inventare.`;

    const userContent = [];

    if (image && typeof image === "string") {
      const m = image.match(/^data:(image\/(jpeg|jpg|png|gif|webp));base64,(.+)$/i);
      if (m) {
        const mediaType = m[1].toLowerCase().replace("jpg", "jpeg");
        const base64Data = m[3];
        userContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: base64Data,
          },
        });
      }
    }

    userContent.push({ type: "text", text: message });

    const safeHistory = Array.isArray(history) ? history.slice(-6) : [];

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const result = await anthropic.messages.create({
  model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
  max_tokens: 1200,
  system: systemPrompt,
  messages: [
    ...safeHistory,
    { role: "user", content: userContent },
  ],
});


    const reply = result?.content?.[0]?.text || "Nessuna risposta dall'AI";
    res.json({ reply });

  } catch (err) {
    console.error("❌ Errore /api/chat:", err);
    res.status(500).json({
      error: "Errore interno del server",
      details: String(err?.message || err),
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`IA Wire Pro backend attivo su porta ${PORT}`);
});
