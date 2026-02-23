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

# Install backend dependencies
cd backend && npm install
```

## Architecture

```
ia-wire-pro/
├── backend/
│   ├── server.js        ← Express API + AI routing + DB persistence
│   ├── db.js            ← pg.Pool singleton (requires DATABASE_URL)
│   ├── migrate.js       ← Schema migration (transactional, idempotent)
│   ├── schema.sql       ← Tables: conversations, messages, message_attachments
│   │                       (components and issues are NOT touched here)
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

### certainty extraction
`extractCertainty(answer)` parses `LIVELLO DI CERTEZZA:` from the answer text and maps to one of: `Confermato | Probabile | Non verificabile`. Saved in `messages.certainty`. Requires server restart to take effect after code changes.

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

## Database Schema (current)

- `conversations`: id, title, user_id (TEXT), created_at, updated_at, is_archived
- `messages`: id, conversation_id (FK cascade), role (user/assistant/system), content, content_format, provider, model, certainty, meta_json (JSONB), created_at
- `message_attachments`: id, message_id (FK cascade), type, url, mime, size_bytes, width, height, sha256, created_at
- `components` / `issues`: encyclopedia tables — **never modify in schema.sql migrations**

## Deployment

- **Render.com**: Root directory `backend`, Build `npm install`, Start `npm start`
- **Environment variables on Render**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `DATABASE_URL`, `PORT`
- DB hosted on Render PostgreSQL (Frankfurt). SSL with `rejectUnauthorized: false`.
