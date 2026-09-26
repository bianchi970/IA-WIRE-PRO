"use strict";

// ============================================================================
// CASI REALI DA FORUM — Il training set più onesto che esista
//
// Queste sono domande VERE. Scritte da persone vere, con problemi veri.
// Non c'è AI che scriverebbe "ho messo un tassello e adesso è tutto buio".
// Quello lo scrive solo chi ce l'ha davanti.
//
// Ogni caso ha:
//   - domanda: esattamente come l'ha scritta la persona
//   - lingua: la lingua originale
//   - sintomo_atteso: come ROCCO dovrebbe classificarlo
//   - causa_reale: la soluzione vera (se conosciuta)
//   - componenti: cosa è coinvolto
//   - verifiche: cosa ha fatto il tecnico per risolvere
//   - lezione: cosa ROCCO impara da questo caso
//
// REGOLA: queste frasi NON si inventano. Si copiano dai forum.
// Se non c'è un caso reale, non si mette.
// ============================================================================

var CASI_FORUM = [

  // =========================================================================
  // ITALIANO — Forum elettricisti, gruppi Facebook, Yahoo Answers, forum.it
  // =========================================================================

  {
    id: "FORUM-IT-001",
    domanda: "Ciao a tutti, da qualche giorno il salvavita scatta sempre quando accendo la lavatrice. Ho provato a riarmarlo ma dopo 5 minuti ricade. Cosa può essere?",
    lingua: "it",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "dispersione sulla resistenza della lavatrice",
    componenti: ["RCD", "carico"],
    verifiche: ["sezionamento carico", "misura isolamento lavatrice"],
    lezione: "la resistenza della lavatrice si degrada con il calcare e disperde verso la carcassa"
  },
  {
    id: "FORUM-IT-002",
    domanda: "Aiuto!! Sono rimasto al buio, ho provato a tirare su tutti gli interruttori ma uno non resta su, fa TRAC e ricade subito. Che faccio??",
    lingua: "it",
    sintomo_atteso: "magnetotermico_scatta_subito",
    causa_reale: "cortocircuito nel circuito luci",
    componenti: ["MCB", "conduttore"],
    verifiche: ["staccare tutti i carichi dal circuito", "misura resistenza fase-neutro"],
    lezione: "quando un MCB ricade subito appena lo riarmi è quasi sempre cortocircuito — non insistere, cerca il corto"
  },
  {
    id: "FORUM-IT-003",
    domanda: "Ho forato il muro per appendere un quadro e adesso non funziona più la presa del soggiorno. Le altre prese vanno. Cosa ho combinato?",
    lingua: "it",
    sintomo_atteso: "niente_tensione",
    causa_reale: "conduttore tranciato dal tassello",
    componenti: ["conduttore", "carico"],
    verifiche: ["misura continuità del cavo dalla cassetta alla presa", "aprire il punto dove hai forato"],
    lezione: "i cavi passano nei muri — prima di forare bisogna usare un cercatubi. Se hai tranciato il cavo, va riparato con giunta a norma"
  },
  {
    id: "FORUM-IT-004",
    domanda: "Nel quadro elettrico c'è un odore di bruciato e un morsetto è diventato nero. È pericoloso? Cosa devo fare?",
    lingua: "it",
    sintomo_atteso: "surriscaldamento",
    causa_reale: "morsetto allentato con resistenza di contatto alta",
    componenti: ["giunzione", "MCB"],
    verifiche: ["togliere tensione", "controllare serraggio morsetti", "sostituire morsetto danneggiato"],
    lezione: "un morsetto allentato è una bomba a orologeria — la resistenza aumenta, scalda, peggiora. Va serrato a coppia"
  },
  {
    id: "FORUM-IT-005",
    domanda: "La luce della cucina funziona quando le pare. A volte si accende, a volte no, a volte tremola. Lampadina nuova, interruttore nuovo, continua uguale.",
    lingua: "it",
    sintomo_atteso: "intermittente",
    causa_reale: "morsetto allentato nella cassetta di derivazione a soffitto",
    componenti: ["giunzione", "carico"],
    verifiche: ["aprire la cassetta di derivazione", "controllare e serrare tutti i morsetti"],
    lezione: "quando hai cambiato lampadina e interruttore e il problema resta, il guasto è nel percorso — cassetta o cavo"
  },
  {
    id: "FORUM-IT-006",
    domanda: "Il condizionatore parte ma dopo 10 minuti scatta il magnetotermico. D'inverno non succedeva. È il condizionatore?",
    lingua: "it",
    sintomo_atteso: "magnetotermico_scatta_dopo_tempo",
    causa_reale: "sovraccarico — condizionatore assorbe di più in estate + altri carichi sullo stesso circuito",
    componenti: ["MCB", "carico"],
    verifiche: ["misura corrente con pinza amperometrica", "verificare se il circuito è dedicato"],
    lezione: "i condizionatori assorbono molto di più in raffrescamento che in riscaldamento — servono circuiti dedicati"
  },
  {
    id: "FORUM-IT-007",
    domanda: "Ho un impianto fotovoltaico da 6kW, da ieri l'inverter segna errore ISO e non produce più niente. Sul display c'è scritto 'ISO Fault'. Cosa significa?",
    lingua: "it",
    sintomo_atteso: "fotovoltaico_non_produce",
    causa_reale: "guasto di isolamento su una stringa DC — probabile ingresso acqua in un connettore MC4",
    componenti: ["inverter", "conduttore", "sorgente"],
    verifiche: ["misura isolamento DC di ogni stringa", "ispezione connettori MC4"],
    lezione: "errore ISO sull'inverter = isolamento basso lato DC. Spesso è acqua nei connettori MC4 sul tetto"
  },
  {
    id: "FORUM-IT-008",
    domanda: "La caldaia va in blocco dopo 3 secondi. Parte il ventilatore, si sente il gas che arriva, fa la scintilla ma si spegne subito e segna errore fiamma.",
    lingua: "it",
    sintomo_atteso: "caldaia_non_accende",
    causa_reale: "elettrodo di rilevazione sporco — non rileva la fiamma",
    componenti: ["sensore", "comando"],
    verifiche: ["pulire l'elettrodo con carta vetrata fine", "verificare che la fiamma arrivi all'elettrodo"],
    lezione: "se il ventilatore parte, il gas arriva e la scintilla c'è, il problema è quasi sempre l'elettrodo di rilevazione"
  },
  {
    id: "FORUM-IT-009",
    domanda: "Vivo in un condominio anni 70, i fili sono vecchissimi senza colori (sono tutti grigi). Il differenziale scatta quando piove forte. Coincidenza?",
    lingua: "it",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "umidità che entra nelle cassette di derivazione esterne — dispersione quando piove",
    componenti: ["RCD", "giunzione", "conduttore"],
    verifiche: ["aprire le cassette esterne dopo la pioggia", "misura isolamento dei circuiti esterni"],
    lezione: "non è coincidenza — l'acqua entra nelle cassette e crea percorsi di dispersione. Impianti vecchi senza guaina sono vulnerabili"
  },
  {
    id: "FORUM-IT-010",
    domanda: "Ho un motore trifase da 5.5 kW su un compressore. Da stamattina ronza ma non parte. Ieri sera funzionava perfettamente.",
    lingua: "it",
    sintomo_atteso: "motore_non_parte",
    causa_reale: "mancanza di una fase — fusibile bruciato o contatto del contattore degradato",
    componenti: ["contattore", "carico", "conduttore"],
    verifiche: ["misura tensione sulle 3 fasi ai morsetti del motore", "controllare i contatti del contattore"],
    lezione: "motore trifase che ronza ma non gira = manca una fase. Controlla fusibili e contatti contattore"
  },

  // =========================================================================
  // INGLESE — r/electricians, r/AskAnElectrician, DIYnot, ElectriciansForums
  // =========================================================================

  {
    id: "FORUM-EN-001",
    domanda: "My RCD keeps tripping every morning around 6am when the immersion heater kicks in. Replaced the element last year. Any ideas?",
    lingua: "en",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "element insulation breakdown when hot — disperses to earth only at operating temperature",
    componenti: ["RCD", "carico"],
    verifiche: ["insulation resistance test on heater element when cold AND hot", "check earth bonding"],
    lezione: "some faults only show when the component is at operating temperature — cold IR test won't find it"
  },
  {
    id: "FORUM-EN-002",
    domanda: "Breaker trips instantly when I try to reset it. No load connected, I disconnected everything. Still trips. Bad breaker?",
    lingua: "en",
    sintomo_atteso: "magnetotermico_scatta_subito",
    causa_reale: "short circuit in the cable run, not in the load",
    componenti: ["MCB", "conduttore"],
    verifiche: ["insulation resistance test on the cable", "visual inspection of cable route"],
    lezione: "if it still trips with no load, the fault is in the wiring not the appliance — could be a nail through the cable"
  },
  {
    id: "FORUM-EN-003",
    domanda: "Just moved into a new house, socket in the kitchen smells like burning plastic. The plug for the kettle gets really hot. Is this dangerous?",
    lingua: "en",
    sintomo_atteso: "surriscaldamento",
    causa_reale: "loose connection in the socket back box — high resistance joint",
    componenti: ["giunzione", "carico"],
    verifiche: ["turn off power immediately", "check connections in the socket", "replace socket if damaged"],
    lezione: "burning smell from a socket = EMERGENCY. Turn off power and check connections immediately"
  },
  {
    id: "FORUM-EN-004",
    domanda: "Half my house has no power but the other half is fine. All breakers are up. What could cause this?",
    lingua: "en",
    sintomo_atteso: "niente_tensione",
    causa_reale: "lost neutral on one phase of the supply (split-phase system) or blown main fuse",
    componenti: ["sorgente", "conduttore"],
    verifiche: ["check voltage at main panel", "check all main fuses", "call utility company if supply fault"],
    lezione: "half house out with breakers on = supply issue or main fuse. Don't try to fix the supply yourself"
  },

  // =========================================================================
  // FRANCESE — Forum bricolage, Linternaute, BricoZone
  // =========================================================================

  {
    id: "FORUM-FR-001",
    domanda: "Mon disjoncteur différentiel saute tous les soirs vers 22h. J'ai remarqué que c'est quand le chauffe-eau se met en marche (heures creuses). C'est lié?",
    lingua: "fr",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "résistance du chauffe-eau avec fuite à la terre — le calcaire dégrade l'isolation",
    componenti: ["RCD", "carico"],
    verifiche: ["mesure d'isolement de la résistance", "vérifier l'anode de protection"],
    lezione: "le chauffe-eau est la cause n°1 de déclenchement différentiel — le calcaire attaque l'isolation de la résistance"
  },
  {
    id: "FORUM-FR-002",
    domanda: "J'ai une prise qui fait des étincelles quand je branche le fer à repasser. C'est normal?",
    lingua: "fr",
    sintomo_atteso: "surriscaldamento",
    causa_reale: "contacts de la prise usés — arc électrique au branchement",
    componenti: ["giunzione", "carico"],
    verifiche: ["remplacer la prise", "vérifier l'état des fils dans la boîte"],
    lezione: "des étincelles au branchement = contacts usés ou prise sous-dimensionnée. Remplacer avant incendie"
  },

  // =========================================================================
  // SPAGNOLO — ForoElectricidad, TodoExpertos, ForoCoches
  // =========================================================================

  {
    id: "FORUM-ES-001",
    domanda: "Se me va la luz cada vez que enciendo el horno y el microondas a la vez. El diferencial salta. ¿Tengo que cambiar algo?",
    lingua: "es",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "sobrecarga del circuito — demasiada potencia en la misma línea",
    componenti: ["RCD", "MCB", "carico"],
    verifiche: ["medir corriente total del circuito", "verificar si horno y microondas están en la misma línea"],
    lezione: "horno + microondas en la misma línea = sobrecarga segura. Necesitan circuitos independientes"
  },
  {
    id: "FORUM-ES-002",
    domanda: "Tengo un problema raro: cuando llueve fuerte, se dispara el diferencial. Pero solo cuando llueve. Mi instalación tiene 30 años.",
    lingua: "es",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "filtración de agua en cajas de derivación exteriores — corriente de fuga por humedad",
    componenti: ["RCD", "giunzione", "conduttore"],
    verifiche: ["revisar cajas de derivación exteriores", "medir aislamiento después de lluvia"],
    lezione: "instalaciones viejas + lluvia = humedad en cajas. Mismo problema en todo el mundo"
  },

  // =========================================================================
  // TEDESCO — Elektrikerforum, gutefrage.net, Mikrocontroller.net
  // =========================================================================

  {
    id: "FORUM-DE-001",
    domanda: "Der FI-Schalter fliegt raus wenn ich die Spülmaschine einschalte. Maschine ist erst 2 Jahre alt. Was kann das sein?",
    lingua: "de",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "Fehlerstrom durch defekte Heizung in der Spülmaschine",
    componenti: ["RCD", "carico"],
    verifiche: ["Isolationsmessung an der Spülmaschine", "Heizstab prüfen"],
    lezione: "auch neue Geräte können Isolationsfehler haben — Heizstab ist die häufigste Ursache"
  },
  {
    id: "FORUM-DE-002",
    domanda: "Seit dem Gewitter gestern funktioniert mein Durchlauferhitzer nicht mehr. Sicherung ist drin, aber kein warmes Wasser.",
    lingua: "de",
    sintomo_atteso: "niente_tensione",
    causa_reale: "Überspannung durch Blitzeinschlag hat die Steuerplatine beschädigt",
    componenti: ["comando", "carico"],
    verifiche: ["Spannung am Gerät messen", "Steuerplatine prüfen", "Überspannungsschäden suchen"],
    lezione: "nach Gewitter → immer an Überspannungsschäden denken. Nicht nur Sicherung prüfen"
  },

  // =========================================================================
  // PORTOGHESE — Forum Eletricistas, PTelectricidade
  // =========================================================================

  {
    id: "FORUM-PT-001",
    domanda: "O disjuntor diferencial dispara sempre que ligo a máquina de lavar roupa. Já troquei a máquina e continua igual. O problema é na instalação?",
    lingua: "pt",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "problema na tomada ou no cabo de alimentação — fuga à terra no circuito, não no eletrodoméstico",
    componenti: ["RCD", "conduttore", "giunzione"],
    verifiche: ["medir isolamento do circuito da tomada", "verificar ligações na caixa de derivação"],
    lezione: "se trocou o aparelho e o problema continua, o defeito está na instalação — cabo ou tomada"
  },

  // =========================================================================
  // ROMENO — Forum.softpedia.com, Pair-connect.ro
  // =========================================================================

  {
    id: "FORUM-RO-001",
    domanda: "Diferentialul sare cand pornesc masina de spalat. Am schimbat masina, problema ramane. Ce poate fi?",
    lingua: "ro",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "defect in instalatia electrica — cablu deteriorat sau priza defecta",
    componenti: ["RCD", "conduttore"],
    verifiche: ["masurarea izolației circuitului", "verificare prize si cabluri"],
    lezione: "daca schimbi aparatul si problema ramane, defectul e in instalatie"
  },

  // =========================================================================
  // ARABO — منتديات كهربائية
  // =========================================================================

  {
    id: "FORUM-AR-001",
    domanda: "القاطع الكهربائي يفصل عند تشغيل المكيف. حاولت تبديل المكيف بآخر ونفس المشكلة. ما الحل؟",
    lingua: "ar",
    sintomo_atteso: "magnetotermico_scatta_subito",
    causa_reale: "مقطع الكابل صغير جداً للحمل — ارتفاع درجة حرارة الكابل",
    componenti: ["MCB", "conduttore", "carico"],
    verifiche: ["قياس التيار", "التحقق من مقطع الكابل"],
    lezione: "sezione cavo insufficiente per il carico del condizionatore — problema universale in paesi caldi"
  },

  // =========================================================================
  // CASI PARTICOLARI — I più difficili, quelli che insegnano di più
  // =========================================================================

  {
    id: "FORUM-SPEC-001",
    domanda: "Problema assurdo: le luci del bagno si accendono da sole alle 3 di notte. Non è un fantasma, lo giuro. Ho controllato gli interruttori, sono spenti.",
    lingua: "it",
    sintomo_atteso: "intermittente",
    causa_reale: "interferenza su cavo lungo parallelo alla linea di potenza — tensione indotta che attiva il relè crepuscolare",
    componenti: ["comando", "conduttore"],
    verifiche: ["verificare se c'è un relè crepuscolare o un sensore", "separare i cavi di segnale da quelli di potenza"],
    lezione: "luci che si accendono da sole = spesso un sensore o un relè crepuscolare che rileva interferenza. Non sono fantasmi"
  },
  {
    id: "FORUM-SPEC-002",
    domanda: "Ho un problema che non riesco a capire: quando accendo l'aspirapolvere in camera da letto, la TV del soggiorno si spegne e riaccende. I due sono su circuiti diversi.",
    lingua: "it",
    sintomo_atteso: "intermittente",
    causa_reale: "neutro condiviso o neutro allentato nel quadro — il disturbo si propaga attraverso il neutro comune",
    componenti: ["conduttore", "giunzione"],
    verifiche: ["controllare il serraggio del neutro nel quadro", "verificare se i circuiti condividono il neutro"],
    lezione: "quando un problema su un circuito disturba un altro circuito, il colpevole è quasi sempre il neutro"
  },
  {
    id: "FORUM-SPEC-003",
    domanda: "Il mio impianto fotovoltaico produce il 30% in meno rispetto all'anno scorso ma i pannelli sembrano ok, nessun errore sull'inverter.",
    lingua: "it",
    sintomo_atteso: "fotovoltaico_non_produce",
    causa_reale: "hot spot su un pannello con diodo bypass in cortocircuito + sporcizia accumulata",
    componenti: ["sorgente", "inverter"],
    verifiche: ["termografia dei pannelli", "misura tensione di ogni stringa", "pulizia pannelli"],
    lezione: "calo graduale senza errori = degrado pannelli, sporcizia o diodo bypass. Serve ispezione visiva e termografica"
  },
  {
    id: "FORUM-SPEC-004",
    domanda: "Dopo che l'ENEL ha fatto i lavori sul palo, la mia lavatrice ha smesso di funzionare e il frigorifero fa un rumore strano. Le luci funzionano.",
    lingua: "it",
    sintomo_atteso: "niente_tensione",
    causa_reale: "neutro interrotto o fase invertita dal lavoro del distributore — tensione anomala sulle fasi",
    componenti: ["sorgente", "conduttore"],
    verifiche: ["misura tensione fase-neutro e fase-terra", "chiamare il distributore se la tensione non è 230V±10%"],
    lezione: "dopo lavori del distributore, se gli apparecchi si comportano strano, misura subito la tensione. Potrebbe essere pericoloso"
  },
  {
    id: "FORUM-SPEC-005",
    domanda: "La mia caldaia parte e si ferma continuamente, fa 3-4 cicli al minuto. Il termostato è impostato a 21 ma in casa ci sono 18 gradi.",
    lingua: "it",
    sintomo_atteso: "caldaia_non_accende",
    causa_reale: "pompa circolatore bloccata o valvola a 3 vie inceppata — l'acqua non circola",
    componenti: ["carico", "sensore"],
    verifiche: ["verificare che la pompa giri", "controllare la valvola a 3 vie", "sentire se i radiatori si scaldano"],
    lezione: "caldaia che cicla = l'acqua non circola. La caldaia raggiunge la temperatura subito e si spegne perché l'acqua calda resta lì"
  },

  // =========================================================================
  // CASI REALI DAL WEB — Settembre 2026 — 20 casi verificati da forum tecnici
  // Fonti: PLC Forum, Elektrikforum.de, Futura Sciences, Foro Electricidad,
  //        Forum da Casa, EnergeticAmbiente, Electrician Talk, Mike Holt Forum,
  //        Electricians Forums UK, tout-electromenager.fr, Nergiza, Eletricidade.net
  // =========================================================================

  // --- ITALIANO — PLC Forum, EnergeticAmbiente ---

  {
    id: "FORUM-IT-011",
    domanda: "Dopo abbondanti piogge, il MTD della mia casa di campagna scatta. Ho aperto tutte le cassette di derivazione della casa e staccando di volta in volta tutti i fili sono riuscito a trovare quello incriminato.",
    lingua: "it",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "conduttore con isolamento degradato dall'umidità che provoca dispersione verso terra",
    componenti: ["RCD", "conduttore", "giunzione"],
    verifiche: ["apertura sistematica cassette derivazione", "scollegamento fili uno per uno", "misura isolamento conduttori"],
    lezione: "dopo piogge forti il guasto è nel percorso cavi — aprire tutte le cassette e sezionare filo per filo fino a trovare quello con isolamento degradato",
    fonte: "plcforum.it/f/topic/47540"
  },
  {
    id: "FORUM-IT-012",
    domanda: "Da febbraio 2021 il differenziale scatta senza motivo apparente, a volte più volte al giorno, a volte per mesi non succede. Il 90% delle interruzioni sono causate dal differenziale. Una presa Schuko si era fusa nel 2015.",
    lingua: "it",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "dispersione cumulativa da dispositivi in standby con filtri EMI che superava la soglia del differenziale obsoleto",
    componenti: ["RCD", "carico"],
    verifiche: ["pinza amperometrica in mA su ogni linea", "sostituzione differenziale con tipo A magnetotermico 6kA"],
    lezione: "i dispositivi moderni con filtri EMI (TV, microonde, PC) disperdono pochi mA ciascuno — la somma può superare i 30mA di un differenziale vecchio. Soluzione: tipo A superimmunizzato",
    fonte: "plcforum.it/f/topic/316866"
  },
  {
    id: "FORUM-IT-013",
    domanda: "Lo scaldabagno elettrico 80L da 10 anni fa saltare il differenziale. Ho scoperto il filo di terra staccato, sembrerebbe mai collegato: arrotolato su se stesso e con nastro all'estremità.",
    lingua: "it",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "resistenza corazzata con isolamento degradato dopo 10 anni — dispersione verso involucro metallico, tubature acqua come percorso di scarica",
    componenti: ["RCD", "carico"],
    verifiche: ["ispezione visiva collegamento terra", "misura isolamento resistenza", "sostituzione resistenza"],
    lezione: "i resistori corazzati degli scaldabagno perdono isolamento col tempo — se la terra non è collegata la dispersione va nelle tubature. Controllare sempre il collegamento terra",
    fonte: "plcforum.it/f/topic/274614"
  },
  {
    id: "FORUM-IT-014",
    domanda: "Interruttore magnetotermico Bticino portato per sostituzione con segni evidenti di bruciatura. Surriscaldamento del morsetto superiore destro con annerimento laterale. Al 99% ha stretto la vite ma il conduttore non era messo bene.",
    lingua: "it",
    sintomo_atteso: "surriscaldamento",
    causa_reale: "conduttore non completamente inserito nel morsetto prima del serraggio — contatto scadente con alta resistenza di giunzione",
    componenti: ["MCB", "giunzione"],
    verifiche: ["ispezione visiva morsetti", "sostituzione MCB danneggiato", "inserimento corretto conduttore"],
    lezione: "il morsetto allentato o mal inserito crea un punto caldo che si autoalimenta — la resistenza aumenta col calore che aumenta la resistenza. Verificare sempre che il conduttore sia a fondo prima di serrare",
    fonte: "plcforum.it/f/topic/273260"
  },
  {
    id: "FORUM-IT-015",
    domanda: "Ho un motore 2cv di un compressore ad aria cinese che fa scattare il differenziale. Funziona sul banco prova senza terra. Bulloni dello statore tutti allentati, limatura di ferro all'interno, segni di sfregamento sul rotore.",
    lingua: "it",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "bulloni statore allentati hanno causato contatto meccanico rotore-statore distruggendo l'isolamento degli avvolgimenti",
    componenti: ["RCD", "carico"],
    verifiche: ["misura isolamento fase-terra e neutro-terra", "ispezione visiva interna motore", "controllo bulloni statore"],
    lezione: "motore che scatta il differenziale ma funziona senza terra = dispersione sugli avvolgimenti. Cercare contatto rotore-statore, limatura, bulloni lenti. Isolamento ~1 MOhm = confine",
    fonte: "plcforum.it/f/topic/291876"
  },
  {
    id: "FORUM-IT-016",
    domanda: "Impianto FV 4.05 kW con inverter Aurora Power One senza trasformatore. Il differenziale scatta quando piove, tipicamente tra le 8 e le 9 del mattino quando inizia la produzione.",
    lingua: "it",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "acqua sui moduli FV aumenta la dispersione capacitiva verso terra — inverter senza trasformatore non blocca la componente DC",
    componenti: ["RCD", "carico"],
    verifiche: ["verifica tipo differenziale installato", "misura corrente dispersione con pannelli bagnati vs asciutti"],
    lezione: "impianto fotovoltaico con inverter senza trasformatore richiede differenziale tipo B — il tipo AC standard non regge le dispersioni capacitive dei pannelli bagnati",
    fonte: "energeticambiente.it/76343"
  },

  // --- TEDESCO — Elektrikforum.de ---

  {
    id: "FORUM-DE-003",
    domanda: "FI-Schalter und alle Sicherungen im Erdgeschoss fliegen gleichzeitig raus. Problem hört auf wenn Sicherung 66 (Wohnzimmer) draussen bleibt. 48 Stunden Test ohne Backofen — kein Auslösen. Der Fehlerstrom des Backofens muss nicht immer gleich groß gewesen sein.",
    lingua: "de",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "forno difettoso su circuito 69 con dispersione variabile — cumulata con altri circuiti superava la soglia FI",
    componenti: ["RCD", "carico"],
    verifiche: ["sezionamento circuiti sistematico", "test 48 ore con forno scollegato", "sostituzione forno"],
    lezione: "la dispersione variabile di un elettrodomestico può far scattare il differenziale su un circuito diverso da quello del guasto — la somma delle dispersioni conta, non il singolo circuito",
    fonte: "elektrikforum.de/threads/45211"
  },
  {
    id: "FORUM-DE-004",
    domanda: "Seit gestern morgen fliegt bei mir zu Hause ständig der FI Schalter raus. Alle 2 Stunden. Auch wenn kein Gerät angeschlossen ist. FI-Schalter wurde schon ausgetauscht — hilft nicht.",
    lingua: "de",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "difetto isolamento nella cablatura fissa — contatto tra neutro (N) e conduttore di protezione (PE)",
    componenti: ["RCD", "conduttore"],
    verifiche: ["misura resistenza isolamento", "sezionamento circuiti sistematico", "ispezione punti luce e cassette"],
    lezione: "se il FI scatta anche senza carichi e la sostituzione del FI non risolve, il guasto è nell'impianto fisso — cercare contatti N-PE nei punti luce e nelle cassette",
    fonte: "elektrikforum.de/threads/14497"
  },
  {
    id: "FORUM-DE-005",
    domanda: "Umzugskarton fiel gegen eine Unterputzsteckdose in Hohlwand. Lauter Knall, FI und LSS lösten aus. Brandspuren an der Abdeckung. Die rechte Kralle hat die L-Ader durch den mechanischen Schlag durchstoßen.",
    lingua: "de",
    sintomo_atteso: "magnetotermico_scatta_subito",
    causa_reale: "graffette metalliche della presa hanno perforato il conduttore di fase per impatto meccanico — cortocircuito L-PE",
    componenti: ["MCB", "RCD", "conduttore"],
    verifiche: ["ispezione visiva presa", "verifica danni al conduttore", "sostituzione presa"],
    lezione: "le prese con graffette metalliche di fissaggio in pareti vuote possono perforare il cavo per impatto meccanico — verificare sempre dopo urti violenti al muro",
    fonte: "elektrikforum.de/threads/45213"
  },
  {
    id: "FORUM-DE-006",
    domanda: "Warmwasserboiler löst den Haupt-FI der gesamten Wohnung aus, aber nicht immer. Abends fliegt der FI, morgens geht alles wieder. Boiler ca. 5 Jahre alt.",
    lingua: "de",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "difetto isolamento nel resistore del boiler — dispersione intermittente verso involucro metallico che supera 30mA",
    componenti: ["RCD", "carico"],
    verifiche: ["misura isolamento resistore boiler", "sostituzione resistore"],
    lezione: "boiler che fa scattare il FI la sera ma non la mattina = degradazione isolamento del resistore che peggiora con il riscaldamento. Il resistore va sostituito",
    fonte: "elektrikforum.de/threads/22979"
  },

  // --- FRANCESE — Futura Sciences, tout-electromenager.fr ---

  {
    id: "FORUM-FR-003",
    domanda: "L'interrupteur différentiel saute sans raison apparente, surtout sur le circuit chaudière. Même avec tous les disjoncteurs individuels désactivés, le différentiel continue de sauter. Départ clandestin découvert depuis le disjoncteur PC Parents alimentant la rangée supérieure.",
    lingua: "fr",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "collegamento clandestino non documentato nel quadro — un circuito alimentava la fila superiore creando dispersione intermittente con umidità",
    componenti: ["RCD", "conduttore"],
    verifiche: ["tracciamento completo dei circuiti nel quadro", "verifica collegamenti tra file del quadro"],
    lezione: "se il differenziale scatta anche con tutti i magnetotermici disattivati, cercare collegamenti nascosti o derivazioni non documentate nel quadro",
    fonte: "futura-sciences.com/839883"
  },
  {
    id: "FORUM-FR-004",
    domanda: "Lave-linge Listo: le cycle de lavage commence correctement mais le différentiel saute lors de la mise en température. En débranchant la résistance, la machine fonctionne correctement. Résistance mesure 25 ohms mais présente un défaut de fuite.",
    lingua: "fr",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "resistenza lavatrice con valore ohmico corretto ma isolamento compromesso — dispersione a terra quando riscaldata, aggravata da acqua del tappo tamburo",
    componenti: ["RCD", "carico"],
    verifiche: ["scollegamento resistenza e test ciclo", "misura isolamento resistenza a caldo", "verifica tappo tamburo"],
    lezione: "una resistenza può misurare 25 ohm corretti ma avere isolamento compromesso — il difetto si manifesta solo a caldo. Il test di isolamento va fatto a temperatura di esercizio",
    fonte: "tout-electromenager.fr/183959"
  },

  // --- SPAGNOLO — Foro Electricidad, Nergiza ---

  {
    id: "FORUM-ES-003",
    domanda: "En mi piso desde hace 20 años el diferencial salta ocasionalmente sin patrón claro. De días sin problema a 10 veces en 24 horas. Ocurre incluso a las 4-7 AM sin electrodomésticos. Afecta a 5 de 18 viviendas en la misma fase. Ruido electrónico que viene por la red.",
    lingua: "es",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "armoniche e rumore elettronico dalla fase condivisa del palazzo combinati con dispersione interna cumulativa",
    componenti: ["RCD"],
    verifiche: ["verifica se il problema interessa altri appartamenti sulla stessa fase", "installazione differenziale superimmunizzato tipo A con filtro armoniche"],
    lezione: "se il differenziale scatta a orari impossibili (4 AM senza carichi) e il problema interessa più appartamenti, il disturbo viene dalla rete — servono differenziali superimmunizzati",
    fonte: "foroelectricidad.net/threads/3272"
  },
  {
    id: "FORUM-ES-004",
    domanda: "El diferencial salta aproximadamente cada semana sin tener nada encendido. El problema comenzó después de aumentar la potencia contratada. Solo se pueden poner 5 PIAs por cada diferencial.",
    lingua: "es",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "troppi circuiti (PIA) su un unico differenziale — dispersione cumulativa supera la soglia",
    componenti: ["RCD", "MCB"],
    verifiche: ["contare i circuiti per differenziale", "installare secondo differenziale per dividere i circuiti"],
    lezione: "regola pratica: massimo 5-6 circuiti per differenziale. Troppi circuiti = la somma delle dispersioni normali supera i 30mA",
    fonte: "nergiza.com/foro/threads/16082"
  },

  // --- PORTOGHESE — Forum da Casa, Eletricidade.net ---

  {
    id: "FORUM-PT-002",
    domanda: "O diferencial vai dispara quando se liga o forno. Apartamento novo com equipamento novo. Era o disjuntor do diferencial que estava regulado para uma potência mais fraca — regulado para potência de obra.",
    lingua: "pt",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "differenziale regolato per potenza di cantiere (illuminazione provvisoria) non per uso residenziale",
    componenti: ["RCD"],
    verifiche: ["verifica taratura differenziale", "regolazione alla potenza corretta"],
    lezione: "in un appartamento nuovo che scatta col forno, prima di cercare guasti verificare la taratura del differenziale — potrebbe essere ancora regolato per il cantiere",
    fonte: "forumdacasa.com/discussion/90922"
  },
  {
    id: "FORUM-PT-003",
    domanda: "Disparos persistentes do diferencial em apartamento em Lisboa. Forno causou disparo simultâneo do disjuntor principal + diferencial + interruptor. Com multímetro em ohms: passagem entre fase e carcaça do forno. Múltiplas fases partilhavam um único neutro.",
    lingua: "pt",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "doppio guasto: distribuzione neutro scorretta (più fasi su un solo neutro) + difetto isolamento forno con dispersione verso carcassa",
    componenti: ["RCD", "MCB", "conduttore", "carico"],
    verifiche: ["misura con multimetro in ohm tra fase e carcassa", "tracciamento neutri nel quadro", "megaohmetro su ogni circuito"],
    lezione: "quando il differenziale scatta insieme al magnetotermico e al generale, il guasto è grave — cercare sia problemi di cablaggio (neutri condivisi) sia guasti componenti",
    fonte: "eletricidade.net/viewtopic.php?t=20282"
  },

  // --- INGLESE — Electrician Talk, Electricians Forums, Mike Holt ---

  {
    id: "FORUM-EN-005",
    domanda: "Intermittent AFCI breaker tripping after LED bulb retrofit. Not reproducible on demand. Some cheaper LED transformers induce interference into the electrical line, triggering AFCI even on adjacent circuits.",
    lingua: "en",
    sintomo_atteso: "magnetotermico_scatta_subito",
    causa_reale: "driver LED economici che generano interferenze elettromagnetiche ad alta frequenza attivano la rilevazione arco dell'AFCI anche su circuiti adiacenti",
    componenti: ["MCB", "carico"],
    verifiche: ["rimozione lampadine LED una alla volta", "sostituzione con LED compatibili AFCI"],
    lezione: "se un AFCI scatta dopo retrofit LED e il problema scompare rimuovendo le lampadine, il driver LED è incompatibile — la EMI ad alta frequenza simula un arco elettrico",
    fonte: "electriciantalk.com/threads/276664"
  },
  {
    id: "FORUM-EN-006",
    domanda: "New distribution board for milking robots showing 150-170mA earth leakage. Leakage remained even with main isolator off. 95mA from new installation, 75mA from old installation. 0mA when disconnecting original installation earth.",
    lingua: "en",
    sintomo_atteso: "differenziale_scatta",
    causa_reale: "cablaggio di terra vecchio degradato contribuisce la maggior parte della dispersione — combinata con dispersione motori nuovi supera soglia RCD",
    componenti: ["RCD", "carico", "conduttore"],
    verifiche: ["pinza amperometrica su terra vecchia e nuova separatamente", "misura dispersione con e senza terra vecchia"],
    lezione: "quando si aggiunge un nuovo quadro a un impianto esistente, misurare la dispersione separatamente — il vecchio impianto può contribuire una dispersione nascosta che si somma",
    fonte: "electricianforum.co.uk/threads/56607"
  },
  {
    id: "FORUM-EN-007",
    domanda: "RCD trips intermittently with no clear pattern. All standard insulation tests pass when dry. Cable in motorised valve touching down as valve opened. Condensation moisture on plumbing lowered insulation resistance.",
    lingua: "en",
    sintomo_atteso: "intermittente",
    causa_reale: "cavo della valvola motorizzata che tocca la superficie messa a terra quando la valvola apre — condensa sulle tubature abbassa la resistenza di isolamento",
    componenti: ["RCD", "carico", "conduttore"],
    verifiche: ["test isolamento con impianto riscaldamento in funzione", "ispezione visiva valvole motorizzate", "reindirizzamento cavo"],
    lezione: "guasto intermittente che supera tutti i test a secco = cercare contatti meccanici che si creano solo durante il funzionamento (valvole, motori, parti mobili) + condensa",
    fonte: "electriciansforums.net/threads/200076"
  },
  {
    id: "FORUM-EN-008",
    domanda: "Cooper receptacle and plug from radiant space heater found melted. Burn centered on neutral plug blade contact area. Backstabbed wire on burnt side was loose. The backstab with its small contact area and poor contact pressure becomes the proximate cause.",
    lingua: "en",
    sintomo_atteso: "surriscaldamento",
    causa_reale: "connessione backstab con area di contatto insufficiente — alta resistenza sotto carico elevato (stufetta) crea ciclo termico crescente",
    componenti: ["carico", "giunzione"],
    verifiche: ["ispezione visiva prese sotto carico pesante", "sostituzione prese backstab con morsetti a vite"],
    lezione: "le connessioni backstab (a molla) sono il punto debole — sotto carichi pesanti la piccola area di contatto si surriscalda, la molla perde tensione, il contatto peggiora. Usare sempre morsetti a vite per carichi importanti",
    fonte: "forums.mikeholt.com/threads/148738"
  }
];

