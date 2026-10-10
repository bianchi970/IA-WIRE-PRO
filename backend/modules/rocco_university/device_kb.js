/**
 * ROCCO — Banca dispositivi
 *
 * Dispositivi, guasti noti e valori di riferimento: cosa ROCCO sa degli
 * apparecchi che l'elettricista ha davanti.
 *
 * ── Perché non usa più il database ───────────────────────────────────
 *
 * Questa era l'unica conoscenza di ROCCO che per esistere richiedeva
 * Postgres: all'avvio creava le tabelle e caricava
 * `db/rocco_dispositivi_seed.sql`. Col DB spento l'avvio diceva
 *
 *     [DEVICE KB] Schema error: Connection terminated unexpectedly
 *
 * e ROCCO restava senza sapere nulla dei dispositivi. Non "con meno
 * dettaglio": senza niente. 35 apparecchi, 17 guasti e 17 misure attese
 * chiusi in un file SQL che nessuno leggeva.
 *
 * Ora la banca è un file di conoscenza come gli altri —
 * `knowledge/dispositivi.json`, generato da `knowledge/build_dispositivi.js`
 * mettendo insieme le cinque fonti che ROCCO ha già: il seed SQL, i 50
 * componenti locali, l'enciclopedia, i 40 pattern di guasto e i limiti
 * normativi. Funziona sempre, DB o no.
 *
 * ── Cosa contiene, misurato ─────────────────────────────────────────
 *
 *   109 dispositivi · 322 guasti noti · 39 valori di riferimento
 *   36 famiglie · 33 lacune dichiarate
 *
 * Ogni voce porta `fonte`, e le lacune sono scritte nel file. Un valore
 * atteso che la fonte non dà resta "non specificato nella fonte": ROCCO
 * dice che non lo sa invece di riempire il buco.
 *
 * Esporta (interfaccia invariata, ora sincrona sotto le Promise):
 *  initDeviceDB()          — carica la banca e riporta la copertura
 *  cercaDispositivo({ famiglia, testo, corrente }) → dispositivi
 *  cercaGuasti(sintomo, famiglia) → guasti ordinati per probabilità
 *  getMisureAttese(famiglia, parametro) → valori di riferimento
 *  getContestoTecnico(messaggio) → contesto strutturato per il prompt
 *  formattaContestoPerPrompt(contesto) → stringa per system prompt
 *  copertura() / lacune()  — cosa sa e cosa non sa
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const PERCORSO_BANCA = path.join(__dirname, '..', '..', 'knowledge', 'dispositivi.json');

// ─── CARICAMENTO ──────────────────────────────────────────────────────────────

let banca = null;

function caricaBanca() {
  if (banca) return banca;
  try {
    banca = JSON.parse(fs.readFileSync(PERCORSO_BANCA, 'utf8'));
  } catch (e) {
    // Senza il file la banca è vuota, non rotta: ROCCO continua a
    // funzionare col resto della sua conoscenza.
    console.warn('[DEVICE KB] banca non leggibile:', e.message,
      '— rigenerala con: node knowledge/build_dispositivi.js');
    banca = { dispositivi: [], guasti: [], misure_attese: [], copertura: {}, lacune: [] };
  }
  return banca;
}

// ─── RILEVAMENTO FAMIGLIA DAL TESTO ──────────────────────────────────────────

// Le radici vogliono `\w*` prima del confine, non `\b` subito dopo: con
// `\b(fotovoltaic)\b` la parola "fotovoltaico" NON matcha, perché dopo la
// radice c'è una lettera e il confine di parola non esiste. È lo stesso
// difetto dei confini già corretto nel riconoscitore componenti — e me lo
// sono rifatto da solo scrivendo questi pattern.
const FAMIGLIA_PATTERNS = [
  { famiglia: 'RCBO',        pattern: /\b(rcbo|magneto.?differenzial\w*|magnetotermico differenzial\w*)/i },
  { famiglia: 'MCB',         pattern: /\b(mcb|magnetoterm\w*|interruttore (magnetoterm\w*|automatic\w*)|curva [bcd])/i },
  { famiglia: 'RCCB',        pattern: /\b(rccb|differenzial\w*|salvavita|rcd)\b/i },
  { famiglia: 'MCCB',        pattern: /\b(mccb|scatolat\w*)/i },
  { famiglia: 'FOTOVOLTAICO', pattern: /\b(fotovoltaic\w*|pannell\w*|stringa|stringhe|\bfv\b|mc4|irraggiament\w*)/i },
  { famiglia: 'MOTORE',      pattern: /\b(motore|motori|asincron\w*|compressor\w*|ventilator\w*|avvolgiment\w*|statore|rotore)/i },
  { famiglia: 'CONTATTORE',  pattern: /\b(contattor\w*|teleruttor\w*)/i },
  { famiglia: 'TRASFORMATORE', pattern: /\b(trasformator\w*|trafo|\bta\b)/i },
  { famiglia: 'TERMICO',     pattern: /\b(caldaia|caldaie|boiler|scaldabagno|termostat\w*|pompa di calore|circolator\w*|radiator\w*|bruciator\w*)/i },
  { famiglia: 'DOMOTICA',    pattern: /\b(knx|dali|domotic\w*|crepuscolar\w*|dimmer|rilevatore di presenza|tapparell\w*)/i },
  { famiglia: 'PLC',         pattern: /\b(plc|simatic|zelio|automazion\w*)/i },
  { famiglia: 'SPD',         pattern: /\b(spd|scaricator\w*|limitatore di sovratension\w*|fulmine|fulmini|scarica atmosferica)\b/i },
  { famiglia: 'UPS',         pattern: /\b(ups|gruppo di continuit\w*)/i },
  { famiglia: 'RETE',        pattern: /\b(router|access point|telecamer\w*|\bnvr\b)/i },
  { famiglia: 'RICARICA',    pattern: /\b(wallbox|colonnin\w*|auto elettric\w*)/i },
  { famiglia: 'QUADRO',      pattern: /\b(quadro elettric\w*|centralin\w*|custodia ip|cassett\w* di derivazion\w*)/i },
  { famiglia: 'SENSORE',     pattern: /\b(pt100|termocoppi\w*|sonda|sensor\w*)/i },
  { famiglia: 'SICUREZZA',   pattern: /\b(arresto di emergenza|rele di sicurezza|estop|fungo di emergenza)/i },
  { famiglia: 'INVERTER',    pattern: /\b(variatore di frequenza|\bvfd\b|inverter per motor\w*)/i }
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
  if (/scatt[ao]|trip|scattato|salta|non resta su|ricade/.test(t)) sintomi.push('scatta');
  if (/botta|rumore|schiocco/.test(t))          sintomi.push('botta');
  if (/sovraccarico|sovra[- ]?carico/.test(t))  sintomi.push('sovraccarico');
  if (/cortocircuito|corto/.test(t))            sintomi.push('cortocircuito');
  if (/dispersione|perdita|isolamento/.test(t)) sintomi.push('dispersione');
  if (/ronza|vibra|rumore|vibrazi/.test(t))     sintomi.push('ronza');
  if (/non parte|non avvia|bloccat/.test(t))    sintomi.push('non avvia');
  if (/surriscald|caldo|temperatura|brucia/.test(t)) sintomi.push('surriscalda');
  if (/umidit|pioggia|bagnato|infiltr/.test(t)) sintomi.push('umidità');
  return sintomi;
}

// ─── RICERCA ──────────────────────────────────────────────────────────────────

function normalizza(t) {
  return String(t == null ? '' : t).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Quante parole significative della ricerca compaiono nel testo. */
