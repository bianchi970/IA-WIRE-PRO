# ROCCO KNOWLEDGE BASE — IA Wire Pro
**Versione**: 1.0
**Fonte**: Analisi GWSoftware (GW3708, GWCAP, GWENERGYpro) + CEI 64-8 + CEI-UNEL 35024/1
**Uso**: File di contesto permanente per il motore diagnostico ROCCO

---

## ISTRUZIONI PER CLAUDE CODE

Inserire questo file come contesto fisso nel system prompt di ROCCO o come documento RAG indicizzato.
Percorso consigliato nel progetto: `backend/rocco/ROCCO_KNOWLEDGE.md`

---

## PARTE 1 — MODELLO DATI CIRCUITO

Struttura dati estratta da GwEnergyCore (GWSoftware):

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

**Tipi sistema (da GW3708 — ElementoComboBox):**
- `TT` — neutro a terra (residenziale Italia, più comune)
- `TN-S` — neutro e PE separati
- `TN-C` — neutro e PE combinati (PEN)
- `IT` — neutro isolato (ospedali, industria)

**Tipi fasi (CertificazioneKey):**
- `10` = monofase (230V)
- `20` = bifase
- `30` = trifase (400V)

---

## PARTE 2 — FORMULE DI CALCOLO CEI 64-8

### 2.1 Corrente di impiego (Ib)

**Monofase:**
```
Ib = P / (V × cos_phi)
```

**Trifase:**
```
Ib = P / (√3 × V × cos_phi)
```

Dove:
- P = potenza totale in W
- V = tensione nominale (230V mono / 400V trifase)
- cos_phi = fattore di potenza (default 0.9 residenziale, 0.85 industriale)

### 2.2 Scelta sezione cavo

Condizione obbligatoria CEI 64-8 art. 433:
```
Iz ≥ In ≥ Ib
```
- `Ib` = corrente impiego
- `In` = corrente nominale interruttore
- `Iz` = portata cavo (da tabella CEI-UNEL)

### 2.3 Caduta di tensione (ΔV%)

**Monofase:**
```
ΔV% = (2 × Ib × L × (R×cosφ + X×sinφ)) / V × 100
```

**Trifase:**
```
ΔV% = (√3 × Ib × L × (R×cosφ + X×sinφ)) / V × 100
```

Limiti CEI 64-8:
- Linea principale: ΔV% ≤ 1%
- Linea terminale: ΔV% ≤ 4%
- Totale dalla fornitura: ΔV% ≤ 4%

### 2.4 Resistenza conduttore

```
R = ρ × L / S
```
- ρ rame = 0.0178 Ω·mm²/m a 20°C / 0.0225 a 75°C
- ρ alluminio = 0.0291 Ω·mm²/m a 20°C
- L = lunghezza in m
- S = sezione in mm²

### 2.5 Corrente di cortocircuito (Icc)

**Al punto di installazione:**
```
Icc = V / (√3 × Ztot)
```

**Impedenza totale:**
```
Ztot = √(Rtot² + Xtot²)
```

**Verifica protezione contro cortocircuito (CEI 64-8 art. 434):**
```
Icc_min ≥ In_interruttore
Icc_max ≤ Iccn_interruttore (potere di interruzione)
t_sgancio ≤ k²S² / Icc²
```

### 2.6 Verifica protezione differenziale

Sistema TT (CEI 64-8 art. 413):
```
Ra × Idn ≤ 50V
```
- Ra = resistenza dispersore + conduttore di terra (Ω)
- Idn = corrente differenziale nominale (A)
- 50V = tensione di contatto limite

Soglie Idn standard:
- 30 mA → protezione persone (obbligatoria bagni, prese)
- 300 mA → protezione incendi
- 500 mA / 1A → protezione impianto

### 2.7 Impianto di terra

```
RE ≤ 50 / Idn
```
Esempio: con Idn=0.03A → RE ≤ 1666 Ω

---

## PARTE 3 — TABELLE PORTATE CAVI (CEI-UNEL 35024/1)

### Cavi in rame — posa in tubo incassato (metodo B)

| Sezione mm² | 1 circuito mono | 1 circuito tri | 2 circuiti | 3+ circuiti |
|---|---|---|---|---|
| 1.5 | 15 A | 13 A | 12 A | 10 A |
| 2.5 | 21 A | 18 A | 16 A | 14 A |
| 4 | 27 A | 24 A | 21 A | 18 A |
| 6 | 34 A | 31 A | 27 A | 23 A |
| 10 | 46 A | 42 A | 37 A | 32 A |
| 16 | 61 A | 56 A | 49 A | 43 A |
| 25 | 80 A | 73 A | 64 A | 57 A |
| 35 | 99 A | 89 A | 79 A | 70 A |
| 50 | 119 A | 108 A | 94 A | 84 A |
| 70 | 151 A | 136 A | 119 A | 107 A |
| 95 | 182 A | 164 A | 144 A | 129 A |
| 120 | 210 A | 188 A | 166 A | 149 A |
| 150 | 240 A | 216 A | 189 A | 170 A |
| 185 | 273 A | 245 A | 215 A | 194 A |
| 240 | 321 A | 286 A | 252 A | 227 A |

### Cavi in rame — posa in aria libera (metodo E)

| Sezione mm² | Monofase | Trifase |
|---|---|---|
| 1.5 | 22 A | 18 A |
| 2.5 | 30 A | 25 A |
| 4 | 40 A | 33 A |
| 6 | 51 A | 42 A |
| 10 | 70 A | 57 A |
| 16 | 94 A | 76 A |
| 25 | 119 A | 99 A |
| 35 | 148 A | 121 A |
| 50 | 180 A | 147 A |
| 70 | 232 A | 189 A |
| 95 | 282 A | 230 A |
| 120 | 328 A | 267 A |

