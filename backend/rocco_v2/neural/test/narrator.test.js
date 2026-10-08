"use strict";
/**
 * narrator.test.js — il narratore redige, non ragiona.
 *
 * Nessuna chiamata di rete: il gateway è finto. Si verifica il mandato:
 * tradurre in italiano senza aggiungere ipotesi né misure, e tornare
 * sempre alla bozza deterministica quando qualcosa non torna.
 */

var narrator = require("../../narrator");
var lexicon = require("../../lexicon");

// Il test pilota lui stesso l'interruttore: un ROCCO_NARRATOR=0 ereditato
// dall'ambiente non deve far fallire i casi che si aspettano la redazione.
var ENV_NARRATOR = process.env.ROCCO_NARRATOR;
delete process.env.ROCCO_NARRATOR;

var passed = 0;
var failed = 0;

function ok(cond, label) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.log("  ✗ " + label);
}

function section(title) { console.log("\n--- " + title + " ---"); }

// ── Case state di riferimento: differenziale che scatta sotto carico ──
function makeCaseState() {
  return {
    problem_summary: "Il differenziale salta quando accendo la lavatrice. Impianto civile 230V.",
    facts_confirmed: [
      "rcd_trip", "under_load", "voltage_nominal", "rcd-ac-2p",
      "Valori misurati rilevati: 230V (tensione), 2min (tempo).",
      "Componente riconosciuto [RCD-AC-2P]: rcd."
    ],
    measurements: [{ type: "tensione", value: 230, unit: "V" }],
    components_detected: ["rcd-ac-2p", "contactor-ac"],
    hypotheses: [
      { label: "Dispersione verso terra su carico o linea", reason: "", status: "active",
        source: "elettrotecnica", catena: ["RCD misura Delta_I tra fase e neutro", "Delta_I > I_dn (30mA civile) → sgancio"] },
      { label: "Dispositivo RCD difettoso", reason: "usura meccanica", status: "active",
        source: "elettrotecnica", catena: [] },
      { label: "Cortocircuito franco fase-neutro", reason: "", status: "rejected",
        rejection_reason: "il magnetotermico non è intervenuto", source: "elettrotecnica", catena: [] }
    ],
    final_confidence: "non_verifiable",
    next_action: { expected_discriminator: "misura isolamento con megger: se R < 1 MOhm → circuito trovato" },
    safety: {
      level: "attention",
      reasons: ["Verifiche strumentali necessarie prima di qualunque sostituzione."],
      blocked_actions: ["sostituzioni senza conferma strumentale"],
      allowed_next_step: "Scollegare i carichi uno alla volta"
    },
    missing_critical_data: ["manca misura isolamento verso terra"],
    system_model: { type: "protezione_differenziale", funzionamento: "protegge dalle dispersioni", discrepancy: "la protezione interviene" },
    runtime: { trace: [], tools_used: [] }
  };
}

var DRAFT = [
  "OSSERVAZIONI:", "- bozza deterministica",
  "", "COMPONENTI COINVOLTI:", "- differenziale bipolare tipo AC",
  "", "IPOTESI:", "- Dispersione verso terra su carico o linea",
  "", "LIVELLO DI CERTEZZA:", "DA VERIFICARE",
  "", "VERIFICHE OPERATIVE:", "- misura isolamento con megger",
  "", "RISCHI REALI:", "- prudenza operativa",
  "", "PROSSIMO PASSO:", "- misura isolamento"
].join("\n");

function fakeGateway(text) {
  return {
    runReasoner: function () {
      return Promise.resolve({ ok: true, text: text, provider_used: "fake", model_used: "fake-1", fallback_used: false });
    }
  };
}

function failingGateway(message) {
  return {
    runReasoner: function () { return Promise.reject(new Error(message)); }
  };
}

