"use strict";

/**
 * BANCO DI PROVA DI ROCCO
 *
 *   cd backend && node bench/rocco_bench.js
 *
 * Un comando, una pagella. Misura sulle domande reali di
 * `rocco_v2/neural/casi_reali_forum.js` le cinque cose che dicono se ROCCO
 * serve a un elettricista, confronta con la linea di base registrata, e
 * **esce con errore se una metrica peggiora**.
 *
 * Perché esiste: fino a ieri ogni numero di qualità veniva da misure che
 * scrivevo a mano, una per blocco, e che sparivano col blocco. Senza una
 * pagella stabile non si vede né un miglioramento né una regressione, e con
 * un corpus di 21 casi il rischio vero non è sbagliare una regola: è tararla
 * su 21 esempi senza accorgersene.
 *
 * Le linee di base sono i numeri misurati al 2026-10-10, dopo i blocchi
 * multi-turn, certezza, pertinenza, senso delle parole e vocabolario.
 * **Si alzano quando una misura le supera, non si abbassano per far passare
 * una modifica.** Se una scende, è una regressione: va spiegata, non
 * riscritta.
 *
 * Nota sul metro: `coerente()` è un confronto lessicale largo fra
 * l'etichetta dell'ipotesi e la causa reale del caso. Non giudica la
 * correttezza di una singola ipotesi — serve a confrontare prima e dopo
 * sullo stesso metro. Un numero che sale è un miglioramento relativo, non
 * una percentuale di diagnosi corrette.
 */

process.env.ROCCO_NARRATOR = process.env.ROCCO_NARRATOR || "0";
// La pagella misura ROCCO da solo: nessuna chiamata a un modello remoto.
// Girava con i provider attivi e ROCCO consultava l'IA in 18 casi su 21,
// quindi il numero finale dipendeva dal modello, dal giorno e dalla rete.
process.env.ROCCO_NO_PROVIDER = process.env.ROCCO_NO_PROVIDER || "1";
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });

var fs = require("fs");
var path = require("path");

// ── Riproducibilità ───────────────────────────────────────────────────
//
// Qui il banco sostituiva `Math.random` con un PRNG a seme fisso, perché il
// motore era non deterministico: `neural_core.js` inizializzava i pesi della
// rete a caso e `neural_patterns.js` generava a caso i suoi esempi di
// addestramento. Due corse di fila davano 10 e 11 casi conclusi.
//
// Quel trucco è stato rimosso perché il difetto è stato corretto alla
// radice: la casualità del neurale ora viene da `nc.rnd()`, con seme fisso e
// `nc.setSeed()` per variarlo deliberatamente. Il banco misura il motore
// come gira in produzione, senza manometterlo — che è l'unico modo perché i
// numeri vogliano dire qualcosa.

// ── Isolamento dello stato appreso ────────────────────────────────────
//
// Durante una diagnosi ROCCO scrive quello che impara in
// `data/neural/*.json` e `data/rocco-v2-memory.json`. In un banco di prova
// questo falsa tutto due volte: il caso N+1 viene misurato su un motore che
// ha già visto il caso N, e la corsa lascia lo stato sporco per la
// produzione. Misurato: senza isolamento la stessa metrica dava 14 o 15 su
// 21 a seconda dell'ordine.
//
// Qui lo stato viene fotografato all'avvio, ripristinato **prima di ogni
// caso** — così ogni caso è misurato sullo stesso motore — e rimesso come
// era alla fine.
//
// ── E si misura dallo stato DICHIARATO, non da quello accumulato ──
//
// Non bastava fotografare: la fotografia ritraeva *questa* macchina. Lo
// stato appreso (pesi, embedding, episodi, grafo) cresce a ogni diagnosi,
// quindi due computer — o lo stesso computer a due settimane di distanza —
// davano due pagelle diverse per lo stesso codice. È la non-determinatezza
// per cui il banco è stato costruito, rientrata da un'altra porta.
//
// Una pagella deve misurare il **codice**, non quanti guasti ha visto chi
// la lancia. Quindi: il seed di conoscenza resta (è versionato), i file
// accumulati vengono messi da parte per tutta la corsa e rimessi esattamente
// come erano alla fine. Nessun dato dell'utente viene perso — verificato
// confrontando gli md5 prima e dopo.
//
// Nota storica, perché il numero in fondo è cambiato due volte in un
// giorno: fino all'11/10 l'avvio del neurale ingeriva tutto
// `casi_reali_forum.js` **con le `causa_reale`**, cioè l'elenco delle
// risposte di questo stesso esame — e la scuola veniva saltata appena
// esistevano dei pesi. Le due cose insieme facevano sembrare che lo stato
// appreso "costasse". Ora il corpus è solo esame e la scuola si rifà a ogni
// avvio: i numeri qui sotto sono i primi non contaminati.
var DIR_DATA = path.join(__dirname, "..", "data");
var DIR_NEURAL = path.join(DIR_DATA, "neural");

// Seed: conoscenza scritta a mano, non accumulata. `simulator_state.json` ha
// per chiavi i sintomi in italiano e per valori le cause, con probabilità,
// verifica ed esclusioni: è curriculum, non esperienza.
var SEED = ["simulator_state.json"];

function elencaStato() {
  var out = [];
  [DIR_DATA, DIR_NEURAL].forEach(function (d) {
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).forEach(function (f) {
      if (!/\.json$/.test(f)) return;
      if (f === "encyclopedia.json") return;        // dato di conoscenza, non stato
      var p = path.join(d, f);
      if (fs.statSync(p).isFile()) out.push(p);
    });
  });
  return out;
}

// Lo stato accumulato viene messo da parte in memoria per tutta la corsa.
var ACCANTONATO = {};
elencaStato().forEach(function (p) {
  if (SEED.indexOf(path.basename(p)) >= 0) return;
  try {
    ACCANTONATO[p] = fs.readFileSync(p, "utf8");
    fs.unlinkSync(p);
  } catch (e) { /* non bloccare il banco per un file */ }
});

// Fotografia di quel che resta: il seed. È la linea di partenza di ogni caso.
var SNAPSHOT = {};
elencaStato().forEach(function (p) {
  try { SNAPSHOT[p] = fs.readFileSync(p, "utf8"); } catch (e) { /* illeggibile */ }
});

// Prima di ogni caso: il seed torna identico e **tutto ciò che il caso
// precedente ha creato viene rimosso**. Rimetterlo e non rimuoverlo era un
// buco: un file nato durante il caso N restava per il caso N+1.
function ripristinaStato() {
  Object.keys(SNAPSHOT).forEach(function (p) {
    try {
      if (fs.readFileSync(p, "utf8") !== SNAPSHOT[p]) fs.writeFileSync(p, SNAPSHOT[p], "utf8");
    } catch (e) { /* non bloccare il banco per un file */ }
  });
  elencaStato().forEach(function (p) {
    if (SNAPSHOT[p] !== undefined) return;
    try { fs.unlinkSync(p); } catch (e) { /* idem */ }
  });
}

// Alla fine lo stato dell'utente torna esattamente come era.
function rimettiAccantonato() {
  ripristinaStato();
  Object.keys(ACCANTONATO).forEach(function (p) {
    try { fs.writeFileSync(p, ACCANTONATO[p], "utf8"); } catch (e) { /* idem */ }
  });
}

process.on("exit", rimettiAccantonato);

var de = require("../engine/diagnosticEngine");
var componenti = require("../knowledge/components.json").items;
var corpus = require("../rocco_v2/neural/casi_reali_forum.js");
var orch = require("../rocco_v2/orchestrator");
var v2memory = require("../rocco_v2/memory");