function punteggioTesto(testo, ricerca) {
  const t = normalizza(testo);
  const parole = normalizza(ricerca).match(/[a-z0-9]{4,}/g) || [];
  if (!parole.length) return 0;
  let n = 0;
  parole.forEach(function (p) { if (t.indexOf(p) >= 0) n++; });
  return n;
}

async function cercaDispositivo({ famiglia, testo, corrente } = {}) {
  const b = caricaBanca();
  let out = b.dispositivi.slice();

  if (famiglia) {
    const f = String(famiglia).toUpperCase();
    out = out.filter(function (d) { return d.famiglia === f; });
  }
  if (corrente) {
    const c = parseFloat(corrente);
    out = out.filter(function (d) { return d.corrente_nominale_A === c; });
  }
  if (testo) {
    out = out.map(function (d) {
      const campi = [d.nome, d.applicazione, d.note_normative,
        (d.parole_chiave || []).join(' ')].join(' ');
      return { d: d, p: punteggioTesto(campi, testo) };
    }).filter(function (x) { return x.p > 0; })
      .sort(function (a, b2) { return b2.p - a.p; })
      .map(function (x) { return x.d; });
  }

  // Prima quelli con la targa completa: servono di più a chi deve scegliere.
  out.sort(function (a, b2) {
    const ta = a.corrente_nominale_A == null ? 1 : 0;
    const tb = b2.corrente_nominale_A == null ? 1 : 0;
    if (ta !== tb) return ta - tb;
    return (a.corrente_nominale_A || 0) - (b2.corrente_nominale_A || 0);
  });

  return out.slice(0, 10);
}

