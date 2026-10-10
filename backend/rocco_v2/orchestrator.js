"use strict";

// ============================================================
// ROCCO — CERVELLO COGNITIVO
// ============================================================
//
// L'intelligenza è la capacità di percepire, comprendere e
// adattare il proprio comportamento per risolvere problemi
// nuovi o sconosciuti. (Stern, Claparède, Gardner)
//
// ROCCO ha studiato. Conosce leggi fisiche, elettrotecnica,
// norme CEI, componenti, fenomeni di guasto.
//
// Quando riceve un problema:
//   1. PERCEPISCE — capisce cosa succede, estrae fatti e relazioni
//   2. COMPRENDE — modella il sistema e identifica l'anomalia
//   3. RAGIONA — applica ciò che sa per generare ipotesi giustificate
//   4. DISCRIMINA — sceglie la verifica che riduce più incertezza
//   5. VERIFICA — controlla le conclusioni contro i fatti
//   6. SI ADATTA — se il ragionamento non basta, cambia strategia
//
// Ogni conclusione risponde a: "da quali fatti e leggi deriva?"
// Se non può rispondere, non è diagnosi — è ipotesi da verificare.
//
// ============================================================

var caseStateHelpers = require("./case_state");
var safetyGuard = require("./safety_guard");
var toolRegistryFactory = require("./tool_registry");
var providerGatewayFactory = require("./provider_gateway");
var responseFormatter = require("./response_formatter");
var lexicon = require("./lexicon");
var limiti = require("../knowledge/limiti");
var deviceKb = null;
try { deviceKb = require("../modules/rocco_university/device_kb"); }
catch (e) { /* banca dispositivi non disponibile */ }
var narrator = require("./narrator");
var checkPhrasing = require("./check_phrasing");
var runtimeTrace = require("./runtime_trace");
var memory = require("./memory");
var contracts = require("./contracts");
var reasoner = require("./reasoner");
var causalModel = require("./causal_model");

// Neural Integration — sensore cognitivo (graceful degradation)
var neuralIntegration = null;
try {
  neuralIntegration = require("./neural/neural_integration");
  neuralIntegration.init({ autoWarmup: true });
} catch(e) { /* neural non disponibile — ROCCO funziona come prima */ }

// ====== UTILITÀ ======

function s(v) { return String(v == null ? "" : v).trim(); }
function arr(v) { return Array.isArray(v) ? v : []; }

