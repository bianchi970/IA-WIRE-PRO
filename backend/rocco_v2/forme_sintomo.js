"use strict";

/**
 * LE FORME IN CUI UN GUASTO SI DICE — un posto solo.
 *
 * Un sintomo è due cose, e sono di natura diversa:
 *
 *   OGGETTO        che apparecchio è         differenziale, caldaia, motore
 *   COMPORTAMENTO  che cosa fa (o non fa)    scatta, non parte, produce meno
 *
 * Il difetto che questo modulo chiude è **di metodo**, non di una regex.
 * Il riconoscimento del sintomo viveva in due tabelle indipendenti, ognuna
 * con il proprio elenco di parole:
 *
 *  - `neural_simulator.RICONOSCIMENTO_SINTOMI` — 10 regole, ognuna una
 *    congiunzione di due indovinelli (`pattern` + `condizione`), e vinceva la
 *    prima che azzeccava entrambi;
 *  - `device_kb.rilevaSintomoDalTesto` — 9 `if` con un altro elenco.
 *
 * **Ogni buco stava in una lista e non nell'altra**: `device_kb` conosceva
 * "non resta su" e "ricade", il simulatore conosceva "intervi" e "fermo".
 * Aggiungere una forma significava riscriverla in dieci posti, e quasi
 * sempre si aggiungeva in uno.
 *
 * Peggio: nelle dieci regole le due colonne **non volevano dire la stessa
 * cosa in ogni riga**. Nella regola del surriscaldamento `pattern` era il
 * comportamento (cald|scald|brucia) e `condizione` era l'oggetto
 * (cavo|morsett|quadro) — esattamente al contrario di tutte le altre. Qui
 * ogni riga dichiara `oggetto` e `comportamenti`, e non c'è modo di
 * invertirli per distrazione.
 *
 * E il silenzio: `riconosciSintomo` tornava `null` senza dirlo a nessuno.
 * `cs.anomaly_type` restava `undefined` e **tre lettori** — il simulatore
 * causale, il distillatore, `suggerisciVerifica` — ricevevano il vuoto senza
 * protestare. Misurato sui 48 casi: 17 senza sintomo, di cui **6 italiani**,
 * e nessuno se ne era accorto perché un riconoscimento mancato non lascia
 * traccia. Per questo l'orchestratore ora registra `sintomo_non_riconosciuto`
 * e il banco lo conta.
 *
 * **Da dove vengono le parole.** Dal mestiere, non dalle 48 domande d'esame:
 * la regola decisa è che ROCCO non si addestra sul corpus. Tarare il
 * *linguaggio* su frasi vere è invece la pratica dichiarata di questo repo
 * (vedi KR-13 in CLAUDE.md), e la differenza è sostanziale: una classe di
 * comportamento — cessazione, riduzione, ripetizione — generalizza a tutti i
 * clienti che la diranno così; una regex che azzecca una domanda d'esame
 * no. Chi aggiunge una forma la aggiunga **qui**, e la misuri sul corpus.
 */