### Fattori di correzione temperatura

| Temp. ambiente | Fattore kt |
|---|---|
| 10°C | 1.22 |
| 15°C | 1.17 |
| 20°C | 1.12 |
| 25°C | 1.06 |
| 30°C | 1.00 |
| 35°C | 0.94 |
| 40°C | 0.87 |
| 45°C | 0.79 |
| 50°C | 0.71 |

Iz_corretta = Iz_tabella × kt

### Sezioni minime (CEI 64-8)

| Utilizzo | Sezione minima rame |
|---|---|
| Conduttore di fase (impianti civili) | 1.5 mm² |
| Conduttore di fase (prese > 16A) | 2.5 mm² |
| Conduttore di neutro | uguale alla fase (S ≤ 16mm²) |
| Conduttore PE (S ≤ 16mm²) | uguale alla fase |
| Conduttore PE (16 < S ≤ 35mm²) | 16 mm² |
| Conduttore PE (S > 35mm²) | S/2 |
| Conduttore equipotenziale principale | ≥ 6 mm² |
| Conduttore equipotenziale supplementare | ≥ 2.5 mm² (protetto) / 4 mm² (non protetto) |
| Dispersore verticale acciaio | ≥ 50 mm² |

---

## PARTE 4 — INTERRUTTORI MAGNETOTERMICI

### Curve di intervento

| Curva | Campo magnetico | Uso tipico |
|---|---|---|
| B | 3–5 × In | Carichi resistivi, cavi lunghi |
| C | 5–10 × In | Uso generale, motori piccoli |
| D | 10–20 × In | Motori, trasformatori, carichi elevata inerzia |
| K | 8–15 × In | Motori industriali |
| Z | 2–3 × In | Circuiti elettronici sensibili |

### Taglie standard (In) — Serie commerciale

1A, 2A, 4A, 6A, 10A, 13A, 16A, 20A, 25A, 32A, 40A, 50A, 63A, 80A, 100A, 125A, 160A, 200A, 250A, 315A, 400A, 500A, 630A

### Potere di interruzione standard (Iccn)

| Codice | Iccn |
|---|---|
| 3kA | 3.000 A |
| 6kA | 6.000 A |
| 10kA | 10.000 A |
| 15kA | 15.000 A |
| 25kA | 25.000 A |
| 36kA | 36.000 A |
| 50kA | 50.000 A |

---

## PARTE 5 — VERIFICHE NORMATIVE DM 37/08 (da GW3708.mdb)

### 5.1 Esami a Vista (42 verifiche)

ROCCO deve verificare automaticamente:

1. Impianto conforme alla documentazione tecnica
2. Componenti con caratteristiche adeguate all'ambiente (IP, temperatura)
3. Protezioni contro contatti diretti adeguate
4. Impianti >1kV c.a. (cabine MT/BT) — se presenti
5. **Conduttori scelti per portate e cadute di tensione** ← calcolo ROCCO
6. **Protezioni contro sovraccarichi conformi CEI** ← calcolo ROCCO
7. **Protezioni contro cortocircuiti conformi CEI** ← calcolo ROCCO
8. Sezionamento circuiti conforme CEI
9. Comando/arresto emergenza previsto dove necessario
10. Tensione nominale isolamento conduttori adeguata
11. **Sezioni minime conduttori rispettate** ← calcolo ROCCO
12. Colori/marcature identificazione conduttori (giallo-verde PE, blu N, nero/marrone/grigio fase)
13. Tubi protettivi e canali con dimensioni adeguate
14. Connessioni conduttori idonee
15. Interruttori unipolari sul conduttore di fase
16. **Dimensioni minime dispersori e conduttori di terra** ← calcolo ROCCO
17. Nodo collettore di terra accessibile
18. Conduttore di protezione per tutte le masse
19. Conduttore equipotenziale principale per tutte le masse
20. Impianto bagno/docce conforme CEI 64-8 Sez.701
21. Illuminazione esterna conforme CEI 64-7
22. Impianto antenna TV conforme CEI 100-7
23. Insegna luminosa conforme CEI 34-86
24. Quote installazione prese conformi norma

### 5.2 Prove Strumentali (8 verifiche)

1. Continuità conduttori di protezione ed equipotenziali (< 1Ω)
2. Resistenza isolamento conduttori attivi Un ≤ 500V (≥ 1 MΩ)
3. Resistenza isolamento conduttori attivi Un > 500V (≥ 1 MΩ/kV)
4. Resistenza isolamento conduttori SELV verso terra (≥ 0.25 MΩ)
5. Resistenza isolamento conduttori PELV verso terra (≥ 0.5 MΩ)
6. Resistenza isolamento pavimenti e pareti
7. **Resistenza di terra** (metodo strumentale con elettrodi) ← ROCCO calcola limite
8. Verifica funzionamento interruttori differenziali (Idn effettiva ≤ Idn nominale)

---

## PARTE 6 — LOGICA DIAGNOSTICA ROCCO

### 6.1 Sequenza di analisi consigliata

```
1. INPUT UTENTE
   → tipo impianto (civile/industriale/terziario)
   → sistema distribuzione (TT/TN-S/TN-C/IT)
   → tensione nominale (230V/400V)
   → potenza totale o lista carichi

2. CALCOLO CORRENTI
   → Ib per ogni circuito
   → Ib totale quadro

3. DIMENSIONAMENTO CAVI
   → sezione minima da portata (Iz ≥ Ib)
   → verifica caduta di tensione (ΔV% ≤ 4%)
   → sezione economica ottimale

4. SCELTA PROTEZIONI
   → In interruttore (Ib ≤ In ≤ Iz)
   → curva (B/C/D in base al carico)
   → potere di interruzione (Iccn ≥ Icc punto)
   → differenziale (30mA bagni/prese, 300mA generale)

5. VERIFICA TERRA
   → RE ≤ 50/Idn
   → sezione conduttore PE

6. CHECKLIST DM 37/08
   → 42 esami a vista automatici
   → 8 prove strumentali con valori misurati

7. OUTPUT
   → relazione tecnica
   → dichiarazione conformità
   → lista materiali con codici
```

