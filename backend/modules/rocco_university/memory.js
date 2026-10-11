/**
 * ROCCO UNIVERSITY — Memoria Didattica
 * Traccia studio, errori, progressi, esami superati.
 *
 * Due correzioni rispetto alla prima versione:
 *
 * 1. **Un solo pool.** Qui veniva aperto un `new Pool()` tutto suo, il terzo
 *    del progetto, con una configurazione SSL diversa da `db.js`. Ora si usa
 *    il pool condiviso: una sola connessione, una sola configurazione, un
 *    solo posto dove cambiarla.
 *
 * 2. **Il ripiego è agganciato al fallimento della query**, non a `if (!pool)`.
 *    `pool` è un oggetto anche quando il DB è morto: la guardia non scattava,
 *    la query lanciava, e poiché tutte le scritture sono fire-and-forget
 *    (`.catch(() => {})`) ogni caso reale e ogni errore ricorrente venivano
 *    persi **in silenzio**. Era l'unica conoscenza di ROCCO che per esistere
 *    richiedeva un database. Ora, quando la query fallisce, si scrive e si
 *    legge da `store/universityStore.js` (su disco), e l'apprendimento
 *    sopravvive sia al DB spento sia ai restart.
 *
 * Postgres resta la destinazione preferita quando risponde. `backendInUso()`
 * dice chi tiene la memoria in questo momento, ed è esposto da /health.
 */

const localStore = require('../../store/universityStore');

// Pool condiviso (db.js lancia se DATABASE_URL non è configurato: non deve
// far cadere il modulo — senza DB si lavora su disco).
let pool = null;
try {
  ({ pool } = require('../../db'));
} catch (_e) {
  pool = null;
}

// Dopo un fallimento non si ritenta a ogni richiesta: si aspetta, così un DB
// morto non costa un timeout per messaggio. Poi si riprova — un'istanza
// sospesa può tornare.
const RETRY_AFTER_MS = 60 * 1000;
let dbDownSince = 0;
let dbEverOk = false;

function dbUsable() {
  if (!pool) return false;
  if (!dbDownSince) return true;
  return Date.now() - dbDownSince > RETRY_AFTER_MS;
}

/**
 * Esegue la query. Ritorna `{ ok: true, rows }` oppure `{ ok: false, error }`
 * senza lanciare: la decisione su cosa fare del fallimento spetta al
 * chiamante, che ha un ripiego su disco.
 */
async function tryQuery(sql, params) {
  if (!dbUsable()) return { ok: false, error: new Error('db_unavailable') };
  try {
    const result = await pool.query(sql, params);
    dbDownSince = 0;
    dbEverOk = true;
    return { ok: true, rows: result.rows };
  } catch (err) {
    dbDownSince = Date.now();
    return { ok: false, error: err };
  }
}

function backendInUso() {
  return {
    postgres: Boolean(pool) && !dbDownSince,
    postgres_mai_risposto: Boolean(pool) && !dbEverOk,
    locale: localStore.counts(),
    store_path: localStore.STORE_PATH
  };
}

// ─── INIZIALIZZAZIONE TABELLE ───────────────────────────────────────────────

const DDL = [
  `CREATE TABLE IF NOT EXISTS rocco_memoria (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      materia TEXT NOT NULL,
      tipo TEXT NOT NULL,
      -- tipo: 'formula_appresa' | 'esercizio_svolto' | 'errore_frequente' | 'caso_reale' | 'esame_superato' | 'studio_sessione'
      contenuto JSONB NOT NULL,
      livello_studio INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
   );`,
  `CREATE TABLE IF NOT EXISTS rocco_esercizi (
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
   );`,
  `CREATE TABLE IF NOT EXISTS rocco_esami (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      materia TEXT NOT NULL,
      punteggio INTEGER,
      max_punteggio INTEGER,
      superato BOOLEAN DEFAULT FALSE,
      domande JSONB,
      risposte JSONB,
      data_esame TIMESTAMP DEFAULT NOW()
   );`
];

/**
 * Non lancia più: il DB spento non è un errore di avvio, è un modo di
 * funzionare. Ritorna quale memoria è attiva.
 */
