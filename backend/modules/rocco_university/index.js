/**
 * ROCCO UNIVERSITY — Modulo Principale
 * Entry point: inizializza DB e esporta router
 *
 * INTEGRAZIONE in server.js / app.js:
 *   const roccoUniversity = require('./modules/rocco_university');
 *   await roccoUniversity.init();
 *   app.use('/api/university', roccoUniversity.router);
 */

const router = require('./routes');
const { initMemoriaDB } = require('./memory');
const { getSystemPromptReasoning } = require('./reasoning');
const { MATERIE } = require('./materie');
const { FORMULE, calcolaFormula } = require('./formula_engine');
const { initDeviceDB, getContestoTecnico, formattaContestoPerPrompt } = require('./device_kb');

async function init() {
  try {
    await initMemoriaDB();
    console.log('[ROCCO UNIVERSITY] Modulo inizializzato ✓');
    console.log(`[ROCCO UNIVERSITY] Materie disponibili: ${Object.keys(MATERIE).length}`);
    console.log(`[ROCCO UNIVERSITY] Formule disponibili: ${Object.keys(FORMULE).length}`);
  } catch (err) {
    console.error('[ROCCO UNIVERSITY] Errore inizializzazione memoria:', err.message);
  }
  try {
    await initDeviceDB();
    console.log('[ROCCO UNIVERSITY] Banca dispositivi inizializzata ✓');
  } catch (err) {
    console.error('[ROCCO UNIVERSITY] Errore inizializzazione dispositivi:', err.message);
    // Non bloccare l'avvio del server principale
  }
}

module.exports = {
  init,
  router,
  // Esporta utilità per uso interno da altri moduli ROCCO
  getSystemPromptReasoning,
  calcolaFormula,
  MATERIE,
  FORMULE,
  // Device KB
  getContestoTecnico,
  formattaContestoPerPrompt
};