const ORDINE_PROBABILITA = { Alta: 1, Media: 2, Bassa: 3 };

/**
 * Versione sincrona: la banca è un file, quindi non c'è niente da
 * attendere. Serve all'orchestratore, i cui passi girano dentro una
 * catena di Promise già avviata e non possono mettersi in attesa.
 * Le versioni async restano per non cambiare l'interfaccia pubblica.
 */
function cercaGuastiSync(sintomo, famiglia) {
  const b = caricaBanca();
  let out = b.guasti.slice();

  if (famiglia) {
    const f = String(famiglia).toUpperCase();
    // I guasti d'impianto valgono sempre: non appartengono a un apparecchio.
    out = out.filter(function (g) { return g.famiglia === f || g.famiglia === 'IMPIANTO'; });
  }

  if (sintomo) {
    out = out.map(function (g) {
      const campi = [g.sintomo, g.causa_probabile, g.verifica].join(' ');
      return { g: g, p: punteggioTesto(campi, sintomo) };
    }).filter(function (x) { return x.p > 0; })
      .sort(function (a, b2) {
        if (b2.p !== a.p) return b2.p - a.p;
        return (ORDINE_PROBABILITA[a.g.probabilita] || 2) - (ORDINE_PROBABILITA[b2.g.probabilita] || 2);
      })
      .map(function (x) { return x.g; });
  } else {
    out.sort(function (a, b2) {
      return (ORDINE_PROBABILITA[a.probabilita] || 2) - (ORDINE_PROBABILITA[b2.probabilita] || 2);
    });
  }

  return out.slice(0, 8);
}

async function cercaGuasti(sintomo, famiglia) {
  return cercaGuastiSync(sintomo, famiglia);
}

function getMisureAtteseSync(famiglia, parametro) {
  return _misure(famiglia, parametro);
}

function _misure(famiglia, parametro) {
  const b = caricaBanca();
  const f = String(famiglia || '').toUpperCase();
  let out = b.misure_attese.filter(function (m) {
    const mf = String(m.famiglia || '').toUpperCase();
    return !f || mf === f || mf.indexOf(f) >= 0 || f.indexOf(mf) >= 0;
  });

  // Un valore d'impianto vale per qualunque famiglia: la soglia di
  // isolamento è la stessa su un motore e su un circuito prese.
  if (f && f !== 'IMPIANTO') {
    const impianto = b.misure_attese.filter(function (m) { return m.famiglia === 'IMPIANTO'; });
    out = out.concat(impianto);
  }

  if (parametro) {
    const p = normalizza(parametro);
    out = out.filter(function (m) { return normalizza(m.parametro).indexOf(p) >= 0; });
  }

  out.sort(function (a, b2) { return String(a.parametro).localeCompare(String(b2.parametro)); });
  return out.slice(0, 10);
}

