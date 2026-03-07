const T = require('./rocco_tools');
console.log('\n===== TEST ROCCO TOOLS =====\n');

const ib   = T.calcola_ib(5500, 400, 0.85, 0.90, 'tri');
const sez  = T.seleziona_sezione(ib.Ib, 'B', 'PVC', 30);
const dv   = T.calcola_dv(sez.sezione, 50, ib.Ib, 0.85, 400, 'tri');
const pe   = T.calcola_pe(sez.sezione);
const coor = T.verifica_coordinamento(ib.Ib, 16, sez.Iz_corretta);
const diff = T.seleziona_differenziale('lavatrice_inv');
const diag = T.diagnosi_numerica('tensione', 195, 230, 10);
const rif  = T.calcola_rifasamento(100, 0.75, 0.95);
const mot  = T.corrente_motore(7.5, 400, 0.86, 0.91);
const icc  = T.calcola_icc(100, 4);

console.log('1. CORRENTE IMPIEGO:    ', ib.risultato);
console.log('2. SEZIONE CAVO:        ', sez.risultato);
console.log('3. CADUTA TENSIONE:     ', dv.risultato, dv.verifica_4perc);
console.log('4. PE:                  ', pe.risultato);
console.log('5. COORDINAMENTO:       ', coor.esito);
console.log('6. DIFFERENZIALE:       ', diff.risultato);
console.log('7. DIAGNOSI NUMERICA:   ', diag.anomalia);
if(diag.ipotesi_guasto) console.log('   Ipotesi:             ', diag.ipotesi_guasto.join(' | '));
console.log('8. RIFASAMENTO:         ', rif.risultato);
console.log('9. MOTORE 7.5kW:        ', mot.risultato);
console.log('10. ICC TRASF. 100kVA:  ', icc.risultato);

console.log('\n✅ TEST COMPLETATI\n');
