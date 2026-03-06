# ROCCO KNOWLEDGE BASE — IA Wire Pro
**Versione**: 1.0
**Fonte**: GWSoftware (GW3708, GWCAP, GWENERGYpro) + CEI 64-8 + CEI-UNEL 35024/1

---

## PARTE 1 — MODELLO DATI CIRCUITO

```json
{
  "circuito": {
    "tensione_nominale_V": 230,
    "sistema": "TT",
    "fasi": "monofase",
    "corrente_impiego_A": 0,
    "potenza_W": 0,
    "cos_phi": 0.9,
    "lunghezza_m": 0,
    "sezione_mm2": 0,
    "materiale_conduttore": "rame",
    "tipo_posa": "tubi_incassati",
    "protezione": {
      "tipo": "magnetotermico",
      "In_A": 0,
      "Icc_kA": 0,
      "curva": "C"
    }
  }
}
```

Sistemi: TT | TN-S | TN-C | IT
Fasi: 10=monofase(230V) | 20=bifase | 30=trifase(400V)

---

## PARTE 2 — FORMULE CEI 64-8

### Corrente di impiego (Ib)
- Monofase: Ib = P / (V × cos_phi)
- Trifase:  Ib = P / (√3 × V × cos_phi)

### Scelta sezione (art. 433)
- Iz ≥ In ≥ Ib  (obbligatorio)

### Caduta di tensione (ΔV%)
- Monofase: ΔV% = (2 × Ib × L × R×cosφ) / V × 100
- Trifase:  ΔV% = (√3 × Ib × L × R×cosφ) / V × 100
- Limiti: linea principale ≤1% | terminale ≤4% | totale ≤4%

### Resistenza conduttore
- R = ρ × L / S
- ρ rame = 0.0178 Ω·mm²/m (20°C) | 0.0225 (75°C)
- ρ alluminio = 0.0291 Ω·mm²/m (20°C)

### Corrente di cortocircuito (Icc)
- Icc = V / (√3 × Ztot)
- Ztot = √(Rtot² + Xtot²)
- Verifica: Icc_min ≥ In_interruttore
- Verifica: Icc_max ≤ Iccn_interruttore

### Protezione differenziale (sistema TT, art. 413)
- Ra × Idn ≤ 50V
- RE ≤ 50 / Idn
- Esempio: Idn=30mA → RE ≤ 1666 Ω

### Soglie Idn standard
- 30 mA  → protezione persone (obbligatoria bagni/prese)
- 300 mA → protezione incendi
- 500 mA / 1A → protezione impianto

---

## PARTE 3 — PORTATE CAVI CEI-UNEL 35024/1

### Metodo B — Tubo incassato (posa più comune)
| Sezione mm² | 1 circuito mono | 1 circuito tri | 2 circuiti | 3+ circuiti |
|---|---|---|---|---|
| 1.5  | 15A | 13A | 12A | 10A |
| 2.5  | 21A | 18A | 16A | 14A |
| 4    | 27A | 24A | 21A | 18A |
| 6    | 34A | 31A | 27A | 23A |
| 10   | 46A | 42A | 37A | 32A |
| 16   | 61A | 56A | 49A | 43A |
| 25   | 80A | 73A | 64A | 57A |
| 35   | 99A | 89A | 79A | 70A |
| 50   |119A |108A | 94A | 84A |
| 70   |151A |136A |119A |107A |
| 95   |182A |164A |144A |129A |
| 120  |210A |188A |166A |149A |
| 150  |240A |216A |189A |170A |
| 185  |273A |245A |215A |194A |
| 240  |321A |286A |252A |227A |

### Metodo E — Aria libera
| Sezione mm² | Monofase | Trifase |
|---|---|---|
| 1.5  | 22A | 18A |
| 2.5  | 30A | 25A |
| 4    | 40A | 33A |
| 6    | 51A | 42A |
| 10   | 70A | 57A |
| 16   | 94A | 76A |
| 25   |119A | 99A |
| 35   |148A |121A |
| 50   |180A |147A |
| 70   |232A |189A |
| 95   |282A |230A |
| 120  |328A |267A |

