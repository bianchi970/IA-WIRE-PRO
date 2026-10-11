/**
 * ROCCO MEMORIA — contesto di progetto da PostgreSQL (v8)
 *
 * Cosa resta qui e perché quasi tutto è stato ritirato.
 *
 * **Il terzo pool.** Questo file apriva un `new Pool()` suo —
 * `new Pool({ connectionString: process.env.DATABASE_URL })`, **senza
 * `ssl`** — mentre `db.js` lo apre con `ssl: { rejectUnauthorized: false }`,
 * che su Render è obbligatorio. Quindi su Render questo modulo fallisce
 * anche quando il database è vivo e tutto il resto funziona. Era l'ultimo
 * errore all'avvio: `[ROCCO MEMORIA] init_schema: read ECONNRESET`. Ora il
 * pool è quello condiviso: una configurazione sola, un posto solo dove
 * cambiarla.
 *
 * **Sei funzioni su nove non le chiamava nessuno.** Verificato col grafo
 * delle dipendenze: `salva_progetto`, `get_progetti`, `salva_circuito`,
 * `salva_diagnosi`, `aggiorna_knowledge`, `salva_calcolo` avevano zero
 * chiamanti fuori da questo file. Non erano "pronte per il futuro": le
 * stesse scritture `server.js` le fa già in SQL diretto sul pool condiviso
 * (`/api/rocco/progetti`, `/api/rocco/diagnosi`, `autoSaveDiagnosi`). Due
 * implementazioni della stessa tabella, una viva e una mai invocata.
 *
 * **`cerca_casi_simili` è stata ritirata per una ragione di sostanza, non
 * di pulizia.** Leggeva `rocco_knowledge_casi` **senza filtrare
 * `verificato`**. Quella tabella la riempie anche `autoSaveDiagnosi`, che
 * inserisce con `verificato = FALSE` perché il caso contiene una causa
 * *ipotizzata da ROCCO* e non ancora confermata da nessuno. Risultato: una
 * supposizione di ROCCO tornava nel prompt del messaggio successivo
 * intestata "CASI SIMILI DAL DB ROCCO", cioè come precedente. È il
 * riciclaggio di una supposizione in conoscenza — l'invenzione che ROCCO
 * non deve fare, nella forma più difficile da notare.
 *
 * Nello stesso handler `/api/chat`, venti righe più su, c'era già
 * `fetchKnowledgeCasi()`: stessa tabella, FTS italiano invece di ILIKE, e
 * `verificato = TRUE`. Quella resta, ed è la lettura giusta.
 *
 * I casi chiusi dall'elettricista hanno **un posto solo**:
 * `rocco_v2/memory.js`, scritto da `/api/rocco/close-case` e letto da
 * `ragionaPerAnalogia()`. Non si aggiunge una quarta memoria degli stessi
 * casi.
 *
 * Resta quindi: creare lo schema (le tabelle servono agli endpoint vivi) e
 * il **contesto di progetto**, che è l'unica cosa che questo modulo sa fare
 * e nessun altro fa — progetto attivo e circuiti calcolati.
 */

const fs = require('fs');
const path = require('path');

// Pool condiviso. `db.js` lancia se DATABASE_URL non è configurato: non deve
// far cadere il modulo, si lavora senza contesto di progetto.
let pool = null;
try {
  ({ pool } = require('../db'));
} catch (_e) {
  pool = null;
}

// Dopo un fallimento non si ritenta a ogni messaggio: un DB morto
// costerebbe un timeout per richiesta. Poi si riprova, perché un'istanza
// sospesa può tornare.
const RETRY_AFTER_MS = 60 * 1000;
let dbDownSince = 0;

function dbUsable() {
  if (!pool) return false;
  if (!dbDownSince) return true;
  return Date.now() - dbDownSince > RETRY_AFTER_MS;
}

/**
 * Esegue la query senza lanciare. Il ripiego va agganciato al **fallimento
 * della query**, non a `if (!pool)`: il pool è un oggetto anche quando il
 * database non risponde, quindi quella guardia non scatta mai.
 */
