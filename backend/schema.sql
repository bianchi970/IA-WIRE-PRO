-- IA Wire Pro - Schema PostgreSQL (production)
-- Tables: conversations, messages, message_attachments
-- Tables NOT touched: components, issues

-- ============================================================
-- conversations
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id          BIGSERIAL    PRIMARY KEY,
  title       TEXT,
  user_id     TEXT,
  summary     TEXT,
  created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
  is_archived BOOLEAN      NOT NULL DEFAULT FALSE
);

-- ============================================================
-- messages
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT    NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT      NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT,
  content_format  TEXT      NOT NULL DEFAULT 'text',
  provider        TEXT,
  model           TEXT,
  certainty       TEXT,
  meta_json       JSONB,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- message_attachments
-- ============================================================
CREATE TABLE IF NOT EXISTS message_attachments (
  id          BIGSERIAL PRIMARY KEY,
  message_id  BIGINT    NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  type        TEXT      NOT NULL,
  url         TEXT      NOT NULL,
  mime        TEXT,
  size_bytes  INTEGER,
  width       INTEGER,
  height      INTEGER,
  sha256      TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id
  ON message_attachments (message_id);

-- ============================================================
-- doc_chunks  (RAG base locale — FASE 4)
-- Testi tecnici spezzati da manuali/PDF per retrieval semplice
-- Popolare con: node backend/ingest.js
-- ============================================================
CREATE TABLE IF NOT EXISTS doc_chunks (
  id         BIGSERIAL PRIMARY KEY,
  source     TEXT      NOT NULL,
  chunk_text TEXT      NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_chunks_fts
  ON doc_chunks USING gin(to_tsvector('italian', chunk_text));

-- ============================================================
-- ROCCO V2 — Tabelle diagnostica e apprendimento
-- Nota: create anche da migrate.js (idempotenti con IF NOT EXISTS)
-- ============================================================

CREATE TABLE IF NOT EXISTS rocco_progetti (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT,
  cliente       TEXT,
  indirizzo     TEXT,
  tipo_locale   TEXT,
  potenza_kw    NUMERIC(10,2),
  superficie_m2 NUMERIC(10,2),
  sistema       TEXT DEFAULT 'TT',
  tensione      TEXT DEFAULT '230V',
  note          TEXT,
  stato         TEXT DEFAULT 'aperto',
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rocco_impianti (
  id                    SERIAL PRIMARY KEY,
  progetto_id           INTEGER REFERENCES rocco_progetti(id) ON DELETE CASCADE,
  tipo_sistema          TEXT DEFAULT 'TT',
  tensione              TEXT DEFAULT '230V',
  potenza_kw            NUMERIC(10,2),
  n_circuiti            INTEGER DEFAULT 0,
  icc_barra_ka          NUMERIC(8,3),
  re_terra_ohm          NUMERIC(8,2),
  note_tecniche         TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rocco_circuiti (
  id                  SERIAL PRIMARY KEY,
  impianto_id         INTEGER REFERENCES rocco_impianti(id) ON DELETE CASCADE,
  nome                TEXT,
  tipo_locale         TEXT,
  carico_desc         TEXT,
  p_kw                NUMERIC(8,3),
  ib_a                NUMERIC(8,2),
  sezione_mm2         NUMERIC(6,2),
  lunghezza_m         NUMERIC(8,1),
  metodo_posa         TEXT DEFAULT 'B1',
  interruttore_tipo   TEXT,
  interruttore_in_a   NUMERIC(8,2),
  interruttore_curva  TEXT,
  differenziale_tipo  TEXT,
  differenziale_idn   NUMERIC(8,3),
  dv_perc             NUMERIC(6,3),
  pe_mm2              NUMERIC(6,2),
  verifica_ok         BOOLEAN DEFAULT FALSE,
  note                TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rocco_diagnosi (
  id                  SERIAL PRIMARY KEY,
  user_id             TEXT,
  conversation_id     INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  data                TIMESTAMP NOT NULL DEFAULT NOW(),
  descrizione_problema TEXT NOT NULL,
  componenti_json     JSONB,
  causa_trovata       TEXT,
  soluzione_applicata TEXT,
  risolto             BOOLEAN DEFAULT FALSE,
  certezza            TEXT,
  tempo_minuti        INTEGER,
  dominio             TEXT,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rocco_knowledge_casi (
  id               SERIAL PRIMARY KEY,
  problema         TEXT NOT NULL,
  soluzione        TEXT NOT NULL,
  norma_riferimento TEXT,
  componenti_json  JSONB,
  dominio          TEXT,
  verificato       BOOLEAN DEFAULT FALSE,
  n_utilizzi       INTEGER DEFAULT 0,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rocco_diagnosi_user
  ON rocco_diagnosi(user_id, data DESC);

CREATE INDEX IF NOT EXISTS idx_rocco_kc_fts
  ON rocco_knowledge_casi
  USING GIN(to_tsvector('italian', problema || ' ' || soluzione));