### Fattori correzione temperatura (kt)
10°C=1.22 | 15°C=1.17 | 20°C=1.12 | 25°C=1.06 | 30°C=1.00
35°C=0.94 | 40°C=0.87 | 45°C=0.79 | 50°C=0.71
Iz_corretta = Iz_tabella × kt

### Sezioni minime CEI 64-8
- Fase civile: 1.5 mm²
- Fase prese >16A: 2.5 mm²
- Neutro (S≤16mm²): uguale alla fase
- PE (S≤16mm²): uguale alla fase
- PE (16<S≤35mm²): 16 mm²
- PE (S>35mm²): S/2
- Equipotenziale principale: ≥6 mm²
- Equipotenziale supplementare: ≥2.5 mm² (protetto) / 4 mm² (non protetto)
- Dispersore verticale acciaio: ≥50 mm²

---

## PARTE 4 — INTERRUTTORI MAGNETOTERMICI

### Curve di intervento
- B: 3–5×In   → carichi resistivi, cavi lunghi
- C: 5–10×In  → uso generale, motori piccoli
- D: 10–20×In → motori, trasformatori
- K: 8–15×In  → motori industriali
- Z: 2–3×In   → circuiti elettronici

### Taglie standard (In)
1, 2, 4, 6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630 A

### Potere di interruzione (Iccn)
3kA | 6kA | 10kA | 15kA | 25kA | 36kA | 50kA

---

## PARTE 5 — VERIFICHE DM 37/08 (da GW3708.mdb)

### Esami a Vista (42 verifiche)
1.  Impianto conforme alla documentazione tecnica
2.  Componenti adeguati all'ambiente (IP, temperatura)
3.  Protezioni contatti diretti/indiretti adeguate
4.  Impianti >1kV (cabine MT/BT)
5.  [CALCOLO] Conduttori scelti per portate e cadute di tensione
6.  [CALCOLO] Protezioni contro sovraccarichi conformi CEI
7.  [CALCOLO] Protezioni contro cortocircuiti conformi CEI
8.  Sezionamento circuiti conforme CEI
9.  Comando/arresto emergenza dove necessario
10. Tensione nominale isolamento conduttori adeguata
11. [CALCOLO] Sezioni minime conduttori rispettate
12. Colori/marcature conduttori (giallo-verde=PE, blu=N, nero/marrone/grigio=fase)
13. Tubi protettivi e canali con dimensioni adeguate
14. Connessioni conduttori idonee
15. Interruttori unipolari sul conduttore di fase
16. [CALCOLO] Dimensioni minime dispersori e conduttori di terra
17. Nodo collettore di terra accessibile
18. Conduttore di protezione per tutte le masse
19. Conduttore equipotenziale principale per tutte le masse
20. Impianto bagno/docce conforme CEI 64-8 Sez.701
21. Illuminazione esterna conforme CEI 64-7
22. Impianto antenna TV conforme CEI 100-7
23. Insegna luminosa conforme CEI 34-86
24. Quote installazione prese conformi norma

### Prove Strumentali (8 verifiche)
1. Continuità conduttori PE ed equipotenziali (<1Ω)
2. Resistenza isolamento Un≤500V (≥1MΩ)
3. Resistenza isolamento Un>500V (≥1MΩ/kV)
4. Resistenza isolamento SELV/terra (≥0.25MΩ)
5. Resistenza isolamento PELV/terra (≥0.5MΩ)
6. Resistenza isolamento pavimenti e pareti
7. [CALCOLO] Resistenza di terra (limite: 50/Idn)
8. Verifica differenziali (Idn effettiva ≤ Idn nominale)

---

## PARTE 6 — TIPI IMPIANTO (da CapNet.mdb)

ALIM=Alimentazione | CABMT=Cabina MT-BT | CAVI=Cavi e connessioni
TERRA=Impianto di terra | PROT=Protezioni | ILLUM=Illuminazione
FM=Forza motrice/prese | BAGNO=Locali bagno CEI 701 | EST=Impianti esterni
EMRG=Emergenza | TV=Antenna TV/SAT | TEL=Telefono/dati | FULM=Protezione fulmini

