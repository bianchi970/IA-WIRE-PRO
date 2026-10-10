"use strict";

/**
 * Test store conversazioni locale.
 *
 * Gira su una copia isolata del modulo con STORE_PATH dirottato in una
 * cartella temporanea: non tocca backend/data/conversations-local.json.
 */

var fs = require("fs");
var os = require("os");
var path = require("path");

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "convstore-test-"));
var tmpStore = path.join(tmpDir, "conversations-local.json");

// Carica il modulo riscrivendo la costante STORE_PATH, così il test è isolato.
var srcPath = path.join(__dirname, "..", "store", "conversationStore.js");
var src = fs.readFileSync(srcPath, "utf8").replace(
  'var STORE_PATH = path.join(__dirname, "..", "data", "conversations-local.json");',
  "var STORE_PATH = " + JSON.stringify(tmpStore) + ";"
);
var shimPath = path.join(tmpDir, "store_under_test.js");
fs.writeFileSync(shimPath, src, "utf8");
var store = require(shimPath);

var pass = 0;
var fail = 0;

function check(label, condition) {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.log("  ✗ " + label);
  }
}

function eq(label, actual, expected) {
  var ok = actual === expected;
  if (!ok) console.log("    atteso " + JSON.stringify(expected) + ", ottenuto " + JSON.stringify(actual));
  check(label, ok);
}

// ─── §1 Id locali riconoscibili e compatibili con parseInt ───────────────
console.log("\n§1 — id locali");
var id1 = store.createConversation({ title: "salta il differenziale", user_id: "u1" });
check("createConversation ritorna un id", !!id1);
check("id sopra la soglia riservata", id1 > store.LOCAL_ID_BASE);
check("isLocalId riconosce l'id", store.isLocalId(id1));
check("isLocalId riconosce la stringa (arriva dal frontend così)", store.isLocalId(String(id1)));
check("un serial Postgres non è locale", !store.isLocalId(42));
check("id non valido non è locale", !store.isLocalId("pippo"));
eq("parseInt sull'id resta l'id", parseInt(String(id1), 10), id1);

// ─── §2 Il blocco chiuso: la continuità multi-turn ──────────────────────
console.log("\n§2 — continuità multi-turn");
store.insertMessage({ conversation_id: id1, role: "user", content: "salta il differenziale con la lavatrice" });
store.insertMessage({ conversation_id: id1, role: "assistant", content: "misura isolamento col megger" });
store.insertMessage({ conversation_id: id1, role: "user", content: "isolamento 0,2 MOhm" });

var recent = store.getRecentMessages(id1, 6, ["user", "assistant"]);
eq("tre messaggi recuperati", recent.length, 3);
eq("ordine cronologico: il primo è il primo detto", recent[0].content, "salta il differenziale con la lavatrice");
eq("ordine cronologico: l'ultimo è l'ultimo detto", recent[2].content, "isolamento 0,2 MOhm");
check("il turno 1 è visibile al turno 3", recent.some(function (m) {
  return m.content.indexOf("differenziale") !== -1;
}));
check("la misura decisiva è nello storico", recent.some(function (m) {
  return m.content.indexOf("0,2 MOhm") !== -1;
}));

// limit taglia i più vecchi, non i più nuovi
var last2 = store.getRecentMessages(id1, 2, ["user", "assistant"]);
eq("limit=2 ritorna 2", last2.length, 2);
eq("limit tiene i più recenti", last2[1].content, "isolamento 0,2 MOhm");

// filtro ruoli
store.insertMessage({ conversation_id: id1, role: "system", content: "nota interna" });
var onlyUser = store.getRecentMessages(id1, 10, ["user"]);
eq("filtro ruolo user", onlyUser.length, 2);
var allRoles = store.getRecentMessages(id1, 10, []);
eq("nessun filtro = tutti i ruoli", allRoles.length, 4);

// ─── §3 Forma delle righe = forma Postgres ──────────────────────────────
console.log("\n§3 — forma righe compatibile con messages");
var m = store.getMessages(id1, 1)[0];
["id", "role", "content", "content_format", "provider", "model", "certainty", "meta_json", "created_at"]
  .forEach(function (k) {
    check("campo " + k + " presente", Object.prototype.hasOwnProperty.call(m, k));
  });
eq("content_format default text", m.content_format, "text");

var idMeta = store.createConversation({ title: "con meta", user_id: "u1" });
store.insertMessage({
  conversation_id: idMeta, role: "assistant", content: "risposta",
  provider: "openai", model: "gpt-4o-mini", certainty: "MEDIA",
  meta_json: { hypotheses_active: 8, narrated: true }
});
var mm = store.getMessages(idMeta, 1)[0];
eq("provider conservato", mm.provider, "openai");
eq("certainty conservata", mm.certainty, "MEDIA");
eq("meta_json conservato come oggetto", mm.meta_json.hypotheses_active, 8);