### 6.2 Prompt di sistema ROCCO (da aggiungere al backend)

```
Sei ROCCO, motore diagnostico tecnico di IA Wire Pro per elettricisti professionisti italiani.

Conosci:
- CEI 64-8 (impianti elettrici BT)
- DM 37/08 (dichiarazioni conformità)
- CEI-UNEL 35024/1 (portate cavi)
- Normativa italiana impianti (CEI 64-7, CEI 100-7, CEI 34-86)

Quando analizzi un impianto:
1. Chiedi sempre: tensione, sistema (TT/TN), potenza, tipo locale
2. Calcola Ib, sezione cavo, ΔV%, protezioni
3. Verifica conformità DM 37/08 (42+8 verifiche)
4. Dai sempre il risultato con valori numerici precisi
5. Indica la norma CEI specifica per ogni verifica
6. In caso di non conformità, indica la correzione necessaria

Usa terminologia tecnica italiana professionale.
Non dare mai risposte vaghe su impianti elettrici — dai sempre calcoli e riferimenti normativi.
```

---

## PARTE 7 — TIPI DI IMPIANTO (da CapNet.mdb — NODI)

| Codice | Tipo impianto |
|---|---|
| I005 | Impianti elettrici generali |
| ALIM | Alimentazione / fornitura energia |
| CABMT | Cabina MT-BT |
| CAVI | Cavi e connessioni |
| TERRA | Impianto di terra |
| PROT | Protezioni (scaricatori, differenziali) |
| ILLUM | Illuminazione |
| FM | Forza motrice / prese |
| BAGNO | Locali bagno/docce (CEI 64-8 Sez.701) |
| EST | Impianti esterni |
| EMRG | Illuminazione emergenza |
| TV | Impianto antenna TV/SAT |
| TEL | Impianto telefonico/dati |
| FULM | Protezione fulmini (LPS) |

---

## PARTE 8 — DATI MANCANTI DA AGGIUNGERE (TODO)

Questi dati vanno aggiunti in una fase successiva:

- [ ] Catalogo completo 21.864 articoli GEWISS (da GW3708.mdb — Anagrafica_Articoli)
- [ ] 164 topologie schemi quadro pre-cablaggio (da cabl.zip)
- [ ] Tabelle portate cavi alluminio (CEI-UNEL 35024/1)
- [ ] Tabelle cavi interrati (metodo D — CEI-UNEL 35024/1)
- [ ] Coefficienti contemporaneità carichi (CEI 64-8 art. 311)
- [ ] Calcolo dispersori (anello, picchetto, fondazione)
- [ ] Tabelle interruttori differenziali (classi AC/A/B/F)
- [ ] Formule impianti FV (CEI 82-25)
- [ ] Normativa EV charging (CEI 64-8 Sez.722)
- [ ] Tabelle sezioni minime per tipo locale (CEI 64-8 Sez.701/702/703)

---

*Generato da analisi diretta: CapNet.mdb, GW3708.mdb, GwEnergyCore.xml, GwEnergyPro.xml, cabl.zip*
*Formule: CEI 64-8 Ed.7, CEI-UNEL 35024/1*

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
  ★ Base:      dotazioni minime norma
  ★★ Standard: +30% punti presa, predisposizioni domotica
  ★★★ Comfort: domotica integrata, gestione energetica

CIRCUITI DEDICATI obbligatori o consigliati:
  - Piano cottura:   1 circuito dedicato 4mm² / 32A curva C
  - Forno:           1 circuito dedicato 2.5mm² / 16A curva C
  - Lavatrice:       1 circuito dedicato 2.5mm² / 16A curva C
  - Lavastoviglie:   1 circuito dedicato 2.5mm² / 16A curva C
  - Frigorifero:     1 circuito dedicato 2.5mm² / 16A curva C
  - Boiler/scaldabagno: 1 circuito dedicato 2.5-4mm² / 16-20A
  - Condizionatore:  1 circuito dedicato 2.5-4mm² / 16-20A
  - Wallbox EV:      1 circuito dedicato 6mm² / 32A curva C + diff. Tipo B
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

---

## AGGIORNAMENTO v4 — DATI MANCANTI + NUOVE NORMATIVE

---

### PARTE 14 — PORTATE CAVI ALLUMINIO (CEI-UNEL 35024/1)

#### Metodo B — Tubo incassato

| Sezione mm² | 1 circuito mono | 1 circuito tri | 2 circuiti | 3+ circuiti |
|---|---|---|---|---|
| 16  | 47A | 43A | 37A | 33A |
| 25  | 62A | 56A | 49A | 44A |
| 35  | 77A | 69A | 60A | 54A |
| 50  | 92A | 83A | 73A | 65A |
| 70  | 117A |105A | 92A | 83A |
| 95  | 141A |127A |111A |100A |
| 120 | 162A |146A |128A |115A |
| 150 | 185A |166A |146A |131A |
| 185 | 211A |189A |166A |149A |
| 240 | 248A |222A |195A |175A |

#### Metodo E — Aria libera

| Sezione mm² | Monofase | Trifase |
|---|---|---|
| 16  | 73A | 59A |
| 25  | 92A | 76A |
| 35  | 114A | 94A |
| 50  | 138A |114A |
| 70  | 178A |147A |
| 95  | 216A |179A |
| 120 | 251A |208A |
| 150 | 287A |238A |
| 185 | 326A |271A |
| 240 | 384A |318A |