---

## PARTE 7 — LOGICA DIAGNOSTICA ROCCO

Sequenza analisi:
1. INPUT: tipo impianto, sistema (TT/TN/IT), tensione, potenza/carichi
2. CALCOLO Ib per ogni circuito e totale quadro
3. DIMENSIONAMENTO: sezione minima (Iz≥Ib), verifica ΔV%≤4%
4. PROTEZIONI: In (Ib≤In≤Iz), curva, Iccn≥Icc punto, differenziale
5. TERRA: RE≤50/Idn, sezione PE
6. CHECKLIST DM37/08: 42 esami a vista + 8 prove strumentali
7. OUTPUT: relazione tecnica + dichiarazione conformità + lista materiali

---

## PARTE 8 — PROMPT SISTEMA ROCCO

```
Sei ROCCO, motore diagnostico di IA Wire Pro per elettricisti professionisti italiani.
Conosci: CEI 64-8, DM 37/08, CEI-UNEL 35024/1, CEI 64-7, CEI 100-7, CEI 34-86.
Quando analizzi un impianto:
1. Chiedi: tensione, sistema (TT/TN), potenza, tipo locale
2. Calcola Ib, sezione cavo, ΔV%, protezioni con valori numerici precisi
3. Verifica conformità DM 37/08 (42+8 verifiche)
4. Indica sempre la norma CEI specifica
5. In caso di non conformità indica la correzione necessaria
Usa terminologia tecnica italiana professionale.
Non dare mai risposte vaghe — dai sempre calcoli e riferimenti normativi.
```

---

## TODO — Dati da aggiungere

- [ ] 21.864 articoli GEWISS (GW3708.mdb — Anagrafica_Articoli)
- [ ] 164 schemi quadro pre-cablaggio (cabl.zip)
- [ ] Portate cavi alluminio e interrati (metodo D)
- [ ] Coefficienti contemporaneità (CEI 64-8 art.311)
- [ ] Calcolo dispersori (anello, picchetto, fondazione)
- [ ] Tabelle differenziali (classi AC/A/B/F)
- [ ] Impianti FV (CEI 82-25)
- [ ] EV charging (CEI 64-8 Sez.722)
- [ ] Sezioni minime per tipo locale (Sez.701/702/703)

---
# AGGIORNAMENTO v2 — GEWISS TECH SUITE + FONTI DATI APERTE

## PARTE 9 — FORMULE COMPLETE (da PBT-Q / PROJEX GWSoftware)

### 9.1 Corrente di impiego completa (con fattori reali)

**Monofase:**
```
Ib = P / (V × cosφ × η)
```
**Trifase:**
```
Ib = P / (√3 × V × cosφ × η)
```
**Con più carichi (fattori di utilizzazione e contemporaneità):**
```
Ib = Σ(Pi × ku × kc) / (k × V × cosφ)
```
- η = rendimento motore (default 0.9 motori, 1.0 carichi resistivi)
- ku = fattore di utilizzazione (default 0.75 residenziale, 0.85 industriale)
- kc = fattore di contemporaneità (da tabella CEI 64-8 art. 311)

### 9.2 Portata cavo con fattori correttivi completi
```
Iz = I0 × K1 × K2
```
- I0 = portata base a 30°C aria (da tabella metodo posa)
- K1 = fattore temperatura (vedi tabella sotto)
- K2 = fattore raggruppamento (vedi tabella sotto)

### 9.3 Coordinamento protezioni (CEI 64-8/4 Sez.433) — COMPLETO

**Condizione 1 — sovraccarico:**
```
Ib ≤ In ≤ Iz
```
**Condizione 2 — intervento convenzionale:**
```
If ≤ 1.45 × Iz
```
- Per interruttori domestici EN 60898: If = 1.45 × In → condizione automaticamente soddisfatta se In ≤ Iz
- Per interruttori industriali EN 60947-2: If = 1.3 × In → verificare esplicitamente
- Per fusibili: If = 1.6 × In → necessario In ≤ 0.9 × Iz