// ─── §4 Persistenza fra processi (il punto del disco) ───────────────────
console.log("\n§4 — sopravvive al restart");
check("il file esiste su disco", fs.existsSync(tmpStore));
delete require.cache[require.resolve(shimPath)];
var reloaded = require(shimPath);
var afterRestart = reloaded.getRecentMessages(id1, 10, ["user", "assistant"]);
eq("storico ritrovato dopo il reload", afterRestart.length, 3);
eq("contenuto intatto", afterRestart[2].content, "isolamento 0,2 MOhm");
var newIdAfterRestart = reloaded.createConversation({ title: "dopo restart", user_id: "u1" });
check("next_id non si azzera: nessuna collisione", newIdAfterRestart > id1);

// ─── §5 Elenco, aggiornamento, cancellazione ───────────────────────────
console.log("\n§5 — elenco e mutazioni");
var list = store.listConversations({ user_id: "u1", archived: false, limit: 50 });
check("le conversazioni di u1 sono elencate", list.length >= 2);
check("ordinate per updated_at discendente", (function () {
  for (var i = 1; i < list.length; i++) {
    if (String(list[i - 1].updated_at) < String(list[i].updated_at)) return false;
  }
  return true;
})());
check("origin local dichiarato", list[0].origin === "local");
eq("i messaggi non entrano nell'elenco", list[0].messages, undefined);

var otherUser = store.listConversations({ user_id: "u2", archived: false, limit: 50 });
eq("un altro utente non vede le conversazioni di u1", otherUser.length, 0);

var upd = store.updateConversation(id1, { title: "titolo nuovo" });
eq("titolo aggiornato", upd.title, "titolo nuovo");
store.updateConversation(id1, { is_archived: true });
var active = store.listConversations({ user_id: "u1", archived: false, limit: 50 });
check("archiviata esce dalla lista attiva", !active.some(function (c) { return c.id === id1; }));
var archived = store.listConversations({ user_id: "u1", archived: true, limit: 50 });
check("archiviata compare fra le archiviate", archived.some(function (c) { return c.id === id1; }));

check("delete rimuove", store.deleteConversation(idMeta));
eq("dopo delete non si trova", store.getConversation(idMeta), null);
check("delete su id inesistente ritorna false", !store.deleteConversation(999999999999));

// ─── §6 Robustezza: non far cadere la chat ─────────────────────────────
console.log("\n§6 — robustezza");
eq("insertMessage senza conversation_id", store.insertMessage({ role: "user", content: "x" }), null);
eq("insertMessage su conversazione inesistente", store.insertMessage({
  conversation_id: 1000000999, role: "user", content: "x"
}), null);
eq("getConversation su id inesistente", store.getConversation(1000000999), null);
eq("getRecentMessages su id inesistente", store.getRecentMessages(1000000999, 5, []).length, 0);
eq("updateConversation su id inesistente", store.updateConversation(1000000999, { title: "x" }), null);

// File corrotto: si riparte vuoti, non si lancia.
fs.writeFileSync(tmpStore, "{ questo non è json", "utf8");
delete require.cache[require.resolve(shimPath)];
var afterCorrupt = require(shimPath);
var listCorrupt = afterCorrupt.listConversations({ user_id: "u1", archived: false, limit: 10 });
eq("file corrotto: elenco vuoto senza eccezioni", listCorrupt.length, 0);
var idAfterCorrupt = afterCorrupt.createConversation({ title: "ripartenza", user_id: "u1" });
check("si può ricreare dopo la corruzione", !!idAfterCorrupt);
check("id valido anche dopo la corruzione", idAfterCorrupt > afterCorrupt.LOCAL_ID_BASE);

// ─── §7 Tetto messaggi: tiene i più recenti ────────────────────────────
console.log("\n§7 — tetto messaggi");
var idCap = afterCorrupt.createConversation({ title: "cap", user_id: "u1" });
for (var i = 1; i <= 210; i++) {
  afterCorrupt.insertMessage({ conversation_id: idCap, role: "user", content: "msg " + i });
}
var capped = afterCorrupt.getMessages(idCap, 500);
eq("tetto applicato a 200", capped.length, 200);
eq("tiene l'ultimo", capped[capped.length - 1].content, "msg 210");
check("ha scartato il primo", capped[0].content !== "msg 1");

// ─── Esito ─────────────────────────────────────────────────────────────
try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) {}

console.log("\n" + (fail === 0 ? "✓" : "✗") + " conversation_store: " + pass + " ok, " + fail + " fail");
process.exit(fail === 0 ? 0 : 1);