async function getMisureAttese(famiglia, parametro) {
  return _misure(famiglia, parametro);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

async function initDeviceDB() {
  const b = caricaBanca();
  const c = b.copertura || {};
  if (!b.dispositivi.length) {
    console.warn('[DEVICE KB] banca vuota — genera con: node knowledge/build_dispositivi.js');
    return;
  }
  console.log('[DEVICE KB] ' + c.dispositivi + ' dispositivi · ' + c.guasti +
    ' guasti · ' + c.misure_attese + ' valori di riferimento · ' +
    c.famiglie + ' famiglie · ' + (b.lacune || []).length + ' lacune dichiarate ✓');
}

// ─── CONTESTO TECNICO COMPLETO ────────────────────────────────────────────────

async function getContestoTecnico(messaggio) {
  const famiglia = rileveFamigliaInTesto(messaggio);
  const sintomi  = rilevaSintomoDalTesto(messaggio);
  const sintomoStr = sintomi.join(' ');

  const [dispositivi, guasti, misure] = await Promise.all([
    cercaDispositivo({ famiglia }),
    cercaGuasti(sintomoStr || String(messaggio || '').slice(0, 80), famiglia),
    famiglia ? getMisureAttese(famiglia) : getMisureAttese('IMPIANTO')
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

  if (contesto.dispositivi && contesto.dispositivi.length) {
    const conTarga = contesto.dispositivi.filter(function (d) { return d.corrente_nominale_A != null; });
    if (conTarga.length) {
      lines.push('', 'APPARECCHI DI QUESTA FAMIGLIA:');
      for (const d of conTarga.slice(0, 4)) {
        const targa = [
          d.corrente_nominale_A != null ? d.corrente_nominale_A + 'A' : null,
          d.corrente_differenziale_mA != null ? d.corrente_differenziale_mA + 'mA' : null,
          d.tipo_differenziale ? 'tipo ' + d.tipo_differenziale : null,
          d.potere_interruzione_kA != null ? d.potere_interruzione_kA + 'kA' : null
        ].filter(Boolean).join(' · ');
        lines.push(`• ${d.nome}${targa ? ' — ' + targa : ''}`);
        if (d.applicazione) lines.push(`  Uso: ${d.applicazione}`);
        if (d.note_normative) lines.push(`  Norma: ${d.note_normative}`);
      }
    }
  }

  if (contesto.guasti && contesto.guasti.length) {
    lines.push('', 'GUASTI NOTI (ordinati per probabilità):');
    for (const g of contesto.guasti.slice(0, 5)) {
      lines.push(`• [${g.probabilita}] ${g.sintomo}`);
      lines.push(`  Causa: ${g.causa_probabile}`);
      if (g.verifica && !/non specificata/.test(g.verifica)) lines.push(`  Verifica: ${g.verifica}`);
      const strumento = g.strumento && !/non specificato/.test(g.strumento) ? g.strumento : null;
      const atteso = g.valore_atteso && !/non specificato/.test(g.valore_atteso) ? g.valore_atteso : null;
      if (strumento || atteso) {
        lines.push(`  ${strumento ? 'Strumento: ' + strumento : ''}${strumento && atteso ? ' — ' : ''}${atteso ? 'Atteso: ' + atteso : ''}`);
      }
      if (g.rischio) lines.push(`  Attenzione: ${g.rischio}`);
      if (g.riferimento_norma) lines.push(`  Norma: ${g.riferimento_norma}`);
    }
  }

  if (contesto.misure && contesto.misure.length) {
    lines.push('', 'VALORI DI RIFERIMENTO:');
    for (const m of contesto.misure.slice(0, 6)) {
      let range;
      if (m.valore_nominale != null) range = `${m.valore_nominale} ${m.unita || ''} nominale`;
      else if (m.valore_minimo != null && m.valore_massimo != null) range = `${m.valore_minimo}÷${m.valore_massimo} ${m.unita || ''}`;
      else if (m.valore_minimo != null) range = `≥${m.valore_minimo} ${m.unita || ''}`;
      else if (m.valore_massimo != null) range = `≤${m.valore_massimo} ${m.unita || ''}`;
      else range = `— ${m.unita || ''}`;
      const rif = m.riferimento ? ` [${m.riferimento}]` : '';
      lines.push(`• ${m.parametro}: ${range.trim()}${m.condizione ? ' — ' + m.condizione : ''}${rif}`);
    }
  }

  return lines.join('\n');
}

// ─── COSA SA E COSA NON SA ────────────────────────────────────────────────────

function copertura() {
  return caricaBanca().copertura || {};
}

function lacune() {
  return caricaBanca().lacune || [];
}

module.exports = {
  initDeviceDB,
  cercaDispositivo,
  cercaGuasti,
  getMisureAttese,
  getContestoTecnico,
  formattaContestoPerPrompt,
  copertura,
  lacune,
  cercaGuastiSync,
  getMisureAtteseSync,
  rileveFamigliaInTesto,
  rilevaSintomoDalTesto
};