### 9.4 Verifica termica al cortocircuito (CEI 64-8 art.434)
```
I²t ≤ K²S²
```
Costante K per tipo cavo:
| Isolamento | Conduttore | K |
|---|---|---|
| PVC | Rame | 115 |
| XLPE/EPR | Rame | 143 |
| PVC | Alluminio | 76 |
| XLPE/EPR | Alluminio | 94 |

Formula per verificare sezione minima contro cortocircuito:
```
S_min = √(I²t) / K   (mm²)
```

### 9.5 Tempi massimi di sgancio (CEI 64-8)
| Tipo circuito | Tempo max sgancio |
|---|---|
| Circuiti terminali ≤32A (TN) | 0.4 s |
| Circuiti distribuzione (TN) | 5 s |
| Circuiti terminali ≤32A (TT) | 0.2 s |
| Circuiti distribuzione (TT) | 1 s |

---

## PARTE 10 — FATTORI CORRETTIVI COMPLETI (CEI-UNEL 35024/1)

### 10.1 Fattore K1 — Temperatura ambiente

**Cavi PVC (Tmax=70°C):**
| Temp. °C | K1 |
|---|---|
| 10 | 1.22 |
| 15 | 1.17 |
| 20 | 1.12 |
| 25 | 1.06 |
| 30 | 1.00 |
| 35 | 0.94 |
| 40 | 0.87 |
| 45 | 0.79 |
| 50 | 0.71 |
| 55 | 0.61 |
| 60 | 0.50 |

**Cavi XLPE/EPR (Tmax=90°C):**
| Temp. °C | K1 |
|---|---|
| 10 | 1.15 |
| 15 | 1.12 |
| 20 | 1.08 |
| 25 | 1.04 |
| 30 | 1.00 |
| 35 | 0.96 |
| 40 | 0.91 |
| 45 | 0.87 |
| 50 | 0.82 |
| 55 | 0.76 |
| 60 | 0.71 |

### 10.2 Fattore K2 — Raggruppamento circuiti
| N. circuiti | Singolo strato | Fascio/tubi |
|---|---|---|
| 1 | 1.00 | 1.00 |
| 2 | 0.80 | 0.80 |
| 3 | 0.70 | 0.70 |
| 4 | 0.65 | 0.65 |
| 5 | 0.60 | 0.60 |
| 6 | 0.57 | 0.57 |
| 7 | 0.54 | 0.54 |
| 8 | 0.52 | 0.52 |
| 9 | 0.50 | 0.50 |
| 10-12 | 0.45 | 0.45 |
| 13-16 | 0.41 | 0.41 |
| 17-20 | 0.38 | 0.38 |

### 10.3 Metodi di posa (Tab.52C CEI 64-8)
| Metodo | Descrizione | Metodo rif. |
|---|---|---|
| A1 | Cavi unipolari in tubo incassato in parete isolante | A1 |
| A2 | Cavi multipolari in tubo incassato in parete isolante | A2 |
| B1 | Cavi unipolari in tubo su parete | B1 |
| B2 | Cavi multipolari in tubo su parete | B2 |
| C | Cavi unipolari/multipolari su parete (senza tubo) | C |
| D | Cavi interrati in tubo | D |
| E | Cavi multipolari in aria libera | E |
| F | Cavi unipolari in aria libera (a contatto) | F |
| G | Cavi unipolari in aria libera (distanziati) | G |

---

## PARTE 11 — CATALOGO GEWISS REALE (codici prodotto verificati)

### 11.1 Serie 90 MCB — Interruttori automatici modulari

**MTC Compatti (1 modulo per polo):**
- GW90001..GW90999 — 1P, B/C/D, 1-40A, 6kA
- Esempio: GW90006 = 1P C6A 6kA 1mod

**MT45/MT60 Standard:**
- GW92xxx — 1P/2P/3P/4P, B/C/D, 6-63A, 4.5-6kA
- Esempio: GW92006 = 1P+N C16A 6kA 2mod

