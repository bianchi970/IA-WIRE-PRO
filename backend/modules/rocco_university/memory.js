/**
 * ROCCO UNIVERSITY — Memoria Didattica
 * Traccia studio, errori, progressi, esami superati
 * Usa la connessione DB esistente di IA Wire Pro (pg)
 */

const { Pool } = require('pg');

// Usa la stessa connessione del progetto principale (SSL richiesto su Render)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ─── INIZIALIZZAZIONE TABELLE ───────────────────────────────────────────────

async function initMemoriaDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rocco_memoria (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      materia TEXT NOT NULL,
      tipo TEXT NOT NULL,
      -- tipo: 'formula_appresa' | 'esercizio_svolto' | 'errore_frequente' | 'caso_reale' | 'esame_superato' | 'studio_sessione'
      contenuto JSONB NOT NULL,
      livello_studio INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  console.log('[ROCCO UNIVERSITY] Tabelle memoria inizializzate');
}

// ─── LETTURA MEMORIA ─────────────────────────────────────────────────────────

async function getMemoria(userId = 'default') {
  const { rows } = await pool.query(
    `SELECT materia, tipo, contenuto, livello_studio FROM rocco_memoria WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );

  const memoria = {
    materie_studiate: {},
    formule_apprese: [],
    esercizi_svolti: [],
    errori_frequenti: [],
    casi_reali: [],
    esami_superati: [],
    competenze_certificate: []
  };

  for (const row of rows) {
    const { materia, tipo, contenuto, livello_studio } = row;
    switch (tipo) {
      case 'studio_sessione':
        memoria.materie_studiate[materia] = { ...contenuto, livello_studio };
        break;
      case 'formula_appresa':
        memoria.formule_apprese.push({ materia, ...contenuto });
        break;
      case 'esercizio_svolto':
        memoria.esercizi_svolti.push({ materia, ...contenuto });
        break;
      case 'errore_frequente':
        memoria.errori_frequenti.push({ materia, ...contenuto });
        break;
      case 'caso_reale':
        memoria.casi_reali.push({ materia, ...contenuto });
        break;
      case 'esame_superato':
        memoria.esami_superati.push({ materia, ...contenuto });
        if (contenuto.competenza) memoria.competenze_certificate.push(contenuto.competenza);
        break;
    }
  }
  return memoria;
}

// ─── SCRITTURA MEMORIA ───────────────────────────────────────────────────────

async function registraStudio(userId = 'default', materia, argomento, livello_studio) {
  await pool.query(`
    INSERT INTO rocco_memoria (user_id, materia, tipo, contenuto, livello_studio)
    VALUES ($1, $2, 'studio_sessione', $3, $4)
    ON CONFLICT DO NOTHING
  `, [userId, materia, JSON.stringify({ argomento, timestamp: new Date() }), livello_studio]);
}

async function registraFormula(userId = 'default', materia, formulaId) {
  await pool.query(`
    INSERT INTO rocco_memoria (user_id, materia, tipo, contenuto)
    VALUES ($1, $2, 'formula_appresa', $3)
  `, [userId, materia, JSON.stringify({ formula_id: formulaId, timestamp: new Date() })]);
}

async function registraErrore(userId = 'default', materia, errore, correzione) {
  // Cerca se l'errore esiste già → incrementa contatore
  const { rows } = await pool.query(
    `SELECT id, contenuto FROM rocco_memoria WHERE user_id=$1 AND materia=$2 AND tipo='errore_frequente' AND contenuto->>'errore'=$3`,
    [userId, materia, errore]
  );
  if (rows.length > 0) {
    const contenuto = rows[0].contenuto;
    contenuto.contatore = (contenuto.contatore || 1) + 1;
    await pool.query(
      `UPDATE rocco_memoria SET contenuto=$1, updated_at=NOW() WHERE id=$2`,
      [JSON.stringify(contenuto), rows[0].id]
    );
  } else {
    await pool.query(`
      INSERT INTO rocco_memoria (user_id, materia, tipo, contenuto)
      VALUES ($1, $2, 'errore_frequente', $3)
    `, [userId, materia, JSON.stringify({ errore, correzione, contatore: 1 })]);
  }
}

async function registraCasoReale(userId = 'default', materia, caso) {
  await pool.query(`
    INSERT INTO rocco_memoria (user_id, materia, tipo, contenuto)
    VALUES ($1, $2, 'caso_reale', $3)
  `, [userId, materia, JSON.stringify({ ...caso, timestamp: new Date() })]);
}

async function registraEsameSuperato(userId = 'default', materia, punteggio, max_punteggio) {
  const superato = punteggio >= max_punteggio * 0.6; // 60% per passare
  await pool.query(`
    INSERT INTO rocco_esami (user_id, materia, punteggio, max_punteggio, superato)
    VALUES ($1, $2, $3, $4, $5)
  `, [userId, materia, punteggio, max_punteggio, superato]);

  if (superato) {
    await pool.query(`
      INSERT INTO rocco_memoria (user_id, materia, tipo, contenuto)
      VALUES ($1, $2, 'esame_superato', $3)
    `, [userId, materia, JSON.stringify({
      punteggio, max_punteggio,
      competenza: `${materia}_certificata`,
      data: new Date()
    })]);
  }
  return { superato, punteggio, max_punteggio, soglia_minima: Math.ceil(max_punteggio * 0.6) };
}

// ─── STATISTICHE ────────────────────────────────────────────────────────────

async function getStatistiche(userId = 'default') {
  const { rows: errori } = await pool.query(
    `SELECT materia, contenuto->>'errore' as errore, (contenuto->>'contatore')::int as contatore
     FROM rocco_memoria WHERE user_id=$1 AND tipo='errore_frequente'
     ORDER BY contatore DESC LIMIT 10`,
    [userId]
  );
  const { rows: esami } = await pool.query(
    `SELECT materia, punteggio, max_punteggio, superato, data_esame
     FROM rocco_esami WHERE user_id=$1 ORDER BY data_esame DESC`,
    [userId]
  );
  return { errori_frequenti: errori, storico_esami: esami };
}

module.exports = {
  initMemoriaDB,
  getMemoria,
  registraStudio,
  registraFormula,
  registraErrore,
  registraCasoReale,
  registraEsameSuperato,
  getStatistiche
};