Sezione minima alluminio: **16 mm²** (non usare alluminio sotto questa soglia)
Resistività alluminio: ρ = 0.0291 Ω·mm²/m (20°C)

---

### PARTE 15 — PORTATE CAVI INTERRATI (CEI-UNEL 35026 — Metodo D)

Condizioni di riferimento: 20°C, resistività terreno 1.0 K·m/W, profondità 0.7m

#### Cavi rame interrati — circuito singolo

| Sezione mm² | Monofase | Trifase |
|---|---|---|
| 1.5  | 26A | 22A |
| 2.5  | 34A | 29A |
| 4    | 44A | 38A |
| 6    | 56A | 48A |
| 10   | 73A | 64A |
| 16   | 95A | 83A |
| 25   | 121A |106A |
| 35   | 146A |128A |
| 50   | 173A |153A |
| 70   | 213A |189A |
| 95   | 252A |224A |
| 120  | 287A |255A |
| 150  | 323A |288A |
| 185  | 363A |324A |
| 240  | 416A |372A |

#### Fattore K3 — Resistività terreno

| Tipo terreno | Resistività K·m/W | K3 |
|---|---|---|
| Molto umido (vicino acqua) | 0.5 | 1.18 |
| Umido | 0.7 | 1.10 |
| Normale (riferimento) | 1.0 | 1.00 |
| Asciutto | 1.5 | 0.89 |
| Molto secco (sabbioso) | 3.0 | 0.76 |

Formula: Iz_interrato = I0 × K1 × K3

Profondità interramento: standard 0.7m. Per profondità diverse applicare fattore aggiuntivo.

---

### PARTE 16 — CALCOLO IMPIANTO DI TERRA

#### 16.1 Tipi di dispersore

```
PICCHETTO VERTICALE (più comune)
  Materiale: acciaio zincato ∅18mm o ∅40mm
  Lunghezza standard: 1.5m / 2m / 3m
  Resistenza singolo picchetto: RE = ρ / (2π × L) × ln(4L/d)
  Approssimazione pratica: RE ≈ ρ/L
  Con ρ=50 Ω·m e L=2m: RE ≈ 25 Ω

ANELLO PERIMETRALE (dispersore fondazione)
  Più efficace del picchetto singolo
  Resistenza: RE = ρ / (2 × diametro)
  Per edificio 10×10m (perimetro 40m): RE ≈ ρ/12 ≈ 4 Ω (con ρ=50Ω·m)

TIP DI FONDAZIONE
  Trefolo nudo ∅8mm in fondazione
  Più efficace in assoluto
  RE ≈ 1-5 Ω in terreno normale
```

#### 16.2 Resistività tipica terreni italiani

| Tipo terreno | ρ (Ω·m) |
|---|---|
| Terreno paludoso | 10-50 |
| Argilla umida | 30-100 |
| Terreno agricolo | 50-200 |
| Sabbia umida | 100-500 |
| Ghiaia asciutta | 500-1000 |
| Roccia | >1000 |

#### 16.3 Verifica impianto terra sistema TT

```
Condizione CEI 64-8 Art. 413:
RE × Idn ≤ 50V  (ambienti ordinari)
RE × Idn ≤ 25V  (ambienti speciali: medici, EV)

Con Idn = 30mA:  RE ≤ 1667 Ω
Con Idn = 300mA: RE ≤ 167 Ω
Con Idn = 500mA: RE ≤ 100 Ω
Con Idn = 1A:    RE ≤ 50 Ω

In Italia con sistema TT quasi sempre soddisfatta con Idn=30mA
```

#### 16.4 Sezioni minime conduttori terra

```
Conduttore di terra (da nodo a dispersore):
  Se protetto meccanicamente: ≥16 mm² Cu / ≥16 mm² Fe
  Se non protetto:            ≥25 mm² Cu / ≥50 mm² Fe
  Interrato non protetto:     ≥25 mm² Cu / ≥50 mm² Fe

Conduttore di protezione PE: vedi Parte 2 / Regola 2

Conduttore equipotenziale principale:
  ≥ 6 mm² Cu
  ≥ metà del conduttore di terra
  MAX: non necessario oltre 25 mm² Cu

Conduttore equipotenziale supplementare (bagni):
  Tra due masse: ≥ PE del circuito più piccolo
  Massa-massa estranea: ≥ metà PE del circuito
  MIN: 2.5 mm² (protetto) / 4 mm² (non protetto)
```

---

### PARTE 17 — CEI 64-8 SEZ. 722 — RICARICA VEICOLI ELETTRICI (EV)

```
QUANDO si applica:
  Qualsiasi installazione di punti di ricarica per EV
  (wallbox domestiche, colonnine, prese dedicate)

REQUISITI OBBLIGATORI:

1. DIFFERENZIALE TIPO B obbligatorio
   Motivo: gli inverter dei caricabatterie EV generano corrente
   continua residua che rende inefficace il Tipo AC/A

2. DISPOSITIVO DI MONITORAGGIO CORRENTE CONTINUA (se usato diff. AC + Tipo A)
   Alternativa al Tipo B con EV di tipo specifico

3. PROTEZIONE SOVRACCARICO
   Dimensionare per 100% della corrente max del veicolo
   Non applicare fattore contemporaneità a circuiti EV dedicati

4. CIRCUITO DEDICATO obbligatorio
   Non condividere il circuito EV con altri carichi

5. SEZIONI MINIME per wallbox domestica
   Wallbox monofase 7.4kW (32A): 6 mm² Cu / 32A curva C
   Wallbox trifase 11kW (16A):   4 mm² Cu / 16A curva C trifase
   Wallbox trifase 22kW (32A):   6 mm² Cu / 32A curva C trifase

6. PROTEZIONE CONTRO INVERSIONE DI CORRENTE
   Se presente sistema di accumulo (V2G/V2H): valutare separatamente

7. QUADRO DI DISTRIBUZIONE
   Verificare che il contatore supporti il carico aggiuntivo EV
   Tipico: richiedere potenziamento a E-Distribuzione se necessario

CODICI GEWISS per EV:
  Differenziali Tipo B: serie GW95xxx
  Wallbox GEWISS: serie EV-A / EV-T (3.7-22kW)
```