**MT100 Alta Potenza:**
- GW93xxx — fino 63A, 10kA (EN60898) / 25kA (IEC60947-2)

### 11.2 Serie 90 RCD — Differenziali

**MDC Compatti (RCBO combinato):**
- GW94xxx — 1P+N, C, 6-32A, Idn 30/300mA, tipo AC/A/F, 2mod
- Esempio: GW94009 = 1P+N C25A tipo AC Idn=30mA 2mod

**IDP Puri (RCCB):**
- GW95xxx — 2P/4P, 25-100A, Idn 10-500mA, tipo AC/A/B/F
- Tipo B: per inverter FV e ricarica EV (obbligatorio CEI 64-8 Sez.722)

**90 ReStart (richiusura automatica):**
- Idoneo per impianti dove sgancio intempestivo causa problemi
- 2P/4P, 25-40A, 3 moduli DIN

### 11.3 Interruttori scatolati MSX
| Codice | Descrizione | In max | Icu |
|---|---|---|---|
| GWD9013 | MSX 160c 3P+N | 63A | 16kA |
| GWD9xxx | MSX 250 | 250A | 25kA |

Sgancio termico regolabile: Ir = 0.63 / 0.8 / 1 × In

### 11.4 Centralini di distribuzione
| Serie | Codice | Moduli | IP | Tipo |
|---|---|---|---|---|
| 40 CD | GW40xxx | 8-72 mod | IP40-IP65 | Superficie |
| 40 CDI | GW40xxx | 8-72 mod | IP40 | Incasso |
| CVX 160 | GW47xxx | 120-144 mod | IP43-IP65 | Quadro terminale |

### 11.5 Codici GEWISS per impianti tipo (residenziale standard)
```
Circuito luce 1P C10A 6kA:         GW92006 (o GW90xxx compatto)
Circuito prese 1P+N C16A 30mA:     GW94009 (RCBO compatto)
Differenziale generale 4P 63A 300mA: GW95xxx (IDP)
Interruttore generale 4P C32A 10kA: GW93xxx (MT100)
```

---

## PARTE 12 — FONTI DATI APERTE PER ROCCO

### 12.1 METEL — Listini prodotti elettrici italiani
- URL: https://listinipubblici.metel.it/
- Accesso: gratuito con registrazione
- Contenuto: 3.7+ milioni articoli, 500+ produttori incluso GEWISS
- Formato: testo a campi fissi (standard EDIFACT)
- Campi principali: codice articolo, descrizione, prezzo listino, unità misura, codice EAN, codice ETIM
- **GWPRICE importa direttamente listini METEL** → è il formato standard italiano

### 12.2 ETIM — Classificazione tecnica prodotti
- URL: https://etim.it/
- Licenza: Open Data Commons (uso libero)
- Struttura: Gruppi → Classi → Caratteristiche → Valori
- Export: CSV, Excel, Access
- Utile per ROCCO: classificare i prodotti per caratteristiche tecniche (In, curva, Idn, IP, ecc.)

### 12.3 Strumenti open source per calcolo elettrico
| Tool | Linguaggio | Licenza | Cosa implementa |
|---|---|---|---|
| pandapower | Python | BSD | Cortocircuito IEC 60909, power flow |
| Cablesizer | Python/Django | Open | Dimensionamento cavi IEC 60364-5-52 |
| GridCal | Python | LGPL | Power flow con GUI |
| OpenDSS | — | BSD | Simulazione reti distribuzione |

**Nota**: nessuno implementa specificamente CEI 64-8 italiana, ma CEI 64-8 ≈ IEC 60364 adattata, quindi le basi sono compatibili.

### 12.4 Gap critico — Curve di intervento interruttori
Le curve I²t degli interruttori **non esistono in formato aperto**.
Sono imprigionate nei binari proprietari (GWSoftware, Ampère di Electro Graphics).

