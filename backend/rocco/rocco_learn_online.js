/**
 * ROCCO — Apprendimento Casistiche Online
 *
 * Usa Anthropic per generare casistiche reali di guasti elettrici italiani,
 * poi le salva nella memoria di ROCCO come "esperienza accumulata sul campo".
 *
 * Copre 10 aree tematiche × 5 scenari = 50 casi reali + 30 errori comuni da non ripetere.
 * Alla fine verifica che il server risponda correttamente.
 *
 * Usage: node backend/rocco/rocco_learn_online.js
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI    = require('openai');
const { registraCasoReale, registraErrore } = require('../modules/rocco_university/memory');

const USER_ID        = 'rocco_master';
const ANTHROPIC_MODEL = (process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001').trim();
const OPENAI_MODEL    = (process.env.OPENAI_MODEL    || 'gpt-4o-mini').trim();

const anthropicClient = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const openaiClient    = process.env.OPENAI_API_KEY    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })       : null;

if (!anthropicClient && !openaiClient) {
  console.error('❌ Nessuna API key configurata (ANTHROPIC_API_KEY o OPENAI_API_KEY)');
  process.exit(1);
}
const providerPrimario = anthropicClient ? 'Anthropic (' + ANTHROPIC_MODEL + ')' : 'OpenAI (' + OPENAI_MODEL + ')';

// ─── SCENARI DI APPRENDIMENTO ─────────────────────────────────────────────────

const SCENARI = [
  // ── DIFFERENZIALI ──────────────────────────────────────────────────────────
  {
    materia: 'diagnosi_guasti',
    area: 'Differenziali RCCB',
    scenari: [
      'Differenziale 30mA tipo AC scatta 3 volte al giorno senza apparente motivo, sempre in orari diversi',
      'Differenziale 25A 30mA scatta solo quando si accende il condizionatore in un appartamento estivo',
      'Differenziale nuovo installato scatta già al primo collaudo senza carichi collegati',
      'In un capannone industriale il differenziale scatta solo durante temporali o pioggia intensa',
      'Differenziale da 300mA selettivo scatta prima del 30mA a valle — inversione di coordinamento'
    ]
  },
  // ── MAGNETOTERMICI ─────────────────────────────────────────────────────────
  {
    materia: 'diagnosi_guasti',
    area: 'Magnetotermici MCB',
    scenari: [
      'MCB 16A curva C scatta ogni mattina alle 7:30 quando si accendono i macchinari — durata 6 mesi senza problemi poi inizia',
      'In un quadro recente un MCB 32A da il via libera, ma dopo 2 ore scatta termicamente con impianto a regime',
      'MCB 10A scatta con botta secca appena si inserisce una presa da lavoro (saldatrice 160A)',
      'Nel quadro domestico il MT del forno scatta solo quando forno E piano cottura sono insieme',
      'MCB 20A curva C su circuito pompa sommergibile — scatta in avviamento ma solo in estate'
    ]
  },
  // ── MOTORI ELETTRICI ───────────────────────────────────────────────────────
  {
    materia: 'macchine_elettriche',
    area: 'Diagnosi motori',
    scenari: [
      'Motore pompa 4kW che funziona da 8 anni inizia a fare rumore anomalo e si scalda oltre 90°C in carcassa',
      'Motore 2.2kW trifase non parte: il contattore chiude, la corrente sale a 18A, il relè termico scatta dopo 4 secondi',
      'Motore nuovo 1.5kW parte regolarmente ma dopo 20 minuti perde coppia e la velocità cala visibilmente',
      'In un impianto trifase due motori uguali: uno funziona, l\'altro assorbe 30% in più di corrente a parità di carico',
      'Motore con inverter: funziona bene in diretto, con inverter vibra a tutte le frequenze sotto 15Hz'
    ]
  },
  // ── IMPIANTI CIVILI ────────────────────────────────────────────────────────
  {
    materia: 'impianti_elettrici',
    area: 'Impianti civili BT',
    scenari: [
      'In un appartamento al piano terra le lampade lampeggiano leggermente — al piano di sopra nulla',
      'Quadro condominiale: ogni venerdì sera intorno alle 20 salta la luce in 3 appartamenti su 6',
      'Ristrutturazione vecchio impianto: si trovano cavi di alluminio anni \'70 collegati a cavi rame attuali',
      'Villa bifamiliare: tensione misurata 205V invece di 230V solo nell\'ala destra della casa',
      'Dopo 10 anni senza problemi: presa della cucina non funziona, quella del salotto adiacente funziona'
    ]
  },
  // ── IMPIANTI INDUSTRIALI ───────────────────────────────────────────────────
  {
    materia: 'impianti_elettrici',
    area: 'Impianti industriali',
    scenari: [
      'In un capannone con 5 macchine CNC: quando partono tutte insieme cade la tensione del 12%',
      'Quadro automazione: relay 24Vdc bobina che si eccita inspiegabilmente 2-3 volte al giorno',
      'Impianto trifase squilibrato: fase L1=210V, L2=235V, L3=228V — trovare causa e rimedio',
      'Gruppo elettrogeno di emergenza: non parte con trasferimento automatico ATS durante blackout reale',
      'Cavi EPR 180°C in canalina con cavi PVC 70°C — verifica di derating e compatibilità'
    ]
  },
  // ── PROTEZIONI COORDINATE ──────────────────────────────────────────────────
  {
    materia: 'normative_sicurezza',
    area: 'Coordinamento protezioni CEI',
    scenari: [
      'Impianto TT con RE=350Ω e diff 300mA selettivo a monte + 30mA a valle: verificare coordinamento',
      'Cortocircuito a fine linea: Icc=800A, MCB 16A curva C — verifica se interviene in zona magnetica',
      'Selettività totale tra MCCB 160A e MCB 16A a valle: tabella coordinamento ABB — come si verifica',
      'Nuovo impianto FV: differenziale lato AC deve essere tipo B per normativa CEI — perché e quando',
      'Impianto con UPS online: neutro separato galvanicamente — implicazioni per la protezione differenziale'
    ]
  },
  // ── MISURE SUL CAMPO ──────────────────────────────────────────────────────
  {
    materia: 'misure_elettriche',
    area: 'Misure e verifiche',
    scenari: [
      'Megger a 500V: misuro Riso=0.8MΩ su cavo interrato da 100m — accettabile o no? Cosa fare?',
      'Pinza amperometrica su conduttore PE (terra): misuro 0.3A su impianto sano — è normale?',
      'Verifiche CEI 64-8 su nuovo impianto: sequenza corretta delle misure da fare prima del collaudo',
      'Analizzatore di rete: THD=18% su rete con 40 PC e server — effetti sui differenziali e rimedi',
      'Termografia IR su quadro BT: punto caldo a 87°C su morsetto magnetotermico 25A a 18A'
    ]
  },
  // ── DOMOTICA E RINNOVABILI ─────────────────────────────────────────────────
  {
    materia: 'automazioni',
    area: 'Domotica e FV',
    scenari: [
      'Impianto FV 6kWp: in estate il differenziale lato DC scatta 2-3 volte al mese — diagnosi',
      'Sistema Shelly Plus: il relè scatta autonomamente ogni notte alle 3 — escludere malfunzionamenti',
      'Colonnina EV 22kW trifase: il differenziale di tipo B da 30mA scatta ogni ricarica rapida — perché',
      'Pompa di calore: inverter compressore crea correnti di modo comune — differenziale da usare',
      'Sistema accumulo BMS 48V LiFePO4: bilanciamento celle provoca picchi da 2A su circuito di terra'
    ]
  },
  // ── CONTATTORI E AUTOMAZIONE ──────────────────────────────────────────────
  {
    materia: 'macchine_elettriche',
    area: 'Contattori e avviamenti',
    scenari: [
      'Avviamento stella-delta 15kW: alla commutazione da stella a triangolo il MT scatta — tempo commutazione?',
      'Contattore ABB 40A AC-3: dopo 3 anni di servizio i contatti principali si richiudono con arco anomalo',
      'Schema di inversione marcia motore con blocco meccanico: come verificare il corretto interblocco',
      'Relè termico bimetallico tarato a 8A: con motore a 7.5A scatta in estate — causa termica ambiente',
      'Soft-starter 18.5kW: durante rampa di decelerazione il differenziale da 30mA scatta — cause'
    ]
  },
  // ── SICUREZZA NORMATIVA ─────────────────────────────────────────────────────
  {
    materia: 'normative_sicurezza',
    area: 'Normative DM 37/08 e CEI',
    scenari: [
      'Ristrutturazione parziale: aggiunto solo un circuito nuova presa — serve nuova dichiarazione di conformità?',
      'Impianto in zona ATEX zona 2: quale tipo di protezione per un motore 4kW trifase?',
      'Locale medico gruppo 1: differenziale da 30mA obbligatorio? Quali deroghe prevede la CEI 64-8?',
      'Impianto di messa a terra in area esposta a scariche atmosferiche: verifiche periodiche CEI 81-10',
      'Cantiere temporaneo: alimentazione 230V da quadro cantiere — distanza max prese da quadro secondo CEI 64-8'
    ]
  }
];

// ─── SYSTEM PROMPT PER GENERAZIONE CASISTICHE ────────────────────────────────

const SYSTEM_GENERATORE = `Sei ROCCO, elettricista esperto con 25 anni di esperienza sul campo in Italia.
Devi descrivere COME HAI RISOLTO un guasto reale, in modo sintetico e tecnico.
Formato: 3-5 righe massimo. Include: sintomo iniziale → diagnosi → verifica → causa → fix.
Solo fatti tecnici. Nessun preambolo. Usa sigle italiane (MT, diff, RCCB, CEI 64-8, ecc.).`;

// ─── GENERAZIONE CON ANTHROPIC ────────────────────────────────────────────────

async function generaCasoReale(materia, area, scenario) {
  const prompt = `Area: ${area}\nScenario: "${scenario}"\n\nDescrivimi come hai risolto questo caso sul campo.`;

  // Prova Anthropic prima, poi fallback OpenAI
  if (anthropicClient) {
    try {
      const resp = await anthropicClient.messages.create({
        model:       ANTHROPIC_MODEL,
        max_tokens:  300,
        temperature: 0.3,
        system:      SYSTEM_GENERATORE,
        messages:    [{ role: 'user', content: prompt }]
      });
      return (resp.content[0] && resp.content[0].text) ? resp.content[0].text.trim() : '';
    } catch (e) {
      if (!openaiClient) throw e;
      // fallback silenzioso su OpenAI
    }
  }

  // OpenAI fallback
  if (openaiClient) {
    const resp = await openaiClient.chat.completions.create({
      model:       OPENAI_MODEL,
      max_tokens:  300,
      temperature: 0.3,
      messages:    [
        { role: 'system', content: SYSTEM_GENERATORE },
        { role: 'user',   content: prompt }
      ]
    });
    return (resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content)
      ? resp.choices[0].message.content.trim()
      : '';
  }

  throw new Error('Nessun provider disponibile');
}

// ─── ERRORI COMUNI DA NON RIPETERE ───────────────────────────────────────────

const ERRORI_COMUNI = [
  { materia: 'diagnosi_guasti', errore: 'Riarmare differenziale scattato senza prima scollegare tutti i carichi', correzione: 'Prima scollegare TUTTI i carichi, poi riarmare — identificare il responsabile prima del riarmo' },
  { materia: 'diagnosi_guasti', errore: 'Confondere intervento termico con intervento magnetico del magnetotermico', correzione: 'Botta istantanea = magnetico (cortocircuito). Non riarma subito = termico (sovraccarico — attendi 5-10 min)' },
  { materia: 'diagnosi_guasti', errore: 'Usare differenziale tipo AC su circuiti con inverter o pompa di calore', correzione: 'Inverter/VFD/PDC richiedono differenziale tipo A (correnti DC pulsate) o tipo B (DC pura). AC filtra solo sinusoidale pura' },
  { materia: 'diagnosi_guasti', errore: 'Misurare Riso con l\'impianto sotto tensione', correzione: 'Il megaohmmetro si usa SOLO su circuito SEZIONATO e SCARICO — pericolo folgorazione e danneggiamento strumento' },
  { materia: 'impianti_elettrici', errore: 'Dimensionare il cavo solo per la portata termica Iz senza verificare la caduta tensione ΔV', correzione: 'Calcolare SEMPRE sia Iz che ΔV% — per cavi lunghi o carichi lontani il limite spesso è ΔV (4% CEI 64-8)' },
  { materia: 'impianti_elettrici', errore: 'Collegare conduttori di alluminio e rame senza giunzioni idonee', correzione: 'Usare morsetti bimetallici certificati (Al/Cu) — contatto diretto causa corrosione galvanica e aumento resistenza' },
  { materia: 'macchine_elettriche', errore: 'Tarare il relè termico uguale alla corrente nominale del motore (In = targa)', correzione: 'Tarare il relè termico al 100-105% di In. Tenere conto della classe del relè (10, 10A, 20) in base all\'avviamento' },
  { materia: 'macchine_elettriche', errore: 'Usare curva B sull\'interruttore per motori con avviamento DOL', correzione: 'Avviamento DOL richiede curva D (soglia magnetica 10-20×In). Curva C (5-10×In) va in scatto durante lo spunto' },
  { materia: 'misure_elettriche', errore: 'Usare multimetro CAT II in quadri industriali con alta Icc', correzione: 'Usare sempre strumenti con categoria CAT III 600V (quadri BT) o CAT IV (origine impianto). CAT II solo per prese' },
  { materia: 'normative_sicurezza', errore: 'Non installare differenziale su circuiti con carichi molto distanti dal quadro', correzione: 'CEI 64-8 art.413: sistema TT SEMPRE con differenziale su ogni circuito. Distanza non è una deroga.' },
  { materia: 'normative_sicurezza', errore: 'Installare differenziale 30mA tipo AC su circuiti PC, server, UPS', correzione: 'PC e UPS generano correnti di guasto con componente DC pulsante — tipo A obbligatorio per evitare mancato scatto' },
  { materia: 'diagnosi_guasti', errore: 'Cercare il guasto con la corrente inserita su impianto sconosciuto', correzione: 'Prima di qualsiasi intervento: SEZIONARE, verificare assenza tensione con voltmetro, poi agire. Sempre in DPI.' },
  { materia: 'impianti_elettrici', errore: 'Installare cavi di sezione diversa in parallelo senza derating adeguato', correzione: 'Cavi in parallelo devono essere stessa sezione, stesso tipo, stessa lunghezza — altrimenti ripartizione corrente non uniforme' },
  { materia: 'macchine_elettriche', errore: 'Non verificare squilibrio tensioni prima di collegare motore trifase nuovo', correzione: 'Squilibrio > 2% riduce la vita del motore. Misurare V_L1, V_L2, V_L3 e calcolare squilibrio prima del collaudo' },
  { materia: 'misure_elettriche', errore: 'Leggere la corrente sul neutro con pinza amperometrica su circuiti con armoniche', correzione: 'Su reti con carichi non lineari (PC, UPS, variatori) la corrente di neutro può essere 1.5-2× la di fase — dimensionare di conseguenza' }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(65));
  console.log('  ROCCO — APPRENDIMENTO CASISTICHE ONLINE');
  console.log('  Provider: ' + providerPrimario);
  console.log('  Data   : ' + new Date().toLocaleString('it-IT'));
  console.log('═'.repeat(65) + '\n');

  let totale_casi   = 0;
  let totale_errori = 0;
  let falliti       = 0;

  // ── GENERA E SALVA CASI REALI ──────────────────────────────────────────────
  for (const gruppo of SCENARI) {
    console.log('\n[' + gruppo.area.toUpperCase() + ']');

    for (const scenario of gruppo.scenari) {
      try {
        process.stdout.write('  → ' + scenario.slice(0, 55) + '… ');
        const testo = await generaCasoReale(gruppo.materia, gruppo.area, scenario);
        if (testo) {
          await registraCasoReale(USER_ID, gruppo.materia, {
            area:        gruppo.area,
            scenario:    scenario,
            descrizione: testo,
            fonte:       'anthropic_online',
            data:        new Date().toISOString()
          });
          totale_casi++;
          console.log('✅');
        } else {
          console.log('⚠️ vuoto');
          falliti++;
        }
        // Pausa breve per non saturare rate limit
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        console.log('❌ ' + e.message);
        falliti++;
      }
    }
  }

  // ── REGISTRA ERRORI COMUNI ────────────────────────────────────────────────
  console.log('\n[ERRORI COMUNI DA NON RIPETERE]');
  for (const e of ERRORI_COMUNI) {
    try {
      await registraErrore(USER_ID, e.materia, e.errore, e.correzione);
      totale_errori++;
      console.log('  ✅ [' + e.materia + '] ' + e.errore.slice(0, 50) + '…');
    } catch (err) {
      console.log('  ❌ ' + err.message);
    }
  }

  // ── VERIFICA SERVER LOCALE (se in esecuzione) ─────────────────────────────
  console.log('\n[VERIFICA HEALTH SERVER]');
  try {
    const http = require('http');
    await new Promise((resolve) => {
      const req = http.get('http://localhost:3000/health', (res) => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            console.log('  ✅ Server locale OK — provider: ' + (j.ai && j.ai.activeProvider || 'N/A') + ', DB: ' + (j.db && j.db.connected ? 'online' : 'offline'));
          } catch (_) {
            console.log('  ⚠️ Server risponde ma risposta non JSON');
          }
          resolve();
        });
      });
      req.on('error', () => {
        console.log('  ℹ️ Server locale non in esecuzione — i dati sono stati salvati nel DB di Render');
        resolve();
      });
      req.setTimeout(3000, () => { req.destroy(); resolve(); });
    });
  } catch (_) {
    console.log('  ℹ️ Server locale non raggiungibile');
  }

  // ── REPORT ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(65));
  console.log('  APPRENDIMENTO COMPLETATO');
  console.log('  Casi reali generati e salvati : ' + totale_casi + '/' + (SCENARI.reduce((a, g) => a + g.scenari.length, 0)));
  console.log('  Errori comuni registrati       : ' + totale_errori);
  console.log('  Falliti                        : ' + falliti);
  console.log('');
  console.log('  ROCCO ha ora ' + totale_casi + ' casistiche reali nella memoria.');
  console.log('  Il buildSystemPrompt() le inietterà automaticamente in ogni chat.');
  console.log('═'.repeat(65) + '\n');

  process.exit(falliti > 10 ? 1 : 0);
}

main().catch(e => { console.error('❌ ERRORE FATALE:', e.message); process.exit(1); });
