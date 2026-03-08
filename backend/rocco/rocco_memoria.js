/**
 * ROCCO MEMORIA — Interfaccia PostgreSQL (v7)
 * ROCCO usa queste funzioni per ricordare e imparare dai casi reali.
 */

const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ----------------------------------------------------------
// INIZIALIZZAZIONE SCHEMA
// ----------------------------------------------------------
async function init_schema() {
  const sql = fs.readFileSync(path.join(__dirname, 'rocco_memoria_schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[ROCCO MEMORIA] Schema inizializzato ✓');
}

// ----------------------------------------------------------
// PROGETTI
// ----------------------------------------------------------
async function salva_progetto({ cliente, indirizzo, tipo_locale, sistema = 'TT', tensione = 230, note = '' }) {
  const r = await pool.query(
    `INSERT INTO rocco_progetti (cliente, indirizzo, tipo_locale, sistema, tensione, note)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [cliente, indirizzo, tipo_locale, sistema, tensione, note]
  );
  return r.rows[0].id;
}

async function get_progetti(limit = 20) {
  const r = await pool.query(
    `SELECT * FROM rocco_progetti ORDER BY created_at DESC LIMIT $1`, [limit]
  );
  return r.rows;
}

// ----------------------------------------------------------
// CIRCUITI
// ----------------------------------------------------------
async function salva_circuito(impianto_id, dati) {
  const {
    nome, P_kW, Ib_A, sezione_mm2, metodo_posa = 'B',
    lunghezza_m, dV_perc, In_interruttore, curva_interruttore,
    diff_tipo, diff_Idn_mA, PE_mm2, verifica_ok, note = ''
  } = dati;
  const r = await pool.query(
    `INSERT INTO rocco_circuiti
     (impianto_id,nome,P_kW,Ib_A,sezione_mm2,metodo_posa,lunghezza_m,
      dV_perc,In_interruttore,curva_interruttore,diff_tipo,diff_Idn_mA,PE_mm2,verifica_ok,note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [impianto_id, nome, P_kW, Ib_A, sezione_mm2, metodo_posa, lunghezza_m,
     dV_perc, In_interruttore, curva_interruttore, diff_tipo, diff_Idn_mA, PE_mm2, verifica_ok, note]
  );
  return r.rows[0].id;
}

// ----------------------------------------------------------
// DIAGNOSI
// ----------------------------------------------------------
async function salva_diagnosi({
  progetto_id = null, descrizione, sintomi = '', misure_rilevate = [],
  causa_trovata = '', soluzione = '', norma_riferimento = '',
  risolto = false, tempo_minuti = null
}) {
  const r = await pool.query(
    `INSERT INTO rocco_diagnosi
     (progetto_id,descrizione,sintomi,misure_rilevate,causa_trovata,soluzione,norma_riferimento,risolto,tempo_minuti)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [progetto_id, descrizione, sintomi, JSON.stringify(misure_rilevate),
     causa_trovata, soluzione, norma_riferimento, risolto, tempo_minuti]
  );
  if (risolto && causa_trovata && soluzione) {
    await aggiorna_knowledge(descrizione, causa_trovata, soluzione, norma_riferimento);
  }
  return r.rows[0].id;
}

// ----------------------------------------------------------
// KNOWLEDGE BASE
// ----------------------------------------------------------
async function cerca_casi_simili(problema, limit = 3) {
  const parole = problema.toLowerCase().split(/\s+/).filter(p => p.length > 3);
  if (parole.length === 0) return [];

  const condizioni = parole.map((_, i) => `LOWER(problema) LIKE $${i + 1}`).join(' OR ');
  const valori = parole.map(p => `%${p}%`);

  const r = await pool.query(
    `SELECT * FROM rocco_knowledge_casi
     WHERE ${condizioni}
     ORDER BY n_occorrenze DESC, verificato DESC
     LIMIT $${parole.length + 1}`,
    [...valori, limit]
  );
  return r.rows;
}

async function aggiorna_knowledge(problema, causa, soluzione, norma = '') {
  const esistente = await pool.query(
    `SELECT id FROM rocco_knowledge_casi WHERE LOWER(problema) LIKE $1 LIMIT 1`,
    [`%${problema.substring(0, 30).toLowerCase()}%`]
  );
  if (esistente.rows.length > 0) {
    await pool.query(
      `UPDATE rocco_knowledge_casi SET n_occorrenze = n_occorrenze + 1 WHERE id = $1`,
      [esistente.rows[0].id]
    );
  } else {
    await pool.query(
      `INSERT INTO rocco_knowledge_casi (problema, causa, soluzione, norma_riferimento)
       VALUES ($1,$2,$3,$4)`,
      [problema, causa, soluzione, norma]
    );
  }
}

// ----------------------------------------------------------
// SALVA CALCOLO (storico)
// ----------------------------------------------------------
async function salva_calcolo(tipo_calcolo, parametri_input, risultato, progetto_id = null) {
  await pool.query(
    `INSERT INTO rocco_calcoli (progetto_id, tipo_calcolo, parametri_input, risultato)
     VALUES ($1,$2,$3,$4)`,
    [progetto_id, tipo_calcolo, JSON.stringify(parametri_input), JSON.stringify(risultato)]
  );
}

// ----------------------------------------------------------
// CONTESTO MEMORIA per il system prompt di ROCCO
// ----------------------------------------------------------
async function get_contesto_memoria(progetto_id = null) {
  let contesto = '';

  try {
    const casi = await pool.query(
      `SELECT problema, causa, soluzione FROM rocco_knowledge_casi
       WHERE verificato=TRUE ORDER BY n_occorrenze DESC LIMIT 5`
    );
    if (casi.rows.length > 0) {
      contesto += '\n[CASI FREQUENTI ROCCO]\n';
      casi.rows.forEach((c, i) => {
        contesto += `${i + 1}. PROBLEMA: ${c.problema}\n   CAUSA: ${c.causa}\n   SOLUZIONE: ${c.soluzione}\n`;
      });
    }

    if (progetto_id) {
      const prog = await pool.query(`SELECT * FROM rocco_progetti WHERE id=$1`, [progetto_id]);
      if (prog.rows.length > 0) {
        const p = prog.rows[0];
        contesto += `\n[PROGETTO ATTIVO]\nCliente: ${p.cliente} | Sistema: ${p.sistema} | Tipo: ${p.tipo_locale}\n`;
      }
      const circ = await pool.query(
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
    }
  } catch (err) {
    // Non bloccare se il DB non è pronto
    console.warn('[ROCCO MEMORIA] get_contesto_memoria:', err.message);
  }

  return contesto;
}

module.exports = {
  init_schema,
  salva_progetto, get_progetti,
  salva_circuito,
  salva_diagnosi,
  cerca_casi_simili, aggiorna_knowledge,
  salva_calcolo,
  get_contesto_memoria
};