**Workaround per ROCCO:**
- Usare la formula `I²t ≤ K²S²` (art. 434) che non richiede le curve
- Usare `Icc_max ≤ Icn_interruttore` (potere di interruzione da scheda tecnica)
- Per coordinamento selettivo avanzato: rimandare a software specifico (Ampère, ETAP)

---

## PARTE 13 — WORKFLOW GWSoftware → ROCCO

Il flusso di lavoro GWSoftware rispecchia esattamente quello che ROCCO deve implementare:
```
GW64-8       → ROCCO: definizione livello prestazionale (Base/Standard/Domotico)
GWCADpro     → ROCCO: non necessario (CAD grafico)
GWPRICE      → ROCCO: lista materiali con codici GEWISS/METEL
GW3708       → ROCCO: generazione dichiarazione conformità DM 37/08
GWENERGYpro  → ROCCO: configurazione quadro + schemi pre-cablaggio
GWCAP        → ROCCO: generazione capitolato appalto
PBT-Q/PROJEX → ROCCO: MOTORE CALCOLO (Ib, Iz, ΔV%, Icc, protezioni)
```

**Formati di export utili per integrazione futura:**
- GWDX → interscambio tra moduli (proprietario, non documentato)
- GW3708.mdb → Access, leggibile con pyodbc/mdbtools
- Export XLSX → da tutti i moduli
- Export PDF/RTF → documenti finali

---

*Patch v2 — Fonte: analisi GWSoftware (PBT-Q, PROJEX), sito GEWISS, manuali tecnici ufficiali, CEI-UNEL 35024/1, CEI 64-8*

---
## AGGIORNAMENTO v3 — LOGICA ROCCO INTELLIGENTE

### REGOLA 1 — Selezione automatica tipo differenziale

ROCCO deve scegliere automaticamente il tipo di differenziale in base al carico:
```
SE carico contiene [pompa calore, inverter, UPS, variatore velocità (VFD)]
  → Differenziale Tipo A  (AC + correnti pulsanti)
SE carico contiene [lavatrice, lavastoviglie, VFD trifase]
  → Differenziale Tipo F  (AC + pulsante + frequenza variabile)
SE carico contiene [wallbox, colonnina EV, ricarica veicolo elettrico]
  → Differenziale Tipo B  (obbligatorio CEI 64-8 Sez.722)
  → OBBLIGATORIO anche se il cliente non lo chiede
SE carico contiene [pannelli fotovoltaici, inverter FV]
  → Differenziale Tipo A o B  (dipende dall'inverter, verificare scheda tecnica)
ALTRIMENTI (luci, prese standard, riscaldamento resistivo)
  → Differenziale Tipo AC  (sufficiente)
```
Soglie Idn per applicazione:
```
30 mA  → protezione persone
         OBBLIGATORIO per: bagni, prese ≤20A uso generale, cantieri
300 mA → protezione incendi
         per circuiti dove Idn=30mA non è richiesto
500 mA / 1A → protezione impianto (grandi quadri)
```

---

### REGOLA 2 — Calcolo automatico sezione PE

ROCCO calcola automaticamente la sezione del conduttore di protezione:
```
SE sezione fase S ≤ 16 mm²:
  → PE = S (uguale alla fase)
SE 16 mm² < S ≤ 35 mm²:
  → PE = 16 mm²
SE S > 35 mm²:
  → PE = S / 2

Esempi pratici:
  Fase 1.5 mm² → PE 1.5 mm²
  Fase 2.5 mm² → PE 2.5 mm²
  Fase 4 mm²   → PE 4 mm²
  Fase 6 mm²   → PE 6 mm²
  Fase 10 mm²  → PE 10 mm²
  Fase 16 mm²  → PE 16 mm²
  Fase 25 mm²  → PE 16 mm²
  Fase 35 mm²  → PE 16 mm²
  Fase 50 mm²  → PE 25 mm²
  Fase 70 mm²  → PE 35 mm²
  Fase 95 mm²  → PE 50 mm²
  Fase 120 mm² → PE 70 mm²
```

---

### REGOLA 3 — Riconoscimento tipo locale → norma applicabile