var GOOD = [
  "OSSERVAZIONI:",
  "- Il differenziale scatta quando entra in funzione la lavatrice, su impianto a 230V.",
  "",
  "COMPONENTI COINVOLTI:",
  "- differenziale bipolare tipo AC",
  "",
  "IPOTESI:",
  "- Dispersione verso terra su carico o linea — il differenziale misura lo squilibrio",
  "  tra fase e neutro e sgancia quando supera i 30mA",
  "- Dispositivo RCD difettoso — l'usura meccanica dello sgancio provoca interventi impropri",
  "",
  "LIVELLO DI CERTEZZA:",
  "DA VERIFICARE",
  "",
  "VERIFICHE OPERATIVE:",
  "- Misura isolamento con megger: se R < 1 MOhm il circuito guasto è individuato",
  "- Scollegare i carichi uno alla volta e rilanciare il differenziale",
  "",
  "RISCHI REALI:",
  "- Verifiche strumentali necessarie prima di qualunque sostituzione",
  "",
  "PROSSIMO PASSO:",
  "- Misura di isolamento verso terra sul circuito della lavatrice"
].join("\n");

// ============================================================

section("1. Lessico — nessuno slug arriva all'utente");

ok(lexicon.humanize("rcd_trip") === "il differenziale scatta", "rcd_trip tradotto");
ok(lexicon.humanize("rcd-ac-2p") === "differenziale bipolare tipo AC", "id componente tradotto");
ok(lexicon.humanize("voltage_nominal") === "tensione nel range nominale", "fatto di evidenza tradotto");
ok(lexicon.humanize("slug_mai_visto").indexOf("_") < 0, "slug ignoto comunque senza underscore");
ok(lexicon.humanize("Il differenziale scatta") === "Il differenziale scatta", "le frasi restano intatte");
ok(lexicon.isMachineToken("under_load") === true, "under_load riconosciuto come slug");
ok(lexicon.isMachineToken("Valori misurati rilevati: 230V") === false, "una frase non è uno slug");
ok(lexicon.certaintyLabel("non_verifiable") === "DA VERIFICARE", "certezza etichettata");

var cleaned = lexicon.cleanFacts(makeCaseState().facts_confirmed, 6);
ok(cleaned.length > 0, "cleanFacts produce qualcosa");
ok(cleaned.indexOf("rcd_trip") < 0, "nessuno slug grezzo in uscita");
ok(cleaned[0].indexOf("Valori misurati") === 0 || cleaned[0].indexOf("Componente") === 0,
  "le frasi leggibili hanno la priorità sugli slug");

section("2. Estrazione dati — tutto già in italiano");

var data = narrator.extractData(makeCaseState(), null);
ok(data.certainty === "DA VERIFICARE", "certezza estratta");
ok(data.components.indexOf("differenziale bipolare tipo AC") >= 0, "componenti in italiano");
ok(data.hypotheses.length === 2, "solo le ipotesi attive");
ok(data.rejected.length === 1, "le escluse restano separate");
ok(data.facts.every(function (f) { return !lexicon.isMachineToken(f); }), "nessuno slug tra i fatti");
ok(data.nextAction.indexOf("megger") >= 0, "verifica discriminante presente");

section("3. Redazione valida — il narratore scrive, la bozza viene sostituita");

