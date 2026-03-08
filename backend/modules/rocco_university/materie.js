/**
 * ROCCO UNIVERSITY — Materie
 * Struttura dati per ogni materia di studio
 */

const MATERIE = {
  matematica_tecnica: {
    id: 'matematica_tecnica',
    nome: 'Matematica Tecnica',
    descrizione: 'Algebra, trigonometria, numeri complessi, equazioni differenziali per tecnici',
    livello_studio: 0, // 0=non iniziato, 1-100=percentuale
    argomenti: ['algebra', 'trigonometria', 'numeri_complessi', 'logaritmi', 'vettori', 'matrici'],
    prerequisiti: [],
    collegata_a: ['fisica', 'elettrotecnica', 'elettronica_base']
  },
  fisica: {
    id: 'fisica',
    nome: 'Fisica',
    descrizione: 'Meccanica, termodinamica, elettromagnetismo, ottica',
    livello_studio: 0,
    argomenti: ['meccanica', 'termodinamica', 'elettromagnetismo', 'ottica', 'onde'],
    prerequisiti: ['matematica_tecnica'],
    collegata_a: ['elettrotecnica', 'macchine_elettriche']
  },
  elettrotecnica: {
    id: 'elettrotecnica',
    nome: 'Elettrotecnica',
    descrizione: 'Circuiti CC/CA, leggi di Kirchhoff, reti elettriche, potenza',
    livello_studio: 0,
    argomenti: ['circuiti_cc', 'circuiti_ca', 'kirchhoff', 'potenza', 'trifase', 'trasformatori'],
    prerequisiti: ['matematica_tecnica', 'fisica'],
    collegata_a: ['macchine_elettriche', 'impianti_elettrici', 'elettronica_base']
  },
  elettronica_base: {
    id: 'elettronica_base',
    nome: 'Elettronica di Base',
    descrizione: 'Semiconduttori, diodi, transistor, amplificatori, circuiti integrati',
    livello_studio: 0,
    argomenti: ['semiconduttori', 'diodi', 'transistor', 'amplificatori', 'logica_digitale'],
    prerequisiti: ['fisica', 'elettrotecnica'],
    collegata_a: ['automazioni', 'misure_elettriche']
  },
  macchine_elettriche: {
    id: 'macchine_elettriche',
    nome: 'Macchine Elettriche',
    descrizione: 'Motori CC/CA, generatori, trasformatori, azionamenti',
    livello_studio: 0,
    argomenti: ['motori_cc', 'motori_asincroni', 'motori_sincroni', 'generatori', 'trasformatori', 'azionamenti'],
    prerequisiti: ['elettrotecnica'],
    collegata_a: ['impianti_elettrici', 'automazioni', 'diagnosi_guasti']
  },
  impianti_elettrici: {
    id: 'impianti_elettrici',
    nome: 'Impianti Elettrici',
    descrizione: 'Progettazione, cavi, protezioni, sistemi TT/TN/IT, BT/MT',
    livello_studio: 0,
    argomenti: ['cavi', 'protezioni', 'sistemi_distribuzione', 'bt', 'mt', 'corrente_corto_circuito', 'selettivita'],
    prerequisiti: ['elettrotecnica'],
    collegata_a: ['normative_sicurezza', 'diagnosi_guasti', 'misure_elettriche']
  },
  automazioni: {
    id: 'automazioni',
    nome: 'Automazioni',
    descrizione: 'PLC, HMI, reti industriali, controllo, SCADA',
    livello_studio: 0,
    argomenti: ['plc', 'hmi', 'reti_industriali', 'controllo_pid', 'scada', 'fieldbus'],
    prerequisiti: ['elettronica_base', 'macchine_elettriche'],
    collegata_a: ['diagnosi_guasti', 'misure_elettriche']
  },
  misure_elettriche: {
    id: 'misure_elettriche',
    nome: 'Misure Elettriche',
    descrizione: 'Strumentazione, multimetro, oscilloscopio, analizzatore di rete, verifiche impianti',
    livello_studio: 0,
    argomenti: ['multimetro', 'oscilloscopio', 'analizzatore_rete', 'pinza_amperometrica', 'verifiche_cei', 'incertezza_misura'],
    prerequisiti: ['elettrotecnica'],
    collegata_a: ['diagnosi_guasti', 'impianti_elettrici', 'normative_sicurezza']
  },
  diagnosi_guasti: {
    id: 'diagnosi_guasti',
    nome: 'Diagnosi Guasti',
    descrizione: 'Metodologia di diagnosi, analisi guasti, troubleshooting sistematico',
    livello_studio: 0,
    argomenti: ['metodologia', 'guasti_motori', 'guasti_impianti', 'guasti_automazione', 'analisi_cause', 'documentazione'],
    prerequisiti: ['misure_elettriche', 'impianti_elettrici'],
    collegata_a: ['macchine_elettriche', 'automazioni', 'normative_sicurezza']
  },
  normative_sicurezza: {
    id: 'normative_sicurezza',
    nome: 'Normative e Sicurezza',
    descrizione: 'CEI 64-8, DM 37/2008, CEI EN 60204, sicurezza elettrica, ATEX',
    livello_studio: 0,
    argomenti: ['cei_64_8', 'dm_37_2008', 'cei_en_60204', 'atex', 'norme_prodotto', 'sicurezza_lavoro'],
    prerequisiti: ['impianti_elettrici'],
    collegata_a: ['impianti_elettrici', 'diagnosi_guasti']
  }
};

module.exports = { MATERIE };
