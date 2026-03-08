-- ROCCO — Banca Dati Dispositivi Elettrici
-- Schema con 3 tabelle: dispositivi, guasti, misure_attese

-- ─── DISPOSITIVI ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rocco_dispositivi (
  id                      SERIAL PRIMARY KEY,
  codice                  TEXT UNIQUE NOT NULL,
  famiglia                TEXT NOT NULL,       -- MCB | RCCB | RCBO | MCCB | MOTORE | CONTATTORE | TRASFORMATORE
  sottofamiglia           TEXT,                -- es. curva_C, tipo_AC, asincrono_trifase
  nome                    TEXT NOT NULL,
  marca                   TEXT,
  tensione_nominale_V     INTEGER,
  corrente_nominale_A     NUMERIC(8,2),
  potere_interruzione_kA  NUMERIC(6,2),
  corrente_differenziale_mA INTEGER,
  tipo_differenziale      TEXT,                -- AC | A | F | B
  applicazione            TEXT,
  note_normative          TEXT,
  created_at              TIMESTAMP DEFAULT NOW()
);

-- ─── GUASTI ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rocco_guasti (
  id                  SERIAL PRIMARY KEY,
  dispositivo_codice  TEXT REFERENCES rocco_dispositivi(codice) ON DELETE CASCADE,
  famiglia            TEXT NOT NULL,           -- replica famiglia per ricerca rapida
  sintomo             TEXT NOT NULL,
  causa_probabile     TEXT NOT NULL,
  probabilita         TEXT NOT NULL CHECK (probabilita IN ('Alta','Media','Bassa')),
  verifica            TEXT NOT NULL,           -- procedura di verifica sul campo
  strumento           TEXT NOT NULL,           -- strumento necessario
  valore_atteso       TEXT NOT NULL,           -- cosa ci si aspetta
  rischio             TEXT,
  riferimento_norma   TEXT,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- ─── MISURE ATTESE ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rocco_misure_attese (
  id               SERIAL PRIMARY KEY,
  famiglia         TEXT NOT NULL,
  parametro        TEXT NOT NULL,
  valore_minimo    NUMERIC(12,4),
  valore_massimo   NUMERIC(12,4),
  unita            TEXT NOT NULL,
  condizione       TEXT,
  norma_riferimento TEXT,
  created_at       TIMESTAMP DEFAULT NOW()
);

-- Indici per ricerca rapida
CREATE INDEX IF NOT EXISTS idx_rocco_dispositivi_famiglia   ON rocco_dispositivi(famiglia);
CREATE INDEX IF NOT EXISTS idx_rocco_guasti_famiglia        ON rocco_guasti(famiglia);
CREATE INDEX IF NOT EXISTS idx_rocco_guasti_sintomo_fts     ON rocco_guasti USING gin(to_tsvector('italian', sintomo || ' ' || causa_probabile));
CREATE INDEX IF NOT EXISTS idx_rocco_misure_famiglia        ON rocco_misure_attese(famiglia);