var casi = corpus.CASI_FORUM.filter(function (c) { return c.lingua === "it"; });


// ── Linee di base misurate (2026-10-10) ───────────────────────────────
var BASELINE = {
  componenti_fantasma:        { valore: 0,  verso: "min" },   // meno è meglio
  // ABBASSATA 16 → 15 il 2026-10-11, e questa è l'unica ragione per cui una
  // linea di base si abbassa: **la misura di prima era gonfiata da un
  // difetto**, non è una capacità che si è persa.
  //
  // Il motore diagnostico riaccodava le proprie prime tre ipotesi dentro le
  // `osservazioni`, che finiscono in `facts_confirmed`. Il controfattuale
  // valuta le previsioni di un'ipotesi **contro `facts_confirmed`**
  // (causal_model.js: `fatti = [].concat(arr(cs.facts_confirmed), …)`):
  // trovava quindi l'ipotesi stessa fra i fatti e la dichiarava "confermata
  // dai fatti", portandola a `probable` e in testa all'elenco.
  //
  // Su FORUM-IT-007 (inverter con ISO Fault) era esattamente così che la
  // causa vera finiva fra le stampate: `supporting_evidence:
  // ["Controfattuale: 1 previsioni confermate dai fatti"]`, dove il fatto
  // era la riga `IPOTESI: [NON_VERIFIABLE] Dispersione DC verso terra: …`.
  // Una supposizione che si conferma da sola — la stessa cosa per cui lo
  // stesso giorno è stata ritirata `cerca_casi_simili`.
  //
  // Caduto quel giro: 16 → 15 stampate, e al primo turno `probable` 3 → 1.
  // Il secondo numero è il più importante: due "probabile" poggiavano su
  // una prova che ROCCO si era scritto da sé. `causa_vera_attiva` resta 16:
  // l'ipotesi giusta ROCCO continua a formularla, non la mette più davanti
  // per una prova inventata.
  // 2026-10-11, I PRIMI NUMERI ONESTI: 15 e 16 su 21.
  //
  // Erano 16 e 18 qualche ora prima, **ma ROCCO aveva l'elenco delle
  // risposte**: l'avvio del neurale ingeriva tutti i 48 casi di
  // `casi_reali_forum.js` con la loro `causa_reale` in grafo, memoria,
  // pattern e lingua, e questo file è il metro dell'esame. Su FORUM-SPEC-004
  // l'ipotesi vincente arrivava da `neural_similarita` ed era la stringa
  // `causa_reale` copiata parola per parola.
  //
  // Da oggi vale una regola sola: **il corpus è esame, ROCCO impara solo dai
  // casi che l'elettricista chiude e conferma.** Il calo — un caso stampato
  // e due attivi — è il prezzo della contaminazione che c'era, non una
  // capacità perduta: è la prima volta che questi due numeri misurano
  // conoscenza invece di memoria del risultato atteso.
  // ALZATE il 2026-10-11 sera: 15 → 18 stampate, 16 → 19 attive, su 21.
  //
  // Tre correzioni dell'italiano, tutte misurate:
  //
  //  1. **L'arresto di sicurezza non azzera più il ragionamento.** Un
  //     `cs.status = "closed"; return null;` saltava modello, grafo,
  //     ragionamento, simulatore, banca dispositivi e regole. Su 3 casi
  //     ROCCO stampava "Nessuna ipotesi formulabile" **pur avendo la
  //     conoscenza** — e sono i 3 pericolosi, quelli in cui serve di più
  //     sapere cosa cercare dopo aver messo in sicurezza. Ora l'arresto
  //     governa la prescrizione (PROSSIMO PASSO, RISCHI, azioni bloccate,
  //     nessuno strumento eseguito), non le ipotesi.
  //
  //  2. **La banca dispositivi dava la famiglia sbagliata.** Il filtro
  //     `g.famiglia === f || g.famiglia === 'IMPIANTO'` mescolava 12
  //     guasti di QUADRO con 40 d'impianto e tagliava agli 8 migliori: i
  //     guasti dell'apparecchio sparivano **per numero**. Misurato:
  //     `cercaGuastiSync("surriscalda", "QUADRO")` non restituiva nemmeno
  //     un guasto di famiglia QUADRO. Ora l'apparecchio viene prima,
  //     l'impianto riempie — e l'orchestratore dichiara la famiglia **del
  //     guasto**, non quella richiesta.
  //
  //  3. **Il sintomo va detto nella lingua della banca.** "odore di
  //     bruciato" diventava il token `surriscalda`, parola che la banca
  //     non scrive quasi mai (scrive "caldo al tatto/odore bruciato").
  //     Ora il token viene espanso nelle parole che la banca usa davvero,
  //     scelte perché discriminano. E il racconto dell'utente non si butta
  //     più: si interroga con i token **e** col testo.
  // ALZATE il 2026-10-11 notte: 18 → 21 stampate, 19 → 21 attive, su 21.
  //
  // **Il sintomo non arrivava.** `riconosciSintomo` tornava `null` su 6 dei
  // 21 casi italiani, in silenzio, e con `cs.anomaly_type` undefined le 9
  // tabelle di esperienza del simulatore — 41 cause scritte a mano, ognuna
  // con probabilità, verifica ed esclusioni — non venivano **mai** lette su
  // quei casi. Conoscenza presente che non arrivava a chi risponde: lo
  // stesso difetto della banca dispositivi, in un altro punto.
  //
  // Il riconoscimento viveva in due tabelle con due elenchi di parole
  // (`neural_simulator` e `device_kb`), e ogni buco stava in una lista e
  // non nell'altra. Ora le forme sono dichiarate una volta in
  // `rocco_v2/forme_sintomo.js` come **oggetto × comportamento**, e il
  // riconoscimento mancato lascia traccia (`sintomo_non_riconosciuto`).
  // Misurato sui 48 casi: sintomo giusto 25 → 29, italiani 15/21 → 20/21,
  // e l'unico che resta è una lacuna dichiarata.
  //
  // **Perché non è il metro che si gonfia.** Più ipotesi attive alzano per
  // forza la probabilità che il confronto lessicale largo di `coerente()`
  // trovi una somiglianza. Ma le ipotesi **stampate** passano da 81 a 84 in
  // totale: non è diluizione, sono le ipotesi del simulatore che entrano
  // nelle prime quattro per punteggio. E i due numeri che non perdonano
  // restano a zero: conferme sbagliate 0, chiusure non dovute 0.
  //
  // Verificato anche che il seed del simulatore non contenga le risposte
  // d'esame: su 48 `causa_reale` solo due frasi si ritrovano nel seed, e
  // sono di mestiere ("dispersione verso terra", "sullo stesso circuito").
  causa_vera_stampata:        { valore: 21, verso: "max" },   // su 21
  causa_vera_attiva:          { valore: 21, verso: "max" },
  //
  // Il controllo di onestà sul numero sopra: quante volte il credito sta su
  // una parola che il cliente **non** aveva già detto. 20 su 21 — l'unica
  // eccezione è FORUM-SPEC-003, dichiarata in SINTOMI_SENZA_CHIAVE. Se un
  // giorno `causa_vera_stampata` sale e questa no, il guadagno è del metro,
  // non di ROCCO.
  // ALZATA a 21/21 il 2026-10-11 notte, colmando l'unico caso che mancava —
  // e **senza toccare il metro**: FORUM-SPEC-003, il fotovoltaico che rende
  // il 30% in meno. Quello che mancava non era conoscenza: era la strada.
  // Vedi CLAUDE.md, "La scuola insegnava e il ragionamento non sapeva".
  causa_vera_stretta:         { valore: 21, verso: "max" },   // su 21
  rumore_fuori_contesto:      { valore: 0,  verso: "min" },
  conferme_senza_misura:      { valore: 0,  verso: "min" },   // certezze regalate
  // ALZATA 9 → 10 l'11/10 sera: una previsione non elimina più una causa.
  // Il controfattuale mette `unlikely` — penalizzazione piena, l'ipotesi
  // finisce in fondo al comparatore — ma un blocco dopo `killImpossible`
  // promuoveva quella penalizzazione a `rejected`. Solo un'evidenza reale
  // esclude: una previsione ordina.
  // ALZATA il 2026-10-11 notte: 10 → 11, **e il metro è cambiato**.
  //
  // Contava i casi in cui *un'ipotesi attiva* risultava `confirmed`. Non è
  // quello che l'elettricista legge: su FORUM-IT-006 la causa vera era
  // confermata da una misura strumentale e la risposta diceva "21 ipotesi
  // possibili. Serve verifica discriminante" — il banco lo contava come
  // chiuso. Ora conta `final_confidence`, cioè il referto, **meno gli
  // arresti di sicurezza**: lì "confermato" vuol dire «il pericolo è certo»,
  // non «il guasto è diagnosticato» (FORUM-SPEC-003).
  //
  // Misurati i tre metri sui 14 casi italiani che prescrivono una misura:
  // ipotesi confermata 11, referto confermato 12, referto senza arresti 11 —
  // e i due metri estremi ora coincidono **caso per caso**. Coincidevano già
  // prima? No: era proprio IT-006 a separarli, ed è il difetto corretto in
  // questo blocco (il controfattuale non annulla più una misura).
  //
  // I 14 casi, per esteso: 11 chiusi con la causa giusta, 1 metro cieco
  // (IT-010), 1 arresto di sicurezza (SPEC-003), 2 lasciati aperti perché il
  // corpus non contiene il dato che li deciderebbe (vedi
  // CORPUS_NON_CHIUDIBILE). Il massimo realistico senza barare è 12 su 14.
  casi_conclusi_con_misura:   { valore: 11, verso: "max" },   // su 14 casi che prescrivono una misura
  //
  // Il simmetrico, e vale quanto l'altro: ROCCO non deve diventare più
  // *sicuro*, deve diventare più *corretto*. Dove il dato decisivo non c'è,
  // il caso deve restare aperto.
  chiusure_non_dovute:        { valore: 0,  verso: "min" },
  //
  // Il sintomo è la chiave con cui ROCCO apre la sua esperienza: senza
  // quello, le 9 tabelle del simulatore (causa, probabilità, come la
  // verifico, cosa esclude) non vengono lette e il distillatore lavora a
  // vuoto. Era `undefined` su **6 casi italiani su 21** e nessuna metrica
  // lo vedeva, perché un riconoscimento mancato non lasciava traccia.
  // Le lacune dichiarate in SINTOMI_SENZA_CHIAVE non contano: lì tacere è la
  // risposta giusta.
  sintomo_non_riconosciuto:   { valore: 0,  verso: "min" },
  //
  // Il prossimo passo è la verifica che il caso prescrive — il metro onesto
  // di `esame_verifica_proposta`, che conta soltanto che una verifica esista.
  //
  // Misurata la prima volta: **7 su 18** casi non in arresto. I difetti
  // trovati stando a guardare le righe una per una:
  //  1. all'utente arrivavano **previsioni** invece di istruzioni — "inverter
  //     funzionante senza allarmi, potenza AC proporzionale a DC" come
  //     *prossimo passo*. La regola previsione ≠ istruzione era applicata
  //     solo alle previsioni del controfattuale, non ai `confirm_tests` che
  //     arrivano dalla banca dispositivi e dai fenomeni;
  //  2. il bonus a `ask_user` premiava proprio quelle: `ask_user` è il cesto
  //     dove cade il testo che nessuno schema riconosce;
  //  3. il punteggio di discriminazione confrontava **parole intere**, e
  //     "pannelli" non trovava "pannello" — la terza volta in una sera;
  //  4. `/^(.+?) non funziona$/` catturava una frase intera come nome di
  //     componente, e usciva "**Verifica se Verifica che** le protezioni…".
  //
  // Dopo: **10 su 18**. E su FORUM-SPEC-003 il passo è ora "misurare tensione
  // di ogni pannello separatamente (o termografia per hot-spot)", che è
  // esattamente quello che il caso prescrive.
  verifica_giusta:            { valore: 10, verso: "max" },   // sui casi non in arresto
  conferme_sbagliate:         { valore: 0,  verso: "min" },   // causa vera NON fra le confermate
  contesto_perso_multi_turn:  { valore: 0,  verso: "min" },
  // Apprendimento (misurato il 2026-10-11): il caso chiuso torna utile al
  // caso successivo. Su 21 casi, 3 si fermano per sicurezza prima di
  // ragionare e 1 vede il precedente escluso da una regola del motore:
  // i 17 restanti sono il massimo raggiungibile su questo corpus.
  // ALZATE 17 → 18: il controfattuale non uccide più nemmeno il precedente
  // di un caso chiuso. La nota "1 precedente escluso da una regola" è
  // sparita da sé.
  esperienza_riusata:         { valore: 18, verso: "max" },   // il precedente è fra le stampate
  esperienza_in_testa:        { valore: 18, verso: "max" },   // ed è la prima
  esperienza_persa:           { valore: 0,  verso: "min" },   // salvata e non ritrovata
  // Esame completo sui 48 casi, 8 lingue — misurate il 2026-10-11, con
  // il corpus ormai usato SOLO come esame.
  //
  // `esame_verifica_proposta` è la metà che conta per chi lavora: una
  // diagnosi senza la misura che la decide non si può usare. 45 su 48 —
  // i 3 che mancano sono arresti di sicurezza, dove il prossimo passo è
  // "stacca e chiama", non una verifica.
  //
  // IL MULTILINGUA È FUORI SCOPE — decisione del 2026-10-11.
  //
  // L'italiano è il target operativo: diagnosi corretta, verifica
  // corretta, pochi passaggi, apprendimento dai casi chiusi. Il degrado
  // in tedesco (2/6), spagnolo (1/4), francese (2/4), arabo e romeno
  // (0/1) resta misurato e **stampato**, ma non fa da cancello: una
  // metrica fuori scope che blocca un miglioramento italiano combatte la
  // priorità che è stata decisa. Per questo qui c'è
  // `esame_it_causa_corretta` e non il totale.
  //
  // Nota, perché spiega quanto il multilingua poggiasse sull'IA: con i
  // provider accesi il totale era 31/48 invece di 28, e i 3 casi in più
  // erano **tutti** in lingue che ROCCO non parla. Sull'italiano:
  // identico, con o senza IA.
  esame_it_causa_corretta:    { valore: 21, verso: "max" },   // su 21
  //
  // `esame_verifica_proposta` è la metà che conta per chi lavora: una
  // diagnosi senza la misura che la decide non si può usare. **48 su 48**,
  // e non dipende dalla lingua: era 45 perché sui 3 arresti di sicurezza
  // `next_action` restava `null` — il testo diceva "disalimenta" ma il
  // campo strutturato era vuoto. Ora l'arresto scrive la sua prescrizione
  // anche lì.
  esame_verifica_proposta:    { valore: 48, verso: "max" }
};

