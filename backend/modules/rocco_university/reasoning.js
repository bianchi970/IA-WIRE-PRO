/**
 * ROCCO UNIVERSITY — Motore di Ragionamento
 * Schema logico obbligatorio + Diagnosi Numerica
 */

/**
 * SCHEMA DI RAGIONAMENTO TECNICO
 * Ogni risposta tecnica di ROCCO segue questo schema:
 * OSSERVAZIONI → INTERPRETAZIONE → IPOTESI → VERIFICHE → CONCLUSIONE
 */

/**
 * Costruisce una risposta tecnica strutturata
 * @param {object} dati - Dati grezzi della situazione
 * @returns {object} - Risposta strutturata
 */
function strutturareRispostaTecnica(dati) {
  return {
    OSSERVAZIONI: dati.osservazioni || [],
    IPOTESI: dati.ipotesi || [],
    VERIFICHE_CONSIGLIATE: dati.verifiche || [],
    RISCHI_POTENZIALI: dati.rischi || [],
    FORMULE_USATE: dati.formule || [],
    CONFRONTO_NUMERICO: dati.confronto || null
  };
}

/**
 * SCHEMA DIAGNOSI NUMERICA
 * misura → formula → valore_atteso → confronto → anomalia → ipotesi_guasto
 */
function diagnosiNumerica({ misura, valore_misurato, valore_atteso, tolleranza_percent = 10 }) {
  if (!misura || valore_misurato === undefined || valore_atteso === undefined) {
    return { errore: 'Dati insufficienti: richiesti misura, valore_misurato, valore_atteso' };
  }

  const scarto = Math.abs(valore_misurato - valore_atteso);
  const scarto_percent = (scarto / valore_atteso) * 100;
  const anomalia = scarto_percent > tolleranza_percent;

  let stato, valutazione, ipotesi_guasto;

  if (!anomalia) {
    stato = 'OK';
    valutazione = `Valore nella norma (scarto ${scarto_percent.toFixed(1)}% < ${tolleranza_percent}%)`;
    ipotesi_guasto = null;
  } else if (valore_misurato < valore_atteso * (1 - tolleranza_percent/100)) {
    stato = 'BASSO';
    valutazione = `Valore inferiore del ${scarto_percent.toFixed(1)}% rispetto al valore atteso`;
    ipotesi_guasto = ipotesiGustoPerValoreBasso(misura);
  } else {
    stato = 'ALTO';
    valutazione = `Valore superiore del ${scarto_percent.toFixed(1)}% rispetto al valore atteso`;
    ipotesi_guasto = ipotesiGustoPerValoreAlto(misura);
  }

  return {
    misura,
    valore_misurato,
    valore_atteso,
    tolleranza_percent,
    scarto,
    scarto_percent: parseFloat(scarto_percent.toFixed(2)),
    stato,
    anomalia,
    valutazione,
    ipotesi_guasto
  };
}

function ipotesiGustoPerValoreBasso(misura) {
  const mappa = {
    tensione: [
      'Caduta di tensione eccessiva sul cavo di alimentazione',
      'Contatti ossidati o allentati nel percorso',
      'Trasformatore sottodimensionato o in sovraccarico',
      'Regolatore di tensione difettoso'
    ],
    corrente: [
      'Carico parzialmente scollegato o circuito aperto',
      'Contatto difettoso in serie al circuito',
      'Fusibile parzialmente interrotto (resistenza elevata)',
      'Motore in marcia a vuoto o con carico ridotto'
    ],
    resistenza_isolamento: [
      'Isolamento parzialmente degradato (umidità, surriscaldamento)',
      'Corrente di dispersione verso terra',
      'Inizio di guasto a terra'
    ],
    temperatura: [
      'Sistema di raffreddamento efficiente',
      'Carico inferiore al nominale',
      'Sensore di temperatura non calibrato (lettura bassa)'
    ],
    velocita_motore: [
      'Sovraccarico meccanico che riduce la velocità',
      'Tensione di alimentazione bassa',
      'Frequenza di rete ridotta (inverter)',
      'Guasto parziale avvolgimento'
    ]
  };
  return mappa[misura] || ['Verificare causa del valore basso anomalo'];
}

function ipotesiGustoPerValoreAlto(misura) {
  const mappa = {
    tensione: [
      'Regolazione tensione fuori tolleranza (trasformatore)',
      'Compensazione reattiva eccessiva',
      'Carico ridotto con tensione non regolata'
    ],
    corrente: [
      'Sovraccarico del carico (resistenza meccanica elevata)',
      'Cortocircuito parziale o dispersione verso terra',
      'Avvolgimento in corto parziale (motore)',
      'Armoniche elevate (carico non lineare)'
    ],
    resistenza: [
      'Ossidazione o corrosione dei contatti',
      'Connessione allentata (resistenza di contatto)',
      'Cavo danneggiato o sezione ridotta',
      'Temperatura elevata del conduttore'
    ],
    temperatura: [
      'Sovraccarico termico',
      'Ventilazione insufficiente',
      'Cuscinetti deteriorati (attrito)',
      'Perdite nel ferro elevate (trasformatore)',
      'Raddrizzamento anormale (motore)'
    ],
    corrente_dispersione: [
      'Isolamento danneggiato verso terra',
      'Infiltrazione di umidità',
      'Cavo in pressione contro parti metalliche',
      'Componente elettronico difettoso'
    ]
  };
  return mappa[misura] || ['Verificare causa del valore alto anomalo'];
}

/**
 * Costruisce il prompt di sistema per ROCCO con schema di ragionamento
 * Da inserire nel system prompt del modello AI
 */
function getSystemPromptReasoning() {
  return `
## SCHEMA DI RAGIONAMENTO ROCCO (OBBLIGATORIO)

Per ogni risposta tecnica segui SEMPRE questo schema logico:

1. OSSERVAZIONI — Cosa è stato misurato/osservato
2. INTERPRETAZIONE — Cosa significano questi dati
3. IPOTESI — Possibili cause o spiegazioni ordinate per probabilità
4. VERIFICHE — Misure e controlli da eseguire per confermare
5. CONCLUSIONE — Diagnosi finale o passo successivo consigliato

## OUTPUT STRUTTURATO

Ogni risposta tecnica deve contenere:
- 🔍 OSSERVAZIONI
- 🧠 IPOTESI (con probabilità se possibile: Alta/Media/Bassa)
- 🔧 VERIFICHE CONSIGLIATE
- ⚠️ RISCHI POTENZIALI
- 📐 FORMULE USATE (se presenti, con calcolo numerico)
- 📊 CONFRONTO NUMERICO (se presente: valore misurato vs atteso)

## DIAGNOSI NUMERICA

Quando ricevi dati numerici:
MISURA ricevuta → applica FORMULA appropriata → calcola VALORE ATTESO
→ confronta con VALORE MISURATO → individua ANOMALIA → formula IPOTESI DI GUASTO

## REGOLE DI RAGIONAMENTO

- Mai concludere prima di aver elencato le ipotesi alternative
- Sempre quantificare lo scarto quando si dispone di dati numerici
- Ordinare le ipotesi per probabilità (dalla più probabile)
- Indicare sempre il rischio potenziale se non si interviene
- Citare la norma di riferimento quando pertinente (CEI, IEC, EN)
`;
}

module.exports = {
  strutturareRispostaTecnica,
  diagnosiNumerica,
  getSystemPromptReasoning
};
