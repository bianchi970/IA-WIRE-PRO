/**
 * ROCCO MEMORIA — Interfaccia PostgreSQL (FASE v7)
 * API di accesso alla memoria permanente di ROCCO.
 * Schema: rocco_progetti, rocco_diagnosi, rocco_knowledge_casi, rocco_calcoli
 */
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ----------------------------------------------------------
// INIZIALIZZAZIONE SCHEMA
// ----------------------------------------------------------
async function init_schema() {
  var fs = require('fs');
  var path = require('path');
  var sql = fs.readFileSync(path.join(__dirname, 'rocco_memoria_schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[ROCCO] Schema memoria v7 inizializzato');
}

// ----------------------------------------------------------
// KNOWLEDGE BASE — cerca casi simili (ricerca per parole chiave)
// ----------------------------------------------------------
async function cerca_casi_simili(problema, limit) {
  limit = limit || 3;
  var parole = (problema || '').toLowerCase().split(' ').filter(function(p) { return p.length > 3; });
  if (parole.length === 0) return [];
  var condizioni = parole.map(function(_, i) { return 'LOWER(problema) LIKE $' + (i + 1); }).join(' OR ');
  var valori = parole.map(function(p) { return '%' + p + '%'; });
  var r = await pool.query(
    'SELECT problema, soluzione, dominio FROM rocco_knowledge_casi WHERE ' + condizioni +
    ' ORDER BY n_occorrenze DESC, verificato DESC LIMIT $' + (parole.length + 1),
    valori.concat([limit])
  );
  return r.rows;
}

// ----------------------------------------------------------
// CONTESTO MEMORIA per il system prompt di ROCCO
// ----------------------------------------------------------
async function get_contesto_memoria(progetto_id) {
  var contesto = '';
  try {
    // Top 5 casi verificati più frequenti
    var casi = await pool.query(
      'SELECT problema, soluzione FROM rocco_knowledge_casi WHERE verificato=TRUE ORDER BY n_occorrenze DESC LIMIT 5'
    );
    if (casi.rows.length > 0) {
      contesto += '\n[CASI FREQUENTI ROCCO]\n';
      casi.rows.forEach(function(c, i) {
        contesto += (i + 1) + '. ' + c.problema + ' → ' + c.soluzione + '\n';
      });
    }
  } catch (_) {}
  return contesto;
}

module.exports = {
  init_schema,
  cerca_casi_simili,
  get_contesto_memoria
};