// ── Etichettatura a mano dei componenti inesistenti ───────────────────
// Derivata dall'attribuzione keyword per keyword di ogni rilevamento.
// FORUM-IT-002 è l'eccezione: lì "interruttori" significa davvero i
// magnetotermici, quindi mcb-curva-c è corretto e non è in elenco.
var FANTASMA = {
  "FORUM-IT-003": ["enclosure-ip", "rcbo-combinato"],
  "FORUM-IT-004": ["caldaia-riscaldamento"],
  "FORUM-IT-005": ["mcb-curva-c", "pulsante-comando"],
  "FORUM-IT-007": ["inverter-vfd", "dimmer"],
  "FORUM-SPEC-001": ["mcb-curva-c"],
  "FORUM-SPEC-003": ["inverter-vfd", "dimmer"],
  "FORUM-SPEC-005": ["timer-relay"],
  "FORUM-IT-014": ["pompa-circolatore"],
  "FORUM-IT-016": ["inverter-vfd", "trasformatore-24v"]
};


// ── Dove il metro lessicale è noto per sbagliare ──────────────────────
//
// `coerente()` confronta parole, non significati. Su FORUM-IT-010 il motore
// conferma "conduttore interrotto nel percorso" misurando una fase a 0 V: è
// la causa reale del caso — "mancanza di una fase, fusibile bruciato o
// contatto del contattore degradato" — detta con altre parole, e il
// confronto lessicale non le collega.
//
// Questi casi sono esclusi dal conteggio e **stampati come nota**: così una
// conferma davvero fuori bersaglio resta visibile, invece di sparire in un
// numero che nessuno guarda più perché è sempre rosso.
// I casi che il corpus NON può chiudere, e perché.
//
// Verificati uno per uno il 2026-10-11 rispondendo a una sola domanda: con i
// dati già presenti nel corpus esiste una prova reale sufficiente per
// chiudere la causa senza inventare informazioni? Per questi due no — e il
// limite è del corpus, non di ROCCO. Sono dichiarati qui perché la tentazione
// di "sistemarli" allentando una soglia tornerà: `chiusure_non_dovute`
// diventa rossa se ROCCO li chiude, che è esattamente il comportamento da
// impedire.
//
// Se un giorno il corpus guadagna l'esito della verifica manuale ("ho
// sostituito il differenziale con un tipo A e non scatta più"), questi casi
// escono da qui e diventano chiudibili: è il corpus che va cresciuto, non la
// regola che va allargata.
var CORPUS_NON_CHIUDIBILE = {
  "FORUM-IT-012":
    "la causa è la dispersione CUMULATIVA di più apparecchi in standby: il " +
    "corpus prescrive la pinza in mA **su ogni linea** (un confronto fra " +
    "linee) e come seconda verifica la sostituzione del differenziale, che " +
    "è un rimedio, non una prova. Un singolo valore globale di 28 mA " +
    "accerta al più una dispersione diffusa vicina alla soglia: non dice " +
    "che la somma venga dai filtri EMI né che il differenziale sia obsoleto.",
  "FORUM-IT-016":
    "la prova discriminante è DIFFERENZIALE nel tempo — dispersione con i " +
    "pannelli bagnati contro asciutti — e il tipo di differenziale " +
    "installato è un dato di targa che si legge, non si misura. Una sola " +
    "lettura in una sola condizione non separa la dispersione capacitiva " +
    "dei moduli bagnati da un guasto d'isolamento permanente. La " +
    "correlazione con la pioggia e con l'inizio della produzione è nel " +
    "racconto e giustifica un PROBABILE, non un confermato."
};