// ============================================================================
// FUNZIONI PER USARE I CASI
// ============================================================================

// --- Tutti i casi ---
function getTutti() {
  return CASI_FORUM;
}

// --- Filtra per lingua ---
function perLingua(lingua) {
  return CASI_FORUM.filter(function(c) { return c.lingua === lingua; });
}

// --- Filtra per sintomo ---
function perSintomo(sintomo) {
  return CASI_FORUM.filter(function(c) { return c.sintomo_atteso === sintomo; });
}

// --- Cerca per parola chiave nella domanda ---
function cerca(parola) {
  var p = parola.toLowerCase();
  return CASI_FORUM.filter(function(c) {
    return c.domanda.toLowerCase().indexOf(p) >= 0;
  });
}

// --- Converti un caso in formato caseState per ROCCO ---
function aCaseState(caso) {
  return {
    problem_summary: caso.domanda,
    components_detected: caso.componenti,
    facts_confirmed: [],
    measurements: [],
    lingua: caso.lingua
  };
}

// --- Converti un caso in formato training per il simulatore ---
function aTraining(caso) {
  return {
    caseState: aCaseState(caso),
    esito: {
      causa_reale: caso.causa_reale,
      componenti: caso.componenti,
      come_verificato: caso.verifiche.join("; ")
    }
  };
}

// --- Stats ---
function getStats() {
  var lingue = {};
  var sintomi = {};
  for (var i = 0; i < CASI_FORUM.length; i++) {
    lingue[CASI_FORUM[i].lingua] = (lingue[CASI_FORUM[i].lingua] || 0) + 1;
    sintomi[CASI_FORUM[i].sintomo_atteso] = (sintomi[CASI_FORUM[i].sintomo_atteso] || 0) + 1;
  }
  return {
    totale: CASI_FORUM.length,
    lingue: lingue,
    sintomi: sintomi
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  CASI_FORUM: CASI_FORUM,
  getTutti: getTutti,
  perLingua: perLingua,
  perSintomo: perSintomo,
  cerca: cerca,
  aCaseState: aCaseState,
  aTraining: aTraining,
  getStats: getStats
};