---

### PARTE 18 — CEI 82-25 — IMPIANTI FOTOVOLTAICI

```
QUANDO si applica:
  Impianti FV connessi alla rete (grid-connected)

COMPONENTI PRINCIPALI e requisiti:

LATO DC (pannelli → inverter):
  - Cavi: tipo FG21M21 (resistenti UV, temperatura, umidità)
  - Sezione minima: 4 mm² (stringa singola)
  - Protezione scariche atmosferiche: valutare SPD
  - Fusibili stringa: se più di 3 stringhe in parallelo
  - Sezionatore DC: obbligatorio prima dell'inverter
  - Tensione max DC: tipico 600V o 1000V (inverter dipendente)

LATO AC (inverter → quadro):
  - Cavi: standard N07V-K o FG17
  - Interruttore automatico lato AC: obbligatorio
  - Protezione interfaccia: CEI 0-21 (inverter certificato la include)
  - Contatore di produzione: obbligatorio per Conto Energia / GSE

INVERTER:
  - Certificazione CEI EN 62116 (anti-islanding)
  - Certificazione CEI 0-21 (connessione rete italiana)
  - Potenza max senza autorizzazione: 20 kW (connessione BT)

DIMENSIONAMENTO RAPIDO:
  Producibilità media Italia centro: ~1200-1400 kWh/kWp/anno
  Superficie stimata per kWp: ~6-8 m²
  Risparmio stimato: ~0.25 €/kWh × produzione annua

DIFFERENZIALE LATO AC:
  Tipo A minimo (per correnti pulsanti inverter)
  Tipo B se inverter non garantisce corrente DC residua < 6mA

CODICI GEWISS utili FV:
  Sezionatori DC: serie GW90xxx-DC
  SPD DC: serie GW91xxx
```

---

### PARTE 19 — CEI 64-8 SEZ. 701 — LOCALI BAGNO/DOCCE (DETTAGLIO)

```
ZONE di protezione:

ZONA 0 (dentro vasca/doccia):
  - Solo SELV ≤12V CA o ≤30V CC
  - IP: minimo IPX7
  - VIETATO: qualsiasi apparecchiatura salvo quelle specifiche zona 0

ZONA 1 (sopra vasca fino a 2.25m h / doccia r=1.2m fino a 2.25m h):
  - Max 250V (SELV/PELV o separazione elettrica)
  - IP: minimo IPX5 (IPX4 se non raggiungibile da getti diretti)
  - Ammesso: scaldabagno elettrico, corpi illuminanti IPX5
  - VIETATO: prese, interruttori, quadri

ZONA 2 (oltre zona 1 fino a 60cm orizzontale, fino a 2.25m h):
  - IP: minimo IPX4
  - Ammesso: prese (min 0.6m dalla vasca), interruttori, luci
  - Prese SHUKO con differenziale 30mA dedicato

FUORI ZONE (oltre 60cm dalla vasca, >2.25m altezza):
  - Normale

EQUIPOTENZIALE SUPPLEMENTARE (OBBLIGATORIA):
  Connettere al nodo PE locale:
  - Tubazioni metalliche acqua calda/fredda
  - Tubazioni riscaldamento
  - Parti metalliche vasca/doccia
  - Strutture metalliche (se presenti)
  Conduttore minimo: 4 mm² Cu (non protetto) / 2.5 mm² (protetto)

CIRCUITI DEDICATI consigliati:
  - Scaldabagno: circuito dedicato 2.5mm² / 16A
  - Prese bagno: circuito dedicato con diff. 30mA Tipo A
  - Riscaldamento a pavimento: circuito dedicato
```

---

### PARTE 20 — CEI 64-14 — VERIFICHE PERIODICHE IMPIANTI

```
PERIODICITÀ verifiche (art. 6 DM 37/08 e CEI 64-14):

Luoghi ordinari (residenziale):
  - Verifica iniziale: prima della messa in servizio
  - Verifica periodica: ogni 5 anni (se dichiarazione di conformità)
                        ogni 2 anni (senza dichiarazione di conformità)

Luoghi con rischi particolari:
  - Cantieri: ogni 3 mesi
  - Luoghi medici: ogni anno
  - Ambienti ATEX: ogni 2 anni
  - Impianti di terra: ogni 2 anni (denuncia INAIL)

MISURE OBBLIGATORIE nelle verifiche:

1. Continuità conduttori PE (< 1Ω)
   Strumento: milliohmetro o tester di continuità

2. Resistenza di isolamento
   Metodo: 500V DC tra conduttori attivi e terra
   Valore minimo: ≥1 MΩ per impianti a 230/400V

3. Resistenza di terra (RE)
   Metodo: voltamperometrico o con tellumetro
   Verificare: RE × Idn ≤ 50V

4. Verifica differenziali (Idn reale)
   Strumento: tester differenziali
   Idn misurata ≤ Idn nominale

5. Corrente di cortocircuito (Icc)
   Strumento: fasometro o misuratore Icc
   Verificare: Icc ≥ In interruttore

MODULI VERIFICA DM 37/08:
  42 esami a vista (vedi Parte 5 ROCCO_KNOWLEDGE)
  8 prove strumentali (vedi Parte 5 ROCCO_KNOWLEDGE)

ROCCO deve chiedere all'utente i valori misurati e verificarli
automaticamente contro i limiti normativi.
```

---