async function initMemoriaDB() {
  for (const sql of DDL) {
    const res = await tryQuery(sql, []);
    if (!res.ok) {
      const counts = localStore.counts();
      console.log(
        '[ROCCO UNIVERSITY] Postgres non risponde (' + res.error.message +
        ') → memoria didattica su disco: ' + counts.memoria + ' record, ' +
        counts.esami + ' esami'
      );
      return { backend: 'local', reason: res.error.message };
    }
  }
  console.log('[ROCCO UNIVERSITY] Tabelle memoria inizializzate (postgres)');
  return { backend: 'postgres' };
}

// ─── LETTURA MEMORIA ─────────────────────────────────────────────────────────

function emptyMemoria() {
  return {
    materie_studiate: {},
    formule_apprese: [],
    esercizi_svolti: [],
    errori_frequenti: [],
    casi_reali: [],
    esami_superati: [],
    competenze_certificate: []
  };
}

/** Compone la memoria dalle righe, identiche in forma su Postgres e su disco. */
function composeMemoria(rows) {
  const memoria = emptyMemoria();
  for (const row of rows) {
    const { materia, tipo, contenuto, livello_studio } = row;
    const dati = contenuto && typeof contenuto === 'object' ? contenuto : {};
    switch (tipo) {
      case 'studio_sessione':
        memoria.materie_studiate[materia] = { ...dati, livello_studio };
        break;
      case 'formula_appresa':
        memoria.formule_apprese.push({ materia, ...dati });
        break;
      case 'esercizio_svolto':
        memoria.esercizi_svolti.push({ materia, ...dati });
        break;
      case 'errore_frequente':
        memoria.errori_frequenti.push({ materia, ...dati });
        break;
      case 'caso_reale':
        memoria.casi_reali.push({ materia, ...dati });
        break;
      case 'esame_superato':
        memoria.esami_superati.push({ materia, ...dati });
        if (dati.competenza) memoria.competenze_certificate.push(dati.competenza);
        break;
    }
  }
  return memoria;
}

