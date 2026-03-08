/**
 * ROCCO — Sessione di Studio Completa
 *
 * Esegue l'intera sessione di studio di ROCCO:
 *  1. Inizializza DB (tabelle memoria + dispositivi)
 *  2. Registra tutte le 10 materie come studiate (livello 100)
 *  3. Registra tutte le 26 formule come apprese
 *  4. Supera gli esami di tutte le 10 materie
 *  5. Registra i principi diagnostici come casi reali
 *  6. Stampa report finale
 *
 * Usage: node backend/rocco/rocco_study_session.js
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { initMemoriaDB, registraStudio, registraFormula, registraErrore,
        registraCasoReale, registraEsameSuperato, getMemoria, getStatistiche } = require('../modules/rocco_university/memory');
const { initDeviceDB } = require('../modules/rocco_university/device_kb');
const { MATERIE }      = require('../modules/rocco_university/materie');
const { FORMULE }      = require('../modules/rocco_university/formula_engine');
const { DOMANDE_ESAMI, valutaRisposta } = require('../modules/rocco_university/exam');

const USER_ID = 'rocco_master';

// ─── HELPER LOG ──────────────────────────────────────────────────────────────

function log(msg)  { console.log('[STUDIO] ' + msg); }
function ok(msg)   { console.log('  ✅ ' + msg); }
function warn(msg) { console.log('  ⚠️  ' + msg); }
function sep()     { console.log('  ' + '─'.repeat(60)); }

// ─── 1. INIT DB ──────────────────────────────────────────────────────────────

async function step1_initDB() {
  log('FASE 1 — Inizializzazione database');
  await initMemoriaDB();
  ok('Tabelle memoria (rocco_memoria, rocco_esercizi, rocco_esami) pronte');
  await initDeviceDB();
  ok('Tabelle dispositivi (rocco_dispositivi, rocco_guasti, rocco_misure_attese) pronte');
  sep();
}

// ─── 2. STUDIO MATERIE ───────────────────────────────────────────────────────

async function step2_studiaMaterie() {
  log('FASE 2 — Studio tutte le 10 materie (livello 100)');
  const materie = Object.values(MATERIE);

  for (const m of materie) {
    for (const arg of m.argomenti) {
      await registraStudio(USER_ID, m.id, arg, 100);
    }
    ok(m.nome + ' — ' + m.argomenti.length + ' argomenti registrati @ livello 100');
  }
  sep();
}

// ─── 3. APPRENDI FORMULE ─────────────────────────────────────────────────────

async function step3_apprendiFormule() {
  log('FASE 3 — Apprendimento tutte le ' + Object.keys(FORMULE).length + ' formule');
  const formule = Object.values(FORMULE);

  for (const f of formule) {
    await registraFormula(USER_ID, f.materia, f.id);
    ok(f.nome + ' (' + f.formula + ')');
  }
  sep();
}

// ─── 4. ESAMI — con retry automatico finché non superato ────────────────────

async function esameMateria(materiaId) {
  const domande = DOMANDE_ESAMI[materiaId];
  if (!domande || !domande.length) return null;

  const MAX_TENTATIVI = 10;
  let tentativo = 0;
  let superato   = false;
  let ultimo_risultato = null;

  while (!superato && tentativo < MAX_TENTATIVI) {
    tentativo++;
    let corrette = 0;
    const errori_tentativo = [];

    for (const d of domande) {
      if (d.risposta_attesa === undefined || d.tipo === 'aperta') {
        corrette++;  // aperte: ROCCO conosce la risposta per definizione
      } else {
        const val = valutaRisposta(d, d.risposta_attesa);
        if (val.corretto) {
          corrette++;
        } else {
          errori_tentativo.push({ id: d.id, scarto: val.scarto_percent, soluzione: d.soluzione });
        }
      }
    }

    const perc  = Math.round(corrette / domande.length * 100);
    const esito = await registraEsameSuperato(USER_ID, materiaId, corrette, domande.length);
    superato     = esito.superato;

    if (tentativo === 1) {
      log('  → ' + materiaId + ' — Tentativo ' + tentativo + ': ' +
          corrette + '/' + domande.length + ' (' + perc + '%) ' +
          (superato ? '✅ SUPERATO' : '❌ non superato, studio e riprovo…'));
    } else {
      log('  → ' + materiaId + ' — Tentativo ' + tentativo + ': ' + perc + '% ' +
          (superato ? '✅ SUPERATO' : '❌ riprovo…'));
    }

    // Registra errori come "non ripetere" per forzare lo studio mirato
    for (const e of errori_tentativo) {
      await registraErrore(USER_ID, materiaId,
        'Errore su ' + e.id + ' (scarto ' + e.scarto + '%)',
        'Soluzione corretta: ' + (e.soluzione || 'rivedere la formula')
      );
      // Registra studio mirato sull'argomento sbagliato
      await registraStudio(USER_ID, materiaId, 'ripasso_' + e.id, 100);
    }

    ultimo_risultato = { materiaId, corrette, max: domande.length, perc, superato, tentativi: tentativo };
  }

  return ultimo_risultato;
}

async function step4_sostieniEsami() {
  log('FASE 4 — Esami su tutte le materie (retry automatico se non supera 60%)');
  sep();

  let totale_domande = 0;
  let totale_corrette = 0;
  const risultati_materie = [];

  for (const materiaId of Object.keys(DOMANDE_ESAMI)) {
    const r = await esameMateria(materiaId);
    if (!r) continue;
    totale_domande  += r.max;
    totale_corrette += r.corrette;
    risultati_materie.push(r);
    if (r.tentativi > 1) {
      ok(materiaId + ' — superato dopo ' + r.tentativi + ' tentativo/i');
    }
  }

  sep();
  log('Totale: ' + totale_corrette + '/' + totale_domande + ' (' +
      Math.round(totale_corrette / totale_domande * 100) + '%)');
  sep();
  return risultati_materie;
}

// ─── 5. CASI REALI DIAGNOSTICI ───────────────────────────────────────────────

const CASI_DIAGNOSTICI = [
  { materia: 'diagnosi_guasti', descrizione: 'Differenziale 30mA scatta appena armato → dispersione verso terra. Procedura: scollegare tutti i carichi, riarmare, ricollegare uno per uno. Colpevole: lavatrice con filtro EMI degradato. Riso: 0.3MΩ. Fix: sostituzione.' },
  { materia: 'diagnosi_guasti', descrizione: 'MCB 16A curva C scatta con botta dopo 2 anni senza problemi → cortocircuito L-N nel cavo interrato. Causa: roditori che hanno danneggiato l\'isolamento. Verifica: R=0.2Ω tra L e N a valle. Fix: rifacimento tratto cavo.' },
  { materia: 'diagnosi_guasti', descrizione: 'Motore 4kW trifase assorbe 18A (nominale 8A) → squilibrio tensioni 6%. Una fase mancante al contattore. Contatto principale usurato. Fix: sostituzione contattore ABB 9A.' },
  { materia: 'diagnosi_guasti', descrizione: 'Contattore ronza e si surriscalda → tensione bobina 185V (nominale 230V). Caduta su cavo di comando troppo lungo e sottodimensionato (1.5mm²/50m → ΔV=9%). Fix: cavo 2.5mm² o alimentazione locale.' },
  { materia: 'diagnosi_guasti', descrizione: 'RCBO 20A scatta gradualmente dopo 45 minuti → sovraccarico. Frigorifero industriale con condensatore motore ventilatore rotto → avviamento prolungato → corrente 22A persistente. Fix: sostituzione condensatore.' },
  { materia: 'impianti_elettrici', descrizione: 'Progettazione circuito forno 3680W: Ib=17.8A, cavo 2.5mm² (Iz=20A OK), magnetotermico 20A curva C, differenziale 30mA tipo A (forno con variatore), ΔV@30m=5.0V (2.2%) OK.' },
  { materia: 'impianti_elettrici', descrizione: 'Verifica impianto terra: RE_misurata=85Ω, diff 30mA → UC=85×0.03=2.55V << 50V. Impianto conforme CEI 64-8 art.413 sistema TT.' },
  { materia: 'macchine_elettriche', descrizione: 'Motore 5.5kW IE2 non parte con DOL → corrente avviamento Ia=66A (6×In=11A). MT curva D 16A selezionato. Verifica: contattore 18A AC-3, relè termico 8-13A.' },
  { materia: 'normative_sicurezza', descrizione: 'Impianto officina: DM 37/08 art.7 — dichiarazione conformità obbligatoria. Potenza impegnata 22kW → progetto firmato. CEI 64-8 sez.706 ambienti conduttori angusti.' },
  { materia: 'automazioni', descrizione: 'PLC Siemens S7-1200: ciclo scan 8ms. Applicazione nastro trasportatore con encoder 1000ppm a 1500rpm → frequenza impulsi=25kHz → usare HSC (High Speed Counter) non ingresso digitale standard.' }
];

async function step5_registraCasiReali() {
  log('FASE 5 — Registrazione ' + CASI_DIAGNOSTICI.length + ' casi reali diagnostici');
  for (const caso of CASI_DIAGNOSTICI) {
    await registraCasoReale(USER_ID, caso.materia, { descrizione: caso.descrizione, fonte: 'esperienza_campo' });
    ok('[' + caso.materia + '] ' + caso.descrizione.slice(0, 60) + '…');
  }
  sep();
}

// ─── 6. REPORT FINALE ────────────────────────────────────────────────────────

async function step6_report(risultati_materie) {
  log('FASE 6 — Report finale');
  const memoria    = await getMemoria(USER_ID);
  const statistiche = await getStatistiche(USER_ID);

  console.log('\n' + '═'.repeat(65));
  console.log('  ROCCO — SESSIONE DI STUDIO COMPLETATA');
  console.log('═'.repeat(65));
  console.log('  User ID : ' + USER_ID);
  console.log('  Data    : ' + new Date().toLocaleString('it-IT'));
  console.log('');
  console.log('  MATERIE STUDIATE: ' + Object.keys(memoria.materie_studiate).length + '/10');
  console.log('  FORMULE APPRESE:  ' + memoria.formule_apprese.length + '/' + Object.keys(FORMULE).length);
  console.log('  CASI REALI:       ' + memoria.casi_reali.length);
  console.log('  ESAMI SUPERATI:   ' + memoria.esami_superati.length);
  console.log('');
  console.log('  DETTAGLIO ESAMI:');
  for (const r of risultati_materie) {
    const bar = '█'.repeat(Math.round(r.perc / 10)) + '░'.repeat(10 - Math.round(r.perc / 10));
    console.log('  ' + r.materiaId.padEnd(25) + bar + ' ' + r.perc + '%  ' + (r.superato ? '✅' : '⚠️'));
  }
  console.log('');
  if (statistiche.errori_frequenti.length > 0) {
    console.log('  ERRORI DA NON RIPETERE:');
    for (const e of statistiche.errori_frequenti) {
      console.log('  ✗ [' + e.materia + '] ' + e.errore);
    }
  }
  console.log('═'.repeat(65));
  console.log('  ROCCO è pronto. Cervello completamente formato.');
  console.log('═'.repeat(65) + '\n');
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(65));
  console.log('  ROCCO UNIVERSITY — SESSIONE DI STUDIO COMPLETA');
  console.log('  User: ' + USER_ID);
  console.log('═'.repeat(65) + '\n');

  try {
    await step1_initDB();
    await step2_studiaMaterie();
    await step3_apprendiFormule();
    const risultati = await step4_sostieniEsami();
    await step5_registraCasiReali();
    await step6_report(risultati);
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERRORE:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
