-- ============================================================
-- ROCCO MEMORIA — Schema PostgreSQL (FASE v7)
-- Strato 3: memoria permanente di ROCCO
-- Compatibile con gli endpoint in server.js
-- ============================================================

-- Progetti cliente
CREATE TABLE IF NOT EXISTS rocco_progetti (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT,
  cliente       VARCHAR(200),
  indirizzo     VARCHAR(300),
  tipo_locale   VARCHAR(100),   -- civile, industriale, medico, atex, ecc.
  potenza_kw    NUMERIC(10,2),
  superficie_m2 NUMERIC(10,2),
  sistema       VARCHAR(10) DEFAULT 'TT',    -- TT, TN-S, TN-C, IT
  tensione      VARCHAR(20) DEFAULT '230V',
  stato         VARCHAR(50) DEFAULT 'attivo',
  note          TEXT,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Diagnosi guasti (storico per utente/progetto)
CREATE TABLE IF NOT EXISTS rocco_diagnosi (
  id                    SERIAL PRIMARY KEY,
  user_id               TEXT,
  descrizione_problema  TEXT NOT NULL,
  causa_trovata         TEXT,
  soluzione_applicata   TEXT,
  risolto               BOOLEAN DEFAULT FALSE,
  certezza              VARCHAR(20) DEFAULT 'MEDIA',  -- ALTA, MEDIA, BASSA
  dominio               VARCHAR(50) DEFAULT 'elettrico',
  tempo_minuti          INTEGER,
  created_at            TIMESTAMP DEFAULT NOW()
);

-- Knowledge base casi reali (impara dai guasti risolti con alta certezza)
CREATE TABLE IF NOT EXISTS rocco_knowledge_casi (
  id           SERIAL PRIMARY KEY,
  problema     TEXT NOT NULL,
  soluzione    TEXT NOT NULL,
  dominio      VARCHAR(50) DEFAULT 'elettrico',
  verificato   BOOLEAN DEFAULT FALSE,
  n_occorrenze INTEGER DEFAULT 1,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- Calcoli salvati (storico CEI)
CREATE TABLE IF NOT EXISTS rocco_calcoli (
  id              SERIAL PRIMARY KEY,
  user_id         TEXT,
  tipo_calcolo    VARCHAR(50),   -- ib, sezione, dv, icc, pe, motore
  parametri_input JSONB,
  risultato       JSONB,
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_rocco_progetti_user     ON rocco_progetti(user_id);
CREATE INDEX IF NOT EXISTS idx_rocco_diagnosi_user     ON rocco_diagnosi(user_id);
CREATE INDEX IF NOT EXISTS idx_rocco_diagnosi_risolto  ON rocco_diagnosi(risolto);
CREATE INDEX IF NOT EXISTS idx_rocco_calcoli_user      ON rocco_calcoli(user_id);
CREATE INDEX IF NOT EXISTS idx_rocco_casi_dominio      ON rocco_knowledge_casi(dominio);

-- Seed: casi reali frequenti (idempotente con ON CONFLICT DO NOTHING)
INSERT INTO rocco_knowledge_casi (problema, soluzione, dominio, verificato, n_occorrenze)
VALUES
  ('Differenziale scatta appena armato',
   'Scollegare tutti i carichi, riarmare. Ricollegare uno alla volta fino a individuare il guasto.',
   'elettrico', TRUE, 15),
  ('Interruttore scatta dopo pochi secondi sotto carico',
   'Misurare corrente con pinza. Se Ib > In, sostituire interruttore con calibro superiore o ridurre i carichi.',
   'elettrico', TRUE, 12),
  ('Tensione bassa sulle prese (sotto 200V)',
   'Misurare ΔV% con multimetro a carico. Se >4% sostituire cavo con sezione superiore.',
   'elettrico', TRUE, 10),
  ('Motore trifase non parte, protezione scatta',
   'Sostituire interruttore con curva D. In alternativa installare soft-starter o inverter.',
   'elettrico', TRUE, 8),
  ('Differenziale tipo AC scatta con lavatrice/lavastoviglie',
   'Sostituire con differenziale Tipo A. Per lavatrice inverter usare Tipo F.',
   'elettrico', TRUE, 20),
  ('Quadro surriscaldato — interruttori caldi',
   'Verificare corrente reale con pinza. Applicare fattori riduzione CEI-UNEL per cavi ravvicinati.',
   'elettrico', TRUE, 7),
  ('Impianto fotovoltaico — differenziale scatta frequentemente',
   'Installare differenziale Tipo B sul circuito inverter FV.',
   'domotica', TRUE, 9)
ON CONFLICT DO NOTHING;