narrator.narrate(makeCaseState(), DRAFT, fakeGateway(GOOD), {}).then(function (r) {
  ok(r.narrated === true, "redazione accettata");
  ok(r.answer !== DRAFT, "la risposta non è più la bozza");
  ok(r.answer.indexOf("OSSERVAZIONI") >= 0, "sezioni presenti");
  ok(r.provider_used === "fake", "provider tracciato");
  ok(r.reason === null, "nessun motivo di scarto");

  section("4. Ipotesi inventata — si torna alla bozza");

  var invented = GOOD.replace(
    "- Dispositivo RCD difettoso — l'usura meccanica dello sgancio provoca interventi impropri",
    "- Impianto di terra inesistente o scollegato dal dispersore principale"
  );
  return narrator.narrate(makeCaseState(), DRAFT, fakeGateway(invented), {});
}).then(function (r) {
  ok(r.narrated === false, "redazione con ipotesi inventata scartata");
  ok(r.answer === DRAFT, "torna la bozza deterministica");
  ok(/ipotesi non presente/.test(r.reason || ""), "motivo registrato: " + r.reason);

  section("5. Misura inventata — si torna alla bozza");

  var fakeMeasure = GOOD.replace("i 30mA", "i 847mA");
  return narrator.narrate(makeCaseState(), DRAFT, fakeGateway(fakeMeasure), {});
}).then(function (r) {
  ok(r.narrated === false, "redazione con misura inventata scartata");
  ok(/misure non nei dati/.test(r.reason || ""), "motivo registrato: " + r.reason);

  section("6. Certezza alterata — si torna alla bozza");

  var altered = GOOD.replace("DA VERIFICARE", "CONFERMATO");
  return narrator.narrate(makeCaseState(), DRAFT, fakeGateway(altered), {});
}).then(function (r) {
  ok(r.narrated === false, "promozione della certezza bloccata");
  ok(/certezza alterato/.test(r.reason || ""), "motivo registrato: " + r.reason);

  section("7. Sezione mancante — si torna alla bozza");

  var truncated = GOOD.split("RISCHI REALI:")[0];
  return narrator.narrate(makeCaseState(), DRAFT, fakeGateway(truncated), {});
}).then(function (r) {
  ok(r.narrated === false, "relazione incompleta scartata");
  ok(/sezioni mancanti/.test(r.reason || ""), "motivo registrato: " + r.reason);

  section("8. Slug trapelato — si torna alla bozza");

  var leaked = GOOD.replace("- differenziale bipolare tipo AC", "- rcd_ac_2p");
  return narrator.narrate(makeCaseState(), DRAFT, fakeGateway(leaked), {});
}).then(function (r) {
  ok(r.narrated === false, "slug nel testo scartato");
  ok(/slug interno/.test(r.reason || ""), "motivo registrato: " + r.reason);

  section("9. Provider non raggiungibile — la bozza resta una risposta valida");

  return narrator.narrate(makeCaseState(), DRAFT, failingGateway("ENOTFOUND"), {});
}).then(function (r) {
  ok(r.narrated === false, "nessuna redazione senza provider");
  ok(r.answer === DRAFT, "risposta = bozza deterministica");
  ok(/ENOTFOUND/.test(r.reason || ""), "motivo di rete registrato");

  section("10. Nessun gateway / narratore disattivato");

  return narrator.narrate(makeCaseState(), DRAFT, null, {});
}).then(function (r) {
  ok(r.narrated === false, "senza gateway non si narra");
  ok(r.answer === DRAFT, "risposta = bozza");

  process.env.ROCCO_NARRATOR = "0";
  return narrator.narrate(makeCaseState(), DRAFT, fakeGateway(GOOD), {});
}).then(function (r) {
  ok(r.narrated === false, "ROCCO_NARRATOR=0 disattiva la redazione");
  ok(/disattivato/.test(r.reason || ""), "motivo: narratore disattivato");
  delete process.env.ROCCO_NARRATOR;

  section("11. Timeout — non blocca la risposta");

  var slow = { runReasoner: function () { return new Promise(function () { /* mai */ }); } };
  return narrator.narrate(makeCaseState(), DRAFT, slow, { timeout_ms: 80 });
}).then(function (r) {
  ok(r.narrated === false, "timeout gestito");
  ok(r.answer === DRAFT, "la bozza arriva comunque");
  ok(/timeout/.test(r.reason || ""), "motivo: timeout");

  section("12. Helper di validazione");

  ok(narrator.isHypothesisLabelLine("- Dispersione verso terra") === true, "riga-etichetta riconosciuta");
  ok(narrator.isHypothesisLabelLine("  motivo tecnico: perche'") === false, "riga indentata non è etichetta");
  ok(narrator.isHypothesisLabelLine("1. Dispersione verso terra") === true, "elenco numerato riconosciuto");
  ok(narrator.hypothesisCausePart("- Dispersione su carico — spiegazione lunga") === "Dispersione su carico",
    "la causa viene isolata dalla motivazione");
  ok(narrator.extractMeasuredNumbers("elenco 4. con 30mA e 1 MOhm").length === 2,
    "solo i numeri con unità contano come misure");

  if (ENV_NARRATOR === undefined) delete process.env.ROCCO_NARRATOR;
  else process.env.ROCCO_NARRATOR = ENV_NARRATOR;

  console.log("\n" + new Array(61).join("="));
  console.log("NARRATOR: " + passed + " passed, " + failed + " failed");
  console.log(new Array(61).join("="));
  process.exit(failed > 0 ? 1 : 0);
}).catch(function (e) {
  console.log("ERRORE TEST:", e && e.stack);
  process.exit(1);
});
