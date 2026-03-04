"use strict";
/**
 * basicPatterns.js — pattern BT civili/industriali di base.
 * Complementano i failure_patterns.json del diagnosticEngine.
 * Format: { id, keywords[], observations[], hypotheses[], checks[], risks[] }
 * Certainty: ALTA | MEDIA | BASSA
 */

var patterns = [
  /* ─────────────────────────────────────────────────────── 1 */
  {
    id: "rcd_trip_light",
    keywords: ["differenziale", "luce", "luci", "lampada", "driver led"],
    observations: [
      "Il differenziale interviene quando viene alimentato il circuito luci",
      "Il guasto è associato al circuito illuminazione"
    ],
    hypotheses: [
      { text: "Dispersione verso terra nel cavo del circuito luci (isolamento degradato)", certainty: "ALTA" },
      { text: "Driver LED o ballast con corrente di dispersione eccessiva (>10mA totali)", certainty: "MEDIA" },
      { text: "Contatto fase-terra nel punto luce (connettore mal eseguito)", certainty: "MEDIA" }
    ],
    checks: [
      "Isolare completamente il circuito luci dal differenziale",
      "Misurare l'isolamento del cavo con megger 500V (atteso >1MΩ)",
      "Collegare le lampade/driver una alla volta per individuare il componente guasto",
      "Misurare la corrente di dispersione di ogni driver con pinza differenziale"
    ],
    risks: [
      "Rischio scossa elettrica se il guasto non viene eliminato prima del reset"
    ]
  },
  /* ─────────────────────────────────────────────────────── 2 */
  {
    id: "pump_not_start",
    keywords: ["pompa", "non parte", "non si avvia", "non parte"],
    observations: [
      "La pompa non si avvia quando viene richiesto il funzionamento",
      "Il circuito di comando risulta attivo ma la pompa non risponde"
    ],
    hypotheses: [
      { text: "Galleggiante o pressostato non chiude il contatto di consenso", certainty: "ALTA" },
      { text: "Il contattore non riceve il segnale di comando (tensione bobina assente)", certainty: "MEDIA" },
      { text: "Protezione magnetotermica o relè termico aperto", certainty: "BASSA" }
    ],
    checks: [
      "Verificare il contatto del galleggiante con multimetro (continuità in posizione di lavoro)",
      "Misurare la tensione sulla bobina del contattore durante il comando (deve essere 230/24VAC/VDC)",
      "Verificare che il relè termico (MTR) non sia scattato — premere il tasto di reset se necessario",
      "Misurare la tensione ai morsetti della pompa con contattore chiuso"
    ],
    risks: [
      "Blocco impianto idraulico o svuotamento serbatoio senza protezione"
    ]
  },
  /* ─────────────────────────────────────────────────────── 3 */
  {
    id: "motor_not_start_3ph",
    keywords: ["motore trifase", "non parte", "contattore chiuso", "non gira"],
    observations: [
      "Il motore trifase non si avvia nonostante il contattore sia chiuso",
      "Tensione presente a monte del contattore"
    ],
    hypotheses: [
      { text: "Perdita di una fase: motore non ha le 3 fasi (ronza o non si muove)", certainty: "ALTA" },
      { text: "Relè termico scattato: MTR non resettato dopo sovraccarico", certainty: "MEDIA" },
      { text: "Avvolgimento motore guasto: cortocircuito o interruzione", certainty: "BASSA" }
    ],
    checks: [
      "Misurare le 3 tensioni di uscita dal contattore: L1-L2, L2-L3, L3-L1 (attese ~400V)",
      "Verificare lo stato del relè termico (MTR) — tasto reset sporgente indica scatto",
      "Misurare la resistenza degli avvolgimenti con ohmetro (3 fasi devono essere bilanciate)"
    ],
    risks: [
      "Surriscaldamento motore se funziona con perdita di fase — spegnere immediatamente"
    ]
  },
  /* ─────────────────────────────────────────────────────── 4 */
  {
    id: "rcd_trip_random",
    keywords: ["differenziale", "scatta", "notte", "riposo", "senza motivo"],
    observations: [
      "Il differenziale scatta in modo apparentemente casuale, anche a riposo",
      "Non c'è correlazione diretta con l'inserimento di un carico specifico"
    ],
    hypotheses: [
      { text: "Dispersione di terra progressiva su cavo vecchio (umidità, UV, abrasione)", certainty: "ALTA" },
      { text: "Differenziale degradato con soglia effettiva scesa sotto 30mA", certainty: "MEDIA" },
      { text: "Somma delle correnti di dispersione dei carichi EMC supera la soglia", certainty: "MEDIA" }
    ],
    checks: [
      "Misurare l'isolamento di tutti i circuiti con megger 500V a riposo",
      "Sezionare i circuiti uno alla volta per individuare il tratto con dispersione",
      "Misurare la corrente di dispersione totale con pinza differenziale a riposo",
      "Testare il differenziale con il tasto TEST: deve scattare in <300ms"
    ],
    risks: [
      "Rischio scossa elettrica o incendio se il guasto non viene eliminato"
    ]
  },
  /* ─────────────────────────────────────────────────────── 5 */
  {
    id: "no_power_downstream",
    keywords: ["tensione assente", "non alimentato", "non arriva tensione", "muto"],
    observations: [
      "Tensione presente a monte del componente di protezione",
      "Tensione assente a valle: utenza non alimentata"
    ],
    hypotheses: [
      { text: "Interruttore magnetotermico aperto (scattato per sovraccarico/guasto)", certainty: "ALTA" },
      { text: "Fusibile fuso nel circuito a valle", certainty: "MEDIA" },
      { text: "Morsetto o connettore allentato nel percorso di alimentazione", certainty: "MEDIA" }
    ],
    checks: [
      "Verificare visivamente lo stato degli interruttori magnetotermici sul quadro",
      "Misurare la continuità di ogni fusibile (con circuito de-energizzato)",
      "Misurare la tensione a valle di ogni protezione con circuito energizzato",
      "Verificare i morsetti della morsettiera — un morsetto allentato può cadere senza segni visivi"
    ],
    risks: [
      "Non resettare un interruttore senza verificare la causa dello scatto"
    ]
  },
  /* ─────────────────────────────────────────────────────── 6 */
  {
    id: "rcd_trip_lights_humidity",
    keywords: ["differenziale", "salta", "luci", "esterno", "umidità", "pioggia"],
    observations: [
      "Il differenziale scatta con luci esterne, spesso in condizioni di umidità/pioggia."
    ],
    hypotheses: [
      { text: "Dispersione su giunzioni esterne o apparecchi IP inadeguato/umido", certainty: "ALTA" },
      { text: "Cavo esterno lesionato o schiacciato con perdita verso terra", certainty: "MEDIA" },
      { text: "Driver/trasformatore lampada guasto con isolamento ridotto", certainty: "MEDIA" }
    ],
    checks: [
      "Sezionare linea luci esterne e verificare se il differenziale regge",
      "Ispezionare scatole esterne/giunzioni e presenza acqua/condensa",
      "Provare una lampada alla volta / scollegare driver",
      "Misurare isolamento linea (megger se disponibile)"
    ],
    risks: [
      "Rischio scossa elettrica",
      "Dispersione verso terra"
    ]
  },
  /* ─────────────────────────────────────────────────────── 7 */
  {
    id: "rcd_trip_led_driver",
    keywords: ["differenziale", "salta", "led", "driver", "alimentatore", "faretto"],
    observations: [
      "Il differenziale scatta quando vengono alimentati LED/driver."
    ],
    hypotheses: [
      { text: "Driver LED in dispersione verso terra", certainty: "ALTA" },
      { text: "Cablaggio lato secondario driver danneggiato o umido", certainty: "MEDIA" },
      { text: "Somma dispersioni su più driver supera soglia 30mA", certainty: "MEDIA" }
    ],
    checks: [
      "Scollegare i driver uno alla volta e riprovare",
      "Controllare morsetti/isolamenti e presenza umidità",
      "Raggruppare carichi e verificare se lo scatto dipende dal numero di driver"
    ],
    risks: [
      "Rischio scossa elettrica",
      "Scatto intempestivo"
    ]
  },
  /* ─────────────────────────────────────────────────────── 8 */
  {
    id: "rcd_trip_water_heater",
    keywords: ["differenziale", "salta", "boiler", "scaldacqua", "resistenza"],
    observations: [
      "Il differenziale scatta quando entra in servizio lo scaldacqua/boiler."
    ],
    hypotheses: [
      { text: "Resistenza del boiler in dispersione verso terra", certainty: "ALTA" },
      { text: "Umidità/morsettiera resistenza ossidata", certainty: "MEDIA" },
      { text: "Cavo alimentazione boiler danneggiato", certainty: "MEDIA" }
    ],
    checks: [
      "Scollegare alimentazione boiler e verificare se il differenziale regge",
      "Misurare isolamento della resistenza verso terra (megger se disponibile)",
      "Ispezionare morsettiera e segni di umidità/ossido"
    ],
    risks: [
      "Rischio scossa elettrica",
      "Rischio guasto progressivo"
    ]
  },
  /* ─────────────────────────────────────────────────────── 9 */
  {
    id: "rcd_trip_pump",
    keywords: ["differenziale", "salta", "pompa", "elettropompa", "sommersa"],
    observations: [
      "Il differenziale scatta quando parte una pompa."
    ],
    hypotheses: [
      { text: "Motore pompa con isolamento degradato (dispersione)", certainty: "ALTA" },
      { text: "Cavo pompa immerso/giunzione umida", certainty: "MEDIA" },
      { text: "Condensa dentro quadro o morsetti pompa", certainty: "BASSA" }
    ],
    checks: [
      "Scollegare la pompa e verificare tenuta differenziale",
      "Misurare isolamento motore/cavo verso terra",
      "Controllare giunzioni e passacavi, eventuale infiltrazione"
    ],
    risks: [
      "Rischio scossa elettrica",
      "Fermo impianto"
    ]
  },
  /* ─────────────────────────────────────────────────────── 10 */
  {
    id: "rcd_trip_after_minutes",
    keywords: ["differenziale", "salta", "dopo", "minuti", "dopo un po"],
    observations: [
      "Il differenziale non scatta subito, ma dopo alcuni minuti di funzionamento."
    ],
    hypotheses: [
      { text: "Dispersione che aumenta a caldo (resistenza/umidità interna)", certainty: "ALTA" },
      { text: "Condensa che si forma durante esercizio su apparecchio esterno", certainty: "MEDIA" },
      { text: "Somma dispersioni variabili su più carichi", certainty: "MEDIA" }
    ],
    checks: [
      "Identificare quale carico entra in funzione prima dello scatto (sequenza)",
      "Provare a scollegare carichi uno alla volta",
      "Verificare apparecchi che scaldano (resistenze, motori) e isolamento"
    ],
    risks: [
      "Scatto improvviso",
      "Rischio dispersione persistente"
    ]
  },
  /* ─────────────────────────────────────────────────────── 11 */
  {
    id: "mcb_trip_overload_pump",
    keywords: ["magnetotermico", "scatta", "pompa", "sovraccarico"],
    observations: [
      "Il magnetotermico scatta durante l'avvio o marcia della pompa."
    ],
    hypotheses: [
      { text: "Sovraccarico per pompa bloccata/impeller ostruito", certainty: "ALTA" },
      { text: "Condensatore avviamento (se monofase) degradato → assorbimento anomalo", certainty: "MEDIA" },
      { text: "Protezione inadeguata o curva non adatta alla corrente di spunto", certainty: "BASSA" }
    ],
    checks: [
      "Verificare rotazione libera/meccanica pompa e presenza blocchi",
      "Misurare corrente assorbita in avvio e marcia",
      "Controllare eventuale condensatore (se presente) e sostituire prova"
    ],
    risks: [
      "Surriscaldamento motore",
      "Danno avvolgimenti"
    ]
  },
  /* ─────────────────────────────────────────────────────── 12 */
  {
    id: "pump_manual_ok_auto_no",
    keywords: ["pompa", "manuale", "auto", "non parte", "selettore"],
    observations: [
      "La pompa parte in MANUALE ma non parte in AUTO."
    ],
    hypotheses: [
      { text: "Catena consensi in AUTO aperta (pressostato/galleggiante/termostato)", certainty: "ALTA" },
      { text: "Selettore Auto/Man o contatto ausiliario difettoso", certainty: "MEDIA" },
      { text: "Comando remoto/BMS non dà consenso", certainty: "MEDIA" }
    ],
    checks: [
      "Verificare continuità dei consensi in serie (uno per volta)",
      "Verificare selettore Auto/Man e morsetti/contatti",
      "Misurare tensione sul comando bobina in AUTO durante richiesta"
    ],
    risks: [
      "Blocco circolazione/servizio",
      "Surriscaldamento impianto se manca circolazione"
    ]
  },
  /* ─────────────────────────────────────────────────────── 13 */
  {
    id: "contactor_not_pulling_in",
    keywords: ["contattore", "non attacca", "non chiude", "bobina"],
    observations: [
      "Il contattore non attacca quando dovrebbe."
    ],
    hypotheses: [
      { text: "Manca tensione alla bobina (consenso/comando interrotto)", certainty: "ALTA" },
      { text: "Bobina contattore guasta o tensione bobina errata", certainty: "MEDIA" },
      { text: "Interblocco/ausiliario NC aperto nel circuito comando", certainty: "MEDIA" }
    ],
    checks: [
      "Misurare tensione ai capi bobina durante comando",
      "Verificare continuità circuito comando (stop, termica, pressostati, galleggiante)",
      "Verificare valore bobina (230V/24V) e stato morsetti"
    ],
    risks: [
      "Fermo impianto",
      "Avviamenti mancati ripetuti"
    ]
  },
  /* ─────────────────────────────────────────────────────── 14 */
  {
    id: "thermal_overload_tripped",
    keywords: ["termica", "intervenuta", "relè termico", "pompa", "motore"],
    observations: [
      "Il relè termico è intervenuto o scatta spesso."
    ],
    hypotheses: [
      { text: "Sovraccarico reale (pompa bloccata, valvola chiusa, circuito ostruito)", certainty: "ALTA" },
      { text: "Taratura termica errata rispetto alla corrente nominale", certainty: "MEDIA" },
      { text: "Manca una fase (trifase) → assorbimento squilibrato", certainty: "MEDIA" }
    ],
    checks: [
      "Verificare corrente su ogni fase e confrontare con targa motore",
      "Controllare meccanica pompa/valvole/ostruzioni",
      "Verificare taratura relè termico e serraggi morsetti"
    ],
    risks: [
      "Bruciatura motore",
      "Fermo impianto"
    ]
  },
  /* ─────────────────────────────────────────────────────── 15 */
  {
    id: "three_phase_missing_phase",
    keywords: ["trifase", "400v", "manca fase", "motore", "contattore"],
    observations: [
      "Motore trifase non parte o ronza, possibile mancanza fase."
    ],
    hypotheses: [
      { text: "Manca una fase a monte (fusibile, contatto, morsetto allentato)", certainty: "ALTA" },
      { text: "Contattore con polo bruciato/contatto consumato", certainty: "MEDIA" },
      { text: "Termica/interblocco interrompe una linea", certainty: "BASSA" }
    ],
    checks: [
      "Misurare tensioni L1-L2/L2-L3/L1-L3 a monte e a valle contattore",
      "Controllare fusibili/serraggi/morsetti e segni di surriscaldamento",
      "Verificare contatti contattore (usura/pitting)"
    ],
    risks: [
      "Surriscaldamento motore",
      "Danno avvolgimenti"
    ]
  },
  /* ─────────────────────────────────────────────────────── 16 */
  {
    id: "pressure_switch_not_closing",
    keywords: ["pressostato", "non chiude", "non da consenso", "pressione"],
    observations: [
      "Il pressostato non fornisce il consenso nonostante la pressione sembri adeguata."
    ],
    hypotheses: [
      { text: "Taratura pressostato errata (soglia di intervento troppo alta)", certainty: "ALTA" },
      { text: "Contatto interno pressostato ossidato o guasto", certainty: "MEDIA" },
      { text: "Pressione reale dell'impianto insufficiente rispetto alla taratura", certainty: "MEDIA" }
    ],
    checks: [
      "Verificare la taratura del pressostato e confrontare con pressione di esercizio",
      "Misurare continuità del contatto a pressione di esercizio con multimetro",
      "Controllare il manometro o misurare la pressione con strumento esterno",
      "Pulire il contatto o sostituire il pressostato in prova"
    ],
    risks: [
      "Fermo impianto per mancato consenso",
      "Cicli continui di avvio/arresto (corto ciclaggio)"
    ]
  },
  /* ─────────────────────────────────────────────────────── 17 */
  {
    id: "float_switch_stuck",
    keywords: ["galleggiante", "bloccato", "non sale", "livello", "serbatoio"],
    observations: [
      "Il galleggiante non commuta nonostante il livello del serbatoio sia cambiato."
    ],
    hypotheses: [
      { text: "Galleggiante meccanicamente bloccato (ostruzione, sedimentazione, incrostazioni)", certainty: "ALTA" },
      { text: "Cavo galleggiante con interruzione o cortocircuito", certainty: "MEDIA" },
      { text: "Contatto interno galleggiante guasto (ossidazione, usura)", certainty: "MEDIA" }
    ],
    checks: [
      "Verificare libertà di movimento meccanica del galleggiante",
      "Misurare continuità del cavo galleggiante (fuori tensione)",
      "Simulare il cambio di posizione manualmente e misurare la commutazione del contatto",
      "Pulire e riposizionare il galleggiante, verificare aste/guide"
    ],
    risks: [
      "Traboccamento serbatoio o svuotamento senza protezione",
      "Avvio pompa a secco con danni al motore"
    ]
  },
  /* ─────────────────────────────────────────────────────── 18 */
  {
    id: "flow_switch_no_consensus",
    keywords: ["flussostato", "flow switch", "consenso", "portata", "flusso"],
    observations: [
      "Il flussostato non fornisce il consenso nonostante il flusso sia presente."
    ],
    hypotheses: [
      { text: "Palette del flussostato bloccata da incrostazioni o corpi estranei", certainty: "ALTA" },
      { text: "Taratura soglia flusso errata (troppo alta rispetto alla portata reale)", certainty: "MEDIA" },
      { text: "Contatto elettrico del flussostato guasto o cablaggio interrotto", certainty: "MEDIA" }
    ],
    checks: [
      "Verificare visivamente la palette del flussostato (rimuovere e ispezionare)",
      "Misurare continuità del contatto durante il flusso",
      "Confrontare la portata reale con la soglia di taratura del dispositivo",
      "Pulire o sostituire il flussostato in prova"
    ],
    risks: [
      "Blocco bruciatore/utenza per assenza consenso",
      "Funzionamento senza flusso con surriscaldamento"
    ]
  },
  /* ─────────────────────────────────────────────────────── 19 */
  {
    id: "timer_not_switching",
    keywords: ["timer", "orologio", "programmatore", "non commuta", "non scatta"],
    observations: [
      "Il timer/programmatore non commuta all'orario previsto."
    ],
    hypotheses: [
      { text: "Fascia oraria non programmata correttamente o ora del timer errata", certainty: "ALTA" },
      { text: "Pila/batteria di backup scarica — ora persa dopo interruzione alimentazione", certainty: "MEDIA" },
      { text: "Contatto di uscita del timer guasto (non commuta nonostante il segnale)", certainty: "MEDIA" }
    ],
    checks: [
      "Verificare ora corrente e programmazione fasce orarie sul timer",
      "Sostituire la pila di backup se presente",
      "Forzare commutazione manuale e misurare continuità uscita",
      "Verificare tensione di alimentazione del timer"
    ],
    risks: [
      "Mancato avvio automatico (carichi non alimentati nei tempi previsti)",
      "Funzionamento continuo non previsto"
    ]
  },
  /* ─────────────────────────────────────────────────────── 20 */
  {
    id: "intermediate_relay_faulty",
    keywords: ["relè", "relè intermedio", "ausiliario", "non commuta", "rele"],
    observations: [
      "Il relè intermedio/ausiliario non commuta nonostante la bobina sia alimentata."
    ],
    hypotheses: [
      { text: "Bobina relè interrotta o guasta (non genera campo magnetico)", certainty: "ALTA" },
      { text: "Contatto relè saldato/incollato (stuck open o stuck closed)", certainty: "MEDIA" },
      { text: "Tensione bobina assente o fuori range (verificare alimentazione)", certainty: "MEDIA" }
    ],
    checks: [
      "Misurare tensione ai capi bobina durante il comando",
      "Misurare resistenza bobina con ohmetro (valore atteso 1-5kΩ)",
      "Verificare commutazione contatti con multimetro (continuità NC/NO)",
      "Sostituire relè in prova e verificare comportamento"
    ],
    risks: [
      "Blocco catena di comando",
      "Cortocircuito se contatto saldato in chiusura"
    ]
  },
  /* ─────────────────────────────────────────────────────── 21 */
  {
    id: "short_circuit_light_line",
    keywords: ["corto", "cortocircuito", "linea luci", "lampade", "magnetotermico scatta subito"],
    observations: [
      "Il magnetotermico scatta immediatamente all'inserimento della linea luci."
    ],
    hypotheses: [
      { text: "Cortocircuito fase-neutro nel cavo o in una presa/apparecchio sul circuito", certainty: "ALTA" },
      { text: "Lampada o portalampada in cortocircuito", certainty: "MEDIA" },
      { text: "Giunzione mal eseguita con contatto fase-neutro", certainty: "MEDIA" }
    ],
    checks: [
      "Scollegare tutti i carichi e verificare continuità fase-neutro del cavo (deve essere aperta)",
      "Collegare i carichi uno alla volta e verificare quale causa lo scatto",
      "Ispezionare giunzioni, scatole di derivazione e portalampade",
      "Misurare la resistenza di isolamento della linea"
    ],
    risks: [
      "Rischio incendio se il corto non viene eliminato",
      "Non resettare senza prima trovare la causa"
    ]
  },
  /* ─────────────────────────────────────────────────────── 22 */
  {
    id: "unstable_neutral",
    keywords: ["neutro", "instabile", "tensione variabile", "luci tremolano", "lampade sfarfallano"],
    observations: [
      "Le luci sfarfallano o la tensione è variabile/instabile."
    ],
    hypotheses: [
      { text: "Neutro allentato o interrotto nel quadro/morsettiera (neutro volante)", certainty: "ALTA" },
      { text: "Connessione neutro degradata sulla linea principale (vecchio impianto)", certainty: "MEDIA" },
      { text: "Carico squilibrato trifase con neutro insufficiente", certainty: "BASSA" }
    ],
    checks: [
      "Verificare serraggio morsetti neutro nel quadro e sulle prese",
      "Misurare tensione fase-neutro su diverse prese durante il guasto",
      "Misurare tensione neutro-terra: deve essere <2V",
      "Verificare il neutro in arrivo dal contatore/montante"
    ],
    risks: [
      "Tensioni anomale possono danneggiare apparecchiature sensibili",
      "Rischio surriscaldamento morsetto neutro con arco elettrico"
    ]
  },
  /* ─────────────────────────────────────────────────────── 23 */
  {
    id: "rcd_trip_no_load",
    keywords: ["differenziale", "scatta", "senza carico", "vuoto", "N-PE"],
    observations: [
      "Il differenziale scatta anche senza carichi collegati o a circuito vuoto."
    ],
    hypotheses: [
      { text: "Connessione N-PE a valle del differenziale (errore cablaggio)", certainty: "ALTA" },
      { text: "Differenziale difettoso (soglia abbassata per usura)", certainty: "MEDIA" },
      { text: "Dispersione sul neutro del circuito (neutro-terra in qualche punto)", certainty: "MEDIA" }
    ],
    checks: [
      "Verificare che N e PE siano separati a valle del differenziale (non connessi insieme)",
      "Scollegare completamente le uscite e testare differenziale con tasto TEST",
      "Misurare con multimetro continuità tra N e PE a valle (deve essere aperta)",
      "Sostituire differenziale in prova se tutti i carichi disconnessi e scatta ancora"
    ],
    risks: [
      "Errore N-PE causa scatti continui e annulla la protezione differenziale",
      "Rischio senza protezione se si bypassa il differenziale"
    ]
  },
  /* ─────────────────────────────────────────────────────── 24 */
  {
    id: "coil_voltage_drop",
    keywords: ["bobina", "caduta tensione", "non attacca", "instabile", "comando"],
    observations: [
      "Il contattore/relè attacca in modo instabile o non attacca per caduta tensione sul circuito comando."
    ],
    hypotheses: [
      { text: "Caduta di tensione eccessiva sul circuito comando (cavo sottodimensionato o lungo)", certainty: "ALTA" },
      { text: "Contatto di un componente in serie con resistenza di contatto elevata", certainty: "MEDIA" },
      { text: "Trasformatore di comando sottodimensionato (se presente)", certainty: "MEDIA" }
    ],
    checks: [
      "Misurare tensione direttamente ai capi bobina durante il comando",
      "Confrontare con la tensione nominale bobina (230V/24V): deve essere >85%",
      "Misurare resistenza di contatto dei componenti in serie (pulsanti, contatti ausiliari)",
      "Verificare sezione cavi circuito comando e lunghezza"
    ],
    risks: [
      "Avviamenti instabili con usura accelerata del contattore",
      "Mancato avvio in condizioni critiche"
    ]
  },
  /* ─────────────────────────────────────────────────────── 25 */
  {
    id: "mechanical_electrical_interlock",
    keywords: ["interblocco", "blocco", "non si avvia", "inverso", "marcia avanti"],
    observations: [
      "L'avviamento è bloccato da un interblocco meccanico o elettrico (es. inversione marcia)."
    ],
    hypotheses: [
      { text: "Contatto NC ausiliario dell'interblocco aperto (circuito comando interrotto)", certainty: "ALTA" },
      { text: "Interblocco meccanico non completamente rilasciato dalla funzione opposta", certainty: "MEDIA" },
      { text: "Cablaggio errato dei contatti di interblocco", certainty: "BASSA" }
    ],
    checks: [
      "Verificare che il contattore opposto sia aperto prima di dare il comando",
      "Misurare continuità del contatto NC ausiliario di interblocco",
      "Verificare schema elettrico e corrispondenza morsetti",
      "Testare il circuito comando senza interblocco (bypass temporaneo controllato)"
    ],
    risks: [
      "Cortocircuito trifase se entrambi i contattori chiudono contemporaneamente",
      "Danno irreversibile a motore e quadro"
    ]
  },
  /* ─────────────────────────────────────────────────────── 26 */
  {
    id: "pump_cavitation",
    keywords: ["pompa", "cavita", "rumore", "aria", "aspirazione", "vibra"],
    observations: [
      "La pompa funziona ma fa rumore anomalo (crepitio/vibrazione) — probabile cavitazione o aria."
    ],
    hypotheses: [
      { text: "Aria in aspirazione: valvola/giunto non stagno o livello troppo basso", certainty: "ALTA" },
      { text: "Prevalenza troppo alta rispetto alle caratteristiche della pompa", certainty: "MEDIA" },
      { text: "Filtro/valvola di aspirazione parzialmente ostruito", certainty: "MEDIA" }
    ],
    checks: [
      "Verificare il livello del serbatoio e la tenuta della tubazione di aspirazione",
      "Sfiatare l'aria dalla pompa e dalla tubazione (valvola di sfiato)",
      "Controllare il filtro di aspirazione e pulirlo",
      "Misurare pressione differenziale aspirazione/mandata"
    ],
    risks: [
      "Usura accelerata di girante e tenute meccaniche",
      "Danneggiamento corpo pompa per colpi di pressione"
    ]
  },
  /* ─────────────────────────────────────────────────────── 27 */
  {
    id: "burner_lockout_consensus",
    keywords: ["bruciatore", "blocco", "consenso", "pressostato gas", "termostato sicurezza"],
    observations: [
      "Il bruciatore va in blocco o non si avvia per mancanza di un consenso."
    ],
    hypotheses: [
      { text: "Termostato di sicurezza intervenuto (surriscaldamento o guasto sonda)", certainty: "ALTA" },
      { text: "Pressostato gas non chiude (pressione gas insufficiente o guasto)", certainty: "MEDIA" },
      { text: "Flussostato/pressostato acqua aperto (flusso insufficiente nel circuito)", certainty: "MEDIA" }
    ],
    checks: [
      "Leggere il codice di blocco sul pannello del bruciatore/centralina",
      "Verificare lo stato del termostato di sicurezza (reset manuale se necessario)",
      "Controllare pressione gas e stato pressostato gas (continuità contatto)",
      "Verificare flussostato acqua e pressione circuito idraulico"
    ],
    risks: [
      "Non resettare il bruciatore senza trovare la causa del blocco",
      "Rischio perdita gas se il problema è alla valvola o tubazione"
    ]
  },
  /* ─────────────────────────────────────────────────────── 28 */
  {
    id: "missing_24v_control_supply",
    keywords: ["24v", "manca alimentazione", "comando", "circuito comando", "trasformatore comando"],
    observations: [
      "Il circuito di comando a 24V non è alimentato — nessun componente risponde."
    ],
    hypotheses: [
      { text: "Fusibile del trasformatore di comando bruciato", certainty: "ALTA" },
      { text: "Trasformatore di comando guasto (bobina interrotta o surriscaldata)", certainty: "MEDIA" },
      { text: "Interruzione nel cablaggio di alimentazione del trasformatore", certainty: "MEDIA" }
    ],
    checks: [
      "Misurare tensione uscita trasformatore (morsetti secondario): atteso 24VAC",
      "Controllare e sostituire il fusibile del trasformatore",
      "Misurare tensione ingresso trasformatore (primario): deve essere 230VAC",
      "Verificare temperatura trasformatore (surriscaldamento indica sovraccarico)"
    ],
    risks: [
      "Fermo completo del quadro di comando",
      "Trasformatore surriscaldato può causare incendio"
    ]
  },
  /* ─────────────────────────────────────────────────────── 29 */
  {
    id: "missing_230v_control_panel",
    keywords: ["230v", "manca tensione", "pannello", "quadro comando", "non alimentato"],
    observations: [
      "Il pannello/quadro di comando non è alimentato a 230V."
    ],
    hypotheses: [
      { text: "Interruttore generale del quadro aperto o scattato", certainty: "ALTA" },
      { text: "Fusibile generale bruciato o morsetto allentato sulla linea di alimentazione", certainty: "MEDIA" },
      { text: "Interruzione sulla linea di alimentazione a monte del quadro", certainty: "MEDIA" }
    ],
    checks: [
      "Verificare posizione interruttore generale e stato (scattato/aperto)",
      "Misurare tensione a monte dell'interruttore generale",
      "Controllare fusibili generali e serraggio morsetti di alimentazione",
      "Misurare tensione su entrambi i morsetti dell'interruttore (tensione IN / tensione OUT)"
    ],
    risks: [
      "Fermo completo dell'impianto",
      "Non resettare senza verificare la causa dello scatto"
    ]
  },
  /* ─────────────────────────────────────────────────────── 30 */
  {
    id: "control_fuse_blown",
    keywords: ["fusibile controllo", "fusibile comando", "bruciato", "circuito ausiliario"],
    observations: [
      "Il fusibile del circuito di controllo/ausiliari è bruciato."
    ],
    hypotheses: [
      { text: "Cortocircuito nel circuito di controllo (guasto bobina o cablaggio)", certainty: "ALTA" },
      { text: "Fusibile sottodimensionato rispetto ai carichi del circuito ausiliario", certainty: "MEDIA" },
      { text: "Picco di corrente per avvio simultaneo di più bobine", certainty: "BASSA" }
    ],
    checks: [
      "Sostituire il fusibile e verificare se scatta subito (cortocircuito persistente)",
      "Misurare resistenza verso terra di ogni bobina/circuito ausiliario",
      "Verificare il valore del fusibile rispetto alla corrente totale delle bobine",
      "Scollegare i carichi uno alla volta per individuare il guasto"
    ],
    risks: [
      "Non inserire un fusibile di taglia maggiore senza trovare la causa",
      "Rischio incendio per cortocircuito sul circuito di comando"
    ]
  },
  /* ─────────────────────────────────────────────────────── 31 */
  {
    id: "mcb_trip_socket_circuit",
    keywords: ["magnetotermico", "scatta", "prese", "linea prese", "ciabatta"],
    observations: [
      "Il magnetotermico della linea prese scatta ripetutamente."
    ],
    hypotheses: [
      { text: "Sovraccarico: somma carichi collegati supera la portata della linea", certainty: "ALTA" },
      { text: "Cortocircuito su un'apparecchiatura collegata o cavo ciabatta difettoso", certainty: "MEDIA" },
      { text: "Magnetotermico degradato con soglia di scatto abbassata", certainty: "BASSA" }
    ],
    checks: [
      "Scollegare tutti i carichi e verificare se il magnetotermico regge",
      "Misurare la corrente totale con pinza amperometrica",
      "Collegare i carichi uno alla volta fino a trovare il colpevole",
      "Verificare continuità fase-neutro linea (deve essere aperta senza carichi)"
    ],
    risks: [
      "Rischio incendio per sovraccarico prolungato",
      "Non bypassare la protezione"
    ]
  },
  /* ─────────────────────────────────────────────────────── 32 */
  {
    id: "mcb_trip_kitchen",
    keywords: ["magnetotermico", "scatta", "cucina", "forno", "lavastoviglie", "piano cottura"],
    observations: [
      "Il magnetotermico della linea cucina scatta quando vengono usati grandi elettrodomestici."
    ],
    hypotheses: [
      { text: "Uso simultaneo di forno, piano cottura e lavastoviglie supera la portata della linea", certainty: "ALTA" },
      { text: "Un elettrodomestico ha un guasto interno (cortocircuito/dispersione)", certainty: "MEDIA" },
      { text: "Linea cucina non dedicata o sezione cavo inadeguata per i carichi presenti", certainty: "MEDIA" }
    ],
    checks: [
      "Usare gli elettrodomestici uno alla volta e verificare quale causa lo scatto",
      "Misurare corrente assorbita da ciascun apparecchio",
      "Verificare targa del magnetotermico (min. 16A per linea cucina) e sezione cavo (2.5mm²)",
      "Controllare se esiste una linea dedicata per ogni grande utenza"
    ],
    risks: [
      "Surriscaldamento cavi per sovraccarico prolungato",
      "Rischio incendio in cavità murarie"
    ]
  },
  /* ─────────────────────────────────────────────────────── 33 */
  {
    id: "inverter_alarm",
    keywords: ["inverter", "allarme", "fault", "errore", "variatore"],
    observations: [
      "L'inverter/variatore è in stato di allarme e non eroga potenza al motore."
    ],
    hypotheses: [
      { text: "Sovraccarico/sovratemperatura dell'inverter (carico troppo elevato o raffreddamento insufficiente)", certainty: "ALTA" },
      { text: "Guasto al motore (cortocircuito avvolgimento) rilevato dall'inverter", certainty: "MEDIA" },
      { text: "Errore parametri (rampa troppo corta, corrente limite errata)", certainty: "MEDIA" }
    ],
    checks: [
      "Leggere il codice di errore dal display dell'inverter e consultare il manuale",
      "Verificare la temperatura dell'inverter e la pulizia delle ventole/filtri",
      "Misurare resistenza avvolgimenti motore (bilanciamento 3 fasi)",
      "Verificare i parametri di configurazione (corrente nominale, rampa, frequenza)"
    ],
    risks: [
      "Danneggiamento motore se l'inverter non viene resettato dopo il guasto",
      "Non resettare senza leggere prima il codice errore"
    ]
  },
  /* ─────────────────────────────────────────────────────── 34 */
  {
    id: "plc_no_output",
    keywords: ["plc", "non da uscita", "uscita", "non attiva", "programmabile"],
    observations: [
      "Il PLC è alimentato e in RUN ma non attiva l'uscita prevista."
    ],
    hypotheses: [
      { text: "Ingresso/condizione logica non soddisfatta nel programma (consenso mancante)", certainty: "ALTA" },
      { text: "Scheda uscita PLC guasta o fusibile uscite bruciato", certainty: "MEDIA" },
      { text: "Alimentazione modulo uscite assente (24VDC mancante)", certainty: "MEDIA" }
    ],
    checks: [
      "Verificare lo stato degli ingressi sul pannello PLC (LED ingressi accesi/spenti)",
      "Monitorare le variabili del programma con software di programmazione",
      "Misurare tensione ai morsetti di uscita del PLC con uscita attivata",
      "Verificare fusibili interni del modulo uscite e alimentazione 24V"
    ],
    risks: [
      "Fermo impianto per logica non soddisfatta",
      "Non modificare il programma senza documentazione del costruttore"
    ]
  },
  /* ─────────────────────────────────────────────────────── 35 */
  {
    id: "temperature_sensor_out_of_range",
    keywords: ["pt100", "ntc", "sonda temperatura", "fuori scala", "lettura errata"],
    observations: [
      "La lettura della sonda di temperatura è fuori scala o assurda (es. -999 o 9999)."
    ],
    hypotheses: [
      { text: "Sonda interrotta (circuito aperto — lettura massima o errore OL)", certainty: "ALTA" },
      { text: "Cortocircuito sulla sonda o sul cavo (lettura minima o zero)", certainty: "MEDIA" },
      { text: "Connettore/morsetti ossidati con resistenza di contatto elevata (lettura instabile)", certainty: "MEDIA" }
    ],
    checks: [
      "Misurare resistenza sonda con ohmetro (PT100: ~109Ω a 25°C; NTC: dipende dal tipo)",
      "Verificare continuità e isolamento del cavo sonda",
      "Pulire/serrare connettori e morsetti",
      "Sostituire la sonda in prova con una di pari tipo"
    ],
    risks: [
      "Blocco impianto per allarme temperatura errato",
      "Mancata protezione per surriscaldamento se la sonda non è funzionante"
    ]
  },
  /* ─────────────────────────────────────────────────────── 36 */
  {
    id: "contactor_welded_stuck",
    keywords: ["contattore", "saldato", "resta chiuso", "non apre", "bloccato"],
    observations: [
      "Il contattore resta chiuso anche dopo che il comando è stato tolto."
    ],
    hypotheses: [
      { text: "Contatti principali saldati per arco prolungato o cortocircuito", certainty: "ALTA" },
      { text: "Bobina in cortocircuito che mantiene il campo magnetico", certainty: "MEDIA" },
      { text: "Meccanismo di sgancio bloccato (corrosione/deformazione)", certainty: "BASSA" }
    ],
    checks: [
      "Togliere tensione bobina e verificare se il contattore si apre",
      "Misurare resistenza bobina (valore anomalmente basso indica cortocircuito)",
      "Ispezionare visivamente i contatti principali per tracce di saldatura",
      "Sostituire il contattore — i contatti saldati non sono riparabili"
    ],
    risks: [
      "Motore/pompa non si ferma: rischio meccanico e termico",
      "Non tentare di aprire il contattore manualmente sotto tensione"
    ]
  },
  /* ─────────────────────────────────────────────────────── 37 */
  {
    id: "fuse_holder_overheating",
    keywords: ["portafusibile", "caldo", "surriscaldato", "ossidato", "fusibile allentato"],
    observations: [
      "Il portafusibile è caldo, ossidato o il fusibile è allentato con surriscaldamento."
    ],
    hypotheses: [
      { text: "Contatto allentato tra fusibile e portafusibile → resistenza di contatto elevata", certainty: "ALTA" },
      { text: "Portafusibile ossidato/degradato che non garantisce buon contatto", certainty: "MEDIA" },
      { text: "Corrente di esercizio vicina al limite del fusibile (surriscaldamento per carico)", certainty: "MEDIA" }
    ],
    checks: [
      "Togliere tensione e rimuovere il fusibile — verificare segni di arco/ossidazione",
      "Pulire i contatti del portafusibile con contattore adeguato",
      "Misurare la caduta di tensione ai capi del portafusibile (max 100mV a corrente nominale)",
      "Sostituire portafusibile se ossidato o deformato"
    ],
    risks: [
      "Rischio incendio per surriscaldamento prolungato",
      "Il calore può fondere il fusibile senza guasto reale (falso intervento)"
    ]
  },
  /* ─────────────────────────────────────────────────────── 38 */
  {
    id: "spd_red_led",
    keywords: ["scaricatore", "spd", "rosso", "guasto", "sovratensione"],
    observations: [
      "Lo scaricatore di sovratensione (SPD) mostra il LED di guasto rosso."
    ],
    hypotheses: [
      { text: "MOV interno esaurito dopo evento di sovratensione (fulmine, manovra)", certainty: "ALTA" },
      { text: "Sovratensioni ripetute hanno degradato progressivamente il MOV", certainty: "MEDIA" },
      { text: "SPD difettoso di fabbrica o installato su linea con sovratensioni continue", certainty: "BASSA" }
    ],
    checks: [
      "Verificare visivamente il LED di stato (rosso = guasto, verde = ok)",
      "Sostituire l'SPD guasto — un MOV esaurito non offre più protezione",
      "Verificare la messa a terra dell'SPD (impedenza bassa richiesta)",
      "Registrare l'evento e verificare se ci sono stati fulmini/manovre sulla rete"
    ],
    risks: [
      "Senza SPD funzionante, le apparecchiature sono esposte alle sovratensioni",
      "Non lasciare l'SPD guasto in opera — sostituire prima possibile"
    ]
  },
  /* ─────────────────────────────────────────────────────── 39 */
  {
    id: "terminal_block_overheating",
    keywords: ["morsettiera", "caldo", "surriscaldamento", "ossido", "morsetto allentato"],
    observations: [
      "Un morsetto della morsettiera è surriscaldato, annerito o ossidato."
    ],
    hypotheses: [
      { text: "Morsetto allentato con alta resistenza di contatto → surriscaldamento per effetto Joule", certainty: "ALTA" },
      { text: "Sezione cavo inadeguata per la corrente di esercizio", certainty: "MEDIA" },
      { text: "Ossidazione dei conduttori (alluminio o rame degradato)", certainty: "MEDIA" }
    ],
    checks: [
      "Togliere tensione e serrare tutti i morsetti della morsettiera",
      "Misurare la caduta di tensione ai capi di ogni morsetto (max 10-20mV a corrente nominale)",
      "Ispezionare i conduttori: verificare sezione e stato dell'isolamento",
      "Sostituire i morsetti anneriti o deformati"
    ],
    risks: [
      "Rischio incendio in quadro per surriscaldamento prolungato",
      "Interruzione improvvisa del circuito per rottura termica del morsetto"
    ]
  },
  /* ─────────────────────────────────────────────────────── 40 */
  {
    id: "condensate_pump_alarm",
    keywords: ["pompa condensa", "allarme", "troppo pieno", "condensa", "climatizzatore"],
    observations: [
      "La pompa di scarico condensa dà allarme o il climatizzatore si blocca per troppo pieno condensa."
    ],
    hypotheses: [
      { text: "Vaschetta condensa piena: scarico ostruito o pompa non funziona", certainty: "ALTA" },
      { text: "Galleggiante di allarme della vaschetta bloccato in posizione alta", certainty: "MEDIA" },
      { text: "Pompa condensa guasta (motore o impeller bloccato)", certainty: "MEDIA" }
    ],
    checks: [
      "Verificare il livello della vaschetta condensa e svuotare se necessario",
      "Controllare il tubo di scarico condensa (ostruzioni, kink, perdite)",
      "Verificare funzionamento pompa condensa (alimentazione, rumore, portata)",
      "Pulire il galleggiante/sensore di livello dalla vaschetta"
    ],
    risks: [
      "Perdita di condensa con danni a soffitti/pareti",
      "Blocco climatizzatore in estate con discomfort e danni"
    ]
  }
];

module.exports = { patterns: patterns };
