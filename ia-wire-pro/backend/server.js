require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Aumentato limite per immagini base64
app.use(express.static(path.join(__dirname, '../frontend')));

// =========================
// HEALTH CHECK
// =========================
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "IA Wire Pro backend attivo",
    anthropicConfigured: !!process.env.ANTHROPIC_API_KEY
  });
});

// =========================
// CHAT ENDPOINT (con supporto immagini)
// =========================
app.post("/api/chat", async (req, res) => {
  try {
    const { message, image, history = [] } = req.body || {};

    // Validazione input
    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Messaggio mancante",
        details: "Il campo 'message' è obbligatorio"
      });
    }

    // Verifica API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: "Configurazione mancante",
        details: "ANTHROPIC_API_KEY non trovata. Aggiungi la chiave nelle variabili d'ambiente di Render."
      });
    }

    // System prompt basato su AI_RULES.md
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
- ✅ Confermato (quando sei sicuro al 100%)
- ⚠️ Probabile (ipotesi ragionevole ma da verificare)
- ❓ Da verificare (serve un controllo fisico)

# Uso delle immagini
- Descrivi SOLO ciò che vedi
- NON inventare componenti non visibili
- Segnala sempre i limiti di visione o qualità immagine
- Se l'immagine è sfocata o poco chiara, dillo subito

# Stile di risposta
- Linguaggio tecnico ma comprensibile
- Frasi brevi e dirette
- Nessun fronzolo
- Approccio pratico "old school"
- Massimo 2 domande per volta, solo se davvero necessarie
- Prima la SICUREZZA, sempre`;

    // Costruisci i messaggi per l'API
    const messages = [];

    // Aggiungi cronologia se presente
    if (history && history.length > 0) {
      messages.push(...history.slice(-6)); // Ultimi 3 scambi (6 messaggi)
    }

    // Costruisci il messaggio utente
    const userMessage = {
      role: "user",
      content: []
    };

    // Aggiungi immagine se presente
    if (image) {
      // Estrai base64 e media type
      const base64Match = image.match(/^data:image\/(jpeg|jpg|png|gif|webp);base64,(.+)$/);
      
      if (base64Match) {
        const mediaType = `image/${base64Match[1] === 'jpg' ? 'jpeg' : base64Match[1]}`;
        const base64Data = base64Match[2];

        userMessage.content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: base64Data
          }
        });
      }
    }

    // Aggiungi il testo
    userMessage.content.push({
      type: "text",
      text: message
    });

    messages.push(userMessage);

    // Payload per Anthropic API
    const payload = {
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2000,
      system: systemPrompt,
      messages: messages
    };

    console.log("📤 Invio richiesta ad Anthropic...");

    // Chiamata API Anthropic
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("❌ Errore Anthropic:", errText);
      
      return res.status(response.status).json({
        error: "Errore API Anthropic",
        details: errText
      });
    }

    const data = await response.json();
    console.log("✅ Risposta ricevuta da Anthropic");

    // Estrai la risposta
    const reply = data?.content?.[0]?.text || "Nessuna risposta dall'AI";

    res.json({ reply });

  } catch (err) {
    console.error("❌ Errore server:", err);
    res.status(500).json({
      error: "Errore interno del server",
      details: String(err.message)
    });
  }
});

// =========================
// SERVE FRONTEND (per Render)
// =========================
app.get("/", (req, res) => {
  res.send("IA Wire Pro Backend attivo");
});


// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║   🔌 IA WIRE PRO - Backend Attivo   ║
╠══════════════════════════════════════╣
║  Porta: ${PORT.toString().padEnd(29)}║
║  API Anthropic: ${(process.env.ANTHROPIC_API_KEY ? "✅ Configurata" : "❌ Mancante").padEnd(19)}║
╚══════════════════════════════════════╝
  `);
});
//Fix route wildcard
