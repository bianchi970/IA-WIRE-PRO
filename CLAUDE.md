# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start backend (always from backend/ dir to load .env correctly)
cd backend && node server.js

# Run DB migration (idempotent, transactional)
cd backend && node migrate.js

# Health check
curl http://localhost:3000/health

# Test chat API
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"testo","user_id":"test"}'

# Ingest doc_chunks (RAG manuale — idempotente, ri-eseguibile)
cd backend && node ingest.js

# Ingest enciclopedia tecnica components+issues (idempotente)
cd backend && node ingest_encyclopedia.js

# Install backend dependencies
cd backend && npm install
```

## Architecture

```
ia-wire-pro/
├── backend/
│   ├── server.js        ← Express API + AI routing + DB persistence + offline fallback
│   ├── db.js            ← pg.Pool singleton (requires DATABASE_URL)
│   ├── migrate.js       ← Schema migration (transactional, idempotent)
│   ├── schema.sql       ← Tables: conversations, messages, message_attachments
│   │                       (components and issues are NOT touched here)
│   ├── knowledge.js     ← Lazy-loads knowledge/*.json; fetchKnowledgeContext() + getLoadedKnowledge()
│   ├── knowledge/       ← Base di conoscenza locale (no DB required)
│   │   ├── components.json       ← 10 componenti elettrici con guasti tipici e field_checks
│   │   ├── protection_rules.json ← 8 regole di protezione con risk_level e verification_steps
│   │   ├── failure_patterns.json ← 6 pattern di guasto con symptom/causes/checks/confidence_logic
│   │   └── safety_protocols.json ← 5 protocolli LOTO/isolamento/misura con stop_conditions
│   ├── engine/          ← ROCCO diagnostic engine (pre-LLM)
│   │   └── diagnosticEngine.js  ← analyzeTechnicalRequest() + formatOfflineAnswer() + MATCH_THRESHOLD=3
│   ├── rocco/           ← IA pipeline module
│   │   ├── index.js     ← plan() + buildSystemPrompt() + buildUserPayload()
│   │   ├── policies.js  ← HARD_SAFETY_RULES, GOLDEN_RULES, TECH_REPORT_SECTIONS
│   │   └── postcheck.js ← Validates/injects missing sections in AI output
│   └── .env             ← dotenv loaded with path.join(__dirname, ".env")
└── frontend/
    ├── app.js           ← Vanilla JS IIFE, no framework
    ├── index.html
    └── style.css
```

## Key Architectural Decisions

### dotenv path
Both `server.js` and `migrate.js` load `.env` with an explicit path:
```js
require("dotenv").config({ path: path.join(__dirname, ".env") });
```
Do NOT change to bare `require("dotenv").config()` — it will fail when run from the repo root.

### ROCCO Diagnostic Engine (OFFICINA FULL AUTO)
`backend/engine/diagnosticEngine.js` runs **before** any LLM call and produces structured pre-analysis:
- `analyzeTechnicalRequest(input, knowledge)` → `{ isTechnical, isDangerous, matchedPatterns[], matchedRules[], osservazioni[], ipotesi[], verifiche[], rischi[], conclusione }`
- Scoring: `symptom × 3 + likely_causes × 2 + checks × 1` + PAIR_BOOSTS (+4 per coppia italiana rilevante)
- `MATCH_THRESHOLD = 3` — evita falsi positivi su keyword singole
- `normalize()` rimuove accenti italiani per matching robusto (relè → rele, ecc.)
- `formatOfflineAnswer(diag)` → risposta completa ROCCO-format quando LLM non raggiungibile
- Startup log: `"ROCCO ENGINE: ACTIVE"` + `"KNOWLEDGE ITEMS: N components, N failure_patterns, ..."`

### Knowledge Base locale (backend/knowledge/)
4 JSON files caricati lazy da `knowledge.js` (una sola volta al primo uso):
- `fetchKnowledgeContext(query)` → stringa formattata per il system prompt (top 2+2+1+1)
- `getLoadedKnowledge()` → dati grezzi `{ components, protectionRules, failurePatterns, safetyProtocols }` per il diagnostic engine
- Nessun DB richiesto: tutto offline, sempre disponibile

### Offline fallback /api/chat (OFFICINA FULL AUTO — C)
Se tutti i provider LLM falliscono per errore di rete (`isNetworkError()` detecta ENOTFOUND/ETIMEDOUT/ECONNRESET/ECONNREFUSED/EAI_AGAIN/ENETUNREACH):
- `usedProvider = "offline_engine"`, `usedModel = "rocco-local-v2"`
- Risposta = `formatOfflineAnswer(engineDiag)` — formato ROCCO completo con nota `"⚠️ risposta generata localmente"`
- `STRICT_FORMAT` skippato per `usedProvider === "offline_engine"` (già formattato)
- Se l'errore non è di rete → `throw lastErr` (comportamento normale)

### /api/engine/test endpoint
`GET /api/engine/test` esegue `analyzeTechnicalRequest` sul caso di test hardcoded (`TEST_CASE` in diagnosticEngine.js) usando i dati reali dei JSON. Utile per verificare il pattern matching senza avviare una conversazione. Risposta include `diagnostic`, `formatted_engine_context`, `formatted_knowledge_context`, `counts`.

### Dual response format issue
`rocco/index.js` produces `TECH_REPORT_V1` format (sections: OSSERVAZIONI, COMPONENTI RICONOSCIUTI, IPOTESI, VERIFICHE SUL CAMPO, RISCHI / SICUREZZA, NEXT STEP).
`server.js` also has its own `ensureWireFormat()` which enforces a different section set (OSSERVAZIONI, IPOTESI, LIVELLO DI CERTEZZA, RISCHI / SICUREZZA, VERIFICHE CONSIGLIATE, PROSSIMO PASSO).
The two formats coexist: `rocco.buildSystemPrompt()` is used to build the prompt, then `ensureWireFormat()` is applied to the raw answer. This causes nested section output from the model. Reconciling the two formats is an open improvement.

### Rocco module
`rocco.plan()` classifies the user message into domains (elettrico, termico, rete, domotica, idraulico, altro) using keyword regex. RAG is disabled for domain `"altro"`. The plan drives model selection and system prompt construction but does NOT currently change the provider — the actual provider selection happens in `server.js` via `pickProvider()`.

### RAG (Encyclopedia)
PostgreSQL full-text search (`plainto_tsquery('italian', ...)`) over `components` and `issues` tables. Multi-word queries use AND logic — single keywords match better than full phrases. Context is injected into the system prompt if results are found.

### conversation_id persistence
`POST /api/chat` accepts optional `conversation_id` and `user_id`. If no `conversation_id` is supplied, a new conversation is created automatically with the first 80 chars of the message as title. The response always returns `conversation_id`. Frontend stores it in `localStorage`.

### Routing multi-IA + fallback (FASE 6)
`buildProviderQueue(requested)` ritorna la coda ordinata dei provider disponibili. Il primario è determinato da `PREFERRED_PROVIDER` env (default `"openai"`) oppure dalla richiesta esplicita del frontend (`provider: "anthropic"`). Se il provider primario lancia eccezione (rate limit, errore rete, quota) il sistema ritenta automaticamente con il secondario. La risposta include `fallback_used: boolean`. Helper di chiamata isolati: `callOpenAI()` e `callAnthropic()`. Env var opzionale: `PREFERRED_PROVIDER=openai|anthropic`.

### certainty extraction
`extractCertainty(answer)` parses `LIVELLO DI CERTEZZA:` from the answer text and maps to one of: `Confermato | Probabile | Non verificabile`. Saved in `messages.certainty`. Requires server restart to take effect after code changes.

### Enciclopedia tecnica components/issues (FASE 5)
`components` e `issues` sono tabelle PostgreSQL pre-esistenti NON gestite da schema.sql. Vengono create (se assenti) e popolate da `backend/ingest_encyclopedia.js`, che legge `backend/data/encyclopedia.json` (15 componenti, ~42 guasti, 5 domini: protezione, riscaldamento, rete, domotica, idraulica/sicurezza). La chiave di deduplicazione è `(name, brand, model)` per components e `(component_id, title)` per issues. Il RAG `fetchEncyclopediaContext()` già in `server.js` interroga queste tabelle con FTS italiano e inietta il contesto nel system prompt come `CONTESTO TECNICO (DAL DB INTERNO IA WIRE PRO):`.

### RAG doc_chunks (FASE 4)
`doc_chunks` table in PostgreSQL: columns `id, source, chunk_text, created_at`. Populated manually via `node backend/ingest.js` (idempotent — checks exact duplicates before inserting). `fetchDocChunks(query)` uses Italian FTS (`plainto_tsquery`) first; falls back to ILIKE on individual keywords (>3 chars) if FTS returns nothing. Top 3 chunks are formatted under `CONTESTO TECNICO DA MANUALE:` and injected as a separate system message (OpenAI) or appended to the system string (Anthropic). Response `rag` field now includes `usedDocChunks: boolean`. GIN index `idx_doc_chunks_fts` on `to_tsvector('italian', chunk_text)` for fast FTS.

### Context window + auto-summary (FASE 3)
`HISTORY_MAX` (default 10, env override) controls how many messages are sent to the AI. When `conversation_id` is available, `/api/chat` loads the last 10 messages directly from DB (ignoring the frontend-supplied `history`). `SUMMARY_THRESHOLD` (default 14, env override): when a conversation reaches this many messages, `generateContextSummary()` runs fire-and-forget after each AI response, calls the AI to summarise the conversation in 5-8 technical bullet points, and stores it in `conversations.summary`. On the next chat turn the summary is prepended to the system prompt as `CONTESTO CONVERSAZIONE PRECEDENTE:`.

### Frontend
Pure ES5 vanilla JS (no `?.`, no `??`, no `replaceAll`) for maximum browser compatibility. Image compression via Canvas API: max 1800px, 0.85 JPEG quality. History capped at 10 messages sent to backend (fallback only — DB history takes priority server-side). `loadConversationOnStart()` fetches `/api/conversations/:id/messages` on page load and calls `setBusy(true)` to block input during restore.

## API Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | Server status, DB ping, provider config |
| POST | `/api/chat` | multipart or JSON, fields: `message`, `history`, `conversation_id`, `user_id`, `image` |
| GET | `/api/conversations` | `?user_id=&archived=0&limit=50` |
| POST | `/api/conversations` | `{title, user_id}` |
| GET | `/api/conversations/:id` | includes `messages[]` array |
| PATCH | `/api/conversations/:id` | `{title?, is_archived?}` |
| DELETE | `/api/conversations/:id` | cascades to messages |
| GET | `/api/conversations/:id/messages` | `?limit=100`, returns `{ok, count, items}` |
| GET | `/api/components` | `?search=&category=&type=&brand=&limit=20` |
| GET | `/api/components/:id/issues` | |
| GET | `/api/engine/test` | Testa il ROCCO diagnostic engine con caso hardcoded (no LLM) |

## Database Schema (current)

- `conversations`: id, title, user_id (TEXT), created_at, updated_at, is_archived
- `messages`: id, conversation_id (FK cascade), role (user/assistant/system), content, content_format, provider, model, certainty, meta_json (JSONB), created_at
- `message_attachments`: id, message_id (FK cascade), type, url, mime, size_bytes, width, height, sha256, created_at
- `components` / `issues`: encyclopedia tables — **never modify in schema.sql migrations**

## Deployment

- **Render.com**: Root directory `backend`, Build `npm install`, Start `npm start`
- **Environment variables on Render**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `DATABASE_URL`, `PORT`
- DB hosted on Render PostgreSQL (Frankfurt). SSL with `rejectUnauthorized: false`.