function normalize(text) {
  return s(text).toLowerCase()
    .replace(/[àáâã]/g, "a").replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i").replace(/[òóôõ]/g, "o").replace(/[ùúûü]/g, "u")
    .replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function has(text, pattern) { return pattern.test(normalize(text)); }

function hasToolResult(cs, name) {
  for (var i = 0; i < cs.tool_results.length; i++) {
    if (cs.tool_results[i] && cs.tool_results[i].tool_name === name) return true;
  }
  return false;
}

// ============================================================
// A. CONOSCENZA — ciò che ROCCO ha studiato
// ============================================================
//
// FENOMENI: ogni fenomeno è un evento osservabile che ROCCO
// ha studiato. Per ognuno conosce il PRINCIPIO FISICO che lo
// spiega e le IPOTESI che derivano dal ragionamento deduttivo.
//
// La differenza tra pattern matching e intelligenza:
//   Pattern matching: keyword → label
//   Intelligenza: osservazione → principio → deduzione → ipotesi
//
// Ogni ipotesi ha una CATENA logica: la sequenza di ragionamento
// che porta dall'osservazione alla conclusione.
// ============================================================

var FENOMENI = [

  // ─── PROTEZIONE DIFFERENZIALE ───
  { id: "FEN-01",
    fenomeno: /differenziale|rcd|rcbo|salvavita|id\b/,
    condizione: /scatt|salt|trip|intervi/,
    principio: "Kirchhoff: in un circuito sano la somma delle correnti di fase e neutro attraverso il toroide è zero. Se il RCD sgancia, la corrente esce per un percorso non monitorato (terra).",
    area: "elettrotecnica",
    ipotesi: [
      { causa: "Dispersione verso terra su carico o linea",
        catena: ["RCD misura Delta_I tra fase e neutro", "Delta_I > I_dn (30mA civile) → sgancio", "Corrente fugge per terra: isolamento degradato su un circuito"],
        conferma: ["sezionare i carichi uno alla volta e richiudere il RCD dopo ogni sezionamento", "misura isolamento con megger: se R < " + limiti.etichetta("isolamento_minimo") + " → circuito trovato"],
        esclude: ["isolamento > " + limiti.etichetta("isolamento_minimo") + " su tutti i circuiti"] },
      { causa: "Umidita o infiltrazione in giunzione/presa",
        catena: ["Acqua è conduttrice", "Acqua in scatola/presa abbassa R_isolamento", "R_isolamento basso → corrente di dispersione → RCD sgancia"],
        conferma: ["ispezione visiva scatole derivazione in zone umide o esterne", "isolamento migliora dopo asciugatura"],
        esclude: ["tutte le giunzioni asciutte e isolamento OK"] },
      { causa: "Dispositivo RCD difettoso",
        catena: ["Un RCD puo avere usura meccanica del meccanismo di sgancio", "Un RCD difettoso sgancia anche senza dispersione reale"],
        conferma: ["scatta anche senza alcun carico collegato a valle", "sostituzione con nuovo RCD elimina gli scatti"],
        esclude: ["senza carichi collegati NON scatta → guasto a valle, RCD OK"] }
    ]
  },

  // ─── MAGNETOTERMICO — SGANCIO ISTANTANEO ───
  { id: "FEN-02",
    fenomeno: /magnetotermico|mcb|automatico/,
    condizione: /scatt.*istan|trip.*istan|subito|immedia/,
    principio: "Lo sgancio magnetico dell'MCB è un solenoide che interviene istantaneamente (<10ms) quando la corrente supera 5-10 volte In. Tipico di cortocircuito.",
    area: "elettrotecnica",
    ipotesi: [
      { causa: "Cortocircuito fase-neutro o fase-fase",
        catena: ["Scatto istantaneo = corrente >> In", "Corrente altissima in <10ms = sgancio magnetico", "Causa: contatto diretto tra conduttori (fase-neutro, fase-fase, fase-terra)"],
        conferma: ["scatta istantaneamente anche al riarmo senza carico", "R fase-neutro prossima a 0 Ohm a impianto spento"],
        esclude: ["scatta solo dopo minuti sotto carico → non e cortocircuito, e sovraccarico"] },
      { causa: "Guasto interno a un carico",
        catena: ["Dispositivo con corto interno → corrente altissima al momento dell'inserzione", "MCB interviene per proteggere il circuito"],
        conferma: ["scatta solo inserendo un carico specifico"],
        esclude: ["scatta anche senza carichi collegati"] }
    ]
  },

  // ─── MAGNETOTERMICO — SGANCIO TERMICO ───
  { id: "FEN-03",
    fenomeno: /magnetotermico|mcb|automatico/,
    condizione: /scatt.*dopo|scatt.*minut|scatt.*carico|caldo|surriscald/,
    principio: "Lo sgancio termico usa un bimetallo che si deforma con il calore. La corrente > In per tempo prolungato riscalda il bimetallo fino allo sgancio. Tempo inversamente proporzionale a I/In.",
    area: "elettrotecnica",
    ipotesi: [
      { causa: "Sovraccarico: corrente > In prolungata",
        catena: ["Effetto Joule: P = R × I² → calore proporzionale a I²", "Corrente > In per minuti → bimetallo si deforma → sgancio termico", "Causa: troppi carichi su un circuito, o carico che assorbe piu del previsto"],
        conferma: ["misura corrente con pinza amperometrica: I > In del magnetotermico", "scatta dopo minuti sotto carico, non istantaneamente"],
        esclude: ["corrente misurata < In del magnetotermico", "scatta istantaneamente → magnetico, non termico"] },
      { causa: "Magnetotermico sottodimensionato rispetto al carico",
        catena: ["CEI 64-8: In deve essere ≤ Iz (portata cavo) ma >= carico previsto", "Se MCB ha In troppo basso per il carico installato → scatta in uso normale"],
        conferma: ["confronto In MCB con assorbimento reale del carico: In < I_carico"],
        esclude: ["In MCB adeguato al carico installato"] }
    ]
  },

  // ─── ASSENZA TENSIONE / NON FUNZIONA ───
  { id: "FEN-04",
    fenomeno: /non funziona|non accende|non parte|non va|senza tensione|manca corrente|morto|spento|buio/,
    condizione: null,
    principio: "Un circuito funziona solo se il percorso dall'alimentazione al carico è integro: sorgente → protezioni → conduttori → carico → ritorno. Se un elemento è aperto, V_carico = 0.",
    area: "elettrotecnica",
    ipotesi: [
      { causa: "Assenza di alimentazione a monte",
        catena: ["Legge di Ohm: V = 0 al carico → circuito aperto", "Se la tensione manca già a monte (quadro, protezione scattata, interruttore aperto) → niente arriva al punto"],
        conferma: ["misura tensione al punto: 0V confermato", "controllare stato protezioni a monte: qualcuna scattata?"],
        esclude: ["tensione 230V ±10% presente al punto"] },
      { causa: "Conduttore interrotto nel percorso",
        catena: ["Un cavo puo interrompersi per danno meccanico, roditore, chiodo, o morsetto sfilato", "Circuito aperto → V = 0 al carico anche se monte OK"],
        conferma: ["misura continuita tra quadro e punto a impianto spento"],
        esclude: ["continuita presente su tutti i conduttori del circuito"] },
      { causa: "Dispositivo/carico guasto internamente",
        catena: ["Il dispositivo stesso puo avere circuito aperto interno", "Alimentazione presente ma il carico non risponde"],
        conferma: ["tensione presente ai morsetti del carico ma non funziona", "sostituzione con dispositivo noto funzionante risolve"],
        esclude: ["anche il sostitutivo non funziona → guasto nel circuito, non nel carico"] },
      { causa: "Protezione a monte scattata o aperta",
        catena: ["Un interruttore, MCB o sezionatore a monte puo essere aperto", "Il circuito a valle resta senza alimentazione"],
        conferma: ["controllo visivo quadro: una o piu protezioni in posizione OFF"],
        esclude: ["tutte le protezioni chiuse e tensione presente al quadro"] }
    ]
  },

  // ─── SURRISCALDAMENTO ───
  { id: "FEN-05",
    fenomeno: /surriscald|caldo|brucia|odore|annerit|fonde|fum|sciogl/,
    condizione: null,
    principio: "Effetto Joule: P = R × I². Il calore e proporzionale alla resistenza e al quadrato della corrente. Surriscaldamento = R troppo alta (contatto degradato) oppure I troppo alta (sovraccarico).",
    area: "fisica",
    ipotesi: [
      { causa: "Morsetto allentato → resistenza di contatto elevata",
        catena: ["Morsetto non serrato → superficie di contatto ridotta → R_contatto alta", "P = R_contatto × I² → calore concentrato nel punto", "Segni: annerimento, fusione locale, odore"],
        conferma: ["termografia o tatto: calore localizzato su un punto specifico", "riserraggio morsetto elimina il problema"],
        esclude: ["tutti i morsetti serrati correttamente senza segni di calore"] },
      { causa: "Sovraccarico: corrente oltre la portata del cavo",
        catena: ["CEI 64-8: ogni cavo ha una portata Iz massima", "Se I > Iz per tempo prolungato → cavo si surriscalda uniformemente", "Rischio: degradazione isolamento, incendio"],
        conferma: ["misura corrente con pinza: I > Iz del cavo installato", "surriscaldamento uniforme lungo il cavo, non localizzato"],
        esclude: ["corrente sotto la portata del cavo"] },
      { causa: "Sezione cavo sottodimensionata",
        catena: ["Cavo di sezione insufficiente per il carico collegato", "Iz del cavo < I_carico → sovraccarico permanente"],
        conferma: ["verifica sezione cavo: confronto con tabelle CEI 64-8 per il tipo di posa"],
        esclude: ["sezione adeguata al carico e alla posa"] }
    ]
  },

  // ─── GUASTO INTERMITTENTE ───
  { id: "FEN-06",
    fenomeno: /intermittente|a volte|random|saltuari|ogni tanto|va e viene|qualche volta/,
    condizione: null,
    principio: "Un guasto intermittente indica una condizione al limite: un contatto che apre/chiude, un componente che funziona solo in certe condizioni (temperatura, vibrazione, umidita). La causa e spesso meccanica.",
    area: "esperienza",
    ipotesi: [
      { causa: "Connessione allentata o contatto ossidato",
        catena: ["Morsetto non serrato o contatto ossidato → superficie di contatto instabile", "Vibrazioni, temperatura o corrente causano apertura/chiusura", "Guasto appare/scompare senza logica apparente"],
        conferma: ["muovere cavi durante funzionamento: guasto si manifesta/scompare", "riserraggio sistematico elimina l'intermittenza"],
        esclude: ["tutti i morsetti serrati e l'intermittenza persiste identica"] },
      { causa: "Componente sensibile a temperatura",
        catena: ["Alcuni componenti cambiano comportamento con la temperatura", "Funziona a freddo e non a caldo (o viceversa)", "Tipico di semiconduttori degradati o saldature fredde"],
        conferma: ["guasto appare/scompare con il riscaldamento del componente"],
        esclude: ["guasto non correlato alla temperatura ambiente o di esercizio"] }
    ]
  },

  // ─── MOTORE TRIFASE NON PARTE ───
  { id: "FEN-07",
    fenomeno: /motore.*trifas|trifas.*motore/,
    condizione: /non part|non avvia|non gira|ronza|bloccato/,
    principio: "Un motore asincrono trifase richiede 3 fasi bilanciate per generare un campo magnetico rotante. Senza una fase il campo e pulsante: il motore ronza ma non genera coppia sufficiente.",
    area: "elettrotecnica",
    ipotesi: [
      { causa: "Mancanza di una fase ai morsetti motore",
        catena: ["Campo rotante richiede 3 fasi sfasate di 120°", "Con 2 fasi: campo pulsante → coppia insufficiente → motore fermo, assorbe corrente, ronza"],
        conferma: ["misura tensione L1-L2, L2-L3, L1-L3 ai morsetti: una concatenata assente o bassa"],
        esclude: ["tutte e tre le tensioni concatenate presenti e bilanciate (±5%)"] },
      { causa: "Carico meccanico bloccato",
        catena: ["Se l'albero e bloccato meccanicamente → coppia resistente infinita", "Motore assorbe corrente di spunto indefinitamente → protezione termica interviene"],
        conferma: ["l'albero non ruota nemmeno a mano (scollegato)", "motore gira a vuoto normalmente"],
        esclude: ["albero libero di ruotare a mano"] }
    ]
  },

  // ─── MOTORE MONOFASE NON PARTE ───
  { id: "FEN-08",
    fenomeno: /motore/,
    condizione: /non part|non avvia|ronza|monofas/,
    principio: "Un motore monofase ha bisogno di un condensatore (o avvolgimento ausiliario) per creare lo sfasamento necessario all'avviamento. Senza condensatore: ronza ma non parte, perché il campo è pulsante.",
    area: "elettrotecnica",
    ipotesi: [
      { causa: "Condensatore di avviamento guasto",
        catena: ["Condensatore crea sfasamento tra avvolgimento principale e ausiliario", "Senza condensatore: campo pulsante, coppia di avviamento zero", "Sintomo classico: motore ronza, parte solo se spinto a mano"],
        conferma: ["motore monofase che ronza e parte solo a mano", "misura capacita condensatore: valore fuori tolleranza o 0"],
        esclude: ["motore trifase → condensatore non pertinente"] },
      { causa: "Interruttore centrifugo difettoso",
        catena: ["L'interruttore centrifugo scollega l'avvolgimento di avviamento a regime", "Se non chiude a motore fermo → avvolgimento ausiliario escluso → non parte"],
        conferma: ["verificare continuita interruttore centrifugo a motore fermo"],
        esclude: ["interruttore centrifugo chiuso e funzionante"] }
    ]
  },

  // ─── MOTORE VIBRA / RUMORE ───
  { id: "FEN-09",
    fenomeno: /motore/,
    condizione: /vibra|rumore|cuscinett|battit|striscia/,
    principio: "Le vibrazioni in un motore possono essere di origine meccanica (cuscinetti, squilibrio, allineamento) o elettrica (squilibrio fasi, cortocircuito spire). Il tipo di rumore e la frequenza indicano la causa.",
    area: "meccanica",
    ipotesi: [
      { causa: "Cuscinetti usurati",
        catena: ["Cuscinetti degradati → gioco radiale eccessivo", "Gioco → vibrazioni proporzionali alla velocita", "Rumore metallico crescente con i giri"],
        conferma: ["rumore meccanico che aumenta con la velocita", "gioco percepibile sull'albero a mano"],
        esclude: ["motore gira liscio e silenzioso a vuoto"] },
      { causa: "Squilibrio fasi (trifase)",
        catena: ["Fasi sbilanciate → campo magnetico non uniforme", "Risultato: coppia pulsante → vibrazioni a frequenza 2f (100Hz)"],
        conferma: ["misura correnti sulle 3 fasi: squilibrio > 5%"],
        esclude: ["correnti bilanciate sulle 3 fasi"] }
    ]
  },

  // ─── QUADRO: RONZIO O ARCO ───
  { id: "FEN-10",
    fenomeno: /quadro|centralino|pannello|distribuzione/,
    condizione: /ronzio|ronza|arco|scintill|rumore|puzza/,
    principio: "Un ronzio anomalo in quadro indica vibrazione di componenti sotto carico (contattore, trasformatore) o arco elettrico su contatto degradato. L'arco produce ozono (odore caratteristico) ed e pericoloso.",
    area: "esperienza",
    ipotesi: [
      { causa: "Morsetto con arco elettrico",
        catena: ["Contatto allentato sotto carico → micro-archi", "Arco produce calore localizzato, rumore e ozono", "Pericoloso: rischio incendio"],
        conferma: ["ispezione quadro: segni di annerimento o fusione su morsetto", "odore di bruciato/ozono in quadro"],
        esclude: ["tutti i morsetti integri e serrati"] },
      { causa: "Contattore che vibra (bobina degradata)",
        catena: ["Contattore AC: la bobina produce campo magnetico alternato", "Se il nucleo non chiude bene → vibra a 50Hz → ronzio udibile"],
        conferma: ["ronzio proveniente da contattore specifico", "ronzio diminuisce premendo il contattore"],
        esclude: ["nessun contattore nel quadro"] }
    ]
  },

  // ─── INVERTER / ERRORE ───
  { id: "FEN-11",
    fenomeno: /inverter|vfd|drive|variatore/,
    condizione: /errore|allarme|codice|fault|blocca/,
    principio: "L'inverter converte frequenza e tensione per controllare la velocita del motore. Ha protezioni interne (sovracorrente, sovratensione, sovratemperatura, guasto a terra) che generano codici di errore specifici.",
    area: "elettrotecnica",
    ipotesi: [
      { causa: "Sovracorrente in uscita (cortocircuito cavo o motore)",
        catena: ["Inverter misura corrente in uscita", "Se I > soglia → fault istantaneo per proteggere gli IGBT", "Causa: corto nel cavo motore, isolamento motore degradato, o carico bloccato"],
        conferma: ["misura isolamento cavo motore e avvolgimenti motore", "errore si ripresenta subito alla ripartenza"],
        esclude: ["isolamento cavo e motore OK, errore non si ripresenta"] },
      { causa: "Sovratemperatura inverter",
        catena: ["Semiconduttori (IGBT) generano calore durante la commutazione", "Se ventilazione insufficiente o temperatura ambiente alta → sovratemperatura"],
        conferma: ["ventola inverter ferma o ostruita", "temperatura ambiente elevata nel quadro"],
        esclude: ["ventola funzionante e temperatura quadro nella norma"] }
    ]
  },

  // ─── CALDAIA ───
  { id: "FEN-12",
    fenomeno: /caldaia|riscaldamento|scaldabagno|boiler/,
    condizione: /non accende|non parte|errore|codice|blocca|non scalda/,
    principio: "Una caldaia ha una sequenza di avviamento: richiesta termostato → scheda accensione → valvola gas → elettrodo accensione → fiamma → ionizzazione confermata. Se un passo fallisce, la scheda blocca per sicurezza.",
    area: "componenti",
    ipotesi: [
      { causa: "Problema nella catena di accensione",
        catena: ["La scheda tenta l'accensione: apre gas, attiva elettrodo", "Se non rileva fiamma (ionizzazione) entro il timeout → blocco di sicurezza", "Causa: elettrodo sporco, gas non arriva, scheda difettosa"],
        conferma: ["si sente lo scatto della valvola gas?", "scintilla visibile sull'elettrodo?", "codice errore della scheda"],
        esclude: ["caldaia si accende normalmente e produce fiamma stabile"] },
      { causa: "Termostato o sonda temperatura difettosa",
        catena: ["La caldaia non riceve il segnale di richiesta calore", "Oppure la sonda indica temperatura errata → la scheda non accende"],
        conferma: ["ponticellare i morsetti del termostato: se parte, il termostato e guasto", "misura resistenza sonda e confronto con tabella NTC"],
        esclude: ["termostato correttamente in richiesta e sonda con valori normali"] }
    ]
  },

  // ─── FOTOVOLTAICO ───
  { id: "FEN-13",
    fenomeno: /fotovoltaico|pannell|stringa|solare/,
    condizione: /produzione|bassa|errore|non produce|isolamento/,
    principio: "Un impianto FV produce in proporzione all'irraggiamento. Se la produzione cala rispetto all'atteso: ombreggiamento, pannello degradato, cavo interrotto, inverter in fault, o mismatch nella stringa.",
    area: "elettrotecnica",
    ipotesi: [
      { causa: "Ombreggiamento parziale o sporcizia pannelli",
        catena: ["Anche un'ombra parziale su un modulo puo ridurre la produzione dell'intera stringa", "I diodi di bypass limitano il danno ma riducono la tensione"],
        conferma: ["ispezione visiva: ombre, foglie, sporcizia sui moduli", "produzione diversa tra stringhe"],
        esclude: ["pannelli puliti e senza ombre in tutte le ore"] },
      { causa: "Inverter in errore o limitazione",
        catena: ["L'inverter puo limitare la potenza per sovratemperatura, sovratensione DC, o fault interno"],
        conferma: ["verificare display inverter: errori o limitazioni attive", "confronto potenza DC in ingresso vs AC in uscita"],
        esclude: ["inverter funzionante senza allarmi, potenza AC proporzionale a DC"] }
    ]
  },

  // ─── SQUILIBRIO FASI ───
  { id: "FEN-14",
    fenomeno: /squilibr|sbilanci|fase.*bassa|neutro.*caldo|neutro.*carico/,
    condizione: null,
    principio: "In un sistema trifase equilibrato le correnti di neutro si annullano. Se i carichi sono sbilanciati la corrente di neutro cresce, e con essa le perdite e il rischio di sovraccarico del neutro.",
    area: "elettrotecnica",
    ipotesi: [
      { causa: "Distribuzione carichi sbilanciata tra fasi",
        catena: ["Carichi concentrati su una fase → I_neutro alta", "Neutro sovraccaricato → surriscaldamento"],
        conferma: ["misura correnti sulle 3 fasi e sul neutro", "una fase assorbe molto piu delle altre"],
        esclude: ["correnti bilanciate e neutro sotto carico nominale"] },
      { causa: "Neutro interrotto in sistema trifase",
        catena: ["Senza neutro le tensioni monofasi fluttuano", "Carichi leggeri vedono sovratensione, carichi pesanti vedono sottotensione", "Molto pericoloso per gli apparecchi collegati"],
        conferma: ["tensioni monofasi anomale (alcune alte, alcune basse)", "continuita neutro assente"],
        esclude: ["tensioni monofasi normali (230V ±10%) e neutro integro"] }
    ]
  },

  // ─── PRESA / PUNTO LUCE ───
  { id: "FEN-15",
    fenomeno: /presa|punto luce|lampada|lampadario|plafoniera|faretto/,
    condizione: /non funziona|non accende|non va|spento|morto/,
    principio: "Un punto presa o luce è l'ultimo anello della catena: quadro → protezione → conduttore → interruttore/deviatore → punto. L'analisi parte dal punto e risale verso il quadro.",
    area: "esperienza",
    ipotesi: [
      { causa: "Lampada/carico bruciato",
        catena: ["La causa piu semplice e spesso la piu comune", "Il carico stesso ha finito la sua vita utile"],
        conferma: ["sostituzione lampada/carico con uno noto funzionante"],
        esclude: ["anche il sostitutivo non funziona → guasto nel circuito"] },
      { causa: "Interruttore o deviatore difettoso",
        catena: ["L'interruttore ha contatti interni che si usurano", "Contatto aperto permanente → circuito aperto"],
        conferma: ["misura continuita attraverso l'interruttore in posizione ON"],
        esclude: ["interruttore commuta correttamente"] },
      { causa: "Connessione interrotta nella scatola di derivazione",
        catena: ["Le giunzioni nelle scatole possono allentarsi nel tempo", "Un morsetto sfilato = circuito aperto per quel punto"],
        conferma: ["ispezione scatola di derivazione: un morsetto scollegato"],
        esclude: ["tutte le connessioni salde e integre"] }
    ]
  }
];

// ============================================================
// A2. PRIMI PRINCIPI — per problemi sconosciuti
// ============================================================
//
// Quando nessun fenomeno specifico corrisponde, ROCCO ragiona
// per principi generali. Questa è la capacità di adattarsi
// a situazioni nuove o mai incontrate. (Stern)

var PRIMI_PRINCIPI = [
  { id: "PP-01", nome: "Scomposizione del sistema",
    metodo: "Dividere il sistema in sottosistemi e verificare ciascuno separatamente",
    domanda: "Quale sottosistema funziona e quale no?",
    scopo: "Isolare la sezione guasta" },
  { id: "PP-02", nome: "Half-split (bisezione)",
    metodo: "Verificare a metà percorso tra sorgente e carico. Se OK a meta: guasto nella seconda meta. Se NO: prima meta.",
    domanda: "C'e tensione/continuita a meta del percorso?",
    scopo: "Dimezzare l'area di ricerca ad ogni verifica" },
  { id: "PP-03", nome: "Analisi energetica",
    metodo: "L'energia si conserva (primo principio). Se non arriva al carico, dove va? Dispersione, resistenza parassita, circuito aperto.",
    domanda: "Dove si dissipa l'energia che non arriva al carico?",
    scopo: "Trovare il punto di perdita" },
  { id: "PP-04", nome: "Analisi temporale",
    metodo: "Quando è iniziato il problema? Cosa è cambiato prima? Nuova installazione, temporale, lavori edilizi, aggiunta carico?",
    domanda: "Il problema è improvviso o graduale? Cosa è cambiato?",
    scopo: "Correlare causa e effetto nel tempo" },
  { id: "PP-05", nome: "Confronto A/B",
    metodo: "Confrontare con un sistema identico funzionante. Cosa c'è di diverso?",
    domanda: "Un punto/circuito simile funziona correttamente?",
    scopo: "Evidenziare la differenza che causa il guasto" },
  { id: "PP-06", nome: "Analisi ambientale",
    metodo: "Temperatura, umidita, vibrazioni, polvere, animali possono degradare componenti e isolamenti.",
    domanda: "L'ambiente in cui si trova il componente è aggressivo?",
    scopo: "Identificare cause ambientali non immediatamente evidenti" }
];

// ============================================================
// B. PERCEZIONE — capire cosa succede
// ============================================================
//
// Non solo estrarre keyword, ma comprendere RELAZIONI:
// - causa → effetto (quando X succede → Y accade)
// - temporale (da quando? dopo cosa?)
// - spaziale (dove esattamente?)
// - condizionale (solo quando...)

function percepire(cs) {
  var text = normalize(cs.problem_summary);
  var percezione = {
    fenomeno_principale: null,     // cosa succede
    condizione_temporale: null,    // quando
    localizzazione: null,          // dove
    componenti_menzionati: cs.components_detected.slice(),
    misure_fornite: cs.measurements.slice(),
    gia_provato: [],               // cosa ha già fatto l'utente
    novita: "sconosciuto"          // noto | parziale | sconosciuto
  };

  // Fenomeno principale
  if (/scatt|trip|salt|intervi/.test(text)) percezione.fenomeno_principale = "intervento_protezione";
  else if (/non funziona|non va|non parte|non accende|morto|spento/.test(text)) percezione.fenomeno_principale = "non_funzionamento";
  else if (/surriscald|caldo|brucia|fum|odore/.test(text)) percezione.fenomeno_principale = "surriscaldamento";
  else if (/intermittente|a volte|ogni tanto|saltuari/.test(text)) percezione.fenomeno_principale = "guasto_intermittente";
  else if (/motore/.test(text)) percezione.fenomeno_principale = "guasto_motore";
  else if (/ronzio|arco|rumore/.test(text)) percezione.fenomeno_principale = "rumore_anomalo";
  else if (/errore|codice|fault|allarme/.test(text)) percezione.fenomeno_principale = "errore_dispositivo";

  // Condizione temporale
  if (/da ieri|da stamattina|da quando|dopo.*temporal|dopo.*pioggia/.test(text)) percezione.condizione_temporale = "recente_correlato";
  else if (/sempre|da sempre|mai funzionato/.test(text)) percezione.condizione_temporale = "cronico";
  else if (/a volte|ogni tanto|random/.test(text)) percezione.condizione_temporale = "intermittente";

  // Localizzazione
  if (/cucina|bagno|camera|soggiorno|cantina|garage|esterno|giardino|balcone/.test(text))
    percezione.localizzazione = text.match(/cucina|bagno|camera|soggiorno|cantina|garage|esterno|giardino|balcone/)[0];

  // Cosa ha già provato
  if (/ho provato|ho verificato|ho misurato|ho cambiato|ho sostituito/.test(text))
    percezione.gia_provato.push(text.match(/ho (?:provato|verificato|misurato|cambiato|sostituito)[^.!?]*/)[0]);

  // Classificazione novità
  var fenomeniMatch = 0;
  FENOMENI.forEach(function(f) {
    if (f.fenomeno.test(text)) fenomeniMatch++;
  });
  if (fenomeniMatch > 0) percezione.novita = fenomeniMatch > 1 ? "noto" : "parziale";

  return percezione;
}

// ============================================================
// C. MODELLO DEL SISTEMA — cos'è, come dovrebbe funzionare
// ============================================================

var SISTEMI = [
  { id: "protezione_differenziale", match: /differenziale|rcd|rcbo|salvavita|id\b/,
    funzionamento: "protegge dalle correnti di dispersione verso terra", atteso: "non interviene in condizioni normali" },
  { id: "protezione_sovracorrente", match: /magnetotermico|mcb|fusibile|termico|automatico/,
    funzionamento: "protegge da sovraccarico e cortocircuito", atteso: "non interviene se I < In" },
  { id: "sistema_motore", match: /motore|avviamento|trifase|contattore|inverter|vfd/,
    funzionamento: "converte energia elettrica in meccanica", atteso: "gira, produce coppia, silenzioso" },
  { id: "quadro_distribuzione", match: /quadro|distribuzione|sbarra|centralino/,
    funzionamento: "distribuisce energia ai circuiti", atteso: "silenzioso, morsetti freddi, protezioni chiuse" },
  { id: "impianto_utilizzatore", match: /presa|interruttore|punto luce|lampada|lampadario|luce|faretto/,
    funzionamento: "alimenta il carico finale", atteso: "tensione presente, carico funzionante" },
  { id: "impianto_fotovoltaico", match: /fotovoltaico|inverter solare|pannell|stringa|solare/,
    funzionamento: "converte luce solare in energia elettrica", atteso: "produce in proporzione all'irraggiamento" },
  { id: "sistema_termico", match: /caldaia|riscaldamento|termostato|scaldabagno|boiler/,
    funzionamento: "genera calore per riscaldamento o ACS", atteso: "si accende su richiesta, produce acqua calda" },
  { id: "impianto_domotico", match: /knx|dali|domotica|bus|attuatore/,
    funzionamento: "controlla dispositivi via bus di comunicazione", atteso: "comandi eseguiti, comunicazione attiva" },
  { id: "sistema_ups", match: /ups|continuita|batteria|gruppo/,
    funzionamento: "fornisce alimentazione di riserva", atteso: "commuta su batteria senza interruzione" },
  { id: "wallbox_ev", match: /wallbox|colonnina|ricarica|ev\b/,
    funzionamento: "ricarica veicoli elettrici", atteso: "eroga corrente secondo il protocollo di ricarica" }
];

function buildSystemModel(cs) {
  var text = normalize(cs.problem_summary);
  var systemType = "generico";
  var sys = null;
  var i;

  for (i = 0; i < SISTEMI.length; i++) {
    if (SISTEMI[i].match.test(text)) { sys = SISTEMI[i]; systemType = sys.id; break; }
  }

  // Discrepanza: cosa dovrebbe fare vs cosa fa
  var expected = sys ? sys.atteso : "funzionamento normale";
  var discrepancy = "";

  if (/scatt|salt|intervi|trip/.test(text)) {
    discrepancy = "protezione interviene → guasto, sovraccarico, o dispersione";
  } else if (/non funziona|non accende|non parte|non va|morto|spento/.test(text)) {
    discrepancy = "non funziona → circuito aperto, alimentazione mancante, o guasto interno";
  } else if (/surriscald|caldo|brucia|odore|fonde|annerit|fum/.test(text)) {
    discrepancy = "surriscaldamento → effetto Joule eccessivo (R alta o I alta)";
  } else if (/intermittente|a volte|random|saltuari|ogni tanto/.test(text)) {
    discrepancy = "guasto intermittente → condizione al limite, contatto instabile";
  } else if (/rumore|ronzio|vibra|arco/.test(text)) {
    discrepancy = "rumore anomalo → componente degradato, contatto con arco, o vibrazione meccanica";
  } else if (/errore|codice|fault|allarme/.test(text)) {
    discrepancy = "dispositivo segnala errore → protezione interna attiva";
  }

  return {
    type: systemType,
    funzionamento: sys ? sys.funzionamento : null,
    components: cs.components_detected.slice(),
    expected_behavior: expected,
    actual_behavior: s(cs.problem_summary),
    discrepancy: discrepancy
  };
}

// ============================================================
// D. RAGIONAMENTO — il cuore dell'intelligenza
// ============================================================
//
// ROCCO ragiona in 3 modalità (Gardner: intelligenze multiple):
//
// 1. RAGIONAMENTO DA CONOSCENZA — applica ciò che ha studiato
//    (fenomeni noti → ipotesi con catena deduttiva)
//
// 2. RAGIONAMENTO PER PRIMI PRINCIPI — per problemi nuovi
//    (leggi fisiche generali → ipotesi per esclusione)
//
// 3. RAGIONAMENTO PER ANALOGIA — casi simili già risolti
//    (memoria casi validati → ipotesi per somiglianza)
//
// La strategia dipende dalla classificazione del problema:
//   noto → modalità 1 + 3
//   parziale → modalità 1 + 2 + 3
//   sconosciuto → modalità 2 + 3

function makeHypothesis(label, reason, source, confirmTests, denyTests, catena) {
  return {
    label: s(label), reason: s(reason), source: source || "unknown",
    catena: arr(catena),
    supporting_evidence: [], contradicting_evidence: [],
    confirm_tests: arr(confirmTests), deny_tests: arr(denyTests),
    confidence: "possible", status: "active", rejection_reason: null,
    // Probabilità del simulatore causale, quando l'ipotesi viene da lì.
    // Prima finiva solo nella catena come frase ("probabilità 45%"): non era
    // leggibile da nessuno. Serve a scegliere quale ipotesi rappresenta una
    // famiglia confermata, invece di prendere la prima generata.
    probabilita: null
  };
}

// D1. Ragionamento da conoscenza (fenomeni studiati)
function ragionaPerConoscenza(cs) {
  var text = normalize(cs.problem_summary);
  var hyps = [];

  FENOMENI.forEach(function(fen) {
    // Il fenomeno corrisponde?
    if (!fen.fenomeno.test(text)) return;
    // Se ha una condizione aggiuntiva, deve matchare anche quella
    if (fen.condizione && !fen.condizione.test(text)) return;

    fen.ipotesi.forEach(function(ip) {
      hyps.push(makeHypothesis(
        ip.causa,
        fen.principio,
        fen.area,
        ip.conferma, ip.esclude,
        ip.catena
      ));
    });
  });

  return hyps;
}

// D2. Ragionamento per primi principi (problemi nuovi)
function ragionaPerPrincipi(cs) {
  var text = normalize(cs.problem_summary);
  var hyps = [];

  // Se il problema ha elementi concreti ma nessun fenomeno specifico,
  // applica i primi principi per generare domande e ipotesi generali
  if (/non funziona|non va|guasto|problema|difett/.test(text)) {
    hyps.push(makeHypothesis(
      "Causa da localizzare tramite scomposizione",
      "Nessun fenomeno specifico identificato. Applico metodo di scomposizione (PP-01): dividere il sistema in parti e verificare ciascuna.",
      "primi_principi",
      [PRIMI_PRINCIPI[0].domanda, PRIMI_PRINCIPI[1].domanda],
      [],
      ["Problema generico senza fenomeno specifico", "Applico scomposizione del sistema", "Verifico ciascun sottosistema separatamente"]
    ));
  }

  if (/improvvis|cambiato|dopo|da quando/.test(text)) {
    hyps.push(makeHypothesis(
      "Causa correlata a cambiamento recente",
      "Analisi temporale (PP-04): un guasto improvviso è spesso correlato a un evento recente — lavori, temporale, aggiunta carico, modifica impianto.",
      "primi_principi",
      [PRIMI_PRINCIPI[3].domanda],
      [],
      ["Il guasto è improvviso, non graduale", "Cerco correlazione temporale con un evento", "Cosa è cambiato prima del guasto?"]
    ));
  }

  return hyps;
}

// D3. Ragionamento per analogia (casi simili)
function ragionaPerAnalogia(cs) {
  var hyps = [];
  try {
    var casi = memory.findRelevantClosedCases(cs, 2);
    arr(casi).forEach(function(caso) {
      if (!caso || !caso.confirmed_cause || caso.match_score < 0.25) return;
      hyps.push(makeHypothesis(
        caso.confirmed_cause,
        "Caso simile risolto (score " + caso.match_score + "): " + s(caso.summary).substring(0, 80),
        "caso_validato",
        arr(caso.decisive_checks).slice(0, 2), [],
        ["Caso simile trovato nella memoria", "Causa confermata: " + caso.confirmed_cause, "Verificare se le condizioni corrispondono"]
      ));
    });
  } catch (e) { /* memoria non disponibile */ }
  return hyps;
}

// D4. Ragionamento da knowledge base locale
// Sinonimi italiani per matching KB — portati da diagnosticEngine.SYNONYM_MAP
var KB_SINONIMI = {
  "salvavita": "differenziale", "differenziali": "differenziale",
  "magnetotermica": "magnetotermico", "magneto": "magnetotermico",
  "interruttore": "magnetotermico", "interruttori": "magnetotermico",
  "corto": "cortocircuito", "curtocircuito": "cortocircuito",
  "motori": "motore", "elettromotore": "motore",
  "conduttore": "cavo", "conduttori": "cavo", "cavi": "cavo", "linea": "cavo",
  "pannello": "quadro", "armadio": "quadro",
  "voltaggio": "tensione", "alimentazione": "tensione",
  "sovraccarichi": "sovraccarico",
  "boiler": "scaldabagno", "caldaie": "caldaia",
  "fotovoltaico": "fotovoltaico", "solare": "fotovoltaico",
  "fusibili": "fusibile",
  "avvolgimento": "avvolgimenti", "bobine": "bobina"
};

function applicaSinonimo(word) {
  return KB_SINONIMI[word] || word;
}

function ragionaDaKnowledge(cs) {
  var hyps = [];
  try {
    var kb = require("../knowledge").getLoadedKnowledge();
    if (!kb || !kb.failurePatterns) return hyps;
    var words = normalize(cs.problem_summary).split(" ").filter(function(w) { return w.length > 3; });
    if (!words.length) return hyps;

    // Espandi con sinonimi
    var expandedWords = [];
    for (var w = 0; w < words.length; w++) {
      expandedWords.push(words[w]);
      var syn = applicaSinonimo(words[w]);
      if (syn !== words[w]) expandedWords.push(syn);
    }

    arr(kb.failurePatterns).forEach(function(p) {
      if (!p || !p.symptom) return;
      var sym = normalize(p.symptom);
      var hits = 0;
      expandedWords.forEach(function(w) { if (sym.indexOf(w) >= 0) hits++; });
      if (hits < 2) return;
      arr(p.likely_causes).slice(0, 2).forEach(function(cause) {
        hyps.push(makeHypothesis(
          s(cause).substring(0, 120),
          "Pattern " + s(p.id) + ": " + s(p.symptom).substring(0, 80),
          "knowledge", arr(p.checks).slice(0, 2), [],
          ["Pattern di guasto dalla knowledge base"]
        ));
      });
    });
  } catch (e) { /* knowledge non disponibile */ }
  return hyps;
}

// D5. Ipotesi dal safety seed (motore deterministico legacy)
function ragionaDaSafetySeed(cs) {
  return arr(cs.hypotheses_active).map(function(h) {
    return makeHypothesis(h.label, h.reason, "motore_deterministico", [], [],
      ["Ipotesi dal motore diagnostico deterministico"]);
  });
}

// D6. Strategia adattiva — sceglie come ragionare
function ragiona(cs, percezione) {
  var all = [];

  // Sempre: conoscenza studiata + safety seed
  all = all.concat(ragionaPerConoscenza(cs));
  all = all.concat(ragionaDaSafetySeed(cs));

  // Se poco dalla conoscenza: primi principi + knowledge
  if (all.length < 2 || percezione.novita === "sconosciuto") {
    all = all.concat(ragionaPerPrincipi(cs));
    all = all.concat(ragionaDaKnowledge(cs));
  }

  // Sempre: analogia con casi validati (se disponibile)
  all = all.concat(ragionaPerAnalogia(cs));

  // Deduplica per label normalizzata
  var seen = {};
  return all.filter(function(h) {
    var key = normalize(h.label).substring(0, 60);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

// ============================================================
// E. KILL RULES — leggi fisiche che escludono ipotesi
// ============================================================
//
// Se una misura reale contraddice un'ipotesi per legge fisica,
// l'ipotesi viene eliminata con certezza. Una misura vale più
// di qualsiasi opinione.

// ── Esclusioni dichiarate dall'utente ──────────────────────────────────
//
// Le kill rules non possono leggere tutto il racconto dell'utente: una
// descrizione nominale ("impianto 230V") non è una misura, e usarla come
// prova escluderebbe ipotesi ancora valide. Qui si estraggono SOLO le
// frasi in cui l'utente dichiara di aver verificato o escluso qualcosa.
// I pattern sotto sono ricavati dalle 21 domande italiane reali di
// rocco_v2/neural/casi_reali_forum.js, non da frasi di comodo: un cliente
// non scrive "ho sostituito il componente ma il problema persiste", scrive
// "lampadina nuova, interruttore nuovo, continua uguale". Chi modifica
// questi pattern li rimisuri su quel corpus (vedi kill_rules.test.js §11).
var USER_EXCLUSION_PATTERNS = [
  // "anche con tutte le prese staccate", "anche a vuoto", "anche senza carico"
  /anche (?:con|senza|a|se)\b[^.;!?]{0,80}/g,
  // "ho staccato / scollegato / provato / sostituito / misurato / verificato ..."
  /(?:ho|abbiamo|hanno)\s+(?:gia\s+)?(?:staccat\w*|scollegat\w*|provat\w*|sostituit\w*|misurat\w*|verificat\w*|controllat\w*|cambiat\w*|testat\w*|serrat\w*)\b[^.;!?]{0,90}/g,
  // "con tutto staccato", "con tutte le prese staccate", "senza niente collegato"
  /(?:con|senza)\s+(?:tutt\w*|niente|nessun\w*)\b[^.;!?]{0,60}/g,
  /\ba vuoto\b[^.;!?]{0,40}/g,
  // "il differenziale non scatta mai", "non succede con ..."
  // Si cattura anche il soggetto che precede: senza di esso la frase
  // perde il riferimento ("non scatta mai" non dice COSA non scatta).
  /[^.;!?]{0,45}\bnon\s+(?:scatta|salta|interviene|succede|si verifica)\b[^.;!?]{0,70}/g,
  // "solo quando accendo...", "solo di sera", "solo in bagno": qualunque
  // clausola con "solo" è una condizione discriminante, ed è sempre utile.
  /\bsolo\b[^.;!?]{0,70}/g,

  // "Lampadina nuova, interruttore nuovo" (caso 5): la sostituzione
  // dichiarata senza il verbo. È la forma più comune nel corpus reale.
  /\b(?:lampadin\w*|lampad\w*|interruttor\w*|differenzial\w*|magnetotermic\w*|pres[ae]|cav[oi]|sensor\w*|termostat\w*|sched\w*|motor\w*|pomp\w*|valvol\w*|resistenz\w*|fusibil\w*|rel[eè]|contattor\w*|batteri\w*|alimentator\w*)\s+(?:nuov[oaie]|appena (?:cambiat|sostituit|install|mess)\w*)/gi,

  // "continua uguale", "non cambia niente", "resta lo stesso" (caso 5)
  /(?:continua|continuano|resta|restano|rimane|rimangono)\s+(?:uguale|identic\w*|lo stesso|come prima|tutto uguale)|non cambia (?:niente|nulla)/gi,

  // "Le altre prese vanno", "Le luci funzionano" (casi 3, 14): il guasto
  // è circoscritto a una linea, e questo esclude le cause a monte comuni.
  /\b(?:le|gli|i)\s+altr[aeio]\w*[^.;!?]{0,40}(?:vanno|funzionano|van bene|sono ok|a posto)|\b(?:le luci|le altre prese|gli altri circuiti)\s+(?:funzionano|vanno)/gi,

  // "D'inverno non succedeva", "Ieri sera funzionava" (casi 6, 10):
  // il guasto è comparso, quindi qualcosa è cambiato.
  /\b(?:prima|ieri|stamattina|d['\s]inverno|d['\s]estate|l['\s]anno scorso|fino a (?:ieri|poco|qualche))\b[^.;!?]{0,60}/gi,

  // "a volte per mesi non succede" (caso 17), "non succedeva"
  /non (?:succede|succedeva|capita|capitava|si presenta|si presentava)\b[^.;!?]{0,50}/gi,

  // "scatta quando piove" (casi 9, 21), "quando accendo la lavatrice" (1):
  // la condizione che innesca il guasto è la prova discriminante migliore.
  /\bquando\s+(?:piove|fa caldo|fa freddo|c['\s]?[eè] umidit|accendo|accende|uso|usa|parte|si avvia|arriva)\w*[^.;!?]{0,60}/gi,

  // "nessun errore sull'inverter", "i pannelli sembrano ok" (caso 13)
  /\bnessun\w*\s+(?:errore|allarme|anomalia|segnalazione|codice)\b[^.;!?]{0,40}|\bsembran?o?\s+(?:ok|a posto|buoni|integri|normali)\b/gi,

  // "staccando di volta in volta tutti i fili sono riuscito a trovare
  // quello incriminato" (caso 16): la prova di sezionamento già eseguita.
  /\b(?:staccand|scollegand|sezionand|provand|escludend)\w*[^.;!?]{0,70}/gi
];

function extractUserExclusions(text) {
  var src = s(text);
  var found = [];
  USER_EXCLUSION_PATTERNS.forEach(function(re) {
    var rx = new RegExp(re.source, "gi");
    var m;
    while ((m = rx.exec(src)) !== null) {
      found.push(m[0]);
      if (m.index === rx.lastIndex) rx.lastIndex += 1;
    }
  });
  return found.join(" . ");
}

// Sinonimi italiani di "la protezione sta scattando".
//
// Il cliente non dice "è intervenuto il dispositivo di protezione": dice
// "uno non resta su, fa TRAC e ricade subito". Tarato sulle 21 domande
// italiane di casi_reali_forum.js — con le sole parole tecniche
// (scatta/salta/interviene/sgancia) la prima versione copriva metà dei casi
// e lasciava passare proprio quello del cortocircuito.
//
// Serve a CF-04: a valle di una protezione aperta zero volt è la normalità,
// non un'interruzione del conduttore.
var PROTECTION_TRIPPING_PATTERN = /scatt|salt|intervi|sgancia|riarm|non (?:resta|sta|rest|rimane) su|ricade|non tiene|va giu|torna giu|cade subito|trac/;

// Sinonimi italiani di "tutto scollegato": l'utente lo dice in dieci modi.
var NO_LOAD_PATTERN =/a vuoto|tutto staccat|tutti staccat|tutto scollegat|niente (?:attaccat|collegat|inserit)|nessun carico|senza carico|senza niente|carich\w* (?:staccat|scollegat)|(?:prese|utenze|carichi|utilizzatori) (?:staccat|scollegat|disinserit)|scolleg\w* (?:tutt|i carich|le utenze|le prese)|staccat\w* (?:tutt|i carich|le utenze|le prese)/;

// ── Pertinenza: famiglie di ipotesi e impianti a cui si applicano ──────
//
// Su una lavatrice in appartamento ROCCO esponeva "Dispersione DC verso
// terra: pannello con celle rotte, bypass diode guasto, cavo MC4" e "Cavo di
// terra con perdita di isolamento a valle del relè". Misurato sui 21 casi
// italiani: 42 ipotesi attive su 234 appartenevano a una famiglia che il
// racconto non giustifica, e 5 di esse finivano fra le 4 **stampate**.
//
// Ogni famiglia ha due regex: `label` la identifica, `story` elenca i
// marcatori che la rendono applicabile. Se l'etichetta è della famiglia e il
// racconto non ha nessun marcatore, l'ipotesi è fuori contesto.
//
// È una RETROCESSIONE, non un'esclusione, e la differenza è il punto: la
// famiglia è un'euristica sul linguaggio, non una legge fisica. L'ipotesi
// resta viva, disponibile, e torna su se l'utente nomina ciò che manca —
// cosa che ora il multi-turn permette. Uccidere qui costerebbe cause vere.
//
// I marcatori di `rele` sono più larghi di quanto sembri necessario, e lo
// sono per una ragione misurata: con una prima versione più stretta
// venivano dichiarate fuori contesto la causa vera di FORUM-IT-010
// ("contatto del contattore degradato", su un racconto che parla di motore
// trifase e compressore ma non nomina il contattore) e quella di
// FORUM-SPEC-001 ("relè crepuscolare", su "le luci si accendono da sole").
// Un motore, un compressore, un condizionatore, una caldaia, una pompa
// contengono organi di commutazione anche quando il cliente non li nomina.
var DOMAIN_FAMILIES = [
  { id: "fotovoltaico",
    label: /fotovoltaic|pannell|celle rotte|\bmc4\b|bypass diode|stringa/,
    story: /fotovoltaic|\bfv\b|pannell|solare|stringa|\bmc4\b|inverter/ },

  { id: "automazione",
    label: /\bplc\b|segnale enable|segnale run|pull up|conduttore 0v|uscita non isolata/,
    story: /\bplc\b|automazion|macchina|industrial|quadro di comando|scheda/ },

  { id: "commutazione",
    label: /\brele\b|contattor|bobina|soppression/,
    story: /\brele\b|contattor|bobina|motore|compressor|condizionator|caldaia|pompa|macchina|si accendono da sole|crepuscolar|timer/ },

  { id: "illuminazione_elettronica",
    label: /\bled\b|driver led|dimmer/,
    story: /\bled\b|faretto|striscia|dimmer|driver|lampadin|luce|luci/ }
];

/**
 * L'ipotesi appartiene a una famiglia che questo impianto non giustifica?
 *
 * Si legge il RACCONTO, non le prove: è la stessa dottrina di KR-11 —
 * l'applicabilità strutturale non è una misura, è il contesto.
 */
function outOfDomainFamilies(label, story) {
  var lab = normalize(label);
  var st = normalize(story);
  return DOMAIN_FAMILIES.filter(function(fam) {
    return fam.label.test(lab) && !fam.story.test(st);
  }).map(function(fam) { return fam.id; });
}

function isOutOfDomain(label, story) {
  return outOfDomainFamilies(label, story).length > 0;
}

// ── Confirm rules: la misura che CONFERMA, non solo quella che esclude ──
//
// Il motore sapeva solo escludere. KR-01 legge l'isolamento per uccidere
// "dispersione" quando è ≥ 1 MΩ, ma nessuno leggeva il caso simmetrico —
// isolamento SOTTO soglia, cioè dispersione accertata. Risultato misurato
// sui 21 casi italiani: 18 `non_verifiable` e 3 `confirmed`, e quei 3 erano
// arresti di sicurezza con zero ipotesi. ROCCO non concludeva mai.
//
// Stessa grammatica delle kill rules (`ruleTriggered`), direzione opposta:
// `confirms` è il regex sull'etichetta dell'ipotesi da confermare.
//
// Regola di mestiere, non di comodo: si confermano solo soglie che il
// motore già calcola come fatti (isolation_low è marcato a 0.98 da
// diagnosticEngine.js) o un valore numerico letto da `measure()`. Mai una
// frase: "non arriva tensione" è il sintomo, non una misura — KR-02 lo dice
// già per l'esclusione e vale identico per la conferma.
//
// NON c'è una regola sulla corrente di dispersione in mA, e la sua assenza
// è deliberata: in italiano "30 mA" è quasi sempre la **taratura** del
// differenziale ("ho un differenziale da 30 mA"), non una dispersione
// misurata. Una confirm rule su quel numero confermerebbe la dispersione a
// chiunque nomini il proprio salvavita. Serve prima un estrattore che
// distingua taratura da misura.
var CONFIRM_RULES = [
  // Soglia CEI 64-8 per i circuiti BT: sotto 1 MΩ l'isolamento è guasto.
  { id: "CF-01",
    when: function(ctx) {
      var iso = ctx.measure("isolamento");
      return iso !== null ? iso < limiti.valore("isolamento_minimo") : ctx.facts.isolation_low === true;
    },
    confirms: /dispersione|isolament|verso terra|guasto.*terra/,
    reason: "Isolamento misurato sotto " + limiti.etichetta("isolamento_minimo") + ": dispersione verso terra accertata" },

  // Morsetto caldo = resistenza di contatto: la temperatura è la prova.
  { id: "CF-02",
    when: function(ctx) {
      var t = ctx.measure("temperatura");
      return t !== null ? t >= limiti.valore("temperatura_connessione") : ctx.facts.temperature_high === true;
    },
    confirms: /contatto.*resistiv|morsetto.*allentat|serraggio|surriscald|sovratemperatur/,
    reason: "Temperatura oltre il limite su un punto di connessione: contatto resistivo accertato" },

  // Resistenza prossima a zero dove non deve esserci continuità.
  // Il contesto è obbligatorio: la resistenza bassa di un avvolgimento è
  // normale, non è un cortocircuito.
  { id: "CF-03",
    context: [/cortocircuito|corto|fase.*neutro|neutro.*fase/],
    when: function(ctx) {
      var r = ctx.measure("resistenza");
      // measure() normalizza in MΩ: 1e-4 MΩ = 100 Ω.
      // Un cortocircuito è continuità dove non dovrebbe essercene: il
      // numero giusto è quello del conduttore sano (1 Ohm, CEI 64-8/6),
      // non quello della resistenza di contatto, che è un'altra grandezza.
      // measure() normalizza in MOhm, il limite è in Ohm.
      return r !== null && r < limiti.valore("continuita_conduttore") / 1000000;
    },
    confirms: /cortocircuito|corto.*circuito/,
    reason: "Resistenza prossima a zero fra i conduttori: cortocircuito accertato" },

  // Tensione MISURATA prossima a zero: non la frase "non arriva corrente".
  //
  // Il contesto esclude i casi in cui una protezione è scattata: a valle di
  // un magnetotermico aperto zero volt è la normalità, non un'interruzione —
  // confermarla manderebbe l'elettricista a cercare un conduttore tranciato
  // quando il circuito è semplicemente sezionato. Il lookahead nega
  // sull'intero racconto, che `ruleTriggered` passa già normalizzato.
  { id: "CF-04",
    context: [new RegExp("^(?!.*(?:" + PROTECTION_TRIPPING_PATTERN.source + "))")],
    when: function(ctx) {
      var v = ctx.measure("tensione");
      return v !== null && v < limiti.valore("tensione_contatto_limite");
    },
    confirms: /interruzione|conduttore.*interrott|circuito.*aperto|alimentazione.*assente|mancanza.*alimentazione/,
    reason: "Tensione misurata assente nel punto di prova: interruzione accertata a monte" },

  // Corrente oltre il calibro: sovraccarico, non dispersione.
  { id: "CF-05",
    fact: "high_current",
    confirms: /sovraccarico|carico.*eccessiv|sovracorrente/,
    reason: "Corrente misurata oltre il riferimento di calibro: sovraccarico accertato" }
];

var KILL_RULES = [
  // Misura strumentale: si legge il VALORE, non la forma della frase.
  // L'isolamento sano a 1 MOhm è la soglia CEI 64-8 per i circuiti BT.
  { id: "KR-01",
    when: function(ctx) {
      var iso = ctx.measure("isolamento");
      return iso !== null ? iso >= limiti.valore("isolamento_minimo") : ctx.facts.isolation_high === true;
    },
    kills: /dispersione|verso terra|isolament/,
    reason: "Isolamento misurato >= 1 MOhm: esclude la dispersione verso terra (CEI 64-8)" },

  // Tensione PRESENTE va dedotta da una verifica, non dal valore nominale
  // dell'impianto: "impianto 230V" non dice nulla sul punto guasto.
  { id: "KR-02",
    // La negazione annulla la prova: "non arriva tensione" non è una
    // verifica di tensione presente, è il sintomo.
    when: function(ctx) { return !/non arriva|non c'e|non ce|manca|assente/.test(ctx.text); },
    signals: [/ho (?:misurat|verificat|controllat)\w*|tensione (?:present|c'e|regolare|ok)|arriva (?:la )?tensione|alimentazione ok/, /230|400|tensione|alimentazione/],
    kills: /assenza.*alimentazione|manca.*tensione|manca.*corrente|non arriva.*tensione/,
    reason: "Tensione verificata presente: esclude l'assenza di alimentazione" },
  { id: "KR-03", signal: /continuita.*ok|continuita.*present/,
    kills: /interruzione|circuito.*aperto|conduttore.*interrotto/, reason: "Continuita presente esclude interruzione" },
  { id: "KR-04", signal: /corrente.*sotto|corrente.*inferiore|corrente.*ok|corrente.*<.*in/,
    kills: /sovraccarico/, reason: "Corrente sotto il calibro esclude sovraccarico" },
  { id: "KR-05", signal: /scatta.*istantan|trip.*istantan|intervento.*istantan/,
    kills: /sovraccarico.*termico|sovraccarico.*prolungat/, reason: "Intervento istantaneo = magnetico, non termico" },
  { id: "KR-06", signal: /scatta.*dopo.*minut|scatta.*sotto.*carico.*prolungat/,
    kills: /cortocircuito/, reason: "Intervento ritardato = termico, non magnetico (cortocircuito)" },
  { id: "KR-07", signal: /solo.*differenziale|differenziale.*scatta.*magnetotermico.*no/,
    kills: /sovraccarico|cortocircuito/, reason: "Solo differenziale = dispersione, non sovracorrente" },
  { id: "KR-08", signal: /solo.*magnetotermico|magnetotermico.*scatta.*differenziale.*no/,
    kills: /dispersione|terra/, reason: "Solo magnetotermico = sovracorrente, non dispersione" },
  { id: "KR-09", signal: /morsetti.*serrat|morsetti.*ok|morsetti.*verificat/,
    kills: /morsetto.*allentato|contatto.*resistiv|contatto.*instabile/, reason: "Morsetti verificati escludono contatto allentato" },
  // Scatta anche a vuoto: il guasto non può stare in un carico, perché i
  // carichi non ci sono. Prima la regola pretendeva l'ordine
  // "carico scollegato ... scatta": in italiano la frase arriva in
  // entrambi gli ordini ("scatta anche con tutte le prese staccate"),
  // e così non scattava mai.
  { id: "KR-10",
    context: [/scatt|salt|intervi|sgancia/],
    signals: [NO_LOAD_PATTERN],
    kills: /guasto.*carico|carico.*difettoso|elettrodomestico|guasto interno a un carico|^dispersione su carico$|carichi in standby/,
    reason: "Interviene anche con i carichi scollegati: il guasto non è in un carico" },

  // Impianto civile monofase: le ipotesi da quadro industriale non si
  // applicano. Il guardia si basa sul TESTO dell'utente, non sui componenti
  // riconosciuti, che su frasi brevi danno falsi positivi.
  { id: "KR-11",
    when: function(ctx) {
      // Applicabilità strutturale: si legge il racconto, non le prove.
      // Un'ipotesi da quadro industriale su un impianto civile non è
      // "non verificata", è fuori contesto.
      if (!/230|civil|appartament|abitazion|\bcasa\b|monofas/.test(ctx.story)) return false;
      return !/trifas|400\s*v|motore|salvamotore|contattore|inverter|pompa|compressor|macchina|quadro industrial/.test(ctx.story);
    },
    kills: /trifas|perdita di fase|squilibr\w* (?:di )?fase|bimetallico|salvamotore|rele termico|avviament\w* ravvicinat|soft starter|inverter|vfd/,
    reason: "Impianto civile monofase: esclude guasti di quadro industriale e azionamenti motore" },

  // Intervento del solo magnetotermico con differenziale fermo: sovracorrente,
  // non dispersione. Versione indipendente dall'ordine delle parole.
  { id: "KR-12",
    context: [/magnetoterm|mcb|automatico/],
    signals: [/differenziale (?:non|mai) (?:scatta|salta|interviene)|non (?:scatta|salta|interviene) il differenziale|senza che (?:scatti|salti) il differenziale/],
    kills: /dispersione|verso terra|isolament/,
    reason: "Scatta solo il magnetotermico, il differenziale no: sovracorrente, non dispersione" },

  // Componente appena sostituito e problema invariato: quel componente è sano.
  // La prima versione pretendeva "ho sostituito X ma il problema persiste":
  // una frase che nessun cliente scrive. Nel corpus reale la forma è
  // "Lampadina nuova, interruttore nuovo, continua uguale" (caso 5).
  { id: "KR-13",
    signals: [/ho (?:sostituit|cambiat)\w*|appena (?:sostituit|cambiat|install|mess)\w*|nuovo di fabbrica|(?:lampadin|lampad|interruttor|differenzial|magnetotermic|pres|cav|sensor|termostat|sched|motor|pomp|valvol|resistenz|fusibil|rel|contattor|batteri|alimentator)\w*\s+nuov[oaie]/,
              /(?:ma|e)\s+(?:il problema|lo stesso|uguale|non cambia|continua|persiste|scatta ancora|sempre)|continua\s+(?:uguale|identic\w*|lo stesso|come prima)|non cambia (?:niente|nulla)|resta uguale/],
    kills: /difettoso|a fine vita|guasto interno al dispositivo|dispositivo guasto/,
    reason: "Componente sostituito e sintomo invariato: il dispositivo non era la causa" }
];

// Conversione a MOhm: l'utente può scrivere kOhm, Ohm o MOhm.
var RESISTANCE_TO_MOHM = { "mω": 1, "mohm": 1, "kω": 0.001, "kohm": 0.001, "ω": 0.000001, "ohm": 0.000001 };

/**
 * Evidenze in forma STRUTTURATA, non una stringa appiattita.
 *
 * Una regola come "isolamento sano esclude la dispersione" deve leggere il
 * VALORE misurato (50 MOhm), non sperare che il testo contenga il simbolo
 * ">". Prima era un regex sul testo e la misura dell'utente veniva ignorata.
 *
 * Due campi testuali, con ruoli diversi e non interscambiabili:
 *
 *  text  → PROVE: evidenze del motore + le sole frasi in cui l'utente
 *          dichiara di aver verificato o escluso qualcosa. Solo questo
 *          campo può innescare un'esclusione.
 *  story → CONTESTO: tutto il racconto. Dice che impianto è e qual è il
 *          sintomo, e serve a restringere il campo di applicazione di una
 *          regola. Non è una prova: "impianto 230V" non dimostra che la
 *          tensione sia presente al punto guasto.
 *
 *  facts     → chiavi di evidenza derivate dal motore (isolation_high, ...)
 *  measure() → valore numerico per grandezza, normalizzato (isolamento in MOhm)
 */
var PRIOR_CONTEXT_MARK = "[CONTESTO PRECEDENTE]";

/**
 * Riporta il contesto dei turni precedenti dentro problem_summary.
 *
 * Idempotente: può essere chiamata più volte nel flusso senza accodare due
 * volte lo stesso testo. Serve perché problem_summary viene riscritto dal
 * merge del safety guard, e da problem_summary dipendono sia il racconto
 * (`story`, l'ambito) sia le prove (`text`, via extractUserExclusions):
 * senza questa riapplicazione quello che l'utente ha già escluso o misurato
 * nei turni precedenti sparisce dal ragionamento.
 */
function applyPriorContext(cs) {
  if (!cs || !cs.prior_context) return;
  var summary = s(cs.problem_summary);
  if (summary.indexOf(PRIOR_CONTEXT_MARK) !== -1) return;
  cs.problem_summary = summary + "\n\n" + PRIOR_CONTEXT_MARK + "\n" + cs.prior_context;
}

function buildEvidenceContext(cs) {
  var facts = {};
  var measures = {};

  arr(cs.facts_confirmed).forEach(function(f) {
    var t = s(f);
    if (lexicon.isMachineToken(t)) facts[t.toLowerCase()] = true;
  });

  arr(cs.measurements).forEach(function(m) {
    if (!m || typeof m !== "object") return;
    var type = normalize(m.type || m.key);
    var value = typeof m.value === "number" ? m.value : parseFloat(m.value);
    if (!type || isNaN(value)) return;
    var unit = s(m.unit).toLowerCase();
    if (type === "isolamento" || type === "resistenza") {
      var factor = RESISTANCE_TO_MOHM[unit];
      if (factor !== undefined) value = value * factor;
    }
    // Sul guasto conta il valore peggiore misurato
    if (measures[type] === undefined || value < measures[type]) measures[type] = value;
  });

  var text = normalize([
    arr(cs.facts_confirmed).join(" "),
    arr(cs.facts_uncertain).join(" "),
    arr(cs.visual_findings).join(" "),
    arr(cs.measurements).map(function(m) {
      return typeof m === "string" ? m : (s(m && m.raw) || s(m && m.value) + s(m && m.unit));
    }).join(" "),
    extractUserExclusions(cs.problem_summary)
  ].join(" "));

  var story = normalize([
    s(cs.problem_summary),
    arr(cs.facts_confirmed).join(" "),
    arr(cs.visual_findings).join(" ")
  ].join(" "));

  return {
    text: text,
    story: story,
    facts: facts,
    measures: measures,
    measure: function(type) {
      var v = measures[normalize(type)];
      return v === undefined ? null : v;
    }
  };
}

/**
 * La regola è innescata dalle evidenze?
 *
 *  context  → tutti i regex devono trovarsi nel RACCONTO (ambito di validità)
 *  signals  → tutti i regex devono trovarsi nelle PROVE, in ordine libero
 *  fact     → chiave di evidenza derivata dal motore
 *  when     → predicato sulle misure numeriche
 *
 * `context` da solo non basta mai: senza una prova (signals/fact/when) la
 * regola non scatta. Unica eccezione per costruzione: le regole di sola
 * applicabilità strutturale, che usano `when` leggendo ctx.story.
 */
function ruleTriggered(rule, ctx) {
  if (arr(rule.context).length) {
    if (!rule.context.every(function(re) { return re.test(ctx.story); })) return false;
  }
  if (typeof rule.when === "function") {
    try { if (!rule.when(ctx)) return false; } catch (e) { return false; }
  }
  if (rule.fact && !ctx.facts[rule.fact]) return false;
  if (rule.signal && !rule.signal.test(ctx.text)) return false;
  if (arr(rule.signals).length) {
    if (!rule.signals.every(function(re) { return re.test(ctx.text); })) return false;
  }
  return !!(rule.when || rule.fact || rule.signal || arr(rule.signals).length);
}

function killImpossible(cs) {
  var ctx = buildEvidenceContext(cs);
  if (!ctx.text) return;

  function activeCount() {
    return cs.hypotheses.filter(function(h) { return h.status === "active"; }).length;
  }

  cs.hypotheses.forEach(function(h) {
    if (h.status === "rejected") return;
    var lab = normalize(h.label);

    // Kill rules fisiche
    KILL_RULES.forEach(function(rule) {
      if (h.status === "rejected") return;
      if (!rule.kills.test(lab)) return;
      if (!ruleTriggered(rule, ctx)) return;

      // Valvola di sicurezza: meglio un'ipotesi debole che nessuna.
      // Restare senza ipotesi attive porterebbe ROCCO a dire "dati
      // insufficienti" proprio quando l'utente ha fornito più dati.
      if (activeCount() <= 1) {
        runtimeTrace.record(cs, "kill_skipped", {
          label: h.label, rule: rule.id, reason: "ultima ipotesi attiva"
        });
        return;
      }

      h.status = "rejected";
      h.confidence = "rejected";
      h.rejection_reason = rule.id + ": " + rule.reason;
      runtimeTrace.record(cs, "hypothesis_killed", { label: h.label, rule: rule.id, reason: rule.reason });
    });

    // Deny tests soddisfatti
    if (h.status !== "rejected") {
      h.deny_tests.forEach(function(test) {
        if (h.status === "rejected") return;
        var tw = normalize(test).split(" ").filter(function(w) { return w.length > 4; });
        var hits = 0;
        tw.forEach(function(w) { if (ctx.text.indexOf(w) >= 0) hits++; });
        if (tw.length > 0 && hits >= Math.ceil(tw.length * 0.6)) {
          if (activeCount() <= 1) {
            runtimeTrace.record(cs, "kill_skipped", { label: h.label, reason: "ultima ipotesi attiva" });
            return;
          }
          h.status = "rejected";
          h.confidence = "rejected";
          h.rejection_reason = "Test escludente soddisfatto: " + test;
          runtimeTrace.record(cs, "hypothesis_killed", { label: h.label, reason: h.rejection_reason });
        }
      });
    }
  });
}

/**
 * Conferma per misura: il simmetrico di killImpossible().
 *
 * Scrive `supporting_evidence` — campo che esisteva da sempre, inizializzato
 * a [] e letto una volta in verifyConclusion, ma che **nessuno popolava**:
 * per questo la certezza finale non poteva salire sopra `non_verifiable`.
 *
 * La prova finisce anche in `h.catena`, che formatResponse stampa: l'utente
 * deve leggere *perché* ROCCO dice confermato, non solo che lo dice.
 *
 * Nota per chi passerà da qui: i `confirm_tests` dell'ipotesi NON vengono
 * usati come prova, al contrario dei `deny_tests` in killImpossible. Un
 * deny_test soddisfatto dice che il fatto escludente c'è; un confirm_test
 * le cui parole compaiono nel racconto dice soltanto che **la misura è
 * stata eseguita**, non che il risultato confermi l'ipotesi. Dedurre la
 * conferma dall'aver misurato è lo stesso errore di categoria già corretto
 * in check_phrasing (previsione ≠ istruzione).
 */
/**
 * La TESI dell'ipotesi: la parte di etichetta che afferma la causa, senza
 * la spiegazione che segue.
 *
 * Serve perché cercare il regex in tutta l'etichetta pesca dentro frasi che
 * dicono il contrario. Caso reale: "Resistenza di pull-up nel PLC che fa
 * misurare una tensione anche a **circuito aperto**" veniva confermata da
 * CF-04 (tensione misurata assente) perché conteneva "circuito aperto" —
 * mentre quell'ipotesi spiega una lettura falsa, cioè prevede di misurare
 * tensione, non zero. Stesso difetto delle sigle dentro le parole italiane
 * (`DIN` in "lampadina"): il match va preteso dove la frase afferma, non
 * dove la nomina di passaggio.
 *
 * Queste etichette mettono la tesi in testa e la spiegazione dopo un
 * trattino, una virgola, un "che" o un "anche".
 */
function hypothesisClaim(label) {
  // Si taglia sul testo GREZZO e si normalizza dopo: normalize() rimuove la
  // punteggiatura, quindi tagliando dopo non ci sarebbero più i separatori
  // su cui tagliare.
  var head = s(label).split(/\s+[—–-]\s+|,|\bche\b|\banche\b|\bperch[eé]\b|\bpoich[eé]\b|[:(]/)[0];
  return normalize(head);
}

function applyConfirmRules(cs) {
  var ctx = buildEvidenceContext(cs);

  cs.hypotheses.forEach(function(h) {
    if (h.status !== "active") return;
    var lab = hypothesisClaim(h.label);

    CONFIRM_RULES.forEach(function(rule) {
      if (!rule.confirms.test(lab)) return;
      if (!ruleTriggered(rule, ctx)) return;

      var prova = rule.id + ": " + rule.reason;
      if (h.supporting_evidence.indexOf(prova) < 0) h.supporting_evidence.push(prova);
      if (h.catena.indexOf(prova) < 0) h.catena.push(prova);
      h.confidence = "confirmed";
      runtimeTrace.record(cs, "hypothesis_confirmed", {
        label: h.label, rule: rule.id, reason: rule.reason
      });
    });
  });
}

// ============================================================
// F. DISCRIMINAZIONE — la verifica che separa più ipotesi
// ============================================================
//
// L'intelligenza non sceglie la prossima domanda a caso.
// Sceglie quella che RIDUCE PIÙ INCERTEZZA.
// Se restano 4 ipotesi e una misura ne elimina 3, quella misura
// ha priorità.

function scoreDiscrimination(testText, activeHypotheses) {
  var tw = normalize(testText).split(" ").filter(function(w) { return w.length > 4; });
  var confirms = 0, denies = 0;

  activeHypotheses.forEach(function(h) {
    var c = h.confirm_tests.some(function(t) { return tw.some(function(w) { return normalize(t).indexOf(w) >= 0; }); });
    var d = h.deny_tests.some(function(t) { return tw.some(function(w) { return normalize(t).indexOf(w) >= 0; }); });
    if (c) confirms++;
    if (d) denies++;
  });

  var separation = Math.min(confirms, denies);
  var coverage = confirms + denies;
  return { separation: separation, coverage: coverage, score: separation * 10 + coverage * 3 };
}

function inferActionType(text) {
  var n = normalize(text);
  if (/misura|tensione|corrente|isolamento|continuita|pinza|multimetro|megger|ohm|volt|ampere/.test(n)) return "measurement";
  if (/foto|immagine|visivo|targhetta|ispezion|controllo visivo/.test(n)) return "visual_check";
  if (/scolleg|stacca|rimuov|disconnett|sezion/.test(n)) return "physical_check";
  if (/verific|controll/.test(n)) return "check";
  return "ask_user";
}

// ── Verifiche a cui l'utente ha già risposto ───────────────────────────
//
// Non basta escludere l'ipotesi: se l'utente ha già staccato tutti i
// carichi, ordinargli di staccare i carichi lo fa sentire inascoltato ed
// è la riga più visibile della risposta. Qui si accoppia ciò che l'utente
// ha già detto con le verifiche che quel dato rende inutili.
//
// `on: "story"` per i dati che stanno nel racconto e non sono verifiche
// dichiarate: il tempo di scatto è un'informazione che l'utente dà
// descrivendo il sintomo, non una prova che ha eseguito.
var ALREADY_DONE = [
  { done: NO_LOAD_PATTERN,
    makes_useless: /scolleg\w*|stacc\w*|disinseri\w*|a vuoto|senza carico/ },
  { done: /ho (?:misurat|verificat|controllat)\w*[^.;!?]{0,40}isolament|megger|megaohmetro|isolamento (?:misurat|risultat)/,
    makes_useless: /isolament|megger|megaohmetro/ },
  { done: /ho (?:sostituit|cambiat)\w*/,
    makes_useless: /sostitu\w*|cambia\w* il (?:dispositivo|componente)/ },
  { done: /ho (?:serrat|controllat)\w*[^.;!?]{0,30}morsett|morsetti (?:serrat|verificat|controllat)/,
    makes_useless: /morsett\w*|serragg\w*|coppia di serragg/ },
  { done: /ho misurat\w*[^.;!?]{0,30}(?:tension|volt)|tensione (?:misurat|verificat)/,
    makes_useless: /misur\w*[^.;!?]{0,20}tension|tester[^.;!?]{0,20}tension/ },
  { done: /ho (?:provat|testat)\w*[^.;!?]{0,30}(?:tasto )?test|tasto test (?:premut|provat)/,
    makes_useless: /tasto test|premere test/ }
];

/** Le verifiche che le dichiarazioni dell'utente hanno già reso inutili. */
function buildAlreadyDoneMatchers(ctx) {
  return ALREADY_DONE.filter(function(entry) {
    return entry.done.test(ctx.text);
  }).map(function(entry) { return entry.makes_useless; });
}

function selectBestAction(cs) {
  var active = cs.hypotheses.filter(function(h) { return h.status === "active"; });
  var ctx = buildEvidenceContext(cs);
  var alreadyDone = buildAlreadyDoneMatchers(ctx);

  if (active.length === 0) {
    return { type: "insufficient", action: "Servono piu informazioni: descrivi il tipo di impianto, cosa succede, e quando.", reason: "nessuna ipotesi attiva",
      discrimination: { separation: 0, coverage: 0, score: 0 } };
  }

  var confirmed = active.filter(function(h) { return h.confidence === "confirmed"; });
  // Con l'ipotesi confermata e nient'altro in piedi il caso è chiuso: non si
  // chiede un'altra misura. Se invece restano alternative, il fenomeno è
  // accertato ma il punto no: si conclude E si dà il passo che localizza.
  // Senza questo, `action` finiva in VERIFICHE OPERATIVE come
  // "- Diagnosi: dispersione…", cioè una diagnosi nel posto di una verifica.
  if (confirmed.length && active.length === confirmed.length) {
    return { type: "conclude", action: "Diagnosi: " + confirmed[0].label, reason: confirmed[0].reason,
      hypothesis: confirmed[0], discrimination: { separation: 0, coverage: 0, score: 999 } };
  }

  // Raccogli tutti i test dalle ipotesi attive
  var cands = [], seen = {};
  active.forEach(function(h) {
    h.confirm_tests.concat(h.deny_tests).forEach(function(t) {
      var key = normalize(t).substring(0, 60);
      if (!key || seen[key]) return;
      seen[key] = true;
      cands.push({ action: s(t), actionType: inferActionType(t), source: h.label });
    });
  });

  // Scora ogni candidato per potere discriminante
  cands.forEach(function(c) {
    c.discrimination = scoreDiscrimination(c.action, active);
    var safety = (cs.safety.level === "danger" || cs.safety.level === "stop") && c.actionType === "measurement" ? -100 : 0;
    var simple = c.actionType === "visual_check" ? 5 : c.actionType === "ask_user" ? 3 : 0;
    var dup = cs.checks_requested.some(function(cr) {
      return normalize(cr).substring(0, 40) === normalize(c.action).substring(0, 40);
    }) ? -50 : 0;
    // Penalità, non esclusione, per due motivi: se TUTTI i candidati
    // risultassero già fatti ROCCO deve comunque proporre il migliore; e a
    // volte la stessa misura va ripetuta in condizioni diverse (isolamento
    // a caldo dopo una misura a freddo). Un test molto discriminante può
    // quindi ancora vincere.
    var azNorm = normalize(c.action);
    c.alreadyDone = alreadyDone.some(function(re) { return re.test(azNorm); });
    c.totalScore = c.discrimination.score + safety + simple + dup + (c.alreadyDone ? -40 : 0);
  });

  cands.sort(function(a, b) { return b.totalScore - a.totalScore; });

  if (!cands.length) {
    // Nessun test specifico — usa primi principi per generare domande
    var ppDomande = PRIMI_PRINCIPI.slice(0, 3).map(function(pp) { return pp.domanda; });
    return { type: "ask_user", action: ppDomande[0] || "Descrivere meglio il problema: cosa, dove, quando.",
      reason: "Applico primi principi per raccogliere informazioni",
      alternatives: ppDomande.slice(1),
      discrimination: { separation: 0, coverage: 0, score: 0 } };
  }

  var best = cands[0];
  // Fenomeno accertato con localizzazione ancora aperta: il tipo resta
  // "conclude" (il caso ha una diagnosi), ma l'azione è quella che restringe.
  if (confirmed.length) {
    best.type = "conclude";
    best.hypothesis = confirmed[0];
    best.diagnosis = "Diagnosi: " + confirmed[0].label;
  }
  runtimeTrace.record(cs, "best_action", {
    action: best.action, score: best.totalScore,
    discrimination: best.discrimination, alternatives: cands.length - 1
  });
  return best;
}

// ============================================================
// G. TOOL / AI — solo quando il cervello locale non basta
// ============================================================

function decideToolNeeded(cs) {
  if (cs.runtime.has_image && !hasToolResult(cs, "vision_tool"))
    return { tool: "vision_tool", reason: "immagine da analizzare" };
  if (has(cs.problem_summary, /kw|watt|ampere|sezione|caduta|icc|cos|portata/) && !hasToolResult(cs, "calc_tool"))
    return { tool: "calc_tool", reason: "calcolo numerico necessario" };
  if (cs.components_detected.length === 0 && !hasToolResult(cs, "recognition_tool"))
    return { tool: "recognition_tool", reason: "identificare componenti" };
  return null;
}

function decideAINeeded(cs) {
  var active = cs.hypotheses.filter(function(h) { return h.status === "active"; });
  // AI confermata non serve se abbiamo ipotesi attive gestibili
  if (active.some(function(h) { return h.confidence === "confirmed"; })) return false;
  if (active.length >= 1 && active.length <= 5) return false;
  // AI serve se: 0 ipotesi e ci sono fatti, oppure safety non critica
  if (active.length === 0 && cs.facts_confirmed.length > 0) return true;
  if (cs.safety.level === "stop") return false;
  return false;
}

function buildAIPrompt(cs) {
  var active = cs.hypotheses.filter(function(h) { return h.status === "active"; });
  var rejected = cs.hypotheses.filter(function(h) { return h.status === "rejected"; });
  var parts = [
    "Sei ROCCO, tecnico elettricista con 25 anni di esperienza.",
    "Rispondi SOLO in JSON: {\"ipotesi\":[{\"causa\":\"\",\"perche\":\"\"}],\"certezza\":\"confirmed|probable|non_verifiable\"}",
    "Non inventare fatti. Se mancano misure NON usare confirmed.",
    "",
    "PROBLEMA: " + cs.problem_summary,
    "SICUREZZA: " + cs.safety.level,
    "FATTI: " + (cs.facts_confirmed.length ? cs.facts_confirmed.join("; ") : "nessuno"),
    "COMPONENTI: " + (cs.components_detected.length ? cs.components_detected.join(", ") : "non identificati")
  ];
  if (active.length) {
    parts.push("IPOTESI GIA FORMULATE: " + active.map(function(h) { return h.label; }).join("; "));
  }
  if (rejected.length) {
    parts.push("IPOTESI GIA ESCLUSE: " + rejected.map(function(h) { return h.label + " (" + (h.rejection_reason || "") + ")"; }).join("; "));
  }
  // M2: arricchimento dal neural
  if (cs.neural_novelty && cs.neural_novelty.novel) {
    parts.push("ATTENZIONE: caso NUOVO — nessun precedente simile. Ragiona dai primi principi.");
  } else if (cs.neural_novelty && cs.neural_novelty.closest_known) {
    parts.push("CASO SIMILE NOTO: " + cs.neural_novelty.closest_known);
  }
  if (cs._distiller_regole && cs._distiller_regole.length > 0) {
    parts.push("ESPERIENZA PRECEDENTE: " + cs._distiller_regole.slice(0, 2).map(function(r) {
      return r.allora + " (confidenza " + (r.confidenza || 0).toFixed(2) + ", da " + (r.casi_base || 0) + " casi)";
    }).join("; "));
  }
  return parts.join("\n");
}

function callAI(cs, gateway, hint) {
  return reasoner.execute(gateway, {
    requested_provider: hint,
    system_prompt: "Sei ROCCO v2 reasoner. Solo JSON valido. Non inventare fatti.",
    user_prompt: buildAIPrompt(cs)
  }).then(function(r) {
    runtimeTrace.mergeRuntime(cs, {
      provider_used: r.provider_used, model_used: r.model_used,
      fallback_used: !!r.fallback_used, fallback_reason: r.fallback_reason
    });
    var json = null;
    try {
      var raw = s(r.text), i = raw.indexOf("{"), j = raw.lastIndexOf("}");
      if (i >= 0 && j > i) json = JSON.parse(raw.slice(i, j + 1));
    } catch (e) { /* parse fail */ }

    runtimeTrace.record(cs, "ai_called", { provider: r.provider_used, parsed: !!json });

    // L'IA ha risposto ma non in JSON valido: ROCCO la scarta e continua col
    // ragionamento deterministico — giusto — ma anche questo va **detto**.
    // Scartare in silenzio significa che una risposta nata senza il
    // contributo dell'IA sembra identica a una nata con esso.
    if (!json) {
      runtimeTrace.mergeRuntime(cs, {
        fallback_used: true,
        fallback_reason: "invalid_reasoner_json"
      });
      return;
    }
    // Output AI è PROPOSTA — non verità. Fonte: external_ai
    arr(json.ipotesi || json.active).forEach(function(item) {
      var lab = s(item && (item.causa || item.label));
      if (!lab) return;
      if (cs.hypotheses.some(function(h) { return normalize(h.label).substring(0, 40) === normalize(lab).substring(0, 40); })) return;
      cs.hypotheses.push(makeHypothesis(lab, s(item.perche || item.reason), "external_ai", [], [],
        ["Ipotesi generata da AI esterna — da verificare con misure"]));
    });
  }).catch(function(err) {
    // L'IA non è raggiungibile: ROCCO continua con il ragionamento
    // deterministico — ed è il comportamento giusto — ma deve **dirlo**.
    //
    // Qui si registrava solo l'evento nella traccia: `fallback_used` restava
    // falso e nessuno sapeva che la risposta era arrivata senza l'IA. Il
    // gateway segnala la caduta solo quando passa da un provider all'altro
    // ("provider_switch"); se cadono tutti, la sua eccezione dice
    // `provider_unavailable` e si fermava lì. La provenienza di una risposta
    // è un'informazione che l'elettricista e chi guarda i log hanno diritto
    // di avere.
    var motivo = s(err && (err.message || err));
    var tuttiGiu = /provider_unavailable|provider_missing|network|enotfound|etimedout|econnreset|econnrefused/i.test(motivo);
    var ragione = tuttiGiu ? "network_down: " + motivo : "ai_failed: " + motivo;

    // La traccia e i metadati sono due cose diverse: `record()` scrive il
    // passo nella traccia, `mergeRuntime()` aggiorna i metadati della
    // risposta. Mettere i campi solo nel primo li lasciava invisibili —
    // l'avevo fatto, e il test me l'ha detto.
    runtimeTrace.record(cs, "ai_failed", { error: motivo, fallback_reason: ragione });
    runtimeTrace.mergeRuntime(cs, { fallback_used: true, fallback_reason: ragione });
  });
}

// ============================================================
// H. VERIFICA — la diagnosi è giustificata dai fatti?
// ============================================================

// Più prove vince; a pari prove vince la più probabile secondo il
// simulatore. Un'ipotesi senza probabilità vale 0: non viene promossa
// davanti a una che il simulatore ha valutato.
function byEvidenceThenProbability(a, b) {
  var de = b.supporting_evidence.length - a.supporting_evidence.length;
  if (de !== 0) return de;
  var pa = typeof a.probabilita === "number" ? a.probabilita : 0;
  var pb = typeof b.probabilita === "number" ? b.probabilita : 0;
  return pb - pa;
}

/**
 * L'ordine in cui ROCCO espone e sceglie le ipotesi.
 *
 * Chiavi, in ordine:
 *  1. **pertinenza al contesto** — un'ipotesi che questo impianto non
 *     giustifica non guida mai, nemmeno se una soglia l'ha confermata.
 *     Veniva prima il livello di certezza, e il risultato era "CONFERMATO:
 *     dispersione DC verso terra — pannello con celle rotte" su una
 *     lavatrice in appartamento: la misura di isolamento conferma la
 *     famiglia "dispersione", e l'etichetta fotovoltaica era solo il primo
 *     rappresentante generato.
 *  2. **conferma per misura** (`confirmed`): la prova strumentale.
 *  3. **probabilità del simulatore causale**.
 *  4. probable/possible dal controfattuale, dove la probabilità manca.
 *  5. numero di righe di prova.
 *
 * Perché la probabilità precede il conteggio delle prove: la prova
 * *misurata* è già espressa dalla chiave 2, e quel che resta in
 * `supporting_evidence` è in gran parte il controfattuale, che dice solo
 * "una previsione combacia" — un booleano debole. La probabilità è invece
 * una stima del simulatore sul sintomo riconosciuto. Misurato: con il
 * conteggio delle prove davanti, la causa reale compariva fra le ipotesi
 * stampate in 12 casi su 21; con la probabilità davanti, in 14.
 *
 * Misurato sui 21 casi italiani: ipotesi fuori contesto fra le 4 stampate
 * da 5 a 0, causa reale stampata da 12 a 14 su 21. La pertinenza è una
 * retrocessione: nessuna ipotesi viene esclusa.
 *
 * **Scartata** una variante che sembrava migliore: pesare la sovrapposizione
 * lessicale fra etichetta e racconto. Misurata, premia la tautologia — su
 * FORUM-IT-007 metteva "inverter in errore" (che ripete le parole del
 * cliente) sopra "guasto di isolamento lato DC" (che le spiega, ed è la
 * causa vera) — e cade sugli omonimi: su FORUM-IT-003 dava il punteggio più
 * alto alle ipotesi sul quadro elettrico perché il cliente aveva appeso un
 * quadro al muro.
 */
/**
 * I punteggi appresi: rete neurale e distillatore d'esperienza.
 *
 * Erano usati da una seconda `sort` che girava DOPO verifyConclusion e
 * sovrascriveva la graduatoria del motore — per questo l'ipotesi
 * fotovoltaica tornava in alto nell'elenco passato al narratore anche
 * quando la bozza l'aveva correttamente retrocessa. Quella formula leggeva
 * anche `h.probability`, campo che non è mai esistito (il campo è
 * `probabilita`, e `makeHypothesis` non dichiarava l'altro): valeva 0.5 per
 * ogni ipotesi, cioè una costante. Qui i due punteggi veri restano, come
 * ultima parola.
 */
function stimaAppresa(h) {
  var neural = typeof h.neural_score === "number" ? h.neural_score : 0;
  var distiller = typeof h.distiller_boost === "number" ? h.distiller_boost : 0;
  return neural * 0.4 + distiller * 0.2;
}

function makeHypothesisComparator(cs) {
  var story = s(cs && cs.problem_summary);
  var cache = {};

  function fuoriContesto(h) {
    var k = s(h && h.label);
    if (cache[k] === undefined) cache[k] = isOutOfDomain(k, story) ? 1 : 0;
    return cache[k];
  }

  return function(a, b) {
    var fa = fuoriContesto(a);
    var fb = fuoriContesto(b);
    if (fa !== fb) return fa - fb;

    // La prova strumentale: confermata davanti a tutto il resto.
    var ca = a.confidence === "confirmed" ? 1 : 0;
    var cb = b.confidence === "confirmed" ? 1 : 0;
    if (cb !== ca) return cb - ca;

    // La stima del simulatore prima del conteggio delle prove: vedi sopra.
    var pa = typeof a.probabilita === "number" ? a.probabilita : 0;
    var pb = typeof b.probabilita === "number" ? b.probabilita : 0;
    if (pb !== pa) return pb - pa;

    // Dove la probabilità manca resta il segnale del controfattuale.
    var ra = CONFIDENCE_RANK[a.confidence] === undefined ? 1 : CONFIDENCE_RANK[a.confidence];
    var rb = CONFIDENCE_RANK[b.confidence] === undefined ? 1 : CONFIDENCE_RANK[b.confidence];
    if (rb !== ra) return rb - ra;

    var de = b.supporting_evidence.length - a.supporting_evidence.length;
    if (de !== 0) return de;

    // Ultima parola ai punteggi appresi (rete neurale, distillatore).
    return stimaAppresa(b) - stimaAppresa(a);
  };
}

function verifyConclusion(cs) {
  // Lo stesso ordine che l'utente leggerà: la diagnosi nominata e la prima
  // riga della sezione IPOTESI devono essere la stessa cosa.
  var perOrdine = makeHypothesisComparator(cs);

  // L'ordine diventa quello del case_state, non resta locale a questa
  // funzione: il narratore prendeva `active.slice(0, 8)` nell'ordine di
  // GENERAZIONE e ripescava le ipotesi che il motore aveva retrocesso —
  // in risposta tornava l'ipotesi fotovoltaica su una lavatrice, dopo che
  // la bozza l'aveva correttamente messa in fondo. Ordinando qui, ogni
  // consumatore a valle (bozza, narratore, snapshot, DB) vede la stessa
  // graduatoria.
  cs.hypotheses = cs.hypotheses.slice().sort(function(a, b) {
    var aa = a.status === "active" ? 0 : 1;
    var ab = b.status === "active" ? 0 : 1;
    if (aa !== ab) return aa - ab;
    if (aa === 1) return 0;
    return perOrdine(a, b);
  });

  var active = cs.hypotheses.filter(function(h) { return h.status === "active"; });

  if (active.length === 0) {
    cs.final_confidence = "non_verifiable";
    cs.final_diagnosis = "Dati insufficienti per una diagnosi."
      + (cs.missing_critical_data.length ? " Serve: " + cs.missing_critical_data.join(", ") + "." : "");
    return;
  }

  // I due guardrail stavano DOPO il return del ramo confirmed: non potevano
  // girare mai. Qui sono condizioni d'ingresso, dove servono davvero.
  var hasMeasurement = cs.measurements.length > 0;
  var aiOnly = active.every(function(h) { return h.source === "external_ai"; });

  // Ordinate per prove e poi per probabilità: `final_diagnosis` deve nominare
  // l'ipotesi più sostenuta, non la prima capitata nell'ordine di
  // generazione. Senza lo spareggio sulla probabilità, su una lavatrice in
  // appartamento usciva "CONFERMATO: dispersione DC verso terra — pannello
  // con celle rotte, cavo MC4": un'ipotesi fotovoltaica, confermata a pari
  // prove e prima in ordine di generazione.
  var confirmed = active.filter(function(h) {
    return h.confidence === "confirmed" && h.contradicting_evidence.length === 0;
  }).sort(perOrdine);

  // La pertinenza precede la certezza anche qui. Se la soglia ha confermato
  // soltanto etichette che questo impianto non giustifica, il fenomeno è
  // reale ma il nome no: dire CONFERMATO e nominare "dispersione DC su
  // pannello fotovoltaico" per una lavatrice sarebbe la versione peggiore
  // del difetto, perché la certezza dà peso all'etichetta sbagliata.
  var confermateInContesto = confirmed.filter(function(h) {
    return !isOutOfDomain(h.label, cs.problem_summary);
  });
  var soloFuoriContesto = confirmed.length > 0 && confermateInContesto.length === 0;
  confirmed = confermateInContesto;

  if (confirmed.length && hasMeasurement && !aiOnly) {
    cs.final_confidence = "confirmed";
    // Onestà sull'ambiguità residua: una misura può accertare il fenomeno
    // (dispersione) senza dire ancora su quale componente. Confermare il
    // fenomeno e tacere sulla localizzazione sarebbe una mezza verità.
    // Basta più di un'ipotesi in piedi — anche se tutte confermate, come
    // accade quando la soglia accerta la famiglia (dispersione) senza dire
    // su quale punto: il fenomeno è certo, la localizzazione no.
    cs.final_diagnosis = confirmed[0].label + ". " + confirmed[0].reason
      + (active.length > 1
          ? " Fenomeno accertato dalla misura; resta da localizzare fra "
            + active.length + " punti possibili."
          : "");
    return;
  }

  // Confermata dalla misura ma senza il resto: non sparisce, scende.
  if (confirmed.length) {
    cs.final_confidence = "probable";
    cs.final_diagnosis = confirmed[0].label + ". "
      + (aiOnly
          ? "Ipotesi sostenuta solo dall'IA esterna: serve riscontro strumentale."
          : "Soglia superata ma senza misura registrata: serve riscontro strumentale.");
    return;
  }

  // La soglia ha confermato solo etichette inapplicabili a questo impianto:
  // il valore misurato resta un fatto, la causa va riferita a un'ipotesi
  // pertinente e la certezza non sale.
  if (soloFuoriContesto) {
    var pertinenti = active.filter(function(h) {
      return !isOutOfDomain(h.label, cs.problem_summary);
    }).sort(perOrdine);
    cs.final_confidence = "probable";
    cs.final_diagnosis = (pertinenti.length ? pertinenti[0].label : active[0].label)
      + ". Soglia superata dalla misura, ma le ipotesi che la soglia conferma"
      + " non si applicano a questo impianto: serve localizzare il guasto qui.";
    return;
  }

  // Prove parziali: controfattuale coerente coi fatti, o convergenza per
  // esclusione (una sola ipotesi sopravvissuta ai kill, non una sola
  // generata — in quel caso non c'è stata nessuna eliminazione).
  // Lo spareggio sulla probabilità rende l'ordine deterministico, ma NON
  // basta a fare una guida: `guidaUnica` sotto pretende più prove, non più
  // probabilità. A pari prove le piste restano pari.
  var sostenute = active.filter(function(h) {
    return h.supporting_evidence.length > 0 || h.confidence === "probable";
  }).sort(perOrdine);

  // PROBABILE vuol dire che UNA ipotesi guida. Con quattro ipotesi sostenute
  // a pari merito e quindici ancora in piedi non è "probabile": è ancora da
  // verificare, e dirlo probabile sposterebbe l'elettricista su una pista a
  // caso fra quelle in testa.
  var guidaUnica = sostenute.length === 1 ||
    (sostenute.length > 1 &&
     sostenute[0].supporting_evidence.length > sostenute[1].supporting_evidence.length);

  var convergenzaPerEsclusione = active.length === 1 && cs.hypotheses.length > 1;

  if (guidaUnica || convergenzaPerEsclusione) {
    cs.final_confidence = "probable";
    var guida = guidaUnica ? sostenute[0] : active[0];
    cs.final_diagnosis = guida.label + ". "
      + (guidaUnica
          ? "Sostenuta dalle prove disponibili, da confermare con la misura."
          : "Unica ipotesi sopravvissuta all'esclusione delle alternative.");
    return;
  }

  cs.final_confidence = "non_verifiable";
  cs.final_diagnosis = active.length === 1
    ? "Ipotesi da verificare: " + active[0].label
    : active.length + " ipotesi possibili. Serve verifica discriminante.";
}

// ============================================================
// I. RISPOSTA — formatta il ragionamento di ROCCO
// ============================================================
//
// La risposta mostra il PERCORSO del ragionamento:
// come ROCCO è arrivato alle sue conclusioni.

// Peso per l'ordine di esposizione: l'ipotesi accertata dalla misura va
// letta per prima. La sezione IPOTESI ne stampa 4: se la confermata è
// quinta, l'utente legge "CONFERMATO" senza vedere cosa è confermato.
var CONFIDENCE_RANK = { confirmed: 3, probable: 2, possible: 1, unlikely: 0 };

function formatResponse(cs, percezione) {
  // L'ipotesi che la diagnosi nomina va in testa all'elenco: `final_diagnosis`
  // e la sezione IPOTESI devono raccontare la stessa cosa, altrimenti l'utente
  // legge CONFERMATO sopra un'ipotesi diversa da quella accertata.
  var guidaNorm = normalize(s(cs.final_diagnosis).split(". ")[0]);
  var perOrdine = makeHypothesisComparator(cs);
  var active = cs.hypotheses.filter(function(h) { return h.status === "active"; })
    .slice()
    .sort(function(a, b) {
      // L'ipotesi che la diagnosi nomina resta in testa: è scelta con lo
      // stesso comparatore, quindi di norma è già prima — questa chiave
      // garantisce che le due sezioni non si contraddicano comunque.
      var ga = guidaNorm && normalize(a.label) === guidaNorm ? 1 : 0;
      var gb = guidaNorm && normalize(b.label) === guidaNorm ? 1 : 0;
      if (gb !== ga) return gb - ga;
      return perOrdine(a, b);
    });
  var rejected = cs.hypotheses.filter(function(h) { return h.status === "rejected"; });
  var best = cs.next_action;
  var lines = [];
  // La verifica discriminante: next_action può essere già convertito al
  // formato legacy (expected_discriminator) o ancora in quello interno (action).
  var verifica = best ? s(best.expected_discriminator || best.action) : "";
  var facts = lexicon.cleanFacts(cs.facts_confirmed, 6);

  // Osservazioni
  lines.push("OSSERVAZIONI:");
  if (facts.length) {
    facts.forEach(function(f) { lines.push("- " + f); });
  } else {
    lines.push("- Nessun fatto tecnico confermato.");
  }

  // Analisi del sistema
  if (cs.system_model && cs.system_model.discrepancy) {
    lines.push("");
    lines.push("ANALISI:");
    lines.push("- Sistema: " + cs.system_model.type);
    if (cs.system_model.funzionamento) {
      lines.push("- Funzionamento atteso: " + cs.system_model.funzionamento);
    }
    lines.push("- Anomalia: " + cs.system_model.discrepancy);
  }

  // Componenti
  lines.push("");
  lines.push("COMPONENTI COINVOLTI:");
  var comps = lexicon.humanizeComponents(cs.components_detected);
  lines.push(comps.length ? "- " + comps.join(", ") : "- Non identificati.");

  // Ipotesi con ragionamento
  lines.push("");
  lines.push("IPOTESI:");
  if (active.length) {
    active.slice(0, 4).forEach(function(h, idx) {
      lines.push("- " + h.label);
      // Mostra la catena di ragionamento (l'intelligenza di ROCCO)
      if (h.catena && h.catena.length > 0) {
        h.catena.forEach(function(step) {
          lines.push("  → " + step);
        });
      } else if (h.reason) {
        lines.push("  Perche: " + h.reason);
      }
    });
  } else {
    lines.push("- Nessuna ipotesi formulabile con i dati disponibili.");
  }

  // Ipotesi escluse (mostra il ragionamento per esclusione)
  if (rejected.length) {
    lines.push("");
    lines.push("IPOTESI ESCLUSE:");
    rejected.slice(0, 3).forEach(function(h) {
      lines.push("- " + h.label + " → " + (h.rejection_reason || "esclusa"));
    });
  }

  // Certezza
  lines.push("");
  lines.push("LIVELLO DI CERTEZZA:");
  lines.push(lexicon.certaintyLabel(cs.final_confidence));

  // Verifiche operative — la misura discriminante e le alternative
  lines.push("");
  lines.push("VERIFICHE OPERATIVE:");
  if (verifica) {
    lines.push("- " + verifica);
    if (best && best.discrimination && best.discrimination.separation > 0) {
      lines.push("  (questa verifica separa " + best.discrimination.coverage + " ipotesi)");
    }
    arr(best && best.alternatives).slice(0, 2).forEach(function(a) {
      lines.push("- In alternativa: " + a);
    });
  } else if (cs.safety.allowed_next_step) {
    lines.push("- " + cs.safety.allowed_next_step);
  } else {
    lines.push("- Raccogliere il dato tecnico mancante.");
  }
  if (cs.missing_critical_data && cs.missing_critical_data.length) {
    lines.push("- Dati ancora da raccogliere: " + cs.missing_critical_data.slice(0, 3).join(", ") + ".");
  }

  // Rischi
  lines.push("");
  lines.push("RISCHI REALI:");
  if (cs.safety.reasons.length || cs.safety.blocked_actions.length) {
    cs.safety.reasons.slice(0, 3).forEach(function(r) { lines.push("- " + r); });
    cs.safety.blocked_actions.slice(0, 2).forEach(function(b) {
      lines.push("- Vietato finché non verificato: " + b);
    });
  } else {
    lines.push("- Nessun rischio oltre alla prudenza operativa standard.");
  }

  // Prossimo passo (la singola azione che restringe di più il campo)
  lines.push("");
  lines.push("PROSSIMO PASSO:");
  lines.push("- " + (verifica || cs.safety.allowed_next_step || "Raccogliere il dato tecnico mancante."));

  // Sequenza causale — avviso evoluzione guasto
  if (cs.sequenza_causale && cs.sequenza_causale.catena && cs.sequenza_causale.catena.length > 1) {
    lines.push("");
    lines.push("ATTENZIONE:");
    lines.push("- Questa causa spesso evolve in: " + cs.sequenza_causale.catena.join(" → "));
    if (cs.sequenza_causale.avviso) {
      lines.push("- " + cs.sequenza_causale.avviso);
    }
  }

  // Verifica suggerita dal distillatore
  if (cs.distiller_verifica && cs.distiller_verifica.verifica) {
    lines.push("");
    lines.push("NOTA:");
    lines.push("- Esperienza da " + (cs.distiller_verifica.casi_base || 0) + " casi: " + cs.distiller_verifica.verifica);
  }

  return lines.join("\n");
}

// ============================================================
// J. LOOP COGNITIVO — il cervello di ROCCO
// ============================================================
//
// Flusso adattivo:
//
//  PERCEPIRE → SICUREZZA → COMPRENDERE → COSTRUIRE GRAFO →
//  RAGIONARE → CONTROFATTUALE → DISCRIMINARE (KILL) →
//  IMMAGINARE → [TOOL?] → [AI?] → VERIFICARE →
//  DECIDERE → RISPONDERE → [IMPARARE]
//
// Il grafo causale e il ragionamento controfattuale permettono
// a ROCCO di IMMAGINARE: costruire mentalmente possibilità
// non ancora osservate e verificarne le conseguenze.

function createOrchestrator(options) {
  var settings = options || {};
  var providerGateway = settings.providerGateway || providerGatewayFactory.createDefaultGateway();
  var toolRegistry = settings.toolRegistry || toolRegistryFactory.createRegistry();

  function runDiagnosis(input) {
    var inp = input || {};

    // ═══ 1. CASE STATE ═══
    var cs = caseStateHelpers.createCaseState(inp);
    cs.runtime.has_image = !!inp.image_buffer;
    cs.hypotheses = [];
    cs.system_model = null;
    cs.grafo = null;
    cs.controfattuale_risultati = [];

    // G4: Multi-turn — integra contesto conversazione precedente.
    // L'arricchimento va riapplicato dopo mergeSafetySeedOutput, che
    // riscrive problem_summary col seed del safety guard (solo messaggio
    // corrente) e cancellava il contesto dei turni precedenti: le esclusioni
    // già dichiarate dall'utente non diventavano mai prove e ROCCO
    // richiedeva verifiche che l'utente aveva appena fatto.
    if (inp.prior_context) {
      cs.prior_context = inp.prior_context;
      applyPriorContext(cs);
    }

    runtimeTrace.record(cs, "start", { has_image: cs.runtime.has_image, multi_turn: !!inp.prior_context });

    // ═══ 2. PERCEPIRE ═══
    var percezione = percepire(cs);
    runtimeTrace.record(cs, "percezione", {
      fenomeno: percezione.fenomeno_principale,
      novita: percezione.novita,
      temporale: percezione.condizione_temporale
    });

    // ═══ 2b. NEURAL — rilevamento novità ═══
    try {
      if (neuralIntegration) {
        cs.neural_novelty = neuralIntegration.detectNovelty(percezione, cs);
        if (cs.neural_novelty.novel) {
          runtimeTrace.record(cs, "neural_novelty", { score: cs.neural_novelty.novelty_score, closest: cs.neural_novelty.closest_known });
        }
      }
    } catch(e) { /* neural graceful degradation */ }

    // ═══ 3. SICUREZZA ═══
    return safetyGuard.run(inp).then(function(out) {
      caseStateHelpers.mergeSafetySeedOutput(cs, out);
      applyPriorContext(cs);
      caseStateHelpers.addToolResult(cs, out.tool_result);
      runtimeTrace.record(cs, "safety", { level: cs.safety.level });

      if (cs.safety.level === "stop") {
        cs.final_diagnosis = cs.safety.reasons[0] || "Condizione pericolosa. Fermare immediatamente ogni operazione.";
        cs.final_confidence = "confirmed";
        cs.status = "closed";
        return null;
      }

      // ═══ 4. COMPRENDERE — modello del sistema ═══
      cs.system_model = buildSystemModel(cs);
      runtimeTrace.record(cs, "model", { type: cs.system_model.type, discrepancy: cs.system_model.discrepancy });

      // ═══ 4b. GRAFO CAUSALE — costruire la rappresentazione della realtà ═══
      cs.grafo = causalModel.costruisciGrafo(cs);
      var nNodi = Object.keys(cs.grafo.nodi).length;
      var nArchi = arr(cs.grafo.archi).length;
      runtimeTrace.record(cs, "grafo", { nodi: nNodi, archi: nArchi, template: cs.system_model.type });

      // ═══ 4c. WORLD MODEL — modello mentale dell'impianto ═══
      try {
        if (neuralIntegration && neuralIntegration.buildWorldModel) {
          cs.world_model = neuralIntegration.buildWorldModel(cs);
          if (cs.world_model) {
            runtimeTrace.record(cs, "world_model", {
              nodi: Object.keys(cs.world_model.nodi).length,
              tipo: cs.world_model.tipo_impianto
            });
          }
        }
      } catch(e) { /* world model graceful degradation */ }

      // ═══ 4d. WORLD MODEL ANALISI — localizza guasto e confronta atteso vs reale ═══
      try {
        if (cs.world_model && neuralIntegration && neuralIntegration.WorldModel) {
          var WM = neuralIntegration.WorldModel;
          // Localizza nodi sospetti
          var wmCandidati = WM.localizzaGuasto(cs.world_model);
          if (wmCandidati && wmCandidati.length > 0) {
            cs.world_model_candidati = wmCandidati;
            runtimeTrace.record(cs, "world_model_localizza", {
              candidati: wmCandidati.length,
              primo: wmCandidati[0].nodo_nome
            });
          }
          // Confronta atteso vs reale
          var wmDiscrepanze = WM.confrontaAttesoReale(cs.world_model);
          if (wmDiscrepanze && wmDiscrepanze.length > 0) {
            cs.world_model_discrepanze = wmDiscrepanze;
            runtimeTrace.record(cs, "world_model_discrepanze", {
              discrepanze: wmDiscrepanze.length,
              prima: wmDiscrepanze[0].tipo
            });
          }
        }
      } catch(e) { /* world model analisi graceful degradation */ }

      // ═══ 5. RAGIONARE — generare ipotesi da conoscenza ═══
      cs.hypotheses = ragiona(cs, percezione);
      runtimeTrace.record(cs, "ragionamento", {
        count: cs.hypotheses.length,
        strategia: percezione.novita,
        fonti: cs.hypotheses.reduce(function(acc, h) {
          if (acc.indexOf(h.source) < 0) acc.push(h.source);
          return acc;
        }, [])
      });

      // ═══ 5+ World Model → ipotesi da nodi sospetti e discrepanze ═══
      try {
        if (cs.world_model_candidati) {
          cs.world_model_candidati.forEach(function(cand) {
            if (!cand || !cand.ragione) return;
            var duplicata = cs.hypotheses.some(function(h) {
              return normalize(h.label).indexOf(normalize(cand.nodo_nome)) >= 0;
            });
            if (!duplicata) {
              cs.hypotheses.push(makeHypothesis(
                "Guasto in " + cand.nodo_nome + " (" + cand.tipo_nodo + ")",
                cand.ragione,
                "world_model",
                cand.verifiche || [], [], ["Localizzato dal modello fisico dell'impianto"]
              ));
            }
          });
        }
        if (cs.world_model_discrepanze) {
          cs.world_model_discrepanze.forEach(function(disc) {
            if (!disc || !disc.possibili_cause) return;
            disc.possibili_cause.slice(0, 2).forEach(function(causa) {
              var duplicata = cs.hypotheses.some(function(h) {
                return normalize(h.label).indexOf(normalize(causa).substring(0, 30)) >= 0;
              });
              if (!duplicata) {
                cs.hypotheses.push(makeHypothesis(
                  causa,
                  disc.tipo + " su " + disc.nodo_nome + " (atteso " + disc.atteso + ", misurato " + disc.misurato + ")",
                  "world_model_discrepanza",
                  [], [], ["Discrepanza atteso/reale dal modello fisico"]
                ));
              }
            });
          });
        }
      } catch(e) { /* world model ipotesi graceful degradation */ }

      // ═══ 5a. NEURAL — scoring ipotesi ═══
      try {
        if (neuralIntegration) {
          cs.hypotheses = neuralIntegration.scoreHypotheses(cs.hypotheses, cs);
          var neuralScored = cs.hypotheses.filter(function(h) { return h.neural_score !== undefined; }).length;
          if (neuralScored > 0) {
            runtimeTrace.record(cs, "neural_scoring", { scored: neuralScored });
          }
        }
      } catch(e) { /* neural graceful degradation */ }

      // ═══ 5c. SIMULATORE CAUSALE — ragionamento da tecnico esperto ═══
      try {
        if (neuralIntegration && neuralIntegration.simulaCausale) {
          var simResult = neuralIntegration.simulaCausale(cs);
          if (simResult && simResult.ipotesi) {
            cs.simulazione_causale = simResult;
            simResult.ipotesi.forEach(function(ip) {
              if (ip.stato !== "attiva") return;
              var duplicata = cs.hypotheses.some(function(h) {
                return normalize(h.label).substring(0, 40) === normalize(ip.causa).substring(0, 40);
              });
              if (!duplicata) {
                var hSim = makeHypothesis(
                  ip.causa, ip.come_verifico || "",
                  "simulatore_causale",
                  [ip.come_verifico].filter(Boolean), [],
                  ["Simulatore causale: probabilità " + Math.round(ip.probabilita * 100) + "%"]
                );
                hSim.probabilita = typeof ip.probabilita === "number" ? ip.probabilita : null;
                cs.hypotheses.push(hSim);
              }
            });
            // Propaga il sintomo riconosciuto per il distillatore (step 5e) e suggerisciVerifica (step 10)
            if (simResult.sintomo) {
              cs.anomaly_type = simResult.sintomo;
            }
            runtimeTrace.record(cs, "simulatore_causale", {
              sintomo: simResult.sintomo,
              ipotesi_generate: (simResult.ipotesi || []).length,
              attive: simResult.attive
            });
          }
        }
      } catch(e) { /* simulatore causale graceful degradation */ }

      // ═══ 5c-bis. BANCA DISPOSITIVI — i guasti noti dell'apparecchio ═══
      //
      // La banca (109 dispositivi, 322 guasti, 39 valori di riferimento)
      // era collegata soltanto al vecchio `/api/chat`: l'orchestratore —
      // cioè il percorso che il frontend usa — non la vedeva. Conoscenza
      // che esisteva e non arrivava a chi risponde.
      //
      // Un guasto noto di una famiglia È un'ipotesi, e porta con sé quello
      // che all'ipotesi serve: la verifica, lo strumento, il valore atteso
      // e la norma. Entra qui, insieme alle altre, e poi passa per le
      // stesse regole di tutte: esclusione, conferma per misura,
      // pertinenza al contesto.
      try {
        if (deviceKb && deviceKb.rileveFamigliaInTesto) {
          var famigliaApp = deviceKb.rileveFamigliaInTesto(cs.problem_summary);
          if (famigliaApp) {
            var sintomiApp = deviceKb.rilevaSintomoDalTesto(cs.problem_summary).join(" ");
            cs.famiglia_dispositivo = famigliaApp;
            var guastiNoti = deviceKb.cercaGuastiSync(sintomiApp || cs.problem_summary, famigliaApp);
            var aggiunti = 0;
            guastiNoti.forEach(function(g) {
              if (aggiunti >= 3) return;          // non si allaga il campo
              var etichetta = s(g.causa_probabile).split(";")[0].trim();
              if (!etichetta) return;
              var duplicata = cs.hypotheses.some(function(h) {
                return normalize(h.label).substring(0, 40) === normalize(etichetta).substring(0, 40);
              });
              if (duplicata) return;

              var catena = ["Guasto noto della famiglia " + famigliaApp + " (banca dispositivi)"];
              if (g.riferimento_norma) catena.push("Riferimento: " + g.riferimento_norma);
              if (g.valore_atteso && !/non specificato/.test(g.valore_atteso)) {
                catena.push("Valore atteso: " + g.valore_atteso);
              }

              var verifiche = [];
              if (g.verifica && !/non specificata/.test(g.verifica)) verifiche.push(g.verifica);

              var hBanca = makeHypothesis(
                etichetta, s(g.sintomo), "banca_dispositivi", verifiche, [], catena
              );
              // La probabilità dichiarata dalla banca entra nella stessa
              // scala del simulatore, così l'ordinamento le confronta.
              hBanca.probabilita = g.probabilita === "Alta" ? 0.5
                : g.probabilita === "Bassa" ? 0.15 : 0.3;
              cs.hypotheses.push(hBanca);
              aggiunti++;
            });
            if (aggiunti) {
              runtimeTrace.record(cs, "banca_dispositivi", {
                famiglia: famigliaApp, ipotesi_aggiunte: aggiunti
              });
            }
          }
        }
      } catch(e) { /* banca non disponibile: il resto del motore basta */ }

      // ═══ 5d. CASI SIMILI — confronta sempre con l'esperienza passata ═══
      try {
        if (neuralIntegration && neuralIntegration.findSimilarCases) {
          var simili = neuralIntegration.findSimilarCases(cs, 3);
          var casiAggiunti = 0;
          arr(simili).forEach(function(sim) {
            if (!sim || !sim.data || !sim.data.confirmed_cause) return;
            var duplicata = cs.hypotheses.some(function(h) {
              return normalize(h.label).substring(0, 40) === normalize(sim.data.confirmed_cause).substring(0, 40);
            });
            if (!duplicata) {
              cs.hypotheses.push(makeHypothesis(
                sim.data.confirmed_cause,
                "Caso simile (score " + (sim.score || 0).toFixed(2) + ")",
                "neural_similarita",
                [], [], ["Trovato da neural knowledge graph"]
              ));
              casiAggiunti++;
            }
          });
          if (casiAggiunti > 0) {
            runtimeTrace.record(cs, "casi_simili", { trovati: simili.length, aggiunti: casiAggiunti });
          }
        }
      } catch(e) { /* findSimilarCases graceful degradation */ }

      // ═══ 5e. DISTILLATORE ESPERIENZA — regole apprese dai casi chiusi ═══
      try {
        if (neuralIntegration && neuralIntegration.cercaRegoleDistillate) {
          var sintomoDist = cs.anomaly_type || "";
          var misureDist = cs.measurements || [];
          var compDist = cs.components_detected || [];
          var condDist = []; // condizioni ambientali dal testo
          var testoProbl = (cs.problem_summary || "").toLowerCase();
          if (/piov|umid|bagnato/.test(testoProbl)) condDist.push("umidita");
          if (/vecchi|datato|anni/.test(testoProbl)) condDist.push("impianto_vecchio");
          if (/intermit|a volte/.test(testoProbl)) condDist.push("intermittente");

          var regoleDist = neuralIntegration.cercaRegoleDistillate(sintomoDist, misureDist, compDist, condDist);
          if (regoleDist && regoleDist.length > 0) {
            regoleDist.forEach(function(rd) {
              if (!rd || !rd.regola || !rd.regola.allora) return;
              // Boost ipotesi che matcha la regola distillata
              cs.hypotheses.forEach(function(h) {
                if (h.status !== "active") return;
                if (normalize(h.label).indexOf(normalize(rd.regola.allora)) >= 0 ||
                    normalize(rd.regola.allora).indexOf(normalize(h.label)) >= 0) {
                  h.distiller_boost = rd.boost;
                  h.probability = Math.min(0.95, (h.probability || 0.5) + rd.boost * 0.1);
                }
              });
            });
            // Salva per buildAIPrompt (M2)
            cs._distiller_regole = regoleDist.map(function(rd) { return rd.regola; });
            runtimeTrace.record(cs, "distiller_regole", { trovate: regoleDist.length });
          }
        }
      } catch(e) { /* distillatore graceful degradation */ }

      // ═══ 5b. CONTROFATTUALE — "se fosse vero, cosa dovrei osservare?" ═══
      cs.controfattuale_risultati = [];
      cs.hypotheses.forEach(function(h) {
        if (h.status !== "active") return;
        var cf = causalModel.valutaIpotesiConControfattuale(cs.grafo, h, cs);
        if (!cf) return;

        cs.controfattuale_risultati.push({
          ipotesi: h.label,
          plausibilita: cf.valutazione.plausibilita,
          matching: cf.valutazione.matching,
          contradicting: cf.valutazione.contradicting
        });

        // Se il controfattuale contraddice l'ipotesi → abbassa confidenza
        if (cf.valutazione.contradicting > cf.valutazione.matching && cf.valutazione.contradicting > 0) {
          h.confidence = "unlikely";
          var contro = "Controfattuale: previsioni contraddicono i fatti (" + cf.valutazione.contradicting + " contraddizioni)";
          h.catena.push(contro);
          h.contradicting_evidence.push(contro);
        }
        // Se il controfattuale conferma → alza confidenza
        else if (cf.valutazione.matching > 0 && cf.valutazione.contradicting === 0) {
          if (h.confidence === "possible") h.confidence = "probable";
          // La prova va anche in supporting_evidence: il matching era
          // calcolato, scritto nella catena e mai letto da verifyConclusion,
          // che per questo non superava mai `non_verifiable`.
          var pro = "Controfattuale: " + cf.valutazione.matching + " previsioni confermate dai fatti";
          h.catena.push(pro);
          if (h.supporting_evidence.indexOf(pro) < 0) h.supporting_evidence.push(pro);
        }

        // Le verifiche suggerite dal controfattuale arricchiscono i test.
        // Sono PREVISIONI ("R prossima a 0 su X"): vanno tradotte in
        // istruzioni operative prima di poter finire davanti all'utente.
        // Ciò che non è traducibile viene scartato, non inventato.
        checkPhrasing.toInstructions(cf.verifiche_suggerite).forEach(function(v) {
          if (h.confirm_tests.indexOf(v) < 0) h.confirm_tests.push(v);
        });

        // Neural: arricchisci il controfattuale con world model
        try {
          if (neuralIntegration && neuralIntegration.enhanceCounterfactual) {
            var ncf = neuralIntegration.enhanceCounterfactual(h, cf, cs);
            if (ncf && ncf.neural_predictions) {
              h.neural_cf = ncf.neural_predictions;
            }
          }
        } catch(e) { /* enhanceCounterfactual graceful degradation */ }
      });

      if (cs.controfattuale_risultati.length > 0) {
        runtimeTrace.record(cs, "controfattuale", {
          ipotesi_valutate: cs.controfattuale_risultati.length,
          risultati: cs.controfattuale_risultati.slice(0, 5)
        });
      }

      // ═══ 6. DISCRIMINARE — eliminare l'impossibile ═══
      killImpossible(cs);
      // Elimina anche le "unlikely" dal controfattuale
      cs.hypotheses.forEach(function(h) {
        if (h.confidence === "unlikely" && h.status === "active") {
          h.status = "rejected";
          h.rejection_reason = "Controfattuale: le previsioni non corrispondono ai fatti";
          runtimeTrace.record(cs, "hypothesis_killed_cf", { label: h.label });
        }
      });
      var alive = cs.hypotheses.filter(function(h) { return h.status === "active"; }).length;
      runtimeTrace.record(cs, "kill", { active: alive, killed: cs.hypotheses.length - alive });

      // ═══ 6a. CONFERMARE — la misura che accerta, non solo quella che esclude ═══
      // Va dopo il kill: si confermano solo ipotesi ancora in piedi.
      applyConfirmRules(cs);

      // ═══ 6b. IMMAGINARE — se poche ipotesi sopravvivono, cercane di nuove ═══
      if (alive < 2) {
        var immaginazione = causalModel.immagina(cs.grafo, cs);
        var nuoveImmaginate = 0;
        arr(immaginazione).forEach(function(im) {
          // Non duplicare ipotesi già presenti
          if (cs.hypotheses.some(function(h) {
            return normalize(h.label).substring(0, 40) === normalize(im.label).substring(0, 40);
          })) return;

          cs.hypotheses.push(makeHypothesis(
            im.label,
            im.principio,
            "immaginazione_tecnica",
            im.conferma, im.esclude,
            im.catena
          ));
          nuoveImmaginate++;
        });

        if (nuoveImmaginate > 0) {
          runtimeTrace.record(cs, "immaginazione", {
            nuove_ipotesi: nuoveImmaginate,
            candidati_valutati: immaginazione.length
          });
        }
      }

      // ═══ 7. TOOL — solo se il cervello locale non basta ═══
      var td = decideToolNeeded(cs);
      if (!td) return null;
      runtimeTrace.record(cs, "tool", { tool: td.tool, reason: td.reason });
      return toolRegistry.executeTool(td.tool, cs, {
        providerGateway: providerGateway, provider_hint: inp.provider_hint,
        image_buffer: inp.image_buffer, image_mime_type: inp.image_mime_type
      }).then(function(tr) {
        caseStateHelpers.addToolResult(cs, tr);
        if (tr.tool_name === "recognition_tool" && tr.raw_ref) {
          cs.components_detected = caseStateHelpers.pushUniqueStrings(cs.components_detected, arr(tr.raw_ref.legacy_components));
        }
        // Neural Vision: interpreta immagine con il cervello visivo
        if (tr.tool_name === "vision_tool" && neuralIntegration && neuralIntegration.interpretaImmagine) {
          try {
            var visObs = arr(tr.raw_ref && tr.raw_ref.observations);
            if (visObs.length > 0) {
              cs.neural_vision = neuralIntegration.interpretaImmagine(visObs);
              runtimeTrace.record(cs, "neural_vision", {
                anomalie: (cs.neural_vision || {}).anomalie_rilevate || 0,
                gravita: (cs.neural_vision || {}).gravita_massima || "nessuna"
              });
              // Propaga anomalie visive in ipotesi
              if (cs.neural_vision && cs.neural_vision.anomalie && cs.neural_vision.anomalie.length > 0) {
                cs.neural_vision.anomalie.forEach(function(an) {
                  if (!an || !an.tipo) return;
                  var duplicata = cs.hypotheses.some(function(h) {
                    return normalize(h.label).indexOf(normalize(an.tipo)) >= 0;
                  });
                  if (!duplicata) {
                    cs.hypotheses.push(makeHypothesis(
                      an.tipo + (an.componente ? " su " + an.componente : ""),
                      "Rilevato visivamente: " + (an.descrizione || an.tipo),
                      "neural_vision",
                      [], [], ["Anomalia identificata dall'analisi visiva"]
                    ));
                  }
                });
              }
            }
          } catch(e) { /* neural vision graceful degradation */ }
        }
      }).catch(function(e) { runtimeTrace.record(cs, "tool_fail", { error: s(e && e.message) }); });
    }).then(function() {
      if (cs.status === "closed") return;

      // ═══ 8. AI — solo se il ragionamento deterministico non basta ═══
      // Neural hook: il neural può suggerire se l'AI è necessaria
      var neuralAIHint = null;
      try {
        if (neuralIntegration) {
          neuralAIHint = neuralIntegration.shouldCallAI(cs, cs.hypotheses);
          if (neuralAIHint && neuralAIHint.needed !== null) {
            runtimeTrace.record(cs, "neural_ai_hint", { needed: neuralAIHint.needed, reason: neuralAIHint.reason });
          }
        }
      } catch(e) { /* neural graceful degradation */ }
      var aiNeeded = decideAINeeded(cs);
      // Il neural può forzare la decisione AI (novelty alta, incertezza alta)
      if (neuralAIHint && neuralAIHint.needed === true) aiNeeded = true;
      if (neuralAIHint && neuralAIHint.needed === false && !aiNeeded) aiNeeded = false;
      // M4: caso molto nuovo → forza AI (cervello locale non ha dati)
      if (cs.neural_novelty && cs.neural_novelty.novel && cs.neural_novelty.novelty_score > 0.8) {
        aiNeeded = true;
      }
      if (aiNeeded) {
        runtimeTrace.record(cs, "ai_needed", {
          reason: neuralAIHint && neuralAIHint.needed === true
            ? "neural: " + (neuralAIHint.reason || "segnale forte")
            : "ragionamento deterministico insufficiente"
        });
        return callAI(cs, providerGateway, inp.provider_hint);
      }
      runtimeTrace.record(cs, "ai_skipped", { reason: "ragionamento deterministico sufficiente" });
    }).then(function() {
      if (cs.status !== "closed") {
        // ═══ 9. VERIFICARE — le conclusioni sono giustificate? ═══
        // Riapplicata qui perché immaginazione, tool e IA possono aver
        // aggiunto ipotesi dopo il passo 6a: anche quelle vanno misurate
        // contro le soglie. È idempotente.
        applyConfirmRules(cs);
        verifyConclusion(cs);
        // ═══ 10. DECIDERE — qual è la prossima azione migliore? ═══
        cs.next_action = selectBestAction(cs);
        // Neural hook: arricchisce la discriminazione dell'azione
        try {
          if (neuralIntegration && cs.next_action) {
            cs.next_action = neuralIntegration.scoreActionInformativeness(cs.next_action, cs.hypotheses, cs);
          }
        } catch(e) { /* neural graceful degradation */ }

        // Distillatore: suggerisci verifica più efficiente dall'esperienza
        try {
          if (neuralIntegration && neuralIntegration.suggerisciVerifica) {
            var sintomoV = cs.anomaly_type || "";
            var attiveV = cs.hypotheses.filter(function(h) { return h.status === "active"; }).map(function(h) { return h.label; });
            var sugVerifica = neuralIntegration.suggerisciVerifica(sintomoV, attiveV);
            if (sugVerifica && sugVerifica.confidenza > 0.5 && sugVerifica.casi_base >= 3) {
              cs.distiller_verifica = sugVerifica;
              runtimeTrace.record(cs, "distiller_verifica", {
                verifica: sugVerifica.verifica,
                confidenza: sugVerifica.confidenza,
                casi_base: sugVerifica.casi_base
              });
            }
          }
        } catch(e) { /* distillatore graceful degradation */ }

        // A1: cerca catena causale nota (evoluzione guasto)
        try {
          if (neuralIntegration && neuralIntegration.cercaSequenza) {
            var attiveSeq = cs.hypotheses.filter(function(h) { return h.status === "active"; });
            var topCausaSeq = attiveSeq.length > 0 ? attiveSeq[0].label : "";
            if (topCausaSeq) {
              var seqResult = neuralIntegration.cercaSequenza(topCausaSeq);
              if (seqResult && seqResult.catena && seqResult.catena.length > 1) {
                cs.sequenza_causale = seqResult;
                runtimeTrace.record(cs, "sequenza_causale", {
                  catena: seqResult.catena,
                  confidenza: seqResult.confidenza
                });
              }
            }
          }
        } catch(e) { /* graceful degradation */ }
      }

      // Un solo ordinamento, quello del motore: la pertinenza al contesto
      // per prima, poi la conferma per misura, la probabilità, il
      // controfattuale, le prove e infine i punteggi appresi. Qui girava una
      // seconda sort che riordinava per conto proprio e sovrascriveva questa
      // graduatoria subito dopo verifyConclusion.
      var perOrdineFinale = makeHypothesisComparator(cs);
      cs.hypotheses.sort(function(a, b) {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        if (a.status !== "active") return 0;
        return perOrdineFinale(a, b);
      });

      // Sincronizza formato legacy
      cs.hypotheses_active = cs.hypotheses.filter(function(h) { return h.status === "active"; })
        .map(function(h) { return { label: h.label, reason: h.reason, source: h.source }; });
      cs.hypotheses_rejected = cs.hypotheses.filter(function(h) { return h.status === "rejected"; })
        .map(function(h) { return { label: h.label, reason: h.rejection_reason || h.reason, source: h.source }; });

      if (cs.next_action && cs.next_action.action) {
        cs.next_action = {
          action_type: cs.next_action.type === "conclude" ? "finalize" : "ask_user",
          tool_name: null, reason: cs.next_action.reason || "",
          expected_discriminator: cs.next_action.action || ""
        };
      }

      // ═══ 11. RISPONDERE — bozza deterministica, poi redazione in italiano ═══
      var draft = formatResponse(cs, percezione);

      // Il narratore riscrive la bozza in italiano tecnico. Non ragiona, non
      // aggiunge nulla: se viola il mandato o il provider non risponde, resta
      // la bozza. Vedi rocco_v2/narrator.js.
      return narrator.narrate(cs, draft, providerGateway, {
        provider_hint: inp.provider_hint,
        prior_context: inp.prior_context
      }).then(function(nar) {
        return buildResult(cs, percezione, draft, nar, inp);
      });
    });
  }

  function buildResult(cs, percezione, draft, nar, inp) {
      var answer = nar && nar.narrated ? nar.answer : draft;
      // Catturato PRIMA del merge: dice se l'LLM ha partecipato al RAGIONAMENTO,
      // non alla redazione. Le due cose restano distinte.
      var reasoningProvider = cs.runtime.provider_used || null;

      if (nar) {
        runtimeTrace.record(cs, nar.narrated ? "narrated" : "narration_skipped", {
          provider: nar.provider_used, reason: nar.reason
        });
        // Il provider della redazione è il provider della risposta.
        //
        // I flag di fallback si SOMMANO, non si sovrascrivono: se il
        // ragionamento ha già dovuto ripiegare su un secondo provider,
        // quel fatto non va perso perché la redazione è andata liscia.
        if (nar.provider_used) {
          runtimeTrace.mergeRuntime(cs, {
            provider_used: nar.provider_used,
            model_used: nar.model_used,
            fallback_used: !!cs.runtime.fallback_used || !!nar.fallback_used,
            fallback_reason: cs.runtime.fallback_reason || nar.fallback_reason || null
          });
        }
        cs.narration = {
          narrated: !!nar.narrated,
          reason: nar.reason || null,
          deterministic_draft: nar.narrated ? draft : null
        };
      }

      var snapshot = caseStateHelpers.buildDiagnosisSnapshot(cs);
      var meta = runtimeTrace.buildRuntimeMetadata(cs);

      runtimeTrace.record(cs, "complete", {
        hypotheses: cs.hypotheses.length,
        active: cs.hypotheses_active.length,
        killed: cs.hypotheses_rejected.length,
        confidence: cs.final_confidence,
        ai_called: !!reasoningProvider,
        narrated: !!(nar && nar.narrated),
        strategia: percezione.novita,
        grafo_nodi: cs.grafo ? Object.keys(cs.grafo.nodi).length : 0,
        controfattuale: cs.controfattuale_risultati.length,
        immaginazione: cs.hypotheses.filter(function(h) { return h.source === "immaginazione_tecnica"; }).length
      });

      // ═══ 12. IMPARARE — solo caso chiuso E validato ═══
      var mem = null;
      if (inp.closed_case_feedback) {
        mem = memory.saveValidatedClosedCase(cs, inp.closed_case_feedback);
        // Neural: addestra tutti i moduli dal caso chiuso
        try {
          if (neuralIntegration) {
            cs.neural_training = neuralIntegration.trainFromClosedCase(cs, inp.closed_case_feedback);
            runtimeTrace.record(cs, "neural_training", { trained: cs.neural_training.trained });
          }
        } catch(e) { /* neural graceful degradation */ }
      }

      return {
        ok: true, answer: answer, case_state: cs,
        diagnosis_snapshot: snapshot, runtime_metadata: meta,
        memory_result: mem,
        nextActionMeta: cs.next_action ? {
          selectedActionType: cs.next_action.action_type,
          selectedTarget: cs.next_action.expected_discriminator
        } : null,
        ambiguityMeta: null,
        evidenceMeta: {
          hypotheses_generated: cs.hypotheses.length,
          hypotheses_active: cs.hypotheses_active.length,
          hypotheses_killed: cs.hypotheses_rejected.length,
          hypotheses_imagined: cs.hypotheses.filter(function(h) { return h.source === "immaginazione_tecnica"; }).length,
          tools_used: cs.runtime.tools_used.length,
          ai_called: !!reasoningProvider,
          deterministic: !reasoningProvider,
          narrated: !!(nar && nar.narrated),
          narration_reason: nar && nar.reason ? nar.reason : null,
          strategia: percezione.novita,
          grafo_nodi: cs.grafo ? Object.keys(cs.grafo.nodi).length : 0,
          controfattuale_eseguito: cs.controfattuale_risultati.length > 0,
          fonti_ragionamento: cs.hypotheses.reduce(function(acc, h) {
            if (acc.indexOf(h.source) < 0) acc.push(h.source);
            return acc;
          }, []),
          neural_active: !!neuralIntegration,
          neural_novelty: cs.neural_novelty || null,
          neural_training: cs.neural_training || null
        }
      };
  }

  return { runDiagnosis: runDiagnosis };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  createOrchestrator: createOrchestrator,
  runDiagnosis: function(input, options) { return createOrchestrator(options).runDiagnosis(input); },

  // Esposti per test comportamentali
  FENOMENI: FENOMENI,
  PRIMI_PRINCIPI: PRIMI_PRINCIPI,
  SISTEMI: SISTEMI,
  KILL_RULES: KILL_RULES,
  buildEvidenceContext: buildEvidenceContext,
  applyPriorContext: applyPriorContext,
  // Conferma per misura — esportati per i test
  CONFIRM_RULES: CONFIRM_RULES,
  // Pertinenza — esportati per i test
  DOMAIN_FAMILIES: DOMAIN_FAMILIES,
  isOutOfDomain: isOutOfDomain,
  outOfDomainFamilies: outOfDomainFamilies,
  makeHypothesisComparator: makeHypothesisComparator,
  PROTECTION_TRIPPING_PATTERN: PROTECTION_TRIPPING_PATTERN,
  applyConfirmRules: applyConfirmRules,
  hypothesisClaim: hypothesisClaim,
  verifyConclusion: verifyConclusion,
  buildAlreadyDoneMatchers: buildAlreadyDoneMatchers,
  ruleTriggered: ruleTriggered,
  extractUserExclusions: extractUserExclusions,
  percepire: percepire,
  buildSystemModel: buildSystemModel,
  ragiona: ragiona,
  ragionaPerConoscenza: ragionaPerConoscenza,
  ragionaPerPrincipi: ragionaPerPrincipi,
  ragionaPerAnalogia: ragionaPerAnalogia,
  killImpossible: killImpossible,
  selectBestAction: selectBestAction,
  scoreDiscrimination: scoreDiscrimination,
  decideToolNeeded: decideToolNeeded,
  decideAINeeded: decideAINeeded,
  verifyConclusion: verifyConclusion,
  makeHypothesis: makeHypothesis
};