ROCCO identifica il tipo di locale e applica automaticamente la norma specifica:
```
PAROLE CHIAVE → NORMA → REGOLE SPECIALI

"bagno" / "doccia" / "vasca"
  → CEI 64-8 Sezione 701
  → Zone 0/1/2 con distanze precise
  → IP minimo: Zona 0=IPX7, Zona 1=IPX5, Zona 2=IPX4
  → Differenziale 30mA OBBLIGATORIO per tutti i circuiti
  → VIETATO: interruttori e prese in Zona 0 e 1
  → Equipotenziale supplementare OBBLIGATORIO

"piscina" / "vasca idromassaggio" / "fontana"
  → CEI 64-8 Sezione 702
  → IP minimo IPX8 in zona 0
  → PELV obbligatorio in zona 0

"sauna" / "bagno turco"
  → CEI 64-8 Sezione 703
  → Temperatura ambiente fino a 125°C
  → Solo cavi adatti alle alte temperature

"garage" / "autorimessa" / "parcheggio"
  → CEI 64-8 Sezione 722 (se presente ricarica EV)
  → Differenziale Tipo B se presente wallbox
  → Circuito dedicato 32A per ogni wallbox

"cantiere" / "costruzione"
  → CEI 64-8 Sezione 704
  → Differenziale 30mA OBBLIGATORIO tutte le prese
  → Quadri EN 61439-4

"esterno" / "giardino" / "terrazza"
  → CEI 64-7
  → IP minimo IP44 per apparecchiature
  → Differenziale 30mA per tutte le prese esterne

"ufficio" / "negozio" / "commerciale"
  → CEI 64-8 standard + DM 37/08 progetto obbligatorio se >200m²
  → Valutare UPS per continuità

"ospedale" / "ambulatorio" / "studio medico"
  → CEI 64-8 Sezione 710
  → Gruppi IT medicali
  → Illuminazione emergenza obbligatoria

"cucina" / "zona cottura"
  → Circuiti dedicati: piano cottura (4-6kW), forno (2-3kW)
  → Sezione minima 4 mm² per piano cottura
  → Interruttore bipolare per piano cottura

"fotovoltaico" / "FV" / "solare"
  → CEI 82-25
  → Protezione lato DC separata
  → Inverter con certificazione CEI EN 62116
```

---

### REGOLA 4 — Selezione curva interruttore automatica

ROCCO seleziona la curva giusta in base al tipo di carico:
```
CARICO → CURVA CONSIGLIATA → MOTIVO

Luci, prese, riscaldamento resistivo
  → Curva B (3-5×In)
  → Bassa corrente di spunto

Uso generale, piccoli motori, carichi misti
  → Curva C (5-10×In)  ← default residenziale/commerciale
  → Corrente di spunto moderata

Motori, trasformatori, compressori, pompe
  → Curva D (10-20×In)
  → Alta corrente di spunto

Motori industriali ad alto momento di inerzia
  → Curva K (8-15×In)
  → Protezione ottimizzata motori

Circuiti elettronici, PLC, strumentazione
  → Curva Z (2-3×In)
  → Massima protezione dispositivi sensibili
```

---

### REGOLA 5 — Calcolo dotazioni minime residenziali (CEI 64-8 Cap.37)

