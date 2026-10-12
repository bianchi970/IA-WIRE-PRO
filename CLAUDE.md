# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Tutto si lancia da `backend/`** (il `.env` si carica con un percorso
esplicito, vedi sotto) e **tutto è dichiarato in `package.json`**: non ci
sono file da lanciare a memoria. Se aggiungi uno strumento, dichiaralo —
`test/niente_strade_morte.test.js` diventa rosso se resta orfano.

```bash
cd backend

npm start                   # avvia il server
npm test                    # 39 suite, esce ≠ 0 se una fallisce (~45s, senza rete)
npm run bench               # la pagella: esce ≠ 0 se una metrica peggiora (~19s)
npm run smoke               # 5 chiamate HTTP sul servizio vero (con i provider)

npm run migrate             # schema DB — idempotente, transazionale
npm run ingest:manuali      # RAG doc_chunks — idempotente
npm run ingest:enciclopedia # components + issues — idempotente
npm run build:dispositivi   # rigenera knowledge/dispositivi.json dalle 6 fonti
npm run pulisci:residui     # residui del corpus d'esame nello stato appreso

npm install                 # dipendenze
```

Tre interruttori per le misure. I primi due sono gemelli — uno dice "mai",
l'altro "sempre" — e servono a sapere quanto l'IA aggiunge:

```bash
ROCCO_NO_PROVIDER=1      # nessuna chiamata a un modello remoto: ROCCO da solo
ROCCO_ALWAYS_REASONER=1  # consulta sempre il ragionatore
ROCCO_NARRATOR=0         # solo la bozza deterministica, niente redazione
```

A mano, sul server avviato:

