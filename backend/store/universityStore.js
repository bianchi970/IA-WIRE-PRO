"use strict";

/**
 * Store della memoria didattica su disco — ROCCO impara anche a DB spento.
 *
 * Perché esiste: `modules/rocco_university/memory.js` apriva un **secondo**
 * Pool pg e parlava solo con Postgres. Col DB di Render irraggiungibile
 * l'avvio stampava `[ROCCO UNIVERSITY] Errore inizializzazione memoria:
 * Connection terminated unexpectedly` e da quel momento ogni caso reale,
 * ogni errore ricorrente e ogni esame superato **andavano persi in silenzio**:
 * le scritture sono fire-and-forget (`.catch(() => {})`), quindi nessuno se
 * ne accorgeva. La materia che ROCCO aveva studiato era l'unica conoscenza
 * che per esistere richiedeva un database.
 *
 * Stesso pattern di `store/conversationStore.js` e `rocco_v2/memory.js`:
 * ES5, scrittura atomica tmp+rename, **nessuna eccezione verso il chiamante**
 * (file corrotto → si riparte vuoti). Postgres resta la destinazione
 * preferita quando risponde; questo store è il ripiego, e il ripiego è
 * agganciato al **fallimento della query**, non a `if (!pool)`: il pool è un
 * oggetto anche quando il DB è morto.
 *
 * Forma dei record: la stessa delle tabelle `rocco_memoria` e `rocco_esami`,
 * così `getMemoria()` e `getStatistiche()` compongono la risposta con lo
 * stesso codice qualunque sia la provenienza.
 */

var fs = require("fs");
var path = require("path");

var STORE_PATH = path.join(__dirname, "..", "data", "university-memory-local.json");

// Tetti per non far crescere il file senza limite.
var MAX_MEMORIA = 2000;
var MAX_ESAMI = 500;

function safeText(value) {
  return String(value === undefined || value === null ? "" : value);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeRecord(raw) {
  var r = raw && typeof raw === "object" ? raw : {};
  var created = safeText(r.created_at) || nowIso();
  return {
    id: typeof r.id === "number" ? r.id : 0,
    user_id: safeText(r.user_id) || "default",
    materia: safeText(r.materia),
    tipo: safeText(r.tipo),
    contenuto: r.contenuto && typeof r.contenuto === "object" ? r.contenuto : {},
    livello_studio: typeof r.livello_studio === "number" ? r.livello_studio : 0,
    created_at: created,
    updated_at: safeText(r.updated_at) || created
  };
}

function normalizeEsame(raw) {
  var e = raw && typeof raw === "object" ? raw : {};
  return {
    id: typeof e.id === "number" ? e.id : 0,
    user_id: safeText(e.user_id) || "default",
    materia: safeText(e.materia),
    punteggio: typeof e.punteggio === "number" ? e.punteggio : 0,
    max_punteggio: typeof e.max_punteggio === "number" ? e.max_punteggio : 0,
    superato: Boolean(e.superato),
    data_esame: safeText(e.data_esame) || nowIso()
  };
}

function emptyStore() {
  return { version: 1, next_id: 1, memoria: [], esami: [] };
}

function normalizeStore(raw) {
  var s = raw && typeof raw === "object" ? raw : {};
  var memoria = safeArray(s.memoria).map(normalizeRecord);
  var esami = safeArray(s.esami).map(normalizeEsame);
  var maxId = 0;
  memoria.concat(esami).forEach(function (item) {
    if (item.id > maxId) maxId = item.id;
  });
  return {
    version: typeof s.version === "number" ? s.version : 1,
    next_id: typeof s.next_id === "number" && s.next_id > maxId ? s.next_id : maxId + 1,
    memoria: memoria.slice(-MAX_MEMORIA),
    esami: esami.slice(-MAX_ESAMI)
  };
}

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return emptyStore();
    return normalizeStore(JSON.parse(fs.readFileSync(STORE_PATH, "utf8")));
  } catch (_error) {
    // File illeggibile o corrotto: si riparte vuoti, mai un'eccezione in chat.
    return emptyStore();
  }
}

function writeStore(store) {
  var normalized = normalizeStore(store);
  var tempPath = STORE_PATH + ".tmp";
  try {
    var dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), "utf8");
    fs.renameSync(tempPath, STORE_PATH);
    return true;
  } catch (_error) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_e) {}
    return false;
  }
}

function nextId(store) {
  var id = store.next_id;
  store.next_id = id + 1;
  return id;
}

// ─── SCRITTURA ──────────────────────────────────────────────────────────────

/**
 * Aggiunge un record di memoria. `dedupeKey` (opzionale) è il percorso di una
 * chiave dentro `contenuto`: se un record dello stesso utente/materia/tipo ha
 * lo stesso valore, invece di duplicare si incrementa `contatore`. Serve agli
 * errori ricorrenti, dove il numero di volte è l'informazione.
 */
function addRecord(record, dedupeKey) {
  var store = readStore();
  var incoming = normalizeRecord(record);
  var existing = null;

  if (dedupeKey) {
    store.memoria.forEach(function (item) {
      if (existing) return;
      if (item.user_id !== incoming.user_id) return;
      if (item.materia !== incoming.materia) return;
      if (item.tipo !== incoming.tipo) return;
      if (safeText(item.contenuto[dedupeKey]) !== safeText(incoming.contenuto[dedupeKey])) return;
      existing = item;
    });
  }

  if (existing) {
    existing.contenuto.contatore = (existing.contenuto.contatore || 1) + 1;
    existing.updated_at = nowIso();
  } else {
    incoming.id = nextId(store);
    store.memoria.push(incoming);
  }

  writeStore(store);
  return existing || incoming;
}

function addEsame(esame) {
  var store = readStore();
  var incoming = normalizeEsame(esame);
  incoming.id = nextId(store);
  store.esami.push(incoming);
  writeStore(store);
  return incoming;
}

// ─── LETTURA ────────────────────────────────────────────────────────────────

/** Record di memoria di un utente, dal più recente — forma delle righe SQL. */
function listRecords(userId) {
  var uid = safeText(userId) || "default";
  return readStore().memoria
    .filter(function (item) { return item.user_id === uid; })
    .sort(function (a, b) { return a.updated_at < b.updated_at ? 1 : -1; });
}

/** Errori più frequenti, dal più ripetuto. */
function listErrori(userId, limit) {
  var max = typeof limit === "number" ? limit : 10;
  return listRecords(userId)
    .filter(function (item) { return item.tipo === "errore_frequente"; })
    .map(function (item) {
      return {
        materia: item.materia,
        errore: safeText(item.contenuto.errore),
        contatore: item.contenuto.contatore || 1
      };
    })
    .sort(function (a, b) { return b.contatore - a.contatore; })
    .slice(0, max);
}

/** Storico esami, dal più recente. */
function listEsami(userId) {
  var uid = safeText(userId) || "default";
  return readStore().esami
    .filter(function (item) { return item.user_id === uid; })
    .sort(function (a, b) { return a.data_esame < b.data_esame ? 1 : -1; });
}

/** Quanto c'è su disco — per /health e per il banco. */
function counts() {
  var store = readStore();
  return { memoria: store.memoria.length, esami: store.esami.length };
}

module.exports = {
  STORE_PATH: STORE_PATH,
  addRecord: addRecord,
  addEsame: addEsame,
  listRecords: listRecords,
  listErrori: listErrori,
  listEsami: listEsami,
  counts: counts
};
