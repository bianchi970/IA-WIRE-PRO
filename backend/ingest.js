/**
 * IA Wire Pro — ingest.js
 * Popola doc_chunks con contenuti tecnici BT (idempotente).
 * Uso: node backend/ingest.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { pool } = require("./db");

// ============================================================
// Chunk tecnici — 60 voci su impianti elettrici BT 230/400V
// ============================================================
const CHUNKS = [

  /* ── DIFFERENZIALE / RCD ── */
  {
    source: "rcd_guida_tecnica.txt",
    chunk_text:
      "Il differenziale (RCD - Residual Current Device) interviene quando la somma vettoriale " +
      "delle correnti nei conduttori di fase e neutro è diversa da zero, indicando una dispersione " +
      "verso terra. Soglie tipiche: 10mA (bagni, piscine), 30mA (uso generale), 300mA (protezione " +
      "antincendio). Il tempo di intervento deve essere <300ms a In, <40ms a 5×In (tipo G). " +
      "Prima di riarmare dopo uno scatto: scollegare TUTTI i carichi, riarmare a vuoto — se rimane " +
      "su c'è dispersione nel cablaggio o il differenziale è guasto. Se scatta con i carichi " +
      "ricollegati uno alla volta, il colpevole è il carico che causa lo scatto. " +
      "Non riarmare ripetutamente senza diagnosi: indica guasto persistente."
  },
  {
    source: "rcd_guida_tecnica.txt",
    chunk_text:
      "Cause principali di intervento del differenziale: " +
      "1) Dispersione su cavo degradato (isolamento <1MΩ con megohmetro 500V). " +
      "2) Apparecchio con corrente di dispersione elevata (driver LED, filtri EMC, inverter). " +
      "3) Umidità in scatole di derivazione o apparecchi IP inadeguato. " +
      "4) Neutro e PE uniti a valle del punto prescritto (errore di cablaggio). " +
      "5) Differenziale deteriorato con soglia effettiva abbassata. " +
      "6) Somma di dispersioni di molti apparecchi (ciascuno <30mA ma totale >30mA). " +
      "Misurare la corrente di dispersione con pinza differenziale clampata attorno a fase+neutro: " +
      "deve essere <30mA per tipo A da 30mA. Test mensile con pulsante TEST obbligatorio."
  },
  {
    source: "rcd_guida_tecnica.txt",
    chunk_text:
      "Differenziale scatta di notte o a riposo senza carichi inseriti: " +
      "possibile condensazione in scatole esterne o cavi interrati umidi. " +
      "Procedura: misurare isolamento di ogni linea con megohmetro 500V a circuito sezionato. " +
      "Valore atteso: >1MΩ (accettabile), >100MΩ (ottimo). " +
      "Se il valore scende sotto 0.5MΩ la linea è da sostituire o risanare. " +
      "Cavi interrati soggetti a umidità stagionale: isolare con giunzioni IP68 o in cavidotto sigillato. " +
      "Differenziale tipo AC rileva solo dispersioni sinusoidali; " +
      "tipo A rileva anche DC pulsanti (motori brushless, inverter, cariche EV). " +
      "Per impianti con molti inverter o driver LED usare sempre tipo A."
  },
  {
    source: "rcd_guida_tecnica.txt",
    chunk_text:
      "Driver LED e filtri EMC: ogni driver può avere corrente di dispersione verso terra " +
      "fino a 3.5mA (limite EN 61000-3-2). Su un circuito con 10 driver: dispersione totale " +
      "fino a 35mA → scatto differenziale 30mA. Soluzione: usare differenziale da 100mA " +
      "o raggruppare i driver su più circuiti con differenziali separati. " +
      "Misurare la dispersione di ogni driver con pinza amperometrica differenziale " +
      "(morsetti L+N dentro la pinza). Sostituire driver con bassa dispersione (<0.5mA) " +
      "se il problema persiste. Alimentatori switching con stadio PFC hanno dispersioni maggiori."
  },

  /* ── MAGNETOTERMICO / MCB ── */
  {
    source: "mcb_guida_tecnica.txt",
    chunk_text:
      "Il magnetotermico (MCB - Miniature Circuit Breaker) protegge da sovraccarico " +
      "(sganciatore bimetallico termico, ritardato) e cortocircuito (sganciatore magnetico, istantaneo). " +
      "Curva B (3-5×In): luce, prese residenziali, carichi resistivi. " +
      "Curva C (5-10×In): uso generale industriale, piccoli motori. " +
      "Curva D (10-20×In): motori con elevata corrente di spunto, trasformatori. " +
      "Se il MCB scatta subito all'inserimento → cortocircuito nel circuito. " +
      "Se scatta dopo minuti → sovraccarico termico (corrente >In prolungata). " +
      "Se scatta solo all'avvio → spunto eccessivo, valutare curva D o limitatore di spunto. " +
      "MCB caldo al tatto: verificare serraggio morsetti e corrente assorbita con pinza amperometrica."
  },
  {
    source: "mcb_guida_tecnica.txt",
    chunk_text:
      "Procedura diagnosi cortocircuito su linea prese: " +
      "1) Scollegare tutti i carichi dalla linea. " +
      "2) Misurare resistenza fase-neutro con ohmetro (circuito de-energizzato): deve essere >1MΩ. " +
      "3) Se continuità bassa → cortocircuito nel cavo o in una scatola di derivazione. " +
      "4) Sezionare la linea in tratti per individuare il punto di guasto. " +
      "5) Riarmare il MCB a vuoto: se scatta → guasto nel cablaggio fisso. " +
      "6) Se non scatta a vuoto: ricollegare i carichi uno alla volta. " +
      "Il carico che causa lo scatto ha un cortocircuito interno. " +
      "Non utilizzare fusibili di calibro superiore come bypass: rischio incendio."
  },

  /* ── CAVI E SEZIONI ── */
  {
    source: "cavi_sezioni_bt.txt",
    chunk_text:
      "Sezioni cavi consigliate per impianti civili (CEI 64-8): " +
      "1.5mm² → circuiti luce (max 10A / protezione 10-16A). " +
      "2.5mm² → prese di corrente (max 16A / protezione 16-20A). " +
      "4mm² → lavatrice, lavastoviglie, linee dedicate (max 25A). " +
      "6mm² → forno, piano cottura (max 32A). " +
      "10mm² → colonna montante / circuiti con alta potenza (max 50A). " +
      "Regola del 3%: la caduta di tensione massima ammessa è 3% a pieno carico. " +
      "Formula: ΔV% = (2 × L × I × ρ) / (S × Vn) × 100. " +
      "Dove ρ=0.0175 Ω·mm²/m (rame), L=lunghezza in metri, I=corrente in A, S=sezione mm². " +
      "Su percorsi lunghi (>30m) aumentare la sezione di un livello."
  },
  {
    source: "cavi_sezioni_bt.txt",
    chunk_text:
      "Portate dei cavi in base alla posa (CEI 20-91 / IEC 60364-5-52): " +
      "Posa in tubo sotto intonaco (metodo B2): riduzione fattore 0.70 rispetto all'aria libera. " +
      "Posa in fascio (3+ cavi affiancati): riduzione fattore 0.70. " +
      "Posa ad aria libera su passerella: portata massima. " +
      "Temperatura ambiente >30°C: riduzione portata (fattore 0.87 a 35°C, 0.71 a 45°C). " +
      "Cavi N07V-K (450/750V): uso interno in tubo. " +
      "Cavi FG7OR (0.6/1kV): uso esterno, interrato. " +
      "Cavi H07RN-F: uso con macchine mobili, flessibili. " +
      "Verificare sempre che il cavo sia adatto alla tensione di esercizio e alle condizioni ambientali."
  },

  /* ── QUADRI ELETTRICI ── */
  {
    source: "quadri_elettrici_bt.txt",
    chunk_text:
      "Regole fondamentali per quadri elettrici BT: " +
      "Separazione N/PE: il conduttore di neutro (N) e la protezione (PE) devono essere " +
      "su morsettiere separate e chiaramente identificate (N=blu, PE=giallo-verde). " +
      "Serraggio morsetti: verificare dopo 6 mesi dalla prima installazione (assestamento). " +
      "Coppia di serraggio: 1.5-2.5mm² → 0.5Nm, 4-6mm² → 0.8Nm, 10-16mm² → 1.2Nm. " +
      "Temperatura interna quadro: max 55°C in esercizio (verificare con termocamera). " +
      "Etichettatura: ogni dispositivo deve essere etichettato con il circuito protetto. " +
      "Riserva di spazio: minimo 20% per espansioni future. " +
      "IP del quadro: adeguato all'ambiente (IP20 interno, IP44 esterno, IP55 umido)."
  },
  {
    source: "quadri_elettrici_bt.txt",
    chunk_text:
      "Manutenzione preventiva quadro elettrico (annuale): " +
      "1) Verifica visiva: tracce di surriscaldamento, ossido, sporco, corpi estranei. " +
      "2) Serraggio morsetti con cacciavite dinamometrico. " +
      "3) Test pulsante TEST su ogni differenziale (scatto entro 300ms). " +
      "4) Misura correnti su ogni linea con pinza amperometrica. " +
      "5) Verifica temperature con termocamera (punti caldi > 10°C rispetto all'ambiente → anomalia). " +
      "6) Verifica continuità conduttori PE (resistenza PE < 1Ω dalla barra PE al punto più lontano). " +
      "7) Verifica coordinamento protezioni (selettività MCB generale vs. secondari). " +
      "8) Pulizia con aria compressa secca (circuito de-energizzato)."
  },

  /* ── MESSA A TERRA ── */
  {
    source: "impianto_terra_bt.txt",
    chunk_text:
      "Impianto di terra (CEI 64-8 / IEC 60364-5-54): " +
      "Resistenza di terra Rt max = 50V / Idn. " +
      "Con differenziale 30mA: Rt ≤ 1667Ω. " +
      "Con differenziale 300mA: Rt ≤ 167Ω. " +
      "Misura con tellumetro metodo a 3 poli (Wenner): " +
      "  - Picchetto di terra da misurare (E), " +
      "  - Picchetto di corrente (H) a 40m, " +
      "  - Picchetto di potenziale (S) a 20m in linea. " +
      "Eseguire la misura con l'impianto disconnesso dalla rete. " +
      "Dispersore a croce (interrato 0.5m): resistenza tipica 20-100Ω in terreno medio. " +
      "Dispersore ad anello attorno all'edificio + picchetti angolari: migliore performance."
  },
  {
    source: "impianto_terra_bt.txt",
    chunk_text:
      "Tensione neutro-terra (Vn-pe): deve essere <2V in condizioni normali. " +
      "Se >2V: possibile neutro volante (allentato) o squilibrio di carico trifase. " +
      "Neutro volante: conduttore di neutro interrotto → tensioni anomale sulle utenze. " +
      "Sintomi: lampade che variano intensità, apparecchi che si spengono/si bruciano. " +
      "Diagnosi: misurare tensione fase-neutro su ogni presa (deve essere 230V ±10%). " +
      "Se alcune prese mostrano 180V e altre 280V → neutro interrotto a monte. " +
      "Intervento urgente: sezionare l'impianto e cercare il punto di interruzione del neutro " +
      "partendo dal quadro e seguendo la linea a valle."
  },

  /* ── POMPE E SISTEMI IDRAULICI ── */
  {
    source: "pompe_elettriche.txt",
    chunk_text:
      "Circuito elettrico tipico pompa monofase: " +
      "MCB (curva C) → contattore (bobina 230V) → relè termico → pompa. " +
      "Catena consensi in automatico: galleggiante (NA) o pressostato (NA) in serie alla bobina. " +
      "Se la pompa non parte in automatico ma parte in manuale (bypass consensi): " +
      "  - Verificare continuità galleggiante: multimetro in ohm, deve dare 0Ω in posizione di lavoro. " +
      "  - Verificare pressostato: misurare tensione ai capi contatto durante il comando. " +
      "  - Verificare selettore Man/Auto e suoi morsetti. " +
      "Se il contattore non chiude: misurare tensione bobina durante il comando (deve essere 230V). " +
      "Se bobina ok ma contattore non chiude: bobina guasta o nucleo bloccato."
  },
  {
    source: "pompe_elettriche.txt",
    chunk_text:
      "Pompa monofase con condensatore di avviamento: " +
      "Il condensatore crea lo sfasamento necessario all'avvio del motore. " +
      "Sintomi condensatore guasto: pompa ronza ma non si avvia, corrente elevata, MCB scatta. " +
      "Misura condensatore con multimetro in modalità capacità (μF): " +
      "  valore atteso: sul targhetta del motore (tipicamente 8-50μF). " +
      "  se il multimetro non ha modalità cap: il condensatore si misura con RLC meter. " +
      "  tolleranza accettabile: ±10% del valore nominale. " +
      "Sostituire con condensatore di uguale capacità e tensione (almeno 450VAC). " +
      "Pompa trifase: NON ha condensatore, avviamento diretto o stella-triangolo."
  },
  {
    source: "pompe_elettriche.txt",
    chunk_text:
      "Pompa cavitazione: fenomeno per cui bolle di vapore si formano nell'aspirazione " +
      "perché la pressione scende sotto la tensione di vapore del liquido. " +
      "Sintomi: rumore tipo crepitio/graniglia, vibrazioni, perdita di portata, usura accelerata. " +
      "Cause: livello serbatoio troppo basso, filtro aspirazione ostruito, " +
      "percorso aspirazione con perdite d'aria, prevalenza troppo alta, pompa sovradimensionata. " +
      "Rimedi: aumentare livello serbatoio, pulire filtro, sigillare giunzioni aspirazione, " +
      "ridurre velocità pompa (inverter), installare valvola di regolazione mandata. " +
      "Sfiatare l'aria dalla pompa: aprire il tappo di sfiato fino a quando esce solo acqua. " +
      "Non fare girare una pompa centrifuga senza liquido (danno alle tenute meccaniche)."
  },
  {
    source: "pompe_elettriche.txt",
    chunk_text:
      "Relè termico (MTR) per protezione motore pompa: " +
      "Tarato al 100-105% della corrente nominale del motore (targa). " +
      "Se scatta frequentemente: verificare corrente assorbita in marcia (clamp meter su ogni fase). " +
      "Squilibrio fasi >10% → relè termico interviene per surriscaldamento avvolgimento. " +
      "Taratura errata: riscaldare a 110% In e verificare scatto entro il tempo previsto (classe 10: 4min). " +
      "Reset: pulsante RESET sul relè (manuale) o automatico dopo raffreddamento. " +
      "Non resettare senza trovare la causa: sovraccarico, perdita fase, pompa bloccata. " +
      "Relè termico trifase con protezione mancanza fase: interviene anche in caso di perdita di una fase."
  },

  /* ── MOTORI ELETTRICI TRIFASE ── */
  {
    source: "motori_trifase.txt",
    chunk_text:
      "Motore asincrono trifase: principi di diagnosi elettrica. " +
      "Misure a motore de-energizzato con ohmetro (resistance degli avvolgimenti): " +
      "  - Le 3 resistenze tra le fasi (U-V, V-W, U-W) devono essere bilanciate (±5%). " +
      "  - Se una fase è aperta (∞): avvolgimento interrotto → sostituzione motore. " +
      "  - Se una fase è in corto (0Ω): cortocircuito avvolgimento → sostituzione motore. " +
      "Misura isolamento avvolgimenti-terra con megohmetro 500V: deve essere >1MΩ. " +
      "Se <0.5MΩ: umidità o degradazione isolamento (essiccare il motore in forno a 80°C/24h). " +
      "Corrente a vuoto: tipicamente 30-50% della corrente nominale. " +
      "Corrente a carico: confrontare con targa, tolleranza ±10%."
  },
  {
    source: "motori_trifase.txt",
    chunk_text:
      "Mancanza di fase su motore trifase: causa più comune di guasto motore. " +
      "Sintomi: motore non si avvia (ronza), oppure si avvia ma lentamente con corrente alta, " +
      "surriscaldamento rapido. " +
      "Diagnosi: misurare le 3 tensioni L1-L2, L2-L3, L1-L3 a monte contattore (atteso ~400V ciascuna). " +
      "Poi misurare a valle contattore con contattore chiuso (atteso ~400V ciascuna). " +
      "Se manca una fase a valle ma non a monte → contatto contattore bruciato su quel polo. " +
      "Se manca a monte → fusibile fuso, morsetto allentato, o interruzione sulla linea a monte. " +
      "Con mancanza fase il motore assorbe 1.73× la corrente nominale sulle 2 fasi restanti. " +
      "Spegnere immediatamente per evitare bruciatura avvolgimento."
  },
  {
    source: "motori_trifase.txt",
    chunk_text:
      "Avviamento stella-triangolo (Y-Δ): riduce la corrente di spunto a 1/3. " +
      "Sequenza corretta: contattore principale + contattore stella → attesa (3-10s) → " +
      "apertura contattore stella → chiusura contattore triangolo. " +
      "Interblocco elettrico obbligatorio tra contattore stella e triangolo. " +
      "Problemi comuni: " +
      "1) Transizione troppo rapida → picco di corrente eccessivo. " +
      "2) Interblocco non funzionante → cortocircuito quando entrambi chiudono. " +
      "3) Timer non taratu to correttamente → motore non raggiunge velocità in stella. " +
      "Verifica: misurare corrente all'avvio con registratore di corrente, picco massimo in Δ <6×In."
  },

  /* ── CONTATTORI E CIRCUITI DI COMANDO ── */
  {
    source: "contattori_comando.txt",
    chunk_text:
      "Contattore elettromagnetico: componente per inserzione/disinserzione di carichi elettrici " +
      "con azionamento a distanza. Composto da: nucleo magnetico fisso, armatura mobile, " +
      "bobina di eccitazione, contatti principali (3 poli per trifase), contatti ausiliari (NA/NC). " +
      "Tensioni bobina standard: 24VAC, 48VAC, 110VAC, 230VAC, 24VDC, 48VDC. " +
      "Verificare sempre che la tensione bobina corrisponda all'alimentazione del circuito di comando. " +
      "Contattore che ronza: sporco sul nucleo, nucleo deformato, tensione bobina bassa (<85% Vn). " +
      "Contattore che non chiude: bobina guasta (misurare resistenza: tipicamente 500-5000Ω), " +
      "tensione assente alla bobina, interblocco NC aperto nel circuito di comando."
  },
  {
    source: "contattori_comando.txt",
    chunk_text:
      "Circuito di comando tipico con contattore: " +
      "Fase (L1) → fusibile comando (2A) → pulsante STOP (NC) → pulsante START (NA) → bobina (K1) → N. " +
      "Contatto ausiliario NA del contattore K1 in parallelo al pulsante START (contatto di tenuta). " +
      "Diagnosi se il contattore non parte: misurare tensione punto per punto nel circuito di comando. " +
      "1) Tensione a monte fusibile: 230V? → se no, manca alimentazione. " +
      "2) Tensione dopo fusibile: 230V? → se no, fusibile fuso (sostituire dopo verifica causa). " +
      "3) Tensione dopo STOP: 230V? → se no, pulsante STOP difettoso (contatto NC aperto). " +
      "4) Tensione alla bobina durante pressione START: 230V? → se no, pulsante START difettoso. " +
      "5) Se tensione bobina ok ma contattore non chiude: bobina guasta o nucleo inceppato."
  },
  {
    source: "contattori_comando.txt",
    chunk_text:
      "Interblocco contattori (inversione marcia motore): " +
      "Contattore avanti (KA) e contattore indietro (KB) non devono mai essere chiusi insieme " +
      "(cortocircuito trifase). Interblocco doppio: " +
      "1) Meccanico: blocco fisico tra i due contattori (accoppiati dal costruttore). " +
      "2) Elettrico: contatto ausiliario NC di KB in serie alla bobina KA e viceversa. " +
      "Verifica: con KA chiuso, tentare di chiudere KB → non deve chiudersi (interblocco attivo). " +
      "Se l'interblocco non funziona → rischio di cortocircuito trifase e danno irreversibile al quadro. " +
      "Tempo di pausa tra inversione: almeno 0.5-1s (il motore deve decelerare prima di invertire)."
  },

  /* ── FUSIBILI ── */
  {
    source: "fusibili_bt.txt",
    chunk_text:
      "Fusibili NH (Neozed-Hochleistungs): fusibili ad alto potere di interruzione per quadri BT. " +
      "Categorie: gG (uso generale, protezione cavi) e aM (protezione motori, tiene la corrente di spunto). " +
      "Calibri standard gG: 16, 25, 32, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400A. " +
      "Identificazione guasto: fusibile con finestrina nera/bruciata o test con multimetro in continuità. " +
      "Sostituzione: usare SEMPRE il calibro corretto — un fusibile sovradimensionato non protegge il cavo. " +
      "Portafusibile: verificare che le bacchette di contatto non siano ossidate o deformate. " +
      "Coppia serraggio dado portafusibile: rispettare la coppia indicata dal costruttore (danno per eccesso). " +
      "Fusibili ceramici cilindrici (10×38, 22×58): stessa logica, usati per circuiti ausiliari."
  },
  {
    source: "fusibili_bt.txt",
    chunk_text:
      "Selezione fusibile per motore (categoria aM): " +
      "Il fusibile aM protegge solo contro i cortocircuiti, NON contro il sovraccarico " +
      "(la protezione da sovraccarico è affidata al relè termico). " +
      "Calibro fusibile aM: tipicamente 2× la corrente nominale del motore. " +
      "Esempio: motore 7.5kW, In=15A → fusibile aM 32A. " +
      "Il fusibile aM regge la corrente di avviamento (6-8×In per 10-20 secondi). " +
      "Fusibile gG per motori: deve essere sovradimensionato per reggere lo spunto, " +
      "ma allora non protegge adeguatamente il cavo → meglio usare aM + relè termico. " +
      "Fusibili bruciati ripetutamente → cercare la causa (cortocircuito, avviamenti frequenti, fusibile sottocalibrato)."
  },

  /* ── PRESSOSTATI E GALLEGGIANTI ── */
  {
    source: "sensori_livello_pressione.txt",
    chunk_text:
      "Pressostato per pompa: dispositivo che misura la pressione del fluido e commuta un contatto " +
      "elettrico al raggiungimento della soglia impostata. " +
      "Taratura: vite di regolazione per pressione di intervento (cut-in) e differenziale (cut-out). " +
      "Esempio pompa autoclave: cut-in=2bar, cut-out=4bar (la pompa si avvia a 2, si ferma a 4). " +
      "Verifica contatto: multimetro in modalità continuità, il contatto NA deve chiudersi quando " +
      "la pressione scende sotto la soglia. Pressostato difettoso: contatto non commuta nonostante " +
      "la pressione cambi → sostituire. Perdita acqua dal pressostato: membrana rotta → sostituire. " +
      "Membrana ostruita da calcare: smontare e pulire con acido citrico diluito."
  },
  {
    source: "sensori_livello_pressione.txt",
    chunk_text:
      "Galleggiante (interruttore di livello a galleggiante): commuta il contatto quando il livello " +
      "del liquido raggiunge la posizione di intervento. " +
      "Tipi: verticale (asta), orizzontale (a sfera), a bolla (per serbatoi stretti). " +
      "Verifica funzionamento: sollevare e abbassare manualmente il galleggiante e misurare " +
      "la continuità del contatto con multimetro. Deve commutare nettamente senza rimbalzi. " +
      "Galleggiante bloccato: incrostazioni calcaree, alghe, residui. Smontare e pulire. " +
      "Cavo galleggiante: verificare isolamento (umidità può creare cortocircuiti sul cavo immerso). " +
      "Per serbatoi con liquidi aggressivi: usare galleggiante in PP o PVDF, non in PVC standard."
  },
  {
    source: "sensori_livello_pressione.txt",
    chunk_text:
      "Flussostato (flow switch): rileva la presenza o assenza di flusso in una tubazione. " +
      "A palette: una palette immersa nel fluido devia e commuta un microswitch. " +
      "Taratura: vite per regolare la soglia di portata minima. " +
      "Verifica: con flusso presente, il contatto NA deve essere chiuso (consenso al bruciatore). " +
      "Palette bloccata: calcare, corpi estranei → smontare e pulire. " +
      "Sostituzione: rispettare il diametro nominale della tubazione e il senso di flusso " +
      "(freccia incisa sul corpo del flussostato). Montare in tratto rettilineo di almeno 5D a monte e 3D a valle. " +
      "Flussostati differenziali (pressostati differenziali): misurano la differenza di pressione tra due punti."
  },

  /* ── TIMER E PROGRAMMATORI ── */
  {
    source: "timer_programmatori.txt",
    chunk_text:
      "Timer analogico (orologio a 24h con spinette): " +
      "Le spinette inserite nel disco definiscono i periodi di ON/OFF. " +
      "Errori comuni: spinette non completamente inserite, ora del timer non sincronizzata, " +
      "pila di backup scarica (dopo blackout l'ora si azzera). " +
      "Verifica: forzare la commutazione manuale con la leva TEST e misurare la continuità dell'uscita. " +
      "Timer digitale programmabile: verificare la programmazione con il display. " +
      "Batteria CR2032 da sostituire ogni 5 anni. " +
      "Se il contatto di uscita non commuta nonostante la programmazione sia corretta → timer guasto. " +
      "Misurare la tensione sull'uscita del timer durante il periodo programmato ON: deve essere 230V."
  },

  /* ── INVERTER / VFD ── */
  {
    source: "inverter_vfd.txt",
    chunk_text:
      "Inverter (variatore di frequenza / VFD): converte la tensione di rete (50Hz) in una " +
      "tensione a frequenza variabile per regolare la velocità del motore. " +
      "Codici di errore comuni: " +
      "OC (OverCurrent): sovracorrente → rampa di accelerazione troppo corta, motore in stallo, " +
      "  cortocircuito uscita. Aumentare il tempo di rampa. " +
      "OV (OverVoltage): sovratensione nel DC-bus → rampa di decelerazione troppo corta, " +
      "  usare resistenza di frenatura. " +
      "OH (OverHeat): surriscaldamento → filtro ventola intasato, temperatura ambiente alta. " +
      "  Pulire la ventola, aumentare la ventilazione del quadro. " +
      "EF (Earth Fault): dispersione verso terra → verificare isolamento motore e cavo."
  },
  {
    source: "inverter_vfd.txt",
    chunk_text:
      "Parametri fondamentali da configurare su inverter per pompa: " +
      "P01 - Corrente nominale motore (dalla targa). " +
      "P02 - Frequenza massima (50Hz per velocità nominale, ridurre per limitare portata). " +
      "P03 - Rampa accelerazione (tipico 5-30s per pompe). " +
      "P04 - Rampa decelerazione (tipico 5-30s). " +
      "P05 - Protezione termica motore (abilitare e impostare In motore). " +
      "Cavi tra inverter e motore: usare cavi schermati, max 20m senza filtro. " +
      "Terra: collegare lo schermo al PE del quadro (solo a lato inverter, non al motore). " +
      "Non usare il differenziale tradizionale su uscita inverter: usare tipo B (DC pulsante+AC)."
  },

  /* ── PLC ── */
  {
    source: "plc_automazione.txt",
    chunk_text:
      "PLC (Programmable Logic Controller): diagnosi di primo livello senza software. " +
      "LED di stato: RUN (verde lampeggiante = ok), STOP (giallo fisso = fermato), " +
      "ERR (rosso = errore hardware o firmware). " +
      "LED ingressi digitali: acceso = ingresso attivo (segnale presente). " +
      "LED uscite digitali: acceso = uscita attivata dal programma. " +
      "Se un'uscita è attivata nel programma ma il carico non risponde: " +
      "1) Verificare la tensione ai morsetti di uscita del PLC (transistor: 24VDC; relè: 230VAC). " +
      "2) Verificare il fusibile del modulo uscite (spesso internamente). " +
      "3) Verificare l'alimentazione 24VDC del PLC (morsetti +24V e 0V). " +
      "Se un ingresso non si attiva nonostante il sensore sia attivo: verificare il cablaggio e la tensione."
  },

  /* ── SONDE DI TEMPERATURA ── */
  {
    source: "sonde_temperatura.txt",
    chunk_text:
      "Sonda PT100: resistenza che varia linearmente con la temperatura. " +
      "Valore a 0°C = 100Ω. Formula: R(T) = 100 × (1 + 0.00385 × T). " +
      "Esempi: 20°C=107.8Ω, 100°C=138.5Ω, 200°C=175.8Ω. " +
      "Misura con ohmetro (circuito de-energizzato): confrontare con tabella PT100. " +
      "Se misura ∞ → sonda interrotta (lettura massima/OL sullo strumento). " +
      "Se misura 0Ω → cortocircuito sulla sonda o sul cavo. " +
      "Cablaggio: PT100 può essere a 2, 3 o 4 fili. " +
      "Con 2 fili la resistenza del cavo si somma alla misura → errore su percorsi lunghi. " +
      "Con 3 o 4 fili il modulo di acquisizione compensa la resistenza del cavo."
  },
  {
    source: "sonde_temperatura.txt",
    chunk_text:
      "Sonda NTC (Negative Temperature Coefficient): resistenza che diminuisce all'aumentare " +
      "della temperatura. Usata in caldaie, split, frigoriferi. " +
      "Valore tipico a 25°C: 10kΩ (NTC 10K). " +
      "Misura con ohmetro: confrontare con la curva NTC del costruttore. " +
      "Se misura ∞ → sonda interrotta → la centralina legge temperatura minima o errore. " +
      "Se misura 0Ω → cortocircuito → centralina legge temperatura massima o errore. " +
      "Connettori ossidati: possono aggiungere resistenza e falsare la misura (pulizia con sgrassatore). " +
      "Termocoppie (tipo K, J, T): generano una tensione proporzionale alla temperatura. " +
      "Misura con multimetro in modalità mV: confrontare con tabella termocoppia al tipo."
  },

  /* ── SPD / SCARICATORI ── */
  {
    source: "spd_sovratensioni.txt",
    chunk_text:
      "SPD (Surge Protective Device) - scaricatore di sovratensione: " +
      "protegge l'impianto da impulsi di tensione (fulmini, manovre di rete). " +
      "Classe I (tipo 1): installato nel quadro principale, protegge contro fulmine diretto. " +
      "Classe II (tipo 2): installato nei quadri secondari, protegge da scariche indirette. " +
      "Classe III (tipo 3): in prossimità delle utenze sensibili (PC, TV, PLC). " +
      "Indicatore di stato: finestra verde = OK, rossa = guasto (MOV esaurito). " +
      "Un SPD con indicatore rosso non offre più alcuna protezione → sostituire. " +
      "Corrente di scarica nominale In: 5-20kA (classe II). " +
      "Messa a terra: cavo PE cortissimo (<0.5m) e sezione adeguata (≥4mm²). " +
      "CEI EN 61643-11: norma di riferimento per SPD in impianti BT."
  },

  /* ── BRUCIATORI E CONSENSI ── */
  {
    source: "bruciatori_consensi.txt",
    chunk_text:
      "Bruciatore a gas: catena di sicurezza e consensi. " +
      "Consensi tipici per l'avvio: " +
      "1) Termostato di sicurezza (NC): apre se la temperatura supera il valore di sicurezza. " +
      "2) Pressostato gas (NA): chiude quando la pressione del gas è sufficiente. " +
      "3) Flussostato acqua (NA): chiude quando il flusso acqua è presente. " +
      "4) Pressostato aria (NA su bruciatori a ventilatore): chiude con aria sufficiente. " +
      "Se il bruciatore va in blocco: leggere il codice di errore sul pannello della centralina. " +
      "Reset: pulsante RESET manuale (non resettare senza trovare la causa). " +
      "Blocco per fiamma non rilevata: elettrodo sporco o posizionato male, " +
      "valvola gas non apre, pressione gas insufficiente."
  },
  {
    source: "bruciatori_consensi.txt",
    chunk_text:
      "Caldaia a gas: diagnosi blocco per mancanza flussostato. " +
      "Il flussostato (o pressostato differenziale acqua) garantisce che ci sia circolazione " +
      "prima di accendere il bruciatore. Se la pompa di circolazione non funziona → blocco caldaia. " +
      "Procedura: verificare se la pompa gira (rumore, calore corpo pompa). " +
      "Se pompa ferma: verificare alimentazione, contattore, relè termico. " +
      "Se pompa gira ma flussostato non chiude: taratura errata, palette ostruita, " +
      "aria nel circuito idraulico (sfiatare). " +
      "Vaso di espansione: pressione troppo bassa (<1bar a freddo) → integrare acqua nel circuito. " +
      "Pressione troppo alta (>2.5bar a caldo) → valvola di sicurezza scarica → membrana vaso esaurita."
  },

  /* ── NORME CEI ── */
  {
    source: "norme_cei_bt.txt",
    chunk_text:
      "CEI 64-8 (impianti elettrici utilizzatori): principali prescrizioni. " +
      "Art. 412: protezione contro i contatti diretti — involucri con IP2X, distanze di sicurezza. " +
      "Art. 413: protezione contro i contatti indiretti — uso della messa a terra + differenziale. " +
      "Art. 433: protezione contro il sovraccarico — coordinamento tra portata del cavo e protezione. " +
      "Art. 434: protezione contro il cortocircuito — potere di interruzione del MCB ≥ Icc nel punto. " +
      "Art. 701: luoghi contenenti vasca da bagno — differenziale 30mA obbligatorio, " +
      "           zone 0/1/2 con divieto di prese (eccetto sicurezza bassissima tensione SELV). " +
      "Art. 704: cantieri — protezione PRCD (differenziale mobile) su ogni presa, " +
      "           messa a terra dell'armatura dei casseri metallici."
  },
  {
    source: "norme_cei_bt.txt",
    chunk_text:
      "CEI 11-27: sicurezza per lavori su impianti elettrici. " +
      "Definizioni: PES (Persona Esperta in Sicurezza), PAV (Persona Avvertita), PEC (Persona comune). " +
      "Lavori fuori tensione (regola delle 5): " +
      "1) Sezionare. 2) Bloccare il sezionatore (LOTO). 3) Verificare l'assenza di tensione. " +
      "4) Mettere a terra e in cortocircuito (su MT/AT). 5) Proteggere le parti adiacenti in tensione. " +
      "Lavori in prossimità di parti in tensione BT: mantenere distanza DL ≥ 100mm o usare schermi. " +
      "Sistemi MT/AT (tensione >1kV): SOLO PES abilitato, mai un elettricista BT senza formazione specifica. " +
      "IA Wire Pro gestisce SOLO impianti BT ≤1000V."
  },
  {
    source: "norme_cei_bt.txt",
    chunk_text:
      "Verifiche iniziali impianto (DM 37/08 + CEI 64-8): " +
      "1) Continuità dei conduttori PE e delle connessioni equipotenziali. " +
      "2) Resistenza di isolamento (500V: >1MΩ tra fase e terra, tra fase e neutro). " +
      "3) Protezione per separazione dei circuiti SELV, PELV, FELV. " +
      "4) Resistenza/impedenza del circuito di terra. " +
      "5) Funzionamento dispositivi differenziali (tempo e corrente di intervento). " +
      "6) Caduta di tensione (max 3% dal punto di consegna all'utenza). " +
      "7) Verifica delle protezioni contro il cortocircuito (potere di interruzione). " +
      "Documentazione obbligatoria: dichiarazione di conformità (DoC) rilasciata dall'installatore."
  },

  /* ── PROCEDURE SICUREZZA / LOTO ── */
  {
    source: "procedure_loto_sicurezza.txt",
    chunk_text:
      "LOTO (LockOut-TagOut): procedura per garantire che una macchina non si avvii " +
      "durante operazioni di manutenzione. " +
      "Procedura LOTO BT: " +
      "1) Identificare tutte le fonti di energia (elettrica, pneumatica, idraulica, meccanica). " +
      "2) Informare il personale dell'area. " +
      "3) Spegnere la macchina con le procedure normali. " +
      "4) Aprire e bloccare (lucchetto personale) il sezionatore/interruttore generale. " +
      "5) Appendere cartellino TAG 'NON INSERIRE - IN MANUTENZIONE'. " +
      "6) Verificare assenza tensione con multimetro su ogni conduttore verso terra. " +
      "7) Scaricare eventuali condensatori (inverter, UPS: attendere 5 minuti). " +
      "8) Eseguire il lavoro. 9) Rimuovere lucchetto solo dopo aver ripristinato le protezioni."
  },
  {
    source: "procedure_loto_sicurezza.txt",
    chunk_text:
      "Strumenti di misura per impianti elettrici BT: " +
      "Multimetro digitale (CAT III 1000V o CAT IV 600V): misura tensione, corrente (con shunt), " +
      "resistenza, continuità, diodi, capacità. " +
      "Pinza amperometrica (clamp meter): misura corrente AC senza interrompere il circuito. " +
      "Tipi: AC (solo sinusoidale), AC/DC (true RMS per forme d'onda distorte). " +
      "Megohmetro (500V o 1000V): misura la resistenza di isolamento di cavi e avvolgimenti. " +
      "Tester RCD: verifica il tempo di intervento del differenziale (IEC 61557-6). " +
      "Tellumetro: misura la resistenza di terra (metodo a 3 poli). " +
      "Termocamera: individua punti caldi in quadri e morsettiere (anomalia > +10°C rispetto all'ambiente)."
  },

  /* ── ALIMENTATORI / TRASFORMATORI BT ── */
  {
    source: "alimentatori_trasformatori.txt",
    chunk_text:
      "Trasformatore di comando 230V/24V: alimenta i circuiti ausiliari e le bobine dei contattori. " +
      "Fusibile primario: protegge il primario da cortocircuiti (calibro: In trasformatore × 1.5). " +
      "Fusibile secondario: protegge il circuito ausiliario a 24V. " +
      "Se manca la tensione a 24V: " +
      "1) Verificare il fusibile primario (continuità con ohmetro). " +
      "2) Verificare la tensione al primario (230VAC). " +
      "3) Misurare la tensione al secondario (24VAC ±10%). " +
      "4) Se secondario muto con primario ok → trasformatore guasto (avvolgimento secondario interrotto). " +
      "Surriscaldamento trasformatore: sovraccarico del circuito ausiliario, " +
      "bobina in cortocircuito sul secondario, ventilazione insufficiente."
  },
  {
    source: "alimentatori_trasformatori.txt",
    chunk_text:
      "Alimentatore switching 24VDC (per PLC, sensoristica, relè): " +
      "Protezione da cortocircuito: la maggior parte va in protezione e si riavvia automaticamente " +
      "(hiccup mode) quando il cortocircuito viene eliminato. " +
      "LED verde = ok; LED rosso/spento = guasto o sovraccarico. " +
      "Diagnosi: misurare tensione uscita a vuoto e a carico. " +
      "Se cade <22V sotto carico → alimentatore sottodimensionato o guasto. " +
      "Verificare la corrente assorbita totale dai carichi e confrontare con la portata nominale. " +
      "Alimentatori con trim: regolare con trimmer la tensione di uscita a 24.0V ±0.5V. " +
      "Condensatori interni: durata tipica 5-10 anni. Un alimentatore >8 anni con problemi " +
      "→ sostituire preventivamente."
  },

  /* ── DIAGOSI GUASTI COMUNI AGGIUNTIVI ── */
  {
    source: "diagnosi_guasti_avanzati.txt",
    chunk_text:
      "Morsetto allentato — causa principale di guasti termici nei quadri: " +
      "Un morsetto non serrato introduce una resistenza di contatto aggiuntiva. " +
      "Con corrente I che scorre: potenza dissipata P = I² × R_contatto. " +
      "Con I=20A e R_contatto=0.1Ω: P = 40W → surriscaldamento localizzato. " +
      "Ispezione con termocamera: anomalia termica visibile come punto caldo. " +
      "Senza termocamera: verifica serraggio con cacciavite dinamometrico. " +
      "Caduta di tensione sul morsetto: misurare con multimetro ai due capi del morsetto sotto carico. " +
      "Max accettabile: 10-20mV. Se >50mV → morsetto da serrare o sostituire. " +
      "Morsetti anneriti: segno di arco elettrico protratto → sostituire morsetto e verificare il cavo."
  },
  {
    source: "diagnosi_guasti_avanzati.txt",
    chunk_text:
      "Diagnosi con multimetro — metodo 'tension drop' (ricerca guasto per caduta di tensione): " +
      "Applicabile a circuiti in serie (catena di consensi, fusibili, contatti). " +
      "Con il circuito ENERGIZZATO: misurare la tensione ai capi di ogni componente. " +
      "Un componente integro (chiuso) mostra 0V ai capi. " +
      "Un componente aperto (interrotto) mostra la tensione di alimentazione ai capi. " +
      "Procedura: partire dal carico e risalire verso la sorgente. " +
      "Il primo componente che mostra tensione ai capi è quello aperto (guasto). " +
      "Attenzione: lavorare su circuiti energizzati richiede DPI adeguati (guanti isolanti CAT III). " +
      "Alternativa sicura: con circuito de-energizzato, misurare continuità di ogni componente."
  },
  {
    source: "diagnosi_guasti_avanzati.txt",
    chunk_text:
      "Condensa in scatole e apparecchi elettrici: " +
      "Si forma quando la temperatura scende sotto il punto di rugiada dell'aria umida interna. " +
      "Tipicamente di notte o in stagioni fredde su impianti non riscaldati. " +
      "Effetti: dispersione verso terra, cortocircuiti, ossidazione dei contatti. " +
      "Soluzioni: " +
      "1) Resistenza anticondensa termostatata all'interno del quadro (5-50W, attiva sotto ~5°C). " +
      "2) Scatole con grado IP adeguato + essiccante (silica gel, da rinnovare periodicamente). " +
      "3) Cavi con guaina doppia nelle zone soggette a condensa. " +
      "4) Scatole con pressacavi a tenuta stagna per evitare l'ingresso di aria umida. " +
      "Per impianti in ambienti umidi (cantine, locali pompe): IP55 minimo su scatole e quadri."
  },
  {
    source: "diagnosi_guasti_avanzati.txt",
    chunk_text:
      "Verifica dell'isolamento dei cavi con megohmetro: " +
      "Procedura: scollegare ENTRAMBE le estremità del cavo da qualsiasi apparecchiatura. " +
      "Impostare 500VDC (cavi ≤1kV). Collegare un terminale del megohmetro al conduttore, " +
      "l'altro alla terra o alla guaina del cavo. Attendere 1 minuto prima di leggere il valore. " +
      "Valori di riferimento: >1MΩ = accettabile, >100MΩ = buono, >1GΩ = ottimo. " +
      "Cavi nuovi: tipicamente >100MΩ. Cavi vecchi con isolamento degradato: <0.5MΩ. " +
      "Non eseguire la misura su cavi bagnati (la misura sarebbe falsata verso il basso). " +
      "Misurare sempre fase-terra e neutro-terra. " +
      "Dopo la misura, scaricare il cavo collegandolo momentaneamente a terra (evita shock)."
  },

  /* ── SEZIONI ORIGINALI GIÀ PRESENTI (aggiornate) ── */
  {
    source: "manuale_elettrico_base.txt",
    chunk_text:
      "Il differenziale (RCD) interviene quando rileva una corrente di dispersione verso terra " +
      "superiore alla soglia impostata (tipicamente 30mA per uso domestico). Dopo un intervento, " +
      "prima di riarmare verificare il circuito con multimetro: misurare la continuità verso terra " +
      "e l'isolamento dei cavi con megohmetro a 500V. Non riarmare a ripetizione senza diagnosi."
  },
  {
    source: "manuale_elettrico_base.txt",
    chunk_text:
      "Il magnetotermico (MCB) protegge il circuito da sovraccarichi e cortocircuiti. " +
      "Curva B: scatta a 3–5× In (residenziale, illuminazione). " +
      "Curva C: scatta a 5–10× In (industriale, motori). " +
      "Curva D: scatta a 10–20× In (carichi con elevate correnti di spunto). " +
      "Se scatta ripetutamente senza causa apparente: misurare la corrente assorbita con pinza amperometrica."
  },
  {
    source: "manuale_elettrico_base.txt",
    chunk_text:
      "Sezioni cavi consigliate: " +
      "NYM-J 3×1.5mm² per circuiti luce (max 16A / 3.5kW a 230V). " +
      "NYM-J 3×2.5mm² per prese di corrente standard (max 20A). " +
      "NYM-J 3×4mm² per circuiti lavatrice/lavastoviglie dedicati. " +
      "NYM-J 3×6mm² per forno o piano cottura con linea dedicata (protezione 32A). " +
      "Aumentare sezione in caso di percorsi >20m per limitare la caduta di tensione a <3%."
  },
  {
    source: "guida_quadri_elettrici.txt",
    chunk_text:
      "Nel quadro elettrico il neutro (N) e la terra (PE) NON devono mai essere uniti " +
      "a valle del nodo equipotenziale principale. " +
      "In un sistema TN-C il conduttore PEN è unico fino al quadro principale. " +
      "Nel quadro principale avviene la separazione: da quel punto in poi N e PE " +
      "devono percorrere conduttori distinti fino alle utenze. " +
      "Unire N e PE fuori dal punto prescritto crea un impianto non a norma CEI 64-8."
  },
  {
    source: "guida_quadri_elettrici.txt",
    chunk_text:
      "Procedura di verifica del differenziale (RCD): " +
      "1) Misurare la tensione di alimentazione con multimetro (deve essere 230V ±10%). " +
      "2) Usare tester RCD certificato per misurare il tempo di intervento: " +
      "   deve essere <300ms a In, <40ms a 5×In (per tipo G). " +
      "3) Premere il tasto TEST mensile per verifica meccanica dell'interruzione. " +
      "4) Registrare i valori misurati per documentazione di manutenzione."
  },
  {
    source: "guida_quadri_elettrici.txt",
    chunk_text:
      "Serraggio morsetti nel quadro: verificare e riserrare dopo 6 mesi dalla prima installazione " +
      "(assestamento termico e meccanico dei conduttori). " +
      "Coppia di serraggio indicativa: " +
      "morsetti 1.5–2.5mm² → 0.5–0.6 Nm, " +
      "morsetti 4–6mm²   → 0.8–1.0 Nm, " +
      "morsetti 10–16mm² → 1.2–1.5 Nm. " +
      "Usare cacciavite dinamometrico. Un morsetto allentato genera calore, archi e incendi."
  },
  {
    source: "norme_cei_impianti.txt",
    chunk_text:
      "CEI 64-8 (impianti elettrici in luoghi residenziali): " +
      "ogni utenza con potenza >2kW (lavatrice, lavastoviglie, forno, climatizzatore) " +
      "deve avere una linea dedicata con proprio magnetotermico e differenziale 30mA. " +
      "Nei bagni: circuiti luce e prese protetti da differenziale 10mA. " +
      "Il numero minimo di prese per ambiente: cucina ≥4, soggiorni ≥3, camere ≥2."
  },
  {
    source: "norme_cei_impianti.txt",
    chunk_text:
      "Resistenza di terra: la normativa CEI 64-8 / IEC 60364 prescrive " +
      "Rt ≤ 50V / Idn_differenziale. " +
      "Esempi: con RCD 30mA → Rt ≤ 1667 Ω; con RCD 10mA → Rt ≤ 5000 Ω; " +
      "con RCD 300mA → Rt ≤ 167 Ω. " +
      "Misurare con tellumetro a 3 o 4 poli (metodo Wenner), mai con tester ordinario. " +
      "Eseguire la misura dopo pioggia intensa solo se si vuole il valore peggiore."
  },
  {
    source: "diagnosi_guasti_comuni.txt",
    chunk_text:
      "Guasto: differenziale scatta appena si richiude. " +
      "Procedura di diagnosi: " +
      "1) Scollegare tutti i carichi dalla linea protetta. " +
      "2) Riarmare il differenziale a vuoto: se rimane → guasto nel cablaggio (dispersione verso terra), " +
      "   misurare l'isolamento dei cavi con megohmetro 500V (deve essere >1MΩ). " +
      "3) Se scatta ancora a vuoto → probabile guasto nel differenziale stesso o nel conduttore di neutro. " +
      "4) Verificare che neutro e terra non siano uniti a valle del punto prescritto."
  },
  {
    source: "diagnosi_guasti_comuni.txt",
    chunk_text:
      "Guasto: magnetotermico caldo al tatto / odore di plastica bruciata. " +
      "Cause possibili: " +
      "1) Morsetto allentato (alta resistenza di contatto) → serrare al valore previsto. " +
      "2) Cavo sottodimensionato per il carico → verificare sezione con calibro, sostituire se necessario. " +
      "3) Carico eccessivo (sovraccarico continuo) → misurare corrente con pinza, " +
      "   ridurre carichi o aumentare sezione/protezione. " +
      "4) Dispositivo difettoso → sostituire. " +
      "Non continuare a utilizzare fino alla risoluzione della causa."
  },
];

