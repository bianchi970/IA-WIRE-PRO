/**
 * ROCCO UNIVERSITY — API Routes
 * Express router per tutte le funzionalità del modulo
 */

const express = require('express');
const router = express.Router();

const { MATERIE } = require('./materie');
const { FORMULE, calcolaFormula, formulePerMateria } = require('./formula_engine');
const { diagnosiNumerica, getSystemPromptReasoning } = require('./reasoning');
const {
  getMemoria, registraStudio, registraFormula,
  registraErrore, registraCasoReale, registraEsameSuperato, getStatistiche
} = require('./memory');
const { generaEsame, valutaRisposta, REGOLE_ESAME } = require('./exam');

// ─── MATERIE ─────────────────────────────────────────────────────────────────

// GET /api/university/materie — lista tutte le materie
router.get('/materie', (req, res) => {
  res.json(Object.values(MATERIE));
});

// GET /api/university/materie/:id — dettaglio materia
router.get('/materie/:id', (req, res) => {
  const materia = MATERIE[req.params.id];
  if (!materia) return res.status(404).json({ errore: 'Materia non trovata' });
  const formule = formulePerMateria(req.params.id);
  res.json({ ...materia, formule: formule.map(f => ({ id: f.id, nome: f.nome, formula: f.formula })) });
});

// ─── FORMULE ─────────────────────────────────────────────────────────────────

// GET /api/university/formule — tutte le formule
router.get('/formule', (req, res) => {
  const { materia } = req.query;
  const formule = materia ? formulePerMateria(materia) : Object.values(FORMULE);
  res.json(formule.map(({ calcola, ...f }) => f)); // non esporre la funzione calcola
});

// GET /api/university/formule/:id — dettaglio formula
router.get('/formule/:id', (req, res) => {
  const f = FORMULE[req.params.id];
  if (!f) return res.status(404).json({ errore: 'Formula non trovata' });
  const { calcola, ...formula } = f;
  res.json(formula);
});

// POST /api/university/formule/:id/calcola — calcolo numerico
router.post('/formule/:id/calcola', (req, res) => {
  const risultato = calcolaFormula(req.params.id, req.body);
  if (risultato.errore) return res.status(400).json(risultato);

  // Registra formula appresa (opzionale, non bloccante)
  const userId = req.body.user_id || 'default';
  const materia = FORMULE[req.params.id]?.materia;
  if (materia) registraFormula(userId, materia, req.params.id).catch(() => {});

  res.json(risultato);
});

// ─── DIAGNOSI NUMERICA ───────────────────────────────────────────────────────

// POST /api/university/diagnosi — schema misura→formula→confronto→guasto
router.post('/diagnosi', (req, res) => {
  const { misura, valore_misurato, valore_atteso, tolleranza_percent } = req.body;
  const risultato = diagnosiNumerica({ misura, valore_misurato, valore_atteso, tolleranza_percent });
  res.json(risultato);
});

// ─── ESAMI ──────────────────────────────────────────────────────────────────

// GET /api/university/esami/:materia — genera esame
router.get('/esami/:materia', (req, res) => {
  const { n } = req.query;
  const esame = generaEsame(req.params.materia, n ? parseInt(n) : 5);
  if (esame.errore) return res.status(404).json(esame);
  res.json({ ...esame, regole: REGOLE_ESAME });
});

// POST /api/university/esami/:materia/valuta — valuta risposta singola
router.post('/esami/:materia/valuta', (req, res) => {
  const { domanda, risposta } = req.body;
  if (!domanda || risposta === undefined) {
    return res.status(400).json({ errore: 'Richiesti: domanda (oggetto), risposta (numero)' });
  }
  const valutazione = valutaRisposta(domanda, risposta);
  res.json(valutazione);
});

// POST /api/university/esami/:materia/submit — registra risultato esame
router.post('/esami/:materia/submit', async (req, res) => {
  const { user_id = 'default', punteggio, max_punteggio } = req.body;
  if (punteggio === undefined || !max_punteggio) {
    return res.status(400).json({ errore: 'Richiesti: punteggio, max_punteggio' });
  }
  try {
    const risultato = await registraEsameSuperato(user_id, req.params.materia, punteggio, max_punteggio);
    res.json(risultato);
  } catch (e) {
    res.status(500).json({ errore: e.message });
  }
});

// ─── MEMORIA ─────────────────────────────────────────────────────────────────

// GET /api/university/memoria — recupera memoria didattica
router.get('/memoria', async (req, res) => {
  const userId = req.query.user_id || 'default';
  try {
    const memoria = await getMemoria(userId);
    res.json(memoria);
  } catch (e) {
    res.status(500).json({ errore: e.message });
  }
});

// POST /api/university/memoria/errore — registra errore
router.post('/memoria/errore', async (req, res) => {
  const { user_id = 'default', materia, errore, correzione } = req.body;
  if (!materia || !errore) return res.status(400).json({ errore: 'Richiesti: materia, errore' });
  try {
    await registraErrore(user_id, materia, errore, correzione);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ errore: e.message });
  }
});

// POST /api/university/memoria/caso — registra caso reale
router.post('/memoria/caso', async (req, res) => {
  const { user_id = 'default', materia, caso } = req.body;
  if (!materia || !caso) return res.status(400).json({ errore: 'Richiesti: materia, caso' });
  try {
    await registraCasoReale(user_id, materia, caso);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ errore: e.message });
  }
});

// GET /api/university/statistiche — statistiche di apprendimento
router.get('/statistiche', async (req, res) => {
  const userId = req.query.user_id || 'default';
  try {
    const stats = await getStatistiche(userId);
    res.json(stats);
  } catch (e) {
    res.status(500).json({ errore: e.message });
  }
});

// GET /api/university/reasoning/prompt — schema ragionamento (per debug/integrazione AI)
router.get('/reasoning/prompt', (req, res) => {
  res.json({ system_prompt_addition: getSystemPromptReasoning() });
});

module.exports = router;