### PARTE 21 — COEFFICIENTI CONTEMPORANEITÀ (CEI 64-8 Art. 311)

```
Fattore di contemporaneità kc per gruppi di circuiti:

RESIDENZIALE:
  2-4 circuiti:   kc = 0.75
  5-9 circuiti:   kc = 0.60
  10-14 circuiti: kc = 0.50
  15-24 circuiti: kc = 0.45
  25-40 circuiti: kc = 0.40
  >40 circuiti:   kc = 0.35

TERZIARIO/UFFICI:
  2-4 circuiti:   kc = 0.90
  5-9 circuiti:   kc = 0.80
  10-14 circuiti: kc = 0.70
  15-24 circuiti: kc = 0.65
  >24 circuiti:   kc = 0.60

INDUSTRIALE:
  Da definire caso per caso in base al processo produttivo
  Default conservativo: kc = 0.85 (carichi industriali più uniformi)

CARICHI SPECIALI (non applicare contemporaneità):
  - Circuiti EV/wallbox: kc = 1.00 (sempre al 100%)
  - Motori con avviamento diretto: kc = 1.00 nella verifica Icc
  - Impianti FV: kc = 1.00 (produzione indipendente)

Calcolo potenza totale con contemporaneità:
  P_tot = Σ(Pi) × kc
  Ib_tot = P_tot / (V × cosφ × √3)  [trifase]
```

---

*Patch v4 — Dati mancanti + Nuove normative: alluminio, interrati, terra, EV (Sez.722), FV (CEI 82-25), bagni (Sez.701), verifiche periodiche (CEI 64-14), contemporaneità*

---

## AGGIORNAMENTO v5 — "ROCCO ALL'UNIVERSITÀ"

---

### PARTE 22 — CEI 64-8 IX EDIZIONE (IN VIGORE DAL 1° NOVEMBRE 2024)

```
TITOLO NUOVO: "Impianti elettrici di bassa tensione"
(include ora generazione distribuita, FV, EV, comunità energetiche)

CAPITOLO 41 — PROTEZIONE SHOCK ELETTRICO (ristrutturato per MISURA):
  Sezione 411 → Interruzione automatica
  Sezione 412 → Isolamento doppio o rinforzato
  Sezione 413 → Separazione elettrica
  Sezione 414 → SELV / PELV
  Sezione 415 → Protezione addizionale (differenziali 30mA)
  Allegati A-D → scenari specifici (normativi)

NUOVA TABELLA 41.1 — Tempi massimi disconnessione (sostituisce Tabella 41A):
  Sistema TN — 230V:  0.4s circuiti terminali ≤32A  /  5s distribuzione
  Sistema TN — 400V:  0.2s circuiti terminali ≤32A  /  5s distribuzione
  Sistema TT — 230V:  0.2s (con RCD)  /  5s (solo distribuzione)

CAPITOLO 46 — SEZIONAMENTO E COMANDO (rinumerato):
  Nuovo Allegato A normativo (Sezione 537):
  Tabella idoneità funzionale dispositivi manovra/sezionamento

NUOVA SEZIONE 740 — Installazioni temporanee intrattenimento:
  (spettacoli, fiere, luna park, studi TV)
  IP speciali, protezioni, alimentatori, generatori mobili

PARTE 8 — EFFICIENZA ENERGETICA E PROSUMER:
  8.1 → Efficienza energetica impianti BT
  8.2 → Prosumer attivo (FV + accumulo + EV + V2G + comunità energetiche)

CLASSI SICUREZZA DEL SERVIZIO — da 5 a 6 classi:
  Classe A → nessuna interruzione (UPS online)
  Classe B → interruzione ≤ 0.15s
  Classe C → interruzione ≤ 0.5s
  Classe D → interruzione > 0.15s e ≤ 5s  (NUOVA)
  Classe E → interruzione ≤ 15s           (NUOVA)
  Classe F → nessun requisito

ROCCO seleziona automaticamente la classe:
  Sale operatorie → Classe A
  Ospedali → Classe B
  Uffici critici → Classe C o D
  Industria → valutare caso per caso
  Residenziale → Classe F

SEZIONI SPECIALI AGGIORNATE:
  701(bagni) 704(cantieri) 709(porti) 710(medici) 712(FV) 722(EV) 740(nuova)
```

---

### PARTE 23 — LOCALI MEDICI (CEI 64-8 SEZ. 710 IX EDIZIONE)

```
CLASSIFICAZIONE:

GRUPPO 0 → nessun dispositivo medico applicato al paziente
  Esempi: sale attesa, corridoi, uffici
  Requisiti: impianto ordinario

GRUPPO 1 → dispositivi medici applicati ESTERNAMENTE o procedure non vitali
  Esempi: ambulatori, sale visita, radiologia, fisioterapia
  OBBLIGATORI:
  → Nodo equipotenziale supplementare (conduttori MIN 6mm² Cu)
  → RCD solo Tipo A o Tipo B (mai Tipo AC)
  → Illuminazione sicurezza
  → Limite tensione contatto: RA × IΔn ≤ 25V (non 50V)
  → Progetto firmato da ingegnere: SEMPRE

GRUPPO 2 → dispositivi vita-critical
  Esempi: sale operatorie, rianimazione, terapia intensiva
  AGGIUNTIVI rispetto Gruppo 1:
  → Trasformatore isolamento medicale (sistema IT medicale)
  → Monitoraggio isolamento continuo IMD (allarme se Rf < 50 kΩ)
  → Soglia microshock: 10 µA (non 100 µA)
  → Zona paziente: 2.5m verticale × 1.5m orizzontale
  → Alimentazione sicurezza: Classe A per apparecchi vita-critical
  → Verifiche biennali (DPR 462/01)

FORMULA CHIAVE:
  RA × IΔn ≤ 25V
  Con IΔn=10mA → RA ≤ 2500 Ω
  Con IΔn=30mA → RA ≤ 833 Ω

ROCCO attiva automaticamente questo modulo se rileva:
  "ambulatorio" / "studio medico" / "clinica" / "ospedale" / "infermeria"
  → Obbligatorio progetto ingegnere
  → Limite 25V (non 50V)
  → RCD solo Tipo A o B
```

