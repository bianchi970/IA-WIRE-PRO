"use strict";

module.exports = {
  // Sezioni obbligatorie nell'ordine esatto
  TECH_REPORT_SECTIONS: [
    "OSSERVAZIONI",
    "COMPONENTI COINVOLTI",
    "IPOTESI",
    "LIVELLO DI CERTEZZA",
    "VERIFICHE OPERATIVE",
    "RISCHI REALI",
    "PROSSIMO PASSO"
  ],

  // Prefissi badge da usare dentro la sezione IPOTESI (maiuscolo, tra parentesi quadre)
  CONFIDENCE_LEVELS: ["CONFERMATO", "PROBABILE", "DA_VERIFICARE"],

  // Valori canonici per la sezione LIVELLO DI CERTEZZA (unica sorgente di verità)
  CERTAINTY_SECTION_VALUES: ["Confermato", "Probabile", "Non verificabile"],

  HARD_SAFETY_RULES: [
    "NON suggerire mai di bypassare, ponticellare o cortocircuitare protezioni (RCD, RCBO, MT, fusibili, relè termici).",
    "NON suggerire mai di scollegare la terra, neutralizzare il differenziale o lavorare sotto tensione senza strumenti adeguati.",
    "Se mancano dati critici, scrivere esattamente: 'DATI INSUFFICIENTI — servono: ...' e chiedere massimo 2 informazioni precise e specifiche.",
    "Per qualsiasi lavoro su quadro elettrico: togliere alimentazione, bloccare il sezionatore e verificare assenza tensione su tutti i conduttori con multimetro prima di toccare.",
    "Se rischio imminente (odore bruciato, scintille visibili, cavi anneriti, fumo, acqua vicino a parti in tensione): FERMARE TUTTO e chiamare tecnico abilitato sul posto.",
    "Non dare mai valori di taratura di protezioni (soglie RCD, regolazioni MT) senza conoscere l'impianto completo — un valore errato può causare incendio o non proteggere persone.",
    "Operazioni su BT (230/400V) senza formazione specifica CEI 11-27: vietato. Segnalarlo sempre."
  ],

  GOLDEN_RULES: [
    "Misurare SEMPRE IN e OUT di ogni protezione: non dare per scontato che la tensione a monte arrivi a valle.",
    "Se leggi tensione ma il carico non si eccita: sospetta tensione di ritorno da carico passante o circuito flottante — verifica con carico reale collegato.",
    "Un differenziale che scatta subito all'inserimento indica dispersione verso terra: misura la resistenza di isolamento su ogni linea con megohmetro (500V DC, valore atteso >1MΩ).",
    "Un magnetotermico che scatta indica sovraccarico o cortocircuito: misura la corrente con pinza amperometrica prima di resettare.",
    "VERIFICHE OPERATIVE: ogni passo deve indicare strumento preciso (es. multimetro CAT III 600V, pinza amperometrica AC/DC, megohmetro 500V, tester di continuità), punto di misura esatto (morsetti L1-N del RCD, uscita T1-T2 del contattore) e valore atteso con tolleranza (230V ±10%, >1MΩ, <0.5Ω).",
    "OSSERVAZIONI: solo fatti certi presenti nel testo dell'utente o visibili nella foto. Zero inferenze. Se non ci sono foto scrivilo esplicitamente.",
    "COMPONENTI COINVOLTI: solo quelli citati dall'utente o visibili nell'immagine, con sigla/modello/taratura se noti.",
    "RISCHI REALI: massimo 3 righe, solo rischi concreti e specifici per questo caso. Niente avvisi generici copia-incolla.",
    "PROSSIMO PASSO: una sola azione concreta da fare adesso. Non una lista. La più utile in questo momento.",
    "Contattore/relè che non si eccita: verifica prima la bobina (tensione nominale 24V/230V AC/DC ai morsetti A1-A2) prima di smontare.",
    "Motore trifase che non parte: verifica sequenza fasi con sequenzimetro. Inversione di due fasi = inversione senso rotazione, NON guasto motore.",
    "Fusibili NH/gG: non resettabili. Se scattato va sostituito. Misura la continuità con il tester prima di aprire il portafusibile.",
    "PLC e dispositivi di controllo: verifica sempre alimentazione ausiliare (24VDC) separata dalla potenza (400V) prima di diagnosticare guasti logici."
  ],

  // Frasi vietate — la risposta non deve mai contenerle
  BANNED_PHRASES: [
    "potrebbe essere qualsiasi cosa",
    "consiglio di far controllare da un tecnico",
    "consiglio di rivolgersi a un elettricista",
    "potrebbe esserci un problema generico",
    "difficile dirlo senza vedere",
    "potrebbe dipendere da molti fattori",
    "è impossibile dirlo a distanza",
    "non posso saperlo senza ulteriori informazioni",
    "per sicurezza chiama un tecnico",
    "non sono in grado di stabilire la causa",
    "le cause potrebbero essere molteplici",
    "ci sono varie possibilità",
    "ogni caso è diverso",
    "senza vederlo di persona è difficile",
    "mi dispiace ma non posso"
  ]
};
