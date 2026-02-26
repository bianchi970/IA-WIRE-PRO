/**
 * IA Wire Pro — ingest_encyclopedia.js
 * Popola le tabelle components e issues dal file data/encyclopedia.json.
 * Idempotente: controlla duplicati prima di inserire.
 * Uso: node backend/ingest_encyclopedia.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fs = require("fs");
const { pool } = require("./db");

// ============================================================
// Setup tabelle (defensive — crea se non esistono)
// ============================================================
const CREATE_COMPONENTS = `
  CREATE TABLE IF NOT EXISTS components (
    id              BIGSERIAL PRIMARY KEY,
    category        TEXT,
    name            TEXT,
    type            TEXT,
    brand           TEXT,
    model           TEXT,
    technical_specs JSONB,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;

const CREATE_ISSUES = `
  CREATE TABLE IF NOT EXISTS issues (
    id               BIGSERIAL PRIMARY KEY,
    component_id     BIGINT NOT NULL REFERENCES components(id) ON DELETE CASCADE,
    title            TEXT,
    symptoms         JSONB,
    probable_causes  JSONB,
    tests            JSONB,
    fixes            JSONB,
    certainty_logic  TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
  )
`;

const CREATE_IDX_COMP_FTS = `
  CREATE INDEX IF NOT EXISTS idx_components_fts
    ON components
    USING gin(
      to_tsvector('italian',
        coalesce(category,'') || ' ' ||
        coalesce(name,'')     || ' ' ||
        coalesce(type,'')     || ' ' ||
        coalesce(brand,'')    || ' ' ||
        coalesce(model,'')
      )
    )
`;

const CREATE_IDX_ISSUES_COMP = `
  CREATE INDEX IF NOT EXISTS idx_issues_component_id
    ON issues (component_id)
`;

// ============================================================
// Runner
// ============================================================
(async () => {
  const dataPath = path.join(__dirname, "data", "encyclopedia.json");

  if (!fs.existsSync(dataPath)) {
    console.error("\u274C File non trovato: " + dataPath);
    process.exitCode = 1;
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  } catch (e) {
    console.error("\u274C Errore parsing JSON:", e.message);
    process.exitCode = 1;
    return;
  }

  const components = Array.isArray(data && data.components) ? data.components : [];
  if (!components.length) {
    console.warn("\u26A0\uFE0F  Nessun componente trovato nel JSON.");
    return;
  }

  const client = await pool.connect();
  try {
    console.log("\n\uD83D\uDD04 Ingest enciclopedia tecnica — IA Wire Pro\n");

    // Setup tabelle
    await client.query(CREATE_COMPONENTS);
    await client.query(CREATE_ISSUES);
    await client.query(CREATE_IDX_COMP_FTS);
    await client.query(CREATE_IDX_ISSUES_COMP);
    console.log("  \u2705 Tabelle e indici verificati.\n");

    let compInserted = 0;
    let compSkipped = 0;
    let issInserted = 0;
    let issSkipped = 0;

    for (const comp of components) {
      const name = String(comp.name || "").trim();
      const brand = String(comp.brand || "").trim();
      const model = String(comp.model || "").trim();

      if (!name) {
        console.warn("  \u26A0\uFE0F  Componente senza nome — saltato.");
        compSkipped++;
        continue;
      }

      // Cerca duplicato per (name, brand, model)
      const existing = await client.query(
        `SELECT id FROM components WHERE name = $1 AND brand = $2 AND model = $3 LIMIT 1`,
        [name, brand, model]
      );

      let componentId;

      if (existing.rowCount > 0) {
        componentId = existing.rows[0].id;
        console.log(
          "  \u23ED\uFE0F  Gi\u00e0 presente: [" + (comp.type || comp.category) + "] " + name +
          " (" + brand + " " + model + ")"
        );
        compSkipped++;
      } else {
        const ins = await client.query(
          `INSERT INTO components (category, name, type, brand, model, technical_specs)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [
            comp.category || null,
            name,
            comp.type || null,
            brand || null,
            model || null,
            comp.technical_specs != null ? JSON.stringify(comp.technical_specs) : null,
          ]
        );
        componentId = ins.rows[0].id;
        console.log(
          "  \u2705 Componente: [" + (comp.type || comp.category) + "] " + name +
          " (" + brand + " " + model + ") → id=" + componentId
        );
        compInserted++;
      }

      // Inserisce issues
      const issues = Array.isArray(comp.issues) ? comp.issues : [];
      for (const iss of issues) {
        const title = String(iss.title || "").trim();
        if (!title) continue;

        const issExisting = await client.query(
          `SELECT id FROM issues WHERE component_id = $1 AND title = $2 LIMIT 1`,
          [componentId, title]
        );

        if (issExisting.rowCount > 0) {
          console.log("    \u23ED\uFE0F  Issue gi\u00e0 presente: " + title);
          issSkipped++;
          continue;
        }

        await client.query(
          `INSERT INTO issues
             (component_id, title, symptoms, probable_causes, tests, fixes, certainty_logic)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            componentId,
            title,
            iss.symptoms != null ? JSON.stringify(iss.symptoms) : null,
            iss.probable_causes != null ? JSON.stringify(iss.probable_causes) : null,
            iss.tests != null ? JSON.stringify(iss.tests) : null,
            iss.fixes != null ? JSON.stringify(iss.fixes) : null,
            iss.certainty_logic || null,
          ]
        );
        console.log("    \u2705 Issue: " + title);
        issInserted++;
      }
    }

    console.log(
      "\n\u2705 Ingest completato:\n" +
      "   Componenti: " + compInserted + " inseriti, " + compSkipped + " gi\u00e0 presenti.\n" +
      "   Guasti:     " + issInserted + " inseriti, " + issSkipped + " gi\u00e0 presenti.\n"
    );
  } catch (err) {
    console.error("\n\u274C Ingest fallito:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
