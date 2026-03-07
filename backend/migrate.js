const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fs = require("fs");
const { pool } = require("./db");

// ============================================================
// Step 1 — schema.sql
//   CREATE TABLE IF NOT EXISTS + indexes (idempotente)
//   Gestisce: nuove tabelle (message_attachments) e tabelle
//   già inesistenti (conversations, messages).
// ============================================================
async function runSchema(client) {
  const sqlPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await client.query(sql);
  console.log("  ✅ schema.sql applicato");
}

// ============================================================
// Step 2 — column migrations
//   Ogni entry è idempotente: ADD COLUMN IF NOT EXISTS oppure
//   DO $$ block per modifiche condizionali (type change).
//   Non viene mai droppata image_url automaticamente per
//   evitare perdita di dati: vedi nota in fondo.
// ============================================================
const COLUMN_MIGRATIONS = [
  // --- conversations ---
  {
    desc: "conversations: add summary",
    sql: `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary TEXT`,
  },
  {
    desc: "conversations: add updated_at",
    sql: `ALTER TABLE conversations
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`,
  },
  {
    desc: "conversations: add is_archived",
    sql: `ALTER TABLE conversations
            ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE`,
  },
  {
    desc: "conversations: drop FK user_id → users (vecchio schema)",
    sql: `DO $$ BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.table_constraints
              WHERE table_name       = 'conversations'
                AND constraint_name  = 'conversations_user_id_fkey'
                AND constraint_type  = 'FOREIGN KEY'
            ) THEN
              ALTER TABLE conversations DROP CONSTRAINT conversations_user_id_fkey;
            END IF;
          END $$`,
  },
  {
    desc: "conversations: user_id BIGINT → TEXT",
    sql: `DO $$ BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name  = 'conversations'
                AND column_name = 'user_id'
                AND data_type  <> 'text'
            ) THEN
              ALTER TABLE conversations
                ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
            END IF;
          END $$`,
  },

  // --- messages ---
  {
    desc: "messages: add content_format",
    sql: `ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT 'text'`,
  },
  {
    desc: "messages: add provider",
    sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider TEXT`,
  },
  {
    desc: "messages: add model",
    sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS model TEXT`,
  },
  {
    desc: "messages: add certainty",
    sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS certainty TEXT`,
  },
  {
    desc: "messages: add meta_json",
    sql: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS meta_json JSONB`,
  },
  {
    desc: "messages: content nullable (era NOT NULL)",
    sql: `DO $$ BEGIN
            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name  = 'messages'
                AND column_name = 'content'
                AND is_nullable = 'NO'
            ) THEN
              ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;
            END IF;
          END $$`,
  },

  // NOTE: image_url NON viene droppata automaticamente per evitare
  // perdita di dati. Dopo aver migrato i dati su message_attachments
  // eseguire manualmente:
  //   ALTER TABLE messages DROP COLUMN IF EXISTS image_url;

  // ─────────────────────────────────────────────────────────────
  // FASE 4 — MEMORIA PERMANENTE ROCCO (architettura cervello autonomo)
  // ─────────────────────────────────────────────────────────────
  {
    desc: "rocco_progetti: crea tabella progetti impianti",
    sql: `CREATE TABLE IF NOT EXISTS rocco_progetti (
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
    )`
  },
  {
    desc: "rocco_impianti: crea tabella impianti (dettaglio tecnico)",
    sql: `CREATE TABLE IF NOT EXISTS rocco_impianti (
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
    )`
  },
  {
    desc: "rocco_circuiti: crea tabella circuiti (per impianto)",
    sql: `CREATE TABLE IF NOT EXISTS rocco_circuiti (
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
    )`
  },
  {
    desc: "rocco_diagnosi: crea tabella diagnosi (memoria guasti)",
    sql: `CREATE TABLE IF NOT EXISTS rocco_diagnosi (
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
    )`
  },
  {
    desc: "rocco_knowledge_casi: crea tabella casi verificati (apprendimento)",
    sql: `CREATE TABLE IF NOT EXISTS rocco_knowledge_casi (
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
    )`
  },
  {
    desc: "rocco_diagnosi: index su user_id e data",
    sql: `CREATE INDEX IF NOT EXISTS idx_rocco_diagnosi_user
          ON rocco_diagnosi(user_id, data DESC)`
  },
  {
    desc: "rocco_knowledge_casi: GIN index FTS italiano",
    sql: `CREATE INDEX IF NOT EXISTS idx_rocco_kc_fts
          ON rocco_knowledge_casi
          USING GIN(to_tsvector('italian', problema || ' ' || soluzione))`
  }
];

// ============================================================
// Runner
// ============================================================
(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    console.log("\n🔄 Migrazione IA Wire Pro avviata...\n");

    await runSchema(client);

    console.log("  🔄 Column migrations...");
    for (const m of COLUMN_MIGRATIONS) {
      await client.query(m.sql);
      console.log(`  ✅ ${m.desc}`);
    }

    await client.query("COMMIT");
    console.log("\n✅ Migrazione completata con successo.\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("\n❌ Migrazione fallita — ROLLBACK eseguito.");
    console.error("   Dettaglio:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