// ============================================================
// Runner
// ============================================================
(async () => {
  const client = await pool.connect();
  try {
    console.log("\n🔄 Ingest doc_chunks — IA Wire Pro\n");
    console.log("  Totale chunk da processare: " + CHUNKS.length + "\n");

    let inserted = 0;
    let skipped  = 0;

    for (const chunk of CHUNKS) {
      const existing = await client.query(
        `SELECT id FROM doc_chunks WHERE source = $1 AND chunk_text = $2 LIMIT 1`,
        [chunk.source, chunk.chunk_text]
      );

      if (existing.rowCount > 0) {
        skipped++;
        process.stdout.write("  ⏭  Già presente: [" + chunk.source + "] " +
          chunk.chunk_text.slice(0, 55) + "...\n");
        continue;
      }

      await client.query(
        `INSERT INTO doc_chunks (source, chunk_text) VALUES ($1, $2)`,
        [chunk.source, chunk.chunk_text]
      );
      inserted++;
      process.stdout.write("  ✅ Inserito:    [" + chunk.source + "] " +
        chunk.chunk_text.slice(0, 55) + "...\n");
    }

    console.log("\n✅ Ingest completato: " + inserted + " inseriti, " + skipped + " già presenti.\n");
  } catch (err) {
    console.error("\n❌ Ingest fallito:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
