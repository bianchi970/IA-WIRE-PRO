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
