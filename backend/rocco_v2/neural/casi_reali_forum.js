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