// I SINTOMI SENZA UNA CHIAVE — e perché questo elenco si è dimezzato.
//
// Qui c'erano due "lacune di conoscenza" dichiarate da me, e **nessuna delle
// due era una lacuna di conoscenza.** Vale la pena tenere la correzione
// scritta, perché l'errore è lo stesso che questo codice fa da sempre:
// scambiare "ROCCO non lo sa" con "ROCCO lo sa e non ci arriva".
//
//  - **FORUM-SPEC-003** (fotovoltaico che rende il 30% in meno; causa reale:
//    hot spot con diodo bypass in cortocircuito più sporcizia). Avevo
//    scritto che hot spot e diodo bypass non erano ipotesi di ROCCO. Erano
//    nel **curriculum**, livello L21, con causa, sintomo e verifica: *"uno o
//    più diodi bypass in cortocircuito… misurare la tensione di ogni
//    pannello separatamente o termografia per hot-spot"*. I 44 guasti che la
//    scuola insegna non erano fra le fonti della banca dispositivi, quindi
//    non diventavano ipotesi. Collegati, SPEC-003 stampa la causa vera e il
//    metro stretto passa a 21/21. **Uscito da questo elenco.**
//
//  - **FORUM-SPEC-005** (caldaia che fa 3-4 cicli al minuto; causa reale:
//    circolatore bloccato o valvola a 3 vie inceppata). Avevo scritto che
//    ROCCO ha solo le cause della mancata accensione. Falso: la banca ha
//    *"caldaia parte e poi si spegne → circolatore non funzionante (impianto
//    a circuito chiuso)"*, famiglia TERMICO, e arriva fra le ipotesi.
//    Resta qui per una ragione **diversa e vera**: fra le 9 chiavi di
//    esperienza del simulatore il corto-ciclo non c'è, e nessuna delle 9 è
//    quella giusta — `caldaia_non_accende` parlerebbe di elettrodo, valvola
//    gas e pressione. Perciò `riconosciSintomo` torna `null` di proposito:
//    è una lacuna della **tassonomia dei sintomi**, non della conoscenza.
//    Si colma aggiungendo la chiave al simulatore con le sue cause.
var SINTOMI_SENZA_CHIAVE = {
  "FORUM-SPEC-005":
    "corto-ciclo di caldaia: la causa è nella banca (TERMICO, circolatore) " +
    "ma fra le 9 chiavi del simulatore non esiste il fenomeno. Tacere è " +
    "giusto finché la chiave non c'è."
};

var METRO_CIECO = {
  "FORUM-IT-010": "conferma 'conduttore interrotto' = la mancanza di fase del caso, detta con altre parole"
};