// ── I COMPORTAMENTI — che cosa fa l'impianto ───────────────────────────
//
// Le forme sono quelle che un cliente o un elettricista scrive davvero.
// `normalizza()` toglie gli accenti, quindi i pattern si scrivono senza.
var COMPORTAMENTI = {
  // Una protezione interviene. "non resta su" e "ricade" venivano da
  // device_kb, "intervi" dal simulatore: nessuna delle due liste le aveva
  // tutte.
  // Due forme ereditate dalla vecchia tabella e **sbagliate**, verificate
  // con una prova: `sare` (pensato per lo spagnolo) trovava "pen-sare" e
  // "u-sare"; `trip` senza confine di chiusura trovava "presa **trip**la".
  // È la famiglia di difetti delle sigle dentro le parole italiane — `DIN`
  // in "lampadina" — e qui costava uno scatto inventato su frasi comuni.
  // Lo spagnolo e il portoghese sono coperti da `dispar`.
  scatta: /scatt|\bsalt(a|o|are|ato|ata|ano|ava)\b|\btrip(s|ped|ping)?\b|intervi|non resta su|ricade|va giu|fa trac|fliegt|saute|dispar/,

  // Subito contro dopo un po': distingue le due chiavi del magnetotermico.
  subito: /subito|istantane|immediat|appena.*(accend|inseri|riarm|attacc)|non resta su|ricade|instantly|immediately|sofort|aussitot|inmediatamente/,
  dopo_tempo: /dopo.*(minut|poco|un po|tempo|ore|or[ae])|dopo \d+|a regime|sotto carico|quando scalda|after.*minut|nach.*minut|apres.*minut|despues de/,

  // CESSAZIONE — ha funzionato e ha smesso. Mancava in entrambe le liste:
  // "la lavatrice ha smesso di funzionare" non incontrava nessuna regola.
  cessa: /non funzion|ha smesso|smesso di|non va piu|non si accende piu|resta spent|e morto|non da piu|ha cessato|nicht funktionier|ne fonctionne|no funciona|not working|stopped working/,

  // ASSENZA — non c'è tensione, niente, buio.
  assente: /niente|nessuna tension|\bzero\b|assente|non c.? ?e|manca|senza (corrente|tension|luce)|\bbuio\b|no power|kein strom|pas de courant|sin corriente|sem energia/,

  non_parte: /non part|non avvia|non gir|\bfermo\b|bloccat|non si avvia|ne demarre|no arranca|nicht an/,

  // IN BLOCCO — l'apparecchio non si rompe: si mette in sicurezza da sé e
  // lo dichiara. È un comportamento suo, diverso dal non partire.
  in_blocco: /in blocco|va in blocco|\berrore\b|allarme|lampeggia|codice (errore|guasto)|si blocca|fault|stoerung/,

  // RESA INSUFFICIENTE — rende meno del dovuto, fino a non rendere niente.
  //
  // La vecchia condizione pretendeva `non.*produc`, che copre "non produce"
  // e **non** copre "produce il 30% in meno" — la forma con cui il
  // proprietario di un impianto racconta un calo. Scrivendo la classe mi era
  // capitato l'opposto: coperta la riduzione, perduta l'assenza di resa, che
  // è perfino la forma base del sintomo. Servono entrambe.
  //
  // `poco` da solo è di proposito escluso: "scatta dopo poco" è un tempo,
  // non una resa, e su un impianto fotovoltaico farebbe scegliere la chiave
  // sbagliata.
  riduce: /in meno|meno del|meno rispetto|\bcala\b|calat|\bcalo\b|rende meno|non produc|produc(e|ono)? ?(poco|meno)|rend(e|ono) poco|rendimento (bass|scars)|meno di prima|poca (resa|produzione)/,

  // RIPETIZIONE — ogni tanto, continuamente, a cicli.
  ripete: /intermit|va e viene|a volte|alcune volte|saltuari|ogni tanto|continuamente|\d+ ?cicli|ciclicament|si ripete|di tanto in tanto|a periodi|sometimes|parfois|manchmal|a veces/,

  // SPONTANEITÀ — succede senza che nessuno faccia niente.
  spontaneo: /da sol[eoia]|senza motivo|senza che nessuno|per conto suo|spontaneament|da se/,

  // CORRELAZIONE — succede quando faccio un'altra cosa.
  correlato: /quando (accend|part|us|attiv|inseri|colleg)|appena (accend|part|colleg)|se accendo|mentre (us|funzion|lavor)/,

  // `gradi` NON c'è, e l'ho provato: "il termostato è impostato a 21 ma in
  // casa ci sono 18 **gradi**" è una temperatura ambiente che manca, non un
  // componente che scalda. Su FORUM-SPEC-005 faceva classificare una caldaia
  // in corto-ciclo come surriscaldamento. `temperatura` resta, perché la
  // aveva già `device_kb` e perché è la parola delle verifiche della banca.
  // E `scalda` vuole il **confine di parola**: senza, matcha dentro
  // "**scalda**bagno" e "**scalda**cqua", che sono nomi di apparecchi e non
  // comportamenti. È lo stesso difetto delle sigle dentro le parole italiane
  // (`DIN` in "lampa**din**a") e dei nomi d'agente (`bruciatore` sul
  // participio `bruciato`), già corretti nel riconoscitore di componenti.
  // Misurato su FORUM-IT-013 — "lo **scaldabagno** da 10 anni fa saltare il
  // differenziale" — dove il racconto risultava di surriscaldamento senza
  // che nessuno avesse parlato di calore.
  // Contate nel corpus e nei 370 guasti della banca: `surriscald` 28,
  // `scalda` come comportamento **zero** — l'unica occorrenza è dentro
  // "scaldabagno". Il confine si tiene lo stesso, perché "il cavo scalda
  // troppo" è italiano vero che il corpus non ha ancora.
  surriscalda: /surriscald|\bcaldo\b|\bscalda\b|\bscaldano\b|bruciat|brucia|\bfuma\b|odore|fuso|\bnero\b|temperatura|burning|smell|etincelle|funke|quemado|heiss/,

  // Due rumori diversi, e la banca dispositivi li tiene separati perché
  // portano a guasti diversi: il ronzio continuo (lamierature, vibrazione)
  // e la botta secca (arco, scatto istantaneo). "rumore" sta di proposito in
  // **entrambe**: da sola quella parola non dice quale dei due sia, ed è la
  // stessa ambiguità che `device_kb` aveva già accettato.
  ronza: /ronza|ronzio|vibra|vibrazi|fischia|rumore/,
  botta: /botta|schiocco|scoppio|\bbotto\b|rumore/,
  umido: /umidit|pioggia|piogge|piov|bagnat|infiltr|condensa|allagat/,
  dispersione: /dispersion|perdita verso terra|isolament/,
  cortocircuito: /cortocircuito|\bcorto\b/,
  sovraccarico: /sovraccarico|sovra.?carico/
};

