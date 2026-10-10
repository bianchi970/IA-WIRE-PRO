# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start backend (always from backend/ dir to load .env correctly)
cd backend && node server.js

# Run DB migration (idempotent, transactional)
cd backend && node migrate.js

# Health check
curl http://localhost:3000/health

# Test chat API
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"testo","user_id":"test"}'

# Ingest doc_chunks (RAG manuale — idempotente, ri-eseguibile)
cd backend && node ingest.js

# Ingest enciclopedia tecnica components+issues (idempotente)
cd backend && node ingest_encyclopedia.js

# Install backend dependencies
cd backend && npm install
```

## Architecture

```
ia-wire-pro/
├── backend/
│   ├── server.js        ← Express API + AI routing + DB persistence + offline fallback
│   ├── db.js            ← pg.Pool singleton (requires DATABASE_URL)
│   ├── migrate.js       ← Schema migration (transactional, idempotent)
│   ├── schema.sql       ← Tables: conversations, messages, message_attachments
│   │                       (components and issues are NOT touched here)
│   ├── knowledge.js     ← Lazy-loads knowledge/*.json; fetchKnowledgeContext() + getLoadedKnowledge()
│   ├── knowledge/       ← Base di conoscenza locale (no DB required)
│   │   ├── components.json       ← 50 componenti elettrici con guasti tipici e field_checks
│   │   ├── protection_rules.json ← 10 regole di protezione con risk_level e verification_steps
│   │   ├── failure_patterns.json ← 30 pattern di guasto con symptom/causes/checks/confidence_logic
│   │   └── safety_protocols.json ← 7 protocolli LOTO/isolamento/misura con stop_conditions
│   ├── engine/          ← ROCCO diagnostic engine (pre-LLM)
│   │   └── diagnosticEngine.js  ← analyzeTechnicalRequest() + SYNONYM_MAP + PAIR_BOOSTS + MATCH_THRESHOLD=3
│   ├── rocco/           ← IA pipeline module
│   │   ├── index.js     ← plan() + buildSystemPrompt() (ROCCO v4 — domain hints, istruzioni precise)
│   │   ├── policies.js  ← HARD_SAFETY_RULES (7), GOLDEN_RULES (14), BANNED_PHRASES (15)
│   │   ├── postcheck.js ← Validates/injects sections, cleanSectionHeadings, warnEmptySections
│   │   ├── componentRecognizer.js ← extractComponents() + formatComponents() — 28 categorie
│   │   ├── numericRecognizer.js  ← extractElectricalValues() V/A/mA/kV/IP
│   │   ├── domainGuard.js        ← isOutOfScope() blocca MT/AT (20kV+)
│   │   ├── scoringEngine.js      ← scoreHypotheses() ALTA>MEDIA>BASSA
│   │   ├── questionBuilder.js    ← buildQuestions() max 3 per componente
│   │   ├── engine.js             ← Foundation Engine pipeline (best-match 40 pattern)
│   │   └── patterns/
│   │       └── basicPatterns.js  ← 40 pattern BT civili/industriali
│   ├── utils/           ← Utility condivise
│   │   └── certainty.js ← normalizeCertainty() → ALTA | MEDIA | BASSA
│   └── .env             ← dotenv loaded with path.join(__dirname, ".env")
└── frontend/
    ├── app.js           ← Vanilla JS IIFE, no framework, PWA SW registration
    ├── index.html       ← viewport-fit=cover, manifest, apple-mobile-web-app-*
    ├── style.css        ← safe-area-inset, touch targets 44px, typing dots animation
    ├── manifest.json    ← PWA manifest (standalone, theme #071326)
    └── service-worker.js ← Cache-first static, network-only /api/, offline fallback
```

## Key Architectural Decisions

### dotenv path
Both `server.js` and `migrate.js` load `.env` with an explicit path:
```js
require("dotenv").config({ path: path.join(__dirname, ".env") });
```
Do NOT change to bare `require("dotenv").config()` — it will fail when run from the repo root.

### ROCCO Diagnostic Engine (OFFICINA FULL AUTO)
`backend/engine/diagnosticEngine.js` runs **before** any LLM call and produces structured pre-analysis:
- `analyzeTechnicalRequest(input, knowledge)` → `{ isTechnical, isDangerous, matchedPatterns[], matchedRules[], osservazioni[], ipotesi[], verifiche[], rischi[], conclusione }`
- Scoring: `symptom × 3 + likely_causes × 2 + checks × 1` + PAIR_BOOSTS (+4 per coppia italiana rilevante)
- `MATCH_THRESHOLD = 3` — evita falsi positivi su keyword singole
- `normalize()` rimuove accenti italiani per matching robusto (relè → rele, ecc.)
- `formatOfflineAnswer(diag)` → risposta completa ROCCO-format quando LLM non raggiungibile
- Startup log: `"ROCCO ENGINE: ACTIVE"` + `"KNOWLEDGE ITEMS: N components, N failure_patterns, ..."`

### Knowledge Base locale (backend/knowledge/)
4 JSON files caricati lazy da `knowledge.js` (una sola volta al primo uso):
- `fetchKnowledgeContext(query)` → stringa formattata per il system prompt (top 2+2+1+1)
- `getLoadedKnowledge()` → dati grezzi `{ components, protectionRules, failurePatterns, safetyProtocols }` per il diagnostic engine
- Nessun DB richiesto: tutto offline, sempre disponibile

### Offline fallback /api/chat (OFFICINA FULL AUTO — C)
Se tutti i provider LLM falliscono per errore di rete (`isNetworkError()` detecta ENOTFOUND/ETIMEDOUT/ECONNRESET/ECONNREFUSED/EAI_AGAIN/ENETUNREACH):
- `usedProvider = "offline_engine"`, `usedModel = "rocco-local-v2"`
- Risposta = `formatOfflineAnswer(engineDiag)` — formato ROCCO completo con nota `"⚠️ risposta generata localmente"`
- `STRICT_FORMAT` skippato per `usedProvider === "offline_engine"` (già formattato)
- Se l'errore non è di rete → `throw lastErr` (comportamento normale)

### /api/engine/test endpoint
`GET /api/engine/test` esegue `analyzeTechnicalRequest` sul caso di test hardcoded (`TEST_CASE` in diagnosticEngine.js) usando i dati reali dei JSON. Utile per verificare il pattern matching senza avviare una conversazione. Risposta include `diagnostic`, `formatted_engine_context`, `formatted_knowledge_context`, `counts`.

### Riconoscimento componenti (engine/diagnosticEngine.js)
Quattro difetti distinti producevano componenti inesistenti nelle risposte.
Sui 21 casi reali italiani, **prima ogni caso restituiva esattamente 3
componenti**: lo `slice(0, 3)` era sempre saturato dal rumore, il
riconoscitore non selezionava — restituiva sempre il massimo. Ora 63 → 33.

1. **Sigle come sottostringhe.** `queryNorm.indexOf(keyword)` pescava le
   sigle di 2-3 lettere dentro le parole italiane: `DIN` in "lampa**din**a",
   `NA` in "cuci**na**", `aM` in "l**am**padina", `gG` in "so**gg**iorno",
   `TR` in "lava**tr**ice", `TA` in "sal**ta**", `NO` in "**no**n".
   Fix: `containsKeyword()` con confini di parola. Le sigle vere restano
   riconoscibili ("ho un TA da 100/5"), si pretende la parola intera.
2. **Keyword multi-parola soddisfatte da un token.** `tokensMatch` trovava
   "interrutt" prefisso di "interruttore automatico di potenza": la parola
   "interruttore" — in casa il tasto a muro — riconosceva 7 componenti di
   quadro. Fix: `keywordTokensPresent()` pretende **tutti** i token.
3. **Sinonimi applicati dopo lo stem.** `stem("presenza")` toglie "nza" e dà
   "prese", che la tabella normalizza a "presa": la keyword del sensore di
   movimento diventava identica alla parola "presa". Fix: `canonicalWord()`
   consulta la tabella sulla parola **intera** prima di stemmare — la voce
   giusta (`presenza → rilevatore presenza`) c'era già.
4. **Prefix matching tra parole diverse.** `stem("magnetico")` = "magnet",
   prefisso di "magnetoterm": il finecorsa compariva in ogni frase sui
   magnetotermici. Fix: `PREFIX_MAX_GAP = 3` — la flessione cambia una o due
   lettere in coda, oltre è un'altra parola.
   Aggiunta: plurale femminile (`cassette`/`cassetta`), che lo stemmer non
   toccava e il prefix matching non copriva (stessa lunghezza).

Esportati per i test: `containsKeyword`, `scoreComponentMatch`,
`tokensMatch`, `tokenize`, `normalize`.
Test: `rocco_v2/neural/test/component_recognition.test.js` — 36 asserzioni.

**Aperto**: la `SYNONYM_MAP` (295 voci) mescola sinonimi veri
(`salvavita→differenziale`) con **iperonimi schiacciati su un dispositivo**
(`interruttore→magnetotermico`, `protezione→differenziale`,
`pannello→quadro`, `riscaldamento→caldaia`). Questi fanno affermare a ROCCO
componenti che l'utente non ha nominato: è una decisione di dominio, da
prendere voce per voce con l'elettricista.

### ROCCO V2 — testi delle verifiche (previsione ≠ istruzione)
`backend/rocco_v2/check_phrasing.js`. Il modello causale **prevede**
("se X fosse in cortocircuito osserverei R prossima a 0 su X"): serve a
confrontare l'ipotesi coi fatti. Quelle previsioni finivano però in
`confirm_tests` e da lì `selectBestAction()` le dava all'utente come
prossimo passo — un elettricista leggeva `"R prossima a 0 su Circuito luci"`.
Errore di categoria: *previsione* (cosa vedrei se fosse vero) ≠ *istruzione*
(cosa fare, con quale strumento, cosa leggere).

`toInstruction()` traduce con 22 schemi in due famiglie: **misure**
(strumento + grandezza + stato dell'impianto + soglia) e **osservazioni**
(cosa guardare o provare). Ogni misura di resistenza/isolamento/continuità
prescrive esplicitamente "a impianto fuori tensione" — verificato dai test.
Quel che non rientra in uno schema **viene scartato, non inventato**: meglio
una verifica in meno che un'istruzione sbagliata su un impianto in tensione.

**Scelta del nodo nel controfattuale** (`causal_model.js`): si pesano solo le
parole **distintive** del grafo. `"circuito"` compare in Circuito
luci/prese/cucina/bagno: contandola, un'ipotesi come "cortocircuito
fase-neutro" faceva pari merito su tutti e vinceva il **primo dichiarato** —
in risposta usciva sempre "Circuito luci" anche parlando di prese in cucina.
Ora contano le parole che identificano meno di `GENERIC_WORD_SPREAD`=3 nodi,
più `nodo_problema` (+6) e `menzionato` (+4) che il grafo già calcolava e
nessuno leggeva. Stesso difetto corretto in `costruisciGrafo()`, che
confrontava solo la **prima** parola del nome.

Test: `check_phrasing.test.js` — 35 asserzioni.

### ROCCO V2 — kill rules (esclusione per impossibilità fisica)
`killImpossible()` leggeva una stringa appiattita di `facts_confirmed` +
`measurements`: le parole dell'utente non arrivavano mai, e le regole erano
regex sensibili all'ordine. Conseguenze reali: `{isolamento: 50 MΩ}` veniva
parsato correttamente ma KR-01 cercava il simbolo `>` nel testo, quindi la
misura dell'utente era **ignorata** e "dispersione" restava prima ipotesi;
KR-10 pretendeva "carico scollegato … scatta" e non scattava mai.

**Evidenze strutturate** — `buildEvidenceContext(cs)` espone:
- `text` → **prove**: evidenze del motore + le sole frasi in cui l'utente
  dichiara di aver verificato o escluso qualcosa (`extractUserExclusions()`,
  7 pattern). Solo questo campo può innescare un'esclusione.
- `story` → **contesto**: tutto il racconto. Dice che impianto è, serve a
  restringere l'ambito di una regola. Non è una prova: "impianto 230V" non
  dimostra che la tensione sia presente al punto guasto — per questo
  `problem_summary` non entra mai intero nelle prove.
- `facts` → chiavi derivate (`isolation_high`, …)
- `measure(tipo)` → valore numerico, isolamento normalizzato in MΩ (kOhm/Ohm
  convertiti): le regole di soglia leggono il valore, non la frase.

**Forme di innesco** (`ruleTriggered`): `when` (misure), `fact` (chiave),
`signal`/`signals` (tutti presenti, **ordine libero**, sulle prove),
`context` (ambito, sul racconto). `context` da solo non scatta mai.

**13 regole** (era 10). Nuove: KR-11 impianto civile monofase esclude le
ipotesi da quadro industriale (motore/trifase/salvamotore) — applicabilità
strutturale, non misura; KR-12 scatta solo il magnetotermico → sovracorrente,
non dispersione; KR-13 componente sostituito e sintomo invariato → quel
dispositivo non era la causa.

**Valvola di sicurezza**: nessuna regola può azzerare le ipotesi attive.
Con una sola ipotesi viva l'esclusione viene saltata e tracciata come
`kill_skipped` — meglio un'ipotesi debole che "dati insufficienti" proprio
quando l'utente ha fornito più dati.

**Verifiche già fatte** — `selectBestAction()` penalizza (−40, non esclude)
le verifiche che le dichiarazioni dell'utente hanno reso inutili
(`ALREADY_DONE`, 6 accoppiamenti prova→verifica). Escludere l'ipotesi non
bastava: ROCCO continuava a ordinare "scollegare tutti i carichi" a chi
aveva già staccato tutto. Penalità e non esclusione perché a volte la stessa
misura va ripetuta in condizioni diverse (isolamento a caldo dopo una a freddo).

**Le regex vanno tarate sul corpus reale, non su frasi di comodo.** È il
punto più fragile di questo lavoro. La prima versione di KR-13 pretendeva
*"ho sostituito X ma il problema persiste"*: una frase che nessun cliente
scrive. Nel corpus reale la forma è *"Lampadina nuova, interruttore nuovo,
continua uguale"* — la regola non scattava mai. Misurato sulle 21 domande
italiane di `rocco_v2/neural/casi_reali_forum.js`, il riconoscimento delle
esclusioni è passato da **4/21 a 15/21** riscrivendo i pattern a partire
dalle frasi vere. Chi tocca `USER_EXCLUSION_PATTERNS` o una regola **rimisuri
su quel corpus**: `kill_rules.test.js` §11 lo fa, e verifica che su quei casi
nessuna regola uccida la `causa_reale`.

Test: `backend/rocco_v2/neural/test/kill_rules.test.js` — 80 asserzioni, per
ogni regola un caso che deve scattare e uno che non deve, più i falsi
positivi: 6 casi sintetici e i 21 reali verificano che la causa vera resti viva.

### ROCCO V2 — narratore (la "bocca")
Il motore v2 ragiona in modo deterministico e non chiamava quasi mai l'LLM
(`decideAINeeded()` ritorna false con 1–5 ipotesi attive, cioè quasi sempre):
all'utente arrivavano slug interni (`rcd_trip`, `voltage_nominal`, `rcd-ac-2p`).
Separazione attuale: **il motore ragiona, il narratore redige.**

- `backend/rocco_v2/lexicon.js` — slug → italiano tecnico: 50 id componente,
  25 stati osservati, 15 fatti di evidenza, grandezze, certezza, sicurezza.
  `cleanFacts()` dà priorità alle frasi leggibili sugli slug (il vecchio
  `slice(0,6)` pescava solo gli slug, che il motore accoda per primi).
- `backend/rocco_v2/narrator.js` — `narrate(cs, draft, gateway, opts)` chiama
  l'LLM in **sola redazione** sul `case_state` già concluso.
  Può riformulare, riordinare per pertinenza e scartare ipotesi non pertinenti.
  Non può: aggiungere ipotesi, inventare misure, alterare il livello di certezza.
  `validate()` controlla 5 cose e in caso di violazione **torna alla bozza
  deterministica**: sezioni presenti, certezza invariata, nessuno slug
  snake_case, ogni causa riconducibile a un'ipotesi del motore (confronto sulla
  parte prima di " — ", ≥50% token in comune), nessun numero **con unità** fuori
  dai dati del caso (+ `NORMATIVE_NUMBERS`, le costanti di mestiere).
  Risolve sempre: timeout 25s, provider giù o narratore off → bozza.
- `ROCCO_NARRATOR=0` disattiva la redazione (resta la bozza deterministica).
- `evidence_meta.narrated` / `narration_reason` dicono se la redazione è passata
  e, se no, perché. `ai_called` resta riferito al **ragionamento**, non alla
  redazione: le due cose sono tracciate separatamente.
- `formatResponse()` (bozza) ora emette tutte le 7 sezioni TECH_REPORT_V1:
  mancava VERIFICHE OPERATIVE e la verifica discriminante non arrivava mai
  all'utente perché `next_action` veniva letto solo nel formato interno
  (`action`) dopo la conversione a quello legacy (`expected_discriminator`).
- Test: `backend/rocco_v2/neural/test/narrator.test.js` — 48 asserzioni,
  gateway finto, nessuna chiamata di rete.

### ROCCO V2 — continuità multi-turn (store su disco)
Il motore ragionava bene al primo messaggio e **dimenticava tutto al secondo**.
Misurato su un caso reale in due battute: turno 1 "salta il differenziale con
la lavatrice" → 11 ipotesi, 3 uccise; turno 2 "isolamento 0,2 MOhm" → **0
uccise**, nessuna traccia del differenziale, e come prossimo passo *"ripetere
la misura di isolamento"* — la verifica appena eseguita dall'utente.

Due difetti in catena:

1. **`conversation_id` non nasceva mai.** `convCreate()` apriva con
   `if (!pool) return null`: col DB muto `convId` restava null, il blocco che
   carica `prior_context` non partiva, il `case_state` nasceva vergine.
   Tutta la continuità poggiava su un `if`.
2. **Il contesto veniva cancellato un passo dopo.** L'orchestratore accodava
   `prior_context` a `problem_summary` al passo 1; al passo 3
   `mergeSafetySeedOutput` (`case_state.js:162`) lo riscriveva col seed del
   safety guard — solo messaggio corrente. Da `problem_summary` dipendono sia
   il **racconto** (`story`) sia le **prove** (`text`, via
   `extractUserExclusions`): perso quello, le esclusioni e le misure dei turni
   precedenti non entravano nel ragionamento. `applyPriorContext()` è
   idempotente e viene riapplicata **dopo** il merge.

`backend/store/conversationStore.js` tiene le conversazioni su disco
(`data/conversations-local.json`, in `.gitignore`): pattern di
`rocco_v2/memory.js` — ES5, scrittura atomica tmp+rename, nessuna eccezione
verso la chat (file corrotto → si riparte vuoti). Id interi in un range
riservato **> 1e9**: `parseInt` continua a funzionare in ogni endpoint e
nessun id locale si confonde con un serial Postgres. Su disco l'apprendimento
sopravvive ai restart, cosa che su Render non avviene.

**`pool` è un oggetto anche quando il DB non risponde.** Le guardie
`if (!pool)` non scattano: il ripiego va agganciato al **fallimento della
query**, non all'assenza del pool. Vale per l'elenco e la creazione
conversazioni, che altrimenti rispondono 500 — e al refresh il frontend butta
via il `conversation_id` dal localStorage, perdendo la continuità comunque.
`/health` espone `conversationStore: { local, active }` per dire chi tiene la
continuità in quel momento.

Test: `backend/test/conversation_store.test.js` (55 asserzioni) e
`backend/rocco_v2/neural/test/multi_turn.test.js` (41 — incluso: sui 21 casi
italiani di `casi_reali_forum.js` nessuna prova regredisce aggiungendo il
contesto).

**Aperto**: la certezza non sale mai. Con un isolamento di 0,2 MΩ contro
1 MΩ atteso la risposta resta `DA VERIFICARE` e richiede ancora la misura:
il caso non si chiude. Ed è comparsa un'ipotesi fotovoltaica (pannello, cavo
MC4) su una lavatrice in appartamento — pertinenza delle ipotesi al dominio.

### ROCCO V2 — la certezza sale (conferma per misura)
Il motore sapeva solo **escludere**. KR-01 legge l'isolamento per uccidere
"dispersione" quando è ≥ 1 MΩ; il caso simmetrico — sotto soglia, cioè
dispersione accertata — non era letto da nessuno. Risultato misurato sui 21
casi italiani: **18 `non_verifiable` e 3 `confirmed`**, e quei 3 avevano zero
ipotesi attive (arresti di sicurezza). ROCCO diceva "confermato" solo quando
non aveva una diagnosi, e "da verificare" su ogni diagnosi vera: con la
misura decisiva in mano chiedeva di ripeterla.

Tre difetti, tutti "dato calcolato e mai letto":
1. `supporting_evidence` inizializzato a `[]`, letto una volta, **scritto
   mai** → `hasEvidence` sempre falso.
2. I due guardrail (`confirmed` impossibile senza misure / solo da AI)
   stavano **dopo il return** del ramo confirmed: codice morto. Ora sono
   condizioni d'ingresso.
3. Il simulatore causale calcolava una probabilità e la scriveva solo come
   frase nella catena (`"probabilità 45%"`), inutilizzabile per ordinare.
   Ora è anche `h.probabilita`.

**`CONFIRM_RULES`** (5 regole, grammatica delle kill rules via
`ruleTriggered`, direzione opposta): isolamento < 1 MΩ (CEI 64-8),
temperatura ≥ 70 °C su una connessione, resistenza ≈ 0 fra i conduttori,
tensione misurata < 50 V, corrente oltre calibro. Si conferma **solo** su un
valore letto da `measure()` o su un fatto che il motore deriva da una misura
(`isolation_low`, marcato 0.98 da `diagnosticEngine.js`) — mai su una frase.

**Nessuna regola sui mA di dispersione, deliberatamente**: in italiano
"30 mA" è quasi sempre la *taratura* del differenziale, non una misura.

**La scala**: `confirmed` pretende misura + ipotesi confermata + non solo IA
+ nessuna prova contraria. `probable` pretende che **una** ipotesi guidi
(quattro sostenute a pari merito restano `non_verifiable`: dirle probabili
sposterebbe l'elettricista su una pista a caso) oppure la convergenza per
esclusione — una sopravvissuta ai kill, **non** una sola generata. Con più
ipotesi in piedi la diagnosi dichiara l'ambiguità: *"fenomeno accertato dalla
misura; resta da localizzare fra N punti"*.

**Due trappole trovate misurando:**
- `hypothesisClaim()` pretende il match sulla **tesi** dell'ipotesi, non su
  tutta l'etichetta: CF-04 confermava *"Resistenza di pull-up nel PLC che fa
  misurare una tensione anche a **circuito aperto**"*, ipotesi che prevede di
  misurare tensione, non zero. Stesso difetto delle sigle dentro le parole
  italiane (`DIN` in "lampadina").
- `PROTECTION_TRIPPING_PATTERN`: a valle di una protezione scattata 0 V è
  normale. La prima guardia usava parole tecniche (scatta/salta/interviene) e
  lasciava passare la forma vera del cliente — *"uno non resta su, fa TRAC e
  ricade"*. Tarato sul corpus: 9 casi di scatto su 9, zero falsi positivi.

**Misurato**: sul solo racconto nessuna ipotesi confermata. Con la misura al
secondo turno 14 `confirmed`, 10 con conferma a livello di ipotesi e in
**tutte e 10 la causa reale è fra le confermate — zero conferme sbagliate**.
È la proprietà che conta: un CONFERMATO sulla causa sbagliata manda
l'elettricista sul punto sbagliato, ed è peggio di un DA VERIFICARE.

Test: `backend/rocco_v2/neural/test/confirm_rules.test.js` — 53 asserzioni.

**Aperto**: la certezza sale, ma su una lavatrice compaiono ancora ipotesi
fotovoltaiche fra le attive (pertinenza al dominio del caso — vedi
`SYNONYM_MAP` e iperonimi).

### OSSERVAZIONI: niente contabilità interna davanti all'utente
`facts_confirmed` riceve anche le `osservazioni` del motore
(`case_state.js`: `toolResult.evidence`), e `cleanFacts` dà priorità alle
frasi sugli slug: quelle righe **sono** frasi, quindi saturavano i 6 posti e
spingevano fuori i fatti veri. L'utente leggeva `"Keyword tecniche
rilevate: …"`, `"SAFETY: safe"`, `"AZIONE IMMEDIATA: …"`, `"Differenziale
conf=0.70"`.

`lexicon.ENGINE_INTERNAL_PREFIXES` + `isEngineInternal()` scartano la
contabilità interna e ciò che **duplica un'altra sezione** del referto
(SAFETY → RISCHI REALI, AZIONE IMMEDIATA → PROSSIMO PASSO). Il confronto è
sull'**inizio** della riga. I tool non scrivono più annotazioni da macchina
in `evidence` (`conf=`, slug): i punteggi restano in `raw_ref`.

Il ritorno alla bozza del narratore è previsto — respinge le riformulazioni
che aggiungono ciò che il motore non afferma — quindi **la bozza deve essere
presentabile**.

Test: `backend/rocco_v2/neural/test/osservazioni_pulite.test.js` — 26.

### I tool di rocco_v2 erano fuori da git (CRITICO, risolto)
`.gitignore` conteneva `tools/`: senza slash iniziale quel pattern matcha
**qualsiasi** cartella `tools` a ogni livello, quindi
`backend/rocco_v2/tools/` (5 file richiesti da `tool_registry.js`) non era
versionata. Su un deploy da git:

```
[ROCCO V2] Non disponibile: Cannot find module './tools/calc_tool'
POST /api/chat/v2 → {"ok":false,"error":"ROCCO v2 non disponibile"}
```

Il frontend ricade su `/api/chat` e in produzione girava il vecchio percorso
v4: **tutto ROCCO V2 assente** (kill rules, confirm rules, narratore,
multi-turn, grafo causale), silenziosamente, perché `server.js` avvolge il
require in try/catch con un solo warning.

Pattern corretto in `/tools/` (la cartella alla radice resta ignorata).
**Dopo ogni nuova cartella sotto `backend/`, verificare `git status`**: un
file non tracciato qui non rompe la macchina di sviluppo, rompe solo la
produzione.

### Formato risposta (RISOLTO)
`rocco/index.js` produce `TECH_REPORT_V1` con sezioni: OSSERVAZIONI, COMPONENTI COINVOLTI, IPOTESI, LIVELLO DI CERTEZZA, VERIFICHE OPERATIVE, RISCHI REALI, PROSSIMO PASSO.
`server.js` chiama `rocco.postcheck(answer)` dopo la risposta AI per garantire che tutte le sezioni siano presenti.
`ensureWireFormat()` rimossa definitivamente. Nessun conflitto di formato.

### Rocco module
`rocco.plan()` classifies the user message into domains (elettrico, termico, rete, domotica, idraulico, altro) using keyword regex. RAG is disabled for domain `"altro"`. The plan drives model selection and system prompt construction but does NOT currently change the provider — the actual provider selection happens in `server.js` via `pickProvider()`.

### RAG (Encyclopedia)
PostgreSQL full-text search (`plainto_tsquery('italian', ...)`) over `components` and `issues` tables. Multi-word queries use AND logic — single keywords match better than full phrases. Context is injected into the system prompt if results are found.

### conversation_id persistence
`POST /api/chat` accepts optional `conversation_id` and `user_id`. If no `conversation_id` is supplied, a new conversation is created automatically with the first 80 chars of the message as title. The response always returns `conversation_id`. Frontend stores it in `localStorage`.

### Routing multi-IA + fallback (FASE 6)
`buildProviderQueue(requested)` ritorna la coda ordinata dei provider disponibili. Il primario è determinato da `PREFERRED_PROVIDER` env (default `"openai"`) oppure dalla richiesta esplicita del frontend (`provider: "anthropic"`). Se il provider primario lancia eccezione (rate limit, errore rete, quota) il sistema ritenta automaticamente con il secondario. La risposta include `fallback_used: boolean`. Helper di chiamata isolati: `callOpenAI()` e `callAnthropic()`. Env var opzionale: `PREFERRED_PROVIDER=openai|anthropic`.

### certainty extraction (T1 — aggiornato)
`extractCertainty(answer)` in `server.js` chiama `normalizeCertainty()` da `backend/utils/certainty.js`.
Mappa qualsiasi valore verso: `ALTA | MEDIA | BASSA`.
- ALTA: confermato, probabile, molto probabile, alta
- MEDIA: media, possibile, non verificabile, da_verificare (default)
- BASSA: bassa, improbabile
Il valore viene salvato in `messages.certainty` e restituito nell'API response.

### Component Recognition Engine (T3)
`backend/rocco/componentRecognizer.js` — `extractComponents(text)`:
- 28 categorie di componenti elettrici/impiantistici
- Keyword matching con padding spazi per evitare falsi positivi su sigle corte (ta, tv, mt, mcb)
- Integrato in `server.js`: aggiunge i componenti riconosciuti all'`engineText` passato all'LLM
- Risposta API include `engine.recognizedComponents[]`

### ROCCO v4 (rocco/index.js)
- Persona potenziata: 25 anni esperienza, tecnico diretto e pratico
- Domain hints per ogni dominio (CEI 64-8, UNI, IEEE 802.3, ecc.)
- Classificazione domini ampliata (50+ keyword)
- 7 HARD_SAFETY_RULES, 14 GOLDEN_RULES, 15 BANNED_PHRASES

### Knowledge Base locale (aggiornata)
- `failure_patterns.json`: 30 pattern (FP-01 → FP-30)
- `components.json`: 50 componenti
- `protection_rules.json`: 10 regole
- `safety_protocols.json`: 7 protocolli

### Enciclopedia tecnica components/issues (FASE 5)
`components` e `issues` sono tabelle PostgreSQL pre-esistenti NON gestite da schema.sql. Vengono create (se assenti) e popolate da `backend/ingest_encyclopedia.js`, che legge `backend/data/encyclopedia.json` (15 componenti, ~42 guasti, 5 domini: protezione, riscaldamento, rete, domotica, idraulica/sicurezza). La chiave di deduplicazione è `(name, brand, model)` per components e `(component_id, title)` per issues. Il RAG `fetchEncyclopediaContext()` già in `server.js` interroga queste tabelle con FTS italiano e inietta il contesto nel system prompt come `CONTESTO TECNICO (DAL DB INTERNO IA WIRE PRO):`.

### RAG doc_chunks (FASE 4)
`doc_chunks` table in PostgreSQL: columns `id, source, chunk_text, created_at`. Populated manually via `node backend/ingest.js` (idempotent — checks exact duplicates before inserting). `fetchDocChunks(query)` uses Italian FTS (`plainto_tsquery`) first; falls back to ILIKE on individual keywords (>3 chars) if FTS returns nothing. Top 3 chunks are formatted under `CONTESTO TECNICO DA MANUALE:` and injected as a separate system message (OpenAI) or appended to the system string (Anthropic). Response `rag` field now includes `usedDocChunks: boolean`. GIN index `idx_doc_chunks_fts` on `to_tsvector('italian', chunk_text)` for fast FTS.

### Context window + auto-summary (FASE 3)
`HISTORY_MAX` (default 10, env override) controls how many messages are sent to the AI. When `conversation_id` is available, `/api/chat` loads the last 10 messages directly from DB (ignoring the frontend-supplied `history`). `SUMMARY_THRESHOLD` (default 10, env override): when a conversation reaches this many messages, `generateContextSummary()` runs fire-and-forget after each AI response, calls the AI to summarise the conversation in 5-8 technical bullet points, and stores it in `conversations.summary`. On the next chat turn the summary is prepended to the system prompt as `CONTESTO CONVERSAZIONE PRECEDENTE:`.

### Frontend
Pure ES5 vanilla JS (no `?.`, no `??`, no `replaceAll`) for maximum browser compatibility. Image compression via Canvas API: max 1800px, 0.85 JPEG quality. History capped at 10 messages sent to backend (fallback only — DB history takes priority server-side). `loadConversationOnStart()` fetches `/api/conversations/:id/messages` on page load.
- **Pulsante "Nuova"** in topbar: resetta conversationId, localStorage, chat UI, history locale.
- **Pulsante "Annulla"**: quando busy, il bottone Invia si trasforma in "✕ Annulla" (rosso) e chiama `abortCtrl.abort()`.
- **`_busy` flag** globale (all'interno dell'IIFE): `setBusy()` lo imposta e cambia il testo/stile del sendBtn.
- **KNOWN_SECTIONS** include tutte le sezioni backend: COMPONENTI COINVOLTI, VERIFICHE OPERATIVE, RISCHI REALI.
- **`[DA_VERIFICARE]`** renderizzato come badge `.cert-poss` (grigio), oltre a [CONFERMATO] e [PROBABILE].

## API Endpoints

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | Server status, DB ping, provider config |
| POST | `/api/chat` | multipart or JSON, fields: `message`, `history`, `conversation_id`, `user_id`, `image` |
| GET | `/api/conversations` | `?user_id=&archived=0&limit=50` |
| POST | `/api/conversations` | `{title, user_id}` |
| GET | `/api/conversations/:id` | includes `messages[]` array |
| PATCH | `/api/conversations/:id` | `{title?, is_archived?}` |
| DELETE | `/api/conversations/:id` | cascades to messages |
| GET | `/api/conversations/:id/messages` | `?limit=100`, returns `{ok, count, items}` |
| GET | `/api/components` | `?search=&category=&type=&brand=&limit=20` |
| GET | `/api/components/:id/issues` | |
| GET | `/api/engine/test` | Testa il ROCCO diagnostic engine con caso hardcoded (no LLM) |

## Database Schema (current)

- `conversations`: id, title, user_id (TEXT), created_at, updated_at, is_archived
- `messages`: id, conversation_id (FK cascade), role (user/assistant/system), content, content_format, provider, model, certainty, meta_json (JSONB), created_at
- `message_attachments`: id, message_id (FK cascade), type, url, mime, size_bytes, width, height, sha256, created_at
- `components` / `issues`: encyclopedia tables — **never modify in schema.sql migrations**

## Deployment

- **Render.com**: Root directory `backend`, Build `npm install`, Start `npm start`
- **Environment variables on Render**: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `DATABASE_URL`, `PORT`
- DB hosted on Render PostgreSQL (Frankfurt). SSL with `rejectUnauthorized: false`.

## Bugfix Log (2026-03-05)

### BUG-01: pg mancante da package.json (CRITICO)
Il driver PostgreSQL `pg` non era listato in `dependencies`. Su Render `npm install` non lo installava → `pool = null` → tutte le feature DB (persistence, conversations, RAG, enciclopedia) disabilitate. **Fix**: aggiunto `"pg": "^8.13.1"` a `backend/package.json`.

### BUG-02: foundResult ReferenceError (CRITICO)
`let foundResult = null` era dichiarato DENTRO un `try` block (block-scoped) ma referenziato FUORI nella risposta JSON. Ogni richiesta `/api/chat` crashava con ReferenceError → HTTP 500. **Fix**: spostato `let foundResult = null` fuori dal try, al livello della funzione handler.

### BUG-03: extractCertainty multiline
Il regex per estrarre il livello di certezza non gestiva il caso in cui il valore fosse sulla riga successiva al heading. **Fix**: aggiunto Caso 2 sia in `postcheck.js/normalizeCertaintySection()` che in `server.js/extractCertainty()`.

### BUG-04: Service Worker cache stale
`CACHE_NAME` fermo a `iawire-v1` con strategia cache-first → aggiornamenti JS/CSS non caricati. **Fix**: bump a `iawire-v2` + switch a network-first (cache come fallback offline).
