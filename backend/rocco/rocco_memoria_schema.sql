-- ============================================================
-- ROCCO MEMORIA — Schema PostgreSQL
-- Strato 3: memoria permanente di ROCCO
-- ============================================================

-- Progetti
CREATE TABLE IF NOT EXISTS rocco_progetti (
  id          SERIAL PRIMARY KEY,
  cliente     VARCHAR(200),
  indirizzo   VARCHAR(300),
  tipo_locale VARCHAR(100),   -- civile, industriale, medico, atex, ecc.
  sistema     VARCHAR(10),    -- TT, TN-S, TN-C, IT
  tensione    INTEGER DEFAULT 230,
  note        TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Impianti per progetto
CREATE TABLE IF NOT EXISTS rocco_impianti (
  id                  SERIAL PRIMARY KEY,
  progetto_id         INTEGER REFERENCES rocco_progetti(id) ON DELETE CASCADE,
  nome                VARCHAR(200),
  potenza_kw          NUMERIC(10,2),
  n_circuiti          INTEGER,
  note_normative      TEXT,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Circuiti dimensionati
CREATE TABLE IF NOT EXISTS rocco_circuiti (
  id                  SERIAL PRIMARY KEY,
  impianto_id         INTEGER REFERENCES rocco_impianti(id) ON DELETE CASCADE,
  nome                VARCHAR(200),
  P_kW                NUMERIC(10,3),
  Ib_A                NUMERIC(10,2),
  sezione_mm2         NUMERIC(8,2),
  metodo_posa         VARCHAR(5),    -- A, B, E
  lunghezza_m         NUMERIC(8,1),
  dV_perc             NUMERIC(6,2),
  In_interruttore     NUMERIC(8,1),
  curva_interruttore  VARCHAR(5),    -- B, C, D, K
  diff_tipo           VARCHAR(5),    -- AC, A, F, B
  diff_Idn_mA         INTEGER,
  PE_mm2              NUMERIC(8,2),
  verifica_ok         BOOLEAN,
  note                TEXT,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Diagnosi guasti
CREATE TABLE IF NOT EXISTS rocco_diagnosi (
  id                  SERIAL PRIMARY KEY,
  progetto_id         INTEGER REFERENCES rocco_progetti(id),
  data_diagnosi       TIMESTAMP DEFAULT NOW(),
  descrizione         TEXT NOT NULL,
  sintomi             TEXT,
  misure_rilevate     JSONB,
  causa_trovata       TEXT,
  soluzione           TEXT,
  norma_riferimento   VARCHAR(100),
  risolto             BOOLEAN DEFAULT FALSE,
  tempo_minuti        INTEGER,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Knowledge base casi reali
CREATE TABLE IF NOT EXISTS rocco_knowledge_casi (
  id                  SERIAL PRIMARY KEY,
  problema            TEXT NOT NULL,
  causa               TEXT NOT NULL,
  soluzione           TEXT NOT NULL,
  norma_riferimento   VARCHAR(100),
  tipo_locale         VARCHAR(100),
  verificato          BOOLEAN DEFAULT FALSE,
  n_occorrenze        INTEGER DEFAULT 1,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Calcoli salvati (storico)
CREATE TABLE IF NOT EXISTS rocco_calcoli (
  id                  SERIAL PRIMARY KEY,
  progetto_id         INTEGER REFERENCES rocco_progetti(id),
  tipo_calcolo        VARCHAR(50),
  parametri_input     JSONB,
  risultato           JSONB,
  created_at          TIMESTAMP DEFAULT NOW()
);

-- Tabelle University (memoria didattica)
CREATE TABLE IF NOT EXISTS rocco_memoria (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  materia TEXT NOT NULL,
  tipo TEXT NOT NULL,
  contenuto JSONB NOT NULL,
  livello_studio INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rocco_esercizi (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  materia TEXT NOT NULL,
  problema TEXT NOT NULL,
  dati JSONB,
  formula_id TEXT,
  soluzione TEXT,
  spiegazione TEXT,
  risposta_data TEXT,
  corretto BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rocco_esami (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default',
  materia TEXT NOT NULL,
  punteggio INTEGER,
  max_punteggio INTEGER,
  superato BOOLEAN DEFAULT FALSE,
  domande JSONB,
  risposte JSONB,
  data_esame TIMESTAMP DEFAULT NOW()
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_impianti_progetto  ON rocco_impianti(progetto_id);
CREATE INDEX IF NOT EXISTS idx_circuiti_impianto  ON rocco_circuiti(impianto_id);
CREATE INDEX IF NOT EXISTS idx_diagnosi_progetto  ON rocco_diagnosi(progetto_id);
CREATE INDEX IF NOT EXISTS idx_calcoli_progetto   ON rocco_calcoli(progetto_id);
CREATE INDEX IF NOT EXISTS idx_casi_problema      ON rocco_knowledge_casi(problema);
CREATE INDEX IF NOT EXISTS idx_memoria_user       ON rocco_memoria(user_id, materia);

-- Seed: casi reali frequenti
INSERT INTO rocco_knowledge_casi (problema, causa, soluzione, norma_riferimento, tipo_locale, verificato, n_occorrenze)
VALUES
  ('Differenziale scatta appena armato',
   'Guasto a terra su conduttore o carico del circuito',
   'Scollegare tutti i carichi, riarmare. Ricollegare uno alla volta fino a individuare il guasto.',
   'CEI 64-8', 'civile', TRUE, 15),
  ('Interruttore scatta dopo pochi secondi sotto carico',
   'Sovraccarico — corrente Ib superiore a In interruttore',
   'Misurare corrente con pinza. Se Ib > In, sostituire interruttore con calibro superiore o ridurre i carichi.',
   'CEI 64-8 art.433', 'civile', TRUE, 12),
  ('Tensione bassa sulle prese (sotto 200V)',
   'Sezione cavo sottodimensionata — caduta di tensione eccessiva',
   'Misurare ΔV% con multimetro a carico. Se >4% sostituire cavo con sezione superiore.',
   'CEI 64-8 art.525', 'civile', TRUE, 10),
  ('Motore trifase non parte, protezione scatta',
   'Corrente avviamento DOL troppo alta — interruttore con curva C invece di D',
   'Sostituire interruttore con curva D. In alternativa installare soft-starter o inverter.',
   'CEI 64-8', 'industriale', TRUE, 8),
  ('Differenziale tipo AC scatta con lavatrice/lavastoviglie',
   'Correnti DC pulsanti generate dal motore a spazzole — Tipo AC non protegge',
   'Sostituire con differenziale Tipo A. Per lavatrice inverter usare Tipo F.',
   'CEI 64-8 art.531', 'civile', TRUE, 20),
  ('Quadro surriscaldato — interruttori caldi',
   'Corrente eccessiva, ventilazione insufficiente o fattore riduzione non applicato',
   'Verificare corrente reale con pinza. Applicare fattori riduzione CEI-UNEL per cavi ravvicinati.',
   'CEI-UNEL 35024', 'industriale', TRUE, 7),
  ('Impianto fotovoltaico — differenziale scatta frequentemente',
   'Inverter FV genera correnti di dispersione DC — differenziale AC o A non adatto',
   'Installare differenziale Tipo B sul circuito inverter FV.',
   'CEI 64-8 sez.712', 'civile', TRUE, 9)
ON CONFLICT DO NOTHING;
