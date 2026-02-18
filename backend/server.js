/**
 * IA WIRE PRO - server.js (NASA Stable)
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

// Modalità formato (sempre consigliata)
const STRICT_FORMAT = String(process.env.STRICT_FORMAT || "1").trim() !== "0";

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

// Forza struttura IA Wire Pro se il modello non la rispetta
function ensureWireFormat(text) {
  const t = String(text || "").trim();
  if (!t) return "OSSERVAZIONI:\n- (risposta vuota)\n\nIPOTESI:\n- Non verificabile\n\nLIVELLO DI CERTEZZA:\n- Non verificabile\n\nRISCHI / SICUREZZA:\n- Verifica alimentazioni e isolamento prima di intervenire.\n\nVERIFICHE CONSIGLIATE:\n1) Fornisci una foto più ravvicinata e nitida.\n2) Indica marca/modello e cosa hai già verificato.\n\nPROSSIMO PASSO:\n- Inviami un dettaglio del componente principale.";

  // Se già contiene le sezioni principali, la lasciamo
  const hasObs = /OSSERVAZIONI\s*:/i.test(t);
  const hasHyp = /IPOTESI\s*:/i.test(t);
  const hasCert = /LIVELLO DI CERTEZZA\s*:/i.test(t);
  const hasChecks = /VERIFICHE CONSIGLIATE\s*:/i.test(t);

  if (hasObs && hasHyp && hasCert && hasChecks) return t;

  // Altrimenti incapsula in formato Wire Pro
  return [
    "OSSERVAZIONI:",
    "- " + t.replace(/\n+/g, "\n- "),
    "",
    "IPOTESI:",
    "- Probabile: serve conferma con misure/foto aggiuntive.",
    "",
    "LIVELLO DI CERTEZZA:",
    "- Probabile (dati incompleti).",
    "",
    "RISCHI / SICUREZZA:",
    "- Prima di intervenire: togli alimentazione, verifica assenza tensione, usa DPI adeguati.",
    "",
    "VERIFICHE CONSIGLIATE:",
    "1) Invia una foto più ravvicinata dei raccordi/valvole e del manometro (leggibile).",
    "2) Indica pressione letta, temperatura, e cosa succede quando apri/chiudi le valvole.",
    "3) Se impianto termico: indica caldaia/pompa/modello e presenza vaso espansione/valvola sicurezza.",
    "",
    "PROSSIMO PASSO:",
    "- Rispondi alle 3 verifiche sopra o carica un secondo scatto con zoom sul manometro."
  ].join("\n");
}

// Prompt “NASA” (struttura obbligatoria + affidabilità)
function buildSystemPrompt() {
  return [
    "SEI: IA WIRE PRO (Assistente Tecnico Virtuale).",
    "OBIETTIVO: aiutare in modo tecnico, prudente e verificabile.",
    "",
    "REGOLE DI AFFIDABILITÀ (OBBLIGATORIE):",
    "1) Non dare mai una diagnosi certa con dati incompleti.",
    "2) Se mancano informazioni, fai domande mirate e proponi verifiche misurabili.",
    "3) Dichiara SEMPRE un livello di certezza tra: Confermato / Probabile / Non verificabile.",
    "4) Evidenzia SEMPRE rischi e sicurezza (elettrico, gas, pressione, acqua calda, tagli, ecc.).",
    "5) Se vedi più interpretazioni possibili, elenca ipotesi in ordine di probabilità.",
    "6) Se l’utente è operativo sul campo: dai passi brevi, sequenziali, senza saltare.",
    "",
    "FORMATO RISPOSTA (OBBLIGATORIO, SEMPRE):",
    "OSSERVAZIONI:",
    "- ...",
    "",
    "IPOTESI:",
    "- (Confermato/Probabile/Non verificabile) ...",
    "",
    "LIVELLO DI CERTEZZA:",
    "- Confermato | Probabile | Non verificabile",
    "",
    "RISCHI / SICUREZZA:",
    "- ...",
    "",
    "VERIFICHE CONSIGLIATE:",
    "1) ...",
    "2) ...",
    "3) ...",
    "",
    "PROSSIMO PASSO:",
    "- una sola azione concreta da fare adesso.",
    "",
    "NOTE:",
    "- Se l’utente ha inviato una foto: descrivi cosa si vede (fatti) prima delle ipotesi.",
    "- Evita “potrebbe essere tutto”: scegli 2-3 ipotesi realistiche e spiega come discriminare."
  ].join("\n");
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
    strictFormat: STRICT_FORMAT,
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
    const body = req.body || {};

    // Message: sempre stringa
    let message = String(body.message || body.text || "").trim();

    // History: robusto
    const history = parseHistory(body.history);

    // Provider: stringa/null
    const provider = body.provider || null;

    // Immagine: multer (file) oppure JSON (imageBase64)
    let imageBase64 = null;

    if (req.file && req.file.buffer) {
      const base64 = req.file.buffer.toString("base64");
      imageBase64 = "data:" + req.file.mimetype + ";base64," + base64;
    }

    if (!imageBase64) {
      const rawB64 = body.imageBase64 || body.image_base64 || body.image || null;
      if (rawB64) imageBase64 = String(rawB64);
    }

    if (!message && imageBase64) message = "Analizza l'immagine e descrivi cosa vedi in modo tecnico.";

    if (!message && !imageBase64) {
      return res.status(400).json({
        error: "Manca 'message' o immagine.",
        signature: "ROCCO-CHAT-V2",
        debug: {
          contentType: req.headers["content-type"],
          bodyKeys: Object.keys(req.body || {}),
          hasFile: !!req.file,
        },
      });
    }

    const chosen = pickProvider(provider);
    if (chosen === "none") {
      return res.status(500).json({
        error: "Nessun provider configurato: manca OPENAI_API_KEY e/o ANTHROPIC_API_KEY in .env",
      });
    }

    const shortHistory = safeSliceHistory(history);
    const systemPrompt = buildSystemPrompt();

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
        if (img && img.mime && img.b64) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: message },
              { type: "image_url", image_url: { url: "data:" + img.mime + ";base64," + img.b64 } },
            ],
          });
        } else {
          messages.push({ role: "user", content: message });
        }
      } else {
        messages.push({ role: "user", content: message });
      }

      // “NASA”: più deterministico
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: messages,
        temperature: 0.1,
      });

      let answer = "Nessuna risposta.";
      try {
        if (completion && completion.choices && completion.choices[0] && completion.choices[0].message) {
          answer = completion.choices[0].message.content || answer;
        }
      } catch (_) {}

      if (STRICT_FORMAT) answer = ensureWireFormat(answer);

      return res.json({
        ok: true,
        provider: "openai",
        model: OPENAI_MODEL,
        answer: answer,
        signature: "ROCCO-CHAT-V2",
      });
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
        max_tokens: 900,
        temperature: 0.1,
        system: systemPrompt,
        messages: msgs,
      });

      const blocks = Array.isArray(resp && resp.content) ? resp.content : [];
      let answer = blocks
        .filter((b) => b && b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim() || "Nessuna risposta.";

      if (STRICT_FORMAT) answer = ensureWireFormat(answer);

      return res.json({
        ok: true,
        provider: "anthropic",
        model: ANTHROPIC_MODEL,
        answer: answer,
        signature: "ROCCO-CHAT-V2",
      });
    }

    return res.status(500).json({ error: "Provider non gestito." });
  } catch (err) {
    console.error("❌ /api/chat error:", err);
    return res.status(500).json({
      error: "Errore interno /api/chat",
      details: err && err.message ? err.message : String(err),
      signature: "ROCCO-CHAT-V2",
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
    res.status(500).json({ error: "Errore upload", details: err && err.message ? err.message : String(err) });
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
  res.status(500).json({ error: "Errore server", details: err && err.message ? err.message : String(err) });
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
      "║  StrictFormat: " + String(STRICT_FORMAT ? "ON" : "OFF").padEnd(21) + "║\n" +
      "║  OpenAI: " + String(OPENAI_API_KEY ? "✅ Configurata" : "❌ Mancante").padEnd(27) + "║\n" +
      "║  Anthropic: " + String(ANTHROPIC_API_KEY ? "✅ Configurata" : "❌ Mancante").padEnd(24) + "║\n" +
      "╚══════════════════════════════════════╝\n"
  );
});