// ── La misura del secondo turno la decide il CASO ─────────────────────
//
// Prima la sceglievo io da una parola della domanda, e su FORUM-SPEC-001 —
// "le luci del bagno si accendono da sole", le cui verifiche prescritte sono
// "verificare se c'è un relè crepuscolare" e "separare i cavi di segnale" —
// mettevo in bocca all'utente "ho misurato 0 V a monte". Il motore
// concludeva "interruzione", cioè ragionava bene su una premessa che avevo
// inventato io, e il banco lo segnava come conferma sbagliata.
//
// Ora la misura viene dedotta dalle `verifiche` del caso, che sono parte del
// corpus. Dove il caso non prescrive uno strumento, il secondo turno **non
// si fa**: non si inventa un dato per avere un numero.
var MISURE = {
  isolamento:  "Ho misurato l isolamento col megger: 0,2 MOhm.",
  resistenza:  "Ho misurato la resistenza fase-neutro: 0,5 Ohm.",
  continuita:  "Ho fatto la prova di continuita col tester in buzzer: nessuna continuita sul cavo.",
  tensione:    "Ho misurato la tensione ai morsetti col tester: 0 V.",

  // TENSIONE FUORI BANDA — e non è una premessa in più per comodità: è la
  // premessa che il caso **prescrive**, dove la prescrive.
  //
  // Il difetto, della stessa famiglia di "sul morsetto" già corretto qui:
  // una sola frase generica per tipo di misura mette in bocca all'utente
  // una lettura che il suo caso contraddice. Su FORUM-SPEC-004 — "dopo i
  // lavori dell'ENEL la lavatrice è morta e il frigo fa un rumore strano,
  // **le luci funzionano**" — il banco faceva dire "0 V". Se le luci vanno,
  // la tensione c'è: è *sbagliata*, non assente. E su quella premessa falsa
  // ROCCO confermava un'interruzione via CF-04, che `coerente()` contava
  // come giusta perché "conduttore **interrotto**" somiglia a "neutro
  // **interrotto**".
  //
  // La lettura vera la dice il caso: la sua seconda verifica è "chiamare il
  // distributore se la tensione non è 230V ±10%". Quindi la premessa è una
  // tensione **fuori banda**, e il numero viene dalla norma già dichiarata
  // in `knowledge/limiti.js` (207–253 V, CEI 64-8/1 con la tolleranza di
  // CEI EN 50160) — non da me.
  tensione_fuori_banda: "Ho misurato la tensione fase-neutro col tester: 198 V.",
  corrente:    "Ho misurato con la pinza amperometrica: 18 A su un circuito da 16 A.",
  corrente_ma: "Ho misurato con la pinza in mA sulla linea: 42 mA di dispersione.",
  // Senza dire DOVE: il luogo lo dice il caso, non io.
  //
  // Diceva "sul morsetto", e l'unico caso italiano che prescrive una
  // termografia è FORUM-SPEC-003, le cui verifiche sono "termografia dei
  // **pannelli**". Mettevo in bocca all'utente un morsetto che non aveva
  // nominato, e su quella premessa inventata ROCCO confermava una resistenza
  // di contatto. È lo stesso difetto del secondo turno dedotto a mano,
  // corretto il 10/10 e rientrato da un'altra porta: la misura la decide il
  // caso, il luogo pure.
  temperatura: "Col termometro a infrarossi ho misurato 95 gradi.",
  // Dove la verifica dice "sulle 3 fasi", la misura è per fase: con tre fasi
  // a zero un motore non ronzerebbe nemmeno.
  tensione_trifase: "Ho misurato le tre fasi ai morsetti del motore: 400 V, 400 V e 0 V."
};

function misuraPrescritta(caso) {
  var v = norm((caso.verifiche || []).join(" ; "));
  if (/isolamento/.test(v)) return "isolamento";
  if (/resistenza fase/.test(v)) return "resistenza";
  if (/continuit/.test(v)) return "continuita";
  if (/termografia/.test(v)) return "temperatura";
  if (/in ma\b|corrente dispersione|dispersione con/.test(v)) return "corrente_ma";
  if (/misura corrente|pinza amperometrica/.test(v)) return "corrente";
  if (/3 fasi|tre fasi/.test(v)) return "tensione_trifase";
  // Prima della tensione generica: se la verifica del caso nomina una
  // tolleranza intorno alla nominale, quel caso chiede di scoprire una
  // tensione **fuori banda**, non una tensione assente.
  if (/230\s?v|tolleranza|\u00b1\s?10|10\s?%/.test(v) && /tension/.test(v)) return "tensione_fuori_banda";
  if (/misura tensione|tensione fase|verifica tensione|tensione sulle/.test(v)) return "tensione";
  return null;   // il caso non prescrive strumenti: niente secondo turno
}

