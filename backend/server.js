/* =========================
   CHAT (Routing C) + fallback + DB save (auto-create conversation)
========================= */
app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    const message = (req.body?.message || "").toString().trim();
    const hasImage = !!req.file?.buffer;

    if (!message && !hasImage) {
      return res.status(400).json({ error: "Serve 'message' oppure una 'image'." });
    }

    // history (opzionale)
    let history = [];
    if (req.body?.history) {
      try { history = JSON.parse(req.body.history); } catch {}
    }
    const normalizedHistory = normalizeHistory(history);

    // ✅ conversation_id (opzionale, per DB) + auto-create se assente
    const conversation_id_raw =
      req.body?.conversation_id ?? req.body?.conversationId ?? null;

    let conversation_id = toIntOrNull(conversation_id_raw);

    // Se non arriva, creo una nuova conversazione
    if (!conversation_id) {
      const user_id = req.body?.user_id ?? null;
      const title = req.body?.title ?? "Nuova chat";
      const rConv = await pool.query(
        "insert into conversations (user_id, title) values ($1,$2) returning id",
        [user_id, title]
      );
      conversation_id = rConv.rows[0].id;
    } else {
      // Se arriva, verifico che esista
      const c = await pool.query("select id from conversations where id = $1", [conversation_id]);
      if (c.rowCount === 0) {
        // se ID invalido, creo nuova conversazione invece di fallire
        const user_id = req.body?.user_id ?? null;
        const title = req.body?.title ?? "Nuova chat";
        const rConv = await pool.query(
          "insert into conversations (user_id, title) values ($1,$2) returning id",
          [user_id, title]
        );
        conversation_id = rConv.rows[0].id;
      }
    }

    // Contenuto utente per Claude (immagine + testo)
    const userContentClaude = [];
    if (hasImage) {
      userContentClaude.push({
        type: "image",
        source: {
          type: "base64",
          media_type: req.file.mimetype || "image/jpeg",
          data: req.file.buffer.toString("base64"),
        },
      });
    }
    userContentClaude.push({
      type: "text",
      text: message || "Analizza la foto e descrivi cosa vedi.",
    });

    // Routing C
    const primary = choosePrimaryProvider(message, hasImage);
    console.log("ROUTING_PRIMARY:", primary);

    let replyText = null;
    let providerUsed = null;

    async function callAnthropic() {
      if (!anthropic) throw new Error("Anthropic non configurato");
      console.log("MODEL_USED (Claude):", JSON.stringify(MODEL));

      const result = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [
          ...normalizedHistory,
          { role: "user", content: userContentClaude },
        ],
      });

      return extractReplyText(result) || "Nessuna risposta";
    }

    async function callOpenAI() {
      if (!openai) throw new Error("OpenAI non configurato");
      console.log("MODEL_USED (OpenAI):", JSON.stringify(OPENAI_MODEL));

      const oaMessages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...normalizedHistory.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message || "Rispondi con le informazioni disponibili." },
      ];

      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL || "gpt-4o-mini",
        messages: oaMessages,
        temperature: 0.2,
      });

      return completion?.choices?.[0]?.message?.content?.trim() || "Nessuna risposta";
    }

    // 1) PRIMARY
    try {
      if (primary === "openai") {
        replyText = await callOpenAI();
        providerUsed = "openai";
      } else {
        replyText = await callAnthropic();
        providerUsed = "anthropic";
      }
    } catch (primaryErr) {
      console.warn("⚠ Primary failed:", shortErr(primaryErr));
    }

    // 2) FALLBACK
    if (!replyText) {
      try {
        if (primary === "openai") {
          replyText = await callAnthropic();
          providerUsed = "anthropic";
        } else {
          replyText = await callOpenAI();
          providerUsed = "openai";
        }
      } catch (fallbackErr) {
        console.error("❌ Fallback failed:", shortErr(fallbackErr));
        return res.status(500).json({
          error: "Entrambi i provider falliscono",
          details: fallbackErr?.message || String(fallbackErr),
        });
      }
    }

    // ✅ Salvataggio DB: SEMPRE (ora conversation_id esiste sempre)
    await pool.query(
      `insert into messages (conversation_id, role, content, image_url)
       values ($1,$2,$3,$4)`,
      [conversation_id, "user", message || "(solo immagine)", null]
    );

    await pool.query(
      `insert into messages (conversation_id, role, content, image_url)
       values ($1,$2,$3,$4)`,
      [conversation_id, "assistant", replyText, null]
    );

    // ✅ RITORNA conversation_id al frontend (fondamentale)
    return res.json({
      reply: replyText,
      provider: providerUsed,
      primary,
      conversation_id, // <-- QUESTO SBLOCCA TUTTO
    });
  } catch (err) {
    console.error("❌ Errore /api/chat:", shortErr(err));
    return res.status(500).json({
      error: "Errore interno del server",
      details: err?.message || String(err),
    });
  }
});