async function tryQuery(sql, params) {
  if (!dbUsable()) return { ok: false, rows: [] };
  try {
    const result = await pool.query(sql, params);
    dbDownSince = 0;
    return { ok: true, rows: result.rows };
  } catch (_err) {
    dbDownSince = Date.now();
    return { ok: false, rows: [] };
  }
}

// ----------------------------------------------------------
// INIZIALIZZAZIONE SCHEMA
// ----------------------------------------------------------
//
// Lo schema crea le tabelle `rocco_progetti`, `rocco_diagnosi`,
// `rocco_knowledge_casi`, `rocco_circuiti` — usate dagli endpoint
// `/api/rocco/*` e da `autoSaveDiagnosi`. Per questo init_schema resta,
// anche se quasi tutto il resto del modulo è stato ritirato.
//
// Non lancia più: il database spento non è un errore di avvio, è un modo di
// funzionare. Ritorna quale stato ha trovato.
async function init_schema() {
  let sql;
  try {
    sql = fs.readFileSync(path.join(__dirname, 'rocco_memoria_schema.sql'), 'utf8');
  } catch (err) {
    console.log('[ROCCO MEMORIA] schema non leggibile: ' + err.message);
    return { backend: 'nessuno', reason: 'schema_unreadable' };
  }

  const res = await tryQuery(sql, []);
  if (!res.ok) {
    console.log('[ROCCO MEMORIA] Postgres non risponde → contesto di progetto non disponibile');
    return { backend: 'nessuno', reason: 'db_unavailable' };
  }
  console.log('[ROCCO MEMORIA] Schema inizializzato ✓');
  return { backend: 'postgres' };
}

// ----------------------------------------------------------
// CONTESTO DI PROGETTO per il system prompt di ROCCO
// ----------------------------------------------------------
//
// L'unica cosa che questo modulo sa fare e nessun altro fa: dire su quale
// impianto si sta lavorando e quali circuiti sono già stati calcolati.
// Senza database ritorna stringa vuota — niente contesto, nessun errore.
async function get_contesto_memoria(progetto_id = null) {
  let contesto = '';

  const casi = await tryQuery(
    `SELECT problema, causa, soluzione FROM rocco_knowledge_casi
     WHERE verificato=TRUE ORDER BY n_occorrenze DESC LIMIT 5`, []
  );
  if (casi.rows.length > 0) {
    contesto += '\n[CASI FREQUENTI ROCCO]\n';
    casi.rows.forEach((c, i) => {
      contesto += `${i + 1}. PROBLEMA: ${c.problema}\n   CAUSA: ${c.causa}\n   SOLUZIONE: ${c.soluzione}\n`;
    });
  }

  if (!progetto_id) return contesto;

  const prog = await tryQuery(`SELECT * FROM rocco_progetti WHERE id=$1`, [progetto_id]);
  if (prog.rows.length > 0) {
    const p = prog.rows[0];
    contesto += `\n[PROGETTO ATTIVO]\nCliente: ${p.cliente} | Sistema: ${p.sistema} | Tipo: ${p.tipo_locale}\n`;
  }

  const circ = await tryQuery(
    `SELECT nome, Ib_A, sezione_mm2, dV_perc, verifica_ok FROM rocco_circuiti
     WHERE impianto_id IN (SELECT id FROM rocco_impianti WHERE progetto_id=$1)
     ORDER BY created_at DESC LIMIT 10`, [progetto_id]
  );
  if (circ.rows.length > 0) {
    contesto += '[CIRCUITI]\n';
    circ.rows.forEach(c => {
      contesto += `  ${c.nome}: Ib=${c.ib_a}A S=${c.sezione_mm2}mm² ΔV=${c.dv_perc}% ${c.verifica_ok ? '✅' : '❌'}\n`;
    });
  }

  return contesto;
}

/** Chi tiene il contesto di progetto in questo momento — per /health. */
function backendInUso() {
  return { postgres: Boolean(pool) && !dbDownSince };
}

module.exports = {
  init_schema,
  get_contesto_memoria,
  backendInUso
};