ROCCO calcola automaticamente le dotazioni minime per appartamenti:
```
INPUT: superficie appartamento in m²

CALCOLO PUNTI LUCE minimi:
  Ogni locale: minimo 1 punto luce
  Soggiorno >14m²: 2 punti luce
  Cucina: 1 punto luce + presa cappa

CALCOLO PRESE minime per locale:
  Corridoio ≤5m²: 1 presa
  Corridoio >5m²: 2 prese
  Bagno: 1 presa (Zona 2, min 0.6m dalla vasca)
  Camera singola: 4 prese (CEI 64-8 livello base)
  Camera doppia: 6 prese
  Soggiorno ≤30m²: 6 prese
  Soggiorno >30m²: 8 prese
  Cucina: 4 prese + 1 presa dedicata frigo + 1 lavastoviglie

LIVELLI PRESTAZIONALI (Capitolo 37):
  ★   Base:     dotazioni minime norma
  ★★  Standard: +30% punti presa, predisposizioni domotica
  ★★★ Comfort:  domotica integrata, gestione energetica

CIRCUITI DEDICATI obbligatori o consigliati:
  - Piano cottura:      1 circuito dedicato 4mm² / 32A curva C
  - Forno:              1 circuito dedicato 2.5mm² / 16A curva C
  - Lavatrice:          1 circuito dedicato 2.5mm² / 16A curva C
  - Lavastoviglie:      1 circuito dedicato 2.5mm² / 16A curva C
  - Frigorifero:        1 circuito dedicato 2.5mm² / 16A curva C
  - Boiler/scaldabagno: 1 circuito dedicato 2.5-4mm² / 16-20A
  - Condizionatore:     1 circuito dedicato 2.5-4mm² / 16-20A
  - Wallbox EV:         1 circuito dedicato 6mm² / 32A curva C + diff. Tipo B
```

---

### REGOLA 6 — Verifica automatica conformità DM 37/08

ROCCO verifica automaticamente se serve il progetto firmato:
```
QUANDO è obbligatorio il progetto firmato da professionista iscritto all'albo?

Unità abitativa singola:
  SE potenza > 6 kW  → progetto OBBLIGATORIO
  SE superficie > 400 m² → progetto OBBLIGATORIO
  ALTRIMENTI → firma responsabile tecnico impresa sufficiente

Attività commerciale/industriale:
  SE potenza > 6 kW  → progetto OBBLIGATORIO
  SE superficie > 200 m² → progetto OBBLIGATORIO

SEMPRE obbligatorio (indipendentemente da potenza/superficie):
  - Condomini
  - Luoghi medici (ambulatori, studi dentistici)
  - Ambienti a rischio esplosione (ATEX)
  - Protezione contro i fulmini (LPS)
  - Impianti di terra di nuova realizzazione

Dichiarazione di Conformità (DiCo) SEMPRE obbligatoria per:
  - Nuovi impianti
  - Ampliamenti
  - Manutenzione straordinaria
  NB: non obbligatoria per manutenzione ordinaria
```

---

### REGOLA 7 — Logica diagnostica completa ROCCO

Sequenza domande che ROCCO deve fare all'utente:
```
STEP 1 — Identificazione impianto
  Q: "Tipo di intervento?" → nuovo / ampliamento / manutenzione straordinaria
  Q: "Tipo di locale?" → residenziale / commerciale / industriale / speciale
  Q: "Superficie?" → per verifica obbligo progetto firmato
  Q: "Potenza totale prevista (kW)?" → per verifica obbligo progetto

STEP 2 — Parametri elettrici
  Q: "Sistema di distribuzione?" → TT (default Italia residenziale) / TN-S / IT
  Q: "Tensione nominale?" → 230V monofase / 400V trifase
  Q: "Corrente disponibile dal contatore (A)?" → 3/4.5/6/10/16/25/32A

STEP 3 — Carichi
  Q: "Elenca i carichi principali con potenza"
  → ROCCO calcola Ib per ogni circuito
  → ROCCO identifica automaticamente carichi speciali (EV, motori, ecc.)

STEP 4 — Ambiente
  Q: "Temperatura massima ambiente?" → per fattore K1
  Q: "Tipo di posa cavi?" → tubo incassato / aria libera / interrato
  Q: "Numero circuiti in parallelo?" → per fattore K2

STEP 5 — Output automatico
  → Sezioni cavi per ogni circuito
  → Tipo e taglia interruttore per ogni circuito
  → Tipo e soglia differenziale per ogni circuito
  → Sezione conduttore PE
  → Verifica caduta di tensione totale
  → Checklist DM 37/08 (42+8 verifiche)
  → Indica se serve progetto firmato
```

---

*Patch v3 — Logica ROCCO intelligente: selezione automatica componenti e riconoscimento contesto*