async function getMemoria(userId = 'default') {
  const res = await tryQuery(
    `SELECT materia, tipo, contenuto, livello_studio FROM rocco_memoria WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  const rows = res.ok ? res.rows : localStore.listRecords(userId);
  const memoria = composeMemoria(rows);
  memoria.fonte = res.ok ? 'postgres' : 'locale';
  return memoria;
}

// ─── SCRITTURA MEMORIA ───────────────────────────────────────────────────────

async function registraStudio(userId = 'default', materia, argomento, livello_studio) {
  const contenuto = { argomento, timestamp: new Date().toISOString() };
  const res = await tryQuery(`
    INSERT INTO rocco_memoria (user_id, materia, tipo, contenuto, livello_studio)
    VALUES ($1, $2, 'studio_sessione', $3, $4)
    ON CONFLICT DO NOTHING
  `, [userId, materia, JSON.stringify(contenuto), livello_studio]);

  if (!res.ok) {
    localStore.addRecord({
      user_id: userId, materia, tipo: 'studio_sessione', contenuto,
      livello_studio: livello_studio
    });
  }
  return { fonte: res.ok ? 'postgres' : 'locale' };
}

async function registraFormula(userId = 'default', materia, formulaId) {
  const contenuto = { formula_id: formulaId, timestamp: new Date().toISOString() };
  const res = await tryQuery(`
    INSERT INTO rocco_memoria (user_id, materia, tipo, contenuto)
    VALUES ($1, $2, 'formula_appresa', $3)
  `, [userId, materia, JSON.stringify(contenuto)]);

  if (!res.ok) {
    localStore.addRecord({ user_id: userId, materia, tipo: 'formula_appresa', contenuto });
  }
  return { fonte: res.ok ? 'postgres' : 'locale' };
}

async function registraErrore(userId = 'default', materia, errore, correzione) {
  // Cerca se l'errore esiste già → incrementa contatore
  const found = await tryQuery(
    `SELECT id, contenuto FROM rocco_memoria WHERE user_id=$1 AND materia=$2 AND tipo='errore_frequente' AND contenuto->>'errore'=$3`,
    [userId, materia, errore]
  );

  if (found.ok) {
    if (found.rows.length > 0) {
      const contenuto = found.rows[0].contenuto;
      contenuto.contatore = (contenuto.contatore || 1) + 1;
      const upd = await tryQuery(
        `UPDATE rocco_memoria SET contenuto=$1, updated_at=NOW() WHERE id=$2`,
        [JSON.stringify(contenuto), found.rows[0].id]
      );
      if (upd.ok) return { fonte: 'postgres' };
    } else {
      const ins = await tryQuery(`
        INSERT INTO rocco_memoria (user_id, materia, tipo, contenuto)
        VALUES ($1, $2, 'errore_frequente', $3)
      `, [userId, materia, JSON.stringify({ errore, correzione, contatore: 1 })]);
      if (ins.ok) return { fonte: 'postgres' };
    }
  }

  // Su disco il conteggio delle ripetizioni lo fa `dedupeKey`.
  localStore.addRecord(
    { user_id: userId, materia, tipo: 'errore_frequente', contenuto: { errore, correzione, contatore: 1 } },
    'errore'
  );
  return { fonte: 'locale' };
}

async function registraCasoReale(userId = 'default', materia, caso) {
  const contenuto = { ...(caso && typeof caso === 'object' ? caso : {}), timestamp: new Date().toISOString() };
  const res = await tryQuery(`
    INSERT INTO rocco_memoria (user_id, materia, tipo, contenuto)
    VALUES ($1, $2, 'caso_reale', $3)
  `, [userId, materia, JSON.stringify(contenuto)]);

  if (!res.ok) {
    localStore.addRecord({ user_id: userId, materia, tipo: 'caso_reale', contenuto });
  }
  return { fonte: res.ok ? 'postgres' : 'locale' };
}

async function registraEsameSuperato(userId = 'default', materia, punteggio, max_punteggio) {
  const superato = punteggio >= max_punteggio * 0.6; // 60% per passare
  const esito = {
    superato, punteggio, max_punteggio,
    soglia_minima: Math.ceil(max_punteggio * 0.6)
  };

  const res = await tryQuery(`
    INSERT INTO rocco_esami (user_id, materia, punteggio, max_punteggio, superato)
    VALUES ($1, $2, $3, $4, $5)
  `, [userId, materia, punteggio, max_punteggio, superato]);

  if (res.ok) {
    esito.fonte = 'postgres';
    if (superato) {
      await tryQuery(`
        INSERT INTO rocco_memoria (user_id, materia, tipo, contenuto)
        VALUES ($1, $2, 'esame_superato', $3)
      `, [userId, materia, JSON.stringify({
        punteggio, max_punteggio,
        competenza: `${materia}_certificata`,
        data: new Date().toISOString()
      })]);
    }
    return esito;
  }

  esito.fonte = 'locale';
  localStore.addEsame({ user_id: userId, materia, punteggio, max_punteggio, superato });
  if (superato) {
    localStore.addRecord({
      user_id: userId, materia, tipo: 'esame_superato',
      contenuto: {
        punteggio, max_punteggio,
        competenza: `${materia}_certificata`,
        data: new Date().toISOString()
      }
    });
  }
  return esito;
}

// ─── STATISTICHE ────────────────────────────────────────────────────────────

async function getStatistiche(userId = 'default') {
  const erroriRes = await tryQuery(
    `SELECT materia, contenuto->>'errore' as errore, (contenuto->>'contatore')::int as contatore
     FROM rocco_memoria WHERE user_id=$1 AND tipo='errore_frequente'
     ORDER BY contatore DESC LIMIT 10`,
    [userId]
  );
  const esamiRes = await tryQuery(
    `SELECT materia, punteggio, max_punteggio, superato, data_esame
     FROM rocco_esami WHERE user_id=$1 ORDER BY data_esame DESC`,
    [userId]
  );

  return {
    errori_frequenti: erroriRes.ok ? erroriRes.rows : localStore.listErrori(userId, 10),
    storico_esami: esamiRes.ok ? esamiRes.rows : localStore.listEsami(userId),
    fonte: erroriRes.ok && esamiRes.ok ? 'postgres' : 'locale'
  };
}

module.exports = {
  initMemoriaDB,
  getMemoria,
  registraStudio,
  registraFormula,
  registraErrore,
  registraCasoReale,
  registraEsameSuperato,
  getStatistiche,
  backendInUso
};