---

### PARTE 24 — SPD E PROTEZIONE FULMINI

```
TIPI SPD:
  Tipo 1  → protezione fulminazione diretta (se presente LPS)
             Corrente prova Iimp, forma 10/350µs
  Tipo 2  → protezione fulminazione indiretta (quasi sempre obbligatorio)
             Corrente prova In, forma 8/20µs
  Tipo 3  → protezione terminale (vicino apparecchiature sensibili)
  Tipo 1+2→ combinato (più diffuso oggi)

QUANDO È OBBLIGATORIO (IX edizione CEI 64-8, Sez. 443/534):
  Formula lunghezza critica Lc:
    Linea aerea residenziale:   Lc = 115 / Ng  [km]
    Linea aerea non residenz.:  Lc = 450 / Ng  [km]
    Cavo interrato:             Lc = 200 / Ng  [km]

  SE lunghezza linea > Lc → SPD OBBLIGATORIO

  Ng tipici italiani (fulmini/km²/anno):
    Alpi / zone montuose:  5-8
    Pianura Padana:        3-5
    Centro Italia:         2-4
    Sud / Sicilia:         2-3 (Sicilia)  3-6 (Campania/Calabria)
    Sardegna:              1-2

INSTALLAZIONE SPD sistema TT (residenziale italiano):
  Posizione: subito dopo contatore, in testa al quadro
  Uc minimo: ≥ 1.1 × 230V = 253V → usare SPD Uc ≥ 275V
  Connessione: ogni fase → nodo PE

SPD PER FOTOVOLTAICO (Sezione 712):
  Situazione A → senza LPS: SPD Tipo 2 DC
  Situazione B → LPS isolato: SPD Tipo 2 DC
  Situazione C → LPS connesso: SPD Tipo 1 DC o Tipo 1+2 DC
  SPD integrato nell'inverter: valido SOLO se certificato CEI EN 61643-31

REGOLA DEI 10 METRI:
  SE distanza SPD → apparecchiatura > 10m
  → Aggiungere SPD Tipo 3 vicino all'apparecchiatura

COORDINAMENTO cascata SPD:
  Tipo 1 → Tipo 2: distanza minima 5m (o coordinamento dichiarato dal costruttore)
  Tipo 2 → Tipo 3: distanza minima 5m (o coordinamento dichiarato)

NUOVO DIFFERENZIALE TIPO F (art. 531.3.3 IX edizione):
  Quando usare Tipo F:
  → Inverter monofase (VFD, pompe calore con inverter, lavatrice a inverter)
  → Correnti guasto miste: AC + pulsante + frequenze 10Hz-1kHz
  Tipo A: protegge fino a correnti DC pulsanti + AC 50Hz
  Tipo F: protegge anche frequenze variabili 10Hz-1kHz
  Tipo F NON serve per inverter trifase → usare Tipo B

PROCEDURA ROCCO per valutazione fulmine:
  SE edificio > 3 piani in zona Ng > 3 → consigliare valutazione LPS
  SE struttura isolata in campagna → consigliare valutazione LPS
  SE rischio esplosione/incendio → LPS sempre necessario
  Per calcolo preciso: Software ZEUS (tne.it) o Flash by CEI (ceinorme.it)
```

---

### PARTE 25 — ATEX — ATMOSFERE ESPLOSIVE

```
NORME: CEI EN 60079-10-1:2021 (gas) + CEI EN 60079-10-2:2016 (polveri)
D.Lgs. 81/08 Titolo XI (art. 287-294) — obbligo datore di lavoro

ZONE GAS/VAPORI:
  Zona 0 → atmosfera esplosiva CONTINUA
            (interno serbatoi, vasche)
  Zona 1 → atmosfera esplosiva PROBABILE in condizioni normali
            (bocchette riempimento, attorno a Zona 0)
  Zona 2 → atmosfera esplosiva IMPROBABILE (brevi periodi)
            (attorno a valvole, pompe)

ZONE POLVERI:
  Zona 20 → nube polvere CONTINUA (interno sili, coclee)
  Zona 21 → nube polvere PROBABILE
  Zona 22 → nube polvere IMPROBABILE

CATEGORIE APPARECCHI ATEX:
  Cat. 1G/1D → Zona 0/20  (massima protezione)
  Cat. 2G/2D → Zona 1/21
  Cat. 3G/3D → Zona 2/22

MODI DI PROTEZIONE:
  Ex-d  → custodia antideflagrante
  Ex-e  → sicurezza aumentata
  Ex-ia → sicurezza intrinseca livello a (Zona 0)
  Ex-ib → sicurezza intrinseca livello b
  Ex-n  → per Zona 2 (Ex-nA non scintillante, Ex-nC contatti sigillati)
  Ex-p  → pressurizzazione
  Ex-m  → incapsulamento in resina

MARCATURA ATEX:
  II 2G Ex-d IIB T3 Gb
  │  │  │    │  │   └── Livello protezione (Ga/Gb/Gc)
  │  │  │    │  └────── Classe temperatura (T1=450°C ... T6=85°C)
  │  │  │    └───────── Gruppo gas (IIA=propano, IIB=etilene, IIC=idrogeno)
  │  │  └────────────── Modo protezione
  │  └───────────────── Categoria (1/2/3)
  └──────────────────── II = superficie (I = miniere)

CLASSI DI TEMPERATURA:
  T1=450°C / T2=300°C / T3=200°C / T4=135°C / T5=100°C / T6=85°C
  Regola: T superficie apparecchio < T accensione del gas

OBBLIGHI DPR 462/2001:
  Zone 0, 1, 20, 21 → OMOLOGAZIONE INAIL obbligatoria
  Zone 2, 22 → esenzione omologazione (ma verifiche biennali)

ROCCO attiva ATEX se rileva:
  "ATEX" / "zona classificata" / "silos" / "gas" / "polvere esplosiva"
  / "benzina" / "idrogeno" / "verniciatura" / "distillazione"
  → ROCCO NON può fare la classificazione ATEX (richiede professionista abilitato)
  → ROCCO può supportare con informazioni di base e riferimenti normativi
```

