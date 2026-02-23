/**
 * IA Wire Pro — ingest.js
 * Popola doc_chunks con testi tecnici di test (idempotente).
 * Uso: node backend/ingest.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { pool } = require("./db");

// ============================================================
// Chunk tecnici di test — elettrico / automazione / impianti
// ============================================================
const TEST_CHUNKS = [
  {
    source: "manuale_elettrico_base.txt",
    chunk_text:
      "Il differenziale (RCD) interviene quando rileva una corrente di dispersione verso terra " +
      "superiore alla soglia impostata (tipicamente 30mA per uso domestico). Dopo un intervento, " +
      "prima di riarmare verificare il circuito con multimetro: misurare la continuità verso terra " +
      "e l'isolamento dei cavi con megohmetro a 500V. Non riarmare a ripetizione senza diagnosi.",
  },
  {
    source: "manuale_elettrico_base.txt",
    chunk_text:
      "Il magnetotermico (MCB) protegge il circuito da sovraccarichi e cortocircuiti. " +
      "Curva B: scatta a 3–5× In (residenziale, illuminazione). " +
      "Curva C: scatta a 5–10× In (industriale, motori). " +
      "Curva D: scatta a 10–20× In (carichi con elevate correnti di spunto). " +
      "Se scatta ripetutamente senza causa apparente: misurare la corrente assorbita con pinza amperometrica.",
  },
  {
    source: "manuale_elettrico_base.txt",
    chunk_text:
      "Sezioni cavi consigliate: " +
      "NYM-J 3×1.5mm² per circuiti luce (max 16A / 3.5kW a 230V). " +
      "NYM-J 3×2.5mm² per prese di corrente standard (max 20A). " +
      "NYM-J 3×4mm² per circuiti lavatrice/lavastoviglie dedicati. " +
      "NYM-J 3×6mm² per forno o piano cottura con linea dedicata (protezione 32A). " +
      "Aumentare sezione in caso di percorsi >20m per limitare la caduta di tensione a <3%.",
  },
  {
    source: "guida_quadri_elettrici.txt",
    chunk_text:
      "Nel quadro elettrico il neutro (N) e la terra (PE) NON devono mai essere uniti " +
      "a valle del nodo equipotenziale principale. " +
      "In un sistema TN-C il conduttore PEN è unico fino al quadro principale. " +
      "Nel quadro principale avviene la separazione: da quel punto in poi N e PE " +
      "devono percorrere conduttori distinti fino alle utenze. " +
      "Unire N e PE fuori dal punto prescritto crea un impianto non a norma CEI 64-8.",
  },
  {
    source: "guida_quadri_elettrici.txt",
    chunk_text:
      "Procedura di verifica del differenziale (RCD): " +
      "1) Misurare la tensione di alimentazione con multimetro (deve essere 230V ±10%). " +
      "2) Usare tester RCD certificato per misurare il tempo di intervento: " +
      "   deve essere <300ms a In, <40ms a 5×In (per tipo G). " +
      "3) Premere il tasto TEST mensile per verifica meccanica dell'interruzione. " +
      "4) Registrare i valori misurati per documentazione di manutenzione.",
  },
  {
    source: "guida_quadri_elettrici.txt",
    chunk_text:
      "Serraggio morsetti nel quadro: verificare e riserrare dopo 6 mesi dalla prima installazione " +
      "(assestamento termico e meccanico dei conduttori). " +
      "Coppia di serraggio indicativa: " +
      "morsetti 1.5–2.5mm² → 0.5–0.6 Nm, " +
      "morsetti 4–6mm²   → 0.8–1.0 Nm, " +
      "morsetti 10–16mm² → 1.2–1.5 Nm. " +
      "Usare cacciavite dinamometrico. Un morsetto allentato genera calore, archi e incendi.",
  },
  {
    source: "norme_cei_impianti.txt",
    chunk_text:
      "CEI 64-8 (impianti elettrici in luoghi residenziali): " +
      "ogni utenza con potenza >2kW (lavatrice, lavastoviglie, forno, climatizzatore) " +
      "deve avere una linea dedicata con proprio magnetotermico e differenziale 30mA. " +
      "Nei bagni: circuiti luce e prese protetti da differenziale 10mA. " +
      "Il numero minimo di prese per ambiente: cucina ≥4, soggiorni ≥3, camere ≥2.",
  },
  {
    source: "norme_cei_impianti.txt",
    chunk_text:
      "Resistenza di terra: la normativa CEI 64-8 / IEC 60364 prescrive " +
      "Rt ≤ 50V / Idn_differenziale. " +
      "Esempi: con RCD 30mA → Rt ≤ 1667 Ω; con RCD 10mA → Rt ≤ 5000 Ω; " +
      "con RCD 300mA → Rt ≤ 167 Ω. " +
      "Misurare con tellumetro a 3 o 4 poli (metodo Wenner), mai con tester ordinario. " +
      "Eseguire la misura dopo pioggia intensa solo se si vuole il valore peggiore.",
  },
  {
    source: "diagnosi_guasti_comuni.txt",
    chunk_text:
      "Guasto: differenziale scatta appena si richiude. " +
      "Procedura di diagnosi: " +
      "1) Scollegare tutti i carichi dalla linea protetta. " +
      "2) Riarmare il differenziale a vuoto: se rimane → guasto nel cablaggio (dispersione verso terra), " +
      "   misurare l'isolamento dei cavi con megohmetro 500V (deve essere >1MΩ). " +
      "3) Se scatta ancora a vuoto → probabile guasto nel differenziale stesso o nel conduttore di neutro. " +
      "4) Verificare che neutro e terra non siano uniti a valle del punto prescritto.",
  },
  {
    source: "diagnosi_guasti_comuni.txt",
    chunk_text:
      "Guasto: magnetotermico caldo al tatto / odore di plastica bruciata. " +
      "Cause possibili: " +
      "1) Morsetto allentato (alta resistenza di contatto) → serrare al valore previsto. " +
      "2) Cavo sottodimensionato per il carico → verificare sezione con calibro, sostituire se necessario. " +
      "3) Carico eccessivo (sovraccarico continuo) → misurare corrente con pinza, " +
      "   ridurre carichi o aumentare sezione/protezione. " +
      "4) Dispositivo difettoso → sostituire. " +
      "Non continuare a utilizzare fino alla risoluzione della causa.",
  },
];

// ============================================================
// Runner
// ============================================================
(async () => {
  const client = await pool.connect();
  try {
    console.log("\n\uD83D\uDD04 Ingest doc_chunks — IA Wire Pro\n");

    let inserted = 0;
    let skipped = 0;

    for (const chunk of TEST_CHUNKS) {
      const existing = await client.query(
        `SELECT id FROM doc_chunks WHERE source = $1 AND chunk_text = $2 LIMIT 1`,
        [chunk.source, chunk.chunk_text]
      );

      if (existing.rowCount > 0) {
        console.log(
          "  \u23ED\uFE0F  Gi\u00e0 presente: [" + chunk.source + "] " +
            chunk.chunk_text.slice(0, 65) + "..."
        );
        skipped++;
        continue;
      }

      await client.query(
        `INSERT INTO doc_chunks (source, chunk_text) VALUES ($1, $2)`,
        [chunk.source, chunk.chunk_text]
      );
      console.log(
        "  \u2705 Inserito:    [" + chunk.source + "] " +
          chunk.chunk_text.slice(0, 65) + "..."
      );
      inserted++;
    }

    console.log(
      "\n\u2705 Ingest completato: " + inserted + " inseriti, " + skipped + " gi\u00e0 presenti.\n"
    );
  } catch (err) {
    console.error("\n\u274C Ingest fallito:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