// ── GLI OGGETTI — che apparecchio è ───────────────────────────────────
//
// I confini di parola sono obbligatori: una sigla di due o tre lettere
// cercata come sottostringa si trova dentro le parole italiane (`DIN` in
// "lampadina", `TA` in "salta"). È il difetto già corretto nel
// riconoscitore di componenti, e vale qui allo stesso modo.
//
// `MTD` — magnetotermico differenziale — **non esisteva in nessun elenco
// del progetto**, ed è la sigla che un italiano scrive. Su FORUM-IT-011
// ("il MTD della mia casa di campagna scatta") il comportamento era
// riconosciuto e l'oggetto no, quindi il sintomo si perdeva.
// Un MTD protegge da entrambe le cose, e il fenomeno di quel caso è lo
// scatto differenziale: sta qui, con il differenziale.
//
// `MT` di proposito **non** c'è: in elettrotecnica è la media tensione.
var OGGETTI = {
  differenziale: /differenziale|salvavita|\brcd\b|\bmtd\b|\brcbo\b|\bid\b|fi.schalter|disjoncteur|diferential/,
  magnetotermico: /magnetotermico|\bmcb\b|interruttor|automatico|breaker|sicherung|disyuntor|disjuntor|\bfusibil/,
  motore: /motore|pompa|compressore|ventilator|\bmotor\b/,
  caldaia: /caldaia|boiler|scaldabagn|riscaldament|bruciator/,
  fotovoltaico: /fotovoltaic|solare|pannell|inverter|stringa|\bfv\b/,
  // Il punto dove un contatto scalda: è l'oggetto della regola del
  // surriscaldamento, che prima stava nella colonna sbagliata.
  connessione: /cavo|morsett|quadro|\bfilo\b|connession|giunzion|presa|capocorda|socket|prise|stecker/,
  impianto: /tensione|corrente|impianto|circuito|luce|luci|presa|prese|elettrodomestic/
};

// La negazione: un marcatore di comportamento dentro una negazione non
// afferma niente. Su FORUM-SPEC-003 — "i pannelli sembrano ok, **nessun
// errore** sull'inverter" — la parola "errore" faceva classificare il
// fenomeno come *apparecchio in blocco*, e da lì la banca pescava tre
// guasti d'inverter: cioè esattamente quello che il cliente aveva escluso.
var negazione = require("./negazione");

function normalizza(testo) {
  return String(testo == null ? "" : testo).toLowerCase()
    .replace(/[àáâãä]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u");
}

/** Le classi di comportamento AFFERMATE nel testo. */
function comportamenti(testo) {
  var t = normalizza(testo);
  var out = [];
  Object.keys(COMPORTAMENTI).forEach(function (k) {
    if (negazione.hasUnnegatedMatch(t, COMPORTAMENTI[k])) out.push(k);
  });
  return out;
}

/** Le classi di oggetto nominate (non negate) nel testo. */
function oggetti(testo) {
  var t = normalizza(testo);
  var out = [];
  Object.keys(OGGETTI).forEach(function (k) {
    if (negazione.hasUnnegatedMatch(t, OGGETTI[k])) out.push(k);
  });
  return out;
}

function haComportamento(testo, classe) {
  var re = COMPORTAMENTI[classe];
  return !!re && negazione.hasUnnegatedMatch(normalizza(testo), re);
}

// L'oggetto segue la stessa regola: "inverter **senza** trasformatore" non
// nomina un trasformatore.
function haOggetto(testo, classe) {
  var re = OGGETTI[classe];
  return !!re && negazione.hasUnnegatedMatch(normalizza(testo), re);
}

module.exports = {
  COMPORTAMENTI: COMPORTAMENTI,
  OGGETTI: OGGETTI,
  normalizza: normalizza,
  comportamenti: comportamenti,
  oggetti: oggetti,
  haComportamento: haComportamento,
  haOggetto: haOggetto
};
