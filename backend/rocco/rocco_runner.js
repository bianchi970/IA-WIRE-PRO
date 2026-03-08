/**
 * ROCCO RUNNER — Runner Principale
 * Funzione: runRocco({ message, history, userId, imageBase64, imageType })
 *
 * Flusso:
 *  1. buildSystemPrompt(userId) — cervello completo con formule + memoria
 *  2. Rileva numeri nel testo (V, A, W, Ω, cosφ, mm², m, Hz)
 *  3. Chiama Anthropic messages.create
 *  4. Se risposta contiene IPOTESI/VERIFICA → registra caso_reale (silenzioso)
 *  5. Restituisce { risposta, modello, tokens, numeri_rilevati }
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Anthropic = require('@anthropic-ai/sdk');
const { buildSystemPrompt } = require('./rocco_system_prompt');

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const ROCCO_MODEL    = (process.env.ROCCO_MODEL || process.env.ANTHROPIC_MODEL || 'claude-opus-4-6').trim();
const ANTHROPIC_KEY  = (process.env.ANTHROPIC_API_KEY || '').trim();

let _client = null;
function getClient() {
  if (!_client) {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY non configurata');
    _client = new Anthropic({ apiKey: ANTHROPIC_KEY });
  }
  return _client;
}

// ─── RILEVAMENTO NUMERI ───────────────────────────────────────────────────────

// Regex per valori tecnici elettrici: V, A, mA, kA, W, kW, Ω, kΩ, MΩ, cosφ, mm², m, Hz, kVA
const NUM_PATTERN = /(\d+(?:[.,]\d+)?)\s*(kv|mv|v\b|ka|ma\b|a\b|kw|mw|w\b|mω|kω|ω|cosφ|cos\s?φ|cos\s?phi|mm²|mm2|m\b|hz|kva|kvar|var\b)/gi;

function rilevaNumeri(testo) {
  const trovati = [];
  let m;
  NUM_PATTERN.lastIndex = 0;
  while ((m = NUM_PATTERN.exec(testo)) !== null) {
    trovati.push({ valore: m[1].replace(',', '.'), unita: m[2].toLowerCase() });
  }
  return trovati;
}

// ─── NORMALIZZA IMMAGINE ──────────────────────────────────────────────────────

function normalizzaImmagine(imageBase64, imageType) {
  if (!imageBase64) return null;
  const s = String(imageBase64);
  const match = s.match(/^data:(image\/[\w+]+);base64,(.+)$/i);
  if (match) return { mime: match[1], b64: match[2] };
  return { mime: imageType || 'image/jpeg', b64: s };
}

// ─── REGISTRA CASO REALE (silenzioso) ────────────────────────────────────────

async function registraCasoSilenzioso(userId, risposta) {
  // Solo se la risposta contiene sezioni diagnostiche significative
  if (!risposta || (!risposta.includes('IPOTESI') && !risposta.includes('🧠') && !risposta.includes('[Alta]') && !risposta.includes('[Alta'))) return;

  try {
    const mem = require('../modules/rocco_university/memory');
    await mem.registraCasoReale(userId, 'impianti_elettrici', {
      descrizione: risposta.slice(0, 300).replace(/\n/g, ' '),
      timestamp: new Date()
    });
  } catch (_) {
    // silenzioso — non blocca mai
  }
}

// ─── RUNNER PRINCIPALE ───────────────────────────────────────────────────────

/**
 * runRocco({ message, history, userId, imageBase64, imageType })
 * @returns {{ risposta: string, modello: string, tokens: number, numeri_rilevati: Array }}
 */
async function runRocco({ message, history, userId, imageBase64, imageType }) {
  message  = String(message  || '').trim();
  userId   = String(userId   || 'default');
  history  = Array.isArray(history) ? history : [];

  // 1. System prompt completo con cervello dinamico
  const systemPrompt = await buildSystemPrompt(userId);

  // 2. Rileva numeri nel testo
  const numeri_rilevati = rilevaNumeri(message);

  // 3. Costruisci messaggi
  const msgs = history.slice(-10).map(function(m) {
    return {
      role:    m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '')
    };
  });

  // Messaggio utente (con eventuale immagine)
  const img = normalizzaImmagine(imageBase64, imageType);
  if (img) {
    msgs.push({
      role: 'user',
      content: [
        { type: 'text', text: message || 'Analizza questa immagine.' },
        { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.b64 } }
      ]
    });
  } else {
    msgs.push({ role: 'user', content: message });
  }

  // 4. Chiama Anthropic
  const client = getClient();
  const resp = await client.messages.create({
    model:      ROCCO_MODEL,
    max_tokens: 2048,
    temperature: 0.1,
    system:     systemPrompt,
    messages:   msgs
  });

  const blocks = Array.isArray(resp && resp.content) ? resp.content : [];
  const risposta = blocks
    .filter(function(b) { return b && b.type === 'text'; })
    .map(function(b)    { return b.text; })
    .join('\n').trim() || 'Nessuna risposta.';

  const tokens = (resp && resp.usage)
    ? ((resp.usage.input_tokens || 0) + (resp.usage.output_tokens || 0))
    : 0;

  // 5. Registra caso reale (fire-and-forget, silenzioso)
  registraCasoSilenzioso(userId, risposta).catch(function() {});

  return {
    risposta,
    modello:         resp && resp.model ? resp.model : ROCCO_MODEL,
    tokens,
    numeri_rilevati
  };
}

module.exports = { runRocco };
