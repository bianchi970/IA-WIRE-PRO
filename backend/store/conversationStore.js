"use strict";

/**
 * Store conversazioni su disco — continuità del case_state senza DB.
 *
 * Perché esiste: la continuità multi-turn di ROCCO poggiava su un solo
 * `if (pool)`. Con Postgres non raggiungibile `convCreate()` tornava null,
 * `prior_context` non arrivava mai all'orchestratore e il case_state nasceva
 * vergine a ogni messaggio: l'utente dava la misura decisiva e ROCCO la
 * richiedeva. Qui la conversazione vive su disco, quindi ROCCO converge
 * anche a DB spento — e l'apprendimento sopravvive ai restart.
 *
 * Postgres resta la destinazione preferita quando risponde: questo store
 * entra in gioco solo come ripiego, e si riconosce dagli id (vedi sotto).
 *
 * Id: interi in un range alto riservato, così `parseInt` continua a
 * funzionare in tutti gli endpoint e nessun id locale può essere confuso
 * con un serial di Postgres.
 */

var fs = require("fs");
var path = require("path");

var STORE_PATH = path.join(__dirname, "..", "data", "conversations-local.json");

// Gli id locali partono sopra questa soglia: i serial Postgres non ci arrivano.
var LOCAL_ID_BASE = 1000000000;

// Tetti per non far crescere il file senza limite.
var MAX_CONVERSATIONS = 500;
var MAX_MESSAGES_PER_CONV = 200;