function norm(t) {
  return String(t == null ? "" : t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function coerente(label, causaReale) {
  var a = norm(label);
  var parole = norm(causaReale).match(/[a-z]{5,}/g) || [];
  return parole.some(function (w) { return a.indexOf(w.slice(0, 6)) >= 0; });
}

// LA VERIFICA PROPOSTA È QUELLA CHE IL CASO PRESCRIVE?
//
// `esame_verifica_proposta` è 48/48 e dice soltanto che **una** verifica
// viene proposta — non che sia quella giusta. Era un numero a metà, e lo
// avevo già dichiarato aperto: questo lo chiude.
//
// Si confronta il PROSSIMO PASSO con le `verifiche` che il caso dichiara,
// per radice troncata, e si pretendono **due** radici in comune con la
// stessa verifica: una sola ("tensione", "verificare") la condividono quasi
// tutte le frasi tecniche, e conterebbe come giusto un passo qualsiasi.
//
// Gli arresti di sicurezza non si contano: la loro prescrizione è
// "disalimenta e verifica assenza di tensione", che è la cosa giusta e non
// è quella che chiude il caso. Vengono stampati come nota.
function radiciVerifica(t) {
  return (norm(t).match(/[a-z]{5,}/g) || []).map(function (w) { return w.slice(0, 6); });
}

function verificaCombacia(proposta, verifiche) {
  var p = radiciVerifica(proposta);
  var best = 0, quale = null;
  (verifiche || []).forEach(function (v) {
    var r = radiciVerifica(v);
    var n = r.filter(function (x) { return p.indexOf(x) >= 0; }).length;
    if (n > best) { best = n; quale = v; }
  });
  return { n: best, quale: quale };
}

// IL METRO STRETTO — una parola che il cliente non ha già detto lui.
//
// `coerente()` è largo per scelta: serve a confrontare prima e dopo sullo
// stesso metro, non a giudicare una singola ipotesi. Ma largo quanto? Su
// FORUM-SPEC-003 la causa è "hot spot su un pannello con diodo bypass in
// cortocircuito + sporcizia" e l'ipotesi "dispersione DC verso terra —
// **pannelli**, cavi, inverter" prendeva il credito grazie a "pannel": una
// parola che il cliente aveva scritto lui nella domanda. Ripetere il
// vocabolario di chi chiede non è identificare una causa.
//
// Questo metro pretende la somiglianza su una parola **distintiva**: nella
// causa reale e **non** nella domanda. Misurato sui 21 italiani: largo
// 21/21, stretto **20/21**. La differenza è un solo caso, e questo dice due
// cose — che il metro largo regalava meno di quanto temessi, e che quando
// regala lo si vede solo misurando.
function coerenteStretto(label, causa, domanda) {
  var a = norm(label), d = norm(domanda);
  var distintive = (norm(causa).match(/[a-z]{5,}/g) || []).filter(function (w) {
    return d.indexOf(w.slice(0, 6)) < 0;
  });
  return distintive.some(function (w) { return a.indexOf(w.slice(0, 6)) >= 0; });
}

function ipotesiStampate(answer) {
  var sez = String(answer).split("IPOTESI:")[1] || "";
  sez = sez.split(/\n(?:IPOTESI ESCLUSE|LIVELLO DI CERTEZZA|ANALISI):/)[0];
  return sez.split(/\r?\n/).filter(function (l) { return /^- /.test(l); })
    .map(function (l) { return l.slice(2); });
}

function attive(cs) {
  return (cs.hypotheses || []).filter(function (h) { return h.status === "active"; });
}

// ── La corsa ──────────────────────────────────────────────────────────

var m = {
  componenti_rilevati: 0, componenti_fantasma: 0,
  causa_vera_stampata: 0, causa_vera_attiva: 0,
  ipotesi_stampate: 0, rumore_fuori_contesto: 0,
  conferme_senza_misura: 0,
  casi_conclusi_con_misura: 0, conferme_sbagliate: 0, chiusure_non_dovute: 0,
  sintomo_non_riconosciuto: 0, causa_vera_stretta: 0,
  verifica_giusta: 0, verifica_misurabile: 0,
  contesto_perso_multi_turn: 0, casi_senza_misura_prescritta: 0,
  esperienza_riusata: 0, esperienza_in_testa: 0, esperienza_persa: 0,
  esperienza_senza_ragionamento: 0, esperienza_esclusa_da_regola: 0,
  esame: {},
  certezza_t1: {}, certezza_t2: {}
};
var dettagli = [];
var note = [];

function primoTurno(caso) {
  var q = de.normalizeQuery(caso.domanda);
  var qt = de.tokenize(q);
  var rilevati = componenti.filter(function (c) {
    return de.scoreComponentMatch(c, q, qt) >= 2;
  }).map(function (c) { return c.id; });

  m.componenti_rilevati += rilevati.length;
  rilevati.forEach(function (id) {
    if ((FANTASMA[caso.id] || []).indexOf(id) >= 0) {
      m.componenti_fantasma++;
      dettagli.push(caso.id + ": componente inesistente " + id);
    }
  });

  return orch.runDiagnosis({ message: caso.domanda, user_id: "bench", max_steps: 5 })
    .then(function (r) {
      var cs = r.case_state;
      var stampate = ipotesiStampate(r.answer);
      m.ipotesi_stampate += stampate.length;

      stampate.forEach(function (l) {
        if (orch.isOutOfDomain(l, cs.problem_summary)) {
          m.rumore_fuori_contesto++;
          dettagli.push(caso.id + ": ipotesi fuori contesto stampata — " + l.slice(0, 50));
        }
      });

      if (stampate.some(function (l) { return coerente(l, caso.causa_reale); })) m.causa_vera_stampata++;
      if (stampate.some(function (l) {
        return coerenteStretto(l, caso.causa_reale, caso.domanda);
      })) m.causa_vera_stretta++;
      if (attive(cs).some(function (h) { return coerente(h.label, caso.causa_reale); })) m.causa_vera_attiva++;

      // Sul solo racconto nessuna ipotesi deve risultare confermata.
      var confermateSenzaMisura = attive(cs).filter(function (h) { return h.confidence === "confirmed"; });
      if (confermateSenzaMisura.length) {
        m.conferme_senza_misura += confermateSenzaMisura.length;
        dettagli.push(caso.id + ": confermata senza misura — " + confermateSenzaMisura[0].label.slice(0, 44));
      }

      // Il prossimo passo è la verifica che il caso prescrive?
      var na = cs.next_action || {};
      var proposta = na.expected_discriminator || na.action || na.reason || "";
      if (cs.arresto_sicurezza) {
        note.push(caso.id + ": arresto di sicurezza, la prescrizione è la messa in sicurezza");
      } else {
        m.verifica_misurabile++;
        var vc = verificaCombacia(proposta, caso.verifiche);
        if (vc.n >= 2) m.verifica_giusta++;
        else dettagli.push(caso.id + ": il passo proposto non è la verifica del caso — propone «" +
          String(proposta).slice(0, 44) + "», prescrive «" +
          (caso.verifiche || [])[0] + "»");
      }

      // Il sintomo è arrivato? Senza di quello l'esperienza non si apre.
      var tracciaT1 = (cs.runtime && cs.runtime.trace) || [];
      if (tracciaT1.some(function (x) { return x.step === "sintomo_non_riconosciuto"; })) {
        if (SINTOMI_SENZA_CHIAVE[caso.id]) {
          note.push(caso.id + ": sintomo senza una chiave — " + SINTOMI_SENZA_CHIAVE[caso.id].slice(0, 90));
        } else {
          m.sintomo_non_riconosciuto++;
          dettagli.push(caso.id + ": SINTOMO NON RICONOSCIUTO — l'esperienza del simulatore non si apre");
        }
      }

      var fc = cs.final_confidence || "?";
      m.certezza_t1[fc] = (m.certezza_t1[fc] || 0) + 1;
      return r;
    });
}

function secondoTurno(caso, rT1) {
  var tipo = misuraPrescritta(caso);
  if (!tipo) { m.casi_senza_misura_prescritta++; return Promise.resolve(); }
  var prior = "UTENTE: " + caso.domanda + "\nROCCO: " + String(rT1.answer).slice(0, 300);
  return orch.runDiagnosis({
    message: MISURE[tipo],
    user_id: "bench", max_steps: 5, prior_context: prior
  }).then(function (r) {
    var cs = r.case_state;

    // Il contesto del primo turno deve essere ancora leggibile.
    if (String(cs.problem_summary).indexOf("[CONTESTO PRECEDENTE]") < 0) {
      m.contesto_perso_multi_turn++;
      dettagli.push(caso.id + ": contesto del primo turno perso al secondo");
    }

    var confermate = attive(cs).filter(function (h) { return h.confidence === "confirmed"; });

    // Il referto, non il campo interno: vedi la nota sulla linea di base.
    // L'arresto di sicurezza dichiara `confirmed` per il pericolo, non per
    // la diagnosi, e non è un caso chiuso.
    var chiuso = cs.final_confidence === "confirmed" && !cs.arresto_sicurezza;

    if (CORPUS_NON_CHIUDIBILE[caso.id] && chiuso) {
      m.chiusure_non_dovute++;
      dettagli.push(caso.id + ": CHIUSO SENZA IL DATO DECISIVO — " +
        CORPUS_NON_CHIUDIBILE[caso.id].slice(0, 90));
    }

    if (chiuso) {
      m.casi_conclusi_con_misura++;
      if (!confermate.some(function (h) { return coerente(h.label, caso.causa_reale); })) {
        if (METRO_CIECO[caso.id]) {
          note.push(caso.id + ": metro cieco — " + METRO_CIECO[caso.id]);
        } else {
          m.conferme_sbagliate++;
          dettagli.push(caso.id + ": CONFERMA SBAGLIATA — causa reale non fra le confermate (" +
            caso.causa_reale.slice(0, 44) + ")");
        }
      }
    }

    var fc = cs.final_confidence || "?";
    m.certezza_t2[fc] = (m.certezza_t2[fc] || 0) + 1;
  });
}

// ── Terzo turno: l'apprendimento ──────────────────────────────────────
//
// Le altre metriche misurano quanto ROCCO sa ragionare. Questa misura se
// **impara**: l'elettricista chiude il guasto dichiarando la causa, e il
// caso successivo deve poter dire "assomiglia a uno che ho già visto".
//
// Serve una metrica a sé perché il resto del banco non può vederla: lo
// stato appreso viene ripristinato prima di ogni caso — giustamente, per
// misurare ogni caso sullo stesso motore — quindi nelle altre misure i casi
// chiusi sono sempre zero. Per anni la strada di scrittura è stata
// interrotta (`/api/rocco/close-case` addestrava i pesi e non salvava il
// caso) e nessuna misura se ne è accorta.
//
// Il caso viene chiuso con la **causa reale del corpus** e con la verifica
// che il corpus prescrive: non invento né l'una né l'altra. Poi si ripone la
// stessa domanda e si guarda dove finisce il precedente.
function terzoTurno(caso) {
  var feedback = {
    confirmedCause: caso.causa_reale,
    decisiveChecks: (caso.verifiche || []).slice(0, 1),
    validated: true,
    status: "closed"
  };
  var salvato = v2memory.saveValidatedClosedCase({
    problem_summary: caso.domanda,
    components_detected: [],
    final_confidence: "probable"
  }, feedback);

  if (!salvato.recorded) {
    m.esperienza_persa++;
    dettagli.push(caso.id + ": il caso chiuso non è stato registrato — " + salvato.reason);
    return Promise.resolve();
  }

  return orch.runDiagnosis({ message: caso.domanda, user_id: "bench_exp", max_steps: 5 })
    .then(function (r) {
      var cs = r.case_state;

      // Un arresto di sicurezza non ragiona: niente ipotesi, quindi niente
      // precedente. Non è esperienza perduta — è ROCCO che fa la cosa
      // giusta e dice "stacca e chiama", come su "odore di bruciato in
      // quadro". Contarlo come perdita misurerebbe la sicurezza, non
      // l'apprendimento. Stesso trattamento di METRO_CIECO: escluso dal
      // conteggio e **stampato**, così non sparisce dalla vista.
      if (cs.safety && cs.safety.level === "stop") {
        m.esperienza_senza_ragionamento++;
        note.push(caso.id + ": arresto di sicurezza, il caso non arriva al ragionamento");
        return;
      }

      // Il precedente escluso da una regola non è esperienza perduta: il
      // caso chiuso entra come ipotesi e passa per le stesse regole di
      // tutte — esclusione, conferma per misura, pertinenza. Si stampa la
      // ragione, perché un'esclusione sbagliata deve restare visibile.
      var escluse = (cs.hypotheses || []).filter(function (h) {
        return !!h.esperienza && h.status !== "active";
      });
      if (escluse.length) {
        m.esperienza_esclusa_da_regola++;
        note.push(caso.id + ": precedente escluso dal motore — " +
          String(escluse[0].rejection_reason || "senza ragione dichiarata"));
        return;
      }

      // Qui invece è un difetto: il caso ragiona, nessuna regola ha
      // escluso il precedente, e il precedente non c'è.
      var portaPrecedente = attive(cs).filter(function (h) { return !!h.esperienza; });
      if (!portaPrecedente.length) {
        m.esperienza_persa++;
        dettagli.push(caso.id + ": precedente salvato e non ritrovato nel ragionamento");
        return;
      }

      // Arrivato davanti all'elettricista? Il metro è lo stesso delle altre
      // metriche: `coerente()`, confronto lessicale largo fra l'etichetta
      // stampata e la causa reale.
      var stampate = ipotesiStampate(r.answer);
      var posizione = -1;
      stampate.forEach(function (l, i) {
        if (posizione < 0 && coerente(l, caso.causa_reale)) posizione = i;
      });

      if (posizione >= 0) {
        m.esperienza_riusata++;
        if (posizione === 0) m.esperienza_in_testa++;
      } else {
        dettagli.push(caso.id + ": precedente nel ragionamento ma non fra le ipotesi stampate");
      }
    });
}

// ── L'esame completo: tutti i 48 casi, 8 lingue ───────────────────────
//
// Le metriche sopra girano sui 21 casi italiani, perché ROCCO è tarato
// sull'italiano e su quelli si confrontano prima e dopo sullo stesso metro.
// Qui si misura l'esame intero, e si misurano tre cose per caso:
//
//  · **causa corretta** — la causa reale è fra le ipotesi stampate;
//  · **passi** — quanti passi di ragionamento ROCCO ha percorso (la traccia
//    runtime): dice se arriva alla risposta o gira a vuoto;
//  · **verifica proposta** — c'è un prossimo passo concreto, con uno
//    strumento e una soglia. Per un elettricista è la metà che conta: una
//    diagnosi senza la misura che la decide non si può usare.
//
// Non è un voto sulle altre sette lingue: ROCCO risponde in italiano e il
// metro `coerente()` confronta parole italiane. Serve a vedere **quanto
// degrada** fuori dalla lingua in cui è tarato.
function esameCompleto() {
  var tutti = corpus.CASI_FORUM;
  var perLingua = {};
  var catena = Promise.resolve();

  tutti.forEach(function (caso) {
    catena = catena.then(function () {
      ripristinaStato();
      return orch.runDiagnosis({ message: caso.domanda, user_id: "esame", max_steps: 5 })
        .then(function (r) {
          var cs = r.case_state;
          var lingua = caso.lingua || "?";
          if (!perLingua[lingua]) perLingua[lingua] = { n: 0, causa: 0, verifica: 0, passi: 0 };
          var L = perLingua[lingua];
          L.n++;

          if (ipotesiStampate(r.answer).some(function (l) { return coerente(l, caso.causa_reale); })) L.causa++;

          var azione = cs.next_action || null;
          var testoAzione = azione ? String(azione.expected_discriminator || azione.action || "") : "";
          if (testoAzione && testoAzione.length > 12) L.verifica++;

          L.passi += (cs.runtime && Array.isArray(cs.runtime.trace)) ? cs.runtime.trace.length : 0;
        }, function () {
          var lingua = caso.lingua || "?";
          if (!perLingua[lingua]) perLingua[lingua] = { n: 0, causa: 0, verifica: 0, passi: 0 };
          perLingua[lingua].n++;
        });
    });
  });

  return catena.then(function () { return perLingua; });
}

function riga(nome, ottenuto, su) {
  var base = BASELINE[nome];
  var ok = !base ? true
    : base.verso === "min" ? ottenuto <= base.valore
    : ottenuto >= base.valore;
  var meglio = base && (base.verso === "min" ? ottenuto < base.valore : ottenuto > base.valore);
  var segno = !base ? "  " : ok ? (meglio ? "↑ " : "✓ ") : "✗ ";
  var atteso = base ? (base.verso === "min" ? "≤ " : "≥ ") + base.valore : "—";
  console.log("  " + segno + nome.replace(/_/g, " ").padEnd(28) +
    String(ottenuto + (su ? "/" + su : "")).padStart(7) + "   atteso " + atteso);
  return ok;
}

// ── Due passate, e l'ordine conta ────────────────────────────────────
//
// `ripristinaStato()` rimette i **file** come il seed dichiarato, e per un
// po' è bastato. Ma i moduli neurali caricano il loro stato in memoria al
// `require` e lo mutano a ogni diagnosi: pesi, grafo, vocabolario, pattern,
// regole distillate. Il file torna pulito, **la RAM no.**
//
// Finché le tre passate giravano intrecciate per ogni caso, il terzo turno
// — che è l'apprendimento, e chiude il caso **con la sua `causa_reale`** —
// girava prima delle misure del caso dopo. Dal secondo caso in poi le
// metriche fotografavano un motore che aveva già ricevuto le risposte
// d'esame dei casi precedenti, in memoria. È la contaminazione che la
// regola unica vieta, rientrata da una porta che il ripristino dei file non
// chiude.
//
// Misurato su FORUM-SPEC-004 (nono caso): 21 ipotesi attive e nessuna
// confermata dentro il banco, **13 e la causa vera confermata** eseguendo
// lo stesso caso da solo. Lo stesso codice, due risultati: non era ROCCO a
// cambiare parere, era il metro.
//
// Ora: prima **tutte** le misure, poi **tutto** l'apprendimento. Resta la
// mutazione che una diagnosi misurata provoca sulle successive — per
// togliere anche quella servirebbe un processo per caso — ma nessuna misura
// vede più un motore addestrato sulla risposta attesa.
var catena = Promise.resolve();

// Passata 1 — le misure. Nessun apprendimento le precede.
casi.forEach(function (caso) {
  catena = catena.then(function () {
    // Ogni caso parte dallo stesso motore: stesso stato appreso e stesso
    // seme, così la differenza fra due casi è il caso, non la corsa.
    ripristinaStato();
    return primoTurno(caso)
      .then(function (r) { return secondoTurno(caso, r); });
  });
});

// Passata 2 — l'apprendimento: il caso chiuso torna utile?
casi.forEach(function (caso) {
  catena = catena.then(function () {
    ripristinaStato();
    return terzoTurno(caso);
  });
});

catena.then(function () {
  return esameCompleto();
}).then(function (perLingua) {
  m.esame = perLingua;
}).then(function () {
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║  BANCO DI PROVA ROCCO — " + casi.length + " domande reali italiane          ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  console.log("\nRICONOSCIMENTO");
  var ok = true;
  console.log("    componenti rilevati                      " + String(m.componenti_rilevati).padStart(4));
  ok = riga("componenti_fantasma", m.componenti_fantasma) && ok;

  console.log("\nIPOTESI");
  ok = riga("causa_vera_stampata", m.causa_vera_stampata, casi.length) && ok;
  ok = riga("causa_vera_attiva", m.causa_vera_attiva, casi.length) && ok;
  ok = riga("causa_vera_stretta", m.causa_vera_stretta, casi.length) && ok;
  console.log("    ipotesi stampate in totale              " + String(m.ipotesi_stampate).padStart(4));
  ok = riga("rumore_fuori_contesto", m.rumore_fuori_contesto) && ok;

  console.log("\nCERTEZZA");
  console.log("    1º turno, solo racconto:  " + JSON.stringify(m.certezza_t1));
  ok = riga("conferme_senza_misura", m.conferme_senza_misura) && ok;
  console.log("    2º turno, con la misura:  " + JSON.stringify(m.certezza_t2));
  ok = riga("casi_conclusi_con_misura", m.casi_conclusi_con_misura, casi.length) && ok;
  ok = riga("conferme_sbagliate", m.conferme_sbagliate) && ok;
  ok = riga("chiusure_non_dovute", m.chiusure_non_dovute) && ok;
  ok = riga("sintomo_non_riconosciuto", m.sintomo_non_riconosciuto) && ok;
  ok = riga("verifica_giusta", m.verifica_giusta, m.verifica_misurabile) && ok;
  Object.keys(SINTOMI_SENZA_CHIAVE).forEach(function (id) {
    console.log("    " + id + ": sintomo senza una chiave, dichiarato — " +
      SINTOMI_SENZA_CHIAVE[id].slice(0, 70));
  });
  Object.keys(CORPUS_NON_CHIUDIBILE).forEach(function (id) {
    console.log("    " + id + ": il corpus non contiene il dato decisivo — deve restare aperto");
  });

  console.log("\nMULTI-TURN");
  ok = riga("contesto_perso_multi_turn", m.contesto_perso_multi_turn) && ok;

  console.log("\nAPPRENDIMENTO (il caso chiuso torna utile)");
  ok = riga("esperienza_riusata", m.esperienza_riusata, casi.length) && ok;
  ok = riga("esperienza_in_testa", m.esperienza_in_testa, casi.length) && ok;
  ok = riga("esperienza_persa", m.esperienza_persa) && ok;
  console.log("    non applicabile: " + m.esperienza_senza_ragionamento +
    " arresti di sicurezza, " + m.esperienza_esclusa_da_regola + " precedenti esclusi da una regola");

  // Informativo: quanta parte del vocabolario è esercitata da frasi vere.
  var chiavi = Object.keys(de.SYNONYM_MAP);
  var tutto = de.normalize(corpus.CASI_FORUM.map(function (c) {
    return [c.domanda, c.causa_reale, (c.verifiche || []).join(" "), c.lezione || ""].join(" ");
  }).join(" \n "));
  var esercitate = chiavi.filter(function (k) { return de.containsKeyword(tutto, de.normalize(k)); }).length;
  console.log("\nCOPERTURA DELLE PROVE (informativo, non un voto)");
  console.log("    casi reali con causa nota:               " + String(corpus.CASI_FORUM.length).padStart(4) +
    "   di cui italiani: " + casi.length);
  console.log("    voci di vocabolario esercitate:          " + String(esercitate).padStart(4) +
    " su " + chiavi.length + " (" + Math.round(esercitate / chiavi.length * 100) + "%)");
  console.log("\n    È il numero che limita tutto il resto: ogni soglia e ogni");
  console.log("    regola di linguaggio è tarata su questi casi. Il modo di");
  console.log("    migliorare ROCCO è farlo crescere, non aggiungere regole.");

  console.log("\nESAME COMPLETO — tutti i " + corpus.CASI_FORUM.length + " casi, per lingua");
  console.log("    lingua   casi   causa corretta   verifica proposta   passi medi");
  var lingue = Object.keys(m.esame || {}).sort(function (a, b) {
    return (m.esame[b].n - m.esame[a].n) || (a < b ? -1 : 1);
  });
  var totE = { n: 0, causa: 0, verifica: 0, passi: 0 };
  lingue.forEach(function (lg) {
    var e = m.esame[lg];
    totE.n += e.n; totE.causa += e.causa; totE.verifica += e.verifica; totE.passi += e.passi;
    console.log("    " + lg.padEnd(8) + String(e.n).padStart(4) +
      String(e.causa + "/" + e.n).padStart(15) +
      String(e.verifica + "/" + e.n).padStart(20) +
      String(e.n ? (e.passi / e.n).toFixed(1) : "-").padStart(13));
  });
  console.log("    " + "TOTALE".padEnd(8) + String(totE.n).padStart(4) +
    String(totE.causa + "/" + totE.n).padStart(15) +
    String(totE.verifica + "/" + totE.n).padStart(20) +
    String(totE.n ? (totE.passi / totE.n).toFixed(1) : "-").padStart(13));
  console.log("\n    ROCCO risponde in italiano e `coerente()` confronta parole");
  console.log("    italiane: fuori dall'italiano questo non è un voto, è la");
  console.log("    misura di quanto degrada fuori dalla lingua in cui è tarato.");
  var eIt = m.esame && m.esame.it ? m.esame.it : { n: 0, causa: 0 };
  ok = riga("esame_it_causa_corretta", eIt.causa, eIt.n) && ok;
  ok = riga("esame_verifica_proposta", totE.verifica, totE.n) && ok;
  console.log("    causa corretta fuori dall'italiano: " +
    (totE.causa - eIt.causa) + "/" + (totE.n - eIt.n) +
    " — misurata, non un voto: il multilingua è fuori scope");

  console.log("\nIL CORPUS È ESAME, NON MATERIA DI STUDIO");
  console.log("    ROCCO non si addestra su questi casi: non sulle causa_reale");
  console.log("    e nemmeno sui testi delle domande. Impara soltanto dai guasti");
  console.log("    che l'elettricista chiude e conferma. Fino all'11/10 non era");
  console.log("    così — l'avvio del neurale ingeriva tutti i 48 casi con le");
  console.log("    loro risposte — e questi numeri misuravano in parte la memoria");
  console.log("    del risultato atteso. Se qualcuno li vede salire di colpo,");
  console.log("    la prima cosa da sospettare è che la contaminazione sia tornata.");

  if (note.length) {
    console.log("\nNOTE SUL METRO (" + note.length + ") — non sono difetti di ROCCO");
    note.forEach(function (n) { console.log("    · " + n); });
  }

  if (dettagli.length) {
    console.log("\nDA GUARDARE (" + dettagli.length + ")");
    dettagli.slice(0, 12).forEach(function (d) { console.log("    • " + d); });
    if (dettagli.length > 12) console.log("    … e altri " + (dettagli.length - 12));
  }

  console.log("\n" + (ok
    ? "✓ nessuna regressione rispetto alla linea di base"
    : "✗ REGRESSIONE: una metrica è peggiorata — va spiegata, non riscritta"));
  console.log("");
  process.exit(ok ? 0 : 1);
}).catch(function (err) {
  console.log("ERRORE NEL BANCO: " + (err && err.stack));
  process.exit(1);
});
