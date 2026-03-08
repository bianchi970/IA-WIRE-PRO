/**
 * ROCCO — Device Knowledge Base
 * Banca dati dispositivi elettrici, guasti e misure attese
 *
 * Esporta:
 *  initDeviceDB()          — esegue schema + seed se tabella vuota
 *  cercaDispositivo({ famiglia, testo, corrente }) → dispositivi
 *  cercaGuasti(sintomo, famiglia) → guasti ordinati per probabilità
 *  getMisureAttese(famiglia, parametro) → valori di riferimento
 *  getContestoTecnico(messaggio) → contesto strutturato per il prompt
 *  formattaContestoPerPrompt(contesto) → stringa per system prompt
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ─── RILEVAMENTO FAMIGLIA DAL TESTO ──────────────────────────────────────────

const FAMIGLIA_PATTERNS = [
  { famiglia: 'MCB',         pattern: /\b(mcb|magnetoterm|interruttore (magnetoterm|aut)|curva [bcd])\b/i },
  { famiglia: 'RCCB',        pattern: /\b(rccb|differenziale|diff|salvavita|rcd)\b/i },
  { famiglia: 'RCBO',        pattern: /\b(rcbo|magneto.?differenziale|interruttore differenziale)\b/i },
  { famiglia: 'MCCB',        pattern: /\b(mccb|scatolato|interr[a-z]* scatolato)\b/i },
  { famiglia: 'MOTORE',      pattern: /\b(motore|motor|asincrono|trifase [0-9]|pompa|compressore|ventilatore)\b/i },
  { famiglia: 'CONTATTORE',  pattern: /\b(contattore|teleruttore|cont[a-z]* AC-?3)\b/i },
  { famiglia: 'TRASFORMATORE', pattern: /\b(trasformatore|trafo|trasf)\b/i }
];

function rileveFamigliaInTesto(testo) {
  const t = String(testo || '').toLowerCase();
  for (const { famiglia, pattern } of FAMIGLIA_PATTERNS) {
    if (pattern.test(t)) return famiglia;
  }
  return null;
}

function rilevaSintomoDalTesto(testo) {
  const t = String(testo || '').toLowerCase();
  const sintomi = [];
  if (/scatt[ao]|trip|scattato/.test(t))       sintomi.push('scatta');
  if (/botta|rumore|schiocco/.test(t))          sintomi.push('botta');
  if (/sovraccarico|sovra[- ]?carico/.test(t))  sintomi.push('sovraccarico');
  if (/cortocircuito|corto/.test(t))            sintomi.push('cortocircuito');
  if (/dispersione|perdita|isolamento/.test(t)) sintomi.push('dispersione');
  if (/ronza|vibra|rumore|vibrazi/.test(t))     sintomi.push('ronza');
  if (/non parte|non avvia|bloccat/.test(t))    sintomi.push('non avvia');
  if (/surriscald|caldo|temperatura/.test(t))   sintomi.push('surriscalda');
  if (/umidità|pioggia|bagnato|infiltr/.test(t)) sintomi.push('umidità');
  return sintomi;
}

// ─── INIT DB ─────────────────────────────────────────────────────────────────

async function initDeviceDB() {
  const schemaPath = path.join(__dirname, '../../db/rocco_dispositivi_schema.sql');
  const seedPath   = path.join(__dirname, '../../db/rocco_dispositivi_seed.sql');

  try {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('[DEVICE KB] Schema dispositivi creato ✓');
  } catch (e) {
    console.warn('[DEVICE KB] Schema error:', e.message);
    return;
  }

  try {
    const seed = fs.readFileSync(seedPath, 'utf8');
    await pool.query(seed);
    console.log('[DEVICE KB] Seed dispositivi eseguito ✓');
  } catch (e) {
    console.warn('[DEVICE KB] Seed error:', e.message);
  }
}

// ─── CERCA DISPOSITIVO ────────────────────────────────────────────────────────

async function cercaDispositivo({ famiglia, testo, corrente }) {
  try {
    const params = [];
    const where  = [];

    if (famiglia) {
      params.push(famiglia.toUpperCase());
      where.push(`famiglia = $${params.length}`);
    }
    if (corrente) {
      params.push(corrente);
      where.push(`corrente_nominale_A = $${params.length}`);
    }
    if (testo) {
      params.push(`%${testo}%`);
      where.push(`(nome ILIKE $${params.length} OR applicazione ILIKE $${params.length} OR note_normative ILIKE $${params.length})`);
    }

    const sql = `SELECT * FROM rocco_dispositivi ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY famiglia, corrente_nominale_A LIMIT 10`;
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (_) {
    return [];
  }
}

// ─── CERCA GUASTI ─────────────────────────────────────────────────────────────

async function cercaGuasti(sintomo, famiglia) {
  try {
    const params = [];
    const where  = [];

    if (sintomo) {
      params.push(sintomo);
      where.push(`to_tsvector('italian', sintomo || ' ' || causa_probabile) @@ plainto_tsquery('italian', $${params.length})`);
    }
    if (famiglia) {
      params.push(famiglia.toUpperCase());
      where.push(`famiglia = $${params.length}`);
    }

    const sql = `
      SELECT g.*, d.nome as dispositivo_nome, d.corrente_nominale_A
      FROM rocco_guasti g
      LEFT JOIN rocco_dispositivi d ON d.codice = g.dispositivo_codice
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE g.probabilita WHEN 'Alta' THEN 1 WHEN 'Media' THEN 2 ELSE 3 END, g.id
      LIMIT 8
    `;
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (_) {
    return [];
  }
}

// ─── MISURE ATTESE ────────────────────────────────────────────────────────────

async function getMisureAttese(famiglia, parametro) {
  try {
    const params = [famiglia];
    let sql = `SELECT * FROM rocco_misure_attese WHERE famiglia ILIKE $1`;
    if (parametro) {
      params.push(`%${parametro}%`);
      sql += ` AND parametro ILIKE $2`;
    }
    sql += ' ORDER BY parametro LIMIT 10';
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (_) {
    return [];
  }
}

// ─── CONTESTO TECNICO COMPLETO ────────────────────────────────────────────────

async function getContestoTecnico(messaggio) {
  const famiglia = rileveFamigliaInTesto(messaggio);
  const sintomi  = rilevaSintomoDalTesto(messaggio);
  const sintomoStr = sintomi.join(' ');

  const [dispositivi, guasti, misure] = await Promise.all([
    cercaDispositivo({ famiglia }),
    cercaGuasti(sintomoStr || messaggio.slice(0, 80), famiglia),
    famiglia ? getMisureAttese(famiglia) : getMisureAttese('IMPIANTO_CIVILE')
  ]);

  return {
    famiglia_rilevata: famiglia,
    sintomi_rilevati:  sintomi,
    dispositivi,
    guasti,
    misure
  };
}

// ─── FORMATTAZIONE PER PROMPT ─────────────────────────────────────────────────

function formattaContestoPerPrompt(contesto) {
  if (!contesto) return '';

  const lines = ['─── CONTESTO TECNICO DA BANCA DATI DISPOSITIVI ───'];

  if (contesto.famiglia_rilevata) {
    lines.push(`Famiglia rilevata: ${contesto.famiglia_rilevata}`);
  }
  if (contesto.sintomi_rilevati && contesto.sintomi_rilevati.length) {
    lines.push(`Sintomi rilevati: ${contesto.sintomi_rilevati.join(', ')}`);
  }

  if (contesto.guasti && contesto.guasti.length) {
    lines.push('', 'GUASTI NOTI (ordinati per probabilità):');
    for (const g of contesto.guasti.slice(0, 5)) {
      lines.push(`• [${g.probabilita}] ${g.sintomo}`);
      lines.push(`  Causa: ${g.causa_probabile}`);
      lines.push(`  Verifica: ${g.verifica}`);
      lines.push(`  Strumento: ${g.strumento} — Atteso: ${g.valore_atteso}`);
      if (g.rischio) lines.push(`  Rischio: ${g.rischio}`);
    }
  }

  if (contesto.misure && contesto.misure.length) {
    lines.push('', 'VALORI DI RIFERIMENTO:');
    for (const m of contesto.misure.slice(0, 6)) {
      const range = m.valore_minimo !== null
        ? (m.valore_massimo !== null
            ? `${m.valore_minimo}÷${m.valore_massimo} ${m.unita}`
            : `≥${m.valore_minimo} ${m.unita}`)
        : (m.valore_massimo !== null
            ? `≤${m.valore_massimo} ${m.unita}`
            : `— ${m.unita}`);
      lines.push(`• ${m.parametro}: ${range} — ${m.condizione || ''}`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  initDeviceDB,
  cercaDispositivo,
  cercaGuasti,
  getMisureAttese,
  getContestoTecnico,
  formattaContestoPerPrompt
};