```bash
curl http://localhost:3000/health

curl -X POST http://localhost:3000/api/chat/v2 \
  -H "Content-Type: application/json" \
  -d '{"message":"il differenziale salta con la lavatrice","user_id":"test"}'
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
│   ├── store/           ← Store su disco: ROCCO funziona a DB spento
│   │   ├── conversationStore.js ← conversazioni (id > 1e9), continuità multi-turn
│   │   └── universityStore.js   ← memoria didattica: casi reali, errori, esami
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

### Senso delle parole (engine/diagnosticEngine.js)
Riconoscere la parola non basta: va riconosciuto il **senso** in cui il
cliente l'ha usata. Misurato sui 21 casi italiani, attribuendo ogni
rilevamento alla keyword che lo causava: su **35 componenti rilevati, 14
erano inesistenti**.

| metrica | prima | dopo |
|---|---|---|
| componenti rilevati sul corpus | 35 | 23 |
| di cui inesistenti | **14** | **0** |
| rilevamenti corretti persi | — | 0 |
| causa reale fra le ipotesi stampate | 14/21 | **15/21** |

Il caso emblematico: *"Ho forato il muro per appendere un **quadro** […] Cosa
ho **combinato**?"* produceva la custodia IP di un quadro elettrico e un
magnetotermico differenziale *combinato*, e da lì tre ipotesi sulla
conformità del quadro che scalzavano la causa vera.

**Cinque meccanismi:**
1. **Negazione** — `isKeywordNegated()`: "inverter **senza** trasformatore"
   faceva rilevare un trasformatore 24V. Guarda le 24 battute prima di ogni
   occorrenza; se una occorrenza è libera, vale. **Tollera l'articolo**: il
   cliente scrive "non ha **il** differenziale", "manca **il** contatore".
2. **Omonimi** — `SENSE_RULES`: `excludedBy` seleziona l'altro senso,
   `unless` riporta al senso tecnico, `component` limita la regola alle
   parole con due sensi entrambi elettrici.
   - `quadro` → il dipinto (con `unless` su "quadro elettrico/centralino").
   - `inverter` → fotovoltaico contro variatore di frequenza per motori.
   - `interruttore` → tasto a muro contro magnetotermico. **Non tocca**
     `SYNONYM_MAP interruttore→magnetotermico`, che resta decisione di
     dominio: pretende solo il contesto da quadro. Su IT-002 ("tirare su gli
     interruttori ma uno non resta su") il senso da quadro è giusto e resta.
3. **Nomi d'agente** — lo stemmer collassa `bruciatore` sul participio
   `bruciato`: "odore di bruciato" in un quadro rilevava la caldaia. Per
   `-tore/-trice/-sore` il matching lasco è **disattivato**: si pretende la
   forma esatta o il plurale.
4. **Un token non vale per due posizioni** — la keyword `aria-aria` era
   soddisfatta da una sola occorrenza di "aria" ("compressore ad aria").
5. **Il senso si verifica anche sulla parola CANONICA** — `SYNONYM_MAP`
   mappa `armadio`→`quadro` e `variatore`→`inverter`: la regola di senso,
   controllata solo sulla keyword grezza, veniva scavalcata.

**Igiene keyword** (9 rimozioni, ognuna un falso positivo misurato e
ridondante): `combinato` (RCBO), `NO` (pulsante), `kW` (motore trifase),
`portata` (pompa — in elettrotecnica è quella del cavo), `ciclico`/`24V`/
`230V`/`DIN` (timer), `variatore` (dimmer).

**Perché conta una sola keyword sbagliata**: il filtro a valle accetta
`score >= 2`, cioè **una** keyword.

Test: `backend/rocco_v2/neural/test/senso_parole.test.js` — 53 asserzioni,
con l'elenco dei rilevamenti corretti che devono restare (rete di sicurezza
contro un filtro troppo zelante).

### ROCCO V2 — pertinenza delle ipotesi
Su una lavatrice in appartamento uscivano "Dispersione DC verso terra:
pannello con celle rotte, cavo MC4" e "Cavo di terra a valle del relè".
Misurato sui 21 casi italiani: **42 ipotesi attive su 234** appartenevano a
una famiglia che il racconto non giustifica, e **5 finivano fra le 4
stampate**.

| metrica | prima | dopo |
|---|---|---|
| ipotesi fuori contesto fra le stampate | 5/69 | **0/72** |
| causa reale fra le ipotesi stampate | 12/21 | **14/21** |
| causa reale fra le attive | 15/21 | 15/21 |

`DOMAIN_FAMILIES`: quattro famiglie (fotovoltaico, automazione/PLC,
commutazione, illuminazione elettronica), ognuna con due regex — `label`
identifica l'ipotesi, `story` elenca i marcatori che la rendono applicabile.
Dottrina di KR-11: si legge il **racconto**, l'applicabilità strutturale non
è una misura.

**Retrocessione, non esclusione.** La famiglia è un'euristica sul linguaggio,
non una legge fisica: l'ipotesi resta viva e torna su se l'utente nomina ciò
che manca. I marcatori di `commutazione` sono larghi per una ragione
misurata: una versione più stretta dichiarava fuori contesto la causa vera di
FORUM-IT-010 (contattore, su un racconto che dice "motore trifase su
compressore" senza nominarlo) e di FORUM-SPEC-001 (relè crepuscolare, su "le
luci si accendono da sole"). Motori, compressori, caldaie contengono organi
di commutazione anche quando il cliente non li nomina.

**Un solo ordinamento**, `makeHypothesisComparator`, chiavi in quest'ordine:
1. pertinenza al contesto 2. conferma per misura 3. probabilità del
simulatore 4. segnale del controfattuale 5. numero di prove 6. punteggi
appresi. La pertinenza precede la certezza: un'ipotesi inapplicabile non
guida nemmeno se una soglia l'ha confermata. Se la soglia conferma **solo**
etichette inapplicabili la certezza non sale.

La probabilità precede il conteggio delle prove perché la prova misurata è
già espressa dalla chiave `confirmed`, e il resto di `supporting_evidence` è
in gran parte il controfattuale ("una previsione combacia"). Misurato: 12/21
col conteggio davanti, 14/21 con la probabilità.

**Due difetti trovati qui**, stessa famiglia di sempre:
- Una **seconda `sort`** girava dopo `verifyConclusion` e sovrascriveva la
  graduatoria: il narratore legge le prime 8 di `cs.hypotheses` e ripescava
  le retrocesse. Ora l'ordine del motore è quello del `case_state`.
- Quella formula pesava `h.probability` per il 60%: **campo mai esistito**
  (il campo è `probabilita`). Valeva 0.5 per tutti, una costante.

**Scartata e da non riprovare**: pesare la sovrapposizione lessicale fra
etichetta e racconto. Premia la tautologia (su IT-007 metteva "inverter in
errore" sopra "guasto di isolamento lato DC", la causa vera) e cade sugli
omonimi (su IT-003 premiava le ipotesi sul quadro elettrico perché il cliente
aveva appeso un **quadro** al muro).

Test: `backend/rocco_v2/neural/test/pertinenza.test.js` — 31 asserzioni.

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

### Banco di prova — la pagella (`bench/rocco_bench.js`)

```bash
cd backend && node bench/rocco_bench.js
```

Un comando, una pagella, **esce con errore se una metrica peggiora**. Prima
esisteva solo nelle misure scritte a mano, una per blocco, che sparivano col
blocco: senza una pagella stabile non si vede né un miglioramento né una
regressione, e con 21 casi il rischio non è sbagliare una regola — è tararla
su 21 esempi senza accorgersene.

**Linea di base (2026-10-11, deterministica — ROCCO da solo, senza provider):**

| metrica | valore |
|---|---|
| componenti inesistenti | 0 |
| ipotesi fuori contesto stampate | 0 |
| certezze senza misura | 0 |
| conferme fuori bersaglio | 0 |
| contesto multi-turn perso | 0 |
| causa reale fra le ipotesi stampate | **15/21** |
| causa reale fra le attive | **16/21** |
| casi conclusi con la misura | 9/21 (su 13 che la prescrivono) |
| precedente riusato · in testa | **17/21 · 17/21** |
| esperienza persa | 0 |
| esame 48 casi: causa corretta | **28/48** |
| esame 48 casi: verifica proposta | **45/48** |

**Si alzano quando una misura le supera, non si abbassano per far passare
una modifica.** Se una scende è una regressione: va spiegata.

Tre cose che il banco ha corretto appena accesso, due delle quali erano
**numeri riportati male da me**:
1. Il motore non era deterministico (vedi sotto).
2. Lo stato appreso falsava la misura: il caso N+1 girava su un motore che
   aveva già visto il caso N. Il banco fotografa `data/**.json`, lo
   ripristina **prima di ogni caso** e lo rimette come era alla fine.
3. Ero io a inventare le premesse: la misura del secondo turno la scelevo da
   una parola della domanda. Ora è **dedotta dalle `verifiche` del caso**, e
   dove il caso non prescrive strumenti il secondo turno non si fa (13 su 21).

`METRO_CIECO` elenca i casi in cui il confronto lessicale è noto per
sbagliare (FORUM-IT-010: "conduttore interrotto" = la mancanza di fase del
caso, detta con altre parole): esclusi dal conteggio e **stampati come
nota**, così una conferma davvero fuori bersaglio resta visibile.

In fondo stampa il numero che limita tutto: **46 voci di vocabolario su 255
(18%) esercitate da frasi vere, 48 casi con causa nota (21 italiani)**.

### Il neurale è riproducibile (`neural_core.rnd()`)
41 `Math.random()` nel percorso neurale: `neural_core` inizializzava i pesi
e mescolava gli esempi a caso, `neural_patterns` **generava a caso i propri
dati di addestramento** (280 esempi che nessuno ha mai misurato, diversi a
ogni avvio) — e il punteggio neurale è una delle chiavi con cui le ipotesi
vengono ordinate. Due corse di fila davano 10 e 11 casi conclusi: **rumore**,
indistinguibile da una regressione.

Ora la casualità viene da `nc.rnd()`, PRNG con seme fisso, `nc.setSeed()`
per variarlo deliberatamente. Zero `Math.random()` residui. Misurato: due
corse identiche, causa vera stampata 14 → **15/21**.

Il banco ha smesso di aver bisogno del suo trucco (fissava `Math.random`) e
quel codice è stato **rimosso** invece di restare a sembrare utile.

**Cosa fa il neurale, verificato:** ordina (`scoreHypotheses`), rileva la
novità, costruisce il modello del mondo, e **decide se consultare l'IA** (se
i punteggi sono alti e concordanti, ROCCO basta a sé). **Non afferma**: le
ipotesi vengono dal motore, dal grafo e dal simulatore —
`simulator_state.json` è conoscenza vera (causa, probabilità, come la
verifico, cosa esclude). Nel comparatore il punteggio appreso è l'**ultima**
chiave, dopo la prova misurata.

### Le norme in un posto solo (`knowledge/limiti.js`)
Gli stessi numeri vivevano in sei posti, **e avevano già divergito**:

| | motore | rete neurale | confirm rule |
|---|---|---|---|
| tensione sana | 207–253 V | 220–240 V | — |
| isolamento sano | ≥ 1 MΩ | ≥ 5 MΩ | ≥ 1 MΩ |
| temperatura morsetto | 80 °C | — | 70 °C |

22 limiti, ognuno con valore, unità, verso del confronto, etichetta italiana
**e provenienza**: 16 da `norma` citata dal curriculum, 5 dalla `scuola`
senza codice, **1 sola da `pratica`** — la temperatura assoluta, perché la
scuola non insegna una temperatura: insegna il **ΔT fra le fasi** (CEI 11-27:
<10 °C regolare, >30 °C critico) e le classi di isolamento. I 70 °C erano un
numero inventato.

**Il ponte con la scuola è un test, non una convenzione**: `limiti.test.js`
verifica che ogni limite risalga a un livello di curriculum esistente, che
la norma dichiarata sia citata, e **che il numero compaia nel testo che la
scuola insegna**. Se qualcuno cambia uno dei due senza l'altro, si rompe.
Verifica anche che nessun consumatore si tenga più il proprio letterale.

Consumatori agganciati: motore, confirm/kill rules, narratore (i numeri
ammessi nelle risposte non sono più un elenco a mano), inviluppo di
addestramento della rete.

### Banca dispositivi (`knowledge/dispositivi.json`)
Era l'unica conoscenza che per esistere richiedeva Postgres: col DB spento
ROCCO restava **senza niente** sui dispositivi (`[DEVICE KB] Schema error`).
E anche funzionante era collegata **solo** al vecchio `/api/chat`:
l'orchestratore V2 — il percorso che il frontend usa — non la vedeva.

`knowledge/build_dispositivi.js` raccoglie le **sei fonti** che ROCCO già
aveva: seed SQL (35 apparecchi con targa e norma, 17 guasti, 17 misure),
`components.json` (50 → 219 guasti con le verifiche di campo),
`encyclopedia.json` (24 → 46 guasti con prove e rimedi),
`failure_patterns` (40 pattern d'impianto), `limiti.js` (22 riferimenti).
→ **109 dispositivi · 322 guasti · 39 riferimenti · 36 famiglie.**

Ogni voce porta `fonte`; **le 33 lacune sono scritte nel file**, e un valore
atteso che la fonte non dà resta "non specificato nella fonte" e **non viene
stampato**. Il file è generato: si corregge la fonte e si rigenera.

Nel ragionamento (passo 5c-bis): un guasto noto **è** un'ipotesi, e porta
verifica, strumento, valore atteso e norma. Massimo 3 per caso, poi passa
per le stesse regole di tutte. Misurato: causa reale stampata 15 → **16/21**.

### Il giro dell'apprendimento — il caso chiuso arriva alle tre memorie
`guasto chiuso → causa capita → esperienza salvata → ROCCO la riusa.`

Il giro era **interrotto ai due capi, e le due metà si nascondevano a
vicenda** — la variante peggiore del difetto ricorrente, perché il lettore
non protesta (trova una lista vuota) e lo scrittore non manca a nessuno.

- **Scrittura assente**: il bottone "Caso risolto" (`app.js:1196` →
  `/api/rocco/close-case`) addestrava **solo** i pesi neurali. Prova a
  riposo: `data/rocco-v2-memory.json` = `{"closed_cases": []}`, sempre.
- **Lettura a vuoto**: `ragionaPerAnalogia()` (orchestrator, D3) quei casi
  li leggeva da sempre, trovandone zero.

Un caso chiuso va in **tre** posti, perché sono tre cose diverse:
1. **il caso citabile** (`rocco_v2/memory.js`) — causa accertata, verifica
   che l'ha decisa, ipotesi scartate. È quello che ROCCO riusa;
2. **la lezione** (`rocco_university/memory.js`, materia `diagnosi_guasti`);
3. **i pesi** (`neural/neural_integration.js`), che ordinano e non affermano.

`/api/rocco/correct` registra la pista smentita come **errore ricorrente**
nella memoria didattica, dove il contatore conta quante volte ROCCO l'ha
ripetuta. Il premere il bottone **è** la validazione: l'endpoint dichiara
`validated: true`, senza cui `saveValidatedClosedCase` rifiuta il caso.

**Il precedente ordina, non afferma.** `h.esperienza = { caso_id,
somiglianza }` ha una chiave sua in `makeHypothesisComparator`: **sopra** la
probabilità del simulatore — `probabilita` è un a priori, il precedente è un
fatto accaduto e verificato, e un a priori non batte un'osservazione — e
**sotto** `confirmed`, perché la misura di adesso conta più di una misura
dell'altra volta. Non scrive `supporting_evidence` (farebbe salire la
certezza a `probable` senza una misura) né `probabilita`.

`ragiona()` deduplica tenendo la **prima** ipotesi e l'analogia è
concatenata per ultima: un precedente che il motore aveva già pensato da sé
veniva scartato, perdendo `esperienza` proprio quando le due fonti
concordano — il caso più forte. Ora il duplicato **consegna** il precedente
all'ipotesi che resta (catena e `confirm_tests` compresi).

**Il banco misura l'apprendimento** (sezione APPRENDIMENTO). Serviva una
metrica a sé: il banco ripristina `data/**.json` prima di ogni caso, quindi
nelle altre misure i casi chiusi sono **sempre zero** — ed è per questo che
nessuna misura si era accorta della strada rotta. Il caso viene chiuso con
la `causa_reale` del corpus e la verifica che il corpus prescrive.

Misurato, chiave dell'esperienza sotto e sopra la probabilità:

| metrica | sotto | sopra |
|---|---|---|
| precedente fra le ipotesi stampate | 17/21 | 17/21 |
| precedente in testa | 12/21 | **17/21** |
| tutto il resto | invariato | invariato |

I 4 casi restanti non sono esperienza perduta e il banco li **stampa come
note**: 3 arresti di sicurezza (il caso non arriva al ragionamento) e 1
precedente escluso dal controfattuale — il precedente che passa per le
stesse regole di tutte le ipotesi.

Test: `rocco_v2/neural/test/caso_chiuso.test.js` — 27 asserzioni, con lo
stato fotografato e rimesso: un test non lascia casi inventati nella memoria
di produzione. La §5 è quella che conta: **un precedente non fa salire la
certezza**.

### Un solo pool, e tre memorie dichiarate in /health
Il progetto apriva **tre** `new Pool`: `db.js`,
`modules/rocco_university/memory.js` e `rocco/rocco_memoria.js` —
quest'ultimo **senza `ssl`**, quindi su Render fallisce anche a database
vivo. Ora ne resta **uno**, in `db.js`.

**Il ripiego va agganciato al fallimento della query, non a `if (!pool)`**:
`pool` è un oggetto anche col DB morto, quindi quella guardia non scatta.
Entrambi i moduli usano ora un `tryQuery()` che non lancia e ricade su
disco; dopo un fallimento aspettano 60 s prima di ritentare, così un DB
morto non costa un timeout per messaggio.

- `store/universityStore.js` — memoria didattica su disco (ES5, tmp+rename,
  nessuna eccezione verso la chat). Era l'unica conoscenza di ROCCO che per
  esistere richiedeva un database: col DB muto ogni caso reale e ogni errore
  ricorrente andavano persi **in silenzio**, perché le scritture sono
  fire-and-forget (`.catch(() => {})`).
- `rocco/rocco_memoria.js` ridotto a quel che solo lui fa: creare lo schema
  (le tabelle servono agli endpoint `/api/rocco/*` vivi) e dare il
  **contesto di progetto** (impianto attivo, circuiti calcolati).
  **Sei funzioni su nove non le chiamava nessuno** e duplicavano SQL che
  `server.js` fa già sul pool condiviso.
- **`cerca_casi_simili` ritirata per sostanza, non per pulizia**: leggeva
  `rocco_knowledge_casi` **senza filtrare `verificato`**, e lì
  `autoSaveDiagnosi` inserisce con `verificato = FALSE` perché la causa è
  *ipotizzata da ROCCO*. Una supposizione tornava nel prompt del messaggio
  dopo intestata "[CASI SIMILI DAL DB ROCCO]", cioè come precedente. Nello
  stesso handler, venti righe più su, `fetchKnowledgeCasi()` fa la lettura
  giusta: FTS italiano e `verificato = TRUE`.

`/health` espone `memorie`: chi tiene la didattica (postgres o locale, con
quanti record), quanti casi chiusi, se il contesto di progetto è
disponibile. Senza quella riga un DB muto si vedeva solo scorrendo i log
d'avvio — e con le scritture fire-and-forget non si vedeva affatto.

### Un'ipotesi non è un fatto (auto-conferma)
Il motore riaccodava le proprie prime tre ipotesi dentro le `osservazioni`.
Quelle finiscono in `facts_confirmed`, e **da `facts_confirmed` dipendono due
giudici**: `causal_model.valutaPrevisioni(previsioni, fatti)` con
`fatti = [].concat(arr(cs.facts_confirmed), …)`, e `buildEvidenceContext()`,
da cui le confirm rules ricavano i **segnali**. ROCCO trovava quindi le
proprie supposizioni fra le prove e le dichiarava confermate.

Misurato su FORUM-IT-007 (inverter con ISO Fault): l'ipotesi "Dispersione DC
verso terra…" arrivava prima con `supporting_evidence: ["Controfattuale: 1
previsioni confermate dai fatti"]`, e quel fatto era la riga
`IPOTESI: [NON_VERIFIABLE] Dispersione DC verso terra: …` — l'ipotesi stessa.

**Linea di base `causa_vera_stampata` abbassata 16 → 15**, e questa è
l'unica ragione per cui una linea si abbassa: la misura era **gonfiata da un
difetto**, non è una capacità persa. `causa_vera_attiva` resta 16; al primo
turno i `probable` passano da 3 a 1 — due poggiavano su quella prova.

`confirm_rules.test.js` pretendeva che **ogni** ipotesi confermata facesse
salire la certezza finale: contraddice la guardia di pertinenza, che rifiuta
di dire CONFERMATO quando le sole etichette confermate sono inapplicabili.
Le due regole convivevano grazie a quelle conferme auto-generate. Ora
l'asserzione dice il contratto vero — la certezza sale su ogni caso con una
conferma **pertinente** — e stampa i casi che non salgono.

### Niente slug davanti all'elettricista (alla fonte)
Nelle `osservazioni` si leggeva `Componente riconosciuto [RCD-AC-2P]: rcd.`
e `30mA (corrente_ma)`. Corretto **alla fonte** (`engine/diagnosticEngine.js`
consulta `rocco_v2/lexicon.js`, modulo puro senza dipendenze) e non con un
filtro a valle: un filtro nasconde il difetto, e la stessa riga passa per
altre due strade — risposta offline e prompt del vecchio `/api/chat` — dove
quel filtro non c'è. Tre voci aggiunte a `MEASURE_LABELS`: `corrente_ma`
(**"corrente in mA"**, non "di dispersione": in italiano "30 mA" è quasi
sempre la *taratura* del differenziale), `frequenza`, `velocita`.
`"componente riconosciuto"` entra in `ENGINE_INTERNAL_PREFIXES` perché
duplica COMPONENTI COINVOLTI.

Test: `osservazioni_pulite.test.js` — 34 asserzioni (§4 niente slug alla
fonte, §5 nessuna ipotesi fra le osservazioni, nessuna etichetta di certezza
in inglese).

### Il loop morto, i due strumenti e la suite rossa: ritirati (11/10)
`tool_registry.js` registrava 5 strumenti, ma `decideToolNeeded()` può
restituirne solo 3: `vision_tool`, `calc_tool`, `recognition_tool`.
`closed_cases_tool` e `knowledge_lookup_tool` **non li chiamava nessuno** nel
percorso vivo — li invocava solo `orchestrator_legacy.js` via `planner.js`.
Non erano conoscenza perduta, erano doppie strade: i casi chiusi entrano da
`ragionaPerAnalogia()` (stessa memoria, `rocco_v2/memory.js`) e la knowledge
base da `ragionaDaKnowledge()`. **Uno strumento registrato e non
raggiungibile è peggio di nessuno strumento: fa credere che una capacità ci
sia.**

Legacy + planner + verifier + i due strumenti erano **un'isola chiusa**, e
`test/rocco-v2-core.test.js` l'unica cosa che la toccava da fuori. Ritirati
insieme: **3.924 righe**. Non raggiungibile da `server.js`: 5.010 → 2.806
righe, e quel che resta sono i comandi CLI documentati (`ingest`, `migrate`,
`build_dispositivi`) più `test.js`, che è lo smoke test di `npm run smoke`.

**La suite non è stata buttata, è stata misurata.** Provando ogni funzione
in isolamento contro il motore attuale: **8 verdi su 52**. Le 44 rosse
chiamano funzioni che sul modulo attuale non esistono (`derivePrimaryGap`,
`selectNextBestAction`, `scoreEvidenceWeight`, `resolveEvidenceConflicts`,
`buildCanonicalSuggestedCheck`, `isAmbiguousLowContextCase`) o pretendono il
vocabolario di traccia del loop (`loop_start`, `loop_stop`, `model_result`).
Le 52 non erano copertura latente: **il runner si fermava al primo
fallimento**, quindi 35 funzioni non venivano mai eseguite e 22 lanciavano
`TypeError` sulla prima riga.

Le 8 valide vivono in `test/motore_attuale.test.js`, con il testo delle
asserzioni **estratto, non riscritto**. Due di loro avevano trovato i difetti
dei metadati (`runtime_trace` null, `fallback_used` mai dichiarato), ed è
l'unico posto che verifica il contratto del `case_state` e che il
formattatore non alteri la diagnosi. `verifier.verifyFormatterNeutrality()`
era un `JSON.stringify` travestito da modulo del motore: è diventato
un'asserzione.

**`settings.neuralIntegration` è ora iniettabile** come `providerGateway` e
`toolRegistry`. Serviva a rendere deterministico un contratto: il ripiego del
ragionatore si prova solo se ROCCO decide di consultare l'IA, e quella
decisione la influenza il punteggio di novità del neurale — che cambia con lo
stato appreso sul disco. Quelle due asserzioni passavano **per fortuna**: con
`data/neural/` vuota fallivano.

### `npm test` esegue tutto, e non tocca la memoria di chi lavora
`npm test` eseguiva solo `test.js`: cinque chiamate HTTP, verdi. Le 30 suite
del motore non le lanciava **nessun comando**. Per mesi "i test passano" ha
voluto dire che il server rispondeva.

`test/run_all.js` (→ `npm test`) esegue le **39 suite**, poi conta, e **esce
diverso da zero** se una fallisce. Fermarsi al primo rosso è il motivo per
cui 35 funzioni sono rimaste invisibili. `npm run smoke` resta lo smoke test,
`npm run bench` la pagella.

E isola lo stato appreso: le suite neurali si addestrano e **salvano**, quindi
un `npm test` riscriveva pesi, embedding, episodi e grafo di chi lavora su
quella macchina. Misurato: sei file su otto diversi dopo una corsa. Ora
vengono accantonati e rimessi identici — verificato con md5 — e le suite sono
anche più veloci (`confirm_rules` 39s → 11s: non carica più un grafo da
827 KB).

### Lo stato appreso non va in git, e il banco parte dal seed dichiarato
`data/neural/*.json`, `data/rocco-learning.json` e `data/rocco-v2-memory.json`
erano **versionati**. Tre danni:
- ogni diagnosi sporcava il working tree con un diff da ~1 MB
  (`knowledge_graph.json` da solo è 827 KB, riscritto ogni volta);
- **falsa durabilità**: il server non committa niente, quindi in produzione
  quei file non erano salvati da git comunque;
- il banco misurava quel che *quella macchina* aveva accumulato: due
  computer, due pagelle — la non-determinatezza per cui il banco esiste,
  rientrata da un'altra porta.

Ora sono in `.gitignore`. Restano versionati `simulator_state.json`
(conoscenza scritta a mano: per chiavi i sintomi in italiano, per valori le
cause con probabilità, verifica ed esclusioni) e `encyclopedia.json`.
Verificato: un clone nuovo parte, diagnostica con tutte e 7 le sezioni e si
ricrea i file di runtime da sé.

Il banco accantona lo stato accumulato per tutta la corsa e lo rimette
identico alla fine. **L'accantonamento va fatto prima dei `require`**: il
neurale carica il suo stato in memoria quando l'orchestratore viene
richiesto, quindi rimuovere i file dopo non cambia nulla — prima versione di
questa correzione, e non si vedeva dai numeri.

**Linee di base alzate senza toccare il motore**: causa vera stampata
15 → **16/21**, attiva 16 → **18/21**. Lo stato appreso, su questo corpus,
**costava** un caso stampato e due attivi.

**Domanda aperta, stampata in fondo alla pagella**: perché il "ha visto"
sottrae invece di aggiungere. Va capito **prima** di dare più peso ai
punteggi appresi.

### Il primo guasto vero — e la lacuna che ha trovato

Il 2026-10-11 ROCCO ha lavorato sul primo guasto reale, non di corpus:

> *"c'è un teleruttore che comanda una pompa sommersa di un pozzo la bobina
> fa rumore, la centralina della pompa sommersa il display segna che manca
> una fase"*

**Cosa ha fatto bene.** Ha letto entrambi i sintomi; quattro ipotesi tutte
pertinenti al contattore, fra cui la causa vera (*fusibile bruciato su una
fase*); prossimo passo strumentale con i morsetti giusti e la soglia
(*misurare la tensione A1-A2, ±15% del nominale*); certezza `DA VERIFICARE`,
che senza misure è l'unica onesta.

**Cosa ha mancato.** Le ha messe in **parallelo** invece di vedere la catena:
un fusibile aperto spiega **insieme** la fase mancante sul display, il
teleruttore che non chiude e ronza, e — restando in quello stato — la bobina
che si brucia. Era un'unica causa con tre conseguenze.

**La causa vera, confermata dall'elettricista**: fusibile aperto; teleruttore
sostituito perché la bobina (230V) era andata completamente.

**Il giro dell'apprendimento ha funzionato end-to-end**, per la prima volta
su un caso vero: `/api/rocco/close-case` → tre memorie (`casi_chiusi`,
`memoria_didattica` su disco col DB spento, `neurale`) → e su un secondo
pozzo detto con altre parole ROCCO mette **il caso di ieri in prima
posizione**, marcato come precedente.

**Una trappola trovata chiudendo il caso, e l'errore era mio.**
`findRelevantClosedCases` somma **+0.15 se il dominio combacia** e
`ragionaPerAnalogia` filtra a `match_score >= 0.25`: con il dominio il
punteggio era 0.317, senza 0.167. Nel payload di chiusura avevo scritto
`domain: "elettrico"`, mentre la pipeline produce `domain: "tensione"` — il
precedente era archiviato con un dominio che ROCCO non genera mai, quindi
cadeva sotto soglia e non veniva mai riusato. **Chi chiude un caso deve
passare il `case_state` vero**, non un dominio scritto a mano: è quello che
fa il bottone del frontend. Resta da guardare che `domain` valga "tensione"
— che è una **grandezza**, non un dominio: campo col vocabolario sbagliato.

**La lacuna che il caso ha trovato, misurata**: la parola "sommersa" compare
**zero volte** in tutta la banca — 0 dispositivi, 0 guasti — e non esiste una
famiglia POMPA. Le uniche pompe sono i circolatori del riscaldamento, in
famiglia TERMICO. **Per questo nella risposta usciva "Pompa di
circolazione"**: non era un iperonimo sbagliato, era l'unica pompa che aveva.

**Le lacune si vedevano solo sulle famiglie presenti.** Per ognuna si
dichiarava se mancavano guasti o valori di riferimento; una famiglia che non
esiste affatto non poteva comparire, quindi *"di questa cosa ROCCO non sa
niente"* era l'unico buco invisibile. Ora `FAMIGLIE_ATTESE` in
`build_dispositivi.js` dichiara le famiglie che il mestiere ha e la banca no,
col perché accanto: **34 lacune** invece di 33.

**E la famiglia POMPA non è un modello, è una configurazione.** La
distinzione che conta non è l'uso — pozzo, drenaggio, acque nere, autoclave,
irrigazione — ma **essere un motore che lavora immerso e in fondo a un cavo
lungo**. I guasti del motore (avvolgimento, rotore bloccato, perdita di fase)
sono già in MOTORE e **non vanno duplicati**: manca ciò che dipende dalla
configurazione — acqua negli avvolgimenti, giunzione del cavo nel pozzetto,
caduta di tensione sulla lunghezza, marcia a secco.

**Perché i valori non sono stati scritti.** Cercando le soglie d'isolamento
dei motori sommersi ho trovato numeri (200 MΩ nuovo, 10 usato, 0,5 = estrarre
la pompa) **solo in riassunti di ricerca**: il manuale primario è un PDF che
qui non si legge, e la copia HTML rimanda al manuale senza riportare la
tabella. Il file lo dice da sé:

> *"Ogni voce porta `fonte`. Nessuna riga nasce qui: se un dato non c'è in
> nessuna delle sei fonti, **manca**, e il file lo dichiara nella sezione
> `lacune`. Dire «non lo so» è parte della conoscenza."*

Non esiste una `fonte` che valga "letto in un riassunto", e la tassonomia dei
limiti (`norma` · `scuola` · `pratica`) non ne prevede una. Quindi la lacuna
è dichiarata e i numeri non sono entrati. **E i numeri di marca non
servirebbero comunque**: quello che generalizza è il criterio **relativo** —
*le tre resistenze uguali fra loro*, *isolamento fra conduttori e terra con
la pompa isolata*, *quando scatta* — che non ha bisogno di un modello. Il
curriculum già scrive così: *"confrontare con datasheet (apertura =
bruciata)"*.

**Dai forum: resa zero.** Quattro thread italiani scaricati per intero, **0
con la causa verificata**: finiscono tutti in ipotesi (*"probabilmente il
filo non era inserito bene"*), uno dopo due settimane in officina si chiude
senza soluzione. Per un **esame** servono le risposte, e i forum danno
domande. La crescita vera del corpus viene dai casi che l'elettricista
chiude, non dalla rete.

### Una causa e le sue conseguenze (12/10)

L'altro difetto che la misura aveva trovato, ed è **quello che Romeo aveva
visto sul campo**: sul teleruttore della pompa sommersa ROCCO metteva in
parallelo *fusibile aperto*, *manca una fase*, *la bobina ronza* — una
causa e i suoi effetti, elencati come piste concorrenti. L'elettricista
legge quattro strade dove ce n'è una. **8 coppie su 7 casi** nel corpus.

`RELAZIONI_CAUSALI` in `rocco_v2/forme_causa.js` dichiara quali fenomeni ne
producono altri. Quattro, e nient'altro: `infiltrazione → dispersione`
(6 coppie sul corpus), `interruzione → mancanza_fase` (FORUM-IT-010, la
forma del guasto vero), `contatto_resistivo → surriscaldamento`,
`sovraccarico → surriscaldamento`.

**Tre relazioni della prima stesura erano sbagliate, e non si vedeva dai
numeri**: *"conduttore interrotto → protezione a monte scattata"* e
*"→ assenza di rete"*. Un conduttore che si apre non fa scattare niente e
non causa un blackout: quelle sono **cause alternative dello stesso
sintomo**, non conseguenze. Le ha trovate la lettura riga per riga della
prova a secco — 13 coppie di cui 4 false — e ora sono tre asserzioni
negative in `forme_causa.test.js` §7.

**Non esclude e non fonde.** L'effetto resta un'ipotesi viva: la dispersione
esiste anche senz'acqua, e sopprimerla perché c'è un'ipotesi di infiltrazione
toglierebbe una pista vera. Si aggiunge una riga alla catena della causa:

```
- fusibile bruciato, contatto aperto, cavo interrotto
  → Spiegherebbe anche: mancanza di una fase (trifase)
```

Si cita la **tesi** dell'altra ipotesi e non l'etichetta intera: più corta,
e non trascina nella bozza i numeri della specificazione — che il narratore
rifiuterebbe come non ricavabili dai dati del caso, tornando alla bozza per
una riga di nota.

| metrica | valore |
|---|---|
| coppie causa → effetto fra le 4 righe stampate | **9 su 8 casi** |
| coppie fra tutte le attive | 57 su 11 casi |
| tutte le metriche del banco | **invariate, 0 regressioni** |

**Il banco non si muove, ed è atteso**: nessuna metrica misura la catena, e
non se n'è aggiunta una perché la dichiarazione non cambia *quali* ipotesi
ROCCO fa — cambia quel che l'elettricista capisce leggendole. Il numero che
la riguarda è la traccia `catene_dichiarate`.

**E ora ordina — ma con un freno, e il freno è tutto.**

Il banco non lo vedeva: sull'italiano è saturo (21/21 ovunque) e **non
esisteva una metrica per «la causa vera è la PRIMA riga»** — che è quella
su cui l'elettricista va a lavorare. Aggiunta: `causa_vera_in_testa`.

| versione | causa vera in testa |
|---|---|
| la catena non ordina | 14/21 |
| la catena ordina, **senza freno** | **11/21** — peggio |
| la catena ordina **solo se l'ipotesi ha una prova** | **15/21** |

**Perché senza freno peggiora**, ed è il punto da ricordare: la relazione è
un **condizionale** — *se ci fosse dell'acqua, spiegherebbe la dispersione*
— e metterla in testa la trasforma in un'affermazione. Su FORUM-IT-001
(lavatrice), IT-013 (scaldabagno) e IT-015 (bulloni dello statore) usciva
in prima riga *"umidità in cassetta di derivazione"*, che il racconto non
nomina. ROCCO preferiva una causa che **nessuno aveva suggerito** solo
perché avrebbe spiegato un'altra: la tautologia già scartata altrove, in
una forma nuova.

Il freno è una riga: la chiave conta **solo se l'ipotesi che spiega ha a sua
volta una prova** (`supporting_evidence`). Allora l'acqua vince su IT-009
(«il differenziale scatta quando piove forte» — l'acqua è nel racconto) e
non vince sulla lavatrice.

La chiave sta **sotto il precedente verificato e sopra la probabilità**:
spiegare di più è una *deduzione* su questo caso, il precedente è un fatto
accaduto su un impianto vero, `probabilita` è un a priori. Stessa dottrina
con cui `esperienza` sta sopra `probabilita`.

**Il guadagno, caso per caso**: entra FORUM-IT-010 — *"fusibile bruciato,
contatto aperto, cavo interrotto"* passa dalla quarta riga alla prima, con
sotto *"Spiegherebbe anche: mancanza di una fase"*. È la forma esatta del
guasto vero di Romeo, ed è la prima volta che ROCCO la mette in testa.

**L'ordine dei passi conta**: `rilevaCatene → ordinamento → fusione →
scriviCatene`. `spiega` deve esistere prima che si ordini perché il
comparatore lo legge — anche per la sort di `verifyConclusion`, altrimenti
la diagnosi nominata e la prima riga delle IPOTESI non sarebbero più la
stessa cosa; e il testo si scrive dopo la fusione, altrimenti una riga
citerebbe un'ipotesi che nel frattempo è stata assorbita.

**Resta aperto**: le altre tre relazioni (`contatto_resistivo →
surriscaldamento`, `sovraccarico → surriscaldamento`) non sono esercitate da
nessun caso del corpus — vengono dalla fisica, non da una misura.

---

### Non dare per scontato — e la regola era già scritta (12/10)

`verifica_giusta` era **10 su 18**: otto volte il PROSSIMO PASSO non era la
verifica che il caso prescrive. Prima di toccare il punteggio, la domanda
giusta: **la verifica mancava, o c'era e non veniva scelta?**

Misurato ricostruendo il pool dei candidati caso per caso: **in 6 casi su 8
il candidato giusto era già fra i test delle ipotesi attive.** Solo 2 sono
conoscenza che manca (FORUM-IT-005, FORUM-SPEC-001). Di nuovo «lo sa e non ci
arriva», non «non lo sa».

**Il difetto, e la regola di mestiere che lo nomina.** Le tre volte in cui ha
vinto una formula di `toInstruction()` che **presuppone uno scenario**, era
sempre sbagliata:

| caso | il cliente scrive | ROCCO proponeva |
|---|---|---|
| FORUM-IT-002 | *"uno non resta su, fa TRAC e ricade"* | *"verifica che le protezioni **siano chiuse**"* |
| FORUM-SPEC-001 | *"le luci si accendono **da sole**"* | *"verifica che Circuito luci abbia tensione e **non funzioni comunque**"* |
| FORUM-IT-012 | *"il differenziale **scatta**"* | idem — ma un differenziale che scatta **funziona**: sta facendo il suo mestiere |

Romeo l'ha detta così: *«una cosa non deve assolutamente fare ROCCO è dare
tutto per scontato.»* **Ed è già la prima delle `GOLDEN_RULES`:** *"Misurare
SEMPRE IN e OUT di ogni protezione: **non dare per scontato** che la tensione
a monte arrivi a valle."*

**Perché non era applicata: `rocco_v2` non legge `policies.js`. Zero
occorrenze.** Le 7 HARD_SAFETY_RULES, le 14 GOLDEN_RULES e le 15
BANNED_PHRASES arrivano solo a `rocco/index.js` (il prompt del vecchio
`/api/chat`), a `postcheck.js` e a un endpoint di `server.js` che le
**conta** — `goldenRules: 14` dichiarato come capacità mentre il motore vivo
non ne vede nessuna. Il difetto ricorrente di questo repo applicato al codice
di comportamento.

`check_phrasing.PREMESSE` dichiara la **premessa** di un passo e le classi di
comportamento che la smentiscono — vocabolario di `forme_sintomo.js`, niente
di nuovo. Due voci: *protezioni chiuse* (smentita da `scatta`) e *alimentato
e inerte* (smentita da `scatta`, `spontaneo`, `riduce` — rendere meno non è
non funzionare). Si legge il **racconto**, come la pertinenza e KR-11:
l'applicabilità di un passo è strutturale, non è una misura. **Penalità (−60)
e non esclusione**, come `ALREADY_DONE`: se ogni candidato avesse una
premessa smentita ROCCO deve comunque proporre il migliore.

Misurato prima di scrivere la regola: quelle formule vincevano su **3 casi,
tutti e tre sbagliati, e su zero dei 10 giusti** — penalizzarle non poteva
rompere niente.

**Scartato e da non riprovare, misurato: pesare solo le radici distintive.**
`coverage` conta quante ipotesi parlano della stessa grandezza, per radice, e
una frase di parole comuni combacia con tutte per costruzione: sembrava la
tautologia già scartata due volte. Provata (radice in più di metà delle
ipotesi = generica, ignorata): **11 → 9 su 18.** La ragione era scritta nel
commento sopra la funzione e l'avevo letto senza capirlo — **la radice comune
è la leva**: su un differenziale che scatta `isolam` ricorre nei test di mezze
ipotesi proprio perché misurare l'isolamento è il passo giusto. Ha fatto
perdere FORUM-IT-001 e FORUM-IT-009, che erano corretti. La nota sta in
`orchestrator.js` sopra `scoreDiscrimination`.

| metrica | prima | dopo |
|---|---|---|
| **verifica giusta** | 10/18 | **11/18** |
| formule prefabbricate scelte come passo | 3 (tutte sbagliate) | **0** |
| tutte le altre metriche del banco | — | **invariate, 0 regressioni** |

**I 7 che restano, divisi per natura** — e sono tre cose diverse, non sette
difetti:
- **2 conoscenza mancante**: IT-005 (prescrive solo controlli manuali in
  cassetta), SPEC-001 (relè crepuscolare — nessun candidato lo nomina);
- **3 graduatoria delle ipotesi, non del passo**: su SPEC-002/004/005 il test
  giusto appartiene a un'ipotesi che non è in testa. È la **stessa radice** di
  `causa_vera_in_testa` 16/21 — IT-003 e SPEC-004 hanno entrambi *"protezione
  a monte scattata"* in prima riga, su racconti dove nessuno ha detto che
  qualcosa è scattato;
- **2 metro cieco, non dichiarato**: su IT-003 ROCCO propone *"prova di
  continuità su Circuito **prese**"* e il caso prescrive *"misura continuità
  del cavo dalla cassetta alla **presa**"* — **sono la stessa prova**, e il
  confronto per radice a sei caratteri non vede `presa`/`prese` (entrambe di
  5). Stessa cosa su IT-005 con `cassetta`/`cassette`. È il difetto del
  singolare/plurale italiano per la quarta volta, questa volta **nel metro**.
  Non è stato corretto qui di proposito: allargare il metro alza il voto senza
  cambiare ROCCO, e va fatto — se si fa — come blocco a sé e dichiarato.

Test: `check_phrasing.test.js` — 66 asserzioni (erano 57), §6 nelle due
direzioni: le tre frasi vere che devono scattare più il fotovoltaico che
«rende meno», e quattro che non devono — compresa la stessa formula su un
racconto che la sostiene.

### Un precedente si riconosce dal sintomo, non da una grandezza (12/10)

`cs.domain` valeva `"tensione"` — una grandezza spacciata per dominio, l'ultimo
degli aperti di ieri. Il nome sbagliato era la metà meno grave: la metà grave è
che **su quella chiave si decideva quale caso chiuso somiglia a quello di oggi.**

`memory.findRelevantClosedCases` sommava **+0.15 se il dominio combacia**, e
`ragionaPerAnalogia` filtra a `0.25`: quella chiave decideva se un precedente
entra o resta fuori. Misurata com'era:

- `caseState.domain` = `observedDomains[0]`, e quella lista si riempie in
  **ordine fisso** (tensione, isolamento, temperatura, differenziale,
  continuità, bruciato). Il primo elemento è un ordine di dichiarazione, non
  il fenomeno dominante: FORUM-IT-001/009/013/016 danno `differenziale`,
  mentre IT-011/012 — **stesso guasto** — danno `tensione` solo perché il
  cliente ha nominato anche una tensione. Due casi identici non si
  riconoscono;
- era **null su 25 casi su 48 (52%)**, e lì il confronto non scattava mai.

Misurato sulle 1128 coppie dei 48 casi, con verità `sintomo_atteso` del corpus
— metro **esterno**, non la chiave che si sta scegliendo:

| chiave | scatta su | giuste | sbagliate | precisione | richiamo |
|---|---|---|---|---|---|
| `observedDomains[0]` | 82 | 40 | **42** | **49%** | 13% |
| un comportamento in comune | 359 | 222 | 137 | 62% | 72% |
| **comportamento *e* oggetto** | 116 | 83 | 33 | **72%** | **27%** |

**Testa o croce.** E un precedente non si limita a ordinare: `ragionaPerAnalogia`
ne **fabbrica un'ipotesi** intestata *"causa accertata in un caso chiuso
simile"*. Uno sbagliato è un'invenzione presentata come esperienza — per questo
si pretendono **entrambi** e non il solo comportamento, che pure ha più
richiamo. Stessa dottrina del CONFERMATO sul punto sbagliato.

`forme_sintomo.stessoSintomo()`: stesso **oggetto** e stesso **comportamento**,
il vocabolario che il progetto ha già. La firma si **ricava dai due racconti**,
non si salva: i casi chiusi conservano il loro `problem_summary`, quindi
funziona su quello che è già su disco, senza migrazione e senza un campo in più
da tenere allineato. `domain` sparisce anche dal record salvato — era il suo
unico lettore.

**La classe che mancava, e la prova è il guasto vero.** Sul caso di Romeo —
*"un teleruttore che comanda una pompa sommersa, la bobina fa rumore"* — la
firma restava spaiata: `OGGETTI` aveva 7 classi e **nessuna per chi apre e
chiude un circuito comandato**. Contate prima di scriverla, come prescrive il
metodo: nel corpus `teleruttore`, `contattore`, `relè`, `bobina` compaiono
**zero volte**; nella banca sono di casa — `rele` 78, `bobina` 60,
`contattore` 55, `salvamotore` 10, `teleruttore` 4 — e dei 21 guasti che
nominano una bobina **11 stanno in CONTATTORE o RELE**. Aggiunta
`commutazione`; `pompa` **non** si aggiunge, sta già in `motore` e non si
duplica. Misurato sul precedente vero: *"stesso sintomo, altro impianto"*
passa da **sotto soglia** a **0.3 — riusato**, e il racconto identico da
0.444 a 0.594.

**Il nome ha fatto danno vero, e per questo si cambia.** Chiudendo il primo
guasto reale ci era stato scritto a mano `domain: "elettrico"` — un valore che
la pipeline non genera mai — e il precedente è rimasto archiviato con una
chiave che ROCCO non avrebbe mai ritrovato. Un nome che **invita** il valore
sbagliato è un difetto, non una questione di stile: `domain` →
`fenomeno_osservato`, nel contratto e nei tre lettori neurali rimasti.
`neural_evolution` contava la competenza sotto `"dominio:"` un valore che
dominio non era (ora `"fenomeno:"`), e `neural_patterns.detectSystemType`
concatenava quel campo al testo **senza che aggiungesse niente**: nessuna
grandezza combacia con `motore|caldaia|fotovoltaico|civile`. Tolto, perché
sembrava un contributo e non lo era. I test scrivevano `domain: "elettrico"`:
**lo stesso errore del guasto vero, dentro la rete di sicurezza.**

**La metrica che mancava, ed è una guardia dichiarata.** Il banco chiudeva un
caso e riponeva **la stessa domanda**: un esperimento che può solo rispondere
*"il precedente torna?"*, mai *"torna quello sbagliato?"* — che è la metà che
fa danno, e l'unica che una chiave al 49% poteva rompere. Ora nello store entra
anche un **caso civetta**: il guasto chiuso di un altro sintomo, preso dal
corpus con la sua domanda e la sua causa vera. `precedente_sbagliato`.

**Misurata prima e dopo: 0 in entrambi i casi**, e va detto. Su questo corpus
la civetta non arriva mai alla soglia perché nessuna coppia di casi italiani è
abbastanza vicina lessicalmente, e +0.15 da solo non basta. **Non è una prova
del guadagno, è una sentinella** per la cosa che non ne aveva nessuna. E
l'ablazione sul banco non si poteva fare per una ragione istruttiva: il banco
passa a `saveValidatedClosedCase` un `case_state` sintetico **senza `domain`**,
quindi la chiave vecchia lì non scattava mai — il banco non l'aveva mai
esercitata. La prova del cambio sta al livello giusto, sulle coppie.

| metrica | prima | dopo |
|---|---|---|
| precisione della chiave (coppie, verità del corpus) | **49%** | **72%** |
| richiamo | 13% | **27%** |
| casi senza chiave | **25/48** | 7/48 |
| precedente sbagliato (nuova guardia) | 0 | 0 |
| tutte le metriche del banco | — | **invariate, 0 regressioni** |

**Il banco non si muove, ed è atteso**: `esperienza_riusata` è 18/21 con 3
arresti di sicurezza, cioè **18 su 18** — saturo. E non poteva muoversi
comunque, perché chiude ogni caso **col suo stesso testo**: il precedente
combacia per identità, e nessuna chiave di somiglianza viene esercitata.

Test: `forme_sintomo.test.js` — 60 asserzioni (erano 45), §6 con le coppie che
devono somigliare, quelle che non devono (stesso comportamento ma altro
apparecchio, stesso apparecchio ma altro comportamento, un racconto senza
sintomo) e la misura sulle 1128 coppie, che fallisce se precisione o richiamo
scendono sotto quelli della chiave scartata. Più §3: `rele` col confine di
parola da entrambi i lati, che senza prende "ir**rele**vante" — la quarta volta
che questo file incontra una parola corta dentro una parola italiana.

### Ripetere il sintomo non è diagnosticare (12/10)

Su FORUM-IT-007 il cliente scrive *"l'inverter segna **errore ISO** e non
produce più niente"* e la prima riga della risposta era **"inverter in
errore o spento"**: gli si ridiceva quello che aveva appena scritto. Non è
falso — è **vuoto**. La causa vera (umidità in un connettore MC4) stava
sotto.

È l'ultimo dei quattro casi contati all'inizio della giornata come «non
sono ipotesi», e il più sottile: KR-14 copriva quello in cui il racconto
**smentisce** l'ipotesi, questo è quello in cui il racconto la **contiene**.

Si riconosce con il vocabolario che ROCCO ha già — `forme_sintomo.js`,
OGGETTO × COMPORTAMENTO: l'etichetta ridice il sintomo se la sua **tesi**
nomina un oggetto e un comportamento che il racconto ha già detto
**entrambi**. *"Umidità in connettore MC4"* no, perché `umido` il cliente
non l'ha detto: quella aggiunge un perché. Nessuna parola nuova inventata.

**E la tesi dev'essere nuda**, al più quattro parole. Misurato, è la riga
che separa *"inverter in errore o spento"* (3 parole) da *"Asse
meccanicamente bloccato (giunto, riduttore, pompa bloccata)"* (7), che è
una causa meccanica vera e nomina pezzi che il cliente non ha nominato:
**chi ripete non aggiunge, chi aggiunge spiega.** Senza questa riga, la
regola retrocedeva anche quella.

**Retrocessione, non esclusione**, come la pertinenza — e nel comparatore
sta **subito dopo la pertinenza, prima della conferma**, per la stessa
ragione già scritta per quella: un'ipotesi che non aggiunge niente non
guida nemmeno se una soglia l'ha confermata.

| metrica | prima | dopo |
|---|---|---|
| **causa vera in testa** | 15/21 | **16/21** |
| prima riga di FORUM-IT-007 | *"inverter in errore o spento"* | *"umidità in connettore MC4 o guaina cavo deteriorata"* |
| tutto il resto del banco | — | invariato |

La riga nuova di IT-007 **è** la causa reale del caso (*"probabile ingresso
acqua in un connettore MC4"*).

**Un falso positivo trovato per strada, e valeva da solo**: la prima misura
della regola colpiva anche FORUM-IT-013, dove avrebbe retrocesso la causa
vera. Indagando, il difetto non era nella regola — vedi il blocco qui
sotto, `scalda` dentro `scaldabagno`.

Test: `forme_causa.test.js` §8 — 51 asserzioni in tutto.

### `scalda` dentro `scaldabagno` (12/10)

Cercando perché su FORUM-IT-013 un'ipotesi risultasse «ripetizione del
sintomo», è saltato fuori che il racconto — *"lo **scaldabagno** elettrico
80L da 10 anni fa saltare il differenziale"* — veniva classificato
**surriscaldamento**, senza che nessuno avesse parlato di calore.

`scalda` nel pattern `surriscalda` di `forme_sintomo.js` non aveva confine
di parola e matchava dentro **scalda**bagno e **scalda**cqua, che sono nomi
di apparecchi. È il difetto delle sigle dentro le parole italiane (`DIN` in
"lampa**din**a") e dei nomi d'agente (`bruciatore` collassato sul participio
`bruciato`): **terza volta nello stesso codice, in un terzo posto.**

Contate prima di correggere: nelle 21 domande e nei 370 guasti della banca
`surriscald` compare **28 volte**, `scalda` come comportamento **zero** —
l'unica occorrenza in tutto il materiale è dentro "scaldabagno". Il confine
si tiene lo stesso (`scalda|scaldano`) e non si toglie la parola,
perché *"il cavo scalda troppo"* è italiano vero che il corpus non ha
ancora.

Banco invariato — il sintomo di IT-013 non era fra quelli che decidono una
metrica — ma una classificazione sbagliata del sintomo è la chiave con cui
ROCCO apre le 9 tabelle dell'esperienza: sbagliarla è pescare nel cassetto
sbagliato.

Test: `forme_sintomo.test.js` §3 — 47 asserzioni, con i due nomi di
apparecchio fra i falsi positivi.

### KR-14 — il cliente dice che non ci sono errori, e ROCCO ne afferma uno

Su FORUM-SPEC-003 il cliente scrive *"i pannelli sembrano ok, **nessun
errore sull'inverter**"* e la prima riga della risposta era **"inverter in
errore o spento"**: ROCCO contraddiceva il cliente nella riga che si legge
per prima.

**Non era conoscenza sbagliata.** Quella causa è la più probabile della
tabella `fotovoltaico_non_produce` del simulatore (0.30), ed è giusta in
generale: è *questo* racconto a escluderla.

**Il dato c'era già ai due capi e nessuno li univa** — la ventunesima volta
che questo codice presenta lo stesso difetto:

- `USER_EXCLUSION_PATTERNS` ha la riga `nessunw* (errore|allarme…)`,
  **scritta apposta per questo caso** (il commento dice *«caso 13»*): la
  frase arriva regolarmente fra le **prove**;
- il simulatore dichiara `cosa_esclude: "inverter acceso e funzionante senza
  errori"`;
- mancava la regola che legge l'una e applica l'altra.

`KR-14` uccide **solo ciò che afferma una segnalazione** — `in errore`, `in
allarme`, `in blocco`, `codice errore`. Non tocca `guasto`, `degradato`,
`sporco`: un apparecchio può benissimo essere guasto **senza segnalare
niente**, ed è proprio il caso di SPEC-003, dove il guasto c'è (hot spot,
diodo bypass) e l'inverter tace. Confondere le due cose avrebbe tolto la
causa vera.

| | prima | dopo |
|---|---|---|
| prima riga di FORUM-SPEC-003 | *"inverter in errore o spento"* | *"stringa ombreggiata, modulo degradato, MPPT"* |
| ipotesi smentite dal racconto fra le stampate | 1 | **0** |
| tutte le metriche del banco | — | **invariate** |

**Il banco non si muove, e qui non c'è metrica da aggiungere**: l'unico
metro sarebbe la regola stessa, e misurare una regola con sé stessa dà zero
per costruzione. La prova sta dove stanno le altre kill rule — una frase che
deve scattare e due che non devono, prese dai casi veri: *"l'inverter segna
errore ISO"* (FORUM-IT-007, l'errore c'è davvero) e *"la caldaia va in
blocco dopo 3 secondi"* (un blocco dichiarato non è una dichiarazione di
assenza di allarmi).

**E il corpus la esercita una volta sola.** È poco, ed è dichiarato: la
regola nasce da un caso, non da una statistica. Vale perché la frase di
innesco è quella vera del cliente e perché il bersaglio è stretto.

### Lo smoke test non resta più appeso (12/10)

`test.js` è l'unica suite che parla col servizio vero — provider remoti e
ping al database — e `req()` **non aveva alcun timeout**. Col Postgres di
Render scaduto e un provider lento, `npm test` è rimasto appeso **da 2 a 20
minuti** a seconda della giornata, sempre sulla stessa chiamata, mentre le
altre 38 suite stanno insieme in ~40 secondi. In una sera sono state cinque
corse da venti minuti.

`r.setTimeout(60s)` e la chiamata fallisce invece di appendersi
(`SMOKE_TIMEOUT_MS` per cambiarlo). Un servizio che non risponde entro il
tempo è un **esito**, non un motivo per non finire: il test la segna rossa e
la batteria prosegue. È la stessa dottrina del ripiego agganciato al
fallimento della query invece che a `if (!pool)`.

### Una causa, una riga (12/10)

Prima di toccare il ragionamento è stata misurata la cosa giusta: **le 84
ipotesi che l'elettricista legge sui 21 casi italiani, lette una per una**.
Il difetto che mi aspettavo — la causa e le sue conseguenze messe in
parallelo — c'è, ma è il minore: **8 coppie su 7 casi**. Quello grosso è
un altro, ed era sotto gli occhi:

| cosa fanno le 84 righe | righe | casi |
|---|---|---|
| **ridicono una causa già scritta sopra** | **21 (25%)** | 11/21 |
| stanno in catena: una è la causa di un'altra | 8 coppie | 7/21 |
| non sono ipotesi (un'istruzione, il sintomo ripetuto, una pista che il racconto smentisce) | 4 | 4/21 |

Su FORUM-IT-013 tutte e quattro:

```
- Dispersione verso terra su carico o cavo sempre presente
- dispersione a terra sul cavo (isolamento danneggiato)
- Dispersione in uno specifico apparecchio o cavo
- dispersione su carico
```

**Non è conoscenza che manca, è una riga di confronto.** Quelle quattro
righe vengono da **quattro fonti diverse** — motore, banca dispositivi,
simulatore, curriculum — e la deduplica di `ragiona()` confrontava
`normalize(label).substring(0, 60)`: **identità di stringa**. In italiano una
frase non combacia quasi mai con sé stessa; è lo stesso difetto già corretto
nella ricerca della banca ("pannelli" contro "pannello") e nel
riconoscitore di componenti.

`rocco_v2/forme_causa.js` dichiara **quando due etichette parlano della
stessa causa**, con due chiavi che servono entrambe:

- **FENOMENO** — che cosa succede fisicamente, riconosciuto sulla **tesi**
  (la parte prima di " — " o ":"), la stessa convenzione di
  `hypothesisClaim()` e del narratore. Leggere tutta l'etichetta sbagliava,
  misurato: *"avvolgimento motore degradato: … o **umidità** assorbita"*
  finiva fra le infiltrazioni — e su FORUM-IT-015 quello è l'avvolgimento,
  cioè la causa vera.
- **APPARECCHIO** — di che cosa parla. *"Cortocircuito"* e *"condensatore
  di un motore in cortocircuito"* mandano l'elettricista in due posti
  diversi. Senza questa seconda chiave le fusioni passavano da 70 a 121 e
  **la causa vera si perdeva**.

Le parole dei due elenchi sono **contate nelle 173 etichette distinte** che
i 21 casi producono: `cortocircuit` 17, `morsett` 14, `degradat` 13,
`interrott` 12, `dispers` 11, `sovraccaric` 10, `difettos` 10, `isolament` 9.

**Fondere non è buttare.** Quel che l'assorbita dice in più finisce
nell'etichetta dopo " — anche: ", e catena, `confirm_tests`,
`supporting_evidence` ed `esperienza` passano a quella che resta. La prima
versione teneva solo la meglio piazzata e perdeva la causa vera proprio
così: su FORUM-IT-015 il superstite era la riga più generica e portava via
*"isolamento danneggiato"*, l'unica parola che diceva qualcosa.

**Tre regole trovate rompendo qualcosa**, e tutte e tre dicono la stessa
cosa — *chi fonde non deve cambiare il giudizio*:

1. **Si fonde dopo l'ordinamento, non prima.** Resta la meglio piazzata dal
   comparatore del motore. Fonderle in `ragiona()` avrebbe tenuto la prima
   **dichiarata**, che è un ordine di comodo.
2. **La pertinenza entra nella chiave.** È la *prima* chiave del comparatore
   e si legge sull'etichetta — che la fusione cambia. Senza, un'ipotesi
   retrocessa perché fuori contesto prestava le proprie parole a una
   pertinente e l'ordine "prima le pertinenti" si rompeva:
   `pertinenza.test.js` è diventato rosso su FORUM-IT-005, col dimmer LED
   tornato davanti.
3. **Un'ipotesi CONFERMATA non si fonde**, né assorbe né viene assorbita. La
   conferma vale su una tesi precisa. Misurato su FORUM-IT-007: la conferma
   sul guasto d'isolamento della stringa DC finiva dentro *"dispersione DC
   verso terra — pannelli, cavi, inverter"* e il connettore MC4 spariva
   dalla riga confermata — `confirm_rules.test.js` §8 l'ha visto subito.
   Un CONFERMATO sul punto sbagliato è peggio di un DA VERIFICARE.

**Il metro della nuova metrica è indipendente da chi fonde.**
`ipotesi_ripetute` nel banco **non** usa `chiaveCausa`: due righe si
ripetono se i due terzi delle parole della più corta stanno nell'altra.
Misurare una fusione con la chiave che fonde darebbe zero per costruzione —
si misurerebbe la definizione, non il risultato.

| metrica | prima | dopo |
|---|---|---|
| **righe che ridicono quella di sopra** (metro lessicale) | **12/84 su 7 casi** | **1/84 su 1 caso** |
| ipotesi attive sui 21 casi | 347 | 277 (70 fusioni) |
| ipotesi stampate in totale | 84 | 84 — ma sono 84 **cause diverse** |
| esame completo, 48 casi | 33/48 | **34/48** |
| causa vera stampata · attiva · stretta | 21/21 | invariate |
| tutto il resto del banco | — | invariato, 0 regressioni |

**E il guasto vero ha trovato subito la forma che mancava.** Rigirandolo, la
banca diceva tre volte la stessa cosa sulla bobina del teleruttore —
*"tensione bobina bassa"*, *"tensione bobina insufficiente"*, *"tensione di
alimentazione bobina bassa (<85% Ub)"* — e nessuna si fondeva: il fenomeno
**non era nel vocabolario**. Contato prima di scriverlo, come prescrive il
metodo: 15 occorrenze nei 370 guasti della banca, 2 nelle 173 etichette del
corpus. Aggiunto `tensione_insufficiente`, le tre righe diventano una e sul
caso vero le fusioni passano da 1 a 3. È il ciclo *lacuna → competenza*
applicato a una **regola** invece che a una conoscenza: il corpus non
l'aveva mostrato, il guasto vero sì.

L'unica ripetizione che resta è FORUM-IT-010, e **non è una ripetizione**:
*"fusibile bruciato"* e *"contattore non tira"* sono due cause **dello
stesso effetto** (la fase che manca). È la catena — l'altro difetto, quello
che resta aperto, e lo stesso del guasto vero di Romeo.

Test: `rocco_v2/neural/test/forme_causa.test.js` — 33 asserzioni in quattro
direzioni, perché **una fusione sbagliata è peggio di una ripetizione**: una
ripetizione fa perdere tempo, una fusione sbagliata fa sparire una causa.

### La famiglia POMPA — la prima lacuna colmata dal metodo (12/10)

La lacuna trovata dal primo guasto vero era dichiarata e vuota: **`sommers*`**
**= 0 occorrenze** nelle due fonti (`knowledge/components.json`,
`data/encyclopedia.json`), famiglia POMPA inesistente. Per questo su una pompa
sommersa da pozzo ROCCO scriveva *"Pompa di circolazione"*: non era un
iperonimo sbagliato, era **l'unica pompa che avesse**.

Colmata nella **fonte**, non in una regola, e rigenerata:
`components.json` → `pompa-sommersa` (`category: "submersible_pump"`),
`CATEGORIA_FAMIGLIA` → POMPA, `device_kb.FAMIGLIA_PATTERNS` → un pattern
stretto **prima di MOTORE e TERMICO** (chi la nomina dice spesso "il motore
della pompa", ma la famiglia che la descrive è quella della configurazione;
"pompa di calore" e "pompa di circolazione" devono restare a TERMICO).
**366 → 370 guasti, 36 → 37 famiglie.**

**Quattro voci, confermate da Romeo**, e solo ciò che dipende dall'essere
immersa in fondo a un cavo lungo — avvolgimento, rotore e perdita di fase
restano in MOTORE e non si duplicano: acqua negli avvolgimenti; protezione che
scatta dopo qualche secondo (con la caduta sul cavo lungo da distinguere);
umidità nella giunzione del pozzetto; fusibile aperto che fa ronzare la bobina
del teleruttore. La quarta è il caso di Romeo, che come **esperienza** era già
nelle tre memorie e qui entra come **conoscenza generale**.

**Nessun valore assoluto, per decisione sua.** I numeri d'isolamento di una
sommersa si trovavano solo in riassunti di ricerca, e non esiste una `fonte`
che valga "letto di sfuggita". Le verifiche prescrivono il **criterio
relativo**, che è anche l'unico che generalizza senza marche: *le tre
resistenze uguali fra loro*, *isolamento con la pompa scollegata dal quadro*,
*bobina aperta = bruciata*, *confrontare con la targa*. La lacuna resta quindi
dichiarata, ma cambiata di natura: da "la famiglia intera: nessuna fonte la
copre" a `POMPA · manca: valori di riferimento`.

**Due cose scoperte dalla prova, non dai numeri** — la risposta si guarda, non
si conta:

1. **"pompa di circolazione" usciva accanto a "pompa sommersa".** La keyword
   generica `pompa` del circolatore ha ora la sua `SENSE_RULE`, come già
   `interruttore`: pretende il suo contesto (`circolatore`, `riscaldamento`,
   `girante`, `prevalenza`…) e si ritira davanti a `sommersa`, `pozzo`,
   `autoclave`, `drenaggio`. Le parole **proprie** del circolatore non passano
   di qui: restano riconoscibili da sole. Finché la banca aveva solo il
   circolatore quella regola non si poteva scrivere — sarebbe stato togliere
   l'unica risposta disponibile.
2. **`matched_keyword` e `matched_pattern` davanti all'elettricista.** Due slug
   nudi, senza valore: dicono che il motore ha trovato qualcosa, non che cosa —
   e quel che ha trovato è già nelle due righe che seguono, scartate perché
   duplicano. Stavano fuori dai sei posti di `cleanFacts` **solo finché c'era
   un'osservazione di troppo a coprirli**: tolta quella, sono emersi. In
   `lexicon.ENGINE_INTERNAL_PREFIXES`.

| metrica | prima | dopo |
|---|---|---|
| occorrenze di `sommers*` nelle fonti | 0 | **11** |
| guasti noti nella banca | 366 | **370** |
| famiglie | 36 | **37** |
| pompa sbagliata sul caso vero | "pompa di circolazione" | **"pompa sommersa"** |
| tutte le metriche del banco | — | **invariate, 0 regressioni** |

**Il banco non si muove, ed è atteso**: il corpus dei 21 casi italiani non
contiene pompe sommerse. Questo blocco non migliora un voto, allarga ciò che
ROCCO **sa** — e la prova è il guasto vero, non la pagella.

**Resta aperto, misurato qui**: su *"la pompa sommersa non **manda** acqua"* il
circolatore ricompare per la keyword `mandata`, pescata dal prefix matching su
"manda" (difetto di stem, non di iperonimo). E il difetto più grosso del caso
vero **non è toccato**: ROCCO mette in parallelo *fusibile aperto*, *bobina che
ronza* e *bobina bruciata*, che sono **una causa e le sue conseguenze**. È
ragionamento, non conoscenza.

### La verifica discriminante — il numero a metà, chiuso

`esame_verifica_proposta` è **48/48** e dice soltanto che *una* verifica
viene proposta. Il metro onesto confronta il PROSSIMO PASSO con le
`verifiche` che il caso dichiara, per radice troncata, pretendendo **due**
radici in comune con la stessa verifica — una sola ("tensione",
"verificare") la condividono quasi tutte le frasi tecniche. Misurato:
**7 su 18** casi non in arresto di sicurezza.

Quattro difetti, trovati leggendo le righe una per una.

**1. All'utente arrivavano PREVISIONI invece di istruzioni.** Su
FORUM-SPEC-003 il prossimo passo era *"inverter funzionante senza allarmi,
potenza AC proporzionale a DC"*; su FORUM-IT-002 *"tensione presente ai
morsetti del carico ma non funziona"*; su FORUM-IT-007 *"ventola inverter
ferma o ostruita"*. Sono enunciati di stato — cosa vedrei se l'ipotesi fosse
vera — e un elettricista non sa cosa farne. La regola **previsione ≠
istruzione** esiste da un blocco intero, ma era applicata **solo** alle
previsioni del controfattuale: i `confirm_tests` che arrivano dalla banca
dispositivi e dai fenomeni non passavano per `toInstruction()`.

La trappola che rende il fix meno ovvio: `toInstruction` torna `null` anche
sulle istruzioni **già scritte bene** (è fatta per tradurre previsioni),
quindi scartare i `null` butterebbe via le verifiche giuste. Serviva la
domanda simmetrica — `isInstruction()` — e non si risponde col tipo d'azione:
`inferActionType` manda in `ask_user` sia *"termografia dei pannelli"* (una
istruzione vera) sia *"ventola inverter ferma"*. Si risponde col **verbo
d'azione**, o col nome che nomina un'operazione — e le parole vengono dalle
144 verifiche del corpus, contate: `misura` 18, `ispezione` 8,
`sostituzione` 8, `verific*` 12, `controllare` 5, più `sezionamento`,
`termografia`, `pulizia`, `staccare`, `togliere`, `chiamare`, `sentire`.
Un enunciato non ne ha nessuna. Chi resta enunciato non viene buttato ma
pesa −30: meglio una verifica debole che nessuna.

**2. Il bonus a `ask_user` premiava proprio quelle.** `ask_user` è il cesto
dove cade il testo che nessuno schema riconosce, cioè gli enunciati: quel +3
è il motivo per cui *"inverter funzionante senza allarmi"* batteva
*"misurare la tensione di ogni pannello o termografia per hot-spot"*.
Togliato. Il controllo visivo resta preferito a pari merito (+3): costa meno
e non richiede di rimettere in tensione.

**3. Il punteggio di discriminazione confrontava parole intere.**
`length > 4` più `indexOf`: "pannelli" non trovava "pannello", la terza volta
in una sera che l'italiano non combacia con sé stesso. Ora radice troncata a
sei, come `coerente()` e come la ricerca nella banca.

**E qui l'ablazione mi ha smentito.** Avevo scritto che quel punteggio
misurava "l'opposto della discriminazione" e l'ho sostituito con un conteggio
per identità (quante ipotesi elencano *davvero* quel test). Misurato:
**da 7 a 6 su 21** — peggio. La ragione è che il vecchio segnale misura una
cosa sensata: *la grandezza su cui più ipotesi poggiano è quella con più
leva*. Su un differenziale che scatta "isolamento" ricorre nei test di mezze
ipotesi, e misurare l'isolamento è davvero il passo giusto. I due segnali
ora convivono e misurano cose diverse: **`separation`** per identità (un test
che per qualcuna conferma e per qualcun'altra esclude taglia il campo in due:
è l'informazione migliore, ed è rara), **`coverage`** per radice (euristica
della leva, sta sotto).

**Scartato e da non riprovare**: lo spareggio "a pari merito chiedi la prova
dell'ipotesi che guida". Sembra ovvio, è mio, e misurato va **peggio** (5 su
21): quando in testa non c'è la causa vera manda a chiedere la cosa
sbagliata con convinzione.

**4. Un bersaglio è un componente, non una frase.**
`/^(.+?) non funziona$/` prende qualunque cosa precede quelle parole: su
FORUM-IT-002 catturava la frase intera come nome di componente e usciva
*"**Verifica se Verifica che** le protezioni siano chiuse…"* — il verbo
raddoppiato, nella riga più letta della risposta. `bersaglioValido()`
pretende un bersaglio corto, senza proposizioni, e che non sia a sua volta
un ordine; quando non lo è lo schema **non si applica**, secondo la regola
già scritta in quel modulo: *quel che non rientra in uno schema viene
scartato, non inventato*.

| metrica | prima | dopo |
|---|---|---|
| **verifica giusta** (il passo è quello prescritto) | 7/18 | **10/18** |
| esame verifica proposta | 48/48 | 48/48 |
| causa vera stampata · attiva · stretta | 21/21 | invariate |
| casi conclusi con la misura | 11/21 | 11/21 |

Su **FORUM-SPEC-003** il prossimo passo è ora *"misurare tensione di ogni
pannello separatamente (o termografia per hot-spot)"*: esattamente quello che
il caso prescrive.

**I tre che restano, e perché**: FORUM-IT-002 propone un primo passo generico
ma coerente (il caso prescrive di staccare i carichi e misurare la resistenza
fase-neutro); FORUM-IT-005 prescrive **solo** controlli manuali (aprire la
cassetta, serrare i morsetti); FORUM-IT-014 è un arresto di sicurezza, e la
sua prescrizione è la messa in sicurezza — per questo gli arresti non si
contano e si stampano come nota.

Test: `check_phrasing.test.js` — 57 asserzioni (erano 35), con le due
famiglie messe a confronto: cinque enunciati che **non** devono passare per
istruzioni e dieci istruzioni vere che devono restarlo, comprese quelle che
nominano l'operazione con un sostantivo come le scrive il corpus.

### La scuola insegnava e il ragionamento non sapeva

**44 guasti, 19 livelli su 22, e nessuno nel percorso diagnostico li**
**leggeva.** Ogni guasto del curriculum ha già la forma di un'ipotesi —
`nome`, `causa`, `sintomo`, `verifica`, `componenti_coinvolti` — e serviva
soltanto alla scuola: nodi del grafo, vocabolario, formule, norme. La sesta
volta che in questo codice si trova conoscenza presente e mai letta.

Il caso che l'ha fatto vedere è FORUM-SPEC-003 — *"il mio impianto
fotovoltaico produce il 30% in meno, i pannelli sembrano ok, nessun errore
sull'inverter"*, causa reale **hot spot con diodo bypass in cortocircuito**
**più sporcizia**. Il livello L21 insegna esattamente quello:

> *guasto:* produzione FV calata drasticamente — *causa:* uno o più diodi
> bypass in cortocircuito → bypassa permanentemente un gruppo di celle —
> *verifica:* misurare tensione di ogni pannello separatamente (o termografia
> per hot-spot)

**Non serviva una strada nuova.** La banca dispositivi è già la fonte da cui
il passo 5c-bis ricava ipotesi con verifica, strumento e valore atteso:
mancava l'innesto. Il curriculum è la **sesta fonte** di
`build_dispositivi.js` — 322 → **366 guasti noti**. La famiglia si dichiara
per livello (L21→FOTOVOLTAICO, L10→MOTORE, L11→TRASFORMATORE,
L14→ALIMENTATORE, L17→SENSORE) e gli altri restano IMPIANTO, come i 40
pattern: metterli nella famiglia sbagliata li nasconderebbe, perché la
ricerca filtra per famiglia. La scuola non dichiara probabilità e **non se ne
inventa una**.

Collegarla non è bastato: fra la banca e l'ipotesi c'erano **tre filtri che**
**leggevano male l'italiano**, e il guasto giusto non entrava nemmeno fra i
primi otto.

**1. La ricerca confrontava parole intere.** `punteggioTesto` cercava la
parola per esteso: chi scrive dice "i **pannelli**", la banca scrive "il
**pannello**", e `"pannello".indexOf("pannelli")` è −1. In italiano una
parola non combacia quasi mai con sé stessa. Ora il confronto è sulla radice
troncata a sei caratteri, come già fa `coerente()` del banco e come pretende
il plurale femminile nel riconoscitore di componenti.

**2. La ricerca contava le parole di una NEGAZIONE.** Il punteggio dei primi
tre guasti veniva da *"**nessun errore** sull'**inverter**"* — tre punti
("nessun", "errore", "inverter") per una frase che quei guasti **esclude** —
mentre il guasto giusto ne prendeva uno. E "nessun" contava come parola di
sintomo. È il difetto già corretto nel riconoscitore di componenti
(*"inverter **senza** trasformatore"* faceva rilevare un trasformatore).

La negazione viveva nel motore e stava per diventare **tre** elenchi di
parole: ora è `rocco_v2/negazione.js`, modulo puro senza dipendenze, con
`isKeywordNegated` (una parola), `isNegationWord` (la parola *è* una
negazione) e `hasUnnegatedMatch` (un regex ha almeno un'occorrenza libera).
Lo usano il motore, la ricerca nella banca e la classificazione del sintomo.

**3. Il sintomo non parlava la lingua della banca.** Delle classi di
comportamento ne erano mappate nove: `riduce`, `cessa`, `in_blocco`,
`ripete`, `spontaneo`, `correlato` **non arrivavano alla banca**, quindi un
racconto che dice solo "rende meno" partiva senza nessun token di sintomo. Le
parole dell'espansione sono **contate nel file prima di scriverle**: "ridott"
compare in 9 guasti, "degrad" in 28, "calo" in 17, "calat" in quello del
curriculum — mentre "rendimento" e "prestazioni" in **zero**, e metterle
sarebbe stato scrivere parole mie. "calo" e "calat" sono due voci e non una:
il troncamento non le unisce, e la radice che le unirebbe ("cal") prende
anche "caldo" e "calcolo".

**Il risultato, senza aver toccato il metro:** su SPEC-003 ROCCO stampa
*"uno o più diodi bypass in cortocircuito"* con il riferimento CEI 0-21 che
viene dal livello del curriculum, e **`causa_vera_stretta` passa da 20 a
21/21**. Il metro stretto è quello che pretende una parola distintiva, non
già presente nella domanda: è la metrica che non si può compiacere.

**Due dichiarazioni mie, entrambe sbagliate, corrette qui.** Avevo scritto
che SPEC-003 e SPEC-005 erano *lacune di conoscenza*. Nessuna delle due lo
era, ed è lo stesso errore che questo codice fa da sempre — scambiare "ROCCO
non lo sa" con "ROCCO lo sa e non ci arriva":
- **SPEC-003**: hot spot e diodo bypass erano nel curriculum, con la
  verifica. Uscito dall'elenco.
- **SPEC-005** (caldaia, 3-4 cicli al minuto): avevo scritto che ROCCO ha
  solo le cause della mancata accensione. Falso — la banca ha *"caldaia parte
  e poi si spegne → circolatore non funzionante"*, famiglia TERMICO, e arriva
  fra le ipotesi. Resta dichiarato per una ragione **diversa e vera**: fra le
  9 chiavi di esperienza del simulatore il corto-ciclo non esiste, e
  `caldaia_non_accende` parlerebbe di elettrodo, valvola gas e pressione.
  È una lacuna della **tassonomia dei sintomi**, non della conoscenza:
  `SINTOMI_SENZA_CHIAVE`.

**Un altro falso positivo mio**: avevo messo `gradi` fra le forme del
surriscaldamento. *"Il termostato è impostato a 21 ma in casa ci sono 18
**gradi**"* è una temperatura ambiente che manca, non un componente che
scalda — e su SPEC-005 faceva classificare un corto-ciclo come
surriscaldamento. Tolto; `temperatura` resta, perché è la parola delle
verifiche della banca.

| metrica | prima | dopo |
|---|---|---|
| guasti noti nella banca | 322 | **366** |
| fonti della banca | 5 | **6** |
| causa vera, **metro stretto** | 20/21 | **21/21** |
| causa vera stampata · attiva | 21/21 · 21/21 | invariate |
| casi conclusi con la misura | 11/21 | 11/21 |
| conferme sbagliate · chiusure non dovute | 0 | 0 |

**Chiuso nel blocco dopo**: su SPEC-003 il PROSSIMO PASSO era ancora
*"inverter funzionante senza allarmi"* e non la verifica che decide fra le
ipotesi. Era `selectBestAction` a non scegliere la verifica che **esiste** nel
guasto — vedi "La verifica discriminante". Ora quel passo è "misurare tensione
di ogni pannello separatamente (o termografia per hot-spot)".

### Il sintomo è la chiave, e non girava nella toppa

`cs.anomaly_type` era **`undefined` su 6 dei 21 casi italiani**, in silenzio.
Con quello vuoto le 9 tabelle di esperienza del simulatore — **41 cause
scritte a mano**, ognuna con probabilità, verifica ed esclusioni — non
venivano mai lette su quei casi, e con loro restavano a vuoto il distillatore
e `suggerisciVerifica`. Conoscenza presente che non arriva a chi risponde: lo
stesso difetto della banca dispositivi, in un altro punto del percorso.

**Il difetto era di metodo, non di una regex.**

Il riconoscimento viveva in **due tabelle con due elenchi di parole**:
`neural_simulator.RICONOSCIMENTO_SINTOMI` (10 regole, ognuna una congiunzione
di due indovinelli — `pattern` + `condizione` — e vinceva la prima che
azzeccava entrambi) e `device_kb.rilevaSintomoDalTesto` (9 `if`). **Ogni buco
stava in una lista e non nell'altra**: `device_kb` conosceva "non resta su" e
"ricade", il simulatore conosceva "intervi" e "fermo". E nelle dieci regole le
due colonne non volevano dire la stessa cosa in ogni riga: in quella del
surriscaldamento `pattern` era il comportamento e `condizione` era l'oggetto,
al contrario di tutte le altre.

`rocco_v2/forme_sintomo.js` tiene le forme **una volta sola**, separate per
natura: **OGGETTO** (che apparecchio) × **COMPORTAMENTO** (che cosa fa). Il
simulatore dichiara solo la mappa sintomo → (oggetto, comportamenti);
`device_kb` traduce una classe nel token con cui la banca nomina quel sintomo.
Chi aggiunge una forma la aggiunge in un posto e la misura sul corpus.

**Le forme che mancavano, e perché**: `cessa` ("la lavatrice **ha smesso di
funzionare**"), `riduce` ("produce il **30% in meno**" — la vecchia condizione
pretendeva `non.*produc`, che in quella frase non c'è), `spontaneo` ("le luci
si accendono **da sole**"), `correlato` ("**quando accendo** l'aspirapolvere la
TV si spegne"), `in_blocco` ("**va in blocco**"), e `MTD` fra gli oggetti —
la sigla che un italiano scrive, **che non esisteva in nessun elenco del
progetto**.

**Il silenzio ora si dichiara**: `sintomo_non_riconosciuto` nella traccia e
nel banco. Non è un errore — ci sono casi in cui tacere è giusto — ma deve
vedersi, perché è l'unica ragione per cui questo difetto è vissuto a lungo.

**Due lacune di conoscenza, dichiarate e non coperte** (`LACUNE_CONOSCENZA`):
- **FORUM-SPEC-005**, la caldaia che fa 3-4 cicli al minuto. Il corpus la
  etichetta `caldaia_non_accende`, ma le cinque cause sotto quella chiave
  parlano di *mancata accensione* (elettrodo, valvola gas, pressione, scheda,
  ventilatore). Il corto-ciclo è un altro fenomeno e ROCCO non lo ha:
  riconoscerlo lì gli darebbe **cinque cause sbagliate con probabilità alte**,
  peggio del silenzio. Per questo le righe generiche (`intermittente`,
  `niente_tensione`) **non rubano** un apparecchio che ha una chiave propria.
- **FORUM-SPEC-003**, il fotovoltaico che rende il 30% in meno: hot spot e
  diodo bypass stanno nel curriculum come *guasti tipici* ma non come
  **ipotesi con verifica**, e ROCCO stampa l'inverter in errore e la
  dispersione DC — piste plausibili, non quella giusta.

Entrambe si colmano **nella fonte**, non allargando una regola.

**Tre errori miei, trovati dalle frasi negative e non dai numeri**: `sare`
(pensato per lo spagnolo) trovava "pen-**sare**"; `trip` senza confine di
chiusura trovava "presa **trip**la"; e una riga conteneva **caratteri
cirillici** invisibili. Nessuno dei tre si vedeva dal corpus. È la ragione per
cui §3 di `forme_sintomo.test.js` esiste.

**E il metro, misurato invece di creduto.** `coerente()` è largo per scelta.
Quanto? Il metro **stretto** pretende la somiglianza su una parola *distintiva*
— nella causa reale e **non** nella domanda, perché ripetere il vocabolario di
chi chiede non è identificare una causa. Misurato: largo 21/21, **stretto
20/21**, e l'unica differenza è SPEC-003. Ora è una metrica del banco: se
`causa_vera_stampata` sale e `causa_vera_stretta` no, il guadagno è del metro.

**Correzioni al banco trovate per strada:**
1. **La premessa contraddiceva il caso.** Per la tensione il banco faceva
   dire "0 V" a tutti. Su FORUM-SPEC-004 — "la lavatrice è morta, il frigo fa
   un rumore strano, **le luci funzionano**" — se le luci vanno la tensione
   c'è: è *sbagliata*, non assente. E su quella premessa falsa ROCCO
   confermava un'interruzione, che il confronto lessicale contava giusta.
   Ora `misuraPrescritta()` legge la **seconda verifica del caso** ("chiamare
   il distributore se la tensione non è 230V ±10%") e manda una tensione fuori
   banda. È la stessa famiglia del "sul morsetto" già corretto: una premessa
   che il caso non sostiene.
2. **L'apprendimento girava prima delle misure.** Le tre passate erano
   intrecciate per caso, e il terzo turno chiude il caso **con la sua
   `causa_reale`**: dal secondo caso in poi le metriche fotografavano un
   motore che aveva già ricevuto le risposte d'esame dei precedenti, in
   memoria — il ripristino rimette i file, non la RAM. Ora: prima tutte le
   misure, poi tutto l'apprendimento.

| metrica | prima | dopo |
|---|---|---|
| sintomo giusto, casi italiani | 15/21 | **20/21** |
| causa vera stampata | 18/21 | **21/21** |
| causa vera attiva | 19/21 | **21/21** |
| causa vera, **metro stretto** | — | **20/21** (nuova) |
| sintomo non riconosciuto | 6 (invisibile) | **0** (+2 lacune dichiarate) |
| esame italiano | 18/21 | **21/21** |
| casi conclusi con la misura | 11/21 | 11/21 |
| conferme sbagliate · chiusure non dovute | 0 | 0 |
| ipotesi stampate in totale | 81 | 84 |

Le ipotesi stampate crescono di **tre** mentre la causa vera stampata cresce
di tre: non è diluizione, sono le ipotesi del simulatore che entrano nelle
prime quattro per punteggio. E i casi conclusi **non cambiano**: questa strada
migliora la qualità della diagnosi, non il tasso di chiusura — quello lo
limitano il corpus e il metro.

Test: `forme_sintomo.test.js` — 45 asserzioni in tre direzioni (il contratto
ereditato dalla vecchia suite, il corpus, i falsi positivi) più la frequenza
di ogni classe: una che scatta su tutto è rumore, una che non scatta mai non è
esercitata da nessun caso reale (`dispersione`, `cortocircuito`,
`sovraccarico` — servono alla banca dispositivi, che il corpus non prova).

### G1 — i casi chiudibili, e quelli che il corpus non può chiudere

Cinque casi italiani avevano la causa vera **fra le ipotesi attive** e non si
chiudevano. Prima di toccare una soglia, la domanda giusta era una sola: con
i dati già presenti nel corpus esiste una prova reale sufficiente per
chiudere la causa **senza inventare informazioni**?

| caso | prova prescritta dal corpus | verdetto |
|---|---|---|
| FORUM-IT-003 | continuità del cavo dalla cassetta alla presa | **chiudibile** — limite di ROCCO |
| FORUM-IT-006 | corrente con la pinza amperometrica | **chiudibile** — limite di ROCCO |
| FORUM-SPEC-004 | tensione fase-neutro e fase-terra | **chiudibile** — limite di ROCCO |
| FORUM-IT-012 | pinza in mA **su ogni linea** + sostituzione RCD | **non chiudibile col corpus** |
| FORUM-IT-016 | dispersione **bagnato vs asciutto** + tipo di RCD a targa | **solo con verifica manuale** |

Gli ultimi due non sono stati toccati, ed è il punto del blocco: il dato
decisivo è un **confronto** (fra linee, fra condizioni) o una **targa da
leggere**, non una misura singola. Una lettura globale di 28 mA accerta al più
una dispersione diffusa vicina alla soglia: non dice che la somma venga dai
filtri EMI, né che il differenziale sia obsoleto. Sono dichiarati in
`CORPUS_NON_CHIUDIBILE` nel banco, e `chiusure_non_dovute` diventa rossa se
ROCCO li chiude: **ROCCO non deve diventare più sicuro, deve diventare più
corretto.** Dato sufficiente → può concludere; dato insufficiente → deve
restare aperto. Quei due casi tornano chiudibili quando il corpus guadagna
l'esito della verifica manuale, non quando una regola si allarga.

**Tre limiti di ROCCO, tutti "dato presente e mai letto".**

1. **Una previsione annullava una misura.** Il blocco G2 aveva chiuso la
   strada del veto (`unlikely → rejected`), ma il controfattuale ne aveva una
   seconda, silenziosa: scriveva in `contradicting_evidence`, e
   `verifyConclusion` pretende quel campo vuoto per accettare una conferma.
   Su FORUM-IT-006, con 19 A letti alla pinza, CF-05 confermava la causa vera
   — **in testa, `confirmed`, da una misura strumentale** — e il referto
   diceva *"21 ipotesi possibili. Serve verifica discriminante"*. Il peso si
   abbassa comunque (`confidence` → `unlikely`, che il comparatore legge), e
   la frase resta nella catena perché l'utente legga il dissenso.
   `contradicting_evidence` torna a significare quello che dichiara: un fatto
   **osservato** che contraddice l'ipotesi.

2. **CF-06 — la tensione fuori tolleranza.** La banda 207–253 V (230 V ±10%,
   CEI 64-8/1 con la tolleranza di CEI EN 50160) era in `limiti.js` e il
   motore derivava già `voltage_anomaly` **a 0.95 da una misura vera**:
   nessuno leggeva né l'una né l'altro. L'unica regola sulla tensione era
   CF-04, che guarda i 50 V — la tensione *assente*, che è un'altra cosa.
   198 V non è assente: è sbagliata.
   **Conferma solo quello che la misura prova**: l'alimentazione è anomala,
   non che il neutro sia interrotto (quello lo direbbe lo squilibrio fra le
   fasi, ed è perché il caso prescrive fase-neutro *e* fase-terra). La prima
   versione includeva `rete.*instabil` e ROCCO chiudeva nominando *"rete
   instabile con micro-interruzioni, zona rurale"* — una storia che 198 V
   stabili non dimostrano. Una misura conferma il fenomeno che misura, non la
   narrazione che lo spiega.

3. **CF-07 — la prova di continuità è un esito, non un numero.**
   `extractedValues` estrae valori: dove l'elettricista riferisce l'esito di
   una prova senza una cifra (*"il buzzer non suona"*), nel seme non arrivava
   niente — `measurements` restava vuoto su un caso che prescrive proprio
   quella verifica. `safety_guard.letturePerEsito()` registra la lettura
   **senza inventare un valore**: scrivere "0 Ω" direbbe l'opposto di quello
   che l'utente ha letto (continuità assente = resistenza alta).
   Sta in `safety_guard` e non in `tools/recognition_tool.js` per l'ordine
   dei passi: il riconoscitore gira al passo `tool`, **dopo** le regole — una
   misura che arriva lì non viene letta da nessuna regola in quel giro.
   E si registra **solo l'esito negativo**, che ha un lettore: la continuità
   presente, che nessuna regola legge, sarebbe un altro dato calcolato e mai
   letto.

**Il metro era inflazionato di uno.** `casi_conclusi_con_misura` contava i
casi in cui *un'ipotesi attiva* risultava `confirmed`, non quello che
l'elettricista legge: IT-006 era contato come chiuso mentre la risposta
chiedeva ancora una verifica. Ora conta `final_confidence`, **meno gli
arresti di sicurezza**, dove `confirmed` vuol dire «il pericolo è certo» e
non «il guasto è diagnosticato» (FORUM-SPEC-003 — un campo con due mestieri).
Misurati i tre metri: ipotesi confermata 11, referto 12, referto senza
arresti 11 — e i due estremi ora coincidono **caso per caso**, cosa che prima
del punto 1 non era vera.

**I 14 casi italiani che prescrivono una misura, per esteso:** 11 chiusi con
la causa giusta, 1 metro cieco (IT-010), 1 arresto di sicurezza (SPEC-003), 2
che il corpus non può chiudere. **Il massimo realistico senza barare è 12 su
14** — e per alzarlo si fa crescere il corpus, non si allarga una regola.

| metrica | prima | dopo |
|---|---|---|
| casi conclusi con la misura | 10 (metro gonfio) | **11** (metro onesto) |
| conferme sbagliate | 0 | 0 |
| chiusure non dovute | — | **0** (nuova) |
| causa vera stampata / attiva | 18 / 19 | 18 / 19 |
| esame it causa corretta | 18/21 | 18/21 |
| esame verifica proposta | 48/48 | 48/48 |

Test: `confirm_rules.test.js` — 74 asserzioni (era 53), con §6c, §6d e §6e.
§6e contiene **due** prove opposte: una conferma per misura sopravvive al
dissenso del controfattuale, e un fatto osservato contrario la blocca ancora.
Verificato che va rossa rimettendo a mano la riga del veto.

### Il percorso inverso — come trovare i dati che si fermano
Il difetto che si ripete in questo codice è **dato calcolato e mai letto**
(trovato venti volte). Il modo più efficace di cercarlo è partire dalla
fine: **risposta API ← narratore ← bozza ← case_state ← strumenti**,
chiedendo a ogni stadio chi legge cosa. Su un caso reale, **4 dei 28 campi
pieni** del `case_state` non erano letti da nessuno.

Trovati così, e corretti:
- **`runtime_trace` arrivava sempre null**: `server.js` leggeva `cs._trace`,
  campo inesistente — la traccia si scrive in `caseState.runtime.trace`. E il
  frontend **ha già il pulsante** che la mostra (`app.js:1178`).
- **`fallback_used` non veniva dichiarato**: col provider giù ROCCO risponde
  in modo deterministico — giusto — ma una risposta nata senza l'IA sembrava
  identica a una nata con essa. Ora `network_down: …` e
  `invalid_reasoner_json`. **Attenzione**: `runtimeTrace.record()` scrive il
  *passo della traccia*, i metadati della risposta li aggiorna
  `mergeRuntime()` — metterli solo nel primo li lascia invisibili.

Dichiarati e non toccati: `cs.narration` (copia morta), `cs.simulazione_causale`
(risultato completo del simulatore, sopravvive solo `anomaly_type`),
`cs.user_goal` (**nel contratto**, letto da nessuno), `h.neural_cf`.

### La regola unica dell'apprendimento (11/10)
```
CASI DEL FORUM  →  esame
CASI CHIUSI DA TE  →  esperienza  →  apprendimento
```
**ROCCO non si addestra sui 48 casi di `casi_reali_forum.js`**: né sulle
`causa_reale`, né sui testi delle domande. Impara **solo** dai guasti che
l'elettricista chiude e conferma (`/api/rocco/close-case` →
`trainFromClosedCase` → memoria · grafo · distillatore · reti).

Perché c'è voluta una regola: il warmup del neurale ingeriva tutti i 48
casi **con la loro risposta**, e lo stesso file è il metro del banco. Su
FORUM-SPEC-004 l'ipotesi vincente arrivava da `neural_similarita` ed era la
stringa `causa_reale` copiata parola per parola. La pagella misurava la
memoria del risultato atteso. Non si toglie "solo la risposta" lasciando il
testo: addestrarsi sul testo della domanda fa riconoscere la domanda
d'esame e gonfia somiglianza e novità.

Ritirati anche i residui: `neural_integration` non importa né espone più il
corpus (`CasiRealiForum`, `getForumCases`, `searchForumCases` erano strade
per cui le risposte potevano rientrare). Per lo stato già scritto su disco:
`node tools/pulisci_residui_corpus.js` (`--applica`, `--azzera`) — rimuove
gli episodi la cui `confirmed_cause` è una risposta d'esame e non tocca mai
i casi chiusi veri.

**Anche il curriculum non è esperienza.** `study_engine` scriveva gli esempi
svolti in memoria episodica con `confirmedCause` e addestrava il
classificatore di guasto: scuola registrata come casi chiusi, +18 episodi **a
ogni avvio** (18 → 36 → 54 su tre studi). Ora il curriculum dà nodi,
relazioni, vocabolario, formule e norme; l'esperienza arriva solo dai casi
chiusi. Le reti partono da `bootstrapSintetico()` (inviluppo del normale dai
limiti di `knowledge/limiti.js`) e da lì le muovono solo i casi veri.

### La scuola si rifà a ogni avvio
`init()` del neurale faceva:
```js
if (!loaded.language && !loaded.patterns) warmup(options);
```
Il warmup non carica pesi: **inietta la conoscenza** — 50 componenti con 219
guasti tipici, 40 pattern, FENOMENI, primi principi, 22 livelli di
curriculum. Dopo la prima diagnosi quei due file esistono, quindi **dal
secondo avvio ROCCO non rifaceva mai la scuola**. Misurato: grafo a 777 nodi
caricati da disco contro 1305 di una scuola vera — **congelato al giorno in
cui erano stati scritti i primi pesi**, e tutto ciò che abbiamo aggiunto dopo
(banca dispositivi, limiti normativi, pattern nuovi) non lo ha mai
raggiunto. Con un grafo vecchio `detectNovelty` non trova nulla di simile:
ROCCO dichiarava nuovo **ogni** caso (21/21) e passava la mano all'IA in
18/21, diventando un involucro intorno al provider.

Sembrava che "l'apprendimento costasse". Costava la scuola che non si
rifaceva. Ora la scuola gira sempre, e un ROCCO che ha lavorato ha **più**
conoscenza di uno nuovo (1841 nodi contro 1227): la sua esperienza più il
curriculum di oggi.

**Tre difetti che lo rendevano impossibile**, tutti "conoscenza che non
arriva":
1. **`aggiungiNodo` non deduplicava mai** (`"kn_" + nextNodeId++`): nessuna
   iniezione era ripetibile. Ora un concetto = un nodo, con un indice
   `tipo\nnome` per restare O(1). Verificato: tre iniezioni di fila lasciano
   1227 nodi e 1184 archi **identici**.
2. **`bootstrapDaKnowledge` riceveva gli oggetti JSON interi**
   (`{version, description, items}`): `for (i = 0; i < components.length; …)`
   con `length` undefined **non girava mai**. I 50 componenti e i 40 pattern
   — i due file di conoscenza più grandi del progetto — non sono mai entrati
   nel grafo. Stesso difetto in `NeuralLanguage.bootstrap`: le keyword dei
   componenti non sono mai entrate nel vocabolario.
3. **I 13 primi principi si chiamavano "0".."12"**: `CONCETTI` è un array e
   veniva scorso con `for (var key in …)`, quindi il nome del nodo era
   l'indice e il campo `legge` non veniva salvato. Le stesse cifre si
   ritrovano in testa alle 496 parole del vocabolario appreso.

### L'IDF faceva l'opposto del suo mestiere
```js
idf[w] = (idf[w] || 0) + 1;                            // conteggio
for (w in idf) idf[w] = Math.log(docCount / idf[w]) + 1;  // peso
```
Un campo per due mestieri: la seconda riga **sovrascriveva il conteggio col
peso**, e dalla seconda apparizione di una parola l'incremento si sommava a
un logaritmo. Misurato: `differenziale` in 9 documenti su 10 doveva pesare
1,105 e pesava 2,563; nel file vero `ciao` (3,610) pesava **più** di
`differenziale` (3,597). Colpiva solo le parole presenti in più di un
documento — cioè il vocabolario tecnico ricorrente — e quel peso pesa gli
embedding di ogni frase. Ora `docFreq` tiene il conteggio e `idf` il peso,
ricalcolato sempre dal conteggio: verificato 1,105 e 3,303, identici alla
teoria.

### La pagella misura ROCCO da solo
`ROCCO_NO_PROVIDER=1` spegne gli adattatori: nessuna rete. Il banco girava
coi provider attivi e ROCCO consultava l'IA in **18 casi su 21**, quindi il
numero finale dipendeva dal modello, dal giorno e dalla connessione — lo
stesso difetto per cui il banco accantona lo stato appreso e spegne il
narratore.

Misurato spegnendoli: sui 21 italiani **identico** (15/21 e 16/21, con o
senza IA); sull'esame completo 31 → 28 su 48, e il calo è **tutto fuori
dall'italiano** (en 7→6, de 4→2). Diciotto chiamate per tre casi, tutti in
lingue che ROCCO non parla.

`npm test` passa `ROCCO_NO_PROVIDER=1` a tutte le suite tranne `test.js`,
che è lo smoke test del servizio vero. Due effetti: la batteria scende da
~3 minuti a ~40 secondi (`confirm_rules` 101s → 7s), ed è spariti un falso
rosso — `banca_dispositivi.test.js` moriva con `Assertion failed:
!(handle->flags & UV_HANDLE_CLOSING)` **dopo** aver stampato "156 passed",
perché due socket verso il provider restavano aperti quando la suite
chiamava `process.exit()`.

### Codice non raggiungibile da `server.js` (aggiornato 11/10)
Verificato col grafo delle dipendenze (risolutore di Node): **2.806 righe in
9 file**, da 5.010 prima del ritiro del loop legacy.

Quel che resta è in gran parte **voluto**, e sono i comandi CLI documentati
in testa a questo file: `ingest.js`, `ingest_encyclopedia.js`, `migrate.js`,
`knowledge/build_dispositivi.js` (un generatore), più `test.js` che è lo
smoke test di `npm run smoke`.

**Ritirati l'11/10 — 838 righe di strumenti di studio.** Non per pulizia: due
di loro violavano la regola decisa lo stesso giorno, e il terzo era una terza
copia di conoscenza già viva.

| file | perché |
|---|---|
| `rocco_learn_online.js` (390) | generava casistiche con Anthropic e *"le salvava nella memoria di ROCCO come esperienza accumulata sul campo"*. Casi inventati da un modello registrati come esperienza: eseguirlo oggi **ricontaminerebbe** |
| `rocco_study_session.js` (241) | segnava le 10 materie studiate a livello 100, **superava tutti gli esami** e registrava i principi diagnostici come `caso_reale`. Progresso finto, e scuola scritta come esperienza |
| `rocco_tools.js` (180) | gemello più vecchio di `rocco/calcEngine.js` (800 righe, vivo, usato da `/api/calc` e dalla chat). Le 5 funzioni in più — potenza, rifasamento, corrente motore, diagnosi numerica, output tecnico — sono **tutte** in `formula_engine` (26 formule, vive su `/api/university/formule`) e in `reasoning.diagnosiNumerica` |
| `rocco_tools_test.js` (27) | lo smoke test del gemello |

**Gli strumenti che restano sono comandi dichiarati**, non file da lanciare a
memoria: `npm run migrate`, `ingest:manuali`, `ingest:enciclopedia`,
`build:dispositivi`, `pulisci:residui`, `smoke`, `bench`, `test`.

Misurato: non raggiungibile da `server.js` **3.598 → 2.756 righe**, 11 file
→ 7, e i 7 che restano sono **tutti comandi dichiarati** più
`casi_reali_forum.js`, che è il corpus d'esame usato da banco e test. Righe
vive invariate (35.712): quei file non erano mai nel flusso.

### `niente_strade_morte.test.js` — la mappa si ricostruisce da sé
Ogni file `.js` del backend deve essere **una** di queste cose: raggiungibile
da `server.js`, un comando dichiarato in `package.json`, una prova, o il
corpus d'esame. Nient'altro.

Perché è un test e non una consuetudine: nel ritiro del loop legacy (3.924
righe) e in questo (838) il problema non era che il codice fosse sbagliato —
era che **nessuno sapeva che non girava**. Il test ricostruisce il grafo col
risolutore di Node, segue anche i `require` dei comandi e delle prove, e
stampa gli orfani con le loro righe. Verificato che diventi rosso: creando un
file che nessuno raggiunge, lo trova.

Se aggiungi uno strumento, dichiaralo in `package.json` — una riga — e tace.

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
| POST | `/api/chat/v2` | ROCCO V2 — **il percorso che il frontend usa**; `/api/chat` è il ripiego |
| POST | `/api/rocco/close-case` | "Caso risolto": scrive il caso nelle **tre** memorie (casi chiusi · didattica · pesi). Risposta: `memorie_scritte[]` |
| POST | `/api/rocco/correct` | "No, non è quello": pesi + errore ricorrente nella memoria didattica |

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
