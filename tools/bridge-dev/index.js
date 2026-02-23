require("dotenv").config();
const OpenAI = require("openai");
const glob = require("fast-glob");
const path = require("path");

const openai = new OpenAI({
  apiKey: (process.env.OPENAI_API_KEY || "").trim(),
});

async function scanProject() {
  console.log("🔎 Scansione progetto...\n");

  const files = await glob(["../../**/*.js"], {
    ignore: ["**/node_modules/**"],
  });

  files.forEach((file) => {
    console.log(" -", file);
  });

  console.log("\n✅ Scan completato.");
}

async function main() {
  console.log("🧠 ROCCO (Bridge Dev) AVVIATO\n");

  if (!process.env.OPENAI_API_KEY) {
    console.log("❌ OPENAI_API_KEY mancante nel .env");
    return;
  }

  await scanProject();
}

main();