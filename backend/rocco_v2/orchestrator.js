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
        conferma: ["sezionare i carichi uno alla volta e richiudere il RCD dopo ogni sezionamento", "misura isolamento con megger: se R < 1 MOhm → circuito trovato"],
        esclude: ["isolamento > 1 MOhm su tutti i circuiti"] },
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
    confidence: "possible", status: "active", rejection_reason: null
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

var KILL_RULES = [
  { id: "KR-01", signal: /isolamento.*>.*1\s*m|isolamento.*ok|isolamento.*buon/,
    kills: /dispersione|terra|isolament/, reason: "Isolamento > 1 MOhm esclude dispersione (CEI 64-8)" },
  { id: "KR-02", signal: /tensione.*230|tensione.*present|alimentazione.*ok/,
    kills: /assenza.*alimentazione|manca.*tensione|manca.*corrente/, reason: "Tensione presente esclude assenza alimentazione" },
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
  { id: "KR-10", signal: /senza.*carico.*scatta|vuoto.*scatta|carico.*scollegat.*scatta/,
    kills: /guasto.*carico|carico.*difettoso|elettrodomestico/, reason: "Scatta senza carico = guasto non nel carico" }
];

function killImpossible(cs) {
  var evidence = normalize([
    cs.facts_confirmed.join(" "),
    cs.measurements.map(function(m) { return typeof m === "string" ? m : JSON.stringify(m); }).join(" "),
    cs.facts_uncertain.join(" "),
    cs.visual_findings.join(" ")
  ].join(" "));
  if (!evidence) return;

  cs.hypotheses.forEach(function(h) {
    if (h.status === "rejected") return;
    var lab = normalize(h.label);

    // Kill rules fisiche
    KILL_RULES.forEach(function(rule) {
      if (h.status === "rejected") return;
      if (rule.signal.test(evidence) && rule.kills.test(lab)) {
        h.status = "rejected";
        h.confidence = "rejected";
        h.rejection_reason = rule.id + ": " + rule.reason;
        runtimeTrace.record(cs, "hypothesis_killed", { label: h.label, rule: rule.id, reason: rule.reason });
      }
    });

    // Deny tests soddisfatti
    if (h.status !== "rejected") {
      h.deny_tests.forEach(function(test) {
        if (h.status === "rejected") return;
        var tw = normalize(test).split(" ").filter(function(w) { return w.length > 4; });
        var hits = 0;
        tw.forEach(function(w) { if (evidence.indexOf(w) >= 0) hits++; });
        if (tw.length > 0 && hits >= Math.ceil(tw.length * 0.6)) {
          h.status = "rejected";
          h.confidence = "rejected";
          h.rejection_reason = "Test escludente soddisfatto: " + test;
          runtimeTrace.record(cs, "hypothesis_killed", { label: h.label, reason: h.rejection_reason });
        }
      });
    }
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

function selectBestAction(cs) {
  var active = cs.hypotheses.filter(function(h) { return h.status === "active"; });

  if (active.length === 0) {
    return { type: "insufficient", action: "Servono piu informazioni: descrivi il tipo di impianto, cosa succede, e quando.", reason: "nessuna ipotesi attiva",
      discrimination: { separation: 0, coverage: 0, score: 0 } };
  }

  var confirmed = active.filter(function(h) { return h.confidence === "confirmed"; });
  if (confirmed.length) {
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
    c.totalScore = c.discrimination.score + safety + simple + dup;
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

    if (!json) return;
    // Output AI è PROPOSTA — non verità. Fonte: external_ai
    arr(json.ipotesi || json.active).forEach(function(item) {
      var lab = s(item && (item.causa || item.label));
      if (!lab) return;
      if (cs.hypotheses.some(function(h) { return normalize(h.label).substring(0, 40) === normalize(lab).substring(0, 40); })) return;
      cs.hypotheses.push(makeHypothesis(lab, s(item.perche || item.reason), "external_ai", [], [],
        ["Ipotesi generata da AI esterna — da verificare con misure"]));
    });
  }).catch(function(err) {
    runtimeTrace.record(cs, "ai_failed", { error: s(err && err.message) });
  });
}

// ============================================================
// H. VERIFICA — la diagnosi è giustificata dai fatti?
// ============================================================

function verifyConclusion(cs) {
  var active = cs.hypotheses.filter(function(h) { return h.status === "active"; });

  if (active.length === 0) {
    cs.final_confidence = "non_verifiable";
    cs.final_diagnosis = "Dati insufficienti per una diagnosi."
      + (cs.missing_critical_data.length ? " Serve: " + cs.missing_critical_data.join(", ") + "." : "");
    return;
  }

  var confirmed = active.filter(function(h) { return h.confidence === "confirmed"; });
  if (confirmed.length) {
    cs.final_confidence = "confirmed";
    cs.final_diagnosis = confirmed[0].label + ". " + confirmed[0].reason;
    return;
  }

  var hasEvidence = active.some(function(h) { return h.supporting_evidence.length > 0; });
  cs.final_confidence = hasEvidence ? "probable" : "non_verifiable";
  cs.final_diagnosis = active.length === 1
    ? "Ipotesi da verificare: " + active[0].label
    : active.length + " ipotesi possibili. Serve verifica discriminante.";

  // Guardrail: confirmed impossibile senza misure
  if (cs.final_confidence === "confirmed" && cs.measurements.length === 0) {
    cs.final_confidence = "probable";
  }
  // Guardrail: diagnosi solo da AI non è confirmed
  if (cs.final_confidence === "confirmed" && active.every(function(h) { return h.source === "external_ai"; })) {
    cs.final_confidence = "probable";
  }
}

// ============================================================
// I. RISPOSTA — formatta il ragionamento di ROCCO
// ============================================================
//
// La risposta mostra il PERCORSO del ragionamento:
// come ROCCO è arrivato alle sue conclusioni.

function formatResponse(cs, percezione) {
  var active = cs.hypotheses.filter(function(h) { return h.status === "active"; });
  var rejected = cs.hypotheses.filter(function(h) { return h.status === "rejected"; });
  var best = cs.next_action;
  var lines = [];
  var certMap = { confirmed: "CONFERMATO", probable: "PROBABILE", non_verifiable: "DA VERIFICARE" };

  // Osservazioni
  lines.push("OSSERVAZIONI:");
  if (cs.facts_confirmed.length) {
    cs.facts_confirmed.slice(0, 6).forEach(function(f) { lines.push("- " + f); });
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
  lines.push(cs.components_detected.length ? "- " + cs.components_detected.join(", ") : "- Non identificati.");

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
  lines.push(certMap[cs.final_confidence] || "DA VERIFICARE");

  // Prossimo passo (la domanda più discriminante)
  lines.push("");
  lines.push("PROSSIMO PASSO:");
  if (best && best.action) {
    lines.push("- " + best.action);
    if (best.discrimination && best.discrimination.separation > 0) {
      lines.push("  (questa verifica separa " + best.discrimination.coverage + " ipotesi)");
    }
    if (best.alternatives && best.alternatives.length > 0) {
      lines.push("  In alternativa: " + best.alternatives[0]);
    }
  } else {
    lines.push("- Raccogliere il dato tecnico mancante.");
  }

  // Rischi
  if (cs.safety.reasons.length) {
    lines.push("");
    lines.push("RISCHI REALI:");
    cs.safety.reasons.slice(0, 3).forEach(function(r) { lines.push("- " + r); });
  }

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

    // G4: Multi-turn — integra contesto conversazione precedente
    if (inp.prior_context) {
      cs.prior_context = inp.prior_context;
      // Arricchisci il problem_summary con il contesto
      cs.problem_summary = cs.problem_summary + "\n\n[CONTESTO PRECEDENTE]\n" + inp.prior_context;
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
                cs.hypotheses.push(makeHypothesis(
                  ip.causa, ip.come_verifico || "",
                  "simulatore_causale",
                  [ip.come_verifico].filter(Boolean), [],
                  ["Simulatore causale: probabilità " + Math.round(ip.probabilita * 100) + "%"]
                ));
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
          h.catena.push("Controfattuale: previsioni contraddicono i fatti (" + cf.valutazione.contradicting + " contraddizioni)");
        }
        // Se il controfattuale conferma → alza confidenza
        else if (cf.valutazione.matching > 0 && cf.valutazione.contradicting === 0) {
          if (h.confidence === "possible") h.confidence = "probable";
          h.catena.push("Controfattuale: " + cf.valutazione.matching + " previsioni confermate dai fatti");
        }

        // Le verifiche suggerite dal controfattuale arricchiscono i test
        arr(cf.verifiche_suggerite).forEach(function(v) {
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

      // Ordina le ipotesi attive per neural_score + probability (la migliore in cima)
      cs.hypotheses.sort(function(a, b) {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        var scoreA = (a.neural_score || 0) * 0.4 + (a.probability || 0.5) * 0.6 + (a.distiller_boost || 0) * 0.2;
        var scoreB = (b.neural_score || 0) * 0.4 + (b.probability || 0.5) * 0.6 + (b.distiller_boost || 0) * 0.2;
        return scoreB - scoreA;
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

      // ═══ 11. RISPONDERE ═══
      var answer = formatResponse(cs, percezione);
      var snapshot = caseStateHelpers.buildDiagnosisSnapshot(cs);
      var meta = runtimeTrace.buildRuntimeMetadata(cs);

      runtimeTrace.record(cs, "complete", {
        hypotheses: cs.hypotheses.length,
        active: cs.hypotheses_active.length,
        killed: cs.hypotheses_rejected.length,
        confidence: cs.final_confidence,
        ai_called: !!cs.runtime.provider_used,
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
          ai_called: !!cs.runtime.provider_used,
          deterministic: !cs.runtime.provider_used,
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
    });
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
