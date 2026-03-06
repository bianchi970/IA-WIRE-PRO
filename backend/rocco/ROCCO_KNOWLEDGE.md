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