function safeText(value) {
  return String(value === undefined || value === null ? "" : value);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function nowIso() {
  return new Date().toISOString();
}

function isLocalId(id) {
  var n = parseInt(id, 10);
  return !isNaN(n) && n > LOCAL_ID_BASE;
}

function normalizeMessage(raw) {
  var m = raw && typeof raw === "object" ? raw : {};
  return {
    id: typeof m.id === "number" ? m.id : 0,
    role: safeText(m.role) || "user",
    content: safeText(m.content),
    content_format: safeText(m.content_format) || "text",
    provider: m.provider == null ? null : safeText(m.provider),
    model: m.model == null ? null : safeText(m.model),
    certainty: m.certainty == null ? null : safeText(m.certainty),
    meta_json: m.meta_json == null ? null : m.meta_json,
    created_at: safeText(m.created_at) || nowIso()
  };
}

function normalizeConversation(raw) {
  var c = raw && typeof raw === "object" ? raw : {};
  var created = safeText(c.created_at) || nowIso();
  return {
    id: typeof c.id === "number" ? c.id : 0,
    title: c.title == null ? null : safeText(c.title),
    user_id: c.user_id == null ? null : safeText(c.user_id),
    created_at: created,
    updated_at: safeText(c.updated_at) || created,
    is_archived: Boolean(c.is_archived),
    summary: c.summary == null ? null : safeText(c.summary),
    origin: "local",
    messages: safeArray(c.messages).map(normalizeMessage)
  };
}

function emptyStore() {
  return { version: 1, next_id: LOCAL_ID_BASE + 1, next_message_id: 1, conversations: [] };
}

function normalizeStore(raw) {
  var s = raw && typeof raw === "object" ? raw : {};
  var conversations = safeArray(s.conversations)
    .filter(function (item) { return item && typeof item === "object"; })
    .map(normalizeConversation);

  var nextId = typeof s.next_id === "number" && isFinite(s.next_id) && s.next_id > LOCAL_ID_BASE
    ? s.next_id
    : LOCAL_ID_BASE + 1;

  // Anche se il file è stato manomesso, next_id resta sopra ogni id già usato.
  conversations.forEach(function (c) {
    if (c.id >= nextId) nextId = c.id + 1;
  });

  var nextMessageId = typeof s.next_message_id === "number" && isFinite(s.next_message_id) && s.next_message_id > 0
    ? s.next_message_id
    : 1;
  conversations.forEach(function (c) {
    c.messages.forEach(function (m) {
      if (m.id >= nextMessageId) nextMessageId = m.id + 1;
    });
  });

  return {
    version: typeof s.version === "number" ? s.version : 1,
    next_id: nextId,
    next_message_id: nextMessageId,
    conversations: conversations
  };
}

function readStore() {
  try {
    if (!fs.existsSync(STORE_PATH)) return emptyStore();
    return normalizeStore(JSON.parse(fs.readFileSync(STORE_PATH, "utf8")));
  } catch (_error) {
    // File illeggibile o corrotto: meglio ripartire vuoti che far cadere la chat.
    return emptyStore();
  }
}

function writeStore(store) {
  try {
    var dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Tiene le conversazioni toccate più di recente.
    store.conversations.sort(function (a, b) {
      return safeText(b.updated_at).localeCompare(safeText(a.updated_at));
    });
    if (store.conversations.length > MAX_CONVERSATIONS) {
      store.conversations = store.conversations.slice(0, MAX_CONVERSATIONS);
    }

    // Scrittura atomica: un crash a metà non lascia un JSON troncato.
    var tmp = STORE_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
    fs.renameSync(tmp, STORE_PATH);
    return true;
  } catch (_error) {
    return false;
  }
}

function findConversation(store, id) {
  var n = parseInt(id, 10);
  for (var i = 0; i < store.conversations.length; i++) {
    if (store.conversations[i].id === n) return store.conversations[i];
  }
  return null;
}

function publicConversation(conv) {
  return {
    id: conv.id,
    title: conv.title,
    user_id: conv.user_id,
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    is_archived: conv.is_archived,
    summary: conv.summary,
    origin: "local"
  };
}

/**
 * Crea una conversazione locale. Ritorna l'id, o null se il disco non scrive.
 */
function createConversation(opts) {
  var o = opts || {};
  var store = readStore();
  var id = store.next_id;

  store.conversations.push(normalizeConversation({
    id: id,
    title: o.title == null ? null : safeText(o.title).slice(0, 200),
    user_id: o.user_id == null ? null : o.user_id,
    created_at: nowIso(),
    updated_at: nowIso(),
    messages: []
  }));
  store.next_id = id + 1;

  return writeStore(store) ? id : null;
}

/**
 * Aggiunge un messaggio. Ritorna l'id del messaggio, o null.
 */
function insertMessage(opts) {
  var o = opts || {};
  if (!o.conversation_id) return null;

  var store = readStore();
  var conv = findConversation(store, o.conversation_id);
  if (!conv) return null;

  var msgId = store.next_message_id;
  conv.messages.push(normalizeMessage({
    id: msgId,
    role: o.role,
    content: o.content,
    content_format: o.content_format || "text",
    provider: o.provider,
    model: o.model,
    certainty: o.certainty,
    meta_json: o.meta_json,
    created_at: nowIso()
  }));
  if (conv.messages.length > MAX_MESSAGES_PER_CONV) {
    conv.messages = conv.messages.slice(-MAX_MESSAGES_PER_CONV);
  }
  conv.updated_at = nowIso();
  store.next_message_id = msgId + 1;

  return writeStore(store) ? msgId : null;
}

function touchConversation(id) {
  var store = readStore();
  var conv = findConversation(store, id);
  if (!conv) return false;
  conv.updated_at = nowIso();
  return writeStore(store);
}

/**
 * Ultimi `limit` messaggi in ordine cronologico (il più vecchio per primo),
 * stessa forma delle righe di `messages` su Postgres.
 */
function getRecentMessages(id, limit, roles) {
  var store = readStore();
  var conv = findConversation(store, id);
  if (!conv) return [];

  var wanted = safeArray(roles);
  var msgs = conv.messages.filter(function (m) {
    return wanted.length === 0 || wanted.indexOf(m.role) !== -1;
  });

  var n = parseInt(limit, 10);
  if (!isNaN(n) && n > 0 && msgs.length > n) msgs = msgs.slice(-n);
  return msgs;
}

function getConversation(id) {
  var conv = findConversation(readStore(), id);
  return conv ? publicConversation(conv) : null;
}

function getMessages(id, limit) {
  return getRecentMessages(id, limit, []);
}

function listConversations(opts) {
  var o = opts || {};
  var archived = Boolean(o.archived);
  var store = readStore();

  var items = store.conversations.filter(function (c) {
    if (Boolean(c.is_archived) !== archived) return false;
    if (o.user_id && c.user_id && c.user_id !== o.user_id) return false;
    return true;
  });

  items.sort(function (a, b) {
    return safeText(b.updated_at).localeCompare(safeText(a.updated_at));
  });

  var n = parseInt(o.limit, 10);
  if (!isNaN(n) && n > 0) items = items.slice(0, n);
  return items.map(publicConversation);
}

function updateConversation(id, patch) {
  var p = patch || {};
  var store = readStore();
  var conv = findConversation(store, id);
  if (!conv) return null;

  if (p.title !== undefined) conv.title = p.title == null ? null : safeText(p.title).slice(0, 200);
  if (p.is_archived !== undefined) conv.is_archived = Boolean(p.is_archived);
  if (p.summary !== undefined) conv.summary = p.summary == null ? null : safeText(p.summary);
  conv.updated_at = nowIso();

  return writeStore(store) ? publicConversation(conv) : null;
}

function deleteConversation(id) {
  var n = parseInt(id, 10);
  var store = readStore();
  var before = store.conversations.length;
  store.conversations = store.conversations.filter(function (c) { return c.id !== n; });
  if (store.conversations.length === before) return false;
  return writeStore(store);
}

function countMessages(id, roles) {
  return getRecentMessages(id, 0, roles).length;
}

module.exports = {
  LOCAL_ID_BASE: LOCAL_ID_BASE,
  STORE_PATH: STORE_PATH,
  isLocalId: isLocalId,
  createConversation: createConversation,
  insertMessage: insertMessage,
  touchConversation: touchConversation,
  getRecentMessages: getRecentMessages,
  getConversation: getConversation,
  getMessages: getMessages,
  listConversations: listConversations,
  updateConversation: updateConversation,
  deleteConversation: deleteConversation,
  countMessages: countMessages
};
