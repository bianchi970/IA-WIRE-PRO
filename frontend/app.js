/* IA Wire Pro - app.js (V1 stable, ITA)
   - Composer stabile (ENTER senza requestSubmit)
   - Compressione immagini (1200px, JPEG 0.7)
   - Anteprima + rimuovi
   - Stati UI: Pronto / Analisi / Elaborazione / Errore
   - Bolle chat + autoscroll
   - Upload MULTIPART: /api/chat (message + image)
   - Persistenza conversazione: conversation_id (localStorage) + reload messaggi da DB
   - Fallback endpoints: same-origin + localhost:3000
*/

(() => {
  "use strict";

  // ====== DOM ======
  const chat = document.getElementById("chat");
  const chatForm = document.getElementById("chatForm");
  const textInput = document.getElementById("textInput");
  const sendBtn = document.getElementById("sendBtn");
  const statusPill = document.getElementById("statusPill");

  const imageInput = document.getElementById("imageInput");
  const previewWrap = document.getElementById("previewWrap");
  const previewImg = document.getElementById("previewImg");
  const removeImageBtn = document.getElementById("removeImageBtn");

  // ====== STATE ======
  let selectedBlob = null;
  let abortCtrl = null;

  // ✅ Persistenza conversation_id
  let conversationId = localStorage.getItem("conversation_id") || null;

  // ====== UTIL ======
  const setStatus = (label) => {
    if (!statusPill) return;
    statusPill.textContent = label;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  const addMessage = (role, text) => {
    if (!chat) return { wrapper: null, bubble: null };

    const wrapper = document.createElement("div");
    wrapper.className = `msg ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = escapeHtml(text);

    wrapper.appendChild(bubble);
    chat.appendChild(wrapper);

    chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
    return { wrapper, bubble };
  };

  const clearChatUi = () => {
    if (!chat) return;
    chat.innerHTML = "";
  };

  const addTyping = (label = "Sto lavorando...") => {
    const { bubble } = addMessage("ai", label);
    if (bubble) bubble.dataset.typing = "1";
    return bubble;
  };

  const removeTyping = () => {
    if (!chat) return;
    chat.querySelectorAll(".bubble[data-typing='1']").forEach((n) => {
      n.closest(".msg")?.remove();
    });
  };

  const autoResize = () => {
    if (!textInput) return;
    textInput.style.height = "auto";
    const max = 140;
    textInput.style.height = Math.min(textInput.scrollHeight, max) + "px";
  };

  const setBusy = (busy) => {
    if (sendBtn) sendBtn.disabled = !!busy;
    if (textInput) textInput.disabled = !!busy;
    if (imageInput) imageInput.disabled = !!busy;
  };

  // ====== IMAGE COMPRESSION ======
  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Errore FileReader"));
      r.readAsDataURL(file);
    });

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Errore caricamento immagine"));
      img.src = src;
    });

  const compressImageFile = async (file, opts = {}) => {
    const maxSize = opts.maxSize ?? 1200;
    const quality = opts.quality ?? 0.7;

    const dataUrl = await fileToDataUrl(file);
    const img = await loadImage(dataUrl);

    let { width, height } = img;

    if (width > height && width > maxSize) {
      height = Math.round(height * (maxSize / width));
      width = maxSize;
    } else if (height >= width && height > maxSize) {
      width = Math.round(width * (maxSize / height));
      height = maxSize;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    });

    if (!blob) throw new Error("Compressione fallita");
    return { blob, previewUrl: canvas.toDataURL("image/jpeg", 0.82) };
  };

  const clearImage = () => {
    selectedBlob = null;
    if (imageInput) imageInput.value = "";
    if (previewWrap) previewWrap.hidden = true;
    if (previewImg) previewImg.src = "";
  };

  // ====== API ENDPOINTS ======
  const isProdSameOrigin = () =>
    location.hostname !== "localhost" && location.hostname !== "127.0.0.1";

  const candidateChatEndpoints = () => {
    if (isProdSameOrigin()) return [`${location.origin}/api/chat`];
    return [`${location.origin}/api/chat`, `http://localhost:3000/api/chat`];
  };

  const candidateMessagesEndpoints = (convId) => {
    const path = `/api/conversations/${encodeURIComponent(convId)}/messages`;
    if (isProdSameOrigin()) return [`${location.origin}${path}`];
    return [`${location.origin}${path}`, `http://localhost:3000${path}`];
  };

  const postToChatApi = async (payload, imageBlob, signal) => {
    const formData = new FormData();
    formData.append("message", payload.text || "");
    if (payload.history) formData.append("history", JSON.stringify(payload.history));
    if (payload.mode) formData.append("mode", payload.mode);

    // ✅ conversation_id (persistenza)
    if (payload.conversation_id) formData.append("conversation_id", String(payload.conversation_id));

    if (imageBlob) formData.append("image", imageBlob, "photo.jpg"); // campo: "image"

    let lastErr = null;

    for (const url of candidateChatEndpoints()) {
      try {
        const res = await fetch(url, { method: "POST", body: formData, signal });
        const ct = res.headers.get("content-type") || "";

        if (!res.ok) {
          let details = "";
          try {
            details = ct.includes("application/json")
              ? JSON.stringify(await res.json())
              : await res.text();
          } catch (_) {}
          throw new Error(`HTTP ${res.status} ${details}`.trim());
        }

        const data = ct.includes("application/json")
          ? await res.json().catch(() => ({}))
          : { reply: await res.text().catch(() => "") };

        return { data, urlUsed: url };
      } catch (e) {
        lastErr = e;
      }
    }

    throw lastErr || new Error("Errore di rete");
  };

  const getConversationMessages = async (convId) => {
    let lastErr = null;
    for (const url of candidateMessagesEndpoints(convId)) {
      try {
        const res = await fetch(url, { method: "GET" });
        const ct = res.headers.get("content-type") || "";
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = ct.includes("application/json") ? await res.json() : [];
        return data;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Impossibile caricare messaggi");
  };

  const ensureStructuredAnswer = (text) => {
    const t = (text || "").trim();
    if (!t) return "Risposta vuota dal server.";

    const hasSections = /OSSERVAZIONE|ANALISI|VERIFICHE|CERTEZZA|POSSIBILI/i.test(t);
    if (hasSections) return t;

    return [
      "OSSERVAZIONE:",
      t,
      "",
      "LIVELLO DI CERTEZZA:",
      "Da verificare (risposta non strutturata).",
      "",
      "VERIFICHE CONSIGLIATE:",
      "1) Aggiungi una foto più ravvicinata e nitida.",
      "2) Scrivi marca/modello e cosa hai già provato.",
    ].join("\n");
  };

  // ✅ Render messaggi ricaricati dal DB (formati diversi gestiti)
  const renderLoadedMessages = (raw) => {
    const arr =
      Array.isArray(raw) ? raw :
      Array.isArray(raw?.messages) ? raw.messages :
      Array.isArray(raw?.rows) ? raw.rows :
      [];

    if (!arr.length) return;

    clearChatUi();

    for (const m of arr) {
      const role = (m.role || m.sender || m.type || "").toLowerCase();
      const content =
        m.content ?? m.text ?? m.message ?? m.body ?? "";

      if (role.includes("assistant") || role === "ai") addMessage("ai", ensureStructuredAnswer(String(content)));
      else addMessage("user", String(content));
    }
  };

  // ✅ Load conversazione al refresh
  const loadConversationOnStart = async () => {
    if (!conversationId) return;
    try {
      setStatus("Carico chat...");
      const data = await getConversationMessages(conversationId);
      renderLoadedMessages(data);
      setStatus("Pronto");
    } catch (e) {
      // Se la conversazione non esiste più o ID invalido, riparti pulito
      console.warn("Load conversation failed:", e?.message || e);
      // Non cancelliamo subito l'ID: lo cancelliamo solo se proprio non esiste/404
      setStatus("Pronto");
    }
  };

  // ====== EVENTS ======
  if (textInput) {
    textInput.addEventListener("input", autoResize);

    // ENTER invia (senza requestSubmit) | SHIFT+ENTER va a capo
    textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendBtn?.click();
      }
    });

    autoResize();
  }

  if (imageInput) {
    imageInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setStatus("Analisi immagine...");
      setBusy(true);

      try {
        const { blob, previewUrl } = await compressImageFile(file, { maxSize: 1200, quality: 0.7 });
        selectedBlob = blob;

        if (previewImg) previewImg.src = previewUrl;
        if (previewWrap) previewWrap.hidden = false;

        setStatus("Pronto");
      } catch (err) {
        console.error(err);
        clearImage();
        setStatus("Errore");
        addMessage("ai", "Non riesco a leggere/comprimere la foto. Prova con un’altra immagine.");
        await sleep(650);
        setStatus("Pronto");
      } finally {
        setBusy(false);
      }
    });
  }

  if (removeImageBtn) {
    removeImageBtn.addEventListener("click", () => {
      clearImage();
      setStatus("Pronto");
    });
  }

  if (chatForm) {
    // blocca submit classico
    chatForm.addEventListener("submit", (e) => e.preventDefault());

    // invio con bottone (gestione centralizzata)
    sendBtn?.addEventListener("click", async () => {
      const text = (textInput?.value || "").trim();
      if (!text && !selectedBlob) return;

      // Mostra subito il messaggio utente
      if (text) addMessage("user", text);

      // Salva testo in caso di errore (così non “sparisce”)
      const pendingText = text;

      setBusy(true);
      setStatus(selectedBlob ? "Analisi..." : "Elaborazione...");

      removeTyping();
      addTyping(selectedBlob ? "Sto analizzando la foto..." : "Sto rispondendo...");

      if (abortCtrl) abortCtrl.abort();
      abortCtrl = new AbortController();

      try {
        const { data } = await postToChatApi(
          { text, history: [], conversation_id: conversationId },
          selectedBlob,
          abortCtrl.signal
        );

        // ✅ Aggancia e salva conversation_id dal backend (nomi diversi gestiti)
        const newConvId = data?.conversation_id ?? data?.conversationId ?? data?.id ?? null;
        if (newConvId) {
          conversationId = String(newConvId);
          localStorage.setItem("conversation_id", conversationId);
        }

        removeTyping();
        addMessage("ai", ensureStructuredAnswer(data.answer || data.reply || ""));


        // ✅ svuota input SOLO a invio riuscito
        if (textInput) {
          textInput.value = "";
          autoResize();
        }

        clearImage();
        setStatus("Pronto");
      } catch (err) {
        console.error(err);
        removeTyping();

        const msg = String(err?.message || err || "Errore");

        // ✅ ripristina testo se errore
        if (textInput && pendingText) {
          textInput.value = pendingText;
          autoResize();
        }

        if (msg.includes("HTTP 413")) addMessage("ai", "Foto troppo grande. Riducila e riprova (obiettivo < 4-5MB).");
        else if (msg.includes("HTTP 400")) addMessage("ai", "Richiesta non valida. Controlla che il campo 'message' venga inviato correttamente.");
        else addMessage("ai", "Errore: " + msg);

        setStatus("Errore");
        await sleep(750);
        setStatus("Pronto");
      } finally {
        setBusy(false);
      }
    });
  }

  setStatus("Pronto");

  // ✅ al caricamento pagina: prova a ricaricare la conversazione
  loadConversationOnStart();
})();
