/**
 * IA Wire Pro — ingest_pdf.js
 * Legge un PDF da file system, lo divide in chunk e lo inserisce in doc_chunks (idempotente).
 *
 * Uso:
 *   node backend/ingest_pdf.js path/to/manuale.pdf
 *   node backend/ingest_pdf.js path/to/manuale.pdf --source "nome_sorgente"
 */

const path = require("path");
const fs   = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { pool } = require("./db");

const CHUNK_MAX = 500;    // caratteri max per chunk
const CHUNK_MIN = 80;     // chunk più corti vengono accorpati al successivo

/**
 * Divide un testo grezzo in chunk di testo sensati.
 * Split su paragrafi (\n\n), poi tronca se troppo lunghi.
 */
function chunkText(text, source) {
  const paras = text.split(/\n{2,}/);
  const chunks = [];
  let carry = "";

  for (const para of paras) {
    const p = para.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();
    if (!p) continue;

    const combined = carry ? carry + " " + p : p;

    if (combined.length < CHUNK_MIN) {
      carry = combined;
      continue;
    }

    carry = "";

    if (combined.length <= CHUNK_MAX) {
      chunks.push({ source, chunk_text: combined });
    } else {
      // Tronca in sotto-chunk
      for (let i = 0; i < combined.length; i += CHUNK_MAX) {
        const slice = combined.slice(i, i + CHUNK_MAX).trim();
        if (slice.length >= CHUNK_MIN) chunks.push({ source, chunk_text: slice });
      }
    }
  }

  if (carry.length >= CHUNK_MIN) chunks.push({ source, chunk_text: carry });
  return chunks;
}

async function ingestPdf(filePath, sourceName) {
  if (!fs.existsSync(filePath)) {
    console.error("❌ File non trovato:", filePath);
    process.exitCode = 1;
    return;
  }

  let pdfParse;
  try {
    pdfParse = require("pdf-parse");
  } catch (e) {
    console.error("❌ pdf-parse non installato. Esegui: cd backend && npm install");
    process.exitCode = 1;
    return;
  }

  console.log("📄 Lettura PDF:", filePath);
  const buffer = fs.readFileSync(filePath);
  const data   = await pdfParse(buffer);
  console.log("   Pagine:", data.numpages, "— caratteri estratti:", data.text.length);

  const chunks = chunkText(data.text, sourceName || path.basename(filePath));
  console.log("   Chunk generati:", chunks.length);

  if (!pool) {
    console.error("❌ DB non disponibile. Configura DATABASE_URL in .env");
    process.exitCode = 1;
    return;
  }

  const client = await pool.connect();
  let inserted = 0;
  let skipped  = 0;

  try {
    for (const chunk of chunks) {
      const existing = await client.query(
        "SELECT id FROM doc_chunks WHERE source = $1 AND chunk_text = $2 LIMIT 1",
        [chunk.source, chunk.chunk_text]
      );
      if (existing.rowCount > 0) {
        skipped++;
        continue;
      }
      await client.query(
        "INSERT INTO doc_chunks (source, chunk_text) VALUES ($1, $2)",
        [chunk.source, chunk.chunk_text]
      );
      inserted++;
    }
    console.log("\n✅ Completato: " + inserted + " inseriti, " + skipped + " già presenti.");
  } finally {
    client.release();
    await pool.end();
  }
}

// CLI
(async () => {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => !a.startsWith("--"));
  const sourceIdx = args.indexOf("--source");
  const sourceArg = sourceIdx !== -1 ? args[sourceIdx + 1] : null;

  if (!fileArg) {
    console.log("Uso: node backend/ingest_pdf.js <file.pdf> [--source <nome>]");
    process.exitCode = 1;
    return;
  }

  await ingestPdf(path.resolve(fileArg), sourceArg);
})();

module.exports = { chunkText };