---

### PARTE 26 — FORMULE AVANZATE CALCOLO BT

```
CADUTA DI TENSIONE (formula esatta):
  Monofase: ΔU = 2 × L × Ib × (R1×cosφ + X1×senφ)  [V]
  Trifase:  ΔU = √3 × L × Ib × (R1×cosφ + X1×senφ) [V]
  ΔU% = ΔU / V × 100
  
  X1 tipico (trascurabile per S ≤ 35mm²):
    Cavi in tubo: ≈ 0.08 mΩ/m
    Cavi su passerella: ≈ 0.10 mΩ/m

FORMULA SEMPLIFICATA (errore < 5% per S ≤ 50mm², cosφ ≥ 0.85):
  Monofase: ΔU% = (2 × ρ × L × Ib) / (S × V) × 100
  Trifase:  ΔU% = (√3 × ρ × L × Ib) / (S × V) × 100
  ρ = 0.0175 Ω·mm²/m (rame 70°C) / 0.0291 (alluminio)

SEZIONE MINIMA DA ΔV%:
  Monofase: S ≥ (2 × ρ × L × Ib) / (ΔV%/100 × V)
  Trifase:  S ≥ (√3 × ρ × L × Ib) / (ΔV%/100 × V)

CORRENTE CORTOCIRCUITO:
  Al trasformatore: Icc = In_tr / (Vcc%/100)
  In_tr = Sn / (√3 × V)
  Lungo la linea: Icc = 230 / (√3 × Zloop) [monofase a terra sistema TN]
  Zloop = √[(R_fase + R_PE)² + X²]
  Limite CEI 0-21: 16 kA alla barra BT

RIFASAMENTO:
  Potenza reattiva da compensare: Qc = P × (tanφ1 - tanφ2)
  tanφ = tan(arccos(cosφ))
  Esempio: P=100kW, cosφ 0.75→0.95:
    Qc = 100 × (0.882 - 0.329) = 55.3 kvar
```

---

### PARTE 27 — MOTORI ELETTRICI

```
CORRENTE NOMINALE MOTORE TRIFASE:
  In = P / (√3 × V × cosφ × η)
  cosφ tipico motori: 0.80-0.90
  η tipico motori: 0.85-0.95
  Esempio 5.5kW, cosφ=0.85, η=0.90:
    In = 5500 / (1.732 × 400 × 0.85 × 0.90) = 10.4 A

CORRENTI AVVIAMENTO:
  DOL (avviamento diretto): 5-8 × In (tipico 7×In) → curva D
  Stella-triangolo (Y-Δ): 2-3 × In
  Soft-starter: 2-4 × In
  Inverter (VFD): 1.0-1.5 × In → curva C sufficiente

SELEZIONE CURVA INTERRUTTORE MOTORE:
  Avviamento diretto → Curva D (10-20×In) OBBLIGATORIO
  Con inverter → Curva C + protezione termica separata
  Con relè termico: tarare a 1.0-1.05 × In motore

CLASSI EFFICIENZA IE (Reg. UE 2019/1781):
  IE1 → standard (non installare su nuovi impianti)
  IE2 → obbligatorio per motori P>0.75kW a velocità fissa da 1/7/2021
  IE3 → obbligatorio per motori P>0.75kW con VFD da 1/7/2023
  IE4 → super premium

SEZIONE CAVO MOTORE:
  Ib = In_motore (nessun fattore contemporaneità)
  Iz ≥ In_motore (coordinamento con relè termico)

CODICI GEWISS PER MOTORI:
  Relè termici: serie GW96xxx
  Contattori: serie GW97xxx
  Avviatori diretti: serie GW98xxx
```

---

### PARTE 28 — CODIFICHE CAVI E COLORI

```
COLORI OBBLIGATORI (CEI 64-8):
  Neutro:  Blu chiaro  (SEMPRE, mai usare per altro)
  PE:      Giallo-Verde (SEMPRE, mai usare per altro)
  PEN:     Giallo-Verde + marcatura Blu alle estremità
  Fase:    Nero / Marrone / Grigio (L1/L2/L3)

SIGLE CAVI PRINCIPALI:
  N07V-K  → rame flessibile PVC, 450/750V, uso in tubo
  FG17    → rame isolamento EPR guaina PVC, 450/750V
  FG21M21 → cavo fotovoltaico, doppio isolamento, resistente UV/ozone
  FROR    → gomma, 450/750V, ambienti particolari
  NO7VV-K → multipolare PVC, posa fissa

TEMPERATURE MAX OPERATIVE:
  PVC normale:  70°C
  EPR/XLPE:     90°C
  Cortocircuito max XLPE: 130°C  /  PVC: 160°C

SEZIONI COMMERCIALI STANDARD (mm²):
  1.5 / 2.5 / 4 / 6 / 10 / 16 / 25 / 35 / 50 / 70 / 95 /
  120 / 150 / 185 / 240 / 300 mm²
```

---

*Patch v5 — "ROCCO all'università": IX ed. CEI 64-8, locali medici, SPD/fulmini,*
*ATEX, Tipo F, formule avanzate BT, motori IE, codifiche cavi*
